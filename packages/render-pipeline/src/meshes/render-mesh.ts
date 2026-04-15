import { getFaceVertices, reconstructBrushFaces, triangulateMeshFace } from "@ggez/geometry-kernel";
import type { Asset, AssetID, GeometryNode, Material, MaterialID, MaterialRenderSide, NodeID, PrimitiveRole, PropPhysics, Vec2, Vec3 } from "@ggez/shared";
import {
  crossVec3,
  dotVec3,
  isBrushNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  normalizeEditableMeshMaterialLayers,
  normalizeVec3,
  resolveModelAssetFile,
  resolveModelAssetFiles,
  subVec3,
  vec3
} from "@ggez/shared";

export type RenderPrimitive =
  | {
      kind: "box";
      size: Vec3;
    }
  | {
      kind: "cone";
      height: number;
      radialSegments: number;
      radius: number;
    }
  | {
      kind: "cylinder";
      height: number;
      radialSegments: number;
      radiusBottom: number;
      radiusTop: number;
    }
  | {
      kind: "sphere";
      heightSegments: number;
      radius: number;
      widthSegments: number;
    }
  | {
      kind: "icosahedron";
      radius: number;
      detail: number;
    };

export type RenderMaterial = {
  category?: Material["category"];
  color: string;
  colorTexture?: string;
  edgeColor?: string;
  edgeThickness?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  flatShaded: boolean;
  metalness: number;
  metalnessTexture?: string;
  normalTexture?: string;
  opacity?: number;
  roughness: number;
  roughnessTexture?: string;
  side?: MaterialRenderSide;
  textureVariation?: Material["textureVariation"];
  transparent?: boolean;
  wireframe: boolean;
};

export type DerivedSurfaceGroup = {
  count: number;
  materialIndex: number;
  start: number;
};

export type DerivedSurfaceGeometry = {
  blendLayerWeights?: number[][];
  groups: DerivedSurfaceGroup[];
  normals?: number[];
  positions: number[];
  indices: number[];
  uvs: number[];
};

export type RenderMaterialLayer = {
  material: RenderMaterial;
  opacity: number;
};

export type DerivedRenderMesh = {
  nodeId: NodeID;
  sourceKind: GeometryNode["kind"];
  dirty: boolean;
  bvhEnabled: boolean;
  physics?: PropPhysics;
  label: string;
  position: Vec3;
  pivot?: Vec3;
  primitiveRole?: PrimitiveRole;
  rotation: Vec3;
  scale: Vec3;
  modelAssetId?: AssetID;
  modelCenter?: Vec3;
  modelFiles?: ReturnType<typeof resolveModelAssetFiles>;
  modelFormat?: string;
  modelMtlText?: string;
  modelPath?: string;
  modelSize?: Vec3;
  modelTexturePath?: string;
  primitive?: RenderPrimitive;
  surface?: DerivedSurfaceGeometry;
  material: RenderMaterial;
  materialLayers?: RenderMaterialLayer[];
  materials?: RenderMaterial[];
};

