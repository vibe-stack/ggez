import { Color } from "three";
import { attribute, clamp, float, materialColor, materialMetalness, materialRoughness, mix, texture as textureFn, uniform, uv, vec4 } from "three/tsl";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import type { StandardMaterialBlendLayer } from "./material-blend";

type MeshStandardNodeMaterialWithBlendNodes = MeshStandardNodeMaterial & {
  colorNode?: unknown;
  metalnessNode?: unknown;
  roughnessNode?: unknown;
};

type ResolvedStandardMaterialBlendLayer = {
  color: Color;
  map?: StandardMaterialBlendLayer["map"];
  metalness: number;
  metalnessMap?: StandardMaterialBlendLayer["metalnessMap"];
  opacity: number;
  roughness: number;
  roughnessMap?: StandardMaterialBlendLayer["roughnessMap"];
};

export function applyMaterialLayersToNodeMaterial<T extends MeshStandardNodeMaterialWithBlendNodes>(
  material: T,
  layers?: StandardMaterialBlendLayer[],
) {
  const resolvedLayers = normalizeStandardMaterialBlendLayers(layers);

  if (!resolvedLayers.length) {
    material.needsUpdate = true;
    return material;
  }

  const blendUv = uv();
  let colorNode = material.colorNode ?? materialColor;
  let roughnessNode = material.roughnessNode ?? materialRoughness;
  let metalnessNode = material.metalnessNode ?? materialMetalness;

  resolvedLayers.forEach((layer, index) => {
    const layerColor = uniform(layer.color, "color");
    const layerSample = layer.map
      ? textureFn(layer.map, blendUv).mul(vec4(layerColor, float(1)))
      : vec4(layerColor, float(1));
    const blendWeight = clamp(
      attribute(`whBlendWeight${index}`, "float").mul(uniform(layer.opacity)).mul(layerSample.a),
      0,
      1,
    );

    colorNode = mix(colorNode, layerSample.rgb, blendWeight);

    const layerRoughness = layer.roughnessMap
      ? uniform(layer.roughness).mul(textureFn(layer.roughnessMap, blendUv).g)
      : uniform(layer.roughness);
    const layerMetalness = layer.metalnessMap
      ? uniform(layer.metalness).mul(textureFn(layer.metalnessMap, blendUv).b)
      : uniform(layer.metalness);

    roughnessNode = mix(roughnessNode, layerRoughness, blendWeight);
    metalnessNode = mix(metalnessNode, layerMetalness, blendWeight);
  });

  material.colorNode = colorNode;
  material.roughnessNode = roughnessNode;
  material.metalnessNode = metalnessNode;
  material.needsUpdate = true;
  return material;
}

function normalizeStandardMaterialBlendLayers(layers?: StandardMaterialBlendLayer[]) {
  return (layers ?? [])
    .map((layer) => normalizeStandardMaterialBlendLayer(layer))
    .filter((layer): layer is ResolvedStandardMaterialBlendLayer => Boolean(layer));
}

function normalizeStandardMaterialBlendLayer(layer?: StandardMaterialBlendLayer): ResolvedStandardMaterialBlendLayer | undefined {
  if (!layer || !Number.isFinite(layer.opacity) || layer.opacity <= 0.0001) {
    return undefined;
  }

  return {
    color: new Color(layer.color),
    ...(layer.map ? { map: layer.map } : {}),
    metalness: clamp01(layer.metalness),
    ...(layer.metalnessMap ? { metalnessMap: layer.metalnessMap } : {}),
    opacity: clamp01(layer.opacity),
    roughness: clamp01(layer.roughness),
    ...(layer.roughnessMap ? { roughnessMap: layer.roughnessMap } : {}),
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}