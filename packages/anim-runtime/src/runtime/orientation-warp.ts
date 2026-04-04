import type { PoseBuffer, RigDefinition, RootMotionDelta } from "@ggez/anim-core";
import type { CompiledGraphNode } from "@ggez/anim-schema";
import { clamp } from "@ggez/anim-utils";
import type { EvaluationContext } from "./types";

type WorldPose = {
  translations: Float32Array;
  rotations: Float32Array;
  scales: Float32Array;
};

function normalizeQuaternion(
  x: number,
  y: number,
  z: number,
  w: number
): [number, number, number, number] {
  const length = Math.hypot(x, y, z, w) || 1;
  return [x / length, y / length, z / length, w / length];
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
  return normalizeQuaternion(
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  );
}

function invertQuaternion(
  x: number,
  y: number,
  z: number,
  w: number
): [number, number, number, number] {
  const lengthSquared = x * x + y * y + z * z + w * w || 1;
  return [-x / lengthSquared, -y / lengthSquared, -z / lengthSquared, w / lengthSquared];
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
      ax + (endX - ax) * t,
      ay + (endY - ay) * t,
      az + (endZ - az) * t,
      aw + (endW - aw) * t
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

function rotateVectorByQuaternion(
  x: number,
  y: number,
  z: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): [number, number, number] {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);

  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ];
}

