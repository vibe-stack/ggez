import RAPIER from "@dimforge/rapier3d-compat";
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
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
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
  type Side
} from "three";
import { applyWebHammerWorldSettings, clearWebHammerWorldSettings } from "@web-hammer/three-runtime";
import { createBlockoutTextureDataUri, resolveTransformPivot, vec3, type MaterialRenderSide } from "@web-hammer/shared";
import type { DerivedLight, DerivedRenderMesh } from "@web-hammer/render-pipeline";
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

const previewTextureCache = new Map<string, Texture>();
const modelSceneCache = new Map<string, Object3D>();
const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const textureLoader = new TextureLoader();
const modelTextureLoader = new TextureLoader();
const PLAYER_GROUND_PROBE_HEIGHT = 0.08;
const PLAYER_GROUND_PROBE_DISTANCE = 0.16;
const scratchBounds = new Box3();
const scratchCenter = new Vector3();
const scratchSize = new Vector3();
const scratchFitPosition = new Vector3();
const scratchLookTarget = new Vector3();

let rapierReady: Promise<void> | undefined;

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
  private loadVersion = 0;
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
    const physicsMeshes = physicsActive ? config.renderScene.meshes.filter((mesh) => mesh.physics?.enabled) : [];
    const staticMeshes = physicsActive
      ? config.renderScene.meshes.filter((mesh) => !physicsMeshes.some((candidate) => candidate.nodeId === mesh.nodeId))
      : config.renderScene.meshes;

    const staticObjects = await Promise.all(
      staticMeshes.map((mesh) => createMeshObject(mesh, config.resolveAssetPath))
    );

    if (version !== this.loadVersion) {
      staticObjects.forEach(disposeCreatedObject);
      return;
    }

    staticObjects.forEach((created, index) => {
      if (!created) {
        return;
      }

      const mesh = staticMeshes[index];
      this.staticMeshRoot.add(created.object);
      this.options.host.bindNodeObject(mesh.nodeId, created.object);
      this.staticObjects.push({
        cleanup: created.cleanup,
        nodeId: mesh.nodeId,
        object: created.object
      });
    });

    if (physicsActive) {
      await this.createPhysicsScene(config, staticMeshes, physicsMeshes, version);
    }

    if (version !== this.loadVersion) {
      return;
    }

    config.renderScene.lights.forEach((light) => {
      const created = createLightObject(light);

      if (!created) {
        return;
      }

      this.lightRoot.add(created.object);
      this.options.host.bindNodeObject(light.nodeId, created.object);
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
    staticMeshes: DerivedRenderMesh[],
    physicsMeshes: DerivedRenderMesh[],
    version: number
  ) {
    await ensureRapierReady();

    if (version !== this.loadVersion || !this.config) {
      return;
    }

    this.world = new RAPIER.World(config.sceneSettings.world.gravity);

    staticMeshes.forEach((mesh) => {
      const body = createStaticRigidBody(this.world!, mesh);
      this.staticBodies.push({ body, nodeId: mesh.nodeId });
      this.options.host.bindNodePhysicsBody(mesh.nodeId, body);
    });

    const dynamicObjects = await Promise.all(
      physicsMeshes.map((mesh) => createMeshObject(mesh, config.resolveAssetPath))
    );

    if (version !== this.loadVersion || !this.world) {
      dynamicObjects.forEach(disposeCreatedObject);
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
        nodeId: mesh.nodeId,
        object: created.object
      });
      this.options.host.bindNodePhysicsBody(mesh.nodeId, body);
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
        sceneSettings: config.sceneSettings,
        spawnPosition: vec3(playerSpawn.position.x, playerSpawn.position.y, playerSpawn.position.z),
        spawnRotationY: playerSpawn.rotation.y,
        world: this.world
      });
      this.dynamicMeshRoot.add(this.player.object);
    }
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

    if (config?.gameplayRuntime) {
      config.gameplayRuntime.update(delta);
    }

    if (this.world) {
      if (config?.physicsPlayback === "running") {
        this.player?.updateBeforeStep(delta);
        this.world.timestep = 1 / 60;
        this.world.step();
      }

      this.dynamicBodies.forEach(({ body, object }) => {
        const translation = body.translation();
        const rotation = body.rotation();
        object.position.set(translation.x, translation.y, translation.z);
        object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      });
      this.player?.updateAfterStep(delta, config?.physicsPlayback ?? "stopped", config?.cameraMode ?? "third-person");
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
  rapierReady ??= RAPIER.init();
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
    const target = new Object3D();
    target.position.set(0, 0, -6);
    group.add(target);
    group.add(spot);
    spot.target = target;
  }

  return {
    nodeId: light.nodeId,
    object: group
  };
}

