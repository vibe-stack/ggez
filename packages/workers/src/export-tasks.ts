import { getFaceVertices, reconstructBrushFaces, triangulateMeshFace } from "@ggez/geometry-kernel";
import type { SceneDocumentSnapshot } from "@ggez/editor-core";
import {
  createBlockoutTextureDataUri,
  crossVec3,
  dotVec3,
  isBrushNode,
  isGroupNode,
  isInstancingNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  normalizeVec3,
  resolveInstancingSourceNode,
  subVec3,
  vec3,
  type Asset,
  type Material,
  type MaterialID,
  type Vec2,
  type Vec3
} from "@ggez/shared";
import {
  buildRuntimeBundleFromSnapshot,
  buildRuntimeSceneFromSnapshot,
  serializeRuntimeScene,
  type WebHammerEngineBundle
} from "@ggez/runtime-build";
import {
  type WebHammerEngineScene,
  type WebHammerExportGeometry,
  type WebHammerExportGeometryLod,
  type WebHammerExportModelLod,
  type WebHammerExportMaterial
} from "@ggez/runtime-format";
import { MeshBVH } from "three-mesh-bvh";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export type WorkerExportKind = "whmap-load" | "whmap-save" | "engine-export" | "gltf-export" | "ai-model-generate";

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
    }
  | {
      id: string;
      kind: "ai-model-generate";
      prompt: string;
    };

export type WorkerResponse =
  | {
      id: string;
      kind: WorkerExportKind;
      ok: true;
      payload: string | SceneDocumentSnapshot | WebHammerEngineBundle;
    }
  | {
      id: string;
      kind: WorkerExportKind;
      ok: false;
      error: string;
    };

