/**
 * Scene type definitions
 *
 * These are the public contracts that game scene files work against. Keeping
 * them here (rather than scattered across app.ts) means scene code never needs
 * to import framework internals.
 */

import type { GameplayRuntime, GameplayRuntimeSystemRegistration } from "@ggez/gameplay-runtime";
import type { RuntimeScene } from "@ggez/runtime-format";
import type { SceneSettings } from "@ggez/shared";
import type { CrashcatPhysicsWorld } from "@ggez/runtime-physics-crashcat";
import type { ThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import type { Group, PerspectiveCamera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { CameraMode } from "../camera";
import type { RuntimePhysicsSession } from "../physics/session";

// ------------------------------------------------------------------
// Runtime scene loading

export type RuntimeSceneSource = {
  load: () => Promise<RuntimeScene>;
  preload?: () => Promise<void>;
};

// ------------------------------------------------------------------
// Player

/**
 * Public interface for a player controller.
 *
 * Reference this type in your scene code rather than importing
 * StarterPlayerController directly. This lets you swap in a custom controller
 * (or no controller) without touching your scene definitions.
 */
export interface PlayerController {
  readonly object: Group;
  /** Change the camera mode at runtime (e.g. cutscene → gameplay). */
  setCameraMode(mode: CameraMode): void;
  /** Give the pointer back to the OS (e.g. when opening a menu). */
  releasePointerLock(): void;
  dispose(): void;
}

export type PlayerConfig = {
  /**
   * Override the camera mode set in the scene file.
   * Defaults to the value exported by the runtime scene.
   */
  cameraMode?: CameraMode;
  /**
   * Pick a specific player-spawn entity by id.
   * Defaults to the first spawn found in the scene.
   */
  spawnEntityId?: string;
};

// ------------------------------------------------------------------
// Scene lifecycle

export type GameSceneLifecycle = {
  /** Called when navigating away from this scene. Await async clean-up here. */
  dispose?: () => Promise<void> | void;
  /** Called at a fixed 60 Hz rate, after physics. Use for deterministic logic. */
  fixedUpdate?: (fixedDeltaSeconds: number) => void;
  /** Called every animation frame. Use for animations, UI, audio. */
  update?: (deltaSeconds: number) => void;
};

// ------------------------------------------------------------------
// Context types

/**
 * Available when resolving scene systems (before gameplay runtime creation).
 * All fields except gameplayRuntime / player / runtimePhysics are present here.
 */
export type GameSceneLoaderContext = {
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

/**
 * Full context available inside mount(). Extends GameSceneLoaderContext with
 * the gameplay runtime, physics session and (optionally) the player controller.
 */
export type GameSceneContext = GameSceneLoaderContext & {
  gameplayRuntime: GameplayRuntime;
  player: PlayerController | null;
  runtimePhysics: RuntimePhysicsSession;
};

// ------------------------------------------------------------------
// Scene definition

export type GameSceneDefinition = {
  /** Unique scene id — must match the folder name under src/scenes/<id>/. */
  id: string;
  title: string;
  source: RuntimeSceneSource;
  /**
   * Player controller configuration.
   * - Omit or pass `{}` to use defaults from the scene file.
   * - Pass `false` to disable the built-in controller entirely.
   */
  player?: false | PlayerConfig;
  /**
   * Gameplay systems to register. These are merged with (and can override) the
   * default starter systems; later entries with the same id win.
   *
   * Pass a factory function to receive the GameSceneLoaderContext if your
   * system needs scene-specific data (e.g. the physics world or runtimeScene).
   */
  systems?:
    | GameplayRuntimeSystemRegistration[]
    | ((context: GameSceneLoaderContext) => GameplayRuntimeSystemRegistration[]);
  /**
   * Called after the scene and player controller are ready.
   * Return a GameSceneLifecycle to hook into the game loop.
   */
  mount?: (
    context: GameSceneContext
  ) => Promise<GameSceneLifecycle | void> | GameSceneLifecycle | void;
};