async function createMeshObject(mesh: DerivedRenderMesh, resolveAssetPath: AssetPathResolver) {
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

  if (mesh.modelPath) {
    const model = await createModelObject(mesh, resolveAssetPath);

    if (model) {
      content.add(model);
      return { object: group };
    }
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

function createStaticRigidBody(world: RAPIER.World, mesh: DerivedRenderMesh) {
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    .setRotation(createRapierQuaternion(mesh.rotation));
  const body = world.createRigidBody(bodyDesc);
  const collider = createColliderDesc(mesh);

  if (collider) {
    world.createCollider(collider, body);
  }

  return body;
}

function createDynamicRigidBody(world: RAPIER.World, mesh: DerivedRenderMesh) {
  const physics = mesh.physics;
  const bodyDesc = resolveRigidBodyDesc(physics?.bodyType ?? "dynamic")
    .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    .setRotation(createRapierQuaternion(mesh.rotation));
  const body = world.createRigidBody(bodyDesc);

  if (physics) {
    body.setAngularDamping(physics.angularDamping);
    body.setLinearDamping(physics.linearDamping);
    body.setGravityScale(physics.gravityScale, true);

    if (physics.lockRotations) {
      body.lockRotations(true, true);
    }

    if (physics.lockTranslations) {
      body.lockTranslations(true, true);
    }
  }

  const collider = createColliderDesc(mesh);

  if (collider) {
    world.createCollider(collider, body);
  }

  return body;
}

function resolveRigidBodyDesc(bodyType: NonNullable<DerivedRenderMesh["physics"]>["bodyType"]) {
  switch (bodyType) {
    case "fixed":
      return RAPIER.RigidBodyDesc.fixed();
    case "kinematicPosition":
      return RAPIER.RigidBodyDesc.kinematicPositionBased();
    default:
      return RAPIER.RigidBodyDesc.dynamic();
  }
}

function createColliderDesc(mesh: DerivedRenderMesh) {
  const physics = mesh.physics;
  const pivot = resolveMeshPivot(mesh);

  let desc: RAPIER.ColliderDesc | undefined;

  if (mesh.primitive && physics) {
    if (physics.colliderShape === "ball" && mesh.primitive.kind === "sphere") {
      desc = RAPIER.ColliderDesc.ball(mesh.primitive.radius * maxAxisScale(mesh.scale));
    }

    if (physics.colliderShape === "cuboid" && mesh.primitive.kind === "box") {
      desc = RAPIER.ColliderDesc.cuboid(
        Math.abs(mesh.primitive.size.x * mesh.scale.x) * 0.5,
        Math.abs(mesh.primitive.size.y * mesh.scale.y) * 0.5,
        Math.abs(mesh.primitive.size.z * mesh.scale.z) * 0.5
      );
    }

    if (physics.colliderShape === "cylinder" && mesh.primitive.kind === "cylinder") {
      desc = RAPIER.ColliderDesc.cylinder(
        Math.abs(mesh.primitive.height * mesh.scale.y) * 0.5,
        Math.max(
          Math.abs(mesh.primitive.radiusTop * mesh.scale.x),
          Math.abs(mesh.primitive.radiusBottom * mesh.scale.z)
        )
      );
    }

    if (physics.colliderShape === "cone" && mesh.primitive.kind === "cone") {
      desc = RAPIER.ColliderDesc.cone(
        Math.abs(mesh.primitive.height * mesh.scale.y) * 0.5,
        Math.abs(mesh.primitive.radius * maxAxisScale(mesh.scale))
      );
    }
  }

  if (!desc) {
    const geometry = createRenderableGeometry(mesh);

    if (!geometry) {
      return undefined;
    }

    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const scaledVertices = new Float32Array(position.count * 3);

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      scaledVertices[vertexIndex * 3] = position.getX(vertexIndex) * mesh.scale.x - pivot.x;
      scaledVertices[vertexIndex * 3 + 1] = position.getY(vertexIndex) * mesh.scale.y - pivot.y;
      scaledVertices[vertexIndex * 3 + 2] = position.getZ(vertexIndex) * mesh.scale.z - pivot.z;
    }

    const indices = index
      ? Uint32Array.from(index.array as ArrayLike<number>)
      : Uint32Array.from({ length: position.count }, (_, value) => value);
    desc = RAPIER.ColliderDesc.trimesh(scaledVertices, indices);
    geometry.dispose();
  } else {
    desc.setTranslation(-pivot.x, -pivot.y, -pivot.z);
  }

  if (!physics) {
    return desc;
  }

  if (physics.contactSkin !== undefined) {
    desc.setContactSkin(physics.contactSkin);
  }

  if (physics.density !== undefined) {
    desc.setDensity(physics.density);
  } else if (physics.mass !== undefined) {
    desc.setMass(physics.mass);
  }

  desc.setFriction(physics.friction);
  desc.setRestitution(physics.restitution);
  desc.setSensor(physics.sensor);

  return desc;
}

function createRapierQuaternion(rotation: DerivedRenderMesh["rotation"]) {
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z));

  return {
    w: quaternion.w,
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z
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

  const resolvedPath = await Promise.resolve(resolveAssetPath(mesh.modelPath));
  const resolvedTexturePath = mesh.modelTexturePath
    ? await Promise.resolve(resolveAssetPath(mesh.modelTexturePath))
    : undefined;
  const cacheKey = `${mesh.modelFormat ?? "glb"}:${resolvedPath}:${resolvedTexturePath ?? ""}:${mesh.modelMtlText ?? ""}`;
  let loadedScene = modelSceneCache.get(cacheKey);

  if (!loadedScene) {
    loadedScene = await loadModelScene(
      resolvedPath,
      mesh.modelFormat === "obj" ? "obj" : "glb",
      resolvedTexturePath,
      mesh.modelMtlText
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
  const center = bounds?.center ?? mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
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
  private pointerLocked = false;
  private readonly keyState = new Set<string>();
  private pitch = 0;
  private readonly rawTranslation = new Vector3();
  private readonly smoothedTranslation = new Vector3();
  private readonly supportVelocity = new Vector3();
  private yaw = 0;

  constructor(options: RuntimePlayerControllerOptions) {
    this.camera = options.camera;
    this.cameraMode = options.cameraMode;
    this.domElement = options.domElement;
    this.onActorChange = options.onActorChange;
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

  updateBeforeStep(_deltaSeconds: number) {
    const translation = this.body.translation();
    const linearVelocity = this.body.linvel();
    const groundedHit = this.resolveGroundHit(translation);
    const grounded = groundedHit !== undefined;
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

    this.body.setLinvel(
      {
        x: moveDirection.x + this.supportVelocity.x,
        y: grounded ? this.supportVelocity.y : linearVelocity.y,
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
            y: Math.sqrt(2 * gravityMagnitude * this.sceneSettings.player.jumpHeight),
            z: currentVelocity.z
          },
          true
        );
      }

      this.jumpQueued = false;
    }
  }

  updateAfterStep(deltaSeconds: number, physicsPlayback: SceneRuntimeConfig["physicsPlayback"], cameraMode: SceneRuntimeConfig["cameraMode"]) {
    this.cameraMode = cameraMode;
    const translation = this.body.translation();
    this.rawTranslation.set(translation.x, translation.y, translation.z);
    this.smoothedTranslation.lerp(this.rawTranslation, 1 - Math.exp(-deltaSeconds * 18));
    this.object.position.copy(this.smoothedTranslation);
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

  private resolveGroundHit(translation: ReturnType<RAPIER.RigidBody["translation"]>) {
    const ray = new RAPIER.Ray(
      {
        x: translation.x,
        y: translation.y - this.footOffset + PLAYER_GROUND_PROBE_HEIGHT,
        z: translation.z
      },
      { x: 0, y: -1, z: 0 }
    );

    return this.world.castRayAndGetNormal(
      ray,
      PLAYER_GROUND_PROBE_DISTANCE,
      false,
      undefined,
      undefined,
      undefined,
      this.body
    );
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
