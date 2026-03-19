import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const DEV_SYNC_REGISTRY_VERSION = 1;
const DEV_SYNC_STALE_AFTER_MS = 8000;
const DEV_SYNC_REGISTRY_PATH = join(tmpdir(), "web-hammer-dev-sync.json");

export type EditorFileMetadata = {
  projectName?: string;
  projectSlug?: string;
};

export type DevSyncCommand = {
  issuedAt: number;
  nonce: string;
  sceneId: string;
  type: "switch-scene";
};

export type DevSyncEditorRegistration = {
  id: string;
  kind: "editor";
  name: string;
  pid: number;
  projectRoot: string;
  updatedAt: number;
  url: string;
};

export type DevSyncGameRegistration = {
  currentCommand?: DevSyncCommand;
  id: string;
  kind: "game";
  name: string;
  pid: number;
  projectRoot: string;
  sceneIds: string[];
  sceneRoot: string;
  updatedAt: number;
  url: string;
};

type DevSyncRegistry = {
  editors: Record<string, DevSyncEditorRegistration>;
  games: Record<string, DevSyncGameRegistration>;
  version: number;
};

export async function listLiveGameRegistrations() {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());
  await writeDevSyncRegistry(registry);
  return Object.values(registry.games).sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getLiveEditorRegistration() {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());
  await writeDevSyncRegistry(registry);
  return Object.values(registry.editors).sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

export async function getLiveGameRegistration(id: string) {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());
  const registration = registry.games[id];

  if (!registration) {
    return undefined;
  }

  await writeDevSyncRegistry(registry);
  return registration;
}

export async function setGameCommand(gameId: string, command: DevSyncCommand) {
  const registry = pruneDevSyncRegistry(await readDevSyncRegistry());
  const game = registry.games[gameId];

  if (!game) {
    return undefined;
  }

  registry.games[gameId] = {
    ...game,
    currentCommand: command
  };
  await writeDevSyncRegistry(registry);
  return registry.games[gameId];
}

export async function upsertDevSyncRegistration(
  registration: DevSyncEditorRegistration | DevSyncGameRegistration
) {
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

export async function removeDevSyncRegistration(kind: "editor" | "game", id: string) {
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

export function slugifyProjectName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled-scene";
}

async function readDevSyncRegistry(): Promise<DevSyncRegistry> {
  try {
    const source = await readFile(DEV_SYNC_REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(source) as Partial<DevSyncRegistry>;

    if (parsed.version !== DEV_SYNC_REGISTRY_VERSION) {
      return createEmptyRegistry();
    }

    return {
      editors: parsed.editors ?? {},
      games: parsed.games ?? {},
      version: DEV_SYNC_REGISTRY_VERSION
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyRegistry();
    }

    throw error;
  }
}

async function writeDevSyncRegistry(registry: DevSyncRegistry) {
  const tempPath = `${DEV_SYNC_REGISTRY_PATH}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(DEV_SYNC_REGISTRY_PATH), { recursive: true });
  await writeFile(tempPath, JSON.stringify(registry, null, 2), "utf8");
  await rename(tempPath, DEV_SYNC_REGISTRY_PATH);
}

function pruneDevSyncRegistry(registry: DevSyncRegistry) {
  const cutoff = Date.now() - DEV_SYNC_STALE_AFTER_MS;

  registry.editors = Object.fromEntries(
    Object.entries(registry.editors).filter(([, registration]) => registration.updatedAt >= cutoff)
  );
  registry.games = Object.fromEntries(
    Object.entries(registry.games).filter(([, registration]) => registration.updatedAt >= cutoff)
  );

  return registry;
}

function createEmptyRegistry(): DevSyncRegistry {
  return {
    editors: {},
    games: {},
    version: DEV_SYNC_REGISTRY_VERSION
  };
}
