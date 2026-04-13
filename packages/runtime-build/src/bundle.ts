import { unzipSync, zipSync } from "fflate";
import {
  parseRuntimeScene,
  type RuntimeBundle,
  type RuntimeBundleFile,
  type RuntimeScene,
  type RuntimeWorldChunk,
  type RuntimeWorldIndex,
  type WebHammerEngineBundle,
  type WebHammerEngineScene
} from "@ggez/runtime-format";
import {
  createSerializedModelAssetFiles,
  isTextureReferenceId,
  resolveModelAssetFiles,
  resolveModelFormat,
  type ModelAssetFile
} from "@ggez/shared";

const TEXTURE_FIELDS = ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "metalnessTexture", "roughnessTexture"] as const;

type TextureField = (typeof TEXTURE_FIELDS)[number];

export type ExternalizeRuntimeAssetsOptions = {
  assetDir?: string;
  copyExternalAssets?: boolean;
};

export type PackRuntimeBundleOptions = {
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  manifestPath?: string;
};

export type BuildRuntimeWorldIndexOptions = {
  sharedAssets?: RuntimeWorldIndex["sharedAssets"];
  version?: number;
};

export async function externalizeRuntimeAssets(
  scene: RuntimeScene,
  options: ExternalizeRuntimeAssetsOptions = {}
): Promise<RuntimeBundle> {
  const startedAt = now();
  const manifest = structuredClone(scene);
  const files: RuntimeBundleFile[] = [];
  const assetDir = trimSlashes(options.assetDir ?? "assets");
  const copyExternalAssets = options.copyExternalAssets ?? true;
  const pathBySource = new Map<string, string>();
  const pendingBySource = new Map<string, Promise<string | undefined>>();
  const usedPaths = new Set<string>();

  await Promise.all(
    manifest.materials.map(async (material) => {
      await externalizeRuntimeMaterialTextures(material, `${assetDir}/textures/${slugify(material.id)}`, {
        copyExternalAssets,
        files,
        pathBySource,
        pendingBySource,
        usedPaths
      });
    })
  );

  await Promise.all(
    manifest.nodes.map(async (node) => {
      if (node.kind !== "brush" && node.kind !== "mesh" && node.kind !== "primitive") {
        return;
      }

      const geometryLevels = [node.geometry, ...(node.lods?.map((lod) => lod.geometry) ?? [])];

      await Promise.all(
        geometryLevels.flatMap((geometry, geometryIndex) =>
          geometry.primitives.flatMap(async (primitive, primitiveIndex) => {
            const baseStem = `${assetDir}/textures/${slugify(node.id)}-${geometryIndex}-${primitiveIndex}`;
            await externalizeRuntimeMaterialTextures(primitive.material, `${baseStem}-base`, {
              copyExternalAssets,
              files,
              pathBySource,
              pendingBySource,
              usedPaths
            });

            await Promise.all((primitive.blendLayers ?? (primitive.blend ? [primitive.blend] : [])).map(async (layer, layerIndex) => {
              await externalizeRuntimeMaterialTextures(layer.material, `${baseStem}-blend-${layerIndex}`, {
                copyExternalAssets,
                files,
                pathBySource,
                pendingBySource,
                usedPaths
              });
            }));
          })
        )
      );
    })
  );
  const materialTexturesCompletedAt = now();

  await Promise.all(manifest.assets.map(async (asset) => {
    if (asset.type !== "model") {
      return;
    }

    const authoredFiles = resolveModelAssetFiles(asset);

    const bundledPath = await materializeSource(asset.path, {
      copyExternalAssets,
      files,
      pathBySource,
      pendingBySource,
      preferredExtension: inferModelExtension(asset.path, asset.metadata.modelFormat),
      preferredStem: `${assetDir}/models/${slugify(asset.id)}`,
      usedPaths
    });

    if (bundledPath) {
      asset.path = bundledPath;
    }

    if (authoredFiles.length > 0) {
      const rewrittenFiles = await Promise.all(authoredFiles.map(async (authoredFile) => {
        const bundledModelPath = await materializeSource(authoredFile.path, {
          copyExternalAssets,
          files,
          pathBySource,
          pendingBySource,
          preferredExtension: inferModelExtension(authoredFile.path, authoredFile.format),
          preferredStem: `${assetDir}/models/${slugify(asset.id)}-${authoredFile.level}`,
          usedPaths
        });

        const bundledTexturePath = authoredFile.texturePath
          ? await materializeSource(authoredFile.texturePath, {
              copyExternalAssets,
              files,
              pathBySource,
              pendingBySource,
              preferredStem: `${assetDir}/model-textures/${slugify(asset.id)}-${authoredFile.level}`,
              usedPaths
            })
          : undefined;

        return {
          ...authoredFile,
          format: resolveModelFormat(authoredFile.format, bundledModelPath ?? authoredFile.path),
          path: bundledModelPath ?? authoredFile.path,
          texturePath: bundledTexturePath ?? authoredFile.texturePath
        };
      }));

      asset.metadata.modelFiles = createSerializedModelAssetFiles(rewrittenFiles);
      const highFile = rewrittenFiles.find((file) => file.level === "high") ?? rewrittenFiles[0];

      if (highFile) {
        asset.path = highFile.path;
        asset.metadata.modelFormat = highFile.format;
        asset.metadata.materialMtlText = highFile.materialMtlText ?? "";
        asset.metadata.texturePath = highFile.texturePath ?? "";
      }
    }

    const texturePath = asset.metadata.texturePath;

    if (typeof texturePath === "string" && texturePath.length > 0) {
      const bundledTexturePath = await materializeSource(texturePath, {
        copyExternalAssets,
        files,
        pathBySource,
        pendingBySource,
        preferredStem: `${assetDir}/model-textures/${slugify(asset.id)}`,
        usedPaths
      });

      if (bundledTexturePath) {
        asset.metadata.texturePath = bundledTexturePath;
      }
    }
  }));
  const assetsCompletedAt = now();

  const modelAssetsById = new Map(
    manifest.assets
      .filter((asset) => asset.type === "model")
      .map((asset) => [asset.id, asset] as const)
  );

  await Promise.all(manifest.nodes.map(async (node) => {
    if (node.kind !== "model") {
      return;
    }

    const asset = modelAssetsById.get(node.data.assetId);

    if (asset?.path) {
      node.data.path = asset.path;
      return;
    }

    if (!node.data.path) {
      return;
    }

    const bundledPath = await materializeSource(node.data.path, {
      copyExternalAssets,
      files,
      pathBySource,
      pendingBySource,
      preferredExtension: inferModelExtension(node.data.path, undefined),
      preferredStem: `${assetDir}/models/${slugify(node.id)}`,
      usedPaths
    });

    if (bundledPath) {
      node.data.path = bundledPath;
    }
  }));
  const nodeModelsCompletedAt = now();

  await Promise.all(manifest.nodes.map(async (node) => {
    if (node.kind !== "model" || !node.lods?.length) {
      return;
    }

    await Promise.all(node.lods.map(async (lod) => {
      lod.path =
        (await materializeSource(lod.path, {
          copyExternalAssets,
          files,
          pathBySource,
          pendingBySource,
          preferredExtension: inferModelExtension(lod.path, lod.format),
          preferredStem: `${assetDir}/models/${slugify(node.id)}-${lod.level}`,
          usedPaths
        })) ?? lod.path;

      if (lod.texturePath) {
        lod.texturePath =
          (await materializeSource(lod.texturePath, {
            copyExternalAssets,
            files,
            pathBySource,
            pendingBySource,
            preferredStem: `${assetDir}/model-textures/${slugify(node.id)}-${lod.level}`,
            usedPaths
          })) ?? lod.texturePath;
      }
    }));
  }));
  const lodsCompletedAt = now();

  const skyboxSource = manifest.settings.world.skybox.source;

  if (skyboxSource) {
    const bundledSkyboxPath = await materializeSource(skyboxSource, {
      copyExternalAssets,
      files,
      pathBySource,
      pendingBySource,
      preferredExtension: manifest.settings.world.skybox.format === "hdr" ? "hdr" : inferExtensionFromPath(skyboxSource),
      preferredStem: `${assetDir}/skyboxes/${slugify(manifest.settings.world.skybox.name || "skybox")}`,
      usedPaths
    });

    if (bundledSkyboxPath) {
      manifest.settings.world.skybox.source = bundledSkyboxPath;
    }
  }
  const skyboxCompletedAt = now();

  await Promise.all(manifest.entities.map(async (entity) => {
    if (entity.type !== "vfx-object") {
      return;
    }

    const existingAssetPath = typeof entity.properties.vfxBundleAssetPath === "string"
      ? entity.properties.vfxBundleAssetPath
      : "";
    const bundleSource = typeof entity.properties.vfxBundleDataUrl === "string" && entity.properties.vfxBundleDataUrl.length > 0
      ? entity.properties.vfxBundleDataUrl
      : existingAssetPath;

    if (!bundleSource) {
      return;
    }

    const bundleFileName = typeof entity.properties.vfxBundleFileName === "string"
      ? entity.properties.vfxBundleFileName
      : "";
    const preferredBaseName = bundleFileName.length > 0 ? stripExtension(bundleFileName) : entity.name || entity.id;
    const bundledVfxPath = await materializeSource(bundleSource, {
      copyExternalAssets,
      files,
      pathBySource,
      pendingBySource,
      preferredExtension: inferExtensionFromPath(bundleFileName) ?? inferExtensionFromPath(bundleSource) ?? "vfxbundle",
      preferredStem: `${assetDir}/vfx/${slugify(preferredBaseName)}`,
      usedPaths
    });

    if (bundledVfxPath) {
      entity.properties.vfxBundleAssetPath = bundledVfxPath;
      entity.properties.vfxBundleDataUrl = "";
    }
  }));
  const entitiesCompletedAt = now();

  console.info(
    `[runtime-build] externalizeRuntimeAssets completed in ${formatDuration(entitiesCompletedAt - startedAt)} ` +
      `(materials=${formatDuration(materialTexturesCompletedAt - startedAt)}, ` +
      `assets=${formatDuration(assetsCompletedAt - materialTexturesCompletedAt)}, ` +
      `modelNodes=${formatDuration(nodeModelsCompletedAt - assetsCompletedAt)}, ` +
      `lods=${formatDuration(lodsCompletedAt - nodeModelsCompletedAt)}, ` +
      `skybox=${formatDuration(skyboxCompletedAt - lodsCompletedAt)}, ` +
      `entities=${formatDuration(entitiesCompletedAt - skyboxCompletedAt)}, ` +
      `files=${files.length}, bytes=${formatBytes(sumBundleFileBytes(files))})`
  );

  return {
    files,
    manifest
  };
}

