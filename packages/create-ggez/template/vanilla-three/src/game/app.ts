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
import { frameCameraOnObject } from "./camera";
import { createDefaultGameplaySystems, createStarterGameplayHost, mergeGameplaySystems } from "./gameplay";
import { createRuntimePhysicsSession, type RuntimePhysicsSession } from "./runtime-physics";
import type { GameSceneBootstrapContext, GameSceneDefinition, GameSceneLifecycle } from "./scene-types";
import { StarterPlayerController } from "./starter-player-controller";

type GameAppOptions = {
  initialSceneId: string;
  root: HTMLDivElement;
  scenes: Record<string, GameSceneDefinition>;
};

type ActiveScene = {
  accumulatorSeconds: number;
  gameplayRuntime: GameplayRuntime;
  id: string;
  lifecycle: GameSceneLifecycle;
  player: StarterPlayerController | null;
  physicsWorld: CrashcatPhysicsWorld;
  runtimePhysics: RuntimePhysicsSession;
  runtimeScene: ThreeRuntimeSceneInstance;
};

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_CATCH_UP_SECONDS = FIXED_STEP_SECONDS * 4;

export function createGameApp(options: GameAppOptions) {
  options.root.innerHTML = `
    <div class="game-shell"></div>
  `;

  const shell = options.root.querySelector<HTMLDivElement>(".game-shell");

  if (!shell) {
    throw new Error("Failed to initialize game shell.");
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  shell.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
  const clock = new THREE.Clock();
  let activeScene: ActiveScene | undefined;
  let currentLoadToken = 0;
  let disposed = false;

  const setStatus = (_message: string) => {};

  const stepActiveScene = (deltaSeconds: number) => {
    if (!activeScene) {
      return;
    }

    activeScene.accumulatorSeconds = Math.min(
      activeScene.accumulatorSeconds + deltaSeconds,
      MAX_PHYSICS_CATCH_UP_SECONDS
    );

    while (activeScene.accumulatorSeconds >= FIXED_STEP_SECONDS) {
      activeScene.player?.updateBeforeStep(FIXED_STEP_SECONDS);
      activeScene.lifecycle.fixedUpdate?.(FIXED_STEP_SECONDS);
      stepCrashcatPhysicsWorld(activeScene.physicsWorld, FIXED_STEP_SECONDS);
      activeScene.runtimePhysics.syncVisuals();
      activeScene.player?.updateAfterStep(FIXED_STEP_SECONDS);
      activeScene.accumulatorSeconds -= FIXED_STEP_SECONDS;
    }
  };

  const renderFrame = () => {
    if (disposed) {
      return;
    }

    requestAnimationFrame(renderFrame);
    const delta = Math.min(clock.getDelta(), 0.1);
    stepActiveScene(delta);
    activeScene?.lifecycle.update?.(delta);
    activeScene?.gameplayRuntime.update(delta);
    renderer.render(scene, camera);
  };

  const disposeActiveScene = async () => {
    if (!activeScene) {
      return;
    }

    const sceneToDispose = activeScene;
    activeScene = undefined;
    scene.remove(sceneToDispose.runtimeScene.root);
    if (sceneToDispose.player) {
      scene.remove(sceneToDispose.player.object);
    }
    await sceneToDispose.lifecycle.dispose?.();
    sceneToDispose.player?.dispose();
    sceneToDispose.gameplayRuntime.dispose();
    sceneToDispose.runtimeScene.dispose();
    sceneToDispose.runtimePhysics.dispose();
  };

  const preloadScene = async (sceneId: string) => {
    const definition = options.scenes[sceneId];

    if (!definition) {
      throw new Error(`Unknown scene "${sceneId}".`);
    }

    if (definition.source.preload) {
      await definition.source.preload();
      return;
    }

    await definition.source.load();
  };

  const loadScene = async (sceneId: string) => {
    const definition = options.scenes[sceneId];

    if (!definition) {
      throw new Error(`Unknown scene "${sceneId}".`);
    }

    const loadToken = ++currentLoadToken;
    setStatus(`Loading ${definition.title}...`);

    try {
      await ensureCrashcatRuntimePhysics();
      const runtimeManifest = await definition.source.load();

      if (disposed || loadToken !== currentLoadToken) {
        return;
      }

      const runtimeScene = await createThreeRuntimeSceneInstance(runtimeManifest, {
        applyToScene: scene,
        resolveAssetUrl: ({ path }) => path
      });
      renderer.setClearColor(runtimeScene.scene.settings.world.fogColor || "#dfe8f2");
      const physicsWorld = createCrashcatPhysicsWorld(runtimeScene.scene.settings);
      const runtimePhysics = createRuntimePhysicsSession({
        runtimeScene,
        world: physicsWorld
      });
      const gameplayHost = createStarterGameplayHost({
        physicsWorld,
        runtimePhysics,
        runtimeScene
      });
      const bootstrapContext = createBootstrapContext({
        camera,
        gotoScene: loadScene,
        physicsWorld,
        preloadScene,
        renderer,
        runtimeScene,
        scene,
        sceneId,
        setStatus
      });
      const systems = resolveSceneSystems(definition, bootstrapContext);
      const gameplayRuntime = createGameplayRuntime({
        host: gameplayHost,
        scene: createGameplayRuntimeSceneFromRuntimeScene(runtimeScene.scene),
        systems
      });
      const player = createStarterPlayerController({
        camera,
        definition,
        domElement: renderer.domElement,
        gameplayRuntime,
        physicsWorld,
        runtimeScene
      });

      gameplayRuntime.start();
      scene.add(runtimeScene.root);
      if (player) {
        scene.add(player.object);
        player.updateAfterStep(FIXED_STEP_SECONDS);
      } else {
        frameCameraOnObject(camera, runtimeScene.root);
      }

      const mountedLifecycle = await definition.mount?.({
        camera,
        gameplayRuntime,
        gotoScene: loadScene,
        player,
        physicsWorld,
        preloadScene,
        renderer,
        runtimePhysics,
        runtimeScene,
        scene,
        sceneId,
        sceneSettings: runtimeScene.scene.settings,
        setStatus
      });
      const lifecycle: GameSceneLifecycle = mountedLifecycle ?? {};

      if (disposed || loadToken !== currentLoadToken) {
        scene.remove(runtimeScene.root);
        if (player) {
          scene.remove(player.object);
        }
        await lifecycle.dispose?.();
        player?.dispose();
        gameplayRuntime.dispose();
        runtimeScene.dispose();
        runtimePhysics.dispose();
        return;
      }

      const previousScene = activeScene;
      activeScene = {
        accumulatorSeconds: 0,
        gameplayRuntime,
        id: sceneId,
        lifecycle,
        player,
        physicsWorld,
        runtimePhysics,
        runtimeScene
      };

      if (previousScene) {
        scene.remove(previousScene.runtimeScene.root);
        if (previousScene.player) {
          scene.remove(previousScene.player.object);
        }
        await previousScene.lifecycle.dispose?.();
        previousScene.player?.dispose();
        previousScene.gameplayRuntime.dispose();
        previousScene.runtimeScene.dispose();
        previousScene.runtimePhysics.dispose();
      }

    } catch (error) {
      throw error;
    }
  };

  const start = () => loadScene(options.initialSceneId);

  const dispose = async () => {
    disposed = true;
    window.removeEventListener("resize", handleResize);
    await disposeActiveScene();
    renderer.dispose();
  };

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener("resize", handleResize);
  renderFrame();

  return {
    camera,
    dispose,
    initialSceneId: options.initialSceneId,
    loadScene,
    preloadScene,
    renderer,
    scene,
    start,
    setStatus
  };
}

function createBootstrapContext(options: {
  camera: THREE.PerspectiveCamera;
  gotoScene: (sceneId: string) => Promise<void>;
  physicsWorld: CrashcatPhysicsWorld;
  preloadScene: (sceneId: string) => Promise<void>;
  renderer: THREE.WebGLRenderer;
  runtimeScene: ThreeRuntimeSceneInstance;
  scene: THREE.Scene;
  sceneId: string;
  setStatus: (message: string) => void;
}): GameSceneBootstrapContext {
  return {
    camera: options.camera,
    gotoScene: options.gotoScene,
    physicsWorld: options.physicsWorld,
    preloadScene: options.preloadScene,
    renderer: options.renderer,
    runtimeScene: options.runtimeScene,
    scene: options.scene,
    sceneId: options.sceneId,
    sceneSettings: options.runtimeScene.scene.settings,
    setStatus: options.setStatus
  };
}

function createStarterPlayerController(options: {
  camera: THREE.PerspectiveCamera;
  definition: GameSceneDefinition;
  domElement: HTMLCanvasElement;
  gameplayRuntime: GameplayRuntime;
  physicsWorld: CrashcatPhysicsWorld;
  runtimeScene: ThreeRuntimeSceneInstance;
}) {
  if (options.definition.player === false) {
    return null;
  }

  const playerConfig = options.definition.player ?? {};
  const playerSpawn = options.runtimeScene.entities.find((entity) => {
    if (entity.type !== "player-spawn") {
      return false;
    }

    return playerConfig.spawnEntityId ? entity.id === playerConfig.spawnEntityId : true;
  });

  if (!playerSpawn) {
    return null;
  }

  return new StarterPlayerController({
    camera: options.camera,
    cameraMode: playerConfig.cameraMode ?? options.runtimeScene.scene.settings.player.cameraMode,
    domElement: options.domElement,
    gameplayRuntime: options.gameplayRuntime,
    sceneSettings: options.runtimeScene.scene.settings,
    spawn: {
      position: playerSpawn.transform.position,
      rotationY: playerSpawn.transform.rotation.y
    },
    world: options.physicsWorld
  });
}

function resolveSceneSystems(definition: GameSceneDefinition, context: GameSceneBootstrapContext): GameplayRuntimeSystemRegistration[] {
  const starterSystems = createDefaultGameplaySystems(context.sceneSettings);

  if (!definition.systems) {
    return starterSystems;
  }

  const sceneSystems = typeof definition.systems === "function" ? definition.systems(context) : definition.systems;
  return mergeGameplaySystems(starterSystems, sceneSystems);
}
