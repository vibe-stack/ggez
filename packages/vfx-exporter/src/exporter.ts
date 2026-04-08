import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import {
  parseCompiledVfxEffect,
  parseVfxArtifact,
  parseVfxBundle,
  parseVfxEffectDocument,
  type CompiledVfxEffect,
  type VfxArtifact,
  type VfxBundle,
  type VfxBundleAsset,
  type VfxEffectDocument
} from "@ggez/vfx-schema";

export function createVfxArtifact(input: { effect: CompiledVfxEffect }): VfxArtifact {
  return {
    format: "ggez.vfx.artifact",
    version: 1,
    effect: parseCompiledVfxEffect(input.effect)
  };
}

export function createVfxBundle(input: {
  name: string;
  artifactPath: string;
  assets?: VfxBundleAsset[];
}): VfxBundle {
  return {
    format: "ggez.vfx.bundle",
    version: 1,
    name: input.name,
    artifact: input.artifactPath,
    assets: input.assets ?? []
  };
}

export function serializeVfxArtifact(artifact: VfxArtifact) {
  return JSON.stringify(artifact, null, 2);
}

export function serializeVfxBundle(bundle: VfxBundle) {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Creates a .vfxbundle zip file containing effect.json (the compiled artifact)
 * and manifest.json (the bundle descriptor). Returns raw zip bytes.
 *
 * Each entry in `assets` should supply a `data: Uint8Array` with the file bytes.
 * If `assets` is omitted only the two JSON files are packed.
 */
export function createVfxRuntimeBundleZip(input: {
  name: string;
  artifact: VfxArtifact;
  assets?: Array<VfxBundleAsset & { data: Uint8Array }>;
  document?: VfxEffectDocument;
}): Uint8Array {
  const { name, artifact, assets = [], document } = input;

  const artifactJson = serializeVfxArtifact(artifact);
  const bundleAssetEntries: VfxBundleAsset[] = assets.map(({ data: _data, ...entry }) => entry);
  const bundle = createVfxBundle({
    name,
    artifactPath: "effect.json",
    assets: bundleAssetEntries
  });
  const manifestJson = serializeVfxBundle(bundle);

  const zipFiles: Record<string, Uint8Array> = {
    "effect.json": strToU8(artifactJson),
    "manifest.json": strToU8(manifestJson)
  };

  if (document) {
    zipFiles["document.json"] = strToU8(JSON.stringify(document, null, 2));
  }

  for (const { path, data } of assets) {
    zipFiles[`assets/${path}`] = data;
  }

  return zipSync(zipFiles, { level: 6 });
}

export function parseVfxRuntimeBundleZip(zipBytes: Uint8Array): {
  artifact: VfxArtifact;
  bundle: VfxBundle;
  document?: VfxEffectDocument;
  files: Map<string, Uint8Array>;
} {
  const files = new Map(Object.entries(unzipSync(zipBytes)));
  const artifactBytes = files.get("effect.json");
  const manifestBytes = files.get("manifest.json");

  if (!artifactBytes) {
    throw new Error("VFX bundle is missing effect.json.");
  }

  if (!manifestBytes) {
    throw new Error("VFX bundle is missing manifest.json.");
  }

  const artifact = parseVfxArtifact(JSON.parse(strFromU8(artifactBytes)));
  const bundle = parseVfxBundle(JSON.parse(strFromU8(manifestBytes)));
  const documentBytes = files.get("document.json");

  return {
    artifact,
    bundle,
    document: documentBytes ? parseVfxEffectDocument(JSON.parse(strFromU8(documentBytes))) : undefined,
    files
  };
}
