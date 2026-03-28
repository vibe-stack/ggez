import type { Asset, MaterialRenderSide, PropPhysics, SceneSkyboxSettings, Transform, Vec3 } from "@ggez/shared";
import { resolveInstancingSourceNode, resolveSceneGraph, vec3 } from "@ggez/shared";
import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Fog,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedMesh,
  HemisphereLight,
  LOD,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Scene,
  SpotLight,
  Texture,
  TextureLoader,
  RepeatWrapping,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  getRuntimeAudioDescriptors,
  isRuntimeBundle,
  isRuntimeScene,
  parseRuntimeScene,
  type RuntimeAudioDescriptor,
  type RuntimeScene
} from "@ggez/runtime-format";
import {
  createWebHammerSceneObjectFactory,
  extractPhysics as extractNodePhysics,
  findPrimaryLight as findNodePrimaryLight
} from "./object-factory";
import type {
  WebHammerEngineBundle,
  WebHammerEngineModelNode,
  WebHammerEngineGeometryNode,
  WebHammerEngineNode,
  WebHammerEngineScene,
  WebHammerExportGeometry,
  WebHammerExportGeometryLod,
  WebHammerExportModelLod,
  WebHammerExportMaterial
} from "./types";

type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

export type WebHammerAssetResolverContext =
  | {
      kind: "model";
      node: Extract<WebHammerEngineNode, { kind: "model" }>;
      asset?: Asset;
      path: string;
      format: "gltf" | "obj";
    }
  | {
      kind: "texture";
      material: WebHammerExportMaterial;
      path: string;
      slot: TextureSlot;
    }
  | {
      kind: "skybox";
      path: string;
      skybox: SceneSkyboxSettings;
    };

export type WebHammerSceneLoaderOptions = {
  applyToScene?: Scene;
  castShadow?: boolean;
  lod?: WebHammerSceneLodOptions;
  receiveShadow?: boolean;
  resolveAssetUrl?: (context: WebHammerAssetResolverContext) => Promise<string> | string;
};

export type WebHammerSceneLodOptions = {
  lowDistance: number;
  midDistance: number;
};

export type ThreeRuntimeSceneInstance = {
  audioDescriptors: RuntimeAudioDescriptor[];
  dispose: () => void;
  entities: WebHammerEngineScene["entities"];
  lights: Object3D[];
  nodesById: Map<string, Object3D>;
  physicsDescriptors: Array<{
    nodeId: string;
    object: Object3D;
    physics: PropPhysics;
  }>;
  root: Group;
  scene: WebHammerEngineScene;
};

export type WebHammerLoadedScene = ThreeRuntimeSceneInstance & {
  nodes: ThreeRuntimeSceneInstance["nodesById"];
  physicsNodes: ThreeRuntimeSceneInstance["physicsDescriptors"];
};

export type ThreeRuntimeAssetResolverContext = WebHammerAssetResolverContext;
export type ThreeRuntimeSceneInstanceOptions = WebHammerSceneLoaderOptions;
export type ThreeRuntimeSceneLodOptions = WebHammerSceneLodOptions;

const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();
const hdrLoader = new HDRLoader();
const mtlLoader = new MTLLoader();

export function isWebHammerEngineScene(value: unknown): value is WebHammerEngineScene {
  return isRuntimeScene(value);
}

export function isWebHammerEngineBundle(value: unknown): value is WebHammerEngineBundle {
  return isRuntimeBundle(value);
}

export function parseWebHammerEngineScene(text: string): WebHammerEngineScene {
  return parseRuntimeScene(text);
}

