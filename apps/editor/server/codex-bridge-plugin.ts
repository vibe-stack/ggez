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
    name: "codex-bridge",
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

// ── HTTP status endpoint ──────────────────────────────────────

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
  // Ensure common binary paths are included (Homebrew, nvm, etc.)
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

// ── WebSocket bridge ──────────────────────────────────────────

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
        handleClientMessage(ws, msg, session, (s) => { session = s; });
      } catch (error) {
        sendToClient(ws, { type: "error", message: "Invalid message format", fatal: false });
      }
    });

    ws.on("close", () => {
      if (session) {
        cleanupSession(session);
        session = null;
      }
    });
  });
}

async function handleClientMessage(
  ws: WebSocket,
  msg: { type: string; [key: string]: unknown },
  session: CodexSession | null,
  setSession: (s: CodexSession | null) => void
) {
  switch (msg.type) {
    case "start": {
      if (session) {
        cleanupSession(session);
      }

      try {
        const newSession = await startCodexSession(ws, msg as {
          type: "start";
          model: string;
          systemPrompt: string;
          threadId?: string;
          tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
          userMessage: string;
        });
        setSession(newSession);
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
      if (!session) return;
      const { id, result, success } = msg as { type: "tool_result"; id: string; result: string; success: boolean };
      const rpcId = parseInt(id, 10);
      const pending = session.pendingToolCalls.get(rpcId);

      if (pending) {
        session.pendingToolCalls.delete(rpcId);
        // Send JSON-RPC response back to codex
        const parsed = tryParseJson(result);
        sendToCodex(session, {
          id: rpcId,
          result: {
            contentItems: [{ type: "inputText", text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }],
            success
          }
        });
        pending.resolve(null);
      }
      break;
    }

    case "abort": {
      if (session) {
        cleanupSession(session);
        setSession(null);
      }
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

  // Spawn codex app-server — extend PATH to find Homebrew/nvm binaries
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

  // Set up stdio message handling
  readline.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      handleCodexMessage(session, msg);
    } catch {
      // Ignore non-JSON lines (e.g. log output)
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

  // 1. Handshake
  await sendCodexRequest(session, "initialize", {
    clientInfo: { name: "trident-editor", title: "Trident Editor", version: "0.1.0" },
    capabilities: { experimentalApi: true }
  });
  sendToCodex(session, { method: "initialized", params: {} });

  // 2. Start thread with dynamic tools
  const dynamicTools = config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));

  const threadResult = await sendCodexRequest(
    session,
    config.threadId ? "thread/resume" : "thread/start",
    {
      ...(config.threadId ? { threadId: config.threadId } : {}),
      model: config.model,
      baseInstructions: config.systemPrompt,
      dynamicTools,
      serviceName: "trident-editor"
    }
  ) as { thread?: { id?: string } };

  session.threadId = threadResult?.thread?.id;

  if (session.threadId) {
    sendToClient(ws, { type: "thread", threadId: session.threadId });
  }

  sendToClient(ws, { type: "status", status: "thinking" });

  // 3. Start turn with user message
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

function handleCodexMessage(session: CodexSession, msg: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }) {
  // Handle responses to our requests
  if (msg.id !== undefined && !msg.method) {
    const pending = session.pendingRequests.get(msg.id);
    if (pending) {
      session.pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(JSON.stringify(msg.error)));
      } else {
        pending.resolve(msg.result);
      }
    }
    return;
  }

  // Handle server-to-client requests (need response)
  if (msg.id !== undefined && msg.method === "item/tool/call") {
    const params = msg.params as { callId: string; tool: string; arguments: Record<string, unknown> };
    sendToClient(session.ws, {
      type: "tool_call",
      id: String(msg.id),
      name: params.tool,
      args: params.arguments ?? {}
    });
    sendToClient(session.ws, { type: "status", status: "executing" });

    // Store pending tool call — will be resolved when browser sends tool_result
    session.pendingToolCalls.set(msg.id, { resolve: () => {} });
    return;
  }

  // Handle approval requests — auto-approve for now
  if (msg.id !== undefined && (msg.method === "item/commandExecution/requestApproval" || msg.method === "item/fileChange/requestApproval")) {
    sendToCodex(session, { id: msg.id, result: { decision: "accept" } });
    return;
  }

  // Handle notifications
  if (!msg.method) return;

  const params = msg.params as Record<string, unknown> | undefined;

  switch (msg.method) {
    case "item/agentMessage/delta": {
      const delta = (params as { delta?: string })?.delta;
      if (delta) {
        session.agentText += delta;
        sendToClient(session.ws, { type: "delta", text: delta });
      }
      break;
    }

    case "item/started": {
      const item = params?.item as { type?: string; tool?: string; id?: string } | undefined;
      if (item?.type === "dynamicToolCall") {
        sendToClient(session.ws, { type: "status", status: "executing" });
      }
      break;
    }

    case "item/completed": {
      const item = params?.item as { type?: string; tool?: string; id?: string; status?: string } | undefined;
      if (item?.type === "dynamicToolCall" && item.tool) {
        sendToClient(session.ws, {
          type: "tool_status",
          id: item.id ?? "",
          name: item.tool,
          status: item.status === "completed" ? "completed" : "failed"
        });
        sendToClient(session.ws, { type: "status", status: "thinking" });
      }
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

// ── Helpers ───────────────────────────────────────────────────

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

    // Timeout after 30 seconds
    setTimeout(() => {
      if (session.pendingRequests.has(id)) {
        session.pendingRequests.delete(id);
        reject(new Error(`Codex request ${method} timed out`));
      }
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
