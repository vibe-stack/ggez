export const DEV_SYNC_REGISTRY_VERSION = 1 as const;
export const DEV_SYNC_STALE_AFTER_MS = 8000;

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

type DevSyncRegistrationBase = {
  id: string;
  name: string;
  pid: number;
  projectRoot: string;
  updatedAt: number;
  url: string;
};

export type DevSyncEditorRegistration = DevSyncRegistrationBase & {
  kind: "editor";
};

export type DevSyncGameRegistration = DevSyncRegistrationBase & {
  kind: "game";
  currentCommand?: DevSyncCommand;
  sceneIds: string[];
  sceneRoot: string;
};

export type DevSyncRegistry = {
  editors: Record<string, DevSyncEditorRegistration>;
  games: Record<string, DevSyncGameRegistration>;
  version: typeof DEV_SYNC_REGISTRY_VERSION;
};

export function slugifyProjectName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled-scene";
}

export function prettifyProjectSlug(value: string) {
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