export async function fetchWebHammerEngineScene(url: string, init?: RequestInit): Promise<WebHammerEngineScene> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch engine scene: ${response.status} ${response.statusText}`);
  }

  return parseWebHammerEngineScene(await response.text());
}

export async function createThreeRuntimeSceneInstance(
  input: RuntimeScene | string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<ThreeRuntimeSceneInstance> {
  const engineScene = typeof input === "string" ? parseRuntimeScene(input) : parseRuntimeScene(JSON.stringify(input));
  const root = new Group();
  const nodesById = new Map<string, Object3D>();
  const lights: Object3D[] = [];
  const physicsDescriptors: ThreeRuntimeSceneInstance["physicsDescriptors"] = [];
  const runtimeNodesById = new Map(engineScene.nodes.map((node) => [node.id, node]));
  const sceneGraph = resolveSceneGraph(engineScene.nodes, engineScene.entities);
  const objectFactory = createWebHammerSceneObjectFactory(engineScene, options);
  const createdObjects = await Promise.all(
    engineScene.nodes.map(async (node) => [node.id, await objectFactory.createNodeObject(node)] as const)
  );
  const attachedNodeIds = new Set<string>();
  const attachStack = new Set<string>();

  root.name = "Web Hammer Scene";
  root.userData.webHammer = {
    metadata: engineScene.metadata,
    settings: engineScene.settings
  };

  if (options.applyToScene) {
    await applyWebHammerWorldSettings(options.applyToScene, engineScene, options);
  }

  const worldAmbient = createWorldAmbientLight(engineScene);

  if (worldAmbient) {
    root.add(worldAmbient);
    lights.push(worldAmbient);
  }

  createdObjects.forEach(([nodeId, object]) => {
    nodesById.set(nodeId, object);
  });

  const attachNode = (nodeId: string) => {
    if (attachedNodeIds.has(nodeId)) {
      return;
    }

    const node = runtimeNodesById.get(nodeId);
    const object = nodesById.get(nodeId);

    if (!node || !object) {
      return;
    }

    if (attachStack.has(nodeId)) {
      root.add(object);
      attachedNodeIds.add(nodeId);
      return;
    }

    attachStack.add(nodeId);

    const parentObject =
      node.parentId && node.parentId !== node.id
        ? nodesById.get(node.parentId)
        : undefined;

    if (parentObject && !attachStack.has(node.parentId!)) {
      attachNode(node.parentId!);
      parentObject.add(object);
    } else {
      root.add(object);
    }

    attachStack.delete(nodeId);
    attachedNodeIds.add(nodeId);
  };

  for (const node of engineScene.nodes) {
    attachNode(node.id);
  }

  const instancingObjects = await objectFactory.createInstancingObjects();

  instancingObjects.forEach((object) => {
    root.add(object);
  });

  for (const node of engineScene.nodes) {
    const object = nodesById.get(node.id);

    if (!object) {
      continue;
    }

    const light = findNodePrimaryLight(object);

    if (light) {
      lights.push(light);
    }

    const physics = extractNodePhysics(node);

    if (physics?.enabled) {
      physicsDescriptors.push({
        nodeId: node.id,
        object,
        physics
      });
    }
  }

  return {
    audioDescriptors: getRuntimeAudioDescriptors(engineScene),
    dispose() {
      disposeThreeRuntimeSceneInstance(root);
    },
    entities: engineScene.entities.map((entity) => ({
      ...entity,
      transform: sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform
    })),
    lights,
    nodesById,
    physicsDescriptors,
    root,
    scene: engineScene
  };
}

export async function loadWebHammerEngineScene(
  input: WebHammerEngineScene | string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<WebHammerLoadedScene> {
  const instance = await createThreeRuntimeSceneInstance(input, options);

  return {
    ...instance,
    nodes: instance.nodesById,
    physicsNodes: instance.physicsDescriptors
  };
}

export async function loadWebHammerEngineSceneFromUrl(
  url: string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<WebHammerLoadedScene> {
  const scene = await fetchWebHammerEngineScene(url);
  return loadWebHammerEngineScene(scene, options);
}

export async function loadThreeRuntimeSceneInstanceFromUrl(
  url: string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<ThreeRuntimeSceneInstance> {
  const scene = await fetchWebHammerEngineScene(url);
  return createThreeRuntimeSceneInstance(scene, options);
}

type AppliedWorldSettingsState = {
  requestId: number;
  skyboxTexture?: Texture;
};

const APPLIED_WORLD_SETTINGS_KEY = "__webHammerWorldSettings";

export async function applyWebHammerWorldSettings(
  target: Scene,
  engineScene: Pick<WebHammerEngineScene, "settings">,
  options: Pick<WebHammerSceneLoaderOptions, "resolveAssetUrl"> = {}
) {
  const state = getAppliedWorldSettingsState(target);
  state.requestId += 1;
  disposeAppliedSkybox(target, state);

  const { fogColor, fogFar, fogNear } = engineScene.settings.world;
  target.fog = fogFar > fogNear ? new Fog(new Color(fogColor), fogNear, fogFar) : null;

  const skybox = engineScene.settings.world.skybox;

  if (!skybox.enabled || !skybox.source) {
    return;
  }

  const requestId = state.requestId;

  try {
    const resolvedPath = options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "skybox",
          path: skybox.source,
          skybox
        })
      : skybox.source;
    const texture = await loadSkyboxTexture(resolvedPath, skybox);

    if (getAppliedWorldSettingsState(target).requestId !== requestId) {
      texture.dispose();
      return;
    }

    target.background = texture;
    target.backgroundBlurriness = skybox.blur;
    target.backgroundIntensity = skybox.intensity;
    target.environment = skybox.affectsLighting ? texture : null;
    target.environmentIntensity = skybox.affectsLighting ? skybox.lightingIntensity : 1;
    state.skyboxTexture = texture;
  } catch {
    if (getAppliedWorldSettingsState(target).requestId === requestId) {
      disposeAppliedSkybox(target, state);
    }
  }
}

export function clearWebHammerWorldSettings(target: Scene) {
  const state = getAppliedWorldSettingsState(target);
  state.requestId += 1;
  disposeAppliedSkybox(target, state);
  target.fog = null;
}

export const applyRuntimeWorldSettingsToThreeScene = applyWebHammerWorldSettings;
export const clearRuntimeWorldSettingsFromThreeScene = clearWebHammerWorldSettings;

function createWorldAmbientLight(engineScene: WebHammerEngineScene) {
  const { ambientColor, ambientIntensity } = engineScene.settings.world;

  if (ambientIntensity <= 0) {
    return undefined;
  }

  const light = new AmbientLight(ambientColor, ambientIntensity);
  light.name = "World Ambient";
  light.userData.webHammer = {
    source: "world-settings"
  };

  return light;
}

function getAppliedWorldSettingsState(target: Scene): AppliedWorldSettingsState {
  const userData = target.userData as Record<string, AppliedWorldSettingsState | undefined>;
  const existing = userData[APPLIED_WORLD_SETTINGS_KEY];

  if (existing) {
    return existing;
  }

  const created: AppliedWorldSettingsState = {
    requestId: 0
  };
  userData[APPLIED_WORLD_SETTINGS_KEY] = created;
  return created;
}

function disposeAppliedSkybox(target: Scene, state: AppliedWorldSettingsState) {
  if (state.skyboxTexture) {
    if (target.background === state.skyboxTexture) {
      target.background = null;
    }

    if (target.environment === state.skyboxTexture) {
      target.environment = null;
    }

    state.skyboxTexture.dispose();
    state.skyboxTexture = undefined;
  }

  target.backgroundBlurriness = 0;
  target.backgroundIntensity = 1;
  target.environmentIntensity = 1;
}

function disposeThreeRuntimeSceneInstance(root: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof InstancedMesh)) {
      return;
    }

    if (object.geometry instanceof BufferGeometry) {
      geometries.add(object.geometry);
    }

    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];

    objectMaterials.forEach((material) => {
      if (!(material instanceof MeshStandardMaterial)) {
        return;
      }

      materials.add(material);

      if (material.map) {
        textures.add(material.map);
      }

      if (material.normalMap) {
        textures.add(material.normalMap);
      }

      if (material.metalnessMap) {
        textures.add(material.metalnessMap);
      }

      if (material.roughnessMap) {
        textures.add(material.roughnessMap);
      }
    });
  });

  root.removeFromParent();
  geometries.forEach((geometry) => {
    geometry.dispose();
  });
  materials.forEach((material) => {
    material.dispose();
  });
  textures.forEach((texture) => {
    texture.dispose();
  });
}

async function loadSkyboxTexture(path: string, skybox: SceneSkyboxSettings) {
  const texture = skybox.format === "hdr"
    ? await hdrLoader.loadAsync(path)
    : await textureLoader.loadAsync(path);

  texture.mapping = EquirectangularReflectionMapping;

  if (skybox.format === "image") {
    texture.colorSpace = SRGBColorSpace;
  }

  return texture;
}

async function createObjectForNode(
  node: WebHammerEngineNode,
  assetsById: Map<string, Asset>,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const anchor = new Group();
  const content = new Group();
  const pivot = node.transform.pivot;

  anchor.name = node.name;
  applyTransform(anchor, node.transform);
  anchor.userData.webHammer = {
    data: node.data,
    hooks: node.hooks,
    id: node.id,
    kind: node.kind,
    metadata: node.metadata,
    tags: node.tags
  };

  if (pivot) {
    content.position.set(-pivot.x, -pivot.y, -pivot.z);
  }

  anchor.add(content);

  if (node.kind === "light") {
    const light = createThreeLight(node);

    if (light) {
      content.add(light);
    }

    return anchor;
  }

  if (node.kind === "model") {
    const modelObject = await createModelObject(node, assetsById.get(node.data.assetId), options);
    const lodObject = await createLodObjectForModelNode(node, modelObject, assetsById, options);
    content.add(lodObject ?? modelObject);
    return anchor;
  }

  if (node.kind === "instancing") {
    anchor.visible = false;
    return anchor;
  }

  if (node.kind === "group") {
    return anchor;
  }

  const lodObject = await createLodObjectForGeometryNode(node, materialCache, textureCache, options);

  if (lodObject) {
    content.add(lodObject);
  }

  return anchor;
}

async function createInstancingObjects(
  engineScene: WebHammerEngineScene,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const batches = new Map<string, Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>>();

  engineScene.nodes.forEach((node) => {
    if (node.kind !== "instancing") {
      return;
    }

    const sourceNode = resolveInstancingSourceNode(engineScene.nodes, node.data.sourceNodeId);

    if (!sourceNode || !(sourceNode.kind === "brush" || sourceNode.kind === "mesh" || sourceNode.kind === "primitive")) {
      return;
    }

    const instances = batches.get(sourceNode.id);

    if (instances) {
      instances.push(node);
      return;
    }

    batches.set(sourceNode.id, [node]);
  });

  const objects: Object3D[] = [];

  for (const [sourceNodeId, instances] of batches) {
    const sourceNode = engineScene.nodes.find((node) => node.id === sourceNodeId);

    if (!sourceNode || !(sourceNode.kind === "brush" || sourceNode.kind === "mesh" || sourceNode.kind === "primitive")) {
      continue;
    }

    const object = await createInstancedObjectForGeometryNode(sourceNode, instances, sceneGraph, materialCache, textureCache, options);

    if (object) {
      objects.push(object);
    }
  }

  return objects;
}

async function createInstancedObjectForGeometryNode(
  sourceNode: WebHammerEngineGeometryNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const baseGroup = await createInstancedGeometryObject(sourceNode.geometry, sourceNode, instances, sceneGraph, materialCache, textureCache, options);
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !sourceNode.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${sourceNode.name}:InstancingLOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of sourceNode.lods) {
    const levelGroup = await createInstancedGeometryObject(
      level.geometry,
      sourceNode,
      instances,
      sceneGraph,
      materialCache,
      textureCache,
      options,
      level
    );
    const distance = level.level === "mid" ? lodOptions.midDistance : lodOptions.lowDistance;
    lod.addLevel(levelGroup, distance);
  }

  lod.userData.webHammer = {
    instanceNodeIds: instances.map((instance) => instance.id),
    levelOrder: ["high", ...(sourceNode.lods ?? []).map((level) => level.level)],
    sourceNodeId: sourceNode.id
  };
  return lod;
}

async function createInstancedGeometryObject(
  geometry: WebHammerExportGeometry,
  sourceNode: WebHammerEngineGeometryNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions,
  lodLevel?: WebHammerExportGeometryLod
) {
  const group = new Group();
  const pivot = sourceNode.transform.pivot ?? vec3(0, 0, 0);

  for (const primitive of geometry.primitives) {
    const primitiveGeometry = new BufferGeometry();
    primitiveGeometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
    primitiveGeometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

    if (primitive.uvs.length > 0) {
      primitiveGeometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
    }

    primitiveGeometry.setIndex(primitive.indices);
    primitiveGeometry.computeBoundingBox();
    primitiveGeometry.computeBoundingSphere();

    const material = await createThreeMaterial(primitive.material, materialCache, textureCache, options);
    const mesh = new InstancedMesh(primitiveGeometry, material, instances.length);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.name = `${sourceNode.name}:${lodLevel?.level ?? "high"}:${primitive.material.name}:instanced`;
    mesh.userData.webHammer = {
      instanceNodeIds: instances.map((instance) => instance.id),
      lodLevel: lodLevel?.level ?? "high",
      materialId: primitive.material.id,
      sourceNodeId: sourceNode.id
    };

    instances.forEach((instance, index) => {
      const worldTransform = sceneGraph.nodeWorldTransforms.get(instance.id) ?? instance.transform;
      mesh.setMatrixAt(index, composeInstancedMatrix(worldTransform, pivot));
    });

    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  group.name = `${sourceNode.name}:instances`;
  group.userData.webHammer = {
    instanceNodeIds: instances.map((instance) => instance.id),
    sourceNodeId: sourceNode.id
  };
  return group;
}

async function createLodObjectForGeometryNode(
  node: WebHammerEngineGeometryNode,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const baseGroup = await createGeometryObject(node.geometry, node, materialCache, textureCache, options);
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !node.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${node.name}:LOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of node.lods) {
    const levelGroup = await createGeometryObject(level.geometry, node, materialCache, textureCache, options, level);
    const distance = level.level === "mid" ? lodOptions.midDistance : lodOptions.lowDistance;
    lod.addLevel(levelGroup, distance);
  }

  lod.userData.webHammer = {
    levelOrder: ["high", ...(node.lods ?? []).map((level) => level.level)],
    nodeId: node.id
  };
  return lod;
}

async function createLodObjectForModelNode(
  node: WebHammerEngineModelNode,
  baseModel: Object3D,
  assetsById: Map<string, Asset>,
  options: WebHammerSceneLoaderOptions
) {
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !node.lods?.length) {
    return undefined;
  }

  const lod = new LOD();
  lod.name = `${node.name}:LOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseModel, 0);

  for (const level of node.lods) {
    const levelModel = await createModelObject(node, assetsById.get(level.assetId), options, level);
    const distance = level.level === "mid" ? lodOptions.midDistance : lodOptions.lowDistance;
    lod.addLevel(levelModel, distance);
  }

  lod.userData.webHammer = {
    levelOrder: ["high", ...(node.lods ?? []).map((level) => level.level)],
    nodeId: node.id
  };
  return lod;
}

