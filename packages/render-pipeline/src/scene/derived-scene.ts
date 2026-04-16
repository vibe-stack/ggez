import type {
  Asset,
  AssetID,
  Entity,
  GeometryNode,
  LightNodeData,
  Material,
  MaterialID,
  NodeID,
  TextureRecord,
  Transform,
  Vec3
} from "@ggez/shared";
import {
  cloneMaterialWithResolvedTextureSources,
  createTextureRecordMap,
  isGroupNode,
  isInstancingNode,
  isLightNode,
  resolveInstancingSourceNode,
  resolveSceneGraph,
  vec3
} from "@ggez/shared";
import { createDerivedRenderMesh, buildEditableMeshFaceMap, recomputeBlendLayerWeightsFromFaceMap, type DerivedRenderMesh, type DerivedSurfaceFaceMap } from "../meshes/render-mesh";

export type DerivedEntityMarker = {
  entityId: Entity["id"];
  entityType: Entity["type"];
  label: string;
  position: Vec3;
  properties: Entity["properties"];
  scale: Transform["scale"];
  rotation: Vec3;
  color: string;
};

export type DerivedLight = {
  color: string;
  data: LightNodeData;
  nodeId: string;
  position: Vec3;
  rotation: Vec3;
};

export type DerivedGroupMarker = {
  label: string;
  nodeId: string;
  position: Vec3;
  rotation: Vec3;
  scale: Transform["scale"];
};

