import type { GameplayRuntime } from "@web-hammer/gameplay-runtime";
import type { DerivedRenderScene } from "@web-hammer/render-pipeline";
import type { SceneSettings, Vec3 } from "@web-hammer/shared";
import type { WebHammerEngineScene } from "@web-hammer/three-runtime";

export type AssetPathResolver = (path: string) => Promise<string> | string;

export type PlaybackPhysicsState = "paused" | "running" | "stopped";

export type PlayerActor = {
  height?: number;
  id: string;
  position: Vec3;
  radius?: number;
  tags: string[];
};

export type EnabledSystemsState = {
  mover: boolean;
  openable: boolean;
  pathMover: boolean;
  sequence: boolean;
  trigger: boolean;
};

export type EnabledSystemKey = keyof EnabledSystemsState;

export type StageStats = {
  entities: number;
  lights: number;
  meshes: number;
  nodes: number;
};

export type SceneRuntimeConfig = {
  cameraMode: "fps" | "third-person" | "top-down";
  gameplayRuntime?: GameplayRuntime;
  physicsPlayback: PlaybackPhysicsState;
  renderScene: DerivedRenderScene;
  resolveAssetPath: AssetPathResolver;
  scene: WebHammerEngineScene;
  sceneSettings: SceneSettings;
};
