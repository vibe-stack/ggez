import type { MaterialTextureVariation } from "@ggez/shared";
import { MeshStandardMaterial } from "three";

const DEFAULT_TEXTURE_VARIATION_SCALE = 4;
const MIN_TEXTURE_VARIATION_SCALE = 1;
const MAX_TEXTURE_VARIATION_SCALE = 64;

type ResolvedMaterialTextureVariation = {
  enabled: true;
  scale: number;
};

type TextureVariationUserData = {
  whTextureVariation?: ResolvedMaterialTextureVariation;
  whTextureVariationHooked?: boolean;
};

type TextureVariationShader = {
  fragmentShader: string;
  uniforms: Record<string, { value: number }>;
  vertexShader: string;
};

const TEXTURE_VARIATION_VERTEX_INJECTION = /* glsl */ `
varying vec2 vWhTextureVariationUv;
`;

const TEXTURE_VARIATION_FRAGMENT_INJECTION = /* glsl */ `
varying vec2 vWhTextureVariationUv;
uniform float whTextureVariationScale;

struct WhTextureVariation {
  vec2 uvA;
  vec2 uvB;
  vec2 mirrorA;
  vec2 mirrorB;
  float blend;
  float rotationA;
  float rotationB;
};

float whHash11( float value ) {
  return fract( sin( value ) * 43758.5453123 );
}

vec2 whHash22( vec2 value ) {
  float x = dot( value, vec2( 127.1, 311.7 ) );
  float y = dot( value, vec2( 269.5, 183.3 ) );
  return fract( sin( vec2( x, y ) ) * 43758.5453123 );
}

vec2 whRotateQuarterTurn( vec2 uv, float rotationIndex ) {
  if ( rotationIndex < 0.5 ) return uv;
  if ( rotationIndex < 1.5 ) return vec2( uv.y, 1.0 - uv.x );
  if ( rotationIndex < 2.5 ) return vec2( 1.0 - uv.x, 1.0 - uv.y );
  return vec2( 1.0 - uv.y, uv.x );
}

vec2 whTransformNormalXY( vec2 xy, vec2 mirrorMask, float rotationIndex ) {
  vec2 transformed = xy;

  if ( mirrorMask.x > 0.5 ) transformed.x = - transformed.x;
  if ( mirrorMask.y > 0.5 ) transformed.y = - transformed.y;

  if ( rotationIndex < 0.5 ) return transformed;
  if ( rotationIndex < 1.5 ) return vec2( transformed.y, - transformed.x );
  if ( rotationIndex < 2.5 ) return - transformed;
  return vec2( - transformed.y, transformed.x );
}

WhTextureVariation whResolveTextureVariation( vec2 uv ) {
  float scale = max( 1.0, whTextureVariationScale );
  vec2 scaledUv = uv * scale;
  vec2 baseCell = floor( scaledUv );
  vec2 localUv = fract( scaledUv );
  vec2 bestCell = baseCell;
  vec2 secondCell = baseCell + vec2( 1.0, 0.0 );
  float bestDistance = 1e9;
  float secondDistance = 1e9;

  for ( int y = -1; y <= 1; y ++ ) {
    for ( int x = -1; x <= 1; x ++ ) {
      vec2 candidateCell = baseCell + vec2( float( x ), float( y ) );
      vec2 seed = candidateCell + whHash22( candidateCell + 19.19 );
      vec2 delta = seed - scaledUv;
      float distanceSq = dot( delta, delta );

      if ( distanceSq < bestDistance ) {
        secondDistance = bestDistance;
        secondCell = bestCell;
        bestDistance = distanceSq;
        bestCell = candidateCell;
      } else if ( distanceSq < secondDistance ) {
        secondDistance = distanceSq;
        secondCell = candidateCell;
      }
    }
  }

  vec2 offsetA = whHash22( bestCell + 53.17 );
  vec2 offsetB = whHash22( secondCell + 53.17 );
  vec2 mirrorA = step( 0.5, whHash22( bestCell + 43.7 ) );
  vec2 mirrorB = step( 0.5, whHash22( secondCell + 43.7 ) );
  float rotationA = floor( whHash11( dot( bestCell, vec2( 12.9898, 78.233 ) ) ) * 4.0 );
  float rotationB = floor( whHash11( dot( secondCell, vec2( 12.9898, 78.233 ) ) ) * 4.0 );
  vec2 localA = localUv;
  vec2 localB = localUv;

  if ( mirrorA.x > 0.5 ) localA.x = 1.0 - localA.x;
  if ( mirrorA.y > 0.5 ) localA.y = 1.0 - localA.y;
  if ( mirrorB.x > 0.5 ) localB.x = 1.0 - localB.x;
  if ( mirrorB.y > 0.5 ) localB.y = 1.0 - localB.y;

  localA = whRotateQuarterTurn( localA, rotationA );
  localB = whRotateQuarterTurn( localB, rotationB );

  float nearestDistance = sqrt( bestDistance );
  float secondNearestDistance = sqrt( secondDistance );
  float blend = 1.0 - smoothstep( 0.08, 0.28, secondNearestDistance - nearestDistance );

  WhTextureVariation variation;
  variation.uvA = offsetA + localA;
  variation.uvB = offsetB + localB;
  variation.mirrorA = mirrorA;
  variation.mirrorB = mirrorB;
  variation.blend = blend;
  variation.rotationA = rotationA;
  variation.rotationB = rotationB;
  return variation;
}
`;