const gltfLoader = new GLTFLoader();
const gltfExporter = new GLTFExporter();
const mtlLoader = new MTLLoader();
const modelTextureLoader = new TextureLoader();

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
        payload: await exportEngineBundle(request.snapshot)
      };
    }

    if (request.kind === "ai-model-generate") {
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        payload: await generateAiModel(request.prompt)
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

async function generateAiModel(prompt: string): Promise<string> {
  const response = await fetch(new URL("/api/ai/models", self.location.origin), {
    body: JSON.stringify({ prompt }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const payload = await response.text();

  if (!response.ok) {
    try {
      const parsed = JSON.parse(payload) as { error?: string };
      throw new Error(parsed.error ?? "Failed to generate AI model.");
    } catch {
      throw new Error(payload || "Failed to generate AI model.");
    }
  }

  return payload;
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
  return serializeRuntimeScene(snapshot);
}

export async function exportEngineBundle(snapshot: SceneDocumentSnapshot): Promise<WebHammerEngineBundle> {
  return buildRuntimeBundleFromSnapshot(snapshot);
}

async function buildEngineScene(snapshot: SceneDocumentSnapshot): Promise<WebHammerEngineScene> {
  return buildRuntimeSceneFromSnapshot(snapshot);
}

export async function serializeGltfScene(snapshot: SceneDocumentSnapshot): Promise<string> {
  const materialsById = new Map(snapshot.materials.map((material) => [material.id, material]));
  const assetsById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const exportedNodes: Array<{
    id: string;
    mesh?: {
      name: string;
      primitives: Array<{
        indices: number[];
        material: WebHammerExportMaterial;
        normals: number[];
        positions: number[];
        uvs: number[];
      }>;
    };
    meshKey?: string;
    name: string;
    parentId?: string;
    rotation?: [number, number, number, number];
    scale: [number, number, number];
    translation: [number, number, number];
  }> = [];

  for (const node of snapshot.nodes) {
    if (isGroupNode(node)) {
      exportedNodes.push({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        rotation: toQuaternion(node.transform.rotation),
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
      continue;
    }

    if (isBrushNode(node) || isMeshNode(node) || isPrimitiveNode(node)) {
      const geometry = await buildExportGeometry(node, materialsById);

      if (geometry.primitives.length === 0) {
        continue;
      }

      exportedNodes.push({
        id: node.id,
        mesh: {
          name: node.name,
          primitives: geometry.primitives
        },
        meshKey: node.id,
        name: node.name,
        parentId: node.parentId,
        rotation: toQuaternion(node.transform.rotation),
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
      continue;
    }

    if (isInstancingNode(node)) {
      const sourceNode = resolveInstancingSourceNode(snapshot.nodes, node);

      if (!sourceNode || !(isBrushNode(sourceNode) || isMeshNode(sourceNode) || isPrimitiveNode(sourceNode) || isModelNode(sourceNode))) {
        continue;
      }

      const instanceTransform = sanitizeInstanceTransform(node.transform);

      if (isModelNode(sourceNode)) {
        const previewColor = assetsById.get(sourceNode.data.assetId)?.metadata.previewColor;
        const primitive = createCylinderPrimitive();
        exportedNodes.push({
          id: node.id,
          mesh: {
            name: sourceNode.name,
            primitives: [
              {
                indices: primitive.indices,
                material: await resolveExportMaterial({
                  color: typeof previewColor === "string" ? previewColor : "#7f8ea3",
                  id: `material:model:${sourceNode.id}`,
                  metalness: 0.1,
                  name: `${sourceNode.name} Material`,
                  roughness: 0.55
                }),
                normals: computePrimitiveNormals(primitive.positions, primitive.indices),
                positions: primitive.positions,
                uvs: computeCylinderUvs(primitive.positions)
              }
            ]
          },
          meshKey: sourceNode.id,
          name: node.name,
          parentId: node.parentId,
          rotation: toQuaternion(instanceTransform.rotation),
          scale: [instanceTransform.scale.x, instanceTransform.scale.y, instanceTransform.scale.z],
          translation: [instanceTransform.position.x, instanceTransform.position.y, instanceTransform.position.z]
        });
        continue;
      }

      const geometry = await buildExportGeometry(sourceNode, materialsById);

      if (geometry.primitives.length === 0) {
        continue;
      }

      exportedNodes.push({
        id: node.id,
        mesh: {
          name: sourceNode.name,
          primitives: geometry.primitives
        },
        meshKey: sourceNode.id,
        name: node.name,
        parentId: node.parentId,
        rotation: toQuaternion(instanceTransform.rotation),
        scale: [instanceTransform.scale.x, instanceTransform.scale.y, instanceTransform.scale.z],
        translation: [instanceTransform.position.x, instanceTransform.position.y, instanceTransform.position.z]
      });
      continue;
    }

    if (isModelNode(node)) {
      const previewColor = assetsById.get(node.data.assetId)?.metadata.previewColor;
      const primitive = createCylinderPrimitive();
      exportedNodes.push({
        id: node.id,
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
        meshKey: node.id,
        name: node.name,
        parentId: node.parentId,
        rotation: toQuaternion(node.transform.rotation),
        scale: [node.transform.scale.x, node.transform.scale.y, node.transform.scale.z],
        translation: [node.transform.position.x, node.transform.position.y, node.transform.position.z]
      });
    }
  }

  return buildGltfDocument(exportedNodes);
}

async function buildGltfDocument(
  exportedNodes: Array<{
    id: string;
    mesh?: {
      name: string;
      primitives: Array<{
        indices: number[];
        material: WebHammerExportMaterial;
        normals: number[];
        positions: number[];
        uvs: number[];
      }>;
    };
    meshKey?: string;
    name: string;
    parentId?: string;
    rotation?: [number, number, number, number];
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
  const meshIndexByKey = new Map<string, number>();

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

  const nodeIndexById = new Map<string, number>();

  for (const exportedNode of exportedNodes) {
    let meshIndex: number | undefined;

    if (exportedNode.mesh) {
      const meshKey = exportedNode.meshKey ?? exportedNode.id;
      const cachedMeshIndex = meshIndexByKey.get(meshKey);

      if (cachedMeshIndex !== undefined) {
        meshIndex = cachedMeshIndex;
      } else {
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
        meshIndex = gltfMeshes.length - 1;
        meshIndexByKey.set(meshKey, meshIndex);
      }
    }

    nodes.push({
      ...(meshIndex !== undefined ? { mesh: meshIndex } : {}),
      name: exportedNode.name,
      ...(exportedNode.rotation ? { rotation: exportedNode.rotation } : {}),
      scale: exportedNode.scale,
      translation: exportedNode.translation
    });
    nodeIndexById.set(exportedNode.id, nodes.length - 1);
  }

  const rootNodeIndices: number[] = [];

  exportedNodes.forEach((exportedNode, index) => {
    const parentIndex =
      exportedNode.parentId
        ? nodeIndexById.get(exportedNode.parentId)
        : undefined;

    if (parentIndex === undefined) {
      rootNodeIndices.push(index);
      return;
    }

    const parent = nodes[parentIndex] as { children?: number[] };
    parent.children = [...(parent.children ?? []), index];
  });

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
        nodes: rootNodeIndices
      }
    ],
    textures
  };

  return JSON.stringify(gltf, null, 2);
}

async function buildExportGeometry(
  node: Extract<SceneDocumentSnapshot["nodes"][number], { kind: "brush" | "mesh" | "primitive" }>,
  materialsById: Map<MaterialID, Material>
) {
  const fallbackMaterial = await resolveExportMaterial({
    color: node.kind === "brush" ? "#f69036" : node.kind === "primitive" && node.data.role === "prop" ? "#7f8ea3" : "#6ed5c0",
    id: `material:fallback:${node.id}`,
    metalness: node.kind === "brush" ? 0 : node.kind === "primitive" && node.data.role === "prop" ? 0.12 : 0.05,
    name: `${node.name} Default`,
    roughness: node.kind === "brush" ? 0.95 : node.kind === "primitive" && node.data.role === "prop" ? 0.64 : 0.82
  });
  const primitiveByMaterial = new Map<string, {
    indices: number[];
    material: WebHammerExportMaterial;
    normals: number[];
    positions: number[];
    uvs: number[];
  }>();

  const appendFace = async (params: {
    faceMaterialId?: string;
    normal: Vec3;
    triangleIndices: number[];
    uvOffset?: Vec2;
    uvScale?: Vec2;
    uvs?: Vec2[];
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
    const uvs = params.uvs && params.uvs.length === params.vertices.length
      ? params.uvs.flatMap((uv) => [uv.x, uv.y])
      : projectPlanarUvs(params.vertices, params.normal, params.uvScale, params.uvOffset);

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
        uvOffset: face.uvOffset,
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
        uvOffset: face.uvOffset,
        uvScale: face.uvScale,
        uvs: face.uvs,
        vertices: getFaceVertices(node.data, face.id).map((vertex) => vertex.position)
      });
    }
  }

  if (isPrimitiveNode(node)) {
    const material = node.data.materialId ? await resolveExportMaterial(materialsById.get(node.data.materialId)) : fallbackMaterial;
    const primitive = buildPrimitiveGeometry(node.data.shape, node.data.size, node.data.radialSegments ?? 24);

    if (primitive) {
      primitiveByMaterial.set(material.id, {
        indices: primitive.indices,
        material,
        normals: primitive.normals,
        positions: primitive.positions,
        uvs: primitive.uvs
      });
    }
  }

  return {
    primitives: Array.from(primitiveByMaterial.values())
  };
}

async function buildGeometryLods(
  geometry: WebHammerExportGeometry,
  settings: SceneDocumentSnapshot["settings"]["world"]["lod"]
): Promise<WebHammerExportGeometryLod[] | undefined> {
  if (!geometry.primitives.length) {
    return undefined;
  }

  const midGeometry = simplifyExportGeometry(geometry, settings.midDetailRatio);
  const lowGeometry = simplifyExportGeometry(geometry, settings.lowDetailRatio);
  const lods: WebHammerExportGeometryLod[] = [];

  if (midGeometry) {
    lods.push({
      geometry: midGeometry,
      level: "mid"
    });
  }

  if (lowGeometry) {
    lods.push({
      geometry: lowGeometry,
      level: "low"
    });
  }

  return lods.length ? lods : undefined;
}

async function buildModelLods(
  name: string,
  asset: Asset | undefined,
  nodeId: string,
  settings: SceneDocumentSnapshot["settings"]["world"]["lod"]
): Promise<{ assets: Asset[]; lods?: WebHammerExportModelLod[] }> {
  if (!asset?.path) {
    return { assets: [], lods: undefined };
  }

  const source = await loadModelSceneForLodBake(asset);
  const bakedLevels: Array<{ asset: Asset; level: WebHammerExportModelLod["level"] }> = [];

  for (const [level, ratio] of [
    ["mid", settings.midDetailRatio],
    ["low", settings.lowDetailRatio]
  ] as const) {
    const simplified = simplifyModelSceneForRatio(source, ratio);

    if (!simplified) {
      continue;
    }

    const bytes = await exportModelSceneAsGlb(simplified);
    bakedLevels.push({
      asset: createGeneratedModelLodAsset(asset, name, nodeId, level, bytes),
      level
    });
  }

  return {
    assets: bakedLevels.map((entry) => entry.asset),
    lods: bakedLevels.length
      ? bakedLevels.map((entry) => ({
          assetId: entry.asset.id,
          level: entry.level
        }))
      : undefined
  };
}

async function loadModelSceneForLodBake(asset: Asset) {
  const format = resolveModelAssetFormat(asset);

  if (format === "obj") {
    const objLoader = new OBJLoader();
    const texturePath = readModelAssetString(asset, "texturePath");
    const resolvedTexturePath = typeof texturePath === "string" && texturePath.length > 0 ? texturePath : undefined;
    const mtlText = readModelAssetString(asset, "materialMtlText");

    if (mtlText) {
      const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, resolvedTexturePath), "");
      materialCreator.preload();
      objLoader.setMaterials(materialCreator);
    } else {
      objLoader.setMaterials(undefined as never);
    }

    const object = await objLoader.loadAsync(asset.path);

    if (!mtlText && resolvedTexturePath) {
      const texture = await modelTextureLoader.loadAsync(resolvedTexturePath);
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

    return object;
  }

  return (await gltfLoader.loadAsync(asset.path)).scene;
}

function simplifyModelSceneForRatio(source: Object3D, ratio: number) {
  if (ratio >= 0.98) {
    return undefined;
  }

  const simplifiedRoot = source.clone(true);
  expandGroupedModelMeshesForLodBake(simplifiedRoot);
  let simplifiedMeshCount = 0;

  simplifiedRoot.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    if ("isSkinnedMesh" in child && child.isSkinnedMesh) {
      return;
    }

    const simplifiedGeometry = simplifyModelGeometry(child.geometry, ratio);

    if (!simplifiedGeometry) {
      return;
    }

    child.geometry = simplifiedGeometry;
    simplifiedMeshCount += 1;
  });

  return simplifiedMeshCount > 0 ? simplifiedRoot : undefined;
}

function expandGroupedModelMeshesForLodBake(root: Object3D) {
  const replacements: Array<{ container: Group; mesh: Mesh; parent: Object3D }> = [];

  root.traverse((child) => {
    if (!(child instanceof Mesh) || !Array.isArray(child.material) || child.geometry.groups.length <= 1 || !child.parent) {
      return;
    }

    const container = new Group();
    container.name = child.name ? `${child.name}:lod-groups` : "lod-groups";
    container.position.copy(child.position);
    container.quaternion.copy(child.quaternion);
    container.scale.copy(child.scale);
    container.visible = child.visible;
    container.renderOrder = child.renderOrder;
    container.userData = structuredClone(child.userData ?? {});

    child.geometry.groups.forEach((group: { count: number; materialIndex: number; start: number }, groupIndex: number) => {
      const material = child.material[group.materialIndex] ?? child.material[0];

      if (!material) {
        return;
      }

      const partGeometry = extractGeometryGroup(child.geometry, group.start, group.count);
      const partMesh = new Mesh(partGeometry, material);
      partMesh.name = child.name ? `${child.name}:group:${groupIndex}` : `group:${groupIndex}`;
      partMesh.castShadow = child.castShadow;
      partMesh.receiveShadow = child.receiveShadow;
      partMesh.userData = structuredClone(child.userData ?? {});
      container.add(partMesh);
    });

    replacements.push({
      container,
      mesh: child,
      parent: child.parent
    });
  });

  replacements.forEach(({ container, mesh, parent }) => {
    parent.add(container);
    parent.remove(mesh);
  });
}

function extractGeometryGroup(geometry: BufferGeometry, start: number, count: number) {
  const groupGeometry = new BufferGeometry();
  const index = geometry.getIndex();
  const attributes = geometry.attributes;

  Object.entries(attributes).forEach(([name, attribute]) => {
    groupGeometry.setAttribute(name, attribute);
  });

  if (index) {
    groupGeometry.setIndex(Array.from(index.array as ArrayLike<number>).slice(start, start + count));
  } else {
    groupGeometry.setIndex(Array.from({ length: count }, (_, offset) => start + offset));
  }

  groupGeometry.computeBoundingBox();
  groupGeometry.computeBoundingSphere();
  return groupGeometry;
}

function simplifyModelGeometry(geometry: BufferGeometry, ratio: number) {
  const positionAttribute = geometry.getAttribute("position");
  const vertexCount = positionAttribute?.count ?? 0;

  if (!positionAttribute || vertexCount < 12 || ratio >= 0.98) {
    return undefined;
  }

  const workingGeometry = geometry.getAttribute("normal") ? geometry : geometry.clone();

  if (!workingGeometry.getAttribute("normal")) {
    workingGeometry.computeVertexNormals();
  }

  workingGeometry.computeBoundingBox();
  const bounds = workingGeometry.boundingBox?.clone();

  if (!bounds) {
    if (workingGeometry !== geometry) {
      workingGeometry.dispose();
    }
    return undefined;
  }

  const normalAttribute = workingGeometry.getAttribute("normal");
  const uvAttribute = workingGeometry.getAttribute("uv");
  const index = workingGeometry.getIndex();
  const simplified = simplifyPrimitiveWithVertexClustering(
    {
      indices: index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: vertexCount }, (_, value) => value),
      material: {
        color: "#ffffff",
        id: "material:model-simplify",
        metallicFactor: 0,
        name: "Model Simplify",
        roughnessFactor: 1
      },
      normals: Array.from(normalAttribute.array as ArrayLike<number>),
      positions: Array.from(positionAttribute.array as ArrayLike<number>),
      uvs: uvAttribute ? Array.from(uvAttribute.array as ArrayLike<number>) : []
    },
    ratio,
    bounds
  );

  if (workingGeometry !== geometry) {
    workingGeometry.dispose();
  }

  if (!simplified) {
    return undefined;
  }

  const simplifiedGeometry = createBufferGeometryFromPrimitive(simplified);
  simplifiedGeometry.computeBoundingBox();
  simplifiedGeometry.computeBoundingSphere();
  return simplifiedGeometry;
}

