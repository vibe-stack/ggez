/**
 * createGameApp
 *
 * Bootstraps the renderer, shared scene graph, input, and game loop, then
 * manages the lifecycle of individual game scenes. Key design decisions:
 *
 *  - InputManager is created once and shared across all scenes.
 *  - GameLoop drives fixed-step physics and variable-rate camera/render.
 *  - Camera and player controller are decoupled — swap camera mode at runtime
 *    via player.setCameraMode() without rebuilding the player.
 *  - setStatus() renders a visible overlay so users know what's loading.
 *  - Scene transitions are guarded by a load token so stale async results
 *    from navigating away mid-load never contaminate the live scene.
 */

import {
  createGameplayRuntime,
  createGameplayRuntimeSceneFromRuntimeScene,
  type GameplayRuntime,
  type GameplayRuntimeSystemRegistration
} from "@ggez/gameplay-runtime";
import {
  createCrashcatPhysicsWorld,
  ensureCrashcatRuntimePhysics,
  stepCrashcatPhysicsWorld,
  type CrashcatPhysicsWorld
} from "@ggez/runtime-physics-crashcat";
import { createThreeRuntimeSceneInstance, type ThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { createCameraController, frameCameraOnObject } from "./camera";
import { createDefaultGameplaySystems, createStarterGameplayHost, mergeGameplaySystems } from "./gameplay";
import { GameLoop, FIXED_STEP_SECONDS } from "./loop";
import { InputManager } from "./input";
import { createRuntimePhysicsSession, type RuntimePhysicsSession } from "./physics";
import type {
  GameSceneContext,
  GameSceneDefinition,
  GameSceneLifecycle,
  GameSceneLoaderContext,
  PlayerController
} from "./scene";
import { StarterPlayerController } from "./player";

// ------------------------------------------------------------------
// Types

type GameAppOptions = {
  initialSceneId: string;
  root: HTMLDivElement;
  scenes: Record<string, GameSceneDefinition>;
};

type SceneBundle = {
  gameplayRuntime: GameplayRuntime;
  id: string;
  lifecycle: GameSceneLifecycle;
  player: StarterPlayerController | null;
  physicsWorld: CrashcatPhysicsWorld;
  runtimePhysics: RuntimePhysicsSession;
  runtimeScene: ThreeRuntimeSceneInstance;
};

// ------------------------------------------------------------------

export async function createGameApp(options: GameAppOptions) {
  // DOM shell
  options.root.innerHTML = `
    <div class="game-shell">
      <div class="game-status" data-game-status hidden></div>
    </div>
  `;

  const shell = options.root.querySelector<HTMLDivElement>(".game-shell");
  const statusEl = options.root.querySelector<HTMLDivElement>("[data-game-status]");

  if (!shell || !statusEl) {
    throw new Error("Failed to initialise game shell.");
  }

  // Renderer
  const renderer = new WebGPURenderer({ antialias: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  shell.append(renderer.domElement);

  // Shared Three.js objects
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);

  // Shared systems
  const input = new InputManager();
  input.mount(renderer.domElement);

  // State
  let activeBundle: SceneBundle | undefined;
  let loadToken = 0;
  let disposed = false;

  // ------------------------------------------------------------------
  // Status overlay

  const setStatus = (message: string) => {
    statusEl.hidden = message.length === 0;
    statusEl.textContent = message;
  };

  // ------------------------------------------------------------------
  // Fixed-step helpers

  const runFixedStep = () => {
    if (!activeBundle) return;
    activeBundle.player?.updateBeforeStep(FIXED_STEP_SECONDS);
    activeBundle.lifecycle.fixedUpdate?.(FIXED_STEP_SECONDS);
    stepCrashcatPhysicsWorld(activeBundle.physicsWorld, FIXED_STEP_SECONDS);
    activeBundle.runtimePhysics.syncVisuals();
    activeBundle.player?.updateAfterStep(FIXED_STEP_SECONDS);
  };

  // ------------------------------------------------------------------
  // Game loop

  const loop = new GameLoop({
    onFixedUpdate: (_dt) => {
      runFixedStep();
    },
    onUpdate: (dt) => {
      activeBundle?.lifecycle.update?.(dt);
      activeBundle?.gameplayRuntime.update(dt);
      // Camera is updated at variable rate for smooth motion at high refresh rates.
      activeBundle?.player?.updateCamera(dt);
    },
    onRender: () => {
      renderer.render(scene, camera);
    }
  });

  // ------------------------------------------------------------------
  // Scene disposal helper — used both on navigation and on stale loads

  const disposeBundle = async (bundle: SceneBundle) => {
    scene.remove(bundle.runtimeScene.root);

    if (bundle.player) {
      scene.remove(bundle.player.object);
    }

    await bundle.lifecycle.dispose?.();
    bundle.player?.dispose();
    bundle.gameplayRuntime.dispose();
    bundle.runtimeScene.dispose();
    bundle.runtimePhysics.dispose();
  };

  // ------------------------------------------------------------------
  // Scene navigation

  const preloadScene = async (sceneId: string) => {
    const definition = options.scenes[sceneId];

    if (!definition) {
      throw new Error(`Unknown scene "${sceneId}".`);
    }

    if (definition.source.preload) {
      await definition.source.preload();
    } else {
      await definition.source.load();
    }
  };

  const loadScene = async (sceneId: string) => {
    const definition = options.scenes[sceneId];

    if (!definition) {
      throw new Error(`Unknown scene "${sceneId}".`);
    }

    const token = ++loadToken;
    setStatus(`Loading ${definition.title}…`);

    try {
      await ensureCrashcatRuntimePhysics();
      const runtimeManifest = await definition.source.load();

      if (disposed || token !== loadToken) return;

      // Build scene-level objects
      const runtimeScene = await createThreeRuntimeSceneInstance(runtimeManifest, {
        applyToScene: scene,
        resolveAssetUrl: ({ path }) => path
      });

      if (disposed || token !== loadToken) {
        runtimeScene.dispose();
        return;
      }

      renderer.setClearColor(runtimeScene.scene.settings.world.fogColor || "#dfe8f2");

      const physicsWorld = createCrashcatPhysicsWorld(runtimeScene.scene.settings);
      const runtimePhysics = createRuntimePhysicsSession({ runtimeScene, world: physicsWorld });
      const gameplayHost = createStarterGameplayHost({ physicsWorld, runtimePhysics, runtimeScene });

      // Build loader context (available to systems factory)
      const loaderContext: GameSceneLoaderContext = {
        camera,
        gotoScene: loadScene,
        physicsWorld,
        preloadScene,
        renderer,
        runtimeScene,
        scene,
        sceneId,
        sceneSettings: runtimeScene.scene.settings,
        setStatus
      };

      const systems = resolveSceneSystems(definition, loaderContext);
      const gameplayRuntime = createGameplayRuntime({
        host: gameplayHost,
        scene: createGameplayRuntimeSceneFromRuntimeScene(runtimeScene.scene),
        systems
      });

      const player = buildStarterPlayer({
        camera,
        definition,
        gameplayRuntime,
        input,
        physicsWorld,
        runtimeScene
      });

      gameplayRuntime.start();

      // Full context — available to mount()
      const fullContext: GameSceneContext = {
        ...loaderContext,
        gameplayRuntime,
        player,
        runtimePhysics
      };

      // mount() is awaited before we commit the scene to activeBundle.
      // This prevents UI or actor setup from racing against scene teardown.
      const mountResult = await definition.mount?.(fullContext);

      if (disposed || token !== loadToken) {
        // Another loadScene() won the race — clean up what we just built.
        scene.remove(runtimeScene.root);
        if (player) scene.remove(player.object);
        await mountResult?.dispose?.();
        player?.dispose();
        gameplayRuntime.dispose();
        runtimeScene.dispose();
        runtimePhysics.dispose();
        return;
      }

      const lifecycle: GameSceneLifecycle = mountResult ?? {};

      // Tear down the previous scene only after the new one is fully ready.
      const previous = activeBundle;

      // Add new scene to the Three graph and expose it.
      scene.add(runtimeScene.root);

      if (player) {
        scene.add(player.object);
        player.updateAfterStep(FIXED_STEP_SECONDS);
      } else {
        frameCameraOnObject(camera, runtimeScene.root);
      }

      activeBundle = { gameplayRuntime, id: sceneId, lifecycle, player, physicsWorld, runtimePhysics, runtimeScene };

      if (previous) {
        await disposeBundle(previous);
      }

      setStatus("");
    } catch (error) {
      if (token === loadToken && !disposed) {
        setStatus(`Failed to load "${definition.title}".`);
      }

      throw error;
    }
  };

  // ------------------------------------------------------------------
  // Resize

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener("resize", handleResize);

  // ------------------------------------------------------------------
  // Public API

  const start = async () => {
    loop.start();
    await loadScene(options.initialSceneId);
  };

  const dispose = async () => {
    disposed = true;
    loop.dispose();
    input.dispose();
    window.removeEventListener("resize", handleResize);

    if (activeBundle) {
      await disposeBundle(activeBundle);
      activeBundle = undefined;
    }

    renderer.dispose();
  };

  return {
    /** Loaded Three.js camera — safe to read, avoid replacing. */
    camera,
    dispose,
    initialSceneId: options.initialSceneId,
    /** Navigate to a scene by its id. Returns when the scene is fully loaded. */
    loadScene,
    /** Prefetch scene assets without activating the scene. */
    preloadScene,
    /** Shared InputManager. Gives access to key state outside of a player controller. */
    input,
    /** The game loop — pause/resume for menus or cutscenes. */
    loop,
    /** WebGPU renderer. */
    renderer,
    /** Root Three.js scene. */
    scene,
    /** Update the loading status overlay. Pass "" to hide it. */
    setStatus,
    /** Begin the game loop and load the initial scene. */
    start
  };
}

// ------------------------------------------------------------------
// Internal helpers

function resolveSceneSystems(
  definition: GameSceneDefinition,
  context: GameSceneLoaderContext
): GameplayRuntimeSystemRegistration[] {
  const defaults = createDefaultGameplaySystems(context.sceneSettings);

  if (!definition.systems) {
    return defaults;
  }

  const sceneSystems =
    typeof definition.systems === "function" ? definition.systems(context) : definition.systems;

  return mergeGameplaySystems(defaults, sceneSystems);
}

function buildStarterPlayer(options: {
  camera: THREE.PerspectiveCamera;
  definition: GameSceneDefinition;
  gameplayRuntime: GameplayRuntime;
  input: InputManager;
  physicsWorld: CrashcatPhysicsWorld;
  runtimeScene: ThreeRuntimeSceneInstance;
}): StarterPlayerController | null {
  if (options.definition.player === false) {
    return null;
  }

  const playerConfig = options.definition.player ?? {};
  const spawnEntity = options.runtimeScene.entities.find((e) => {
    if (e.type !== "player-spawn") return false;
    return playerConfig.spawnEntityId ? e.id === playerConfig.spawnEntityId : true;
  });

  if (!spawnEntity) {
    return null;
  }

  const mode =
    playerConfig.cameraMode ?? options.runtimeScene.scene.settings.player.cameraMode;
  const cameraController = createCameraController(mode, options.camera);

  return new StarterPlayerController({
    camera: cameraController,
    gameplayRuntime: options.gameplayRuntime,
    input: options.input,
    sceneSettings: options.runtimeScene.scene.settings,
    spawn: {
      position: spawnEntity.transform.position,
      rotationY: spawnEntity.transform.rotation.y
    },
    threeCamera: options.camera,
    world: options.physicsWorld
  });
}

// Re-export the definition helper so scene files don't need to import runtime-scene-sources.
export type { GameSceneDefinition, GameSceneContext, GameSceneLifecycle, PlayerController };

import {
  createCrashcatPhysicsWorld,
  ensureCrashcatRuntimePhysics,
  stepCrashcatPhysicsWorld,
  type CrashcatPhysicsWorld
} from "@ggez/runtime-physics-crashcat";
import { createThreeRuntimeSceneInstance, type ThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
