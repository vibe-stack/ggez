import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { ViteDevServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import type { OrchestratorService } from "./orchestrator-service";

type CodexSession = {
  agentText: string;
  pendingRequests: Map<number, { reject: (error: Error) => void; resolve: (value: unknown) => void }>;
  pendingToolCalls: Map<number, { resolve: (value: unknown) => void }>;
  process: ChildProcess;
  readline: ReadlineInterface;
  requestId: number;
  threadId?: string;
  ws: WebSocket;
};

type CodexStartMessage = {
  model: string;
  projectId: string;
  systemPrompt: string;
  threadId?: string;
  tools: Array<{ description: string; inputSchema: Record<string, unknown>; name: string }>;
  userMessage: string;
};

const ORCHESTRATOR_CODEX_WS_PATH = "/ws/orchestrator-codex";
const SCREENSHOT_RELATIVE_PATH = ".web-hammer/codex/current-game-view.jpg";

export function checkCodexAvailability(): { available: boolean; error?: string; version?: string } {
  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.local/bin`];
  const envPath = `${process.env.PATH}:${extraPaths.join(":")}`;

  try {
    const version = execSync("codex --version", {
      encoding: "utf-8",
      env: { ...process.env, PATH: envPath },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000
    }).trim();
    return { available: true, version };
  } catch {
    return { available: false, error: "Codex CLI not found. Install with: npm install -g @openai/codex" };
  }
}

export function registerOrchestratorCodexWebSocket(server: ViteDevServer, service: OrchestratorService) {
  if (!server.httpServer) {
    return;
  }

  const wss = new WebSocketServer({ noServer: true });

  server.httpServer.on("upgrade", (request, socket, head) => {
    if (request.url === ORCHESTRATOR_CODEX_WS_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws) => {
    let session: CodexSession | null = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as { type: string; [key: string]: unknown };
        void handleClientMessage(ws, message, session, service, (nextSession) => {
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

export async function saveProjectScreenshot(
  service: OrchestratorService,
  input: { dataUrl: string; projectId: string }
) {
  const project = await service.getProjectCodexContext(input.projectId);
  const match = /^data:(.+?);base64,(.+)$/.exec(input.dataUrl);

  if (!match) {
    throw new Error("Invalid screenshot payload.");
  }

  const [, mimeType, base64] = match;

  if (mimeType !== "image/jpeg" && mimeType !== "image/jpg") {
    throw new Error(`Unsupported screenshot type ${mimeType}.`);
  }

  const absolutePath = join(project.projectRoot, SCREENSHOT_RELATIVE_PATH);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(base64, "base64"));

  return {
    absolutePath,
    relativePath: SCREENSHOT_RELATIVE_PATH
  };
}

async function handleClientMessage(
  ws: WebSocket,
  msg: { type: string; [key: string]: unknown },
  session: CodexSession | null,
  service: OrchestratorService,
  setSession: (session: CodexSession | null) => void
) {
  switch (msg.type) {
    case "start": {
      if (session) {
        cleanupSession(session);
      }

      try {
        const nextSession = await startCodexSession(ws, service, msg as { type: "start" } & CodexStartMessage);
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

      const { id, result, success } = msg as { id: string; result: string; success: boolean; type: "tool_result" };
      const rpcId = parseInt(id, 10);
      const pending = session.pendingToolCalls.get(rpcId);

      if (!pending) {
        return;
      }

      session.pendingToolCalls.delete(rpcId);
      sendToCodex(session, {
        id: rpcId,
        result: formatToolResultPayload(result, success)
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
  service: OrchestratorService,
  config: CodexStartMessage
): Promise<CodexSession> {
  const project = await service.getProjectCodexContext(config.projectId);
  sendToClient(ws, { type: "status", status: "connecting" });

  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.local/bin`];
  const envPath = `${process.env.PATH}:${extraPaths.join(":")}`;
  const processHandle = spawn("codex", ["app-server"], {
    cwd: project.projectRoot,
    env: { ...process.env, PATH: envPath },
    stdio: ["pipe", "pipe", "inherit"]
  });
  const readline = createInterface({ input: processHandle.stdout! });

  const session: CodexSession = {
    agentText: "",
    pendingRequests: new Map(),
    pendingToolCalls: new Map(),
    process: processHandle,
    readline,
    requestId: 0,
    ws
  };

  readline.on("line", (line) => {
    try {
      handleCodexMessage(session, JSON.parse(line) as { error?: unknown; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown });
    } catch {
      // Ignore non-JSON process output.
    }
  });

  processHandle.on("exit", (code) => {
    if (ws.readyState !== ws.OPEN) {
      return;
    }

    sendToClient(ws, {
      type: "error",
      message: `Codex process exited with code ${code}`,
      fatal: true
    });
  });

  await sendCodexRequest(session, "initialize", {
    capabilities: { experimentalApi: true },
    clientInfo: { name: "web-hammer-orchestrator", title: "Web Hammer Orchestrator", version: "0.1.0" }
  });
  sendToCodex(session, { method: "initialized", params: {} });

  const threadResult = await sendCodexRequest(
    session,
    config.threadId ? "thread/resume" : "thread/start",
    {
      ...(config.threadId ? { threadId: config.threadId } : {}),
      baseInstructions: config.systemPrompt,
      dynamicTools: config.tools.map((tool) => ({
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name
      })),
      model: config.model,
      serviceName: `orchestrator-game:${slugify(project.name) || "game"}`
    }
  ) as { thread?: { id?: string } };

  session.threadId = threadResult?.thread?.id;

  if (session.threadId) {
    sendToClient(ws, { type: "thread", threadId: session.threadId });
  }

  sendToClient(ws, { type: "status", status: "thinking" });
  sendToCodex(session, {
    id: ++session.requestId,
    method: "turn/start",
    params: {
      input: [{ text: config.userMessage, type: "text" }],
      threadId: session.threadId
    }
  });

  return session;
}

