import { getFaceVertices, reconstructBrushFaces, triangulateMeshFace } from "@web-hammer/geometry-kernel";
import type { SceneDocumentSnapshot } from "@web-hammer/editor-core";
import {
  createBlockoutTextureDataUri,
  crossVec3,
  dotVec3,
  isBrushNode,
  isMeshNode,
  isModelNode,
  normalizeVec3,
  subVec3,
  vec3,
  type Material,
  type MaterialID,
  type Vec2,
  type Vec3
} from "@web-hammer/shared";

export type WorkerExportKind = "whmap-load" | "whmap-save" | "engine-export" | "gltf-export";

export type WorkerRequest =
  | {
      id: string;
      kind: "whmap-save";
      snapshot: SceneDocumentSnapshot;
    }
  | {
      id: string;
      kind: "whmap-load";
      text: string;
    }
  | {
      id: string;
      kind: "engine-export" | "gltf-export";
      snapshot: SceneDocumentSnapshot;
    };

export type WorkerResponse =
  | {
      id: string;
      kind: WorkerExportKind;
      ok: true;
      payload: string | SceneDocumentSnapshot;
    }
  | {
      id: string;
      kind: WorkerExportKind;
      ok: false;
      error: string;
    };

export async function executeWorkerRequest(request: WorkerRequest): Promise<WorkerResponse> {
  try {
    if (request.kind === "whmap-save") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: serializeWhmap(request.snapshot)
      };
    }

    if (request.kind === "whmap-load") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: parseWhmap(request.text)
      };
    }

    if (request.kind === "engine-export") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: await serializeEngineScene(request.snapshot)
      };
    }

    return {
      id: request.id,
      kind: request.kind,
      ok: true,
      payload: await serializeGltfScene(request.snapshot)
    };
  } catch (error) {
    return {
      id: request.id,
      kind: request.kind,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error."
    };
  }
}

export function serializeWhmap(snapshot: SceneDocumentSnapshot): string {
  return JSON.stringify(
    {
      format: "whmap",
      version: 1,
      scene: snapshot
    },
    null,
    2
  );
}

export function parseWhmap(text: string): SceneDocumentSnapshot {
  const parsed = JSON.parse(text) as {
    format?: string;
    scene?: SceneDocumentSnapshot;
    version?: number;
  };

  if (parsed.format !== "whmap" || !parsed.scene) {
    throw new Error("Invalid .whmap file.");
  }

  return parsed.scene;
}

export async function serializeEngineScene(snapshot: SceneDocumentSnapshot): Promise<string> {
  const materialsById = new Map(snapshot.materials.map((material) => [material.id, material]));
  const exportedMaterials = await Promise.all(snapshot.materials.map((material) => resolveExportMaterial(material)));

  return JSON.stringify(
    {
      assets: snapshot.assets,
      entities: snapshot.entities,
      layers: snapshot.layers,
      materials: exportedMaterials,
      metadata: {
        exportedAt: new Date().toISOString(),
        format: "web-hammer-engine",
        version: 2
      },
      nodes: await Promise.all(
        snapshot.nodes.map(async (node) => {
          if (isBrushNode(node) || isMeshNode(node)) {
            return {
              data: node.data,
              geometry: await buildExportGeometry(node, materialsById),
              id: node.id,
              kind: node.kind,
              name: node.name,
              transform: node.transform
            };
          }

          return {
            data: node.data,
            id: node.id,
            kind: node.kind,
            name: node.name,
            transform: node.transform
          };
        })
      )
    },
    null,
    2
  );
}

