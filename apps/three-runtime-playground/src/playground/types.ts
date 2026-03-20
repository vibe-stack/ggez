import type { RefObject } from "react";

export type PlaygroundPhysicsPlayback = "paused" | "running" | "stopped";

export type EnabledSystemsState = {
  audio: boolean;
  mover: boolean;
  openable: boolean;
  pathMover: boolean;
  sequence: boolean;
  trigger: boolean;
};

export type EnabledSystemKey = keyof EnabledSystemsState;

export type ToolbarAction = {
  active?: boolean;
  icon?: "import" | "pause" | "play" | "stop";
  label: string;
  onClick: () => void;
  tone?: "default" | "primary";
};

export type StageStats = {
  entities: number;
  lights: number;
  meshes: number;
  nodes: number;
};

export type PlaygroundControls = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileSelected: (file: File) => void;
  toolbarActions: ToolbarAction[];
};

export type PanelSection = {
  eventLog: string[];
  playbackLabel: "Pause" | "Play";
  onToggleSystem: (key: EnabledSystemKey, enabled: boolean) => void;
  status: string;
  systemState: EnabledSystemsState;
};
