import type { GameplayRuntime, GameplayRuntimeSystemRegistration } from "@ggez/gameplay-runtime";
import type { SceneSettings } from "@ggez/shared";
import type { RuntimeScene } from "@ggez/runtime-format";
import type { CrashcatPhysicsWorld } from "@ggez/runtime-physics-crashcat";
import type { ThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import type { PerspectiveCamera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { StarterPlayerController } from "./starter-player-controller";
import type { RuntimePhysicsSession } from "./runtime-physics";

export type RuntimeSceneSource = {
  load: () => Promise<RuntimeScene>;
  preload?: () => Promise<void>;
};

export type GameSceneLifecycle = {
  dispose?: () => Promise<void> | void;
  fixedUpdate?: (fixedDeltaSeconds: number) => void;
  update?: (deltaSeconds: number) => void;
};

export type GameSceneBootstrapContext = {
  camera: PerspectiveCamera;
  gotoScene: (sceneId: string) => Promise<void>;
  preloadScene: (sceneId: string) => Promise<void>;
  physicsWorld: CrashcatPhysicsWorld;
  renderer: WebGPURenderer;
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
