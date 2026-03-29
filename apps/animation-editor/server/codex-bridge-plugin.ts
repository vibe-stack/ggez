import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";

type CodexSession = {
  process: ChildProcess;
  readline: ReadlineInterface;
  ws: WebSocket;
  requestId: number;
  pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
  pendingToolCalls: Map<number, { resolve: (value: unknown) => void }>;
  threadId?: string;
  agentText: string;
};

export function createCodexBridgePlugin(): Plugin {
  return {
    name: "animation-editor-codex-bridge",
    configureServer(server) {
      registerCodexStatusApi(server);
      registerCodexWebSocket(server);
    },
    configurePreviewServer(server) {
      registerCodexStatusApi(server);
      registerCodexWebSocket(server);
    }
  };
}

function registerCodexStatusApi(server: Pick<ViteDevServer, "middlewares"> | Pick<PreviewServer, "middlewares">) {
  server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split("?")[0] !== "/api/codex/status") {
      next();
      return;
    }

    const result = checkCodexAvailability();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });
}

function checkCodexAvailability(): { available: boolean; version?: string; error?: string } {
  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.local/bin`];
  const envPath = `${process.env.PATH}:${extraPaths.join(":")}`;

  try {
    const version = execSync("codex --version", {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, PATH: envPath },
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return { available: true, version };
  } catch {
    return { available: false, error: "Codex CLI not found. Install with: npm install -g @openai/codex" };
  }
}

function registerCodexWebSocket(server: Pick<ViteDevServer, "httpServer"> | Pick<PreviewServer, "httpServer">) {
  if (!server.httpServer) return;

  const httpServer = server.httpServer;

  if ((httpServer as { __ggezCodexBridgeRegistered?: boolean }).__ggezCodexBridgeRegistered) {
    return;
  }

  (httpServer as { __ggezCodexBridgeRegistered?: boolean }).__ggezCodexBridgeRegistered = true;

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url === "/ws/codex") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws) => {
    let session: CodexSession | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, msg, session, (nextSession) => {
          session = nextSession;
        });
      } catch {
        sendToClient(ws, { type: "error", message: "Invalid message format", fatal: false });
      }
    });

    ws.on("close", () => {
      if (!session) {
        return;
      }

      cleanupSession(session);
      session = null;
    });
  });
}

async function handleClientMessage(
  ws: WebSocket,
  msg: { type: string; [key: string]: unknown },
  session: CodexSession | null,
  setSession: (session: CodexSession | null) => void
) {
  switch (msg.type) {
    case "start": {
      if (session) {
        cleanupSession(session);
      }

      try {
        const nextSession = await startCodexSession(ws, msg as {
          type: "start";
          model: string;
          systemPrompt: string;
          threadId?: string;
          tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
          userMessage: string;
        });
        setSession(nextSession);
      } catch (error) {
        sendToClient(ws, {
          type: "error",
          message: error instanceof Error ? error.message : "Failed to start Codex session",
          fatal: true
        });
      }
      break;
    }

    case "tool_result": {
      if (!session) {
        return;
      }

      const { id, result, success } = msg as { type: "tool_result"; id: string; result: string; success: boolean };
      const rpcId = parseInt(id, 10);
      const pending = session.pendingToolCalls.get(rpcId);
      if (!pending) {
        return;
      }

      session.pendingToolCalls.delete(rpcId);
      const parsed = tryParseJson(result);
      sendToCodex(session, {
        id: rpcId,
        result: {
          contentItems: [{ type: "inputText", text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }],
          success
        }
      });
      pending.resolve(null);
      break;
    }

    case "abort": {
      if (!session) {
        return;
      }

      cleanupSession(session);
      setSession(null);
      break;
    }
  }
}

async function startCodexSession(
  ws: WebSocket,
  config: {
    model: string;
    systemPrompt: string;
    threadId?: string;
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    userMessage: string;
  }
): Promise<CodexSession> {
  sendToClient(ws, { type: "status", status: "connecting" });

  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.local/bin`];
  const envPath = `${process.env.PATH}:${extraPaths.join(":")}`;

  const proc = spawn("codex", ["app-server"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, PATH: envPath }
  });

  const readline = createInterface({ input: proc.stdout! });

  const session: CodexSession = {
    process: proc,
    readline,
    ws,
    requestId: 0,
    pendingRequests: new Map(),
    pendingToolCalls: new Map(),
    agentText: ""
  };

  readline.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      handleCodexMessage(session, msg);
    } catch {
      // Ignore non-JSON lines.
    }
  });

  proc.on("exit", (code) => {
    if (ws.readyState === ws.OPEN) {
      sendToClient(ws, {
        type: "error",
        message: `Codex process exited with code ${code}`,
        fatal: true
      });
    }
  });

  await sendCodexRequest(session, "initialize", {
    clientInfo: { name: "animation-editor", title: "Animation Editor", version: "0.1.0" },
    capabilities: { experimentalApi: true }
  });
  sendToCodex(session, { method: "initialized", params: {} });

  const threadResult = await sendCodexRequest(session, config.threadId ? "thread/resume" : "thread/start", {
    ...(config.threadId ? { threadId: config.threadId } : {}),
    model: config.model,
    baseInstructions: config.systemPrompt,
    dynamicTools: config.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    })),
    serviceName: "animation-editor"
  }) as { thread?: { id?: string } };

  session.threadId = threadResult?.thread?.id;
  if (session.threadId) {
    sendToClient(ws, { type: "thread", threadId: session.threadId });
  }

  sendToClient(ws, { type: "status", status: "thinking" });

  sendToCodex(session, {
    method: "turn/start",
    id: ++session.requestId,
    params: {
      threadId: session.threadId,
      input: [{ type: "text", text: config.userMessage }]
    }
  });

  return session;
}

