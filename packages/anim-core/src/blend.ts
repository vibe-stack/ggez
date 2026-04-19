import { clamp, lerp } from "@ggez/anim-utils";
import type { BoneMask, PoseBuffer, RigDefinition } from "./types";
import { copyPose } from "./pose-buffer";

function normalizeQuaternion(
  x: number,
  y: number,
  z: number,
  w: number
): [number, number, number, number] {
  const length = Math.hypot(x, y, z, w) || 1;
  return [x / length, y / length, z / length, w / length];
}

function slerpQuaternion(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  t: number
): [number, number, number, number] {
  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;
  let endX = bx;
  let endY = by;
  let endZ = bz;
  let endW = bw;

  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    endX = -endX;
    endY = -endY;
    endZ = -endZ;
    endW = -endW;
  }

  if (cosHalfTheta > 0.9995) {
    return normalizeQuaternion(
      lerp(ax, endX, t),
      lerp(ay, endY, t),
      lerp(az, endZ, t),
      lerp(aw, endW, t)
    );
  }

  const halfTheta = Math.acos(clamp(cosHalfTheta, -1, 1));
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);

  if (Math.abs(sinHalfTheta) < 1e-5) {
    return normalizeQuaternion(ax, ay, az, aw);
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return normalizeQuaternion(
    ax * ratioA + endX * ratioB,
    ay * ratioA + endY * ratioB,
    az * ratioA + endZ * ratioB,
    aw * ratioA + endW * ratioB
  );
}

