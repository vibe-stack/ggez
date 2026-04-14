import { Color, type Texture } from "three";
import { MeshStandardMaterial } from "three";

export type StandardMaterialBlendLayer = {
  color: string;
  map?: Texture | null;
  metalness: number;
  metalnessMap?: Texture | null;
  opacity: number;
  roughness: number;
  roughnessMap?: Texture | null;
};

type ResolvedStandardMaterialBlendLayer = {
  color: Color;
  map?: Texture;
  metalness: number;
  metalnessMap?: Texture;
  opacity: number;
  roughness: number;
  roughnessMap?: Texture;
};

type MaterialBlendUserData = {
  whMaterialBlendHooked?: boolean;
  whMaterialBlendLayers?: ResolvedStandardMaterialBlendLayer[];
};

type MaterialBlendShader = {
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
};

export function applyMaterialLayersToStandardMaterial<T extends MeshStandardMaterial>(
  material: T,
  layers?: StandardMaterialBlendLayer[],
) {
  const resolvedLayers = normalizeStandardMaterialBlendLayers(layers);
  const userData = material.userData as MaterialBlendUserData;
  const materialWithDefines = material as T & { defines?: Record<string, string> };

  userData.whMaterialBlendLayers = resolvedLayers;

  if (resolvedLayers.some((layer) => layer.map || layer.roughnessMap || layer.metalnessMap)) {
    materialWithDefines.defines = {
      ...(materialWithDefines.defines ?? {}),
      USE_UV: "",
    };
  }

  if (!resolvedLayers.length) {
    material.needsUpdate = true;
    return material;
  }

  if (userData.whMaterialBlendHooked) {
    material.needsUpdate = true;
    return material;
  }

  const baseOnBeforeCompile = material.onBeforeCompile;
  const baseProgramCacheKey = material.customProgramCacheKey?.bind(material);

  material.customProgramCacheKey = () => {
    const currentLayers = (material.userData as MaterialBlendUserData).whMaterialBlendLayers ?? [];
    const textureFingerprint = currentLayers
      .map((layer) => `${layer.map ? 1 : 0}${layer.roughnessMap ? 1 : 0}${layer.metalnessMap ? 1 : 0}`)
      .join("");

    return `${baseProgramCacheKey?.() ?? ""}|wh-material-layers:${currentLayers.length}:${textureFingerprint}`;
  };

  material.onBeforeCompile = (shader: MaterialBlendShader, renderer: unknown) => {
    (baseOnBeforeCompile as ((shader: MaterialBlendShader, renderer: unknown) => void) | undefined)?.(shader, renderer);

    const currentLayers = (material.userData as MaterialBlendUserData).whMaterialBlendLayers ?? [];

    if (!currentLayers.length) {
      return;
    }

    currentLayers.forEach((layer, index) => {
      shader.uniforms[`whBlendColor${index}`] = { value: layer.color };
      shader.uniforms[`whBlendOpacity${index}`] = { value: layer.opacity };
      shader.uniforms[`whBlendRoughness${index}`] = { value: layer.roughness };
      shader.uniforms[`whBlendMetalness${index}`] = { value: layer.metalness };

      if (layer.map) {
        shader.uniforms[`whBlendMap${index}`] = { value: layer.map };
      }

      if (layer.roughnessMap) {
        shader.uniforms[`whBlendRoughnessMap${index}`] = { value: layer.roughnessMap };
      }

      if (layer.metalnessMap) {
        shader.uniforms[`whBlendMetalnessMap${index}`] = { value: layer.metalnessMap };
      }
    });

    shader.vertexShader = injectMaterialBlendVertexShader(shader.vertexShader, currentLayers.length);
    shader.fragmentShader = injectMaterialBlendFragmentShader(shader.fragmentShader, currentLayers);
  };

  userData.whMaterialBlendHooked = true;
  material.needsUpdate = true;
  return material;
}