async function createGeometryObject(
  geometry: WebHammerExportGeometry,
  node: Pick<WebHammerEngineNode, "id" | "name">,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions,
  lodLevel?: WebHammerExportGeometryLod
) {
  const group = new Group();
  const meshes: Mesh[] = [];

  for (const primitive of geometry.primitives) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

    if (primitive.uvs.length > 0) {
      geometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
    }

    geometry.setIndex(primitive.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = await createThreeMaterial(primitive.material, materialCache, textureCache, options);
    const mesh = new Mesh(geometry, material);

    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.name = `${node.name}:${lodLevel?.level ?? "high"}:${primitive.material.name}`;
    mesh.userData.webHammer = {
      lodLevel: lodLevel?.level ?? "high",
      materialId: primitive.material.id,
      nodeId: node.id
    };

    meshes.push(mesh);
  }

  meshes.forEach((mesh) => {
    group.add(mesh);
  });

  return group;
}

function resolveSceneLodOptions(lod?: WebHammerSceneLodOptions): WebHammerSceneLodOptions | undefined {
  if (!lod) {
    return undefined;
  }

  const midDistance = Math.max(0, lod.midDistance);
  const lowDistance = Math.max(midDistance + 0.01, lod.lowDistance);

  return {
    lowDistance,
    midDistance
  };
}

