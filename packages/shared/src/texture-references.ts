import type { Material, TextureRecord } from "./types";

export const MATERIAL_TEXTURE_FIELDS = [
  "colorTexture",
  "normalTexture",
  "metalnessTexture",
  "roughnessTexture"
] as const;

export type MaterialTextureField = (typeof MATERIAL_TEXTURE_FIELDS)[number];

export function createTextureRecordMap(textures: Iterable<TextureRecord>) {
  return new Map(Array.from(textures, (texture) => [texture.id, texture] as const));
}

export function isTextureReferenceId(reference: string | undefined) {
  return typeof reference === "string" && /(^|::)texture:/.test(reference);
}

export function resolveTextureReferenceSource(
  reference: string | undefined,
  texturesById?: Map<string, TextureRecord>
) {
  if (!reference) {
    return undefined;
  }

  if (isTextureReferenceId(reference)) {
    return texturesById?.get(reference)?.dataUrl;
  }

  return reference;
}

export function textureReferenceMatches(
  reference: string | undefined,
  texture: Pick<TextureRecord, "dataUrl" | "id">
) {
  return reference === texture.id || reference === texture.dataUrl;
}

export function cloneMaterialWithResolvedTextureSources(
  material: Material,
  texturesById?: Map<string, TextureRecord>
): Material {
  return {
    ...material,
    colorTexture: resolveTextureReferenceSource(material.colorTexture, texturesById),
    metalnessTexture: resolveTextureReferenceSource(material.metalnessTexture, texturesById),
    normalTexture: resolveTextureReferenceSource(material.normalTexture, texturesById),
    roughnessTexture: resolveTextureReferenceSource(material.roughnessTexture, texturesById)
  };
}