export async function serializeGltfScene(snapshot: SceneDocumentSnapshot): Promise<string> {
  const materialsById = new Map(snapshot.materials.map((material) => [material.id, material]));
  const assetsById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const exportedNodes: Array<{
    mesh?: {
      name: string;
      primitives: Array<{
        indices: number[];
        material: Awaited<ReturnType<typeof resolveExportMaterial>>;
        normals: number[];
        positions: number[];
        uvs: number[];
      }>;
    };
    name: string;
    scale: [number, number, number];
    translation: [number, number, number];
  }> = [];

  for (const node of snapshot.nodes) {
    if (isBrushNode(node) || isMeshNode(node)) {
      const geometry = await buildExportGeometry(node, materialsById);

      if (geometry.primitives.length === 0) {
        continue;
      }

      exportedNodes.push({
        mesh: {
          name: node.name,
          primitives: geometry.primitives
        },
        name: node.name,
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
      continue;
    }

    if (isModelNode(node)) {
      const previewColor = assetsById.get(node.data.assetId)?.metadata.previewColor;
      const primitive = createCylinderPrimitive();
      exportedNodes.push({
        mesh: {
          name: node.name,
          primitives: [
            {
              indices: primitive.indices,
              material: await resolveExportMaterial({
                color: typeof previewColor === "string" ? previewColor : "#7f8ea3",
                id: `material:model:${node.id}`,
                metalness: 0.1,
                name: `${node.name} Material`,
                roughness: 0.55
              }),
              normals: computePrimitiveNormals(primitive.positions, primitive.indices),
              positions: primitive.positions,
              uvs: computeCylinderUvs(primitive.positions)
            }
          ]
        },
        name: node.name,
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
    }
  }

  return buildGltfDocument(exportedNodes);
}

async function buildGltfDocument(
  exportedNodes: Array<{
    mesh?: {
      name: string;
      primitives: Array<{
        indices: number[];
        material: Awaited<ReturnType<typeof resolveExportMaterial>>;
        normals: number[];
        positions: number[];
        uvs: number[];
      }>;
    };
    name: string;
    scale: [number, number, number];
    translation: [number, number, number];
  }>
): Promise<string> {
  const nodes: Array<Record<string, unknown>> = [];
  const gltfMeshes: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const textures: Array<Record<string, unknown>> = [];
  const images: Array<Record<string, unknown>> = [];
  const samplers: Array<Record<string, unknown>> = [
    {
      magFilter: 9729,
      minFilter: 9987,
      wrapS: 10497,
      wrapT: 10497
    }
  ];
  const accessors: Array<Record<string, unknown>> = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const chunks: Uint8Array[] = [];
  const imageIndexByUri = new Map<string, number>();
  const textureIndexByUri = new Map<string, number>();
  const materialIndexById = new Map<string, number>();

  const pushBuffer = (bytes: Uint8Array, target?: number) => {
    const padding = (4 - (bytes.byteLength % 4)) % 4;
    const padded = new Uint8Array(bytes.byteLength + padding);
    padded.set(bytes);
    const byteOffset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    chunks.push(padded);
    bufferViews.push({
      buffer: 0,
      byteLength: bytes.byteLength,
      byteOffset,
      ...(target ? { target } : {})
    });
    return bufferViews.length - 1;
  };

  for (const exportedNode of exportedNodes) {
    if (exportedNode.mesh) {
      const gltfPrimitives: Array<Record<string, unknown>> = [];

      for (const primitive of exportedNode.mesh.primitives) {
        const positions = new Float32Array(primitive.positions);
        const normals = new Float32Array(primitive.normals);
        const uvs = new Float32Array(primitive.uvs);
        const indices = new Uint32Array(primitive.indices);
        const positionView = pushBuffer(new Uint8Array(positions.buffer.slice(0)), 34962);
        const normalView = pushBuffer(new Uint8Array(normals.buffer.slice(0)), 34962);
        const uvView = pushBuffer(new Uint8Array(uvs.buffer.slice(0)), 34962);
        const indexView = pushBuffer(new Uint8Array(indices.buffer.slice(0)), 34963);

        const bounds = computePositionBounds(primitive.positions);
        accessors.push({
          bufferView: positionView,
          componentType: 5126,
          count: positions.length / 3,
          max: bounds.max,
          min: bounds.min,
          type: "VEC3"
        });
        const positionAccessor = accessors.length - 1;

        accessors.push({
          bufferView: normalView,
          componentType: 5126,
          count: normals.length / 3,
          type: "VEC3"
        });
        const normalAccessor = accessors.length - 1;

        accessors.push({
          bufferView: uvView,
          componentType: 5126,
          count: uvs.length / 2,
          type: "VEC2"
        });
        const uvAccessor = accessors.length - 1;

        accessors.push({
          bufferView: indexView,
          componentType: 5125,
          count: indices.length,
          type: "SCALAR"
        });
        const indexAccessor = accessors.length - 1;

        const materialIndex = await ensureGltfMaterial(
          primitive.material,
          materials,
          textures,
          images,
          imageIndexByUri,
          textureIndexByUri,
          materialIndexById
        );

        gltfPrimitives.push({
          attributes: {
            NORMAL: normalAccessor,
            POSITION: positionAccessor,
            TEXCOORD_0: uvAccessor
          },
          indices: indexAccessor,
          material: materialIndex
        });
      }

      gltfMeshes.push({
        name: exportedNode.mesh.name,
        primitives: gltfPrimitives
      });
    }

    nodes.push({
      ...(exportedNode.mesh ? { mesh: gltfMeshes.length - 1 } : {}),
      name: exportedNode.name,
      scale: exportedNode.scale,
      translation: exportedNode.translation
    });
  }

  const totalByteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalByteLength);
  let cursor = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, cursor);
    cursor += chunk.byteLength;
  });

  const gltf = {
    accessors,
    asset: {
      generator: "web-hammer",
      version: "2.0"
    },
    bufferViews,
    buffers: [
      {
        byteLength: merged.byteLength,
        uri: `data:application/octet-stream;base64,${toBase64(merged)}`
      }
    ],
    images,
    materials,
    meshes: gltfMeshes,
    nodes,
    samplers,
    scene: 0,
    scenes: [
      {
        nodes: nodes.map((_, index) => index)
      }
    ],
    textures
  };

  return JSON.stringify(gltf, null, 2);
}