async function createThreeMaterial(
  materialSpec: WebHammerExportMaterial,
  materialCache: Map<string, MeshStandardMaterial>,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const cached = materialCache.get(materialSpec.id);

  if (cached) {
    return cached;
  }

  const material = new MeshStandardMaterial({
    color: materialSpec.color,
    emissive: materialSpec.emissiveColor ?? "#000000",
    emissiveIntensity: materialSpec.emissiveIntensity ?? 0,
    metalness: materialSpec.metallicFactor,
    opacity: materialSpec.transparent ? materialSpec.opacity ?? 1 : 1,
    roughness: materialSpec.roughnessFactor,
    side: resolveMaterialSide(materialSpec.side),
    transparent: materialSpec.transparent ?? false
  });

  if (materialSpec.baseColorTexture) {
    const texture = await loadTexture(materialSpec.baseColorTexture, materialSpec, "baseColorTexture", textureCache, options);
    texture.colorSpace = SRGBColorSpace;
    material.map = texture;
  }

  if (materialSpec.normalTexture) {
    material.normalMap = await loadTexture(materialSpec.normalTexture, materialSpec, "normalTexture", textureCache, options);
  }

  if (materialSpec.metallicRoughnessTexture) {
    const ormTexture = await loadTexture(
      materialSpec.metallicRoughnessTexture,
      materialSpec,
      "metallicRoughnessTexture",
      textureCache,
      options
    );
    material.metalnessMap = ormTexture;
    material.roughnessMap = ormTexture;
  }

  material.name = materialSpec.name;
  material.needsUpdate = true;
  materialCache.set(materialSpec.id, material);

  return material;
}