function quaternionFromAxisAngleY(angle: number): [number, number, number, number] {
  const halfAngle = angle * 0.5;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

function normalizeVector(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  if (length < 1e-5) {
    return [0, 0, 0];
  }

  return [x / length, y / length, z / length];
}

function crossVectors(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): [number, number, number] {
  return [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx
  ];
}

function dotVectors(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  return ax * bx + ay * by + az * bz;
}

function quaternionFromToVectors(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number
): [number, number, number, number] {
  const from = normalizeVector(fromX, fromY, fromZ);
  const to = normalizeVector(toX, toY, toZ);
  const dot = dotVectors(from[0], from[1], from[2], to[0], to[1], to[2]);

  if (dot > 0.999999) {
    return [0, 0, 0, 1];
  }

  if (dot < -0.999999) {
    const axis = Math.abs(from[0]) < 0.9
      ? crossVectors(from[0], from[1], from[2], 1, 0, 0)
      : crossVectors(from[0], from[1], from[2], 0, 1, 0);
    const normalizedAxis = normalizeVector(axis[0], axis[1], axis[2]);
    return [normalizedAxis[0], normalizedAxis[1], normalizedAxis[2], 0];
  }

  const axis = crossVectors(from[0], from[1], from[2], to[0], to[1], to[2]);
  return normalizeQuaternion(axis[0], axis[1], axis[2], 1 + dot);
}

function createWorldPose(rig: RigDefinition): WorldPose {
  const boneCount = rig.boneNames.length;
  return {
    translations: new Float32Array(boneCount * 3),
    rotations: new Float32Array(boneCount * 4),
    scales: new Float32Array(boneCount * 3)
  };
}

function computeWorldPose(rig: RigDefinition, pose: PoseBuffer): WorldPose {
  const world = createWorldPose(rig);

  for (let boneIndex = 0; boneIndex < rig.boneNames.length; boneIndex += 1) {
    const parentIndex = rig.parentIndices[boneIndex] ?? -1;
    const translationOffset = boneIndex * 3;
    const rotationOffset = boneIndex * 4;

    if (parentIndex < 0) {
      world.translations[translationOffset] = pose.translations[translationOffset]!;
      world.translations[translationOffset + 1] = pose.translations[translationOffset + 1]!;
      world.translations[translationOffset + 2] = pose.translations[translationOffset + 2]!;
      world.rotations[rotationOffset] = pose.rotations[rotationOffset]!;
      world.rotations[rotationOffset + 1] = pose.rotations[rotationOffset + 1]!;
      world.rotations[rotationOffset + 2] = pose.rotations[rotationOffset + 2]!;
      world.rotations[rotationOffset + 3] = pose.rotations[rotationOffset + 3]!;
      world.scales[translationOffset] = pose.scales[translationOffset]!;
      world.scales[translationOffset + 1] = pose.scales[translationOffset + 1]!;
      world.scales[translationOffset + 2] = pose.scales[translationOffset + 2]!;
      continue;
    }

    const parentTranslationOffset = parentIndex * 3;
    const parentRotationOffset = parentIndex * 4;

    const scaledLocalX = pose.translations[translationOffset]! * world.scales[parentTranslationOffset]!;
    const scaledLocalY = pose.translations[translationOffset + 1]! * world.scales[parentTranslationOffset + 1]!;
    const scaledLocalZ = pose.translations[translationOffset + 2]! * world.scales[parentTranslationOffset + 2]!;
    const rotatedLocal = rotateVectorByQuaternion(
      scaledLocalX,
      scaledLocalY,
      scaledLocalZ,
      world.rotations[parentRotationOffset]!,
      world.rotations[parentRotationOffset + 1]!,
      world.rotations[parentRotationOffset + 2]!,
      world.rotations[parentRotationOffset + 3]!
    );

    world.translations[translationOffset] = world.translations[parentTranslationOffset]! + rotatedLocal[0];
    world.translations[translationOffset + 1] = world.translations[parentTranslationOffset + 1]! + rotatedLocal[1];
    world.translations[translationOffset + 2] = world.translations[parentTranslationOffset + 2]! + rotatedLocal[2];

    const worldRotation = multiplyQuaternion(
      world.rotations[parentRotationOffset]!,
      world.rotations[parentRotationOffset + 1]!,
      world.rotations[parentRotationOffset + 2]!,
      world.rotations[parentRotationOffset + 3]!,
      pose.rotations[rotationOffset]!,
      pose.rotations[rotationOffset + 1]!,
      pose.rotations[rotationOffset + 2]!,
      pose.rotations[rotationOffset + 3]!
    );
    world.rotations[rotationOffset] = worldRotation[0];
    world.rotations[rotationOffset + 1] = worldRotation[1];
    world.rotations[rotationOffset + 2] = worldRotation[2];
    world.rotations[rotationOffset + 3] = worldRotation[3];

    world.scales[translationOffset] = world.scales[parentTranslationOffset]! * pose.scales[translationOffset]!;
    world.scales[translationOffset + 1] = world.scales[parentTranslationOffset + 1]! * pose.scales[translationOffset + 1]!;
    world.scales[translationOffset + 2] = world.scales[parentTranslationOffset + 2]! * pose.scales[translationOffset + 2]!;
  }

  return world;
}

function setBoneWorldRotation(
  pose: PoseBuffer,
  rig: RigDefinition,
  boneIndex: number,
  world: WorldPose,
  desiredWorldRotation: [number, number, number, number]
): void {
  const rotationOffset = boneIndex * 4;
  const parentIndex = rig.parentIndices[boneIndex] ?? -1;

  if (parentIndex < 0) {
    pose.rotations[rotationOffset] = desiredWorldRotation[0];
    pose.rotations[rotationOffset + 1] = desiredWorldRotation[1];
    pose.rotations[rotationOffset + 2] = desiredWorldRotation[2];
    pose.rotations[rotationOffset + 3] = desiredWorldRotation[3];
    return;
  }

  const parentRotationOffset = parentIndex * 4;
  const parentInverse = invertQuaternion(
    world.rotations[parentRotationOffset]!,
    world.rotations[parentRotationOffset + 1]!,
    world.rotations[parentRotationOffset + 2]!,
    world.rotations[parentRotationOffset + 3]!
  );
  const localRotation = multiplyQuaternion(
    parentInverse[0],
    parentInverse[1],
    parentInverse[2],
    parentInverse[3],
    desiredWorldRotation[0],
    desiredWorldRotation[1],
    desiredWorldRotation[2],
    desiredWorldRotation[3]
  );

  pose.rotations[rotationOffset] = localRotation[0];
  pose.rotations[rotationOffset + 1] = localRotation[1];
  pose.rotations[rotationOffset + 2] = localRotation[2];
  pose.rotations[rotationOffset + 3] = localRotation[3];
}

function getWorldPosition(world: WorldPose, boneIndex: number): [number, number, number] {
  const offset = boneIndex * 3;
  return [
    world.translations[offset]!,
    world.translations[offset + 1]!,
    world.translations[offset + 2]!
  ];
}

function getWorldRotation(world: WorldPose, boneIndex: number): [number, number, number, number] {
  const offset = boneIndex * 4;
  return [
    world.rotations[offset]!,
    world.rotations[offset + 1]!,
    world.rotations[offset + 2]!,
    world.rotations[offset + 3]!
  ];
}

function applyWorldYawRotation(
  pose: PoseBuffer,
  rig: RigDefinition,
  boneIndex: number,
  angle: number
): void {
  if (Math.abs(angle) < 1e-5) {
    return;
  }

  const world = computeWorldPose(rig, pose);
  const currentWorldRotation = getWorldRotation(world, boneIndex);
  const yawRotation = quaternionFromAxisAngleY(angle);
  const desiredWorldRotation = multiplyQuaternion(
    yawRotation[0],
    yawRotation[1],
    yawRotation[2],
    yawRotation[3],
    currentWorldRotation[0],
    currentWorldRotation[1],
    currentWorldRotation[2],
    currentWorldRotation[3]
  );
  setBoneWorldRotation(pose, rig, boneIndex, world, desiredWorldRotation);
}

function getUniqueBoneIndices(boneIndices: number[], excludedBoneIndex?: number): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];

  boneIndices.forEach((boneIndex) => {
    if (boneIndex === excludedBoneIndex || seen.has(boneIndex)) {
      return;
    }

    seen.add(boneIndex);
    unique.push(boneIndex);
  });

  return unique;
}

