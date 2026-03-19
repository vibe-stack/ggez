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
const VIRTUAL_EDITOR_SYNC_ID = "virtual:web-hammer-editor-sync";
const RESOLVED_EDITOR_SYNC_ID = "\0virtual:web-hammer-editor-sync";

export function createWebHammerGamePlugin(options = {}) {
  const sceneRoot = options.sceneRoot ?? "src/scenes";
  let projectRoot = process.cwd();
  let absoluteSceneRoot = join(projectRoot, sceneRoot);

  return {
    name: "web-hammer-game-dev",
    configResolved(config) {
      projectRoot = config.root;
      absoluteSceneRoot = join(projectRoot, sceneRoot);
    },
    resolveId(id) {
      if (id === VIRTUAL_SCENE_REGISTRY_ID) {
        return RESOLVED_SCENE_REGISTRY_ID;
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

      if (id === RESOLVED_EDITOR_SYNC_ID) {
        return createEditorSyncClientModule();
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
    },
    transformIndexHtml(_html, context) {
      if (!context?.server) {
        return;
      }

      return [
        {
          attrs: { type: "module" },
          children: `import { startEditorSyncClient } from "${VIRTUAL_EDITOR_SYNC_ID}"; startEditorSyncClient();`,
          injectTo: "body",
          tag: "script"
        }
      ];
    },
    handleHotUpdate(context) {
      if (!isSceneRegistryRelevant(context.file, absoluteSceneRoot)) {
        return;
      }

      const virtualModule = context.server.moduleGraph.getModuleById(RESOLVED_SCENE_REGISTRY_ID);

      if (virtualModule) {
        context.server.moduleGraph.invalidateModule(virtualModule);
      }

      context.server.ws.send({ type: "full-reload" });
      return [];
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

  return `
import { createBundledRuntimeSceneSource, defineGameScene } from ${JSON.stringify("/src/game/runtime-scene-sources.ts")};

${importLines.join("\n")}

const explicitSceneModules = [${explicitCandidates}];
const explicitScenes = Object.fromEntries(
  explicitSceneModules
    .map(resolveExplicitSceneDefinition)
    .filter(Boolean)
    .map((scene) => [scene.id, scene])
);

const sceneManifestModules = import.meta.glob(${JSON.stringify(`${sceneRootPattern}/scene.runtime.json`)}, {
  eager: true,
  import: "default",
  query: "?raw"
});
const sceneAssetModules = import.meta.glob(${JSON.stringify(`${sceneRootPattern}/assets/**/*`)}, {
  eager: true,
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

  for (const [path, manifestText] of Object.entries(sceneManifestModules)) {
    const folderName = extractSceneFolderName(path);

    if (!folderName) {
      continue;
    }

    const metadata = sceneMetaModules[path.replace(/scene\\.runtime\\.json$/, "scene.meta.json")] ?? {};
    const sceneId = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id.trim() : folderName;

    if (sceneId in existingScenes) {
      continue;
    }

    const assetUrls = Object.fromEntries(
      Object.entries(sceneAssetModules)
        .filter(([assetPath]) => assetPath.startsWith(path.replace(/scene\\.runtime\\.json$/, "assets/")))
        .map(([assetPath, url]) => [assetPath.replace(new RegExp(\`^.+/\\\${folderName}/\`), "./"), url])
    );

    discovered[sceneId] = defineGameScene({
      id: sceneId,
      source: createBundledRuntimeSceneSource({
        assetUrls,
        manifestText
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

  const pendingSceneId = window.sessionStorage.getItem("web-hammer:editor-sync:pending-scene");

  if (pendingSceneId && pendingSceneId in allScenes) {
    window.sessionStorage.removeItem("web-hammer:editor-sync:pending-scene");
    return pendingSceneId;
  }

  return defaultSceneId;
}
`;
}

function createEditorSyncClientModule() {
  return `
const PENDING_SCENE_KEY = "web-hammer:editor-sync:pending-scene";
const LAST_COMMAND_KEY = "web-hammer:editor-sync:last-command";

export function resolveEditorSyncInitialSceneId(defaultSceneId, sceneIds) {
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

export function startEditorSyncClient() {
  if (!import.meta.env.DEV) {
    return () => {};
  }

  let disposed = false;
  let timer = 0;
  let inFlight = false;

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
  };
}
`;
}

function isSceneRegistryRelevant(file, absoluteSceneRoot) {
  const normalizedFile = normalizePath(file);
  const normalizedSceneRoot = normalizePath(absoluteSceneRoot);

  if (!normalizedFile.startsWith(`${normalizedSceneRoot}/`)) {
    return false;
  }

  return /\/(scene\.runtime\.json|scene\.meta\.json|index\.[jt]sx?)$/.test(normalizedFile);
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