async function loadTexture(
  path: string,
  material: WebHammerExportMaterial,
  slot: TextureSlot,
  textureCache: Map<string, Promise<Texture>>,
  options: WebHammerSceneLoaderOptions
) {
  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        kind: "texture",
        material,
        path,
        slot
      })
    : path;
  const cacheKey = `${slot}:${resolvedPath}`;
  const cached = textureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pendingTexture = textureLoader.loadAsync(resolvedPath);
  const configuredTexture = pendingTexture.then((texture) => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
  textureCache.set(
    cacheKey,
    configuredTexture
  );
  return configuredTexture;
}

async function createModelObject(
  node: Extract<WebHammerEngineNode, { kind: "model" }>,
  asset: Asset | undefined,
  options: WebHammerSceneLoaderOptions,
  lodLevel?: WebHammerExportModelLod
) {
  const fallback = createMissingModelFallback(asset);
  const modelPath = asset?.path ?? node.data.path;

  if (!modelPath) {
    return fallback;
  }

  const format = resolveModelFormat(asset?.metadata.modelFormat, modelPath);
  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        asset,
        format,
        kind: "model",
        node,
        path: modelPath
      })
    : modelPath;
  const texturePath = readAssetString(asset, "texturePath");
  const resolvedTexturePath =
    texturePath && options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "texture",
          material: {
            color: "#ffffff",
            id: `material:model-texture:${node.id}`,
            metallicFactor: 0,
            name: `${node.name} Model Texture`,
            roughnessFactor: 1
          },
          path: texturePath,
          slot: "baseColorTexture"
        })
      : texturePath;

  try {
    const object =
      format === "obj"
        ? await loadObjModel(asset, resolvedPath, resolvedTexturePath)
        : await loadGltfModel(asset, resolvedPath);

    object.name = `${node.name}:${lodLevel?.level ?? "high"}`;
    object.userData.webHammer = {
      ...(object.userData.webHammer ?? {}),
      lodLevel: lodLevel?.level ?? "high",
      nodeId: node.id
    };
    return object;
  } catch {
    fallback.name = `${node.name}:${lodLevel?.level ?? "high"}:fallback`;
    fallback.userData.webHammer = {
      ...(fallback.userData.webHammer ?? {}),
      lodLevel: lodLevel?.level ?? "high",
      nodeId: node.id
    };
    return fallback;
  }
}

