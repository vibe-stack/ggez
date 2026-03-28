import type { Asset, PropPhysics, Transform, Vec3 } from "@ggez/shared";
import { resolveInstancingSourceNode, resolveSceneGraph, vec3 } from "@ggez/shared";
import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LOD,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SpotLight,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type {
  WebHammerEngineGeometryNode,
  WebHammerEngineModelNode,
  WebHammerEngineNode,
  WebHammerEngineScene,
  WebHammerExportGeometry,
  WebHammerExportGeometryLod,
  WebHammerExportMaterial,
  WebHammerExportModelLod
} from "./types";
import type { WebHammerSceneLoaderOptions, WebHammerSceneLodOptions } from "./loader";

type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

type WebHammerSceneObjectFactoryOptions = Pick<
  WebHammerSceneLoaderOptions,
  "castShadow" | "lod" | "receiveShadow" | "resolveAssetUrl"
>;

type CreateNodeObjectOverrides = {
  transform?: Transform;
};

type ModelReference = {
  asset?: Asset;
  assetId?: string;
  center?: Vec3;
  fallbackName: string;
  format: "gltf" | "obj";
  modelPath?: string;
  nodeId: string;
  nodeName: string;
  texturePath?: string;
};

type WebHammerSceneObjectFactoryResources = {
  assetsById: Map<string, Asset>;
  materialCache: Map<string, MeshStandardMaterial>;
  modelTemplateCache: Map<string, Promise<Object3D>>;
  textureCache: Map<string, Promise<Texture>>;
};

const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const modelTextureLoader = new TextureLoader();
const tempModelInstanceMatrix = new Matrix4();
const tempModelChildMatrix = new Matrix4();
const tempPivotMatrix = new Matrix4();
const tempInstancePosition = new Vector3();
const tempInstanceQuaternion = new Quaternion();
const tempInstanceScale = new Vector3();

export type WebHammerSceneObjectFactory = {
  createInstancingObjects: () => Promise<Object3D[]>;
  createNodeObject: (node: WebHammerEngineNode, overrides?: CreateNodeObjectOverrides) => Promise<Object3D>;
};

export function createWebHammerSceneObjectFactory(
  engineScene: Pick<WebHammerEngineScene, "assets" | "nodes">,
  options: WebHammerSceneObjectFactoryOptions = {}
): WebHammerSceneObjectFactory {
  const resources: WebHammerSceneObjectFactoryResources = {
    assetsById: new Map(engineScene.assets.map((asset) => [asset.id, asset])),
    materialCache: new Map(),
    modelTemplateCache: new Map(),
    textureCache: new Map()
  };

  return {
    createInstancingObjects: () => createInstancingObjects(engineScene, resources, options),
    createNodeObject: (node, overrides) => createObjectForNode(node, resources, options, overrides)
  };
}

export const createThreeRuntimeObjectFactory = createWebHammerSceneObjectFactory;