const MAP_FRAGMENT_REPLACEMENT = /* glsl */ `
#ifdef USE_MAP

  WhTextureVariation whVariation = whResolveTextureVariation( vWhTextureVariationUv );
  vec4 sampledDiffuseColorA = texture2D( map, whVariation.uvA );
  vec4 sampledDiffuseColorB = texture2D( map, whVariation.uvB );

  #ifdef DECODE_VIDEO_TEXTURE

    sampledDiffuseColorA = sRGBTransferEOTF( sampledDiffuseColorA );
    sampledDiffuseColorB = sRGBTransferEOTF( sampledDiffuseColorB );

  #endif

  vec4 sampledDiffuseColor = mix( sampledDiffuseColorA, sampledDiffuseColorB, whVariation.blend );
  diffuseColor *= sampledDiffuseColor;

#endif
`;

const NORMAL_FRAGMENT_REPLACEMENT = /* glsl */ `
#ifdef USE_NORMALMAP_OBJECTSPACE

  WhTextureVariation whVariation = whResolveTextureVariation( vWhTextureVariationUv );
  vec3 normalA = texture2D( normalMap, whVariation.uvA ).xyz * 2.0 - 1.0;
  vec3 normalB = texture2D( normalMap, whVariation.uvB ).xyz * 2.0 - 1.0;
  normal = normalize( mix( normalA, normalB, whVariation.blend ) );

  #ifdef FLIP_SIDED

    normal = - normal;

  #endif

  #ifdef DOUBLE_SIDED

    normal = normal * faceDirection;

  #endif

  normal = normalize( normalMatrix * normal );

#elif defined( USE_NORMALMAP_TANGENTSPACE )

  WhTextureVariation whVariation = whResolveTextureVariation( vWhTextureVariationUv );
  vec3 mapNA = texture2D( normalMap, whVariation.uvA ).xyz * 2.0 - 1.0;
  vec3 mapNB = texture2D( normalMap, whVariation.uvB ).xyz * 2.0 - 1.0;
  mapNA.xy = whTransformNormalXY( mapNA.xy, whVariation.mirrorA, whVariation.rotationA );
  mapNB.xy = whTransformNormalXY( mapNB.xy, whVariation.mirrorB, whVariation.rotationB );
  vec3 mapN = mix( mapNA, mapNB, whVariation.blend );
  mapN.xy *= normalScale;

  normal = normalize( tbn * mapN );

#elif defined( USE_BUMPMAP )

  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );

#endif
`;

const ROUGHNESS_FRAGMENT_REPLACEMENT = /* glsl */ `
float roughnessFactor = roughness;

#ifdef USE_ROUGHNESSMAP

  WhTextureVariation whVariation = whResolveTextureVariation( vWhTextureVariationUv );
  vec4 texelRoughnessA = texture2D( roughnessMap, whVariation.uvA );
  vec4 texelRoughnessB = texture2D( roughnessMap, whVariation.uvB );
  vec4 texelRoughness = mix( texelRoughnessA, texelRoughnessB, whVariation.blend );

  roughnessFactor *= texelRoughness.g;

#endif
`;

