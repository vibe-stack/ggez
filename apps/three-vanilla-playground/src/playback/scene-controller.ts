import RAPIER from "@dimforge/rapier3d-compat";
import {
  createDynamicRigidBody,
  createRapierPhysicsWorld,
  createStaticRigidBody,
  ensureRapierRuntimePhysics
} from "@ggez/runtime-physics-rapier";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Clock,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
  LOD,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterialParameters,
  type Side
} from "three";
import {
  applyWebHammerWorldSettings,
  clearWebHammerWorldSettings,
  createWebHammerSceneObjectFactory,
  type WebHammerEngineModelNode,
  type WebHammerEngineGeometryNode,
  type WebHammerEngineNode,
  type WebHammerExportGeometry,
  type WebHammerExportMaterial
} from "@ggez/three-runtime";
import { createBlockoutTextureDataUri, resolveSceneGraph, resolveTransformPivot, vec3, type Asset, type MaterialRenderSide } from "@ggez/shared";
import type { DerivedLight, DerivedRenderMesh } from "@ggez/render-pipeline";
import type { PlaybackGameplayHost } from "../gameplay-host";
import type { AssetPathResolver, PlayerActor, SceneRuntimeConfig } from "../types";

type SceneControllerOptions = {
  host: PlaybackGameplayHost;
  onError?: (message: string | undefined) => void;
  onPlayerActorChange?: (actor: PlayerActor | null) => void;
};

type RuntimeNodeObject = {
  cleanup?: () => void;
  nodeId: string;
  object: Object3D;
};

type DynamicBodyBinding = {
  body: RAPIER.RigidBody;
  nodeId: string;
  object: Object3D;
};

type VanillaDebugEvent = {
  label: string;
  payload: unknown;
  timestamp: string;
};

type VanillaDebugStore = {
  enabled: boolean;
  events: VanillaDebugEvent[];
  lastFrame?: unknown;
};

const previewTextureCache = new Map<string, Texture>();
const modelSceneCache = new Map<string, Object3D>();
const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const textureLoader = new TextureLoader();
const modelTextureLoader = new TextureLoader();
const FIXED_PHYSICS_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_CATCH_UP_STEPS = 5;
const PLAYGROUND_MID_LOD_DISTANCE = 100;
const PLAYGROUND_LOW_LOD_DISTANCE = 130;
const PLAYER_GROUND_PROBE_HEIGHT = 0.08;
const PLAYER_GROUND_PROBE_DISTANCE = 0.16;
const PLAYER_JUMP_GROUND_LOCK_SECONDS = 0.12;
const PLAYER_GROUND_MIN_NORMAL_Y = 0.6;
const scratchBounds = new Box3();
const scratchCenter = new Vector3();
const scratchSize = new Vector3();
const scratchFitPosition = new Vector3();
const scratchLookTarget = new Vector3();
const VANILLA_DEBUG_PREFIX = "[three-vanilla-debug]";

let rapierReady: Promise<void> | undefined;

function getVanillaDebugStore() {
  const debugGlobal = globalThis as typeof globalThis & { __WEB_HAMMER_VANILLA_DEBUG__?: VanillaDebugStore };

  debugGlobal.__WEB_HAMMER_VANILLA_DEBUG__ ??= {
    enabled: true,
    events: []
  };

  return debugGlobal.__WEB_HAMMER_VANILLA_DEBUG__;
}

function publishVanillaDebug(label: string, payload: unknown) {
  const store = getVanillaDebugStore();

  if (!store.enabled) {
    return;
  }

  const event: VanillaDebugEvent = {
    label,
    payload,
    timestamp: new Date().toISOString()
  };

  store.events = [event, ...store.events].slice(0, 80);

  if (label === "frame") {
    store.lastFrame = payload;
  }

  console.debug(VANILLA_DEBUG_PREFIX, label, payload);
}

export class PlaybackSceneController {
  private readonly camera = new PerspectiveCamera(60, 1, 0.1, 2000);
  private readonly clock = new Clock();
  private readonly container: HTMLElement;
  private readonly controls: OrbitControls;
  private readonly dynamicMeshRoot = new Group();
  private readonly lightRoot = new Group();
  private readonly options: SceneControllerOptions;
  private readonly renderer = new WebGLRenderer({ antialias: true, alpha: false });
  private readonly resizeObserver: ResizeObserver;
  private readonly scene = new Scene();
  private readonly staticMeshRoot = new Group();
  private readonly worldRoot = new Group();

  private ambientLight?: AmbientLight;
  private autoFitEnabled = true;
  private config?: SceneRuntimeConfig;
  private dynamicBodies: DynamicBodyBinding[] = [];
  private fitFramesRemaining = 90;
  private frameHandle = 0;
  private debugFrameCooldown = 0;
  private loadVersion = 0;
  private physicsAccumulator = 0;
  private player?: RuntimePlayerController;
  private sceneError?: string;
  private staticBodies: Array<{ body: RAPIER.RigidBody; nodeId: string }> = [];
  private staticObjects: RuntimeNodeObject[] = [];
  private lightObjects: RuntimeNodeObject[] = [];
  private world?: RAPIER.World;

