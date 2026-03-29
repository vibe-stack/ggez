import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import {
  slugifyProjectName,
  type EditorFileMetadata
} from "../../../packages/dev-sync/src/index";
import {
  getLiveEditorRegistration,
  getLiveGameRegistration,
  listLiveGameRegistrations,
  removeDevSyncRegistration,
  upsertDevSyncRegistration
} from "../../../packages/dev-sync/src/node";

type AnimationSyncPushRequest = {
  bundle?: {
    files: Array<{
      bytes: number[];
      mimeType: string;
      path: string;
    }>;
  };
  gameId?: string;
  metadata?: EditorFileMetadata;
};

const HEARTBEAT_MS = 2000;

export function createAnimationGameSyncPlugin(): Plugin {
  return {
    name: "animation-game-sync",
    configureServer(server) {
      registerAnimationGameSyncApi(server);
      registerAnimationEditorPresence(server);
    },
    configurePreviewServer(server) {
      registerAnimationGameSyncApi(server);
      registerAnimationEditorPresence(server);
    }
  };
}

function registerAnimationGameSyncApi(server: ViteDevServer | PreviewServer) {
  server.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split("?")[0];

    if (req.method === "GET" && pathname === "/api/editor-sync/games") {
      const [editor, games] = await Promise.all([
        getLiveEditorRegistration(),
        listLiveGameRegistrations()
      ]);

      sendJson(res, 200, {
        editor,
        games
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/editor-sync/push") {
      try {
        const body = await readJsonBody<AnimationSyncPushRequest>(req);
        const animationBundle = body.bundle;

        if (!animationBundle) {
          sendJson(res, 400, { error: "Missing animation bundle." });
          return;
        }

        const games = await listLiveGameRegistrations();
        const targetGame = body.gameId
          ? await getLiveGameRegistration(body.gameId)
          : games[0];

        if (!targetGame) {
          sendJson(res, 404, { error: "No live game dev server was found." });
          return;
        }

        const metadata = normalizeEditorMetadata(body.metadata);
        const animationRoot = join(targetGame.projectRoot, "src/animations");
        const animationDir = join(animationRoot, metadata.projectSlug);

        await rm(animationDir, { force: true, recursive: true });
        await mkdir(animationDir, { recursive: true });

        for (const file of animationBundle.files) {
          const outputPath = join(animationDir, file.path);
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from(file.bytes));
        }

        sendJson(res, 200, {
          animationDir,
          animationPath: relative(targetGame.projectRoot, animationDir),
          game: targetGame,
          projectName: metadata.projectName,
          projectSlug: metadata.projectSlug
        });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : "Failed to push animation bundle to game."
        });
      }
      return;
    }

    next();
  });
}

function registerAnimationEditorPresence(server: ViteDevServer | PreviewServer) {
  if (!server.httpServer) {
    return;
  }

  const registrationId = `editor:${server.config.root}`;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const publish = async () => {
    const address = server.httpServer?.address();

    if (!address || typeof address === "string") {
      return;
    }

    await upsertDevSyncRegistration({
      id: registrationId,
      kind: "editor",
      name: "Animation Editor",
      pid: process.pid,
      projectRoot: server.config.root,
      updatedAt: Date.now(),
      url: `http://localhost:${address.port}`
    });
  };

  server.httpServer.once("listening", () => {
    void publish();
    heartbeat = setInterval(() => {
      void publish();
    }, HEARTBEAT_MS);
  });

  server.httpServer.once("close", () => {
    if (heartbeat) {
      clearInterval(heartbeat);
    }

    void removeDevSyncRegistration("editor", registrationId);
  });
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body) as T;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function normalizeEditorMetadata(metadata?: EditorFileMetadata) {
  const projectName = metadata?.projectName?.trim() || "Untitled Animation";
  const projectSlug = slugifyProjectName(metadata?.projectSlug?.trim() || projectName);

  return {
    projectName,
    projectSlug
  };
}