export async function buildRuntimeBundle(
  scene: RuntimeScene,
  options: ExternalizeRuntimeAssetsOptions = {}
): Promise<RuntimeBundle> {
  return externalizeRuntimeAssets(scene, options);
}

export function normalizeRuntimeScene(scene: RuntimeScene | string): RuntimeScene {
  return typeof scene === "string" ? parseRuntimeScene(scene) : parseRuntimeScene(JSON.stringify(scene));
}

export function packRuntimeBundle(bundle: RuntimeBundle, options: PackRuntimeBundleOptions = {}) {
  const manifestPath = options.manifestPath ?? "scene.runtime.json";
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {
    [manifestPath]: encoder.encode(JSON.stringify(bundle.manifest))
  };

  bundle.files.forEach((file) => {
    entries[file.path] = file.bytes;
  });

  return zipSync(entries, {
    level: options.compressionLevel ?? 6
  });
}

export function unpackRuntimeBundle(
  bytes: Uint8Array,
  options: { manifestPath?: string } = {}
): RuntimeBundle {
  const manifestPath = options.manifestPath ?? "scene.runtime.json";
  const archive = unzipSync(bytes);
  const manifestBytes = archive[manifestPath];

  if (!manifestBytes) {
    throw new Error(`Bundle is missing ${manifestPath}.`);
  }

  const manifest = parseRuntimeScene(new TextDecoder().decode(manifestBytes));
  const files = Object.entries(archive)
    .filter(([path]) => path !== manifestPath)
    .map(([path, fileBytes]) => ({
      bytes: fileBytes,
      mimeType: inferMimeTypeFromPath(path),
      path
    }));

  return {
    files,
    manifest
  };
}

