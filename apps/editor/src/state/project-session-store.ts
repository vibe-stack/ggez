import { proxy } from "valtio";

export const RUNTIME_SYNC_DEBUG_FINGERPRINT = "sync-ui 2026-04-13e";

type ProjectSessionState = {
  draftHydrated: boolean;
  projectName: string;
  projectSlug: string;
  projectSlugDirty: boolean;
  runtimeSyncDebugLabel: string;
};

function createInitialProjectSessionState(): ProjectSessionState {
  return {
    draftHydrated: false,
    projectName: "Untitled Scene",
    projectSlug: "untitled-scene",
    projectSlugDirty: false,
    runtimeSyncDebugLabel: `${RUNTIME_SYNC_DEBUG_FINGERPRINT} idle`
  };
}

export const projectSessionStore = proxy<ProjectSessionState>(createInitialProjectSessionState());

export function resetProjectSessionStore() {
  Object.assign(projectSessionStore, createInitialProjectSessionState());
}
