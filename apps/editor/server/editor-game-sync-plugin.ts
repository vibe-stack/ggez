import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import {
  getLiveEditorRegistration,
  getLiveGameRegistration,
  listLiveGameRegistrations,
  removeDevSyncRegistration,
  setGameCommand,
  slugifyProjectName,
  type EditorFileMetadata,
  upsertDevSyncRegistration
} from "./editor-sync-registry";

type EditorSyncPushRequest = {
  bundle?: {
    files: Array<{
      bytes: number[];
      mimeType: string;
      path: string;
    }>;
    manifest: unknown;
  };
  forceSwitch?: boolean;
  gameId?: string;
  metadata?: EditorFileMetadata;
};

const HEARTBEAT_MS = 2000;

export function createEditorGameSyncPlugin(): Plugin {
  return {
    name: "editor-game-sync",
    configureServer(server) {
      registerEditorGameSyncApi(server);
      registerEditorPresence(server);
    },
    configurePreviewServer(server) {
      registerEditorGameSyncApi(server);
      registerEditorPresence(server);
    }
  };
}

function registerEditorGameSyncApi(server: ViteDevServer | PreviewServer) {
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
        const body = await readJsonBody<EditorSyncPushRequest>(req);
        const runtimeBundle = body.bundle;

        if (!runtimeBundle) {
          sendJson(res, 400, { error: "Missing runtime bundle." });
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
        const sceneDir = join(targetGame.sceneRoot, metadata.projectSlug!);

        await mkdir(sceneDir, { recursive: true });
        await rm(join(sceneDir, "assets"), { force: true, recursive: true });
        await writeFile(
          join(sceneDir, "scene.runtime.json"),
          JSON.stringify(runtimeBundle.manifest, null, 2),
          "utf8"
        );
        await writeFile(
          join(sceneDir, "scene.meta.json"),
          JSON.stringify(
            {
              id: metadata.projectSlug,
              projectName: metadata.projectName,
              projectSlug: metadata.projectSlug,
              title: metadata.projectName
            },
            null,
            2
          ),
          "utf8"
        );

        for (const file of runtimeBundle.files) {
          const outputPath = join(sceneDir, file.path);
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from(file.bytes));
        }

        if (body.forceSwitch) {
          await setGameCommand(targetGame.id, {
            issuedAt: Date.now(),
            nonce: `${Date.now()}:${metadata.projectSlug}`,
            sceneId: metadata.projectSlug!,
            type: "switch-scene"
          });
        }

        sendJson(res, 200, {
          forceSwitch: Boolean(body.forceSwitch),
          game: targetGame,
          projectName: metadata.projectName,
          projectSlug: metadata.projectSlug,
          sceneDir,
          scenePath: relative(targetGame.projectRoot, sceneDir)
        });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : "Failed to push scene to game."
        });
      }
      return;
    }

    next();
  });
}

function registerEditorPresence(server: ViteDevServer | PreviewServer) {
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
      name: "Trident Editor",
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
  const projectName = metadata?.projectName?.trim() || "Untitled Scene";
  const projectSlug = slugifyProjectName(metadata?.projectSlug?.trim() || projectName);

  return {
    projectName,
    projectSlug
  };
}
