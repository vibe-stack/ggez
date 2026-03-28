import { getFaceVertices, reconstructBrushFaces, triangulateMeshFace } from "@ggez/geometry-kernel";
import type { Asset, AssetID, GeometryNode, Material, MaterialID, MaterialRenderSide, NodeID, PrimitiveRole, PropPhysics, Vec2, Vec3 } from "@ggez/shared";
import {
  crossVec3,
  dotVec3,
  isBrushNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  normalizeVec3,
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
  transparent?: boolean;
  wireframe: boolean;
};

export type DerivedSurfaceGroup = {
  count: number;
  materialIndex: number;
  start: number;
};

export type DerivedSurfaceGeometry = {
  groups: DerivedSurfaceGroup[];
  positions: number[];
  indices: number[];
  uvs: number[];
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
  modelFormat?: string;
  modelMtlText?: string;
  modelPath?: string;
  modelSize?: Vec3;
  modelTexturePath?: string;
  primitive?: RenderPrimitive;
  surface?: DerivedSurfaceGeometry;
  material: RenderMaterial;
  materials?: RenderMaterial[];
};

export function createDerivedRenderMesh(
  node: GeometryNode,
  materialsById = new Map<MaterialID, Material>(),
  assetsById = new Map<AssetID, Asset>(),
  transform = node.transform
): DerivedRenderMesh {
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
      ? resolveModelVec3Metadata(assetsById.get(node.data.assetId), "nativeCenter")
      : undefined,
    modelFormat: isModelNode(node)
      ? resolveModelStringMetadata(assetsById.get(node.data.assetId), "modelFormat")
      : undefined,
    modelMtlText: isModelNode(node)
      ? resolveModelStringMetadata(assetsById.get(node.data.assetId), "materialMtlText")
      : undefined,
    modelPath: isModelNode(node)
      ? assetsById.get(node.data.assetId)?.path ?? node.data.path
      : undefined,
    modelSize: isModelNode(node)
      ? resolveModelVec3Metadata(assetsById.get(node.data.assetId), "nativeSize")
      : undefined,
    modelTexturePath: isModelNode(node)
      ? resolveModelStringMetadata(assetsById.get(node.data.assetId), "texturePath")
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
      transparent: appearance.transparent,
      wireframe: appearance.wireframe
    },
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
      flatShaded: true,
      metalness: material?.metalness ?? 0.05,
      metalnessTexture: material?.metalnessTexture,
      normalTexture: material?.normalTexture,
      opacity: material?.opacity,
      roughness: material?.roughness ?? 0.82,
      roughnessTexture: material?.roughnessTexture,
      side: material?.side,
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
): { materials: RenderMaterial[]; surface: DerivedSurfaceGeometry } | undefined {
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
    0,
    0.95
  );
}

function createEditableMeshSurface(
  node: Extract<GeometryNode, { kind: "mesh" }>['data'],
  materialsById: Map<MaterialID, Material>
): { materials: RenderMaterial[]; surface: DerivedSurfaceGeometry } | undefined {
  const mappedFaces = node.faces.map((face) => {
    const triangulated = triangulateMeshFace(node, face.id);

    if (!triangulated) {
      return undefined;
    }

    return {
      materialId: face.materialId,
      normal: triangulated.normal,
      triangleIndices: triangulated.indices,
      uvOffset: face.uvOffset,
      uvScale: face.uvScale,
      uvs: face.uvs,
      vertices: getFaceVertices(node, face.id).map((vertex) => vertex.position)
    };
  });
  const faces: Array<{
    materialId?: MaterialID;
    normal: Vec3;
    triangleIndices: number[];
    uvOffset?: Vec2;
    uvScale?: Vec2;
    uvs?: Vec2[];
    vertices: Vec3[];
  }> = mappedFaces.filter((face) => face !== undefined) as Array<{
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

  return buildDerivedSurface(faces, materialsById, "#6ed5c0", 0.05, 0.82);
}

function buildDerivedSurface(
  faces: Array<{
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
  fallbackMetalness: number,
  fallbackRoughness: number
): { materials: RenderMaterial[]; surface: DerivedSurfaceGeometry } {
  const materialIndexByKey = new Map<string, number>();
  const materials: RenderMaterial[] = [];
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const groups: DerivedSurfaceGroup[] = [];
  let vertexOffset = 0;

  faces.forEach((face) => {
    const material = face.materialId ? materialsById.get(face.materialId) : undefined;
    const renderMaterial = resolveRenderMaterial(material, fallbackColor, fallbackMetalness, fallbackRoughness);
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
    materials,
    surface: {
      groups,
      indices,
      positions,
      uvs
    }
  };
}

function resolveRenderMaterial(
  material: Material | undefined,
  fallbackColor: string,
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
    flatShaded: true,
    metalness: material?.metalness ?? fallbackMetalness,
    metalnessTexture: material?.metalnessTexture,
    normalTexture: material?.normalTexture,
    opacity: material?.opacity,
    roughness: material?.roughness ?? fallbackRoughness,
    roughnessTexture: material?.roughnessTexture,
    side: material?.side,
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