const METALNESS_FRAGMENT_REPLACEMENT = /* glsl */ `
float metalnessFactor = metalness;

#ifdef USE_METALNESSMAP

  WhTextureVariation whVariation = whResolveTextureVariation( vWhTextureVariationUv );
  vec4 texelMetalnessA = texture2D( metalnessMap, whVariation.uvA );
  vec4 texelMetalnessB = texture2D( metalnessMap, whVariation.uvB );
  vec4 texelMetalness = mix( texelMetalnessA, texelMetalnessB, whVariation.blend );

  metalnessFactor *= texelMetalness.b;

#endif
`;

export function normalizeMaterialTextureVariation(
  variation?: MaterialTextureVariation,
): ResolvedMaterialTextureVariation | undefined {
  if (!variation?.enabled) {
    return undefined;
  }

  return {
    enabled: true,
    scale: clampNumber(variation.scale, MIN_TEXTURE_VARIATION_SCALE, MAX_TEXTURE_VARIATION_SCALE),
  };
}

export function applyTextureVariationToStandardMaterial<T extends MeshStandardMaterial>(
  material: T,
  variation?: MaterialTextureVariation,
) {
  const normalized = normalizeMaterialTextureVariation(variation);

  if (!normalized || !supportsTextureVariation(material)) {
    return material;
  }

  const userData = material.userData as TextureVariationUserData;
  userData.whTextureVariation = normalized;

  if (userData.whTextureVariationHooked) {
    return material;
  }

  const baseOnBeforeCompile = material.onBeforeCompile;
  const baseProgramCacheKey = material.customProgramCacheKey?.bind(material);

  material.customProgramCacheKey = () => `${baseProgramCacheKey?.() ?? ""}|wh-texture-variation:on`;
  material.onBeforeCompile = (shader: TextureVariationShader, renderer: unknown) => {
    (baseOnBeforeCompile as ((shader: TextureVariationShader, renderer: unknown) => void) | undefined)?.(shader, renderer);

    const currentVariation = (material.userData as TextureVariationUserData).whTextureVariation;

    if (!currentVariation) {
      return;
    }

    shader.uniforms.whTextureVariationScale = { value: currentVariation.scale };
    shader.vertexShader = injectTextureVariationVertexShader(shader.vertexShader);
    shader.fragmentShader = injectTextureVariationFragmentShader(shader.fragmentShader);
  };

  userData.whTextureVariationHooked = true;
  material.needsUpdate = true;
  return material;
}

function supportsTextureVariation(material: MeshStandardMaterial) {
  return Boolean(material.map || material.normalMap || material.roughnessMap || material.metalnessMap);
}

function injectTextureVariationVertexShader(source: string) {
  if (source.includes("vWhTextureVariationUv")) {
    return source;
  }

  return source
    .replace(
      "#include <common>",
      `#include <common>\n${TEXTURE_VARIATION_VERTEX_INJECTION}`,
    )
    .replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>\n#ifdef USE_UV\n\tvWhTextureVariationUv = uv;\n#endif`,
    );
}

function injectTextureVariationFragmentShader(source: string) {
  if (source.includes("whResolveTextureVariation")) {
    return source;
  }

  return source
    .replace(
      "#include <common>",
      `#include <common>\n${TEXTURE_VARIATION_FRAGMENT_INJECTION}`,
    )
    .replace("#include <map_fragment>", MAP_FRAGMENT_REPLACEMENT)
    .replace("#include <normal_fragment_maps>", NORMAL_FRAGMENT_REPLACEMENT)
    .replace("#include <roughnessmap_fragment>", ROUGHNESS_FRAGMENT_REPLACEMENT)
    .replace("#include <metalnessmap_fragment>", METALNESS_FRAGMENT_REPLACEMENT);
}

function clampNumber(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TEXTURE_VARIATION_SCALE;
  }

  return Math.min(max, Math.max(min, value));
}