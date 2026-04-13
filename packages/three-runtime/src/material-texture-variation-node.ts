/**
 * TSL (Three Shading Language) implementation of the voronoi texture variation,
 * for use with WebGPURenderer (three/webgpu). Works with MeshStandardNodeMaterial.
 *
 * Use `applyTextureVariationToNodeMaterial` instead of the GLSL-based
 * `applyTextureVariationToStandardMaterial` when the scene is rendered with
 * WebGPURenderer.
 */
import type { MaterialTextureVariation } from "@ggez/shared";
import {
  Fn,
  If,
  Loop,
  float,
  int,
  mix,
  smoothstep,
  sqrt,
  step,
  vec2,
  vec3,
  vec4,
  normalMap as normalMapNode,
  fract,
  floor,
  dot,
  sin,
  max,
  uv,
  uniform,
  texture as textureFn,
  materialColor,
  materialRoughness,
  materialMetalness,
} from "three/tsl";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import { normalizeMaterialTextureVariation } from "./material-texture-variation";

// ---------------------------------------------------------------------------
// Hash helpers (defined as Fn so they compile once per shader)
// ---------------------------------------------------------------------------

const whHash11 = /* @__PURE__ */ Fn(([v]: [any]) => {
  return fract(sin(v).mul(43758.5453123));
});

const whHash22 = /* @__PURE__ */ Fn(([p]: [any]) => {
  const x = dot(p, vec2(127.1, 311.7));
  const y = dot(p, vec2(269.5, 183.3));
  return fract(sin(vec2(x, y)).mul(43758.5453123));
});

// ---------------------------------------------------------------------------
// Core voronoi computation — must be called inside an active Fn() context.
// ---------------------------------------------------------------------------

function buildVariationData(scaleUniform: ReturnType<typeof uniform>) {
  const scale = max(float(1.0), scaleUniform);
  const scaledUv = uv().mul(scale);
  const baseCell = floor(scaledUv);
  const localUv = fract(scaledUv);

  // Mutable state for Worley F1/F2 search
  const bestCellX = baseCell.x.toVar("whBCX");
  const bestCellY = baseCell.y.toVar("whBCY");
  const secondCellX = baseCell.x.toVar("whSCX");
  const secondCellY = baseCell.y.add(float(1)).toVar("whSCY");
  const bestDist = float(1e9).toVar("whBD");
  const secondDist = float(1e9).toVar("whSD");

  Loop(
    { start: int(-1), end: int(2), type: "int" },
    { start: int(-1), end: int(2), type: "int" },
    ({ i, j }: { i: any; j: any }) => {
      const cx = baseCell.x.add(float(i));
      const cy = baseCell.y.add(float(j));
      const cand = vec2(cx, cy);
      const seed = cand.add(whHash22(cand.add(vec2(19.19, 19.19))));
      const delta = seed.sub(scaledUv);
      const d = dot(delta, delta).toVar("whD");
      If(d.lessThan(bestDist), () => {
        secondDist.assign(bestDist);
        secondCellX.assign(bestCellX);
        secondCellY.assign(bestCellY);
        bestDist.assign(d);
        bestCellX.assign(cx);
        bestCellY.assign(cy);
      }).ElseIf(d.lessThan(secondDist), () => {
        secondDist.assign(d);
        secondCellX.assign(cx);
        secondCellY.assign(cy);
      });
    },
  );

  const bestCell = vec2(bestCellX, bestCellY);
  const secondCell = vec2(secondCellX, secondCellY);

  const offsetA = whHash22(bestCell.add(vec2(53.17, 53.17)));
  const offsetB = whHash22(secondCell.add(vec2(53.17, 53.17)));
  const mirrorA = step(vec2(0.5, 0.5), whHash22(bestCell.add(vec2(43.7, 43.7))));
  const mirrorB = step(vec2(0.5, 0.5), whHash22(secondCell.add(vec2(43.7, 43.7))));
  const rotA = floor(whHash11(dot(bestCell, vec2(12.9898, 78.233))).mul(4.0));
  const rotB = floor(whHash11(dot(secondCell, vec2(12.9898, 78.233))).mul(4.0));

  // Mirror local UVs per cell
  const localA = localUv.toVar("whLA");
  If(mirrorA.x.greaterThan(float(0.5)), () => {
    localA.assign(vec2(float(1.0).sub(localA.x), localA.y));
  });
  If(mirrorA.y.greaterThan(float(0.5)), () => {
    localA.assign(vec2(localA.x, float(1.0).sub(localA.y)));
  });

  const localB = localUv.toVar("whLB");
  If(mirrorB.x.greaterThan(float(0.5)), () => {
    localB.assign(vec2(float(1.0).sub(localB.x), localB.y));
  });
  If(mirrorB.y.greaterThan(float(0.5)), () => {
    localB.assign(vec2(localB.x, float(1.0).sub(localB.y)));
  });

  // Quarter-turn rotation
  const rotatedA = applyQuarterRotation(localA, rotA);
  const rotatedB = applyQuarterRotation(localB, rotB);

  const uvA = offsetA.add(rotatedA);
  const uvB = offsetB.add(rotatedB);

  const nearestDist = sqrt(max(bestDist, float(0)));
  const secondNearestDist = sqrt(max(secondDist, float(0)));
  const blend = float(1.0).sub(
    smoothstep(float(0.08), float(0.28), secondNearestDist.sub(nearestDist)),
  );

  return { uvA, uvB, blend, mirrorA, mirrorB, rotA, rotB };
}

