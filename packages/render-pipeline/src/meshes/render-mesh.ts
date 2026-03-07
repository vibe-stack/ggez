import { getFaceVertices, reconstructBrushFaces, triangulateMeshFace } from "@web-hammer/geometry-kernel";
import type { Asset, AssetID, GeometryNode, Material, MaterialID, NodeID, Vec2, Vec3 } from "@web-hammer/shared";
import { crossVec3, dotVec3, isBrushNode, isMeshNode, isModelNode, normalizeVec3, subVec3, vec3 } from "@web-hammer/shared";

export type RenderPrimitive =
  | {
      kind: "box";
      size: Vec3;
    }
  | {
      kind: "icosahedron";
      radius: number;
      detail: number;
    }
  | {
      kind: "cylinder";
      radiusTop: number;
      radiusBottom: number;
      height: number;
      radialSegments: number;
    };

export type RenderMaterial = {
  category?: Material["category"];
  color: string;
  colorTexture?: string;
  edgeColor?: string;
  edgeThickness?: number;
  flatShaded: boolean;
  metalness: number;
  metalnessTexture?: string;
  normalTexture?: string;
  roughness: number;
  roughnessTexture?: string;
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
  label: string;
  position: Vec3;
  pivot?: Vec3;
  rotation: Vec3;
  scale: Vec3;
  primitive?: RenderPrimitive;
  surface?: DerivedSurfaceGeometry;
  material: RenderMaterial;
  materials?: RenderMaterial[];
};

export function createDerivedRenderMesh(
  node: GeometryNode,
  materialsById = new Map<MaterialID, Material>(),
  assetsById = new Map<AssetID, Asset>()
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
    label: `${node.name} (${appearance.primitiveLabel})`,
    position: node.transform.position,
    pivot: node.transform.pivot,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
    primitive: isModelNode(node)
      ? {
            kind: "cylinder",
            radiusTop: 0.65,
            radiusBottom: 0.65,
            height: 2.2,
            radialSegments: 12
          }
      : undefined,
    surface: surfaceResult?.surface,
    material: surfaceResult?.materials[0] ?? {
      category: appearance.category,
      color: appearance.color,
      colorTexture: appearance.colorTexture,
      edgeColor: appearance.edgeColor,
      edgeThickness: appearance.edgeThickness,
      flatShaded: appearance.flatShaded,
      metalness: appearance.metalness,
      metalnessTexture: appearance.metalnessTexture,
      normalTexture: appearance.normalTexture,
      roughness: appearance.roughness,
      roughnessTexture: appearance.roughnessTexture,
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
  flatShaded: boolean;
  metalness: number;
  metalnessTexture?: string;
  normalTexture?: string;
  wireframe: boolean;
  roughness: number;
  roughnessTexture?: string;
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
      flatShaded: true,
      metalness: material?.metalness ?? 0,
      metalnessTexture: material?.metalnessTexture,
      normalTexture: material?.normalTexture,
      roughness: material?.roughness ?? 0.95,
      roughnessTexture: material?.roughnessTexture,
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
      flatShaded: true,
      metalness: material?.metalness ?? 0.05,
      metalnessTexture: material?.metalnessTexture,
      normalTexture: material?.normalTexture,
      roughness: material?.roughness ?? 0.82,
      roughnessTexture: material?.roughnessTexture,
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

  return {
    color: "#ffffff",
    flatShaded: false,
    metalness: 0.1,
    roughness: 0.75,
    wireframe: false,
    primitiveLabel: "mesh"
  };
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
      uvScale: face.uvScale,
      vertices: getFaceVertices(node, face.id).map((vertex) => vertex.position)
    };
  });
  const faces: Array<{
    materialId?: MaterialID;
    normal: Vec3;
    triangleIndices: number[];
    uvScale?: Vec2;
    vertices: Vec3[];
  }> = mappedFaces.filter((face) => face !== undefined) as Array<{
    materialId?: MaterialID;
    normal: Vec3;
    triangleIndices: number[];
    uvScale?: Vec2;
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
    uvScale?: Vec2;
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

    const faceUvs = projectPlanarUvs(face.vertices, face.normal, face.uvScale);
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
    flatShaded: true,
    metalness: material?.metalness ?? fallbackMetalness,
    metalnessTexture: material?.metalnessTexture,
    normalTexture: material?.normalTexture,
    roughness: material?.roughness ?? fallbackRoughness,
    roughnessTexture: material?.roughnessTexture,
    wireframe: false
  };
}

function projectPlanarUvs(vertices: Vec3[], normal: Vec3, uvScale?: Vec2) {
  const basis = createFacePlaneBasis(normal);
  const origin = vertices[0] ?? vec3(0, 0, 0);
  const scaleX = Math.abs(uvScale?.x ?? 1) <= 0.0001 ? 1 : uvScale?.x ?? 1;
  const scaleY = Math.abs(uvScale?.y ?? 1) <= 0.0001 ? 1 : uvScale?.y ?? 1;

  return vertices.flatMap((vertex) => {
    const offset = subVec3(vertex, origin);
    return [dotVec3(offset, basis.u) * scaleX, dotVec3(offset, basis.v) * scaleY];
  });
}

function createFacePlaneBasis(normal: Vec3) {
  const normalizedNormal = normalizeVec3(normal);
  const reference = Math.abs(normalizedNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, normalizedNormal));
  const v = normalizeVec3(crossVec3(normalizedNormal, u));

  return { u, v };
}
