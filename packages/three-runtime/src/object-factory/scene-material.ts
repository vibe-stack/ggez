import {
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";
import { applyMaterialLayersToStandardMaterial } from "../material-blend";
import { applyTextureVariationToStandardMaterial } from "../material-texture-variation";
import { applyTextureVariationToNodeMaterial } from "../material-texture-variation-node";
import type { WebHammerExportMaterial, WebHammerExportPrimitive } from "../types";
import type { WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources, TextureSlot } from "./types";
import { resolveMaterialSide } from "./scene-utils";

const textureLoader = new TextureLoader();

export async function createThreeMaterial(
  materialSpec: WebHammerExportMaterial,
  blendLayersSpec: WebHammerExportPrimitive["blendLayers"] | undefined,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const cacheKey = blendLayersSpec?.length
    ? `${materialSpec.id}|layers:${blendLayersSpec.map((layer) => `${layer.material.id}:${layer.opacity}`).join(",")}`
    : materialSpec.id;
  const cached = resources.materialCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const materialParams = {
    color: materialSpec.color,
    emissive: materialSpec.emissiveColor ?? "#000000",
    emissiveIntensity: materialSpec.emissiveIntensity ?? 0,
    metalness: materialSpec.metallicFactor,
    opacity: materialSpec.transparent ? materialSpec.opacity ?? 1 : 1,
    roughness: materialSpec.roughnessFactor,
    side: resolveMaterialSide(materialSpec.side),
    transparent: materialSpec.transparent ?? false
  };

  const useNodeMaterial = !blendLayersSpec?.length && options.useNodeMaterials && materialSpec.textureVariation?.enabled;
  let material: MeshStandardMaterial;

  if (useNodeMaterial) {
    const { MeshStandardNodeMaterial } = await import("three/webgpu") as unknown as {
      MeshStandardNodeMaterial: new (parameters: typeof materialParams) => MeshStandardMaterial;
    };
    material = new MeshStandardNodeMaterial(materialParams) as unknown as MeshStandardMaterial;
  } else {
    material = new MeshStandardMaterial(materialParams);
  }

  if (materialSpec.baseColorTexture) {
    const texture = await loadTexture(materialSpec.baseColorTexture, materialSpec, "baseColorTexture", resources, options);
    texture.colorSpace = SRGBColorSpace;
    material.map = texture;
  }

  if (materialSpec.normalTexture) {
    material.normalMap = await loadTexture(materialSpec.normalTexture, materialSpec, "normalTexture", resources, options);
  }

  if (materialSpec.metallicRoughnessTexture) {
    const ormTexture = await loadTexture(
      materialSpec.metallicRoughnessTexture,
      materialSpec,
      "metallicRoughnessTexture",
      resources,
      options
    );
    material.metalnessMap = ormTexture;
    material.roughnessMap = ormTexture;
  } else {
    if (materialSpec.metalnessTexture) {
      material.metalnessMap = await loadTexture(
        materialSpec.metalnessTexture,
        materialSpec,
        "metallicRoughnessTexture",
        resources,
        options
      );
    }

    if (materialSpec.roughnessTexture) {
      material.roughnessMap = await loadTexture(
        materialSpec.roughnessTexture,
        materialSpec,
        "metallicRoughnessTexture",
        resources,
        options
      );
    }
  }

  const resolvedBlendLayers = blendLayersSpec
    ? await Promise.all(blendLayersSpec.map(async (layer) => {
        let map: Texture | undefined;
        let metalnessMap: Texture | undefined;
        let roughnessMap: Texture | undefined;

        if (layer.material.baseColorTexture) {
          map = await loadTexture(layer.material.baseColorTexture, layer.material, "baseColorTexture", resources, options);
          map.colorSpace = SRGBColorSpace;
        }

        if (layer.material.metallicRoughnessTexture) {
          const ormTexture = await loadTexture(
            layer.material.metallicRoughnessTexture,
            layer.material,
            "metallicRoughnessTexture",
            resources,
            options
          );
          metalnessMap = ormTexture;
          roughnessMap = ormTexture;
        } else {
          if (layer.material.metalnessTexture) {
            metalnessMap = await loadTexture(
              layer.material.metalnessTexture,
              layer.material,
              "metallicRoughnessTexture",
              resources,
              options
            );
          }

          if (layer.material.roughnessTexture) {
            roughnessMap = await loadTexture(
              layer.material.roughnessTexture,
              layer.material,
              "metallicRoughnessTexture",
              resources,
              options
            );
          }
        }

        return {
          color: layer.material.color,
          map,
          metalness: layer.material.metallicFactor,
          metalnessMap,
          opacity: layer.opacity,
          roughness: layer.material.roughnessFactor,
          roughnessMap,
        };
      }))
    : undefined;

  applyMaterialLayersToStandardMaterial(material, resolvedBlendLayers);

  if (useNodeMaterial) {
    applyTextureVariationToNodeMaterial(material as any, materialSpec.textureVariation);
  } else {
    applyTextureVariationToStandardMaterial(material, materialSpec.textureVariation);
  }

  material.name = materialSpec.name;
  material.needsUpdate = true;
  resources.materialCache.set(cacheKey, material);

  return material;
}

export async function loadTexture(
  path: string,
  material: WebHammerExportMaterial,
  slot: TextureSlot,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        kind: "texture",
        material,
        path,
        slot
      })
    : path;
  const cacheKey = `${slot}:${resolvedPath}`;
  const cached = resources.textureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pendingTexture = textureLoader.loadAsync(resolvedPath);
  const configuredTexture = pendingTexture.then((texture) => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
  resources.textureCache.set(cacheKey, configuredTexture);
  return configuredTexture;
}