export function createDerivedRenderMesh(
  node: GeometryNode,
  materialsById = new Map<MaterialID, Material>(),
  assetsById = new Map<AssetID, Asset>(),
  transform = node.transform
): DerivedRenderMesh {
  const modelAsset = isModelNode(node) ? assetsById.get(node.data.assetId) : undefined;
  const modelPrimaryFile = isModelNode(node) ? resolveModelAssetFile(modelAsset, "high") : undefined;
  const modelFiles = isModelNode(node) ? resolveModelAssetFiles(modelAsset) : undefined;
  const appearance = getRenderAppearance(node, materialsById, assetsById);
  const surfaceResult = isBrushNode(node)
    ? createBrushSurface(node.data, materialsById)
    : isMeshNode(node)
      ? createEditableMeshSurface(node.data, materialsById)
      : undefined;

  return {
    nodeId: node.id,
    sourceKind: node.kind,
    dirty: false,
    bvhEnabled: true,
    physics: isPrimitiveNode(node)
      ? node.data.physics
      : isModelNode(node)
        ? node.data.physics
      : isMeshNode(node)
        ? node.data.physics
        : undefined,
    label: `${node.name} (${appearance.primitiveLabel})`,
    position: transform.position,
    pivot: transform.pivot,
    primitiveRole: isPrimitiveNode(node)
      ? node.data.role
      : isMeshNode(node)
        ? node.data.role
        : undefined,
    rotation: transform.rotation,
    scale: transform.scale,
    modelAssetId: isModelNode(node) ? node.data.assetId : undefined,
    modelCenter: isModelNode(node)
      ? resolveModelVec3Metadata(modelAsset, "nativeCenter")
      : undefined,
    modelFiles,
    modelFormat: isModelNode(node)
      ? modelPrimaryFile?.format ?? resolveModelStringMetadata(modelAsset, "modelFormat")
      : undefined,
    modelMtlText: isModelNode(node)
      ? modelPrimaryFile?.materialMtlText ?? resolveModelStringMetadata(modelAsset, "materialMtlText")
      : undefined,
    modelPath: isModelNode(node)
      ? modelPrimaryFile?.path ?? modelAsset?.path ?? node.data.path
      : undefined,
    modelSize: isModelNode(node)
      ? resolveModelVec3Metadata(modelAsset, "nativeSize")
      : undefined,
    modelTexturePath: isModelNode(node)
      ? modelPrimaryFile?.texturePath ?? resolveModelStringMetadata(modelAsset, "texturePath")
      : undefined,
    primitive: resolveNodePrimitive(node, assetsById),
    surface: surfaceResult?.surface,
    material: surfaceResult?.materials[0] ?? {
      category: appearance.category,
      color: appearance.color,
      colorTexture: appearance.colorTexture,
      edgeColor: appearance.edgeColor,
      edgeThickness: appearance.edgeThickness,
      emissiveColor: appearance.emissiveColor,
      emissiveIntensity: appearance.emissiveIntensity,
      flatShaded: appearance.flatShaded,
      metalness: appearance.metalness,
      metalnessTexture: appearance.metalnessTexture,
      normalTexture: appearance.normalTexture,
      opacity: appearance.opacity,
      roughness: appearance.roughness,
      roughnessTexture: appearance.roughnessTexture,
      side: appearance.side,
      textureVariation: appearance.textureVariation,
      transparent: appearance.transparent,
      wireframe: appearance.wireframe
    },
    materialLayers: surfaceResult?.materialLayers,
    materials: surfaceResult?.materials
  };
}

function getRenderAppearance(
  node: GeometryNode,
  materialsById: Map<MaterialID, Material>,
  assetsById: Map<AssetID, Asset>
): {
  category?: Material["category"];
  color: string;
  colorTexture?: string;
  edgeColor?: string;
  edgeThickness?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  flatShaded: boolean;
  metalness: number;
  metalnessTexture?: string;
  normalTexture?: string;
  opacity?: number;
  wireframe: boolean;
  roughness: number;
  roughnessTexture?: string;
  side?: MaterialRenderSide;
  textureVariation?: Material["textureVariation"];
  transparent?: boolean;
  primitiveLabel: string;
} {
  if (isBrushNode(node)) {
    const materialId = node.data.faces[0]?.materialId;
    const material = materialId ? materialsById.get(materialId) : undefined;

    return {
      category: material?.category,
      color: material?.color ?? "#f69036",
      colorTexture: material?.colorTexture,
      edgeColor: material?.edgeColor,
      edgeThickness: material?.edgeThickness,
      emissiveColor: material?.emissiveColor,
      emissiveIntensity: material?.emissiveIntensity,
      flatShaded: true,
      metalness: material?.metalness ?? 0,
      metalnessTexture: material?.metalnessTexture,
      normalTexture: material?.normalTexture,
      opacity: material?.opacity,
      roughness: material?.roughness ?? 0.95,
      roughnessTexture: material?.roughnessTexture,
      side: material?.side,
      textureVariation: material?.textureVariation,
      transparent: material?.transparent,
      wireframe: false,
      primitiveLabel: "box"
    };
  }

  if (isMeshNode(node)) {
    const materialId = node.data.faces[0]?.materialId;
    const material = materialId ? materialsById.get(materialId) : undefined;

    return {
      category: material?.category,
      color: material?.color ?? "#6ed5c0",
      colorTexture: material?.colorTexture,
      edgeColor: material?.edgeColor,
      edgeThickness: material?.edgeThickness,
      emissiveColor: material?.emissiveColor,
      emissiveIntensity: material?.emissiveIntensity,
      flatShaded: node.data.shading !== "smooth",
      metalness: material?.metalness ?? 0.05,
      metalnessTexture: material?.metalnessTexture,
      normalTexture: material?.normalTexture,
      opacity: material?.opacity,
      roughness: material?.roughness ?? 0.82,
      roughnessTexture: material?.roughnessTexture,
      side: material?.side,
      textureVariation: material?.textureVariation,
      transparent: material?.transparent,
      wireframe: false,
      primitiveLabel: "poly"
    };
  }

  if (isModelNode(node)) {
    const previewColor = assetsById.get(node.data.assetId)?.metadata.previewColor;

    return {
      color: typeof previewColor === "string" ? previewColor : "#7f8ea3",
      flatShaded: false,
      metalness: 0.1,
      roughness: 0.55,
      wireframe: false,
      primitiveLabel: "model"
    };
  }

  if (isPrimitiveNode(node)) {
    const material = node.data.materialId ? materialsById.get(node.data.materialId) : undefined;

    return {
      category: material?.category,
      color: material?.color ?? (node.data.role === "brush" ? "#f69036" : "#7f8ea3"),
      colorTexture: material?.colorTexture,
      edgeColor: material?.edgeColor,
      edgeThickness: material?.edgeThickness,
      emissiveColor: material?.emissiveColor,
      emissiveIntensity: material?.emissiveIntensity,
      flatShaded: true,
      metalness: material?.metalness ?? (node.data.role === "brush" ? 0 : 0.12),
      metalnessTexture: material?.metalnessTexture,
      normalTexture: material?.normalTexture,
      opacity: material?.opacity,
      roughness: material?.roughness ?? (node.data.role === "brush" ? 0.95 : 0.64),
      roughnessTexture: material?.roughnessTexture,
      side: material?.side,
      textureVariation: material?.textureVariation,
      transparent: material?.transparent,
      wireframe: false,
      primitiveLabel: node.data.shape
    };
  }

  return {
    color: "#ffffff",
    flatShaded: false,
    metalness: 0.1,
    roughness: 0.75,
    wireframe: false,
    primitiveLabel: "mesh"
  };
}

