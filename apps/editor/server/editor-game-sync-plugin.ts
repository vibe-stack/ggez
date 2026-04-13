import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { parseWebHammerEngineBundleZip } from "@ggez/runtime-build";
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
        const requestStartedAt = performance.now();
        const contentType = req.headers["content-type"] ?? "";
        const binaryBody = contentType.includes("application/json") ? undefined : await readBinaryBody(req);
        const body = contentType.includes("application/json")
          ? await readJsonBody<EditorSyncPushRequest>(req)
          : undefined;
        const bodyReadCompletedAt = performance.now();
        const runtimeBundle = contentType.includes("application/json")
          ? body?.bundle
          : binaryBody
            ? parseWebHammerEngineBundleZip(new Uint8Array(binaryBody))
            : undefined;
        const bundleParsedAt = performance.now();

        const games = await listLiveGameRegistrations();
        const targetGame = resolveHeaderValue(req.headers["x-web-hammer-game-id"]) || body?.gameId
          ? await getLiveGameRegistration(resolveHeaderValue(req.headers["x-web-hammer-game-id"]) || body?.gameId || "")
          : games[0];

        if (!targetGame) {
          sendJson(res, 404, { error: "No live game dev server was found." });
          return;
        }

        if (!runtimeBundle) {
          sendJson(res, 400, { error: "Missing runtime bundle." });
          return;
        }

        const metadata = normalizeEditorMetadata({
          projectName: resolveHeaderValue(req.headers["x-web-hammer-project-name"]) || body?.metadata?.projectName,
          projectSlug: resolveHeaderValue(req.headers["x-web-hammer-project-slug"]) || body?.metadata?.projectSlug
        });
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
        const filesWrittenAt = performance.now();

        const forceSwitch = resolveHeaderValue(req.headers["x-web-hammer-force-switch"]) === "1" || Boolean(body?.forceSwitch);

        if (forceSwitch) {
          await setGameCommand(targetGame.id, {
            issuedAt: Date.now(),
            nonce: `${Date.now()}:${metadata.projectSlug}`,
            sceneId: metadata.projectSlug!,
            type: "switch-scene"
          });
        }

        sendJson(res, 200, {
          forceSwitch,
          game: targetGame,
          projectName: metadata.projectName,
          projectSlug: metadata.projectSlug,
          sceneDir,
          scenePath: relative(targetGame.projectRoot, sceneDir)
        });

        console.info(
          `[editor-sync-server] push completed in ${formatDuration(performance.now() - requestStartedAt)} ` +
            `(read=${formatDuration(bodyReadCompletedAt - requestStartedAt)}, ` +
            `parse=${formatDuration(bundleParsedAt - bodyReadCompletedAt)}, ` +
            `write=${formatDuration(filesWrittenAt - bundleParsedAt)}, ` +
            `files=${runtimeBundle.files.length}, bytes=${formatBytes(sumBundleBytes(runtimeBundle.files))}, slug=${metadata.projectSlug})`
        );
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
  const body = await readBinaryBody(request);
  return JSON.parse(Buffer.from(body).toString("utf8")) as T;
}

async function readBinaryBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function resolveHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sumBundleBytes(files: Array<{ bytes: Uint8Array | number[] }>) {
  return files.reduce((total, file) => total + file.bytes.length, 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(1)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function normalizeEditorMetadata(metadata?: EditorFileMetadata) {
  const projectName = metadata?.projectName?.trim() || "Untitled Scene";
  const projectSlug = slugifyProjectName(metadata?.projectSlug?.trim() || projectName);

  return {
    projectName,
    projectSlug
  };
}