  constructor(container: HTMLElement, options: SceneControllerOptions) {
    this.container = container;
    this.options = options;
    this.camera.position.set(18, 12, 18);
    this.scene.add(this.worldRoot);
    this.worldRoot.add(this.staticMeshRoot);
    this.worldRoot.add(this.dynamicMeshRoot);
    this.worldRoot.add(this.lightRoot);

    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor("#0b1015");
    this.renderer.domElement.className = "h-full w-full";
    this.container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1.8, 0);
    this.controls.addEventListener("start", this.handleControlsStart);

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
    this.resize();
    this.frameHandle = window.requestAnimationFrame(this.renderFrame);
  }

  async load(config: SceneRuntimeConfig) {
    const version = ++this.loadVersion;
    this.sceneError = undefined;
    this.options.onError?.(undefined);
    this.config = config;
    this.controls.enabled = config.physicsPlayback === "stopped";
    this.autoFitEnabled = config.physicsPlayback === "stopped";
    this.fitFramesRemaining = config.physicsPlayback === "stopped" ? 90 : 0;

    this.disposeRuntimeBindings();
    this.clearScene();
    await this.applyWorldSettings(config);

    if (version !== this.loadVersion) {
      return;
    }

    this.ambientLight = createWorldAmbientLight(config.scene.settings.world.ambientColor, config.scene.settings.world.ambientIntensity);

    if (this.ambientLight) {
      this.lightRoot.add(this.ambientLight);
    }

    const physicsActive = config.physicsPlayback !== "stopped" && config.sceneSettings.world.physicsEnabled;
    const sceneGraph = resolveSceneGraph(config.scene.nodes, config.scene.entities);
    const objectFactory = createWebHammerSceneObjectFactory(config.scene, {
      lod: {
        lowDistance: PLAYGROUND_LOW_LOD_DISTANCE,
        midDistance: PLAYGROUND_MID_LOD_DISTANCE
      },
      resolveAssetUrl: ({ path }) => config.resolveAssetPath(path)
    });
    const physicsMeshes = physicsActive ? config.renderScene.meshes.filter((mesh) => mesh.physics?.enabled) : [];
    const physicsMeshIds = new Set(physicsMeshes.map((mesh) => mesh.nodeId));
    const staticMeshes = physicsActive
      ? config.renderScene.meshes.filter((mesh) => !physicsMeshes.some((candidate) => candidate.nodeId === mesh.nodeId))
      : config.renderScene.meshes;
    const staticNodeEntries = config.scene.nodes.filter(
      (node) =>
        node.kind !== "group" &&
        node.kind !== "instancing" &&
        node.kind !== "light" &&
        !physicsMeshIds.has(node.id)
    );

    const staticObjects = await Promise.all(
      staticNodeEntries.map(async (node) => ({
        nodeId: node.id,
        object: await objectFactory.createNodeObject(node, {
          transform: sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform
        })
      }))
    );

    if (version !== this.loadVersion) {
      return;
    }

    staticObjects.forEach((created) => {
      this.staticMeshRoot.add(created.object);
      this.options.host.bindNodeObject(created.nodeId, created.object);
      this.staticObjects.push({
        nodeId: created.nodeId,
        object: created.object
      });
    });

    const instancingObjects = await objectFactory.createInstancingObjects();

    if (version !== this.loadVersion) {
      return;
    }

    instancingObjects.forEach((object, index) => {
      this.staticMeshRoot.add(object);
      this.staticObjects.push({
        nodeId: `instancing:${index}`,
        object
      });
    });

    if (physicsActive) {
      await this.createPhysicsScene(config, sceneGraph, objectFactory, staticMeshes, physicsMeshes, version);
    }

    if (version !== this.loadVersion) {
      return;
    }

    const lightObjects = await Promise.all(
      config.scene.nodes
        .filter((node): node is Extract<WebHammerEngineNode, { kind: "light" }> => node.kind === "light")
        .map(async (node) => ({
          nodeId: node.id,
          object: await objectFactory.createNodeObject(node, {
            transform: sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform
          })
        }))
    );

    if (version !== this.loadVersion) {
      return;
    }

    lightObjects.forEach((created) => {
      this.lightRoot.add(created.object);
      this.options.host.bindNodeObject(created.nodeId, created.object);
      this.lightObjects.push(created);
    });
  }

  setPlaybackState(nextPlayback: SceneRuntimeConfig["physicsPlayback"]) {
    if (!this.config) {
      return;
    }

    this.config = {
      ...this.config,
      physicsPlayback: nextPlayback
    };
    this.controls.enabled = nextPlayback === "stopped";
    this.autoFitEnabled = nextPlayback === "stopped";
    this.fitFramesRemaining = nextPlayback === "stopped" ? 90 : 0;
    this.physicsAccumulator = 0;

    if (nextPlayback !== "running") {
      this.player?.releasePointerLock();
    }
  }

  dispose() {
    window.cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("start", this.handleControlsStart);
    this.controls.dispose();
    this.disposeRuntimeBindings();
    this.clearScene();
    clearWebHammerWorldSettings(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private async applyWorldSettings(config: SceneRuntimeConfig) {
    this.scene.background = new Color(config.sceneSettings.world.fogColor);

    try {
      await applyWebHammerWorldSettings(
        this.scene,
        { settings: config.sceneSettings },
        {
          resolveAssetUrl: ({ path }) => config.resolveAssetPath(path)
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply world settings.";
      this.sceneError = message;
      this.options.onError?.(message);
    }
  }

  private clearScene() {
    clearGroup(this.staticMeshRoot);
    clearGroup(this.dynamicMeshRoot);
    clearGroup(this.lightRoot);
    this.ambientLight = undefined;
  }

  private async createPhysicsScene(
    config: SceneRuntimeConfig,
    sceneGraph: ReturnType<typeof resolveSceneGraph>,
    objectFactory: ReturnType<typeof createWebHammerSceneObjectFactory>,
    staticMeshes: DerivedRenderMesh[],
    physicsMeshes: DerivedRenderMesh[],
    version: number
  ) {
    await ensureRapierReady();

    if (version !== this.loadVersion || !this.config) {
      return;
    }

    this.world = createRapierPhysicsWorld(config.sceneSettings);
    staticMeshes.forEach((mesh) => {
      const body = createStaticRigidBody(this.world!, mesh);
      this.staticBodies.push({ body, nodeId: mesh.nodeId });
      this.options.host.bindNodePhysicsBody(mesh.nodeId, body);
    });

    const dynamicObjects = await Promise.all(
      physicsMeshes.map(async (mesh) => {
        const node = config.scene.nodes.find((candidate) => candidate.id === mesh.nodeId);

        if (!node) {
          return undefined;
        }

        return {
          nodeId: mesh.nodeId,
          object: await objectFactory.createNodeObject(node, {
            transform: sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform
          })
        };
      })
    );

    if (version !== this.loadVersion || !this.world) {
      return;
    }

    dynamicObjects.forEach((created, index) => {
      const mesh = physicsMeshes[index];

      if (!created) {
        return;
      }

      const body = createDynamicRigidBody(this.world!, mesh);
      this.dynamicMeshRoot.add(created.object);
      this.dynamicBodies.push({
        body,
        nodeId: created.nodeId,
        object: created.object
      });
      this.options.host.bindNodePhysicsBody(created.nodeId, body);
      created.object.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
      created.object.rotation.set(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
      created.object.scale.set(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    });

    const playerSpawn = config.renderScene.entityMarkers.find((entity) => entity.entityType === "player-spawn");

    if (playerSpawn && this.world) {
      this.player = new RuntimePlayerController({
        camera: this.camera,
        cameraMode: config.cameraMode,
        domElement: this.renderer.domElement,
        onActorChange: this.options.onPlayerActorChange,
        onInteract: () => {
          if (!config.gameplayRuntime) {
            return;
          }

          config.gameplayRuntime.getHookTargetsByType("interactable")
            .filter((t) => t.hook.enabled !== false)
            .forEach((t) => {
              config.gameplayRuntime!.emitEvent({
                event: "interact.requested",
                sourceId: "player",
                sourceKind: "system",
                targetId: t.targetId
              });
            });
        },
        sceneSettings: config.sceneSettings,
        spawnPosition: vec3(playerSpawn.position.x, playerSpawn.position.y, playerSpawn.position.z),
        spawnRotationY: playerSpawn.rotation.y,
        world: this.world
      });
      this.dynamicMeshRoot.add(this.player.object);
    }

    publishVanillaDebug("scene-load", {
      gravity: config.sceneSettings.world.gravity,
      physicsPlayback: config.physicsPlayback,
      player: config.sceneSettings.player,
      playerSpawn: playerSpawn
        ? {
            position: playerSpawn.position,
            rotationY: playerSpawn.rotation.y
          }
        : null,
      staticMeshCount: staticMeshes.length,
      physicsMeshCount: physicsMeshes.length
    });
  }

  private disposeRuntimeBindings() {
    this.player?.dispose();
    this.player = undefined;

    this.dynamicBodies.forEach(({ nodeId, object }) => {
      this.options.host.bindNodePhysicsBody(nodeId, null);
      disposeCreatedObject({ object });
    });
    this.dynamicBodies = [];

    this.staticBodies.forEach(({ nodeId }) => {
      this.options.host.bindNodePhysicsBody(nodeId, null);
    });
    this.staticBodies = [];
    this.world = undefined;
    this.physicsAccumulator = 0;

    this.staticObjects.forEach((entry) => {
      this.options.host.bindNodeObject(entry.nodeId, null);
      entry.cleanup?.();
    });
    this.staticObjects = [];

    this.lightObjects.forEach((entry) => {
      this.options.host.bindNodeObject(entry.nodeId, null);
    });
    this.lightObjects = [];
  }

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * 0.75);
    this.renderer.setSize(width, height, false);
  }

  private readonly handleControlsStart = () => {
    this.autoFitEnabled = false;
    this.fitFramesRemaining = 0;
  };

  private readonly renderFrame = () => {
    this.frameHandle = window.requestAnimationFrame(this.renderFrame);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const config = this.config;
    let stepsThisFrame = 0;

    if (config?.gameplayRuntime) {
      config.gameplayRuntime.update(delta);
    }

    if (this.world) {
      if (config?.physicsPlayback === "running") {
        this.physicsAccumulator = Math.min(
          this.physicsAccumulator + delta,
          FIXED_PHYSICS_STEP_SECONDS * MAX_PHYSICS_CATCH_UP_STEPS
        );

        while (this.physicsAccumulator >= FIXED_PHYSICS_STEP_SECONDS) {
          this.player?.updateBeforeStep(FIXED_PHYSICS_STEP_SECONDS);
          this.world.timestep = FIXED_PHYSICS_STEP_SECONDS;
          this.world.step();
          this.physicsAccumulator -= FIXED_PHYSICS_STEP_SECONDS;
          stepsThisFrame += 1;
        }
      } else {
        this.physicsAccumulator = 0;
      }

      this.dynamicBodies.forEach(({ body, object }) => {
        const translation = body.translation();
        const rotation = body.rotation();
        object.position.set(translation.x, translation.y, translation.z);
        object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      });
      this.player?.updateAfterStep(delta, config?.physicsPlayback ?? "stopped", config?.cameraMode ?? "third-person");
    }

    if (config?.physicsPlayback === "running") {
      this.debugFrameCooldown = Math.max(0, this.debugFrameCooldown - delta);

      if (this.debugFrameCooldown === 0) {
        publishVanillaDebug("frame", {
          accumulator: this.physicsAccumulator,
          delta,
          player: this.player?.getDebugState() ?? null,
          stepsThisFrame,
          worldTimestep: this.world?.timestep ?? null
        });
        this.debugFrameCooldown = 0.25;
      }
    }

    if (config?.physicsPlayback === "stopped") {
      this.controls.update();
      this.updateAutoFit(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateAutoFit(delta: number) {
    if (!this.autoFitEnabled || this.fitFramesRemaining <= 0) {
      return;
    }

    scratchBounds.setFromObject(this.worldRoot);

    if (scratchBounds.isEmpty()) {
      return;
    }

    scratchBounds.getCenter(scratchCenter);
    scratchBounds.getSize(scratchSize);
    const maxExtent = Math.max(scratchSize.x, scratchSize.y, scratchSize.z, 2);
    const distance = maxExtent * 1.6;

    scratchFitPosition.set(
      scratchCenter.x + distance,
      scratchCenter.y + distance * 0.72,
      scratchCenter.z + distance
    );
    this.camera.position.lerp(scratchFitPosition, 1 - Math.exp(-delta * 4));
    this.controls.target.lerp(scratchCenter, 1 - Math.exp(-delta * 5));
    this.controls.update();
    this.camera.lookAt(scratchCenter);
    this.camera.near = 0.1;
    this.camera.far = Math.max(2000, distance * 12);
    this.camera.updateProjectionMatrix();
    this.fitFramesRemaining -= 1;
  }
}

async function ensureRapierReady() {
  rapierReady ??= ensureRapierRuntimePhysics();
  await rapierReady;
}

function clearGroup(group: Group) {
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
}

function createWorldAmbientLight(color: string, intensity: number) {
  if (intensity <= 0) {
    return undefined;
  }

  return new AmbientLight(color, intensity);
}

function createLightObject(light: DerivedLight): RuntimeNodeObject | undefined {
  if (!light.data.enabled) {
    return undefined;
  }

  const group = new Group();
  let target: Object3D | undefined;
  group.position.set(light.position.x, light.position.y, light.position.z);
  group.rotation.set(light.rotation.x, light.rotation.y, light.rotation.z);

  if (light.data.type === "ambient") {
    group.add(new AmbientLight(light.data.color, light.data.intensity));
  }

  if (light.data.type === "hemisphere") {
    group.add(new HemisphereLight(light.data.color, light.data.groundColor ?? "#0f1721", light.data.intensity));
  }

  if (light.data.type === "point") {
    const point = new PointLight(light.data.color, light.data.intensity, light.data.distance, light.data.decay);
    point.castShadow = light.data.castShadow;
    group.add(point);
  }

  if (light.data.type === "directional") {
    const directional = new DirectionalLight(light.data.color, light.data.intensity);
    directional.castShadow = light.data.castShadow;
    target = new Object3D();
    target.position.set(0, 0, -6);
    group.add(target);
    group.add(directional);
    directional.target = target;
  }

  if (light.data.type === "spot") {
    const spot = new SpotLight(
      light.data.color,
      light.data.intensity,
      light.data.distance,
      light.data.angle,
      light.data.penumbra,
      light.data.decay
    );
    spot.castShadow = light.data.castShadow;
    target = new Object3D();
    target.position.set(0, 0, -6);
    group.add(target);
    group.add(spot);
    spot.target = target;
  }

  group.updateMatrixWorld(true);
  target?.updateMatrixWorld(true);

  return {
    nodeId: light.nodeId,
    object: group
  };
}

async function createMeshObject(
  mesh: DerivedRenderMesh,
  resolveAssetPath: AssetPathResolver,
  assetsById: Map<string, Asset>,
  runtimeNode?: WebHammerEngineNode,
  enableLod = false
) {
  if (!mesh.surface && !mesh.primitive && !mesh.modelPath) {
    return undefined;
  }

  const group = new Group();
  const content = new Group();
  const pivot = resolveMeshPivot(mesh);
  group.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
  group.rotation.set(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
  group.scale.set(mesh.scale.x, mesh.scale.y, mesh.scale.z);
  content.position.set(-pivot.x, -pivot.y, -pivot.z);
  group.add(content);

  const lodDistances = resolveMeshLodDistances(mesh);

  if (mesh.modelPath) {
    const model = await createModelObject(mesh, resolveAssetPath);

    if (model) {
      if (enableLod && runtimeNode?.kind === "model" && runtimeNode.lods?.length) {
        const lod = new LOD();
        const cleanupTasks: Array<() => void> = [];

        lod.addLevel(model, 0);

        for (const level of runtimeNode.lods) {
          const asset = assetsById.get(level.assetId);

          if (!asset) {
            continue;
          }

          const runtimeLevel = await createModelObjectFromAsset(asset, resolveAssetPath);
          lod.addLevel(runtimeLevel, level.level === "mid" ? lodDistances.midDistance : lodDistances.lowDistance);
        }

        content.add(lod);
        return {
          cleanup: () => {
            cleanupTasks.forEach((task) => task());
          },
          object: group
        };
      }

      content.add(model);
      return { object: group };
    }
  }

  if (enableLod && runtimeNode && isRuntimeGeometryNode(runtimeNode) && runtimeNode.lods?.length) {
    const lod = new LOD();
    const cleanupTasks: Array<() => void> = [];
    const highLevel = await createRuntimeGeometryObject(runtimeNode.geometry, resolveAssetPath);
    cleanupTasks.push(highLevel.cleanup);
    lod.addLevel(highLevel.object, 0);

    for (const level of runtimeNode.lods) {
      const runtimeLevel = await createRuntimeGeometryObject(level.geometry, resolveAssetPath);
      cleanupTasks.push(runtimeLevel.cleanup);
      lod.addLevel(runtimeLevel.object, level.level === "mid" ? lodDistances.midDistance : lodDistances.lowDistance);
    }

    content.add(lod);
    return {
      cleanup: () => {
        cleanupTasks.forEach((task) => task());
      },
      object: group
    };
  }

  const geometry = createRenderableGeometry(mesh);

  if (!geometry) {
    return undefined;
  }

  const materials = await createPreviewMaterials(mesh, resolveAssetPath);
  const previewMesh = new Mesh(geometry, materials.length === 1 ? materials[0] : materials);
  previewMesh.castShadow = true;
  previewMesh.receiveShadow = true;
  content.add(previewMesh);

  return {
    cleanup: () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    object: group
  };
}

function disposeCreatedObject(created?: { cleanup?: () => void; object: Object3D }) {
  created?.cleanup?.();
}

function isRuntimeGeometryNode(node: WebHammerEngineNode): node is WebHammerEngineGeometryNode {
  return node.kind === "brush" || node.kind === "mesh" || node.kind === "primitive";
}

async function createRuntimeGeometryObject(geometry: WebHammerExportGeometry, resolveAssetPath: AssetPathResolver) {
  const group = new Group();
  const cleanupTasks: Array<() => void> = [];

  for (const primitive of geometry.primitives) {
    const mesh = await createRuntimePrimitiveMesh(primitive, resolveAssetPath);
    cleanupTasks.push(() => {
      mesh.geometry.dispose();

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
        return;
      }

      mesh.material.dispose();
    });
    group.add(mesh);
  }

  return {
    cleanup: () => {
      cleanupTasks.forEach((task) => task());
    },
    object: group
  };
}

async function createRuntimePrimitiveMesh(
  primitive: WebHammerExportGeometry["primitives"][number],
  resolveAssetPath: AssetPathResolver
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

  if (primitive.uvs.length) {
    geometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
  }

  geometry.setIndex(primitive.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = await createRuntimeMaterial(primitive.material, resolveAssetPath);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

async function createRuntimeMaterial(spec: WebHammerExportMaterial, resolveAssetPath: AssetPathResolver) {
  const materialOptions: MeshStandardMaterialParameters = {
    color: spec.baseColorTexture ? "#ffffff" : spec.color,
    metalness: spec.metallicFactor,
    roughness: spec.roughnessFactor,
    side: resolvePreviewMaterialSide(spec.side)
  };

  if (spec.baseColorTexture) {
    materialOptions.map = await loadTexture(await Promise.resolve(resolveAssetPath(spec.baseColorTexture)), true);
  }

  if (spec.normalTexture) {
    materialOptions.normalMap = await loadTexture(await Promise.resolve(resolveAssetPath(spec.normalTexture)), false);
  }

  if (spec.metallicRoughnessTexture) {
    const orm = await loadTexture(await Promise.resolve(resolveAssetPath(spec.metallicRoughnessTexture)), false);
    materialOptions.metalnessMap = orm;
    materialOptions.roughnessMap = orm;
  }

  return new MeshStandardMaterial(materialOptions);
}

function resolveMeshLodDistances(_mesh: DerivedRenderMesh) {
  return {
    lowDistance: PLAYGROUND_LOW_LOD_DISTANCE,
    midDistance: PLAYGROUND_MID_LOD_DISTANCE
  };
}

function createRenderableGeometry(mesh: DerivedRenderMesh) {
  let geometry: BufferGeometry | undefined;

  if (mesh.surface) {
    geometry = createIndexedGeometry(mesh.surface.positions, mesh.surface.indices, mesh.surface.uvs, mesh.surface.groups);
  } else if (mesh.primitive?.kind === "box") {
    geometry = new BoxGeometry(mesh.primitive.size.x, mesh.primitive.size.y, mesh.primitive.size.z);
  } else if (mesh.primitive?.kind === "sphere") {
    geometry = new SphereGeometry(mesh.primitive.radius, mesh.primitive.widthSegments, mesh.primitive.heightSegments);
  } else if (mesh.primitive?.kind === "cylinder") {
    geometry = new CylinderGeometry(
      mesh.primitive.radiusTop,
      mesh.primitive.radiusBottom,
      mesh.primitive.height,
      mesh.primitive.radialSegments
    );
  } else if (mesh.primitive?.kind === "cone") {
    geometry = new ConeGeometry(mesh.primitive.radius, mesh.primitive.height, mesh.primitive.radialSegments);
  }

  if (!geometry) {
    return undefined;
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function createPreviewMaterials(mesh: DerivedRenderMesh, resolveAssetPath: AssetPathResolver) {
  const specs = mesh.materials ?? [mesh.material];
  const resolved = await Promise.all(
    specs.map(async (spec) => ({
      ...spec,
      colorTexture: spec.colorTexture ? await Promise.resolve(resolveAssetPath(spec.colorTexture)) : spec.colorTexture,
      metalnessTexture: spec.metalnessTexture ? await Promise.resolve(resolveAssetPath(spec.metalnessTexture)) : spec.metalnessTexture,
      normalTexture: spec.normalTexture ? await Promise.resolve(resolveAssetPath(spec.normalTexture)) : spec.normalTexture,
      roughnessTexture: spec.roughnessTexture ? await Promise.resolve(resolveAssetPath(spec.roughnessTexture)) : spec.roughnessTexture
    }))
  );

  return Promise.all(resolved.map((spec) => createPreviewMaterial(spec)));
}

async function createPreviewMaterial(spec: DerivedRenderMesh["material"]) {
  const colorTexture = spec.colorTexture
    ? await loadTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? await loadTexture(createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018), true)
      : undefined;
  const normalTexture = spec.normalTexture ? await loadTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? await loadTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? await loadTexture(spec.roughnessTexture, false) : undefined;

  return new MeshStandardMaterial({
    color: colorTexture ? "#ffffff" : spec.color,
    flatShading: spec.flatShaded,
    map: colorTexture,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    metalnessMap: metalnessTexture,
    normalMap: normalTexture,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    roughnessMap: roughnessTexture,
    side: resolvePreviewMaterialSide(spec.side),
    wireframe: spec.wireframe
  });
}

async function loadTexture(source: string, isColor: boolean) {
  const cacheKey = `${isColor ? "color" : "data"}:${source}`;
  const cached = previewTextureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const texture = await textureLoader.loadAsync(source);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  if (isColor) {
    texture.colorSpace = SRGBColorSpace;
  }

  previewTextureCache.set(cacheKey, texture);
  return texture;
}

function resolvePreviewMaterialSide(side?: MaterialRenderSide): Side {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

async function createModelObject(mesh: DerivedRenderMesh, resolveAssetPath: AssetPathResolver) {
  if (!mesh.modelPath) {
    return undefined;
  }

  return createResolvedModelObject({
    center: mesh.modelCenter,
    format: mesh.modelFormat === "obj" ? "obj" : "glb",
    modelMtlText: mesh.modelMtlText,
    modelPath: mesh.modelPath,
    modelTexturePath: mesh.modelTexturePath
  }, resolveAssetPath);
}

async function createModelObjectFromAsset(asset: Asset, resolveAssetPath: AssetPathResolver) {
  if (typeof asset.path !== "string" || asset.path.length === 0) {
    return new Group();
  }

  return createResolvedModelObject({
    center: readAssetVec3(asset, "nativeCenter"),
    format: readAssetString(asset, "modelFormat") === "obj" ? "obj" : "glb",
    modelMtlText: readAssetString(asset, "materialMtlText"),
    modelPath: asset.path,
    modelTexturePath: readAssetString(asset, "texturePath")
  }, resolveAssetPath);
}

async function createResolvedModelObject(
  reference: {
    center?: { x: number; y: number; z: number };
    format: "glb" | "obj";
    modelMtlText?: string;
    modelPath: string;
    modelTexturePath?: string;
  },
  resolveAssetPath: AssetPathResolver
) {
  const resolvedPath = await Promise.resolve(resolveAssetPath(reference.modelPath));
  const resolvedTexturePath = reference.modelTexturePath
    ? await Promise.resolve(resolveAssetPath(reference.modelTexturePath))
    : undefined;
  const cacheKey = `${reference.format}:${resolvedPath}:${resolvedTexturePath ?? ""}:${reference.modelMtlText ?? ""}`;
  let loadedScene = modelSceneCache.get(cacheKey);

  if (!loadedScene) {
    loadedScene = await loadModelScene(
      resolvedPath,
      reference.format,
      resolvedTexturePath,
      reference.modelMtlText
    );
    modelSceneCache.set(cacheKey, loadedScene);
  }

  const clone = loadedScene.clone(true);
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const bounds = computeModelBounds(loadedScene);
  const center = bounds?.center ?? reference.center ?? { x: 0, y: 0, z: 0 };
  clone.position.set(-center.x, -center.y, -center.z);
  return clone;
}

async function loadModelScene(path: string, format: "glb" | "obj", texturePath?: string, mtlText?: string) {
  if (format === "obj") {
    const objLoader = new OBJLoader();

    if (mtlText) {
      const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, texturePath), "");
      materialCreator.preload();
      objLoader.setMaterials(materialCreator);
    }

    const object = await objLoader.loadAsync(path);

    if (!mtlText && texturePath) {
      const texture = await loadModelTexture(texturePath);

      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = new MeshStandardMaterial({
            map: texture,
            metalness: 0.12,
            roughness: 0.76
          });
        }
      });
    }

    return object;
  }

  const gltf = await gltfLoader.loadAsync(path);
  return gltf.scene;
}

async function loadModelTexture(path: string) {
  const cacheKey = `model:${path}`;
  const cached = previewTextureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const texture = await modelTextureLoader.loadAsync(path);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  previewTextureCache.set(cacheKey, texture);
  return texture;
}

function computeModelBounds(scene: Object3D) {
  const box = new Box3().setFromObject(scene);

  if (box.isEmpty()) {
    return undefined;
  }

  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  return {
    center: { x: center.x, y: center.y, z: center.z },
    size: {
      x: Math.max(size.x, 0.001),
      y: Math.max(size.y, 0.001),
      z: Math.max(size.z, 0.001)
    }
  };
}

function createIndexedGeometry(
  positions: number[],
  indices?: number[],
  uvs?: number[],
  groups?: Array<{ count: number; materialIndex: number; start: number }>
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  if (uvs) {
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }

  if (indices) {
    geometry.setIndex(indices);
  }

  geometry.clearGroups();
  groups?.forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  });

  return geometry;
}

function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern = /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap ? normalized : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}

function readAssetString(asset: Asset | undefined, key: string) {
  const value = asset?.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readAssetVec3(asset: Asset | undefined, keyPrefix: "nativeCenter" | "nativeSize") {
  if (!asset) {
    return undefined;
  }

  const x = asset.metadata[`${keyPrefix}X`];
  const y = asset.metadata[`${keyPrefix}Y`];
  const z = asset.metadata[`${keyPrefix}Z`];

  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    return undefined;
  }

  return { x, y, z };
}

function resolveMeshPivot(mesh: DerivedRenderMesh) {
  return resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });
}