async function buildExportGeometry(
  node: Extract<SceneDocumentSnapshot["nodes"][number], { kind: "brush" | "mesh" }>,
  materialsById: Map<MaterialID, Material>
) {
  const fallbackMaterial = await resolveExportMaterial({
    color: node.kind === "brush" ? "#f69036" : "#6ed5c0",
    id: `material:fallback:${node.id}`,
    metalness: node.kind === "brush" ? 0 : 0.05,
    name: `${node.name} Default`,
    roughness: node.kind === "brush" ? 0.95 : 0.82
  });
  const primitiveByMaterial = new Map<string, {
    indices: number[];
    material: Awaited<ReturnType<typeof resolveExportMaterial>>;
    normals: number[];
    positions: number[];
    uvs: number[];
  }>();

  const appendFace = async (params: {
    faceMaterialId?: string;
    normal: Vec3;
    triangleIndices: number[];
    uvScale?: Vec2;
    vertices: Vec3[];
  }) => {
    const material = params.faceMaterialId ? await resolveExportMaterial(materialsById.get(params.faceMaterialId)) : fallbackMaterial;
    const primitive = primitiveByMaterial.get(material.id) ?? {
      indices: [],
      material,
      normals: [],
      positions: [],
      uvs: []
    };
    const vertexOffset = primitive.positions.length / 3;
    const uvs = projectPlanarUvs(params.vertices, params.normal, params.uvScale);

    params.vertices.forEach((vertex) => {
      primitive.positions.push(vertex.x, vertex.y, vertex.z);
      primitive.normals.push(params.normal.x, params.normal.y, params.normal.z);
    });
    primitive.uvs.push(...uvs);
    params.triangleIndices.forEach((index) => {
      primitive.indices.push(vertexOffset + index);
    });
    primitiveByMaterial.set(material.id, primitive);
  };

  if (isBrushNode(node)) {
    const rebuilt = reconstructBrushFaces(node.data);

    if (!rebuilt.valid) {
      return { primitives: [] };
    }

    for (const face of rebuilt.faces) {
      await appendFace({
        faceMaterialId: face.materialId,
        normal: face.normal,
        triangleIndices: face.triangleIndices,
        uvScale: face.uvScale,
        vertices: face.vertices.map((vertex) => vertex.position)
      });
    }
  }

  if (isMeshNode(node)) {
    for (const face of node.data.faces) {
      const triangulated = triangulateMeshFace(node.data, face.id);

      if (!triangulated) {
        continue;
      }

      await appendFace({
        faceMaterialId: face.materialId,
        normal: triangulated.normal,
        triangleIndices: triangulated.indices,
        uvScale: face.uvScale,
        vertices: getFaceVertices(node.data, face.id).map((vertex) => vertex.position)
      });
    }
  }

  return {
    primitives: Array.from(primitiveByMaterial.values())
  };
}