function resolveNodePrimitive(
  node: GeometryNode,
  assetsById: Map<AssetID, Asset>
): RenderPrimitive | undefined {
  if (isModelNode(node)) {
    const modelSize = resolveModelVec3Metadata(
      assetsById.get(node.data.assetId),
      "nativeSize"
    );

    return {
      kind: "box",
      size: modelSize ?? vec3(1.4, 1.4, 1.4)
    };
  }

  if (!isPrimitiveNode(node)) {
    return undefined;
  }

  const radius = Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5;
  const height = Math.abs(node.data.size.y);
  const radialSegments = Math.max(12, node.data.radialSegments ?? 24);

  switch (node.data.shape) {
    case "cube":
      return {
        kind: "box",
        size: vec3(Math.abs(node.data.size.x), Math.abs(node.data.size.y), Math.abs(node.data.size.z))
      };
    case "sphere":
      return {
        kind: "sphere",
        heightSegments: Math.max(8, Math.floor(radialSegments * 0.75)),
        radius,
        widthSegments: radialSegments
      };
    case "cylinder":
      return {
        kind: "cylinder",
        height,
        radialSegments,
        radiusBottom: radius,
        radiusTop: radius
      };
    case "cone":
      return {
        kind: "cone",
        height,
        radialSegments,
        radius
      };
    default:
      return undefined;
  }
}

function resolveModelVec3Metadata(
  asset: Asset | undefined,
  keyPrefix: "nativeCenter" | "nativeSize"
) {
  if (!asset) {
    return undefined;
  }

  const x = asset.metadata[`${keyPrefix}X`];
  const y = asset.metadata[`${keyPrefix}Y`];
  const z = asset.metadata[`${keyPrefix}Z`];

  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    return undefined;
  }

  return vec3(x, y, z);
}