function maxAxisScale(scale: DerivedRenderMesh["scale"]) {
  return Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
}

type RuntimePlayerControllerOptions = {
  camera: PerspectiveCamera;
  cameraMode: SceneRuntimeConfig["cameraMode"];
  domElement: HTMLCanvasElement;
  onActorChange?: (actor: PlayerActor | null) => void;
  onInteract?: () => void;
  sceneSettings: SceneRuntimeConfig["sceneSettings"];
  spawnPosition: { x: number; y: number; z: number };
  spawnRotationY: number;
  world: RAPIER.World;
};

class RuntimePlayerController {
  readonly object = new Group();

  private readonly body: RAPIER.RigidBody;
  private readonly camera: PerspectiveCamera;
  private readonly domElement: HTMLCanvasElement;
  private readonly footOffset: number;
  private readonly halfHeight: number;
  private readonly onActorChange?: (actor: PlayerActor | null) => void;
  private readonly onInteract?: () => void;
  private readonly radius: number;
  private readonly sceneSettings: SceneRuntimeConfig["sceneSettings"];
  private readonly standingHeight: number;
  private readonly visual = new Mesh(
    new CapsuleGeometryCompat(0.32, 1.1),
    new MeshStandardMaterial({
      color: "#7dd3fc",
      emissive: "#0f4c81",
      emissiveIntensity: 0.12,
      flatShading: true,
      roughness: 0.62
    })
  );
  private readonly world: RAPIER.World;