function computeChainPlaneNormal(
  upper: [number, number, number],
  lower: [number, number, number],
  foot: [number, number, number]
): [number, number, number] {
  const upperToLower = [
    lower[0] - upper[0],
    lower[1] - upper[1],
    lower[2] - upper[2]
  ] as const;
  const lowerToFoot = [
    foot[0] - lower[0],
    foot[1] - lower[1],
    foot[2] - lower[2]
  ] as const;
  const planeNormal = crossVectors(
    upperToLower[0],
    upperToLower[1],
    upperToLower[2],
    lowerToFoot[0],
    lowerToFoot[1],
    lowerToFoot[2]
  );
  const normalized = normalizeVector(planeNormal[0], planeNormal[1], planeNormal[2]);
  if (Math.hypot(normalized[0], normalized[1], normalized[2]) > 1e-5) {
    return normalized;
  }

  return [0, 0, 1];
}

function computeTwoBoneKneeTarget(
  upper: [number, number, number],
  guideLower: [number, number, number],
  target: [number, number, number],
  lengthUpper: number,
  lengthLower: number,
  planeNormal: [number, number, number]
): [number, number, number] | null {
  const toTarget = [
    target[0] - upper[0],
    target[1] - upper[1],
    target[2] - upper[2]
  ] as const;
  const targetDistance = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
  if (targetDistance < 1e-5 || lengthUpper < 1e-5 || lengthLower < 1e-5) {
    return null;
  }

  const direction = normalizeVector(toTarget[0], toTarget[1], toTarget[2]);
  const reach = clamp(targetDistance, Math.abs(lengthUpper - lengthLower) + 1e-4, lengthUpper + lengthLower - 1e-4);
  const along = (lengthUpper * lengthUpper - lengthLower * lengthLower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(lengthUpper * lengthUpper - along * along, 0));

  let bendDirection = crossVectors(planeNormal[0], planeNormal[1], planeNormal[2], direction[0], direction[1], direction[2]);
  let normalizedBendDirection = normalizeVector(bendDirection[0], bendDirection[1], bendDirection[2]);
  if (Math.hypot(normalizedBendDirection[0], normalizedBendDirection[1], normalizedBendDirection[2]) < 1e-5) {
    bendDirection = crossVectors(direction[0], direction[1], direction[2], 0, 1, 0);
    normalizedBendDirection = normalizeVector(bendDirection[0], bendDirection[1], bendDirection[2]);
  }

  const guideDirection = normalizeVector(
    guideLower[0] - upper[0],
    guideLower[1] - upper[1],
    guideLower[2] - upper[2]
  );
  if (dotVectors(guideDirection[0], guideDirection[1], guideDirection[2], normalizedBendDirection[0], normalizedBendDirection[1], normalizedBendDirection[2]) < 0) {
    normalizedBendDirection = [-normalizedBendDirection[0], -normalizedBendDirection[1], -normalizedBendDirection[2]];
  }

  return [
    upper[0] + direction[0] * along + normalizedBendDirection[0] * height,
    upper[1] + direction[1] * along + normalizedBendDirection[1] * height,
    upper[2] + direction[2] * along + normalizedBendDirection[2] * height
  ];
}

function rotatePointAroundHipY(
  point: [number, number, number],
  hipX: number,
  hipZ: number,
  angle: number
): [number, number, number] {
  const dx = point[0] - hipX;
  const dz = point[2] - hipZ;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    hipX + cos * dx - sin * dz,
    point[1],
    hipZ + sin * dx + cos * dz
  ];
}