export function applyMaterialBlendToStandardMaterial<T extends MeshStandardMaterial>(
  material: T,
  layer?: StandardMaterialBlendLayer,
) {
  return applyMaterialLayersToStandardMaterial(material, layer ? [layer] : undefined);
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

function injectMaterialBlendVertexShader(source: string, layerCount: number) {
  if (source.includes("vWhBlendWeight0")) {
    return source;
  }

  const declarations = Array.from({ length: layerCount }, (_, index) => `attribute float whBlendWeight${index};\nvarying float vWhBlendWeight${index};`).join("\n");
  const assignments = Array.from({ length: layerCount }, (_, index) => `vWhBlendWeight${index} = whBlendWeight${index};`).join("\n");

  return source
    .replace(
      "#include <common>",
      `#include <common>\n${declarations}\n#ifdef USE_UV\nvarying vec2 vWhBlendUv;\n#endif`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${assignments}\n#ifdef USE_UV\nvWhBlendUv = uv;\n#endif`,
    );
}

function injectMaterialBlendFragmentShader(source: string, layers: ResolvedStandardMaterialBlendLayer[]) {
  if (source.includes("vWhBlendWeight0")) {
    return source;
  }

  const declarations = layers.map((layer, index) => {
    const lines = [
      `varying float vWhBlendWeight${index};`,
      `uniform vec3 whBlendColor${index};`,
      `uniform float whBlendOpacity${index};`,
      `uniform float whBlendRoughness${index};`,
      `uniform float whBlendMetalness${index};`,
    ];

    if (layer.map) {
      lines.push(`#define WH_BLEND_USE_MAP_${index}`);
      lines.push(`uniform sampler2D whBlendMap${index};`);
    }

    if (layer.roughnessMap) {
      lines.push(`#define WH_BLEND_USE_ROUGHNESSMAP_${index}`);
      lines.push(`uniform sampler2D whBlendRoughnessMap${index};`);
    }

    if (layer.metalnessMap) {
      lines.push(`#define WH_BLEND_USE_METALNESSMAP_${index}`);
      lines.push(`uniform sampler2D whBlendMetalnessMap${index};`);
    }

    return lines.join("\n");
  }).join("\n");

  const applyLayersBlock = layers.map((_layer, index) => `
float whResolvedBlendWeight${index} = clamp( vWhBlendWeight${index}, 0.0, 1.0 ) * whBlendOpacity${index};
if ( whResolvedBlendWeight${index} > 0.0001 ) {
  vec4 whBlendDiffuse${index} = vec4( whBlendColor${index}, 1.0 );
  #if defined( WH_BLEND_USE_MAP_${index} ) && defined( USE_UV )
    vec4 whBlendTexel${index} = texture2D( whBlendMap${index}, vWhBlendUv );
    #ifdef DECODE_VIDEO_TEXTURE
      whBlendTexel${index} = sRGBTransferEOTF( whBlendTexel${index} );
    #endif
    whBlendDiffuse${index} *= whBlendTexel${index};
  #endif
  float whBlendFactor${index} = clamp( whResolvedBlendWeight${index} * whBlendDiffuse${index}.a, 0.0, 1.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, whBlendDiffuse${index}.rgb, whBlendFactor${index} );
  diffuseColor.a = max( diffuseColor.a, mix( diffuseColor.a, whBlendDiffuse${index}.a, whBlendFactor${index} ) );
  float whLayerRoughness${index} = whBlendRoughness${index};
  #if defined( WH_BLEND_USE_ROUGHNESSMAP_${index} ) && defined( USE_UV )
    whLayerRoughness${index} *= texture2D( whBlendRoughnessMap${index}, vWhBlendUv ).g;
  #endif
  float whLayerMetalness${index} = whBlendMetalness${index};
  #if defined( WH_BLEND_USE_METALNESSMAP_${index} ) && defined( USE_UV )
    whLayerMetalness${index} *= texture2D( whBlendMetalnessMap${index}, vWhBlendUv ).b;
  #endif
  roughnessFactor = mix( roughnessFactor, whLayerRoughness${index}, whBlendFactor${index} );
  metalnessFactor = mix( metalnessFactor, whLayerMetalness${index}, whBlendFactor${index} );
}
`).join("\n");

  return source
    .replace(
      "#include <common>",
      `#include <common>\n${declarations}\n#ifdef USE_UV\nvarying vec2 vWhBlendUv;\n#endif`,
    )
    .replace(
      "#include <lights_physical_fragment>",
      `${applyLayersBlock}\n#include <lights_physical_fragment>`,
    );
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}