  private cameraMode: SceneRuntimeConfig["cameraMode"];
  private jumpQueued = false;
  private jumpGroundLockRemaining = 0;
  private lastGroundNormalY: number | null = null;
  private lastGroundProbeToi: number | null = null;
  private lastGrounded = false;
  private pointerLocked = false;
  private readonly keyState = new Set<string>();
  private pitch = 0;
  private readonly rawTranslation = new Vector3();
  private readonly renderOffset = new Vector3();
  private readonly smoothedTranslation = new Vector3();
  private readonly supportVelocity = new Vector3();
  private yaw = 0;

  constructor(options: RuntimePlayerControllerOptions) {
    this.camera = options.camera;
    this.cameraMode = options.cameraMode;
    this.domElement = options.domElement;
    this.onActorChange = options.onActorChange;
    this.onInteract = options.onInteract;
    this.sceneSettings = options.sceneSettings;
    this.world = options.world;
    this.standingHeight = Math.max(1.2, options.sceneSettings.player.height);
    this.radius = MathUtils.clamp(this.standingHeight * 0.18, 0.24, 0.42);
    this.halfHeight = Math.max(0.12, this.standingHeight * 0.5 - this.radius);
    this.footOffset = this.halfHeight + this.radius;
    this.yaw = options.spawnRotationY;
    this.pitch = options.cameraMode === "fps" ? 0 : options.cameraMode === "third-person" ? -0.22 : -0.78;

    const spawnPosition = {
      x: options.spawnPosition.x,
      y: options.spawnPosition.y + this.standingHeight * 0.5 + 0.04,
      z: options.spawnPosition.z
    };
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z)
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setLinearDamping(0.8);
    this.body = this.world.createRigidBody(bodyDesc);
    this.body.lockRotations(true, true);
    this.world.createCollider(RAPIER.ColliderDesc.capsule(this.halfHeight, this.radius).setFriction(0), this.body);

