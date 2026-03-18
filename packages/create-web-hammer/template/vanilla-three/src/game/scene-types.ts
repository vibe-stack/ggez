import type { GameplayRuntime, GameplayRuntimeSystemRegistration } from "@web-hammer/gameplay-runtime";
import type { SceneSettings } from "@web-hammer/shared";
import type { RuntimeScene } from "@web-hammer/runtime-format";
import type { ThreeRuntimeSceneInstance } from "@web-hammer/three-runtime";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { StarterPlayerController } from "./starter-player-controller";
import type { RuntimePhysicsSession } from "./runtime-physics";

export type RuntimeSceneSource = {
  load: () => Promise<RuntimeScene>;
};

export type GameSceneLifecycle = {
  dispose?: () => Promise<void> | void;
  fixedUpdate?: (fixedDeltaSeconds: number) => void;
  update?: (deltaSeconds: number) => void;
};

export type GameSceneBootstrapContext = {
  camera: PerspectiveCamera;
  gotoScene: (sceneId: string) => Promise<void>;
  physicsWorld: RAPIER.World;
  renderer: WebGLRenderer;
  runtimeScene: ThreeRuntimeSceneInstance;
  scene: Scene;
  sceneId: string;
  sceneSettings: SceneSettings;
  setStatus: (message: string) => void;
};

export type GameScenePlayerConfig = {
  cameraMode?: SceneSettings["player"]["cameraMode"];
  enabled?: boolean;
  spawnEntityId?: string;
};

export type GameSceneModuleContext = GameSceneBootstrapContext & {
  gameplayRuntime: GameplayRuntime;
  player: StarterPlayerController | null;
  runtimePhysics: RuntimePhysicsSession;
};

export type GameSceneDefinition = {
  id: string;
  mount?: (context: GameSceneModuleContext) => Promise<GameSceneLifecycle | void> | GameSceneLifecycle | void;
  player?: false | GameScenePlayerConfig;
  source: RuntimeSceneSource;
  systems?:
    | GameplayRuntimeSystemRegistration[]
    | ((context: GameSceneBootstrapContext) => GameplayRuntimeSystemRegistration[]);
  title: string;
};