async function exportModelSceneAsGlb(object: Object3D) {
  try {
    return await exportGlbBytesFromObject(object);
  } catch {
    return await exportGlbBytesFromObject(stripTextureReferencesFromObject(object.clone(true)));
  }
}

async function exportGlbBytesFromObject(object: Object3D) {
  const scene = new Scene();
  scene.add(object);
  const exported = await gltfExporter.parseAsync(scene, {
    binary: true,
    includeCustomExtensions: false
  });

  if (!(exported instanceof ArrayBuffer)) {
    throw new Error("Expected GLB binary output for baked model LOD.");
  }

  return new Uint8Array(exported);
}

function stripTextureReferencesFromObject(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const strip = (material: MeshStandardMaterial) => {
      const clone = material.clone();
      clone.alphaMap = null;
      clone.aoMap = null;
      clone.bumpMap = null;
      clone.displacementMap = null;
      clone.emissiveMap = null;
      clone.lightMap = null;
      clone.map = null;
      clone.metalnessMap = null;
      clone.normalMap = null;
      clone.roughnessMap = null;
      return clone;
    };

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        material instanceof MeshStandardMaterial
          ? strip(material)
          : new MeshStandardMaterial({
              color: "color" in material ? material.color : "#7f8ea3",
              metalness: "metalness" in material && typeof material.metalness === "number" ? material.metalness : 0.1,
              roughness: "roughness" in material && typeof material.roughness === "number" ? material.roughness : 0.8
            })
      );
      return;
    }

    child.material = child.material instanceof MeshStandardMaterial
      ? strip(child.material)
      : new MeshStandardMaterial({
          color: "color" in child.material ? child.material.color : "#7f8ea3",
          metalness: "metalness" in child.material && typeof child.material.metalness === "number" ? child.material.metalness : 0.1,
          roughness: "roughness" in child.material && typeof child.material.roughness === "number" ? child.material.roughness : 0.8
        });
  });

  return object;
}

