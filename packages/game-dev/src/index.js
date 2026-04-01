import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

const HEARTBEAT_MS = 2000;
const DEV_SYNC_REGISTRY_VERSION = 1;
const DEV_SYNC_STALE_AFTER_MS = 8000;
const DEV_SYNC_REGISTRY_PATH = join(tmpdir(), "web-hammer-dev-sync.json");
const VIRTUAL_SCENE_REGISTRY_ID = "virtual:web-hammer-scene-registry";
const RESOLVED_SCENE_REGISTRY_ID = "\0virtual:web-hammer-scene-registry";
const VIRTUAL_ANIMATION_REGISTRY_ID = "virtual:web-hammer-animation-registry";
const RESOLVED_ANIMATION_REGISTRY_ID = "\0virtual:web-hammer-animation-registry";
const VIRTUAL_EDITOR_SYNC_ID = "virtual:web-hammer-editor-sync";
const RESOLVED_EDITOR_SYNC_ID = "\0virtual:web-hammer-editor-sync";

export function createWebHammerGamePlugin(options = {}) {
  const sceneRoot = options.sceneRoot ?? "src/scenes";
  const animationRoot = options.animationRoot ?? "src/animations";
  let projectRoot = process.cwd();
  let absoluteSceneRoot = join(projectRoot, sceneRoot);
  let absoluteAnimationRoot = join(projectRoot, animationRoot);

  return {
    name: "web-hammer-game-dev",
    configResolved(config) {
      projectRoot = config.root;
      absoluteSceneRoot = join(projectRoot, sceneRoot);
      absoluteAnimationRoot = join(projectRoot, animationRoot);
    },
    resolveId(id) {
      if (id === VIRTUAL_SCENE_REGISTRY_ID) {
        return RESOLVED_SCENE_REGISTRY_ID;
      }

      if (id === VIRTUAL_ANIMATION_REGISTRY_ID) {
        return RESOLVED_ANIMATION_REGISTRY_ID;
      }

      if (id === VIRTUAL_EDITOR_SYNC_ID) {
        return RESOLVED_EDITOR_SYNC_ID;
      }

      return null;
    },
    async load(id) {
      if (id === RESOLVED_SCENE_REGISTRY_ID) {
        return createSceneRegistryModule({
          initialSceneId: options.initialSceneId,
          projectRoot,
          sceneRoot
        });
      }

      if (id === RESOLVED_ANIMATION_REGISTRY_ID) {
        return createAnimationRegistryModule({
          animationRoot,
          projectRoot
        });
      }

      if (id === RESOLVED_EDITOR_SYNC_ID) {
        return createEditorSyncClientModule({ projectRoot });
      }

      return null;
    },
    configureServer(server) {
      registerEditorSyncApi(server, {
        projectName: options.projectName ?? basename(projectRoot),
        sceneRoot
      });
      registerGamePresence(server, {
        projectName: options.projectName ?? basename(projectRoot),
        sceneRoot
      });
      registerSceneRegistryWatcher(server, absoluteSceneRoot);
      registerAnimationRegistryWatcher(server, absoluteAnimationRoot);
    },
    transformIndexHtml(_html, context) {
      if (!context?.server) {
        return;
      }

      return [
        {
          attrs: { type: "module" },
          children: createEditorSyncClientInlineScript({ projectRoot }),
          injectTo: "body",
          tag: "script"
        }
      ];
    },
    handleHotUpdate(context) {
      if (isSceneRegistryRelevant(context.file, absoluteSceneRoot)) {
        const virtualModule = context.server.moduleGraph.getModuleById(RESOLVED_SCENE_REGISTRY_ID);

        if (virtualModule) {
          context.server.moduleGraph.invalidateModule(virtualModule);
        }

        context.server.ws.send({ type: "full-reload" });
        return [];
      }

      if (isAnimationRegistryRelevant(context.file, absoluteAnimationRoot)) {
        const virtualAnimationModule = context.server.moduleGraph.getModuleById(RESOLVED_ANIMATION_REGISTRY_ID);

        if (virtualAnimationModule) {
          context.server.moduleGraph.invalidateModule(virtualAnimationModule);
        }

        context.server.ws.send({ type: "full-reload" });
        return [];
      }
    }
  };
}