function resolveModelStringMetadata(asset: Asset | undefined, key: string) {
  if (!asset) {
    return undefined;
  }

  const value = asset.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createBrushSurface(
  node: Extract<GeometryNode, { kind: "brush" }>['data'],
  materialsById: Map<MaterialID, Material>
): { materialLayers?: RenderMaterialLayer[]; materials: RenderMaterial[]; surface: DerivedSurfaceGeometry } | undefined {
  const rebuilt = reconstructBrushFaces(node);

  if (!rebuilt.valid || rebuilt.faces.length === 0) {
    return undefined;
  }

  return buildDerivedSurface(
    rebuilt.faces.map((face) => ({
      materialId: face.materialId,
      normal: face.normal,
      triangleIndices: face.triangleIndices,
      uvOffset: face.uvOffset,
      uvScale: face.uvScale,
      vertices: face.vertices.map((vertex) => vertex.position)
    })),
    materialsById,
    "#f69036",
    true,
    0,
    0.95
  );
}

function createEditableMeshSurface(
  node: Extract<GeometryNode, { kind: "mesh" }>['data'],
  materialsById: Map<MaterialID, Material>
): { materialLayers?: RenderMaterialLayer[]; materials: RenderMaterial[]; surface: DerivedSurfaceGeometry } | undefined {
  const flatShaded = node.shading !== "smooth";
  const materialLayers = normalizeEditableMeshMaterialLayers(node.materialLayers, node.vertices.length, node.materialBlend);
  const vertexIndexById = new Map(node.vertices.map((vertex, index) => [vertex.id, index] as const));
  const mappedFaces = node.faces.map((face) => {
    const triangulated = triangulateMeshFace(node, face.id);
    const faceVertices = getFaceVertices(node, face.id);

    if (!triangulated || faceVertices.length === 0) {
      return undefined;
    }

    return {
      blendLayerWeights: materialLayers?.map((layer) =>
        faceVertices.map((vertex) => layer.weights[vertexIndexById.get(vertex.id) ?? -1] ?? 0)
      ),
      materialId: face.materialId,
      normal: triangulated.normal,
      triangleIndices: triangulated.indices,
      uvOffset: face.uvOffset,
      uvScale: face.uvScale,
      uvs: face.uvs,
      vertices: faceVertices.map((vertex) => vertex.position)
    };
  });
  const faces: Array<{
    blendLayerWeights?: number[][];
    materialId?: MaterialID;
    normal: Vec3;
    triangleIndices: number[];
    uvOffset?: Vec2;
    uvScale?: Vec2;
    uvs?: Vec2[];
    vertices: Vec3[];
  }> = mappedFaces.filter((face) => face !== undefined) as Array<{
    blendLayerWeights?: number[][];
    materialId?: MaterialID;
    normal: Vec3;
    triangleIndices: number[];
    uvOffset?: Vec2;
    uvScale?: Vec2;
    uvs?: Vec2[];
    vertices: Vec3[];
  }>;

  if (faces.length === 0) {
    return undefined;
  }

  return buildDerivedSurface(
    faces,
    materialsById,
    "#6ed5c0",
    flatShaded,
    0.05,
    0.82,
    materialLayers?.map((layer) => ({
      material: resolveRenderMaterial(materialsById.get(layer.materialId), "#6ed5c0", flatShaded, 0.05, 0.82),
      opacity: layer.opacity,
    })),
  );
}

function buildDerivedSurface(
  faces: Array<{
    blendLayerWeights?: number[][];
    materialId?: MaterialID;
    normal: Vec3;
    triangleIndices: number[];
    uvOffset?: Vec2;
    uvScale?: Vec2;
    uvs?: Vec2[];
    vertices: Vec3[];
  }>,
  materialsById: Map<MaterialID, Material>,
  fallbackColor: string,
  flatShaded: boolean,
  fallbackMetalness: number,
  fallbackRoughness: number,
  materialLayers?: RenderMaterialLayer[],
): { materialLayers?: RenderMaterialLayer[]; materials: RenderMaterial[]; surface: DerivedSurfaceGeometry } {
  const materialIndexByKey = new Map<string, number>();
  const materials: RenderMaterial[] = [];
  const blendLayerWeights = (materialLayers ?? []).map(() => [] as number[]);
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const groups: DerivedSurfaceGroup[] = [];
  let vertexOffset = 0;

  faces.forEach((face) => {
    const material = face.materialId ? materialsById.get(face.materialId) : undefined;
    const renderMaterial = resolveRenderMaterial(material, fallbackColor, flatShaded, fallbackMetalness, fallbackRoughness);
    const materialKey = face.materialId ?? `fallback:${fallbackColor}`;
    const materialIndex = materialIndexByKey.get(materialKey) ?? materials.length;

    if (!materialIndexByKey.has(materialKey)) {
      materialIndexByKey.set(materialKey, materialIndex);
      materials.push(renderMaterial);
    }

    face.vertices.forEach((vertex) => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });

    const faceUvs = face.uvs && face.uvs.length === face.vertices.length
      ? face.uvs.flatMap((uv) => [uv.x, uv.y])
      : projectPlanarUvs(face.vertices, face.normal, face.uvScale, face.uvOffset);
    uvs.push(...faceUvs);
    if (materialLayers?.length) {
      materialLayers.forEach((_, layerIndex) => {
        blendLayerWeights[layerIndex]!.push(
          ...(face.blendLayerWeights?.[layerIndex]?.slice(0, face.vertices.length) ?? Array.from({ length: face.vertices.length }, () => 0))
        );
      });
    }

    const groupStart = indices.length;
    face.triangleIndices.forEach((index) => {
      indices.push(vertexOffset + index);
    });
    groups.push({
      count: face.triangleIndices.length,
      materialIndex,
      start: groupStart
    });

    vertexOffset += face.vertices.length;
  });

  return {
    materialLayers,
    materials,
    surface: {
      ...(materialLayers?.length ? { blendLayerWeights } : {}),
      groups,
      indices,
      normals: flatShaded ? undefined : computeSmoothNormals(positions, indices),
      positions,
      uvs
    }
  };
}