function createGeneratedModelLodAsset(
  asset: Asset,
  name: string,
  nodeId: string,
  level: WebHammerExportModelLod["level"],
  bytes: Uint8Array
): Asset {
  return {
    id: `asset:model-lod:${slugify(`${name}-${nodeId}`)}:${level}`,
    metadata: {
      ...asset.metadata,
      lodGenerated: true,
      lodLevel: level,
      lodSourceAssetId: asset.id,
      materialMtlText: "",
      modelFormat: "glb",
      texturePath: ""
    },
    path: createBinaryDataUrl(bytes, "model/gltf-binary"),
    type: "model"
  };
}

function createBinaryDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function sanitizeInstanceTransform(transform: SceneDocumentSnapshot["nodes"][number]["transform"]) {
  return {
    position: structuredClone(transform.position),
    rotation: structuredClone(transform.rotation),
    scale: structuredClone(transform.scale)
  };
}

function resolveModelAssetFormat(asset: Asset) {
  const format = readModelAssetString(asset, "modelFormat")?.toLowerCase();
  return format === "obj" || asset.path.toLowerCase().endsWith(".obj") ? "obj" : "gltf";
}

function readModelAssetString(asset: Asset | undefined, key: string) {
  const value = asset?.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
}

function simplifyExportGeometry(geometry: WebHammerExportGeometry, ratio: number): WebHammerExportGeometry | undefined {
  const primitives = geometry.primitives
    .map((primitive) => simplifyExportPrimitive(primitive, ratio))
    .filter((primitive): primitive is WebHammerExportGeometry["primitives"][number] => primitive !== undefined);

  return primitives.length ? { primitives } : undefined;
}