function registerEditorSyncApi(server, options) {
  const registrationId = `game:${server.config.root}`;

  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/editor-sync/status") {
      const [editor, game] = await Promise.all([
        getLiveEditorRegistration(),
        getLiveGameRegistration(registrationId)
      ]);

      sendJson(res, 200, { editor, game });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/editor-sync/command") {
      const after = url.searchParams.get("after") ?? "";
      const game = await getLiveGameRegistration(registrationId);
      const command = game?.currentCommand && game.currentCommand.nonce !== after
        ? game.currentCommand
        : undefined;

      sendJson(res, 200, { command });
      return;
    }

    next();
  });
}

function registerGamePresence(server, options) {
  if (!server.httpServer) {
    return;
  }

  const registrationId = `game:${server.config.root}`;
  const sceneRoot = join(server.config.root, options.sceneRoot ?? "src/scenes");
  const projectName = options.projectName ?? basename(server.config.root);
  let heartbeat;

  const publish = async () => {
    const address = server.httpServer?.address();

    if (!address || typeof address === "string") {
      return;
    }

    await upsertDevSyncRegistration({
      id: registrationId,
      kind: "game",
      name: projectName,
      pid: process.pid,
      projectRoot: server.config.root,
      sceneIds: await listSceneIds(sceneRoot),
      sceneRoot,
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

    void removeDevSyncRegistration("game", registrationId);
  });
}

async function createSceneRegistryModule(options) {
  const sceneDirectories = await readSceneDirectories(join(options.projectRoot, options.sceneRoot));
  const explicitModuleImports = [];
  let explicitImportIndex = 0;

  for (const directory of sceneDirectories) {
    const explicitModulePath = await resolveFirstExistingFile([
      join(options.projectRoot, options.sceneRoot, directory, "index.ts"),
      join(options.projectRoot, options.sceneRoot, directory, "index.tsx"),
      join(options.projectRoot, options.sceneRoot, directory, "index.js"),
      join(options.projectRoot, options.sceneRoot, directory, "index.jsx")
    ]);

    if (!explicitModulePath) {
      continue;
    }

    explicitModuleImports.push({
      importName: `sceneModule${explicitImportIndex++}`,
      specifier: toProjectImportSpecifier(options.projectRoot, explicitModulePath)
    });
  }

  const importLines = explicitModuleImports.map(
    ({ importName, specifier }) => `import * as ${importName} from ${JSON.stringify(specifier)};`
  );
  const explicitCandidates = explicitModuleImports.map(({ importName }) => importName).join(", ");
  const sceneRootPattern = `/${normalizePath(options.sceneRoot)}/*`;
  const editorSyncStorageNamespace = createEditorSyncStorageNamespace(options.projectRoot);

  return `
import { createColocatedRuntimeSceneSource, defineGameScene } from ${JSON.stringify("/src/game/loaders/scene-sources.ts")};

${importLines.join("\n")}

const explicitSceneModules = [${explicitCandidates}];
const explicitScenes = Object.fromEntries(
  explicitSceneModules
    .map(resolveExplicitSceneDefinition)
    .filter(Boolean)
    .map((scene) => [scene.id, scene])
);

const sceneManifestModules = import.meta.glob(${JSON.stringify(`${sceneRootPattern}/scene.runtime.json`)}, {
  import: "default",
  query: "?raw"
});
const sceneAssetModules = import.meta.glob(${JSON.stringify(`${sceneRootPattern}/assets/**/*`)}, {
  import: "default",
  query: "?url"
});
const sceneMetaModules = import.meta.glob(${JSON.stringify(`${sceneRootPattern}/scene.meta.json`)}, {
  eager: true,
  import: "default"
});

const discoveredScenes = createDiscoveredScenes(explicitScenes);
export const scenes = {
  ...discoveredScenes,
  ...explicitScenes
};
const defaultInitialSceneId = ${JSON.stringify(options.initialSceneId ?? "")} || Object.keys(explicitScenes)[0] || Object.keys(discoveredScenes)[0] || "";
export const initialSceneId = resolveInitialSceneId(defaultInitialSceneId, scenes);

function createDiscoveredScenes(existingScenes) {
  const discovered = {};

  for (const [path, manifestLoader] of Object.entries(sceneManifestModules)) {
    const folderName = extractSceneFolderName(path);

    if (!folderName) {
      continue;
    }

    const metadata = sceneMetaModules[path.replace(/scene\\.runtime\\.json$/, "scene.meta.json")] ?? {};
    const sceneId = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id.trim() : folderName;

    if (sceneId in existingScenes) {
      continue;
    }

    if (typeof manifestLoader !== "function") {
      continue;
    }

        const assetUrlLoaders = Object.fromEntries(
          Object.entries(sceneAssetModules)
            .filter(([assetPath, load]) => assetPath.startsWith(path.replace(/scene\\.runtime\\.json$/, "assets/")) && typeof load === "function")
            .map(([assetPath, load]) => [assetPath.replace(path.replace(/scene\\.runtime\\.json$/, ""), "./"), load])
        );

    discovered[sceneId] = defineGameScene({
      id: sceneId,
      source: createColocatedRuntimeSceneSource({
        assetUrlLoaders,
        manifestLoader
      }),
      title: typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : prettifyProjectSlug(sceneId)
    });
  }

  return discovered;
}

function resolveExplicitSceneDefinition(module) {
  if (isGameSceneDefinition(module?.default)) {
    return module.default;
  }

  for (const value of Object.values(module ?? {})) {
    if (isGameSceneDefinition(value)) {
      return value;
    }
  }

  return null;
}

function isGameSceneDefinition(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.source &&
    typeof value.source.load === "function"
  );
}
function extractSceneFolderName(path) {
  const match = /\\/([^/]+)\\/scene\\.runtime\\.json$/.exec(path);
  return match?.[1];
}
function prettifyProjectSlug(value) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Untitled Scene";
  }

  return trimmed
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveInitialSceneId(defaultSceneId, allScenes) {
  if (typeof window === "undefined") {
    return defaultSceneId;
  }

  const requestedSceneId = new URLSearchParams(window.location.search).get("whScene");

  if (requestedSceneId && requestedSceneId in allScenes) {
    return requestedSceneId;
  }

  const pendingSceneId = window.sessionStorage.getItem(${JSON.stringify(`web-hammer:editor-sync:${editorSyncStorageNamespace}:pending-scene`)});

  if (pendingSceneId && pendingSceneId in allScenes) {
    window.sessionStorage.removeItem(${JSON.stringify(`web-hammer:editor-sync:${editorSyncStorageNamespace}:pending-scene`)});
    return pendingSceneId;
  }

  return defaultSceneId;
}
`;
}

function createEditorSyncClientModule(options) {
  return `${createEditorSyncClientRuntimeSource(options, { enabled: true })}

export { resolveEditorSyncInitialSceneId, startEditorSyncClient };
`;
}

async function createAnimationRegistryModule(options) {
  const animationDirectories = await readSceneDirectories(join(options.projectRoot, options.animationRoot));
  const explicitModuleImports = [];
  let explicitImportIndex = 0;

  for (const directory of animationDirectories) {
    const explicitModulePath = await resolveFirstExistingFile([
      join(options.projectRoot, options.animationRoot, directory, "index.ts"),
      join(options.projectRoot, options.animationRoot, directory, "index.tsx"),
      join(options.projectRoot, options.animationRoot, directory, "index.js"),
      join(options.projectRoot, options.animationRoot, directory, "index.jsx")
    ]);

    if (!explicitModulePath) {
      continue;
    }

    explicitModuleImports.push({
      importName: `animationModule${explicitImportIndex++}`,
      specifier: toProjectImportSpecifier(options.projectRoot, explicitModulePath)
    });
  }

  const importLines = explicitModuleImports.map(
    ({ importName, specifier }) => `import * as ${importName} from ${JSON.stringify(specifier)};`
  );
  const explicitCandidates = explicitModuleImports.map(({ importName }) => importName).join(", ");
  const animationRootPattern = `/${normalizePath(options.animationRoot)}/*`;

  return `
import { createColocatedRuntimeAnimationSource, defineGameAnimationBundle } from ${JSON.stringify("/src/game/loaders/animation-sources.ts")};

${importLines.join("\n")}

const explicitAnimationModules = [${explicitCandidates}];
const explicitAnimations = Object.fromEntries(
  explicitAnimationModules
    .map(resolveExplicitAnimationDefinition)
    .filter(Boolean)
    .map((animation) => [animation.id, animation])
);

const animationManifestModules = import.meta.glob(${JSON.stringify(`${animationRootPattern}/animation.bundle.json`)}, {
  import: "default"
});
const animationArtifactModules = import.meta.glob(${JSON.stringify(`${animationRootPattern}/*.animation.json`)}, {
  import: "default",
  query: "?raw"
});
const animationAssetModules = import.meta.glob(${JSON.stringify(`${animationRootPattern}/assets/**/*`)}, {
  import: "default",
  query: "?url"
});
const animationMetaModules = import.meta.glob(${JSON.stringify(`${animationRootPattern}/animation.meta.json`)}, {
  eager: true,
  import: "default"
});

const discoveredAnimations = createDiscoveredAnimations(explicitAnimations);
export const animations = {
  ...discoveredAnimations,
  ...explicitAnimations
};

function createDiscoveredAnimations(existingAnimations) {
  const discovered = {};

  for (const [path, manifestLoader] of Object.entries(animationManifestModules)) {
    const folderName = extractAnimationFolderName(path);

    if (!folderName) {
      continue;
    }

    const metadata = animationMetaModules[path.replace(/animation\\.bundle\\.json$/, "animation.meta.json")] ?? {};
    const animationId = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id.trim() : folderName;

    if (animationId in existingAnimations) {
      continue;
    }

    if (typeof manifestLoader !== "function") {
      continue;
    }

    const artifactLoader = animationArtifactModules[path.replace(/animation\\.bundle\\.json$/, "graph.animation.json")];

    if (typeof artifactLoader !== "function") {
      continue;
    }

        const assetUrlLoaders = Object.fromEntries(
          Object.entries(animationAssetModules)
            .filter(([assetPath, load]) => assetPath.startsWith(path.replace(/animation\\.bundle\\.json$/, "assets/")) && typeof load === "function")
            .map(([assetPath, load]) => [assetPath.replace(path.replace(/animation\\.bundle\\.json$/, ""), "./"), load])
        );

    discovered[animationId] = defineGameAnimationBundle({
      id: animationId,
      source: createColocatedRuntimeAnimationSource({
        artifactLoader,
        assetUrlLoaders,
        manifestLoader
      }),
      title: typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : prettifyProjectSlug(animationId)
    });
  }

  return discovered;
}

function resolveExplicitAnimationDefinition(module) {
  if (isGameAnimationDefinition(module?.default)) {
    return module.default;
  }

  for (const value of Object.values(module ?? {})) {
    if (isGameAnimationDefinition(value)) {
      return value;
    }
  }

  return null;
}

function isGameAnimationDefinition(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.source &&
    typeof value.source.load === "function"
  );
}

function extractAnimationFolderName(path) {
  const match = /\\/([^/]+)\\/animation\\.bundle\\.json$/.exec(path);
  return match?.[1];
}

function prettifyProjectSlug(value) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Untitled Animation";
  }

  return trimmed
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
`;
}

function createEditorSyncClientInlineScript(options) {
  return `${createEditorSyncClientRuntimeSource(options, { enabled: true })}

startEditorSyncClient();
`;
}

function createEditorSyncClientRuntimeSource(options, runtimeOptions = {}) {
  const storageNamespace = createEditorSyncStorageNamespace(options.projectRoot);
  const enabled = runtimeOptions.enabled !== false;

  return `
const PENDING_SCENE_KEY = ${JSON.stringify(`web-hammer:editor-sync:${storageNamespace}:pending-scene`)};
const LAST_COMMAND_KEY = ${JSON.stringify(`web-hammer:editor-sync:${storageNamespace}:last-command`)};
const EDITOR_SYNC_ENABLED = ${JSON.stringify(enabled)};
const ORCHESTRATOR_SCREENSHOT_REQUEST = "web-hammer:orchestrator:get-screenshot";
const ORCHESTRATOR_SCREENSHOT_RESPONSE = "web-hammer:orchestrator:screenshot";

function resolveEditorSyncInitialSceneId(defaultSceneId, sceneIds) {
  if (typeof window === "undefined") {
    return defaultSceneId;
  }

  const pendingSceneId = window.sessionStorage.getItem(PENDING_SCENE_KEY);

  if (pendingSceneId && sceneIds.includes(pendingSceneId)) {
    window.sessionStorage.removeItem(PENDING_SCENE_KEY);
    return pendingSceneId;
  }

  return defaultSceneId;
}

function resolveBestCanvas() {
  const canvases = Array.from(document.querySelectorAll("canvas"));

  return canvases
    .filter((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const style = window.getComputedStyle(canvas);

      return canvas.width > 0 &&
        canvas.height > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0;
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    })[0] ?? null;
}

function fitWithin(width, height, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1));

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale))
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read screenshot blob."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForPresentedFrame(frameCount = 2) {
  for (let index = 0; index < frameCount; index += 1) {
    await nextAnimationFrame();
  }
}

async function captureCanvasBitmap(canvas) {
  if (typeof canvas.captureStream === "function") {
    const stream = canvas.captureStream(0);
    const [track] = stream.getVideoTracks();

    if (track) {
      try {
        if (typeof ImageCapture !== "undefined") {
          const frame = await new ImageCapture(track).grabFrame();
          track.stop();
          return frame;
        }

        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();

        const bitmap = await new Promise((resolve, reject) => {
          const finish = async () => {
            try {
              const result = await createImageBitmap(video);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          };

          if (typeof video.requestVideoFrameCallback === "function") {
            video.requestVideoFrameCallback(() => {
              void finish();
            });
            return;
          }

          setTimeout(() => {
            void finish();
          }, 50);
        });

        video.pause();
        video.srcObject = null;
        track.stop();
        return bitmap;
      } catch {
        track.stop();
      }
    }
  }

  if (typeof createImageBitmap === "function") {
    return createImageBitmap(canvas);
  }

  return canvas;
}

function isMostlyBlackFrame(context, width, height) {
  const sampleWidth = Math.max(1, Math.min(width, 32));
  const sampleHeight = Math.max(1, Math.min(height, 18));
  const stepX = Math.max(1, Math.floor(width / sampleWidth));
  const stepY = Math.max(1, Math.floor(height / sampleHeight));
  const data = context.getImageData(0, 0, width, height).data;
  let blackishSamples = 0;
  let sampled = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      sampled += 1;

      if (alpha === 0 || (red < 10 && green < 10 && blue < 10)) {
        blackishSamples += 1;
      }
    }
  }

  return sampled > 0 && blackishSamples / sampled > 0.985;
}

async function drawCanvasFrameToTarget(canvas, context, width, height) {
  const bitmap = await captureCanvasBitmap(canvas);

  try {
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

async function captureGameScreenshot(options = {}) {
  const canvas = resolveBestCanvas();

  if (!canvas) {
    throw new Error("No active game canvas found.");
  }

  const sourceWidth = canvas.width;
  const sourceHeight = canvas.height;
  const maxWidth = Number.isFinite(options.maxWidth) ? Math.max(1, options.maxWidth) : 1280;
  const maxHeight = Number.isFinite(options.maxHeight) ? Math.max(1, options.maxHeight) : 720;
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxWidth, maxHeight);

  const target = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const context = target.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Could not create a screenshot canvas.");
  }

  await waitForPresentedFrame(2);
  await drawCanvasFrameToTarget(canvas, context, width, height);

  if (isMostlyBlackFrame(context, width, height)) {
    await waitForPresentedFrame(2);
    await drawCanvasFrameToTarget(canvas, context, width, height);
  }

  if (typeof OffscreenCanvas !== "undefined" && target instanceof OffscreenCanvas) {
    const blob = await target.convertToBlob({ type: "image/jpeg", quality: 0.82 });
    return {
      dataUrl: await blobToDataUrl(blob),
      height,
      mimeType: "image/jpeg",
      sourceHeight,
      sourceWidth,
      width
    };
  }

  return {
    dataUrl: target.toDataURL("image/jpeg", 0.82),
    height,
    mimeType: "image/jpeg",
    sourceHeight,
    sourceWidth,
    width
  };
}

function startEditorSyncClient() {
  if (!EDITOR_SYNC_ENABLED) {
    return () => {};
  }

  let disposed = false;
  let timer = 0;
  let inFlight = false;

  const handleOrchestratorMessage = async (event) => {
    if (event.source !== window.parent || event.data?.type !== ORCHESTRATOR_SCREENSHOT_REQUEST) {
      return;
    }

    const requestId = typeof event.data.requestId === "string" ? event.data.requestId : "";
    const targetOrigin = typeof event.origin === "string" && event.origin.length > 0 ? event.origin : "*";

    try {
      const screenshot = await captureGameScreenshot({
        maxHeight: event.data.maxHeight,
        maxWidth: event.data.maxWidth
      });

      window.parent.postMessage({
        type: ORCHESTRATOR_SCREENSHOT_RESPONSE,
        requestId,
        screenshot,
        success: true
      }, targetOrigin);
    } catch (error) {
      window.parent.postMessage({
        type: ORCHESTRATOR_SCREENSHOT_RESPONSE,
        requestId,
        error: error instanceof Error ? error.message : "Failed to capture game screenshot.",
        success: false
      }, targetOrigin);
    }
  };

  window.addEventListener("message", handleOrchestratorMessage);

  const poll = async () => {
    if (disposed || inFlight) {
      return;
    }

    inFlight = true;

    try {
      const after = window.sessionStorage.getItem(LAST_COMMAND_KEY) ?? "";
      const response = await fetch(\`/api/editor-sync/command?after=\${encodeURIComponent(after)}\`);

      if (!response.ok) {
        return;
      }

      const payload = await response.json();

      if (payload.command?.type === "switch-scene" && payload.command.nonce !== after) {
        window.sessionStorage.setItem(LAST_COMMAND_KEY, payload.command.nonce);
        window.sessionStorage.setItem(PENDING_SCENE_KEY, payload.command.sceneId);
        window.location.reload();
        return;
      }
    } catch {
      // Ignore transient polling failures while the dev server restarts.
    } finally {
      inFlight = false;

      if (!disposed) {
        timer = window.setTimeout(() => {
          void poll();
        }, 1500);
      }
    }
  };

  timer = window.setTimeout(() => {
    void poll();
  }, 1500);

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    window.removeEventListener("message", handleOrchestratorMessage);
  };
}
`;
}

function createEditorSyncStorageNamespace(projectRoot) {
  return normalizePath(relative(process.cwd(), projectRoot) || projectRoot)
    .replace(/[^a-zA-Z0-9_-]+/g, ":")
    .replace(/^:+|:+$/g, "") || "project";
}

function isSceneRegistryRelevant(file, absoluteSceneRoot) {
  const normalizedFile = normalizePath(file);
  const normalizedSceneRoot = normalizePath(absoluteSceneRoot);

  if (!normalizedFile.startsWith(`${normalizedSceneRoot}/`)) {
    return false;
  }

  return /\/(scene\.runtime\.json|scene\.meta\.json|index\.[jt]sx?)$/.test(normalizedFile);
}

function isAnimationRegistryRelevant(file, absoluteAnimationRoot) {
  const normalizedFile = normalizePath(file);
  const normalizedAnimationRoot = normalizePath(absoluteAnimationRoot);

  if (!normalizedFile.startsWith(`${normalizedAnimationRoot}/`)) {
    return false;
  }

  return /\/(animation\.bundle\.json|animation\.meta\.json|[^/]+\.animation\.json|index\.[jt]sx?)$/.test(normalizedFile);
}

function registerSceneRegistryWatcher(server, absoluteSceneRoot) {
  const invalidate = (file) => {
    if (!isSceneRegistryRelevant(file, absoluteSceneRoot)) {
      return;
    }

    const virtualModule = server.moduleGraph.getModuleById(RESOLVED_SCENE_REGISTRY_ID);

    if (virtualModule) {
      server.moduleGraph.invalidateModule(virtualModule);
    }

    server.ws.send({ type: "full-reload" });
  };

  server.watcher.on("add", invalidate);
  server.watcher.on("unlink", invalidate);
}

function registerAnimationRegistryWatcher(server, absoluteAnimationRoot) {
  const invalidate = (file) => {
    if (!isAnimationRegistryRelevant(file, absoluteAnimationRoot)) {
      return;
    }

    const virtualModule = server.moduleGraph.getModuleById(RESOLVED_ANIMATION_REGISTRY_ID);

    if (virtualModule) {
      server.moduleGraph.invalidateModule(virtualModule);
    }

    server.ws.send({ type: "full-reload" });
  };

  server.watcher.on("add", invalidate);
  server.watcher.on("unlink", invalidate);
}

async function readSceneDirectories(sceneRoot) {
  try {
    const entries = await readdir(sceneRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function listSceneIds(sceneRoot) {
  return readSceneDirectories(sceneRoot);
}

async function resolveFirstExistingFile(paths) {
  for (const path of paths) {
    try {
      await access(path, constants.F_OK);
      return path;
    } catch {
      // Continue.
    }
  }

  return undefined;
}

function toProjectImportSpecifier(projectRoot, absolutePath) {
  return `/${normalizePath(relative(projectRoot, absolutePath))}`;
}

function normalizePath(value) {
  return value.replace(/\\\\/g, "/");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function getLiveEditorRegistration() {
  const registry = await pruneAndPersistRegistry();
  return Object.values(registry.editors).sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

async function getLiveGameRegistration(id) {
  const registry = await pruneAndPersistRegistry();
  return registry.games[id];
}

async function upsertDevSyncRegistration(registration) {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());

  if (registration.kind === "editor") {
    registry.editors[registration.id] = registration;
  } else {
    const existingRegistration = registry.games[registration.id];
    registry.games[registration.id] = {
      ...existingRegistration,
      ...registration,
      currentCommand: registration.currentCommand ?? existingRegistration?.currentCommand
    };
  }

  await writeDevSyncRegistry(registry);
  return registry;
}

async function removeDevSyncRegistration(kind, id) {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());

  if (kind === "editor") {
    delete registry.editors[id];
  } else {
    delete registry.games[id];
  }

  if (Object.keys(registry.editors).length === 0 && Object.keys(registry.games).length === 0) {
    await rm(DEV_SYNC_REGISTRY_PATH, { force: true });
    return createEmptyRegistry();
  }

  await writeDevSyncRegistry(registry);
  return registry;
}

async function pruneAndPersistRegistry() {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());
  await writeDevSyncRegistry(registry);
  return registry;
}

async function readDevSyncRegistry() {
  try {
    const source = await readFile(DEV_SYNC_REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(source);

    if (parsed.version !== DEV_SYNC_REGISTRY_VERSION) {
      return createEmptyRegistry();
    }

    return {
      editors: parsed.editors ?? {},
      games: parsed.games ?? {},
      version: DEV_SYNC_REGISTRY_VERSION
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createEmptyRegistry();
    }

    throw error;
  }
}

async function writeDevSyncRegistry(registry) {
  const tempPath = `${DEV_SYNC_REGISTRY_PATH}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(DEV_SYNC_REGISTRY_PATH), { recursive: true });
  await writeFile(tempPath, JSON.stringify(registry, null, 2), "utf8");
  await rename(tempPath, DEV_SYNC_REGISTRY_PATH);
}

function pruneDevSyncRegistry(registry) {
  const cutoff = Date.now() - DEV_SYNC_STALE_AFTER_MS;

  registry.editors = Object.fromEntries(
    Object.entries(registry.editors).filter(([, registration]) => registration.updatedAt >= cutoff)
  );
  registry.games = Object.fromEntries(
    Object.entries(registry.games).filter(([, registration]) => registration.updatedAt >= cutoff)
  );

  return registry;
}

function createEmptyRegistry() {
  return {
    editors: {},
    games: {},
    version: DEV_SYNC_REGISTRY_VERSION
  };
}