async function loadObjModel(asset: Asset | undefined, resolvedPath: string, resolvedTexturePath?: string) {
  const objLoader = new OBJLoader();
  const mtlText = readAssetString(asset, "materialMtlText");

  if (mtlText) {
    const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, resolvedTexturePath), "");
    materialCreator.preload();
    objLoader.setMaterials(materialCreator);
  }

  const object = await objLoader.loadAsync(resolvedPath);

  if (!mtlText && resolvedTexturePath) {
    const texture = await textureLoader.loadAsync(resolvedTexturePath);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;

    object.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        child.material = new MeshStandardMaterial({
          map: texture,
          metalness: 0.12,
          roughness: 0.76
        });
      }
    });
  }

  centerObject(object, readAssetVec3(asset, "nativeCenter"));
  return object;
}

async function loadGltfModel(asset: Asset | undefined, resolvedPath: string) {
  const gltf = await gltfLoader.loadAsync(resolvedPath);
  const object = gltf.scene;
  centerObject(object, readAssetVec3(asset, "nativeCenter"));
  object.userData.webHammer = {
    ...(object.userData.webHammer ?? {}),
    animations: gltf.animations
  };
  return object;
}

function centerObject(object: Object3D, center: Vec3 | undefined) {
  const resolvedCenter = center ?? computeObjectCenter(object);
  object.position.set(-resolvedCenter.x, -resolvedCenter.y, -resolvedCenter.z);
}