function simplifyExportPrimitive(
  primitive: WebHammerExportGeometry["primitives"][number],
  ratio: number
): WebHammerExportGeometry["primitives"][number] | undefined {
  const vertexCount = Math.floor(primitive.positions.length / 3);
  const triangleCount = Math.floor(primitive.indices.length / 3);

  if (vertexCount < 12 || triangleCount < 8 || ratio >= 0.98) {
    return undefined;
  }

  const geometry = createBufferGeometryFromPrimitive(primitive);
  const boundsTree = new MeshBVH(geometry, { maxLeafSize: 12, setBoundingBox: true });
  const bounds = boundsTree.getBoundingBox(new Box3());
  const simplified = simplifyPrimitiveWithVertexClustering(primitive, ratio, bounds);

  geometry.dispose();

  if (!simplified) {
    return undefined;
  }

  return simplified;
}

function createBufferGeometryFromPrimitive(primitive: WebHammerExportGeometry["primitives"][number]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

  if (primitive.uvs.length) {
    geometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
  }

  geometry.setIndex(primitive.indices);
  return geometry;
}

function simplifyPrimitiveWithVertexClustering(
  primitive: WebHammerExportGeometry["primitives"][number],
  ratio: number,
  bounds: Box3
): WebHammerExportGeometry["primitives"][number] | undefined {
  const targetVertexCount = Math.max(8, Math.floor((primitive.positions.length / 3) * Math.max(0.04, ratio)));
  const size = bounds.getSize(new Vector3());
  let resolution = Math.max(1, Math.round(Math.cbrt(targetVertexCount)));
  let best: WebHammerExportGeometry["primitives"][number] | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const simplified = clusterPrimitiveVertices(primitive, bounds, size, Math.max(1, resolution - attempt));

    if (!simplified) {
      continue;
    }

    best = simplified;

    if ((simplified.positions.length / 3) <= targetVertexCount) {
      break;
    }
  }

  if (!best) {
    return undefined;
  }

  if (best.positions.length >= primitive.positions.length || best.indices.length >= primitive.indices.length) {
    return undefined;
  }

  return best;
}

