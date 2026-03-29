import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import {
  checkCodexAvailability,
  registerOrchestratorCodexWebSocket,
  saveProjectScreenshot
} from "./codex-bridge";
import { OrchestratorService, type ViewId } from "./orchestrator-service";

type MiddlewareHost = Pick<ViteDevServer, "middlewares"> | Pick<PreviewServer, "middlewares">;

const services = new Map<string, OrchestratorService>();

export function createOrchestratorPlugin(options: { repoRoot: string }): Plugin {
  const service = getService(options.repoRoot);

  return {
    name: "web-hammer-orchestrator",
    configureServer(server) {
      registerApi(server, service);
      registerOrchestratorCodexWebSocket(server, service);
      void service.initialize();
    },
    configurePreviewServer(server) {
      registerApi(server, service);
      void service.initialize();
    }
  };
}

function getService(repoRoot: string) {
  const existing = services.get(repoRoot);

  if (existing) {
    return existing;
  }

  const next = new OrchestratorService(repoRoot);
  services.set(repoRoot, next);
  return next;
}

function registerApi(server: MiddlewareHost, service: OrchestratorService) {
  server.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split("?")[0];

    if (!pathname?.startsWith("/api/orchestrator")) {
      next();
      return;
    }

    try {
      if (req.method === "GET" && pathname === "/api/orchestrator/state") {
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "GET" && pathname === "/api/orchestrator/codex/status") {
        return sendJson(res, 200, checkCodexAvailability());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/add") {
        const body = await readJsonBody<{ projectRoot?: string }>(req);
        await service.addProject({ projectRoot: body.projectRoot ?? "" });
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/create") {
        const body = await readJsonBody<{
          destinationRoot?: string;
          force?: boolean;
          initializeGit?: boolean;
          installDependencies?: boolean;
          packageManager?: "bun" | "npm" | "pnpm" | "yarn";
          projectName?: string;
        }>(req);
        await service.createProject({
          destinationRoot: body.destinationRoot ?? "",
          force: Boolean(body.force),
          initializeGit: Boolean(body.initializeGit),
          installDependencies: body.installDependencies ?? true,
          packageManager: body.packageManager ?? "bun",
          projectName: body.projectName ?? ""
        });
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/remove") {
        const body = await readJsonBody<{ projectId?: string }>(req);
        await service.removeProject(body.projectId ?? "");
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/select") {
        const body = await readJsonBody<{ projectId?: string }>(req);
        await service.selectProject(body.projectId ?? "");
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/start") {
        const body = await readJsonBody<{ projectId?: string }>(req);
        await service.startGame(body.projectId ?? "");
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/stop") {
        const body = await readJsonBody<{ projectId?: string }>(req);
        await service.stopGame(body.projectId ?? "");
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/projects/switch-scene") {
        const body = await readJsonBody<{ projectId?: string; sceneId?: string }>(req);
        await service.switchGameScene(body.projectId ?? "", body.sceneId ?? "");
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/view") {
        const body = await readJsonBody<{ view?: ViewId }>(req);
        await service.setActiveView(body.view ?? "trident");
        return sendJson(res, 200, await service.getSnapshot());
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/codex/screenshot") {
        const body = await readJsonBody<{ dataUrl?: string; projectId?: string }>(req);

        if (!body.projectId || !body.dataUrl) {
          throw new Error("Missing screenshot payload.");
        }

        return sendJson(res, 200, await saveProjectScreenshot(service, {
          dataUrl: body.dataUrl,
          projectId: body.projectId
        }));
      }

      if (req.method === "POST" && pathname === "/api/orchestrator/editors/restart") {
        const body = await readJsonBody<{ editorId?: "trident" | "animation-studio" }>(req);

        if (!body.editorId) {
          throw new Error("Missing editor id.");
        }

        await service.restartEditor(body.editorId);
        return sendJson(res, 200, await service.getSnapshot());
      }

      sendJson(res, 404, { error: "Not found." });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Unexpected orchestrator error."
      });
    }
  });
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return (body ? JSON.parse(body) : {}) as T;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}