// Quarter-turn rotation helper called inside Fn context
function applyQuarterRotation(uvIn: any, rotIdx: any): any {
  const x = uvIn.x.toVar("whRX");
  const y = uvIn.y.toVar("whRY");
  const outX = x.toVar("whORX");
  const outY = y.toVar("whORY");
  If(rotIdx.greaterThanEqual(float(0.5)).and(rotIdx.lessThan(float(1.5))), () => {
    outX.assign(y);
    outY.assign(float(1.0).sub(x));
  })
    .ElseIf(rotIdx.greaterThanEqual(float(1.5)).and(rotIdx.lessThan(float(2.5))), () => {
      outX.assign(float(1.0).sub(x));
      outY.assign(float(1.0).sub(y));
    })
    .ElseIf(rotIdx.greaterThanEqual(float(2.5)), () => {
      outX.assign(float(1.0).sub(y));
      outY.assign(x);
    });
  return vec2(outX, outY);
}

// Normal XY transform for tangent-space normals (mirror + rotation)
function transformNormalXY(xy: any, mirrorMask: any, rotIdx: any): any {
  const tx = xy.x.toVar("whNTX");
  const ty = xy.y.toVar("whNTY");
  If(mirrorMask.x.greaterThan(float(0.5)), () => {
    tx.assign(tx.negate());
  });
  If(mirrorMask.y.greaterThan(float(0.5)), () => {
    ty.assign(ty.negate());
  });
  const ox = tx.toVar("whNOX");
  const oy = ty.toVar("whNOY");
  If(rotIdx.greaterThanEqual(float(0.5)).and(rotIdx.lessThan(float(1.5))), () => {
    ox.assign(ty);
    oy.assign(tx.negate());
  })
    .ElseIf(rotIdx.greaterThanEqual(float(1.5)).and(rotIdx.lessThan(float(2.5))), () => {
      ox.assign(tx.negate());
      oy.assign(ty.negate());
    })
    .ElseIf(rotIdx.greaterThanEqual(float(2.5)), () => {
      ox.assign(ty.negate());
      oy.assign(tx);
    });
  return vec2(ox, oy);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies voronoi texture variation to a `MeshStandardNodeMaterial` using TSL
 * node functions. This is the WebGPU-compatible counterpart of
 * `applyTextureVariationToStandardMaterial`.
 *
 * The material MUST be a `MeshStandardNodeMaterial` (from `three/webgpu`).
 */
export function applyTextureVariationToNodeMaterial(
  material: MeshStandardNodeMaterial,
  variation?: MaterialTextureVariation,
): void {
  const normalized = normalizeMaterialTextureVariation(variation);
  if (!normalized) return;

  const scaleUniform = uniform(normalized.scale);

  if (material.map) {
    const map = material.map;
    material.colorNode = Fn(() => {
      const { uvA, uvB, blend } = buildVariationData(scaleUniform);
      return mix(textureFn(map, uvA), textureFn(map, uvB), blend).mul(materialColor);
    })();
  }

  if (material.normalMap) {
    const nmap = material.normalMap;
    const normalScale = material.normalScale;
    material.normalNode = Fn(() => {
      const { uvA, uvB, blend, mirrorA, mirrorB, rotA, rotB } = buildVariationData(scaleUniform);
      const rawA = textureFn(nmap, uvA).xy.mul(2.0).sub(1.0);
      const rawB = textureFn(nmap, uvB).xy.mul(2.0).sub(1.0);
      const correctedA = transformNormalXY(rawA, mirrorA, rotA);
      const correctedB = transformNormalXY(rawB, mirrorB, rotB);
      const blendedXY = mix(correctedA, correctedB, blend).mul(
        vec2(normalScale.x, normalScale.y),
      );
      // Reconstruct Z and return as a normalMap node input
      const blendedZ = float(1.0)
        .sub(blendedXY.x.mul(blendedXY.x))
        .sub(blendedXY.y.mul(blendedXY.y))
        .max(float(0))
        .sqrt();
      return normalMapNode(vec4(blendedXY.x.mul(0.5).add(0.5), blendedXY.y.mul(0.5).add(0.5), blendedZ, float(1)));
    })();
  }

  if (material.roughnessMap) {
    const rmap = material.roughnessMap;
    material.roughnessNode = Fn(() => {
      const { uvA, uvB, blend } = buildVariationData(scaleUniform);
      return materialRoughness.mul(
        mix(textureFn(rmap, uvA), textureFn(rmap, uvB), blend).g,
      );
    })();
  }

  if (material.metalnessMap) {
    const mmap = material.metalnessMap;
    material.metalnessNode = Fn(() => {
      const { uvA, uvB, blend } = buildVariationData(scaleUniform);
      return materialMetalness.mul(
        mix(textureFn(mmap, uvA), textureFn(mmap, uvB), blend).b,
      );
    })();
  }

  material.needsUpdate = true;
}
