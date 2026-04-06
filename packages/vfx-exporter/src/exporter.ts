import { parseCompiledVfxEffect, type CompiledVfxEffect, type VfxArtifact, type VfxBundle, type VfxBundleAsset } from "@ggez/vfx-schema";

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