function resolveRenderMaterial(
  material: Material | undefined,
  fallbackColor: string,
  flatShaded: boolean,
  fallbackMetalness: number,
  fallbackRoughness: number
): RenderMaterial {
  return {
    category: material?.category,
    color: material?.color ?? fallbackColor,
    colorTexture: material?.colorTexture,
    edgeColor: material?.edgeColor,
    edgeThickness: material?.edgeThickness,
    emissiveColor: material?.emissiveColor,
    emissiveIntensity: material?.emissiveIntensity,
    flatShaded,
    metalness: material?.metalness ?? fallbackMetalness,
    metalnessTexture: material?.metalnessTexture,
    normalTexture: material?.normalTexture,
    opacity: material?.opacity,
    roughness: material?.roughness ?? fallbackRoughness,
    roughnessTexture: material?.roughnessTexture,
    side: material?.side,
    textureVariation: material?.textureVariation,
    transparent: material?.transparent,
    wireframe: false
  };
}

function projectPlanarUvs(vertices: Vec3[], normal: Vec3, uvScale?: Vec2, uvOffset?: Vec2) {
  const basis = createFacePlaneBasis(normal);
  const origin = vertices[0] ?? vec3(0, 0, 0);
  const scaleX = Math.abs(uvScale?.x ?? 1) <= 0.0001 ? 1 : uvScale?.x ?? 1;
  const scaleY = Math.abs(uvScale?.y ?? 1) <= 0.0001 ? 1 : uvScale?.y ?? 1;
  const offsetX = uvOffset?.x ?? 0;
  const offsetY = uvOffset?.y ?? 0;

  return vertices.flatMap((vertex) => {
    const offset = subVec3(vertex, origin);
    return [dotVec3(offset, basis.u) * scaleX + offsetX, dotVec3(offset, basis.v) * scaleY + offsetY];
  });
}

function createFacePlaneBasis(normal: Vec3) {
  const normalizedNormal = normalizeVec3(normal);
  const reference = Math.abs(normalizedNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, normalizedNormal));
  const v = normalizeVec3(crossVec3(normalizedNormal, u));

  return { u, v };
}

