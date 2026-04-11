import type { Asset } from "./types";

export type ModelFormat = "glb" | "gltf" | "obj";
export type ModelLodLevel = "high" | "mid" | "low";

export type ModelAssetFile = {
  format: ModelFormat;
  level: ModelLodLevel;
  materialMtlText?: string;
  path: string;
  texturePath?: string;
};

const MODEL_ASSET_FILES_METADATA_KEY = "modelFiles";
const MODEL_LEVEL_ORDER: ModelLodLevel[] = ["high", "mid", "low"];

export function createSerializedModelAssetFiles(files: ModelAssetFile[]): string {
  return JSON.stringify(sortModelAssetFiles(files));
}

export function resolveModelAssetFile(asset: Asset | undefined, level: ModelLodLevel = "high"): ModelAssetFile | undefined {
  const files = resolveModelAssetFiles(asset);
  return files.find((file) => file.level === level);
}

export function resolveModelAssetFiles(asset: Asset | undefined): ModelAssetFile[] {
  if (!asset || asset.type !== "model") {
    return [];
  }

  const fromMetadata = parseSerializedModelAssetFiles(asset.metadata[MODEL_ASSET_FILES_METADATA_KEY]);
  const legacyPrimaryFile = asset.path
    ? {
        format: resolveModelFormat(asset.metadata.modelFormat, asset.path),
        level: "high" as const,
        materialMtlText: readModelMetadataString(asset, "materialMtlText"),
        path: asset.path,
        texturePath: readModelMetadataString(asset, "texturePath")
      }
    : undefined;

  const filesByLevel = new Map<ModelLodLevel, ModelAssetFile>();

  fromMetadata.forEach((file) => {
    filesByLevel.set(file.level, file);
  });

  if (legacyPrimaryFile) {
    filesByLevel.set("high", {
      ...legacyPrimaryFile,
      ...filesByLevel.get("high")
    });
  }

  return sortModelAssetFiles(Array.from(filesByLevel.values()));
}

export function resolveModelFormat(modelFormat: unknown, path: string): ModelFormat {
  if (modelFormat === "obj") {
    return "obj";
  }

  if (modelFormat === "gltf") {
    return "gltf";
  }

  const normalizedPath = path.toLowerCase();

  if (normalizedPath.endsWith(".obj")) {
    return "obj";
  }

  if (normalizedPath.endsWith(".gltf")) {
    return "gltf";
  }

  return "glb";
}

export function sortModelAssetFiles(files: ModelAssetFile[]): ModelAssetFile[] {
  return [...files]
    .filter((file) => Boolean(file.path))
    .sort((left, right) => MODEL_LEVEL_ORDER.indexOf(left.level) - MODEL_LEVEL_ORDER.indexOf(right.level));
}

function parseSerializedModelAssetFiles(value: unknown): ModelAssetFile[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortModelAssetFiles(
      parsed.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const candidate = entry as Partial<ModelAssetFile>;

        if (!isModelLodLevel(candidate.level) || typeof candidate.path !== "string" || candidate.path.length === 0) {
          return [];
        }

        return [
          {
            format: resolveModelFormat(candidate.format, candidate.path),
            level: candidate.level,
            materialMtlText: typeof candidate.materialMtlText === "string" ? candidate.materialMtlText : undefined,
            path: candidate.path,
            texturePath: typeof candidate.texturePath === "string" ? candidate.texturePath : undefined
          } satisfies ModelAssetFile
        ];
      })
    );
  } catch {
    return [];
  }
}

function isModelLodLevel(value: unknown): value is ModelLodLevel {
  return value === "high" || value === "mid" || value === "low";
}

function readModelMetadataString(asset: Asset, key: string) {
  const value = asset.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}