function stabilizeOrientationWarpLeg(
  rig: RigDefinition,
  pose: PoseBuffer,
  leg: Extract<CompiledGraphNode, { type: "orientationWarp" }>['legs'][number],
  referenceWorld: WorldPose,
  hipWorldX: number,
  hipWorldZ: number,
  warpAngle: number
): void {
  if (leg.weight <= 1e-5) {
    return;
  }

  let world = computeWorldPose(rig, pose);
  const rawReferenceUpper = getWorldPosition(referenceWorld, leg.upperBoneIndex);
  const rawReferenceLower = getWorldPosition(referenceWorld, leg.lowerBoneIndex);
  const rawReferenceFoot = getWorldPosition(referenceWorld, leg.footBoneIndex);

  // Rotate reference positions by the warp angle so the IK targets match the
  // diagonal travel direction rather than the pre-warp forward-walk positions.
  const referenceUpper = rotatePointAroundHipY(rawReferenceUpper, hipWorldX, hipWorldZ, warpAngle);
  const referenceLower = rotatePointAroundHipY(rawReferenceLower, hipWorldX, hipWorldZ, warpAngle);
  const referenceFoot = rotatePointAroundHipY(rawReferenceFoot, hipWorldX, hipWorldZ, warpAngle);

  const planeNormal = computeChainPlaneNormal(referenceUpper, referenceLower, referenceFoot);

  const currentFoot = getWorldPosition(world, leg.footBoneIndex);
  const targetFoot = [
    currentFoot[0] + (referenceFoot[0] - currentFoot[0]) * leg.weight,
    currentFoot[1] + (referenceFoot[1] - currentFoot[1]) * leg.weight,
    currentFoot[2] + (referenceFoot[2] - currentFoot[2]) * leg.weight
  ] as [number, number, number];

  for (let iteration = 0; iteration < 2; iteration += 1) {
    world = computeWorldPose(rig, pose);
    const upper = getWorldPosition(world, leg.upperBoneIndex);
    const lower = getWorldPosition(world, leg.lowerBoneIndex);
    const foot = getWorldPosition(world, leg.footBoneIndex);
    const upperLength = Math.hypot(lower[0] - upper[0], lower[1] - upper[1], lower[2] - upper[2]);
    const lowerLength = Math.hypot(foot[0] - lower[0], foot[1] - lower[1], foot[2] - lower[2]);
    const kneeTarget = computeTwoBoneKneeTarget(upper, referenceLower, targetFoot, upperLength, lowerLength, planeNormal);
    if (!kneeTarget) {
      break;
    }

    const currentUpperDirection = normalizeVector(lower[0] - upper[0], lower[1] - upper[1], lower[2] - upper[2]);
    const desiredUpperDirection = normalizeVector(kneeTarget[0] - upper[0], kneeTarget[1] - upper[1], kneeTarget[2] - upper[2]);
    const upperDelta = quaternionFromToVectors(
      currentUpperDirection[0],
      currentUpperDirection[1],
      currentUpperDirection[2],
      desiredUpperDirection[0],
      desiredUpperDirection[1],
      desiredUpperDirection[2]
    );
    const desiredUpperRotation = multiplyQuaternion(
      upperDelta[0],
      upperDelta[1],
      upperDelta[2],
      upperDelta[3],
      world.rotations[leg.upperBoneIndex * 4]!,
      world.rotations[leg.upperBoneIndex * 4 + 1]!,
      world.rotations[leg.upperBoneIndex * 4 + 2]!,
      world.rotations[leg.upperBoneIndex * 4 + 3]!
    );
    setBoneWorldRotation(pose, rig, leg.upperBoneIndex, world, desiredUpperRotation);

    world = computeWorldPose(rig, pose);
    const nextLower = getWorldPosition(world, leg.lowerBoneIndex);
    const nextFoot = getWorldPosition(world, leg.footBoneIndex);
    const currentLowerDirection = normalizeVector(
      nextFoot[0] - nextLower[0],
      nextFoot[1] - nextLower[1],
      nextFoot[2] - nextLower[2]
    );
    const desiredLowerDirection = normalizeVector(
      targetFoot[0] - nextLower[0],
      targetFoot[1] - nextLower[1],
      targetFoot[2] - nextLower[2]
    );
    const lowerDelta = quaternionFromToVectors(
      currentLowerDirection[0],
      currentLowerDirection[1],
      currentLowerDirection[2],
      desiredLowerDirection[0],
      desiredLowerDirection[1],
      desiredLowerDirection[2]
    );
    const desiredLowerRotation = multiplyQuaternion(
      lowerDelta[0],
      lowerDelta[1],
      lowerDelta[2],
      lowerDelta[3],
      world.rotations[leg.lowerBoneIndex * 4]!,
      world.rotations[leg.lowerBoneIndex * 4 + 1]!,
      world.rotations[leg.lowerBoneIndex * 4 + 2]!,
      world.rotations[leg.lowerBoneIndex * 4 + 3]!
    );
    setBoneWorldRotation(pose, rig, leg.lowerBoneIndex, world, desiredLowerRotation);
  }
}