export function buildRuntimeWorldIndex(
  chunks: RuntimeWorldChunk[],
  options: BuildRuntimeWorldIndexOptions = {}
): RuntimeWorldIndex {
  return {
    chunks,
    sharedAssets: options.sharedAssets,
    version: options.version ?? 1
  };
}

export async function externalizeWebHammerEngineScene(
  scene: WebHammerEngineScene,
  options: ExternalizeRuntimeAssetsOptions = {}
): Promise<WebHammerEngineBundle> {
  return externalizeRuntimeAssets(scene, options);
}

export function createWebHammerEngineBundleZip(bundle: WebHammerEngineBundle, options: PackRuntimeBundleOptions = {}) {
  return packRuntimeBundle(bundle, options);
}

export function parseWebHammerEngineBundleZip(
  bytes: Uint8Array,
  options: { manifestPath?: string } = {}
): WebHammerEngineBundle {
  return unpackRuntimeBundle(bytes, options);
}

async function materializeSource(
  source: string,
  context: {
    copyExternalAssets: boolean;
    files: RuntimeBundleFile[];
    pathBySource: Map<string, string>;
    pendingBySource: Map<string, Promise<string | undefined>>;
    preferredExtension?: string;
    preferredStem: string;
    usedPaths: Set<string>;
  }
) {
  const existing = context.pathBySource.get(source);

  if (existing) {
    return existing;
  }

  const pending = context.pendingBySource.get(source);

  if (pending) {
    return pending;
  }

  const task = (async () => {
    if (isTextureReferenceId(source)) {
      return undefined;
    }

    if (isDataUrl(source)) {
      // Use fetch() to decode the data URL — the browser/Bun runtime uses
      // optimised native base64 decoding, which is orders of magnitude faster
      // than the manual atob + charCodeAt loop in JavaScript.
      // Extract the MIME type directly from the URL rather than the response
      // headers: headers may include `;charset=…` params that would break
      // extension inference (e.g. "image/svg+xml;charset=UTF-8" → ".bin").
      const mimeType = extractDataUrlMimeType(source);
      const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
      const path = ensureUniquePath(
        `${context.preferredStem}.${inferExtension(mimeType, context.preferredExtension)}`,
        context.usedPaths
      );

      context.files.push({
        bytes,
        mimeType,
        path
      });
      context.pathBySource.set(source, path);
      return path;
    }

    if (!context.copyExternalAssets) {
      return undefined;
    }

    const response = await fetch(source);

    if (!response.ok) {
      throw new Error(`Failed to bundle asset: ${source}`);
    }

    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const path = ensureUniquePath(
      `${context.preferredStem}.${inferExtension(blob.type, context.preferredExtension ?? inferExtensionFromPath(source))}`,
      context.usedPaths
    );

    context.files.push({
      bytes,
      mimeType: blob.type || "application/octet-stream",
      path
    });
    context.pathBySource.set(source, path);

    return path;
  })();

  context.pendingBySource.set(source, task);

  try {
    return await task;
  } finally {
    context.pendingBySource.delete(source);
  }
}