function handleCodexMessage(
  session: CodexSession,
  msg: { error?: unknown; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown }
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
    const params = msg.params as { arguments?: Record<string, unknown>; tool?: string } | undefined;
    sendToClient(session.ws, {
      type: "tool_call",
      id: String(msg.id),
      name: params?.tool ?? "unknown_tool",
      args: params?.arguments ?? {}
    });
    sendToClient(session.ws, { type: "status", status: "executing" });
    session.pendingToolCalls.set(msg.id, { resolve: () => {} });
    return;
  }

  if (
    msg.id !== undefined &&
    (msg.method === "item/commandExecution/requestApproval" || msg.method === "item/fileChange/requestApproval")
  ) {
    sendToCodex(session, { id: msg.id, result: { decision: "accept" } });
    return;
  }

  if (!msg.method) {
    return;
  }

  const params = msg.params as Record<string, unknown> | undefined;

  switch (msg.method) {
    case "item/agentMessage/delta": {
      const delta = (params as { delta?: string } | undefined)?.delta;

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
      const item = params?.item as { id?: string; status?: string; tool?: string; type?: string } | undefined;

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

function formatToolResultPayload(result: string, success: boolean) {
  const parsed = tryParseJson(result);

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { contentItems?: unknown[] }).contentItems)) {
    const contentItems = (parsed as { contentItems: unknown[] }).contentItems;
    const parsedSuccess = (parsed as { success?: boolean }).success;

    return {
      contentItems,
      success: typeof parsedSuccess === "boolean" ? parsedSuccess : success
    };
  }

  return {
    contentItems: [{ type: "inputText", text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }],
    success
  };
}

function sendToCodex(session: CodexSession, msg: Record<string, unknown>) {
  if (session.process.stdin?.writable) {
    session.process.stdin.write(`${JSON.stringify(msg)}\n`);
  }
}

function sendCodexRequest(session: CodexSession, method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = ++session.requestId;

  return new Promise((resolve, reject) => {
    session.pendingRequests.set(id, { reject, resolve });
    sendToCodex(session, { id, method, params });

    setTimeout(() => {
      if (!session.pendingRequests.has(id)) {
        return;
      }

      session.pendingRequests.delete(id);
      reject(new Error(`Codex request ${method} timed out`));
    }, 30_000);
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
    }, 5_000);
  }

  session.pendingRequests.forEach(({ reject }) => reject(new Error("Session closed")));
  session.pendingRequests.clear();
  session.pendingToolCalls.clear();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}