function multiplyQuaternion(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number
): [number, number, number, number] {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function invertQuaternion(x: number, y: number, z: number, w: number): [number, number, number, number] {
  const lengthSquared = x * x + y * y + z * z + w * w || 1;
  return [-x / lengthSquared, -y / lengthSquared, -z / lengthSquared, w / lengthSquared];
}

export function blendPoses(a: PoseBuffer, b: PoseBuffer, weight: number, out: PoseBuffer): PoseBuffer {
  const t = clamp(weight, 0, 1);

  for (let boneIndex = 0; boneIndex < out.boneCount; boneIndex += 1) {
    const vecOffset = boneIndex * 3;
    const quatOffset = boneIndex * 4;

    out.translations[vecOffset] = lerp(a.translations[vecOffset], b.translations[vecOffset], t);
    out.translations[vecOffset + 1] = lerp(a.translations[vecOffset + 1], b.translations[vecOffset + 1], t);
    out.translations[vecOffset + 2] = lerp(a.translations[vecOffset + 2], b.translations[vecOffset + 2], t);

    out.scales[vecOffset] = lerp(a.scales[vecOffset], b.scales[vecOffset], t);
    out.scales[vecOffset + 1] = lerp(a.scales[vecOffset + 1], b.scales[vecOffset + 1], t);
    out.scales[vecOffset + 2] = lerp(a.scales[vecOffset + 2], b.scales[vecOffset + 2], t);

    const [qx, qy, qz, qw] = slerpQuaternion(
      a.rotations[quatOffset],
      a.rotations[quatOffset + 1],
      a.rotations[quatOffset + 2],
      a.rotations[quatOffset + 3],
      b.rotations[quatOffset],
      b.rotations[quatOffset + 1],
      b.rotations[quatOffset + 2],
      b.rotations[quatOffset + 3],
      t
    );

    out.rotations[quatOffset] = qx;
    out.rotations[quatOffset + 1] = qy;
    out.rotations[quatOffset + 2] = qz;
    out.rotations[quatOffset + 3] = qw;
  }

  return out;
}

export function blendPosesMasked(
  base: PoseBuffer,
  overlay: PoseBuffer,
  globalWeight: number,
  mask: BoneMask | undefined,
  out: PoseBuffer
): PoseBuffer {
  copyPose(base, out);

  for (let boneIndex = 0; boneIndex < out.boneCount; boneIndex += 1) {
    const maskWeight = mask ? mask.weights[boneIndex] : 1;
    const weight = clamp(globalWeight * maskWeight, 0, 1);
    if (weight <= 0) {
      continue;
    }

    const vecOffset = boneIndex * 3;
    const quatOffset = boneIndex * 4;

    out.translations[vecOffset] = lerp(base.translations[vecOffset], overlay.translations[vecOffset], weight);
    out.translations[vecOffset + 1] = lerp(base.translations[vecOffset + 1], overlay.translations[vecOffset + 1], weight);
    out.translations[vecOffset + 2] = lerp(base.translations[vecOffset + 2], overlay.translations[vecOffset + 2], weight);

    out.scales[vecOffset] = lerp(base.scales[vecOffset], overlay.scales[vecOffset], weight);
    out.scales[vecOffset + 1] = lerp(base.scales[vecOffset + 1], overlay.scales[vecOffset + 1], weight);
    out.scales[vecOffset + 2] = lerp(base.scales[vecOffset + 2], overlay.scales[vecOffset + 2], weight);

    const [qx, qy, qz, qw] = slerpQuaternion(
      base.rotations[quatOffset],
      base.rotations[quatOffset + 1],
      base.rotations[quatOffset + 2],
      base.rotations[quatOffset + 3],
      overlay.rotations[quatOffset],
      overlay.rotations[quatOffset + 1],
      overlay.rotations[quatOffset + 2],
      overlay.rotations[quatOffset + 3],
      weight
    );

    out.rotations[quatOffset] = qx;
    out.rotations[quatOffset + 1] = qy;
    out.rotations[quatOffset + 2] = qz;
    out.rotations[quatOffset + 3] = qw;
  }

  return out;
}

export function addPoseAdditive(
  base: PoseBuffer,
  additive: PoseBuffer,
  rig: RigDefinition,
  globalWeight: number,
  mask: BoneMask | undefined,
  out: PoseBuffer,
  referencePose?: PoseBuffer
): PoseBuffer {
  copyPose(base, out);

  for (let boneIndex = 0; boneIndex < out.boneCount; boneIndex += 1) {
    const weight = clamp(globalWeight * (mask ? mask.weights[boneIndex] : 1), 0, 1);
    if (weight <= 0) {
      continue;
    }

    const vecOffset = boneIndex * 3;
    const quatOffset = boneIndex * 4;
    const referenceTranslations = referencePose?.translations;
    const referenceRotations = referencePose?.rotations;
    const referenceScales = referencePose?.scales;

    const referenceTranslationX = referenceTranslations ? referenceTranslations[vecOffset]! : rig.bindTranslations[vecOffset]!;
    const referenceTranslationY = referenceTranslations
      ? referenceTranslations[vecOffset + 1]!
      : rig.bindTranslations[vecOffset + 1]!;
    const referenceTranslationZ = referenceTranslations
      ? referenceTranslations[vecOffset + 2]!
      : rig.bindTranslations[vecOffset + 2]!;
    const referenceScaleX = referenceScales ? referenceScales[vecOffset]! : rig.bindScales[vecOffset]!;
    const referenceScaleY = referenceScales ? referenceScales[vecOffset + 1]! : rig.bindScales[vecOffset + 1]!;
    const referenceScaleZ = referenceScales ? referenceScales[vecOffset + 2]! : rig.bindScales[vecOffset + 2]!;

    out.translations[vecOffset] += (additive.translations[vecOffset] - referenceTranslationX) * weight;
    out.translations[vecOffset + 1] += (additive.translations[vecOffset + 1] - referenceTranslationY) * weight;
    out.translations[vecOffset + 2] += (additive.translations[vecOffset + 2] - referenceTranslationZ) * weight;

    out.scales[vecOffset] += (additive.scales[vecOffset] - referenceScaleX) * weight;
    out.scales[vecOffset + 1] += (additive.scales[vecOffset + 1] - referenceScaleY) * weight;
    out.scales[vecOffset + 2] += (additive.scales[vecOffset + 2] - referenceScaleZ) * weight;

    const bindInverse = invertQuaternion(
      referenceRotations ? referenceRotations[quatOffset]! : rig.bindRotations[quatOffset]!,
      referenceRotations ? referenceRotations[quatOffset + 1]! : rig.bindRotations[quatOffset + 1]!,
      referenceRotations ? referenceRotations[quatOffset + 2]! : rig.bindRotations[quatOffset + 2]!,
      referenceRotations ? referenceRotations[quatOffset + 3]! : rig.bindRotations[quatOffset + 3]!
    );
    const delta = multiplyQuaternion(
      additive.rotations[quatOffset],
      additive.rotations[quatOffset + 1],
      additive.rotations[quatOffset + 2],
      additive.rotations[quatOffset + 3],
      bindInverse[0],
      bindInverse[1],
      bindInverse[2],
      bindInverse[3]
    );
    const weightedDelta = slerpQuaternion(0, 0, 0, 1, delta[0], delta[1], delta[2], delta[3], weight);
    const result = multiplyQuaternion(
      weightedDelta[0],
      weightedDelta[1],
      weightedDelta[2],
      weightedDelta[3],
      base.rotations[quatOffset],
      base.rotations[quatOffset + 1],
      base.rotations[quatOffset + 2],
      base.rotations[quatOffset + 3]
    );

    out.rotations[quatOffset] = result[0];
    out.rotations[quatOffset + 1] = result[1];
    out.rotations[quatOffset + 2] = result[2];
    out.rotations[quatOffset + 3] = result[3];
  }

  return out;
}