async function createObjectForNode(
  node: WebHammerEngineNode,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  overrides?: CreateNodeObjectOverrides
) {
  const anchor = new Group();
  const content = new Group();
  const transform = overrides?.transform ?? node.transform;
  const pivot = transform.pivot;

  anchor.name = node.name;
  applyTransform(anchor, transform);
  anchor.userData.webHammer = {
    data: node.data,
    hooks: node.hooks,
    id: node.id,
    kind: node.kind,
    metadata: node.metadata,
    tags: node.tags
  };

  if (pivot && node.kind !== "model") {
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

  if (node.kind === "group") {
    return anchor;
  }

  if (node.kind === "instancing") {
    anchor.visible = false;
    return anchor;
  }

  if (node.kind === "model") {
    const modelObject = await createModelObject(node, resources, options);
    const lodObject = await createLodObjectForModelNode(node, modelObject, resources, options);
    content.add(lodObject ?? modelObject);
    return anchor;
  }

  const lodObject = await createLodObjectForGeometryNode(node, resources, options);

  if (lodObject) {
    content.add(lodObject);
  }

  return anchor;
}

async function createInstancingObjects(
  engineScene: Pick<WebHammerEngineScene, "assets" | "nodes">,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const sceneGraph = resolveSceneGraph(engineScene.nodes);
  const batches = new Map<string, Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>>();

  engineScene.nodes.forEach((node) => {
    if (node.kind !== "instancing") {
      return;
    }

    const sourceNode = resolveInstancingSourceNode(engineScene.nodes, node.data.sourceNodeId);

    if (!sourceNode) {
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
    const sourceNode = resolveInstancingSourceNode(engineScene.nodes, sourceNodeId);

    if (!sourceNode) {
      continue;
    }

    const exportedSourceNode = engineScene.nodes.find((node) => node.id === sourceNode.id);

    if (!exportedSourceNode || exportedSourceNode.kind === "group" || exportedSourceNode.kind === "instancing" || exportedSourceNode.kind === "light") {
      continue;
    }

    const object =
      exportedSourceNode.kind === "model"
        ? await createInstancedObjectForModelNode(exportedSourceNode, instances, sceneGraph, resources, options)
        : await createInstancedObjectForGeometryNode(exportedSourceNode, instances, sceneGraph, resources, options);

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
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const baseGroup = await createInstancedGeometryObject(sourceNode.geometry, sourceNode, instances, sceneGraph, resources, options);
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
      resources,
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
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
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

    const material = await createThreeMaterial(primitive.material, resources, options);
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
      mesh.setMatrixAt(index, composeGeometryInstanceMatrix(worldTransform, pivot));
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

async function createInstancedObjectForModelNode(
  sourceNode: WebHammerEngineModelNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const baseGroup = await createInstancedModelObject(sourceNode, instances, sceneGraph, resources, options);
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !sourceNode.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${sourceNode.name}:InstancingLOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of sourceNode.lods) {
    const levelGroup = await createInstancedModelObject(sourceNode, instances, sceneGraph, resources, options, level);
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

async function createInstancedModelObject(
  sourceNode: WebHammerEngineModelNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  lodLevel?: WebHammerExportModelLod
) {
  const group = new Group();
  const template = await loadModelTemplate(resolveModelReference(sourceNode, resources.assetsById, lodLevel), options, resources);
  const templateInstanceNodeIds = instances.map((instance) => instance.id);
  let modelMeshIndex = 0;

  template.updateMatrixWorld(true);

  template.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) {
      return;
    }

    const instancedMesh = new InstancedMesh(child.geometry, child.material, instances.length);
    instancedMesh.castShadow = options.castShadow ?? true;
    instancedMesh.receiveShadow = options.receiveShadow ?? true;
    instancedMesh.name = `${sourceNode.name}:${lodLevel?.level ?? "high"}:${child.name || modelMeshIndex}:instanced`;
    instancedMesh.userData.webHammer = {
      instanceNodeIds: templateInstanceNodeIds,
      lodLevel: lodLevel?.level ?? "high",
      modelMeshIndex,
      sourceNodeId: sourceNode.id
    };

    tempModelChildMatrix.copy(child.matrixWorld);

    instances.forEach((instance, index) => {
      const worldTransform = sceneGraph.nodeWorldTransforms.get(instance.id) ?? instance.transform;
      tempModelInstanceMatrix.copy(composeTransformMatrix(worldTransform)).multiply(tempModelChildMatrix);
      instancedMesh.setMatrixAt(index, tempModelInstanceMatrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    group.add(instancedMesh);
    modelMeshIndex += 1;
  });

  group.name = `${sourceNode.name}:instances`;
  group.userData.webHammer = {
    instanceNodeIds: templateInstanceNodeIds,
    sourceNodeId: sourceNode.id
  };
  return group;
}

async function createLodObjectForGeometryNode(
  node: WebHammerEngineGeometryNode,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const baseGroup = await createGeometryObject(node.geometry, node, resources, options);
  const lodOptions = resolveSceneLodOptions(options.lod);

  if (!lodOptions || !node.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${node.name}:LOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of node.lods) {
    const levelGroup = await createGeometryObject(level.geometry, node, resources, options, level);
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
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
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
    const levelModel = await createModelObject(node, resources, options, level);
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
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  lodLevel?: WebHammerExportGeometryLod
) {
  const group = new Group();
  const meshes: Mesh[] = [];

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

    const material = await createThreeMaterial(primitive.material, resources, options);
    const mesh = new Mesh(primitiveGeometry, material);

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

async function createThreeMaterial(
  materialSpec: WebHammerExportMaterial,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const cached = resources.materialCache.get(materialSpec.id);

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
    const texture = await loadTexture(materialSpec.baseColorTexture, materialSpec, "baseColorTexture", resources, options);
    texture.colorSpace = SRGBColorSpace;
    material.map = texture;
  }

  if (materialSpec.normalTexture) {
    material.normalMap = await loadTexture(materialSpec.normalTexture, materialSpec, "normalTexture", resources, options);
  }

  if (materialSpec.metallicRoughnessTexture) {
    const ormTexture = await loadTexture(
      materialSpec.metallicRoughnessTexture,
      materialSpec,
      "metallicRoughnessTexture",
      resources,
      options
    );
    material.metalnessMap = ormTexture;
    material.roughnessMap = ormTexture;
  }

  material.name = materialSpec.name;
  material.needsUpdate = true;
  resources.materialCache.set(materialSpec.id, material);

  return material;
}

async function loadTexture(
  path: string,
  material: WebHammerExportMaterial,
  slot: TextureSlot,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
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
  const cached = resources.textureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pendingTexture = textureLoader.loadAsync(resolvedPath);
  const configuredTexture = pendingTexture.then((texture) => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
  resources.textureCache.set(cacheKey, configuredTexture);
  return configuredTexture;
}

async function createModelObject(
  node: WebHammerEngineModelNode,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  lodLevel?: WebHammerExportModelLod
) {
  const template = await loadModelTemplate(resolveModelReference(node, resources.assetsById, lodLevel), options, resources);
  const clone = template.clone(true);

  clone.name = `${node.name}:${lodLevel?.level ?? "high"}`;
  clone.userData.webHammer = {
    ...(clone.userData.webHammer ?? {}),
    lodLevel: lodLevel?.level ?? "high",
    nodeId: node.id
  };
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = options.castShadow ?? true;
      child.receiveShadow = options.receiveShadow ?? true;
    }
  });

  return clone;
}

function resolveModelReference(
  node: WebHammerEngineModelNode,
  assetsById: Map<string, Asset>,
  lodLevel?: WebHammerExportModelLod
): ModelReference {
  const asset = lodLevel ? assetsById.get(lodLevel.assetId) : assetsById.get(node.data.assetId);
  const modelPath = asset?.path ?? node.data.path;

  return {
    asset,
    assetId: asset?.id ?? (lodLevel ? lodLevel.assetId : node.data.assetId),
    center: readAssetVec3(asset, "nativeCenter"),
    fallbackName: `${node.name}:${lodLevel?.level ?? "high"}:fallback`,
    format: resolveModelFormat(asset?.metadata.modelFormat, modelPath),
    modelPath,
    nodeId: node.id,
    nodeName: node.name,
    texturePath: readAssetString(asset, "texturePath")
  };
}

async function loadModelTemplate(
  reference: ModelReference,
  options: WebHammerSceneObjectFactoryOptions,
  resources: WebHammerSceneObjectFactoryResources
) {
  if (!reference.modelPath) {
    return createMissingModelFallback(reference.asset, reference.fallbackName);
  }

  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        asset: reference.asset,
        format: reference.format,
        kind: "model",
        node: {
          data: {
            assetId: reference.assetId ?? "",
            path: reference.modelPath
          },
          id: reference.nodeId,
          kind: "model",
          name: reference.nodeName,
          transform: {
            position: vec3(0, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        },
        path: reference.modelPath
      })
    : reference.modelPath;
  const resolvedTexturePath =
    reference.texturePath && options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "texture",
          material: {
            color: "#ffffff",
            id: `material:model-texture:${reference.nodeId}`,
            metallicFactor: 0,
            name: `${reference.nodeName} Model Texture`,
            roughnessFactor: 1
          },
          path: reference.texturePath,
          slot: "baseColorTexture"
        })
      : reference.texturePath;
  const cacheKey = `${reference.format}:${resolvedPath}:${resolvedTexturePath ?? ""}:${readAssetString(reference.asset, "materialMtlText") ?? ""}`;
  const cached = resources.modelTemplateCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = (async () => {
    try {
      const object =
        reference.format === "obj"
          ? await loadObjModel(reference.asset, resolvedPath, resolvedTexturePath)
          : await loadGltfModel(reference.asset, resolvedPath);
      centerObject(object, reference.center);
      return object;
    } catch (error) {
      console.warn(
        `Failed to load model \"${reference.nodeName}\" from ${resolvedPath}. Falling back to placeholder geometry.`,
        error
      );
      return createMissingModelFallback(reference.asset, reference.fallbackName);
    }
  })();

  resources.modelTemplateCache.set(cacheKey, pending);
  return pending;
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
    const texture = await loadModelTexture(resolvedTexturePath);

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

  return object;
}

async function loadGltfModel(asset: Asset | undefined, resolvedPath: string) {
  const response = await fetch(resolvedPath);

  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
  }

  const payload = isJsonGltfPath(resolvedPath)
    ? await response.text()
    : await response.arrayBuffer();
  const gltf = await new Promise<Awaited<ReturnType<typeof gltfLoader.loadAsync>>>((resolve, reject) => {
    gltfLoader.parse(payload, resolveAssetBasePath(resolvedPath), resolve, reject);
  });
  const object = gltf.scene;
  object.userData.webHammer = {
    ...(object.userData.webHammer ?? {}),
    animations: gltf.animations,
    nativeCenter: readAssetVec3(asset, "nativeCenter")
  };
  return object;
}

async function loadModelTexture(path: string) {
  const texture = await modelTextureLoader.loadAsync(path);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
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

function createMissingModelFallback(asset: Asset | undefined, name = "Missing Model") {
  const previewColor = readAssetString(asset, "previewColor") ?? "#7f8ea3";
  const size = readAssetVec3(asset, "nativeSize") ?? { x: 1.4, y: 1.4, z: 1.4 };
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  const material = new MeshStandardMaterial({
    color: previewColor,
    metalness: 0.08,
    roughness: 0.72
  });
  const mesh = new Mesh(geometry, material);

  mesh.name = name;
  return mesh;
}

function isJsonGltfPath(path: string) {
  return stripUrlSearchAndHash(path).toLowerCase().endsWith(".gltf");
}

function resolveAssetBasePath(path: string) {
  if (typeof window !== "undefined") {
    return new URL(".", new URL(path, window.location.href)).toString();
  }

  const normalizedPath = stripUrlSearchAndHash(path);
  const slashIndex = normalizedPath.lastIndexOf("/");
  return slashIndex >= 0 ? normalizedPath.slice(0, slashIndex + 1) : "";
}

function stripUrlSearchAndHash(path: string) {
  const searchIndex = path.search(/[?#]/);
  return searchIndex >= 0 ? path.slice(0, searchIndex) : path;
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
      return new HemisphereLight(node.data.color, node.data.groundColor ?? "#0f1721", node.data.intensity);
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
      group.add(target);
      group.add(light);
      light.target = target;
      return group;
    }
    case "spot": {
      const group = new Group();
      const light = new SpotLight(
        node.data.color,
        node.data.intensity,
        node.data.distance,
        node.data.angle,
        node.data.penumbra,
        node.data.decay
      );
      const target = new Object3D();
      light.castShadow = node.data.castShadow;
      target.position.set(0, 0, -6);
      group.add(target);
      group.add(light);
      light.target = target;
      return group;
    }
    default:
      return undefined;
  }
}

function applyTransform(object: Object3D, transform: Transform) {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

function composeGeometryInstanceMatrix(transform: Transform, pivot: Vec3) {
  return composeTransformMatrix(transform).multiply(
    tempPivotMatrix.makeTranslation(-pivot.x, -pivot.y, -pivot.z)
  );
}

function composeTransformMatrix(transform: Transform) {
  tempInstancePosition.set(transform.position.x, transform.position.y, transform.position.z);
  tempInstanceQuaternion.setFromEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ"));
  tempInstanceScale.set(transform.scale.x, transform.scale.y, transform.scale.z);

  return new Matrix4().compose(tempInstancePosition, tempInstanceQuaternion, tempInstanceScale);
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

function resolveMaterialSide(side?: WebHammerExportMaterial["side"]) {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

function resolveModelFormat(format: unknown, path?: string): "gltf" | "obj" {
  if (typeof format === "string" && format.toLowerCase() === "obj") {
    return "obj";
  }

  return path?.toLowerCase().endsWith(".obj") ? "obj" : "gltf";
}

function readAssetString(asset: Asset | undefined, key: string) {
  const value = asset?.metadata[key];
  return typeof value === "string" ? value : undefined;
}

function readAssetVec3(asset: Asset | undefined, keyPrefix: "nativeCenter" | "nativeSize") {
  const x = asset?.metadata[`${keyPrefix}X`];
  const y = asset?.metadata[`${keyPrefix}Y`];
  const z = asset?.metadata[`${keyPrefix}Z`];

  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    return undefined;
  }

  return { x, y, z };
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

  return hasDiffuseMap
    ? normalized
    : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}

export function extractPhysics(node: WebHammerEngineNode): PropPhysics | undefined {
  if (node.kind === "primitive") {
    return node.data.physics;
  }

  if (node.kind === "mesh") {
    return node.data.physics;
  }

  return undefined;
}

export function findPrimaryLight(object: Object3D) {
  if ("isLight" in object && object.isLight) {
    return object;
  }

  return object.children.find((child) => "isLight" in child && child.isLight);
}