function extractDataUrlMimeType(source: string) {
  const match = /^data:([^;,]+)/i.exec(source);
  return match?.[1] ?? "application/octet-stream";
}

// parseDataUrl kept for environments where fetch of data: URLs is unsupported.
function parseDataUrl(source: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(source);

  if (!match) {
    throw new Error("Invalid data URL.");
  }

  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] || "";

  if (match[2]) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return { bytes, mimeType };
  }

  return {
    bytes: new TextEncoder().encode(decodeURIComponent(payload)),
    mimeType
  };
}

function textureFieldSuffix(field: TextureField) {
  switch (field) {
    case "baseColorTexture":
      return "color";
    case "metallicRoughnessTexture":
      return "orm";
    case "metalnessTexture":
      return "metalness";
    case "roughnessTexture":
      return "roughness";
    default:
      return "normal";
  }
}

async function externalizeRuntimeMaterialTextures(
  material: RuntimeScene["materials"][number],
  preferredStem: string,
  context: {
    copyExternalAssets: boolean;
    files: RuntimeBundleFile[];
    pathBySource: Map<string, string>;
    pendingBySource: Map<string, Promise<string | undefined>>;
    usedPaths: Set<string>;
  }
) {
  await Promise.all(
    TEXTURE_FIELDS.map(async (field) => {
      const source = material[field];

      if (!source) {
        return;
      }

      const bundledPath = await materializeSource(source, {
        copyExternalAssets: context.copyExternalAssets,
        files: context.files,
        pathBySource: context.pathBySource,
        pendingBySource: context.pendingBySource,
        preferredStem: `${preferredStem}-${textureFieldSuffix(field)}`,
        usedPaths: context.usedPaths
      });

      if (bundledPath) {
        material[field] = bundledPath;
      }
    })
  );
}