function clusterPrimitiveVertices(
  primitive: WebHammerExportGeometry["primitives"][number],
  bounds: Box3,
  size: Vector3,
  resolution: number
): WebHammerExportGeometry["primitives"][number] | undefined {
  const min = bounds.min;
  const cellSizeX = Math.max(size.x / resolution, 0.0001);
  const cellSizeY = Math.max(size.y / resolution, 0.0001);
  const cellSizeZ = Math.max(size.z / resolution, 0.0001);
  const vertexCount = primitive.positions.length / 3;
  const clusters = new Map<string, {
    count: number;
    normalX: number;
    normalY: number;
    normalZ: number;
    positionX: number;
    positionY: number;
    positionZ: number;
    uvX: number;
    uvY: number;
  }>();
  const clusterKeyByVertex = new Array<string>(vertexCount);

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const positionOffset = vertexIndex * 3;
    const uvOffset = vertexIndex * 2;
    const x = primitive.positions[positionOffset];
    const y = primitive.positions[positionOffset + 1];
    const z = primitive.positions[positionOffset + 2];
    const normalX = primitive.normals[positionOffset];
    const normalY = primitive.normals[positionOffset + 1];
    const normalZ = primitive.normals[positionOffset + 2];
    const cellX = Math.floor((x - min.x) / cellSizeX);
    const cellY = Math.floor((y - min.y) / cellSizeY);
    const cellZ = Math.floor((z - min.z) / cellSizeZ);
    const clusterKey = `${cellX}:${cellY}:${cellZ}:${resolveNormalBucket(normalX, normalY, normalZ)}`;
    const cluster = clusters.get(clusterKey) ?? {
      count: 0,
      normalX: 0,
      normalY: 0,
      normalZ: 0,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      uvX: 0,
      uvY: 0
    };

    cluster.count += 1;
    cluster.positionX += x;
    cluster.positionY += y;
    cluster.positionZ += z;
    cluster.normalX += normalX;
    cluster.normalY += normalY;
    cluster.normalZ += normalZ;
    cluster.uvX += primitive.uvs[uvOffset] ?? 0;
    cluster.uvY += primitive.uvs[uvOffset + 1] ?? 0;
    clusters.set(clusterKey, cluster);
    clusterKeyByVertex[vertexIndex] = clusterKey;
  }

  const remappedIndices: number[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const clusterIndexByKey = new Map<string, number>();

  const ensureClusterIndex = (clusterKey: string) => {
    const existing = clusterIndexByKey.get(clusterKey);

    if (existing !== undefined) {
      return existing;
    }

    const cluster = clusters.get(clusterKey);

    if (!cluster || cluster.count === 0) {
      return undefined;
    }

    const averagedNormal = normalizeVec3(vec3(cluster.normalX, cluster.normalY, cluster.normalZ));
    const index = positions.length / 3;

    positions.push(
      cluster.positionX / cluster.count,
      cluster.positionY / cluster.count,
      cluster.positionZ / cluster.count
    );
    normals.push(averagedNormal.x, averagedNormal.y, averagedNormal.z);
    uvs.push(cluster.uvX / cluster.count, cluster.uvY / cluster.count);
    clusterIndexByKey.set(clusterKey, index);
    return index;
  };

  for (let index = 0; index < primitive.indices.length; index += 3) {
    const a = ensureClusterIndex(clusterKeyByVertex[primitive.indices[index]]);
    const b = ensureClusterIndex(clusterKeyByVertex[primitive.indices[index + 1]]);
    const c = ensureClusterIndex(clusterKeyByVertex[primitive.indices[index + 2]]);

    if (a === undefined || b === undefined || c === undefined) {
      continue;
    }

    if (a === b || b === c || a === c) {
      continue;
    }

    if (triangleArea(positions, a, b, c) <= 0.000001) {
      continue;
    }

    remappedIndices.push(a, b, c);
  }

  if (remappedIndices.length < 12 || positions.length >= primitive.positions.length) {
    return undefined;
  }

  return {
    indices: remappedIndices,
    material: primitive.material,
    normals,
    positions,
    uvs
  };
}