function computeSmoothNormals(positions: number[], indices: number[]): number[] {
  const vertexCount = positions.length / 3;
  const accNormals = new Float64Array(positions.length);

  // Build a map from position key -> all vertex indices sharing that position
  const posMap = new Map<string, number[]>();
  for (let i = 0; i < vertexCount; i++) {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
    const list = posMap.get(key);
    if (list) {
      list.push(i);
    } else {
      posMap.set(key, [i]);
    }
  }

  // For each triangle, accumulate weighted face normal to all vertices at the same positions
  for (let i = 0; i < indices.length; i += 3) {
    const vi0 = indices[i]!;
    const vi1 = indices[i + 1]!;
    const vi2 = indices[i + 2]!;

    const ax = positions[vi0 * 3]!, ay = positions[vi0 * 3 + 1]!, az = positions[vi0 * 3 + 2]!;
    const bx = positions[vi1 * 3]!, by = positions[vi1 * 3 + 1]!, bz = positions[vi1 * 3 + 2]!;
    const cx = positions[vi2 * 3]!, cy = positions[vi2 * 3 + 1]!, cz = positions[vi2 * 3 + 2]!;

    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;

    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;

    for (const vi of [vi0, vi1, vi2]) {
      const key = `${positions[vi * 3]},${positions[vi * 3 + 1]},${positions[vi * 3 + 2]}`;
      const sharedIndices = posMap.get(key)!;
      for (const si of sharedIndices) {
        accNormals[si * 3] += nx;
        accNormals[si * 3 + 1] += ny;
        accNormals[si * 3 + 2] += nz;
      }
    }
  }

  const result = new Array<number>(positions.length);
  for (let i = 0; i < vertexCount; i++) {
    const x = accNormals[i * 3]!;
    const y = accNormals[i * 3 + 1]!;
    const z = accNormals[i * 3 + 2]!;
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      result[i * 3] = x / len;
      result[i * 3 + 1] = y / len;
      result[i * 3 + 2] = z / len;
    } else {
      result[i * 3] = 0;
      result[i * 3 + 1] = 1;
      result[i * 3 + 2] = 0;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fast-path helpers for material-layers-only changes
// ---------------------------------------------------------------------------

/**
 * For each face in `meshData.faces` (in order), records how many render-vertices that face
 * contributes to the surface buffer. A value of 0 means the face is degenerate and was skipped.
 * This is computed once per full geometry rebuild and cached. The fast-path weight recomputation
 * uses it to iterate faces in exactly the same order as `createEditableMeshSurface` did, without
 * needing to re-run face triangulation.
 */
export type DerivedSurfaceFaceMap = {
  faceRenderVertexCounts: number[];
};

/**
 * Builds a `DerivedSurfaceFaceMap` for a mesh node. Must be called with the same `meshData`
 * that was used for the most recent full surface build so the face order matches.
 */
export function buildEditableMeshFaceMap(
  meshData: Extract<GeometryNode, { kind: "mesh" }>["data"]
): DerivedSurfaceFaceMap {
  const faceRenderVertexCounts = meshData.faces.map((face) => {
    const triangulated = triangulateMeshFace(meshData, face.id);
    const faceVertices = getFaceVertices(meshData, face.id);

    if (!triangulated || faceVertices.length === 0) {
      return 0;
    }

    return faceVertices.length;
  });

  return { faceRenderVertexCounts };
}

/**
 * Recomputes ONLY the `blendLayerWeights` portion of a `DerivedSurfaceGeometry` using a
 * pre-computed face map. Skips triangulation, position building, UV projection and normal
 * computation. O(faces × verticesPerFace × layers).
 *
 * The returned weights array is in the same render-vertex order as the original surface build.
 */
export function recomputeBlendLayerWeightsFromFaceMap(
  meshData: Extract<GeometryNode, { kind: "mesh" }>["data"],
  faceMap: DerivedSurfaceFaceMap,
  materialsById: Map<MaterialID, Material>
): { weights: number[][]; layers: RenderMaterialLayer[] } | undefined {
  const materialLayers = normalizeEditableMeshMaterialLayers(
    meshData.materialLayers,
    meshData.vertices.length,
    meshData.materialBlend
  );

  if (!materialLayers?.length) {
    return undefined;
  }

  const flatShaded = meshData.shading !== "smooth";
  const vertexIndexById = new Map(meshData.vertices.map((v, i) => [v.id, i] as const));
  const blendLayerWeights = materialLayers.map(() => [] as number[]);

  meshData.faces.forEach((face, faceIdx) => {
    const vertexCount = faceMap.faceRenderVertexCounts[faceIdx];

    if (!vertexCount) {
      return; // degenerate face — same skip condition as createEditableMeshSurface
    }

    const faceVertices = getFaceVertices(meshData, face.id);

    materialLayers.forEach((layer, li) => {
      faceVertices.forEach((vertex) => {
        blendLayerWeights[li]!.push(layer.weights[vertexIndexById.get(vertex.id) ?? -1] ?? 0);
      });
    });
  });

  return {
    weights: blendLayerWeights,
    layers: materialLayers.map((layer) => ({
      material: resolveRenderMaterial(
        materialsById.get(layer.materialId),
        "#6ed5c0",
        flatShaded,
        0.05,
        0.82
      ),
      opacity: layer.opacity
    }))
  };
}