export function applyOrientationWarp(
  context: EvaluationContext,
  node: Extract<CompiledGraphNode, { type: "orientationWarp" }>,
  referencePose: PoseBuffer,
  outPose: PoseBuffer
): void {
  if (node.weight <= 1e-5) {
    return;
  }

  const parameterValue = Number(context.parameters.getValue(node.parameterIndex) ?? 0);
  const angle = clamp(parameterValue, -node.maxAngle, node.maxAngle) * node.weight;
  if (Math.abs(angle) < 1e-5) {
    return;
  }

  const spineBoneIndices = getUniqueBoneIndices(node.spineBoneIndices, node.hipBoneIndex);
  const legUpperBoneIndices = getUniqueBoneIndices(
    node.legs.map((leg) => leg.upperBoneIndex),
    node.hipBoneIndex
  );

  if (node.legs.length > 0) {
    const hipAngle = node.hipBoneIndex !== undefined ? angle * clamp(node.hipWeight, 0, 1) : 0;
    if (node.hipBoneIndex !== undefined) {
      applyWorldYawRotation(outPose, context.rig, node.hipBoneIndex, hipAngle);
    }

    const directLegAngle = angle - hipAngle;
    legUpperBoneIndices.forEach((boneIndex) => {
      applyWorldYawRotation(outPose, context.rig, boneIndex, directLegAngle);
    });

    const spineCompensationAngle = spineBoneIndices.length > 0 ? -hipAngle / spineBoneIndices.length : 0;
    spineBoneIndices.forEach((boneIndex) => {
      applyWorldYawRotation(outPose, context.rig, boneIndex, spineCompensationAngle);
    });
  } else if (node.hipBoneIndex !== undefined) {
    applyWorldYawRotation(outPose, context.rig, node.hipBoneIndex, angle);

    const spineCompensationAngle = spineBoneIndices.length > 0 ? -angle / spineBoneIndices.length : 0;
    spineBoneIndices.forEach((boneIndex) => {
      applyWorldYawRotation(outPose, context.rig, boneIndex, spineCompensationAngle);
    });
  } else {
    const spineAngle = spineBoneIndices.length > 0 ? angle / spineBoneIndices.length : 0;
    spineBoneIndices.forEach((boneIndex) => {
      applyWorldYawRotation(outPose, context.rig, boneIndex, spineAngle);
    });
  }

  if (node.legs.length === 0) {
    return;
  }

  // Compute the hip world position from the already-warped pose to use as the
  // Y-axis pivot when rotating the reference foot positions below.
  const warpedWorld = computeWorldPose(context.rig, outPose);
  const hipWarpedPos = node.hipBoneIndex !== undefined
    ? getWorldPosition(warpedWorld, node.hipBoneIndex)
    : [0, 0, 0] as [number, number, number];

  const referenceWorld = computeWorldPose(context.rig, referencePose);
  node.legs.forEach((leg) => stabilizeOrientationWarpLeg(
    context.rig, outPose, leg, referenceWorld,
    hipWarpedPos[0], hipWarpedPos[2], angle
  ));
}

export function applyOrientationWarpToRootMotion(
  context: EvaluationContext,
  node: Extract<CompiledGraphNode, { type: "orientationWarp" }>,
  rootMotion: RootMotionDelta
): void {
  if (node.weight <= 1e-5) {
    return;
  }

  const parameterValue = Number(context.parameters.getValue(node.parameterIndex) ?? 0);
  const angle = clamp(parameterValue, -node.maxAngle, node.maxAngle) * node.weight;
  if (Math.abs(angle) < 1e-5) {
    return;
  }

  const rotated = rotateVectorByQuaternion(
    rootMotion.translation[0] ?? 0,
    rootMotion.translation[1] ?? 0,
    rootMotion.translation[2] ?? 0,
    0,
    Math.sin(angle * 0.5),
    0,
    Math.cos(angle * 0.5)
  );
  rootMotion.translation[0] = rotated[0];
  rootMotion.translation[1] = rotated[1];
  rootMotion.translation[2] = rotated[2];
}