function resolveNormalBucket(x: number, y: number, z: number) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);

  if (ax >= ay && ax >= az) {
    return x >= 0 ? "xp" : "xn";
  }

  if (ay >= ax && ay >= az) {
    return y >= 0 ? "yp" : "yn";
  }

  return z >= 0 ? "zp" : "zn";
}

function triangleArea(positions: number[], a: number, b: number, c: number) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const bx = positions[b * 3];
  const by = positions[b * 3 + 1];
  const bz = positions[b * 3 + 2];
  const cx = positions[c * 3];
  const cy = positions[c * 3 + 1];
  const cz = positions[c * 3 + 2];
  const ab = vec3(bx - ax, by - ay, bz - az);
  const ac = vec3(cx - ax, cy - ay, cz - az);
  const cross = crossVec3(ab, ac);

  return Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) * 0.5;
}

function buildPrimitiveGeometry(shape: "cone" | "cube" | "cylinder" | "sphere", size: Vec3, radialSegments: number) {
  const geometry =
    shape === "cube"
      ? new BoxGeometry(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z))
      : shape === "sphere"
        ? new SphereGeometry(Math.max(Math.abs(size.x), Math.abs(size.z)) * 0.5, radialSegments, Math.max(8, Math.floor(radialSegments * 0.75)))
        : shape === "cylinder"
          ? new CylinderGeometry(Math.max(Math.abs(size.x), Math.abs(size.z)) * 0.5, Math.max(Math.abs(size.x), Math.abs(size.z)) * 0.5, Math.abs(size.y), radialSegments)
          : new ConeGeometry(Math.max(Math.abs(size.x), Math.abs(size.z)) * 0.5, Math.abs(size.y), radialSegments);
  const positionAttribute = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const uvAttribute = geometry.getAttribute("uv");
  const index = geometry.getIndex();

  const primitive = {
    indices: index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: positionAttribute.count }, (_, value) => value),
    normals: Array.from(normalAttribute.array as ArrayLike<number>),
    positions: Array.from(positionAttribute.array as ArrayLike<number>),
    uvs: uvAttribute ? Array.from(uvAttribute.array as ArrayLike<number>) : []
  };

  geometry.dispose();
  return primitive;
}