function computeObjectCenter(object: Object3D) {
  const box = new Box3().setFromObject(object);
  const center = box.getCenter(new Vector3());

  return {
    x: center.x,
    y: center.y,
    z: center.z
  };
}

function createMissingModelFallback(asset: Asset | undefined) {
  const previewColor = readAssetString(asset, "previewColor") ?? "#7f8ea3";
  const size = readAssetVec3(asset, "nativeSize") ?? { x: 1.4, y: 1.4, z: 1.4 };
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  const material = new MeshStandardMaterial({
    color: previewColor,
    metalness: 0.08,
    roughness: 0.72
  });
  const mesh = new Mesh(geometry, material);

  mesh.name = "Missing Model";
  return mesh;
}

function createThreeLight(node: Extract<WebHammerEngineNode, { kind: "light" }>) {
  if (!node.data.enabled) {
    return undefined;
  }

  switch (node.data.type) {
    case "ambient": {
      return new AmbientLight(node.data.color, node.data.intensity);
    }
    case "hemisphere": {
      const light = new HemisphereLight(node.data.color, node.data.groundColor ?? "#0f1721", node.data.intensity);
      return light;
    }
    case "point": {
      const light = new PointLight(node.data.color, node.data.intensity, node.data.distance ?? 0, node.data.decay ?? 2);
      light.castShadow = node.data.castShadow;
      return light;
    }
    case "directional": {
      const group = new Group();
      const light = new DirectionalLight(node.data.color, node.data.intensity);
      const target = new Object3D();

      light.castShadow = node.data.castShadow;
      target.position.set(0, 0, -6);
      group.add(light);
      group.add(target);
      light.target = target;
      return group;
    }
    case "spot": {
      const group = new Group();
      const light = new SpotLight(
        node.data.color,
        node.data.intensity,
        node.data.distance ?? 0,
        node.data.angle ?? Math.PI / 3,
        node.data.penumbra ?? 0,
        node.data.decay ?? 2
      );
      const target = new Object3D();

      light.castShadow = node.data.castShadow;
      target.position.set(0, 0, -6);
      group.add(light);
      group.add(target);
      light.target = target;
      return group;
    }
    default:
      return undefined;
  }
}

function applyTransform(object: Object3D, transform: Transform) {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ");
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

function composeInstancedMatrix(transform: Transform, pivot: Vec3) {
  return new Matrix4()
    .compose(
      new Vector3(transform.position.x, transform.position.y, transform.position.z),
      new Quaternion().setFromEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ")),
      new Vector3(transform.scale.x, transform.scale.y, transform.scale.z)
    )
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

function extractPhysics(node: WebHammerEngineNode) {
  if (node.kind === "primitive") {
    return node.data.physics;
  }

  if (node.kind === "mesh") {
    return node.data.physics;
  }

  return undefined;
}

function findPrimaryLight(object: Object3D) {
  let resolved: Object3D | undefined;

  object.traverse((child: Object3D) => {
    if (!resolved && "isLight" in child && child.isLight) {
      resolved = child;
    }
  });

  return resolved;
}

function resolveModelFormat(format: unknown, path: string): "gltf" | "obj" {
  if (typeof format === "string" && format.toLowerCase() === "obj") {
    return "obj";
  }

  return path.toLowerCase().endsWith(".obj") ? "obj" : "gltf";
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

function resolveMaterialSide(side?: MaterialRenderSide) {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
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