export type DerivedRenderInstance = {
  label: string;
  nodeId: NodeID;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type DerivedInstancedMesh = {
  batchId: string;
  instances: DerivedRenderInstance[];
  mesh: DerivedRenderMesh;
  sourceNodeId: NodeID;
};

export type DerivedRenderScene = {
  instancedMeshes: DerivedInstancedMesh[];
  lights: DerivedLight[];
  meshes: DerivedRenderMesh[];
  groups: DerivedGroupMarker[];
  entityMarkers: DerivedEntityMarker[];
  boundsCenter: Vec3;
  entityTransforms: Map<Entity["id"], Transform>;
  nodeTransforms: Map<NodeID, Transform>;
};

type CachedDerivedRenderMeshEntry = {
  mesh: DerivedRenderMesh;
  sourceKind: GeometryNode["kind"];
  name: string;
  transform: GeometryNode["transform"];
  position: GeometryNode["transform"]["position"];
  rotation: GeometryNode["transform"]["rotation"];
  scale: GeometryNode["transform"]["scale"];
  pivot?: GeometryNode["transform"]["pivot"];
  data: GeometryNode["data"];
  faces?: unknown;
  halfEdges?: unknown;
  physics?: unknown;
  planes?: unknown;
  previewSize?: unknown;
  vertices?: unknown;
  /** Pre-computed face map used by the weights-only fast path. Only set for mesh nodes. */
  meshFaceMap?: DerivedSurfaceFaceMap;
};

export type DerivedRenderSceneCache = {
  assetRefs: Map<AssetID, Asset>;
  materialRefs: Map<MaterialID, Material>;
  textureRefs: Map<TextureRecord["id"], TextureRecord>;
  meshEntries: Map<NodeID, CachedDerivedRenderMeshEntry>;
};

export function createDerivedRenderSceneCache(): DerivedRenderSceneCache {
  return {
    assetRefs: new Map(),
    materialRefs: new Map(),
    textureRefs: new Map(),
    meshEntries: new Map()
  };
}

export function deriveRenderScene(
  nodes: Iterable<GeometryNode>,
  entities: Iterable<Entity> = [],
  materials: Iterable<Material> = [],
  assets: Iterable<Asset> = [],
  textures: Iterable<TextureRecord> = []
): DerivedRenderScene {
  return deriveRenderSceneCached(nodes, entities, materials, assets, createDerivedRenderSceneCache(), textures);
}

export function deriveRenderSceneCached(
  nodes: Iterable<GeometryNode>,
  entities: Iterable<Entity> = [],
  materials: Iterable<Material> = [],
  assets: Iterable<Asset> = [],
  cache: DerivedRenderSceneCache,
  textures: Iterable<TextureRecord> = []
): DerivedRenderScene {
  const materialList = Array.from(materials);
  const assetList = Array.from(assets);
  const textureList = Array.from(textures);
  const sourceNodes = Array.from(nodes);
  const sourceEntities = Array.from(entities);
  const texturesById = createTextureRecordMap(textureList);
  const materialsById = new Map(
    materialList.map((material) => [material.id, cloneMaterialWithResolvedTextureSources(material, texturesById)] as const)
  );
  const assetsById = new Map(assetList.map((asset) => [asset.id, asset] as const));
  const materialsChanged = haveReferencedValuesChanged(materialList, cache.materialRefs);
  const assetsChanged = haveReferencedValuesChanged(assetList, cache.assetRefs);
  const texturesChanged = haveReferencedValuesChanged(textureList, cache.textureRefs);
  const shouldRebuildAllMeshes = materialsChanged || assetsChanged || texturesChanged;
  const meshes: DerivedRenderMesh[] = [];
  const instancedMeshes: DerivedInstancedMesh[] = [];
  const lights: DerivedLight[] = [];
  const groups: DerivedGroupMarker[] = [];
  const activeMeshIds = new Set<NodeID>();
  const sceneGraph = resolveSceneGraph(sourceNodes, sourceEntities);

  sourceNodes.forEach((node) => {
    const worldTransform = sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform;

    if (isGroupNode(node)) {
      groups.push({
        label: node.name,
        nodeId: node.id,
        position: worldTransform.position,
        rotation: worldTransform.rotation,
        scale: worldTransform.scale
      });
      return;
    }

    if (isLightNode(node)) {
      lights.push({
        color: node.data.color,
        data: node.data,
        nodeId: node.id,
        position: worldTransform.position,
        rotation: worldTransform.rotation
      });
      return;
    }

    if (isInstancingNode(node)) {
      return;
    }

    activeMeshIds.add(node.id);

    const cached = cache.meshEntries.get(node.id);
    const isStale = shouldRebuildAllMeshes || !cached || isCachedMeshEntryStale(node, worldTransform, cached);
    const meshEntry =
      !isStale
        ? cached!
        : !shouldRebuildAllMeshes && cached && isTransformOnlyChange(node, worldTransform, cached)
          ? patchCachedMeshEntryTransform(cached, worldTransform)
        : !shouldRebuildAllMeshes && cached && isMaterialLayersOnlyChange(node, worldTransform, cached)
          ? patchCachedMeshEntryBlendWeights(cached, node, materialsById)
          : createCachedMeshEntry(node, worldTransform, materialsById, assetsById);

    cache.meshEntries.set(node.id, meshEntry);
    meshes.push(meshEntry.mesh);
  });

  Array.from(cache.meshEntries.keys()).forEach((nodeId) => {
    if (!activeMeshIds.has(nodeId)) {
      cache.meshEntries.delete(nodeId);
    }
  });

  const instancedMeshBatches = new Map<NodeID, DerivedInstancedMesh>();

  sourceNodes.forEach((node) => {
    if (!isInstancingNode(node)) {
      return;
    }

    const worldTransform = sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform;
    const sourceNode = resolveInstancingSourceNode(sourceNodes, node);

    if (!sourceNode) {
      return;
    }

    const sourceMesh = cache.meshEntries.get(sourceNode.id)?.mesh;

    if (!sourceMesh || (!sourceMesh.surface && !sourceMesh.primitive && !sourceMesh.modelPath)) {
      return;
    }

    const existingBatch = instancedMeshBatches.get(sourceNode.id);

    if (existingBatch) {
      existingBatch.instances.push({
        label: node.name,
        nodeId: node.id,
        position: worldTransform.position,
        rotation: worldTransform.rotation,
        scale: worldTransform.scale
      });
      return;
    }

    instancedMeshBatches.set(sourceNode.id, {
      batchId: `instancing:${sourceNode.id}`,
      instances: [
        {
          label: node.name,
          nodeId: node.id,
          position: worldTransform.position,
          rotation: worldTransform.rotation,
          scale: worldTransform.scale
        }
      ],
      mesh: sourceMesh,
      sourceNodeId: sourceNode.id
    });
  });

  instancedMeshes.push(...instancedMeshBatches.values());

  replaceReferenceMap(cache.materialRefs, materialList);
  replaceReferenceMap(cache.assetRefs, assetList);
  replaceReferenceMap(cache.textureRefs, textureList);

  const entityMarkers = Array.from(sourceEntities, (entity) => ({
    entityId: entity.id,
    entityType: entity.type,
    label: entity.name,
    position: (sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform).position,
    properties: entity.properties,
    scale: (sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform).scale,
    rotation: (sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform).rotation,
    color:
      entity.type === "player-spawn"
        ? "#7dd3fc"
        : entity.type === "npc-spawn"
          ? "#fbbf24"
          : entity.type === "vfx-object"
            ? "#2dd4bf"
          : "#c084fc"
  }));

  if (meshes.length === 0 && instancedMeshes.length === 0) {
    return {
      entityTransforms: sceneGraph.entityWorldTransforms,
      instancedMeshes,
      lights,
      meshes,
      groups,
      entityMarkers,
      boundsCenter: vec3(0, 0, 0),
      nodeTransforms: sceneGraph.nodeWorldTransforms
    };
  }

  const center = meshes.reduce(
    (accumulator, mesh) => ({
      x: accumulator.x + mesh.position.x,
      y: accumulator.y + mesh.position.y,
      z: accumulator.z + mesh.position.z
    }),
    vec3(0, 0, 0)
  );
  const instanceCenter = instancedMeshes.reduce(
    (accumulator, batch) =>
      batch.instances.reduce(
        (batchAccumulator, instance) => ({
          x: batchAccumulator.x + instance.position.x,
          y: batchAccumulator.y + instance.position.y,
          z: batchAccumulator.z + instance.position.z
        }),
        accumulator
      ),
    center
  );
  const totalRenderableCount = meshes.length + instancedMeshes.reduce((sum, batch) => sum + batch.instances.length, 0);

  return {
    entityTransforms: sceneGraph.entityWorldTransforms,
    instancedMeshes,
    lights,
    meshes,
    groups,
    entityMarkers,
    boundsCenter:
      totalRenderableCount > 0
        ? vec3(
            instanceCenter.x / totalRenderableCount,
            instanceCenter.y / totalRenderableCount,
            instanceCenter.z / totalRenderableCount
          )
        : vec3(0, 0, 0),
    nodeTransforms: sceneGraph.nodeWorldTransforms
  };
}

function createCachedMeshEntry(
  node: Exclude<GeometryNode, { kind: "group" | "light" }>,
  worldTransform: Transform,
  materialsById: Map<MaterialID, Material>,
  assetsById: Map<AssetID, Asset>
): CachedDerivedRenderMeshEntry {
  const meshFaceMap =
    node.kind === "mesh"
      ? buildEditableMeshFaceMap(node.data)
      : undefined;

  return {
    mesh: createDerivedRenderMesh(node, materialsById, assetsById, worldTransform),
    sourceKind: node.kind,
    name: node.name,
    transform: structuredClone(worldTransform),
    position: structuredClone(worldTransform.position),
    rotation: structuredClone(worldTransform.rotation),
    scale: structuredClone(worldTransform.scale),
    pivot: worldTransform.pivot,
    data: node.data,
    faces: "faces" in node.data ? node.data.faces : undefined,
    halfEdges: "halfEdges" in node.data ? node.data.halfEdges : undefined,
    physics: "physics" in node.data ? node.data.physics : undefined,
    planes: "planes" in node.data ? node.data.planes : undefined,
    previewSize: "previewSize" in node.data ? node.data.previewSize : undefined,
    vertices: "vertices" in node.data ? node.data.vertices : undefined,
    meshFaceMap
  };
}

function isCachedMeshEntryStale(
  node: Exclude<GeometryNode, { kind: "group" | "light" }>,
  worldTransform: Transform,
  cached: CachedDerivedRenderMeshEntry
) {
  return (
    cached.sourceKind !== node.kind ||
    cached.name !== node.name ||
    cached.data !== node.data ||
    cached.faces !== ("faces" in node.data ? node.data.faces : undefined) ||
    cached.halfEdges !== ("halfEdges" in node.data ? node.data.halfEdges : undefined) ||
    cached.physics !== ("physics" in node.data ? node.data.physics : undefined) ||
    cached.planes !== ("planes" in node.data ? node.data.planes : undefined) ||
    cached.previewSize !== ("previewSize" in node.data ? node.data.previewSize : undefined) ||
    cached.vertices !== ("vertices" in node.data ? node.data.vertices : undefined) ||
    hasTransformValuesChanged(worldTransform, cached)
  );
}

/**
 * Returns true when the only reason the staleness check fired is that `materialLayers` changed
 * while all structural data (vertices, faces, half-edges, topology) stayed the same. In this
 * case we can skip the full geometry rebuild and only recompute blend-weight attributes.
 */
function isMaterialLayersOnlyChange(
  node: Exclude<GeometryNode, { kind: "group" | "light" }>,
  worldTransform: Transform,
  cached: CachedDerivedRenderMeshEntry
): node is Extract<typeof node, { kind: "mesh" }> {
  return (
    node.kind === "mesh" &&
    cached.sourceKind === node.kind &&
    cached.name === node.name &&
    !hasTransformValuesChanged(worldTransform, cached) &&
    cached.vertices !== undefined &&
    cached.vertices === ("vertices" in node.data ? node.data.vertices : undefined) &&
    cached.faces === ("faces" in node.data ? node.data.faces : undefined) &&
    cached.halfEdges === ("halfEdges" in node.data ? node.data.halfEdges : undefined) &&
    cached.planes === ("planes" in node.data ? node.data.planes : undefined) &&
    cached.physics === ("physics" in node.data ? node.data.physics : undefined) &&
    cached.previewSize === ("previewSize" in node.data ? node.data.previewSize : undefined)
  );
}

function isTransformOnlyChange(
  node: Exclude<GeometryNode, { kind: "group" | "light" }>,
  worldTransform: Transform,
  cached: CachedDerivedRenderMeshEntry
) {
  return (
    cached.sourceKind === node.kind &&
    cached.name === node.name &&
    cached.data === node.data &&
    cached.faces === ("faces" in node.data ? node.data.faces : undefined) &&
    cached.halfEdges === ("halfEdges" in node.data ? node.data.halfEdges : undefined) &&
    cached.physics === ("physics" in node.data ? node.data.physics : undefined) &&
    cached.planes === ("planes" in node.data ? node.data.planes : undefined) &&
    cached.previewSize === ("previewSize" in node.data ? node.data.previewSize : undefined) &&
    cached.vertices === ("vertices" in node.data ? node.data.vertices : undefined) &&
    hasTransformValuesChanged(worldTransform, cached)
  );
}

function patchCachedMeshEntryTransform(
  cached: CachedDerivedRenderMeshEntry,
  worldTransform: Transform
): CachedDerivedRenderMeshEntry {
  return {
    ...cached,
    mesh: {
      ...cached.mesh,
      pivot: worldTransform.pivot,
      position: worldTransform.position,
      rotation: worldTransform.rotation,
      scale: worldTransform.scale
    },
    pivot: worldTransform.pivot,
    position: structuredClone(worldTransform.position),
    rotation: structuredClone(worldTransform.rotation),
    scale: structuredClone(worldTransform.scale),
    transform: structuredClone(worldTransform)
  };
}

/**
 * Updates only the `blendLayerWeights` attributes on the cached mesh entry, reusing all other
 * geometry data (positions, indices, normals, UVs, groups). O(faces × verticesPerFace × layers).
 */
function patchCachedMeshEntryBlendWeights(
  cached: CachedDerivedRenderMeshEntry,
  node: Extract<Exclude<GeometryNode, { kind: "group" | "light" }>, { kind: "mesh" }>,
  materialsById: Map<MaterialID, Material>
): CachedDerivedRenderMeshEntry {
  if (!cached.meshFaceMap || !cached.mesh.surface) {
    return cached; // Should not happen, but guard defensively
  }

  const result = recomputeBlendLayerWeightsFromFaceMap(node.data, cached.meshFaceMap, materialsById);

  const patchedSurface = result
    ? { ...cached.mesh.surface, blendLayerWeights: result.weights }
    : { ...cached.mesh.surface, blendLayerWeights: undefined };

  const patchedMesh: DerivedRenderMesh = {
    ...cached.mesh,
    surface: patchedSurface,
    materialLayers: result?.layers
  };

  return {
    ...cached,
    data: node.data,
    mesh: patchedMesh
  };
}

function hasTransformValuesChanged(
  transform: GeometryNode["transform"],
  cached: Pick<CachedDerivedRenderMeshEntry, "pivot" | "position" | "rotation" | "scale">
) {
  return (
    transform.position.x !== cached.position.x ||
    transform.position.y !== cached.position.y ||
    transform.position.z !== cached.position.z ||
    transform.rotation.x !== cached.rotation.x ||
    transform.rotation.y !== cached.rotation.y ||
    transform.rotation.z !== cached.rotation.z ||
    transform.scale.x !== cached.scale.x ||
    transform.scale.y !== cached.scale.y ||
    transform.scale.z !== cached.scale.z ||
    (transform.pivot?.x ?? 0) !== (cached.pivot?.x ?? 0) ||
    (transform.pivot?.y ?? 0) !== (cached.pivot?.y ?? 0) ||
    (transform.pivot?.z ?? 0) !== (cached.pivot?.z ?? 0) ||
    Boolean(transform.pivot) !== Boolean(cached.pivot)
  );
}

function haveReferencedValuesChanged<T extends { id: string }>(
  nextValues: T[],
  previousRefs: Map<string, T>
) {
  if (nextValues.length !== previousRefs.size) {
    return true;
  }

  return nextValues.some((value) => previousRefs.get(value.id) !== value);
}

function replaceReferenceMap<T extends { id: string }>(target: Map<string, T>, values: T[]) {
  target.clear();

  values.forEach((value) => {
    target.set(value.id, value);
  });
}