async function resolveExportMaterial(material?: Material) {
  const resolved = material ?? {
    color: "#ffffff",
    emissiveColor: "#000000",
    emissiveIntensity: 0,
    id: "material:fallback:default",
    metalness: 0.05,
    name: "Default Material",
    opacity: 1,
    roughness: 0.8
  };

  return {
    baseColorTexture: await resolveEmbeddedTextureUri(resolved.colorTexture ?? resolveGeneratedBlockoutTexture(resolved)),
    color: resolved.color,
    emissiveColor: resolved.emissiveColor ?? "#000000",
    emissiveIntensity: Math.max(0, resolved.emissiveIntensity ?? 0),
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
    opacity: clamp01(resolved.opacity ?? 1),
    roughnessFactor: resolved.roughness ?? 0.8,
    side: resolved.side,
    transparent: resolved.transparent ?? false
  } satisfies WebHammerExportMaterial;
}

function resolveGeneratedBlockoutTexture(material: Material) {
  return material.category === "blockout"
    ? createBlockoutTextureDataUri(material.color, material.edgeColor ?? "#2f3540", material.edgeThickness ?? 0.035)
    : undefined;
}

async function ensureGltfMaterial(
  material: WebHammerExportMaterial,
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
    ...(material.transparent ? { alphaMode: "BLEND" } : {}),
    ...(material.emissiveColor ? { emissiveFactor: hexToRgb(material.emissiveColor, material.emissiveIntensity ?? 1) } : {}),
    name: material.name,
    normalTexture: normalTextureIndex !== undefined ? { index: normalTextureIndex } : undefined,
    pbrMetallicRoughness: {
      ...(baseColorTextureIndex !== undefined ? { baseColorTexture: { index: baseColorTextureIndex } } : {}),
      ...(metallicRoughnessTextureIndex !== undefined
        ? { metallicRoughnessTexture: { index: metallicRoughnessTextureIndex } }
        : {}),
      baseColorFactor: hexToRgba(material.color, material.transparent ? material.opacity ?? 1 : 1),
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

function toQuaternion(rotation: Vec3): [number, number, number, number] {
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z, "XYZ"));
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
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

function hexToRgb(hex: string, intensity = 1): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized
        .split("")
        .map((character) => `${character}${character}`)
        .join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const parsed = Number.parseInt(expanded, 16);
  const scale = Math.max(0, intensity);

  return [
    (((parsed >> 16) & 255) / 255) * scale,
    (((parsed >> 8) & 255) / 255) * scale,
    ((parsed & 255) / 255) * scale
  ];
}

function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const [red, green, blue] = hexToRgb(hex);
  return [red, green, blue, clamp01(alpha)];
}
