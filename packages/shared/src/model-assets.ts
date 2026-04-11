import type { Asset } from "./types";

export type ModelFormat = "glb" | "gltf" | "obj";
export type ModelLodLevel = string;

export type ModelAssetFile = {
  format: ModelFormat;
  level: ModelLodLevel;
  materialMtlText?: string;
  path: string;
  texturePath?: string;
};

const MODEL_ASSET_FILES_METADATA_KEY = "modelFiles";
export const HIGH_MODEL_LOD_LEVEL = "high" as const;
export const DEFAULT_MODEL_LOD_LEVEL_ORDER: ModelLodLevel[] = [HIGH_MODEL_LOD_LEVEL, "mid", "low"];

export function createSerializedModelAssetFiles(files: ModelAssetFile[]): string {
  return JSON.stringify(sortModelAssetFiles(files));
}

export function resolveModelAssetFile(asset: Asset | undefined, level: ModelLodLevel = HIGH_MODEL_LOD_LEVEL): ModelAssetFile | undefined {
  const files = resolveModelAssetFiles(asset);
  return files.find((file) => normalizeModelLodLevelId(file.level) === normalizeModelLodLevelId(level));
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
    filesByLevel.set(normalizeModelLodLevelId(file.level), {
      ...file,
      level: normalizeModelLodLevelId(file.level)
    });
  });

  if (legacyPrimaryFile) {
    filesByLevel.set(HIGH_MODEL_LOD_LEVEL, {
      ...legacyPrimaryFile,
      ...filesByLevel.get(HIGH_MODEL_LOD_LEVEL)
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

export function sortModelAssetFiles(files: ModelAssetFile[], levelOrder: ModelLodLevel[] = DEFAULT_MODEL_LOD_LEVEL_ORDER): ModelAssetFile[] {
  const normalizedLevelOrder = levelOrder.map((level) => normalizeModelLodLevelId(level));

  return [...files]
    .filter((file) => Boolean(file.path))
    .map((file) => ({
      ...file,
      level: normalizeModelLodLevelId(file.level)
    }))
    .sort((left, right) => {
      const leftIndex = normalizedLevelOrder.indexOf(left.level);
      const rightIndex = normalizedLevelOrder.indexOf(right.level);

      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) - (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER);
      }

      return left.level.localeCompare(right.level);
    });
}

export function buildModelLodLevelOrder(levels: Iterable<ModelLodLevel>) {
  const ordered = new Set<ModelLodLevel>(DEFAULT_MODEL_LOD_LEVEL_ORDER);

  Array.from(levels)
    .map((level) => normalizeModelLodLevelId(level))
    .filter((level) => level !== HIGH_MODEL_LOD_LEVEL)
    .sort((left, right) => left.localeCompare(right))
    .forEach((level) => {
      ordered.add(level);
    });

  return Array.from(ordered);
}

export function normalizeModelLodLevelId(level: string | undefined): ModelLodLevel {
  const normalized = typeof level === "string" ? level.trim().toLowerCase() : "";
  return normalized.length > 0 ? normalized : HIGH_MODEL_LOD_LEVEL;
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

        if (typeof candidate.level !== "string" || typeof candidate.path !== "string" || candidate.path.length === 0) {
          return [];
        }

        return [
          {
            format: resolveModelFormat(candidate.format, candidate.path),
            level: normalizeModelLodLevelId(candidate.level),
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

function readModelMetadataString(asset: Asset, key: string) {
  const value = asset.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}