function handleCodexMessage(
  session: CodexSession,
  msg: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }
) {
  if (msg.id !== undefined && !msg.method) {
    const pending = session.pendingRequests.get(msg.id);
    if (!pending) {
      return;
    }

    session.pendingRequests.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(JSON.stringify(msg.error)));
    } else {
      pending.resolve(msg.result);
    }
    return;
  }

  if (msg.id !== undefined && msg.method === "item/tool/call") {
    const params = msg.params as { tool: string; arguments: Record<string, unknown> };
    sendToClient(session.ws, {
      type: "tool_call",
      id: String(msg.id),
      name: params.tool,
      args: params.arguments ?? {}
    });
    sendToClient(session.ws, { type: "status", status: "executing" });
    session.pendingToolCalls.set(msg.id, { resolve: () => {} });
    return;
  }

  if (msg.id !== undefined && (msg.method === "item/commandExecution/requestApproval" || msg.method === "item/fileChange/requestApproval")) {
    sendToCodex(session, { id: msg.id, result: { decision: "accept" } });
    return;
  }

  if (!msg.method) {
    return;
  }

  const params = msg.params as Record<string, unknown> | undefined;

  switch (msg.method) {
    case "item/agentMessage/delta": {
      const delta = (params as { delta?: string })?.delta;
      if (!delta) {
        return;
      }

      session.agentText += delta;
      sendToClient(session.ws, { type: "delta", text: delta });
      break;
    }

    case "item/started": {
      const item = params?.item as { type?: string } | undefined;
      if (item?.type === "dynamicToolCall") {
        sendToClient(session.ws, { type: "status", status: "executing" });
      }
      break;
    }

    case "item/completed": {
      const item = params?.item as { type?: string; tool?: string; id?: string; status?: string } | undefined;
      if (item?.type !== "dynamicToolCall" || !item.tool) {
        return;
      }

      sendToClient(session.ws, {
        type: "tool_status",
        id: item.id ?? "",
        name: item.tool,
        status: item.status === "completed" ? "completed" : "failed"
      });
      sendToClient(session.ws, { type: "status", status: "thinking" });
      break;
    }

    case "turn/completed": {
      sendToClient(session.ws, {
        type: "turn_complete",
        text: session.agentText
      });
      cleanupSession(session);
      break;
    }

    case "turn/failed": {
      const turn = params?.turn as { error?: { message?: string } } | undefined;
      sendToClient(session.ws, {
        type: "error",
        message: turn?.error?.message ?? "Turn failed",
        fatal: true
      });
      cleanupSession(session);
      break;
    }
  }
}

function sendToCodex(session: CodexSession, msg: Record<string, unknown>) {
  if (session.process.stdin?.writable) {
    session.process.stdin.write(JSON.stringify(msg) + "\n");
  }
}

function sendCodexRequest(session: CodexSession, method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = ++session.requestId;
  return new Promise((resolve, reject) => {
    session.pendingRequests.set(id, { resolve, reject });
    sendToCodex(session, { method, id, params });

    setTimeout(() => {
      if (!session.pendingRequests.has(id)) {
        return;
      }

      session.pendingRequests.delete(id);
      reject(new Error(`Codex request ${method} timed out`));
    }, 30000);
  });
}

function sendToClient(ws: WebSocket, msg: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function cleanupSession(session: CodexSession) {
  session.readline.close();
  if (!session.process.killed) {
    session.process.kill("SIGTERM");
    setTimeout(() => {
      if (!session.process.killed) {
        session.process.kill("SIGKILL");
      }
    }, 5000);
  }

  session.pendingRequests.forEach(({ reject }) => reject(new Error("Session closed")));
  session.pendingRequests.clear();
  session.pendingToolCalls.clear();
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}