function inferModelExtension(path: string, modelFormat: unknown) {
  if (typeof modelFormat === "string" && modelFormat.length > 0) {
    return modelFormat.toLowerCase();
  }

  return inferExtensionFromPath(path) ?? "bin";
}

function inferExtension(mimeType: string | undefined, fallback?: string) {
  const normalized = mimeType?.toLowerCase();

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/jpeg") {
    return "jpg";
  }

  if (normalized === "image/svg+xml") {
    return "svg";
  }

  if (normalized === "image/vnd.radiance") {
    return "hdr";
  }

  if (normalized === "application/zip") {
    return fallback ?? "zip";
  }

  if (normalized === "model/gltf+json") {
    return "gltf";
  }

  if (normalized === "model/gltf-binary" || normalized === "application/octet-stream") {
    return fallback ?? "bin";
  }

  return fallback ?? "bin";
}

function inferExtensionFromPath(path: string) {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  const parts = cleanPath.split(".");
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() : undefined;
}

function inferMimeTypeFromPath(path: string) {
  switch (inferExtensionFromPath(path)) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "hdr":
      return "image/vnd.radiance";
    case "vfxbundle":
    case "zip":
      return "application/zip";
    case "glb":
      return "model/gltf-binary";
    case "gltf":
      return "model/gltf+json";
    case "obj":
      return "text/plain";
    case "mtl":
      return "text/plain";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function ensureUniquePath(path: string, usedPaths: Set<string>) {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const lastDot = path.lastIndexOf(".");
  const stem = lastDot >= 0 ? path.slice(0, lastDot) : path;
  const extension = lastDot >= 0 ? path.slice(lastDot) : "";
  let counter = 2;

  while (usedPaths.has(`${stem}-${counter}${extension}`)) {
    counter += 1;
  }

  const resolved = `${stem}-${counter}${extension}`;
  usedPaths.add(resolved);
  return resolved;
}

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "asset";
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function sumBundleFileBytes(files: RuntimeBundleFile[]) {
  return files.reduce((total, file) => total + file.bytes.byteLength, 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(1)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function stripExtension(path: string) {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  const segments = cleanPath.split("/");
  const fileName = segments.at(-1) ?? cleanPath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex <= 0 ? fileName : fileName.slice(0, dotIndex);
}
