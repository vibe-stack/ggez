export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";
export type RuntimeStatus = "stopped" | "starting" | "running" | "error";
export type ViewId = "trident" | "animation-studio" | "game";
export type DockMode = ViewId | "settings" | "welcome";

export type RuntimeSnapshot = {
  commandLabel: string;
  currentSceneId: string | null;
  cwd: string;
  lastError: string | null;
  logLines: string[];
  port: number;
  sceneIds: string[];
  startedAt: number | null;
  status: RuntimeStatus;
  url: string;
};

export type EditorSnapshot = RuntimeSnapshot & {
  id: ViewId;
  label: string;
};

export type ProjectSnapshot = {
  createdAt: number;
  hasGameDevSupport: boolean;
  id: string;
  isSelected: boolean;
  name: string;
  packageManager: PackageManager;
  preferredPort: number | null;
  projectRoot: string;
  runtime: RuntimeSnapshot;
  source: "created" | "existing";
  updatedAt: number;
};

export type OrchestratorSnapshot = {
  activeProjectId: string | null;
  activeView: ViewId;
  editors: EditorSnapshot[];
  projects: ProjectSnapshot[];
  storagePath: string;
  viewport: {
    label: string;
    subtitle: string;
    url: string | null;
    view: ViewId;
  };
};

export type Notice = {
  kind: "error" | "success";
  text: string;
};

export const PACKAGE_MANAGER_OPTIONS: PackageManager[] = ["bun", "npm", "pnpm", "yarn"];