async function resolveExportMaterial(material?: Material) {
  const resolved = material ?? {
    color: "#ffffff",
    id: "material:fallback:default",
    metalness: 0.05,
    name: "Default Material",
    roughness: 0.8
  };

  return {
    baseColorTexture: await resolveEmbeddedTextureUri(resolved.colorTexture ?? resolveGeneratedBlockoutTexture(resolved)),
    color: resolved.color,
    id: resolved.id,
    metallicFactor: resolved.metalness ?? 0,
    metallicRoughnessTexture: await createMetallicRoughnessTextureDataUri(
      resolved.metalnessTexture,
      resolved.roughnessTexture,
      resolved.metalness ?? 0,
      resolved.roughness ?? 0.8
    ),
    name: resolved.name,
    normalTexture: await resolveEmbeddedTextureUri(resolved.normalTexture),
    roughnessFactor: resolved.roughness ?? 0.8
  };
}

function resolveGeneratedBlockoutTexture(material: Material) {
  return material.category === "blockout"
    ? createBlockoutTextureDataUri(material.color, material.edgeColor ?? "#2f3540", material.edgeThickness ?? 0.035)
    : undefined;
}

async function ensureGltfMaterial(
  material: Awaited<ReturnType<typeof resolveExportMaterial>>,
  materials: Array<Record<string, unknown>>,
  textures: Array<Record<string, unknown>>,
  images: Array<Record<string, unknown>>,
  imageIndexByUri: Map<string, number>,
  textureIndexByUri: Map<string, number>,
  materialIndexById: Map<string, number>
) {
  const existing = materialIndexById.get(material.id);

  if (existing !== undefined) {
    return existing;
  }

  const baseColorTextureIndex = material.baseColorTexture
    ? ensureGltfTexture(material.baseColorTexture, textures, images, imageIndexByUri, textureIndexByUri)
    : undefined;
  const normalTextureIndex = material.normalTexture
    ? ensureGltfTexture(material.normalTexture, textures, images, imageIndexByUri, textureIndexByUri)
    : undefined;
  const metallicRoughnessTextureIndex = material.metallicRoughnessTexture
    ? ensureGltfTexture(material.metallicRoughnessTexture, textures, images, imageIndexByUri, textureIndexByUri)
    : undefined;

  materials.push({
    name: material.name,
    normalTexture: normalTextureIndex !== undefined ? { index: normalTextureIndex } : undefined,
    pbrMetallicRoughness: {
      ...(baseColorTextureIndex !== undefined ? { baseColorTexture: { index: baseColorTextureIndex } } : {}),
      ...(metallicRoughnessTextureIndex !== undefined
        ? { metallicRoughnessTexture: { index: metallicRoughnessTextureIndex } }
        : {}),
      baseColorFactor: hexToRgba(material.color),
      metallicFactor: material.metallicFactor,
      roughnessFactor: material.roughnessFactor
    }
  });

  const index = materials.length - 1;
  materialIndexById.set(material.id, index);
  return index;
}

function ensureGltfTexture(
  uri: string,
  textures: Array<Record<string, unknown>>,
  images: Array<Record<string, unknown>>,
  imageIndexByUri: Map<string, number>,
  textureIndexByUri: Map<string, number>
) {
  const existingTexture = textureIndexByUri.get(uri);

  if (existingTexture !== undefined) {
    return existingTexture;
  }

  const imageIndex = imageIndexByUri.get(uri) ?? images.length;

  if (!imageIndexByUri.has(uri)) {
    images.push({ uri });
    imageIndexByUri.set(uri, imageIndex);
  }

  textures.push({ sampler: 0, source: imageIndex });
  const textureIndex = textures.length - 1;
  textureIndexByUri.set(uri, textureIndex);
  return textureIndex;
}

