import type { Asset, GeometryNode, PrimitiveNode, Vec3 } from "@ggez/shared";
import {
  buildModelLodLevelOrder,
  createSerializedModelAssetFiles,
  HIGH_MODEL_LOD_LEVEL,
  isModelNode,
  isPrimitiveNode,
  normalizeModelLodLevelId,
  resolveModelAssetFile,
  resolveModelAssetFiles,
  resolveModelFormat,
  vec3,
  type ModelAssetFile,
  type ModelFormat,
  type ModelLodLevel
} from "@ggez/shared";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Vector3 } from "three";

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

export type ModelBounds = {
  center: Vec3;
  size: Vec3;
};

export type ModelAssetSource = "ai" | "import" | "placeholder" | "unknown";

export type ModelAssetLibraryItem = {
  asset: Asset;
  files: ModelAssetFile[];
  format: ModelFormat;
  label: string;
  nodeIds: string[];
  source: ModelAssetSource;
  usageCount: number;
};

export async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Failed to load ${file.name}.`));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function analyzeModelSource(input: {
  format?: ModelFormat;
  path: string;
}): Promise<ModelBounds> {
  const model =
    input.format === "obj"
      ? await objLoader.loadAsync(input.path)
      : (await gltfLoader.loadAsync(input.path)).scene;
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());

  return {
    center: vec3(center.x, center.y, center.z),
    size: vec3(
      Math.max(size.x, 0.001),
      Math.max(size.y, 0.001),
      Math.max(size.z, 0.001)
    )
  };
}

export function createModelAsset(input: {
  center: Vec3;
  files?: ModelAssetFile[];
  format?: ModelFormat;
  materialMtlText?: string;
  name: string;
  path: string;
  size: Vec3;
  source: "ai" | "import" | "placeholder";
  prompt?: string;
  texturePath?: string;
}) {
  const files = resolveImportedModelFiles(input);
  const primaryFile = files.find((file) => file.level === HIGH_MODEL_LOD_LEVEL) ?? files[0];

  return {
    id: `asset:model:${slugify(input.name)}:${crypto.randomUUID()}`,
    metadata: {
      modelFiles: createSerializedModelAssetFiles(files),
      modelFormat: primaryFile?.format ?? input.format ?? "glb",
      materialMtlText: primaryFile?.materialMtlText ?? input.materialMtlText ?? "",
      name: input.name,
      nativeCenterX: input.center.x,
      nativeCenterY: input.center.y,
      nativeCenterZ: input.center.z,
      nativeSizeX: input.size.x,
      nativeSizeY: input.size.y,
      nativeSizeZ: input.size.z,
      previewColor: input.source === "ai" ? "#9fd0b1" : "#7f8ea3",
      prompt: input.prompt ?? "",
      source: input.source,
      texturePath: primaryFile?.texturePath ?? input.texturePath ?? ""
    },
    path: primaryFile?.path ?? input.path,
    type: "model"
  } satisfies Asset;
}

export function resolveModelAssetName(asset: Asset) {
  const metadataName = asset.metadata.name;

  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }

  const slug = asset.id.split(":")[2] ?? asset.id;

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveModelAssetFormat(asset: Asset): ModelFormat {
  return resolveModelAssetFormatFromFiles(asset, resolveModelAssetFiles(asset));
}

export function resolveModelAssetSource(asset: Asset): ModelAssetSource {
  const source = asset.metadata.source;

  return source === "ai" || source === "import" || source === "placeholder" ? source : "unknown";
}

export function collectModelAssetUsage(nodes: Iterable<GeometryNode>, includedAssetIds?: ReadonlySet<string>) {
  const usage = new Map<string, string[]>();

  for (const node of nodes) {
    if (!isModelNode(node)) {
      continue;
    }

    if (includedAssetIds && !includedAssetIds.has(node.data.assetId)) {
      continue;
    }

    const existing = usage.get(node.data.assetId);

    if (existing) {
      existing.push(node.id);
      continue;
    }

    usage.set(node.data.assetId, [node.id]);
  }

  return usage;
}

export function buildModelAssetLibrary(assets: Iterable<Asset>, nodes: Iterable<GeometryNode>): ModelAssetLibraryItem[] {
  const modelAssets = Array.from(assets).filter((asset): asset is Asset => asset.type === "model");

  if (modelAssets.length === 0) {
    return [];
  }

  const usage = collectModelAssetUsage(
    nodes,
    new Set(modelAssets.map((asset) => asset.id))
  );

  return modelAssets
    .map((asset) => {
      const nodeIds = usage.get(asset.id) ?? [];
      const files = resolveModelAssetFiles(asset);

      return {
        asset,
        files,
        format: resolveModelAssetFormatFromFiles(asset, files),
        label: resolveModelAssetName(asset),
        nodeIds,
        source: resolveModelAssetSource(asset),
        usageCount: nodeIds.length
      } satisfies ModelAssetLibraryItem;
    })
    .sort((left, right) => {
      if (right.usageCount !== left.usageCount) {
        return right.usageCount - left.usageCount;
      }

      return left.label.localeCompare(right.label);
    });
}

function resolveModelAssetFormatFromFiles(asset: Asset, files: ModelAssetFile[]): ModelFormat {
  const primaryFile = files.find((file) => normalizeModelLodLevelId(file.level) === HIGH_MODEL_LOD_LEVEL) ?? files[0];
  return resolveModelFormat(primaryFile?.format ?? asset.metadata.modelFormat, primaryFile?.path ?? asset.path);
}

export function inferModelLodLevelFromFileName(fileName: string): ModelLodLevel {
  const normalized = fileName.toLowerCase();

  if (/(^|[^a-z0-9])(lod0|lod_0|high|hero|base)([^a-z0-9]|$)/.test(normalized)) {
    return HIGH_MODEL_LOD_LEVEL;
  }

  if (/(^|[^a-z0-9])(lod1|lod_1|mid|medium)([^a-z0-9]|$)/.test(normalized)) {
    return "mid";
  }

  if (/(^|[^a-z0-9])(lod2|lod_2|low|proxy)([^a-z0-9]|$)/.test(normalized)) {
    return "low";
  }

  return HIGH_MODEL_LOD_LEVEL;
}

export function resolveImportedModelAssetName(files: File[]) {
  const baseNames = files.map((file) => file.name.replace(/\.[^.]+$/, ""));
  const first = baseNames[0] ?? "Imported Model";
  const stripped = first.replace(/(?:[_\-\s]?lod[0-9]|[_\-\s]?(?:high|mid|medium|low|proxy|hero|base))$/i, "");
  return stripped.trim() || first || "Imported Model";
}

function resolveImportedModelFiles(input: {
  files?: ModelAssetFile[];
  format?: ModelFormat;
  materialMtlText?: string;
  path: string;
  texturePath?: string;
}) {
  if (input.files && input.files.length > 0) {
    return dedupeModelFiles(input.files);
  }

  return [
    {
      format: input.format ?? "glb",
      level: "high",
      materialMtlText: input.materialMtlText,
      path: input.path,
      texturePath: input.texturePath
    } satisfies ModelAssetFile
  ];
}

export function dedupeModelFiles(files: ModelAssetFile[]) {
  const filesByLevel = new Map<ModelLodLevel, ModelAssetFile>();

  files.forEach((file) => {
    filesByLevel.set(normalizeModelLodLevelId(file.level), {
      ...file,
      level: normalizeModelLodLevelId(file.level)
    });
  });

  return buildModelLodLevelOrder(filesByLevel.keys()).flatMap((level) => {
    const file = filesByLevel.get(level);
    return file ? [file] : [];
  });
}

export function resolveModelBoundsFromAsset(asset: Asset | undefined): ModelBounds | undefined {
  if (!asset || asset.type !== "model") {
    return undefined;
  }

  const {
    nativeCenterX,
    nativeCenterY,
    nativeCenterZ,
    nativeSizeX,
    nativeSizeY,
    nativeSizeZ
  } = asset.metadata;

  if (
    typeof nativeCenterX !== "number" ||
    typeof nativeCenterY !== "number" ||
    typeof nativeCenterZ !== "number" ||
    typeof nativeSizeX !== "number" ||
    typeof nativeSizeY !== "number" ||
    typeof nativeSizeZ !== "number"
  ) {
    return undefined;
  }

  return {
    center: vec3(nativeCenterX, nativeCenterY, nativeCenterZ),
    size: vec3(nativeSizeX, nativeSizeY, nativeSizeZ)
  };
}

export function resolveModelFitScale(targetBounds: Vec3, modelBounds: ModelBounds) {
  return Math.max(
    0.001,
    Math.min(
      targetBounds.x / modelBounds.size.x,
      targetBounds.y / modelBounds.size.y,
      targetBounds.z / modelBounds.size.z
    )
  );
}

export function resolvePrimitiveNodeBounds(node: GeometryNode) {
  if (!isPrimitiveNode(node)) {
    return undefined;
  }

  return vec3(
    Math.abs(node.data.size.x * node.transform.scale.x),
    Math.abs(node.data.size.y * node.transform.scale.y),
    Math.abs(node.data.size.z * node.transform.scale.z)
  );
}

export function createAiModelPlaceholder(position: Vec3): Pick<PrimitiveNode, "data" | "name" | "transform"> {
  return {
    data: {
      materialId: "material:flat:steel",
      role: "prop",
      shape: "cube",
      size: vec3(2, 2, 2)
    },
    name: "AI Object Draft",
    transform: {
      pivot: undefined,
      position: vec3(position.x, position.y + 1, position.z),
      rotation: vec3(0, 0, 0),
      scale: vec3(1, 1, 1)
    }
  };
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
}