    this.visual.castShadow = true;
    this.visual.receiveShadow = true;
    this.object.add(this.visual);
    this.smoothedTranslation.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this.rawTranslation.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);

    this.domElement.addEventListener("click", this.handleCanvasClick);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  dispose() {
    this.releasePointerLock();
    this.domElement.removeEventListener("click", this.handleCanvasClick);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.onActorChange?.(null);
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }

    this.pointerLocked = false;
  }

  updateBeforeStep(deltaSeconds: number) {
    this.jumpGroundLockRemaining = Math.max(0, this.jumpGroundLockRemaining - deltaSeconds);
    const translation = this.body.translation();
    const linearVelocity = this.body.linvel();
    const groundedHit = this.jumpGroundLockRemaining > 0 ? undefined : this.resolveGroundHit(translation);
    const grounded = groundedHit !== undefined;
    this.lastGroundProbeToi = groundedHit?.timeOfImpact ?? null;
    this.lastGroundNormalY = groundedHit?.normal.y ?? null;
    const speed = this.sceneSettings.player.canRun && this.isRunning()
      ? this.sceneSettings.player.runningSpeed
      : this.sceneSettings.player.movementSpeed;
    const viewDirection = resolveViewDirection(this.yaw, this.pitch, scratchLookTarget);
    const forward = new Vector3(viewDirection.x, 0, viewDirection.z);

    if (forward.lengthSq() > 0) {
      forward.normalize();
    } else {
      forward.set(0, 0, -1);
    }

    const right = new Vector3(-forward.z, 0, forward.x).normalize();
    const moveDirection = new Vector3()
      .addScaledVector(right, this.axis("KeyD", "ArrowRight") - this.axis("KeyA", "ArrowLeft"))
      .addScaledVector(forward, this.axis("KeyW", "ArrowUp") - this.axis("KeyS", "ArrowDown"));

    if (moveDirection.lengthSq() > 0) {
      moveDirection.normalize().multiplyScalar(speed);
    }

    if (groundedHit?.collider.parent()) {
      const supportBody = groundedHit.collider.parent();

      if (supportBody) {
        const velocity = supportBody.linvel();
        this.supportVelocity.set(velocity.x, velocity.y, velocity.z);
      }
    } else {
      this.supportVelocity.set(0, 0, 0);
    }

    if (grounded !== this.lastGrounded) {
      publishVanillaDebug("grounded-change", {
        grounded,
        groundNormalY: this.lastGroundNormalY,
        jumpLockRemaining: this.jumpGroundLockRemaining,
        position: { x: translation.x, y: translation.y, z: translation.z },
        probeToi: this.lastGroundProbeToi,
        velocity: { x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z }
      });
      this.lastGrounded = grounded;
    }

    this.body.setLinvel(
      {
        x: moveDirection.x + this.supportVelocity.x,
        y: grounded && linearVelocity.y <= this.supportVelocity.y ? this.supportVelocity.y : linearVelocity.y,
        z: moveDirection.z + this.supportVelocity.z
      },
      true
    );

    if (this.jumpQueued) {
      if (this.sceneSettings.player.canJump && grounded) {
        const gravityMagnitude = Math.max(
          0.001,
          Math.hypot(
            this.sceneSettings.world.gravity.x,
            this.sceneSettings.world.gravity.y,
            this.sceneSettings.world.gravity.z
          )
        );
        const currentVelocity = this.body.linvel();
        this.body.setLinvel(
          {
            x: currentVelocity.x,
            y: this.supportVelocity.y + Math.sqrt(2 * gravityMagnitude * this.sceneSettings.player.jumpHeight),
            z: currentVelocity.z
          },
          true
        );
        this.jumpGroundLockRemaining = PLAYER_JUMP_GROUND_LOCK_SECONDS;
        publishVanillaDebug("jump-applied", {
          gravityMagnitude,
          jumpHeight: this.sceneSettings.player.jumpHeight,
          position: { x: translation.x, y: translation.y, z: translation.z },
          supportVelocity: { x: this.supportVelocity.x, y: this.supportVelocity.y, z: this.supportVelocity.z }
        });
      }

      this.jumpQueued = false;
    }
  }

  updateAfterStep(deltaSeconds: number, physicsPlayback: SceneRuntimeConfig["physicsPlayback"], cameraMode: SceneRuntimeConfig["cameraMode"]) {
    this.cameraMode = cameraMode;
    const translation = this.body.translation();
    this.rawTranslation.set(translation.x, translation.y, translation.z);
    this.smoothedTranslation.lerp(this.rawTranslation, 1 - Math.exp(-deltaSeconds * 18));
    this.object.position.copy(this.rawTranslation);
    this.visual.position.copy(this.renderOffset.copy(this.smoothedTranslation).sub(this.rawTranslation));
    this.visual.rotation.set(0, this.yaw, 0);
    this.visual.visible = cameraMode !== "fps";

    const eyeHeight = Math.max(this.radius * 1.5, this.standingHeight * 0.92);
    const eyePosition = new Vector3(translation.x, translation.y - this.standingHeight * 0.5 + eyeHeight, translation.z);
    const viewDirection = resolveViewDirection(this.yaw, this.pitch, new Vector3());

    if (cameraMode === "fps") {
      this.camera.position.copy(eyePosition);
      this.camera.lookAt(eyePosition.clone().add(viewDirection));
    } else if (cameraMode === "third-person") {
      const followDistance = Math.max(3.2, this.standingHeight * 2.7);
      const nextCameraPosition = eyePosition.clone().addScaledVector(viewDirection, -followDistance);
      nextCameraPosition.y += this.standingHeight * 0.24;
      this.camera.position.lerp(nextCameraPosition, 1 - Math.exp(-deltaSeconds * 10));
      this.camera.lookAt(eyePosition);
    } else {
      const topDownDirection = resolveViewDirection(this.yaw, this.pitch, new Vector3());
      const followDistance = Math.max(8, this.standingHeight * 5.2);
      const nextCameraPosition = eyePosition.clone().addScaledVector(topDownDirection, -followDistance);
      nextCameraPosition.y += this.standingHeight * 1.8;
      this.camera.position.lerp(nextCameraPosition, 1 - Math.exp(-deltaSeconds * 8));
      this.camera.lookAt(eyePosition);
    }

    this.onActorChange?.({
      height: this.standingHeight,
      id: "player",
      position: vec3(translation.x, translation.y, translation.z),
      radius: this.radius,
      tags: ["player"]
    });

    if (physicsPlayback !== "running") {
      this.releasePointerLock();
    }
  }

  getDebugState() {
    const translation = this.body.translation();
    const velocity = this.body.linvel();

    return {
      grounded: this.lastGrounded,
      groundNormalY: this.lastGroundNormalY,
      jumpGroundLockRemaining: this.jumpGroundLockRemaining,
      jumpQueued: this.jumpQueued,
      pointerLocked: this.pointerLocked,
      position: { x: translation.x, y: translation.y, z: translation.z },
      probeToi: this.lastGroundProbeToi,
      supportVelocity: { x: this.supportVelocity.x, y: this.supportVelocity.y, z: this.supportVelocity.z },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      visualOffset: { x: this.visual.position.x, y: this.visual.position.y, z: this.visual.position.z }
    };
  }

  private resolveGroundHit(translation: ReturnType<RAPIER.RigidBody["translation"]>) {
    const ray = new RAPIER.Ray(
      {
        x: translation.x,
        y: translation.y - this.footOffset + PLAYER_GROUND_PROBE_HEIGHT,
        z: translation.z
      },
      { x: 0, y: -1, z: 0 }
    );

    const hit = this.world.castRayAndGetNormal(
      ray,
      PLAYER_GROUND_PROBE_DISTANCE,
      false,
      undefined,
      undefined,
      undefined,
      this.body
    );

    if (!hit || hit.normal.y < PLAYER_GROUND_MIN_NORMAL_Y) {
      return undefined;
    }

    return hit;
  }

  private axis(primary: string, secondary: string) {
    return this.keyState.has(primary) || this.keyState.has(secondary) ? 1 : 0;
  }

  private isRunning() {
    return this.keyState.has("ShiftLeft") || this.keyState.has("ShiftRight");
  }

  private readonly handleCanvasClick = () => {
    if (document.pointerLockElement === this.domElement) {
      return;
    }

    void this.domElement.requestPointerLock();
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    this.pointerLocked = document.pointerLockElement === this.domElement;

    if (!this.pointerLocked) {
      return;
    }

    this.yaw -= event.movementX * 0.0024;
    this.pitch = MathUtils.clamp(
      this.pitch - event.movementY * 0.0018,
      this.cameraMode === "fps" ? -1.35 : -1.25,
      this.cameraMode === "fps" ? 1.35 : this.cameraMode === "top-down" ? -0.12 : 0.4
    );
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (isTextInputTarget(event.target)) {
      return;
    }

    this.keyState.add(event.code);

    if (event.code === "Space") {
      this.jumpQueued = true;
      publishVanillaDebug("jump-input", {
        pointerLocked: this.pointerLocked
      });
      event.preventDefault();
    }

    if (
      event.code === (this.sceneSettings.player.interactKey || "KeyE") &&
      this.sceneSettings.player.canInteract !== false
    ) {
      this.onInteract?.();
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.keyState.delete(event.code);
  };

  private readonly handleWindowBlur = () => {
    this.keyState.clear();
    this.jumpQueued = false;
    this.releasePointerLock();
  };
}

class CapsuleGeometryCompat extends BufferGeometry {
  constructor(radius: number, length: number) {
    super();
    const geometry = new CylinderGeometry(radius, radius, length, 12, 1, true);
    const top = new SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    top.translate(0, length * 0.5, 0);
    const bottom = new SphereGeometry(radius, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bottom.translate(0, -length * 0.5, 0);
    const merged = mergeGeometries([geometry, top, bottom]);

    this.copy(merged);
    geometry.dispose();
    top.dispose();
    bottom.dispose();
    merged.dispose();
  }
}

function mergeGeometries(geometries: BufferGeometry[]) {
  const merged = new BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;

  geometries.forEach((geometry) => {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const index = geometry.getIndex();

    positions.push(...Array.from(position.array as ArrayLike<number>));
    normals.push(...Array.from(normal.array as ArrayLike<number>));

    if (index) {
      indices.push(...Array.from(index.array as ArrayLike<number>, (value) => value + offset));
    } else {
      indices.push(...Array.from({ length: position.count }, (_, value) => value + offset));
    }

    offset += position.count;
  });

  merged.setAttribute("position", new Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

function resolveViewDirection(yaw: number, pitch: number, target: Vector3) {
  return target.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
}

function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