function projectPlanarUvs(vertices: Vec3[], normal: Vec3, uvScale?: Vec2) {
  const basis = createFacePlaneBasis(normal);
  const origin = vertices[0] ?? vec3(0, 0, 0);
  const scaleX = Math.abs(uvScale?.x ?? 1) <= 0.0001 ? 1 : uvScale?.x ?? 1;
  const scaleY = Math.abs(uvScale?.y ?? 1) <= 0.0001 ? 1 : uvScale?.y ?? 1;

  return vertices.flatMap((vertex) => {
    const offset = subVec3(vertex, origin);
    return [dotVec3(offset, basis.u) * scaleX, 1 - dotVec3(offset, basis.v) * scaleY];
  });
}

function createFacePlaneBasis(normal: Vec3) {
  const normalizedNormal = normalizeVec3(normal);
  const reference = Math.abs(normalizedNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, normalizedNormal));
  const v = normalizeVec3(crossVec3(normalizedNormal, u));

  return { u, v };
}

async function resolveEmbeddedTextureUri(source?: string) {
  if (!source) {
    return undefined;
  }

  if (source.startsWith("data:")) {
    return source;
  }

  const response = await fetch(source);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return `data:${blob.type || "application/octet-stream"};base64,${toBase64(new Uint8Array(buffer))}`;
}

async function createMetallicRoughnessTextureDataUri(
  metalnessSource: string | undefined,
  roughnessSource: string | undefined,
  metalnessFactor: number,
  roughnessFactor: number
) {
  if (!metalnessSource && !roughnessSource) {
    return undefined;
  }

  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return undefined;
  }

  const [metalness, roughness] = await Promise.all([
    loadImagePixels(metalnessSource),
    loadImagePixels(roughnessSource)
  ]);
  const width = Math.max(metalness?.width ?? 1, roughness?.width ?? 1);
  const height = Math.max(metalness?.height ?? 1, roughness?.height ?? 1);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const imageData = context.createImageData(width, height);
  const metalDefault = Math.round(clamp01(metalnessFactor) * 255);
  const roughDefault = Math.round(clamp01(roughnessFactor) * 255);

  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = 0;
    imageData.data[index + 1] = roughness?.pixels[index] ?? roughDefault;
    imageData.data[index + 2] = metalness?.pixels[index] ?? metalDefault;
    imageData.data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const buffer = await blob.arrayBuffer();
  return `data:image/png;base64,${toBase64(new Uint8Array(buffer))}`;
}

async function loadImagePixels(source?: string) {
  if (!source || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return undefined;
  }

  const response = await fetch(source);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    bitmap.close();
    return undefined;
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);

  return {
    height: imageData.height,
    pixels: imageData.data,
    width: imageData.width
  };
}

function computePrimitiveNormals(positions: number[], indices: number[]) {
  const normals = new Array<number>(positions.length).fill(0);

  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const normal = normalizeVec3(
      crossVec3(
        vec3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]),
        vec3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2])
      )
    );

    [a, b, c].forEach((offset) => {
      normals[offset] = normal.x;
      normals[offset + 1] = normal.y;
      normals[offset + 2] = normal.z;
    });
  }

  return normals;
}

function computeCylinderUvs(positions: number[]) {
  const uvs: number[] = [];

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    const u = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
    const v = y > 0 ? 1 : 0;
    uvs.push(u, v);
  }

  return uvs;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createCylinderPrimitive() {
  const radius = 0.65;
  const halfHeight = 1.1;
  const segments = 12;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, -halfHeight, z, x, halfHeight, z);
  }

  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = next * 2;
    const nextTop = nextBottom + 1;

    indices.push(bottom, nextBottom, top, top, nextBottom, nextTop);
  }

  return { indices, positions };
}

function computePositionBounds(positions: number[]) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index]);
    min[1] = Math.min(min[1], positions[index + 1]);
    min[2] = Math.min(min[2], positions[index + 2]);
    max[0] = Math.max(max[0], positions[index]);
    max[1] = Math.max(max[1], positions[index + 1]);
    max[2] = Math.max(max[2], positions[index + 2]);
  }

  return { max, min };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255, 1];
}
