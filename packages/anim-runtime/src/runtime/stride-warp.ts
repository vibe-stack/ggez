import type { PoseBuffer, RigDefinition, RootMotionDelta } from "@ggez/anim-core";
import type { CompiledGraphNode } from "@ggez/anim-schema";
import { clamp } from "@ggez/anim-utils";
import type { EvaluationContext } from "./types";

type WorldPose = {
  translations: Float32Array;
  rotations: Float32Array;
  scales: Float32Array;
};

export type ResolvedStrideWarp = {
  direction: [number, number, number];
  strideScale: number;
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

function translateBoneWorldSpace(
  pose: PoseBuffer,
  rig: RigDefinition,
  boneIndex: number,
  world: WorldPose,
  delta: [number, number, number]
): void {
  const translationOffset = boneIndex * 3;
  const parentIndex = rig.parentIndices[boneIndex] ?? -1;

  if (parentIndex < 0) {
    pose.translations[translationOffset] += delta[0];
    pose.translations[translationOffset + 1] += delta[1];
    pose.translations[translationOffset + 2] += delta[2];
    return;
  }

  const parentTranslationOffset = parentIndex * 3;
  const parentRotationOffset = parentIndex * 4;
  const parentInverse = invertQuaternion(
    world.rotations[parentRotationOffset]!,
    world.rotations[parentRotationOffset + 1]!,
    world.rotations[parentRotationOffset + 2]!,
    world.rotations[parentRotationOffset + 3]!
  );
  const localDelta = rotateVectorByQuaternion(
    delta[0],
    delta[1],
    delta[2],
    parentInverse[0],
    parentInverse[1],
    parentInverse[2],
    parentInverse[3]
  );

  pose.translations[translationOffset] += localDelta[0] / Math.max(world.scales[parentTranslationOffset]!, 1e-5);
  pose.translations[translationOffset + 1] += localDelta[1] / Math.max(world.scales[parentTranslationOffset + 1]!, 1e-5);
  pose.translations[translationOffset + 2] += localDelta[2] / Math.max(world.scales[parentTranslationOffset + 2]!, 1e-5);
}

function getWorldPosition(world: WorldPose, boneIndex: number): [number, number, number] {
  const offset = boneIndex * 3;
  return [
    world.translations[offset]!,
    world.translations[offset + 1]!,
    world.translations[offset + 2]!
  ];
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

function getStrideOrigin(
  referenceWorld: WorldPose,
  node: Extract<CompiledGraphNode, { type: "strideWarp" }>
): [number, number, number] {
  if (node.pelvisBoneIndex !== undefined) {
    return getWorldPosition(referenceWorld, node.pelvisBoneIndex);
  }

  if (node.legs.length === 0) {
    return [0, 0, 0];
  }

  const sum = node.legs.reduce(
    (accumulator, leg) => {
      const position = getWorldPosition(referenceWorld, leg.upperBoneIndex);
      accumulator[0] += position[0];
      accumulator[1] += position[1];
      accumulator[2] += position[2];
      return accumulator;
    },
    [0, 0, 0] as [number, number, number]
  );
  const count = node.legs.length || 1;
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function stabilizeStrideWarpLeg(
  rig: RigDefinition,
  pose: PoseBuffer,
  leg: Extract<CompiledGraphNode, { type: "strideWarp" }>['legs'][number],
  referenceWorld: WorldPose,
  targetFoot: [number, number, number]
): void {
  if (leg.weight <= 1e-5) {
    return;
  }

  const referenceUpper = getWorldPosition(referenceWorld, leg.upperBoneIndex);
  const referenceLower = getWorldPosition(referenceWorld, leg.lowerBoneIndex);
  const referenceFoot = getWorldPosition(referenceWorld, leg.footBoneIndex);
  const planeNormal = computeChainPlaneNormal(referenceUpper, referenceLower, referenceFoot);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const world = computeWorldPose(rig, pose);
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

    const nextWorld = computeWorldPose(rig, pose);
    const nextLower = getWorldPosition(nextWorld, leg.lowerBoneIndex);
    const nextFoot = getWorldPosition(nextWorld, leg.footBoneIndex);
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
      nextWorld.rotations[leg.lowerBoneIndex * 4]!,
      nextWorld.rotations[leg.lowerBoneIndex * 4 + 1]!,
      nextWorld.rotations[leg.lowerBoneIndex * 4 + 2]!,
      nextWorld.rotations[leg.lowerBoneIndex * 4 + 3]!
    );
    setBoneWorldRotation(pose, rig, leg.lowerBoneIndex, nextWorld, desiredLowerRotation);
  }
}

function resolveStrideDirection(
  node: Extract<CompiledGraphNode, { type: "strideWarp" }>,
  sourceRootMotion: RootMotionDelta
): [number, number, number] {
  if (node.evaluationMode === "graph") {
    const graphDirection = normalizeVector(sourceRootMotion.translation[0] ?? 0, 0, sourceRootMotion.translation[2] ?? 0);
    if (Math.hypot(graphDirection[0], graphDirection[1], graphDirection[2]) > 1e-5) {
      return graphDirection;
    }
  }

  const authoredDirection = normalizeVector(node.strideDirection.x, 0, node.strideDirection.y);
  if (Math.hypot(authoredDirection[0], authoredDirection[1], authoredDirection[2]) > 1e-5) {
    return authoredDirection;
  }

  return [0, 0, 1];
}

function computeRawStrideScale(
  context: EvaluationContext,
  node: Extract<CompiledGraphNode, { type: "strideWarp" }>,
  sourceRootMotion: RootMotionDelta,
  deltaTime: number
): number {
  if (node.evaluationMode === "manual") {
    return node.manualStrideScale;
  }

  const locomotionSpeed = Number(context.parameters.getValue(node.locomotionSpeedParameterIndex ?? -1) ?? 0);
  if (locomotionSpeed < node.minLocomotionSpeedThreshold) {
    return 1;
  }

  const rootMotionDistance = Math.hypot(sourceRootMotion.translation[0] ?? 0, sourceRootMotion.translation[2] ?? 0);
  const rootMotionSpeed = deltaTime > 1e-5 ? rootMotionDistance / deltaTime : rootMotionDistance;
  if (rootMotionSpeed < 1e-5) {
    return 1;
  }

  return locomotionSpeed / rootMotionSpeed;
}

export function resolveStrideWarp(
  context: EvaluationContext,
  graphIndex: number,
  nodeIndex: number,
  node: Extract<CompiledGraphNode, { type: "strideWarp" }>,
  sourceRootMotion: RootMotionDelta,
  deltaTime: number
): ResolvedStrideWarp {
  const rawScale = computeRawStrideScale(context, node, sourceRootMotion, deltaTime);
  const minScale = Math.min(node.minStrideScale, node.maxStrideScale);
  const maxScale = Math.max(node.minStrideScale, node.maxStrideScale);
  let strideScale = node.clampResult ? clamp(rawScale, minScale, maxScale) : rawScale;

  const stateKey = `${graphIndex}:${nodeIndex}`;
  if (node.interpResult) {
    const previousScale = context.strideWarpScales.get(stateKey) ?? 1;
    const interpSpeed = strideScale >= previousScale ? node.interpSpeedIncreasing : node.interpSpeedDecreasing;
    const alpha = interpSpeed > 0 && deltaTime > 0 ? clamp(interpSpeed * deltaTime, 0, 1) : 1;
    strideScale = previousScale + (strideScale - previousScale) * alpha;
  }

  context.strideWarpScales.set(stateKey, strideScale);

  return {
    direction: resolveStrideDirection(node, sourceRootMotion),
    strideScale
  };
}

export function applyStrideWarp(
  context: EvaluationContext,
  node: Extract<CompiledGraphNode, { type: "strideWarp" }>,
  referencePose: PoseBuffer,
  outPose: PoseBuffer,
  resolved: ResolvedStrideWarp
): void {
  if (Math.abs(resolved.strideScale - 1) < 1e-4 || node.legs.length === 0) {
    return;
  }

  const referenceWorld = computeWorldPose(context.rig, referencePose);
  const origin = getStrideOrigin(referenceWorld, node);
  const footTargets = node.legs.map((leg) => {
    const referenceFoot = getWorldPosition(referenceWorld, leg.footBoneIndex);
    const footOffset = [
      referenceFoot[0] - origin[0],
      referenceFoot[1] - origin[1],
      referenceFoot[2] - origin[2]
    ] as [number, number, number];
    const along = dotVectors(footOffset[0], footOffset[1], footOffset[2], resolved.direction[0], resolved.direction[1], resolved.direction[2]);
    const deltaAlong = (along * resolved.strideScale - along) * leg.weight;

    return [
      referenceFoot[0] + resolved.direction[0] * deltaAlong,
      referenceFoot[1],
      referenceFoot[2] + resolved.direction[2] * deltaAlong
    ] as [number, number, number];
  });

  if (node.pelvisBoneIndex !== undefined && node.pelvisWeight > 1e-5) {
    const averageFootDelta = footTargets.reduce(
      (accumulator, targetFoot, legIndex) => {
        const referenceFoot = getWorldPosition(referenceWorld, node.legs[legIndex]!.footBoneIndex);
        accumulator[0] += targetFoot[0] - referenceFoot[0];
        accumulator[1] += targetFoot[1] - referenceFoot[1];
        accumulator[2] += targetFoot[2] - referenceFoot[2];
        return accumulator;
      },
      [0, 0, 0] as [number, number, number]
    );
    const pelvisDelta = [
      (averageFootDelta[0] / footTargets.length) * node.pelvisWeight,
      0,
      (averageFootDelta[2] / footTargets.length) * node.pelvisWeight
    ] as [number, number, number];
    const currentWorld = computeWorldPose(context.rig, outPose);
    translateBoneWorldSpace(outPose, context.rig, node.pelvisBoneIndex, currentWorld, pelvisDelta);
  }

  node.legs.forEach((leg, legIndex) => {
    stabilizeStrideWarpLeg(context.rig, outPose, leg, referenceWorld, footTargets[legIndex]!);
  });
}

export function applyStrideWarpToRootMotion(rootMotion: RootMotionDelta, resolved: ResolvedStrideWarp): void {
  if (Math.abs(resolved.strideScale - 1) < 1e-4) {
    return;
  }

  const translation = [
    rootMotion.translation[0] ?? 0,
    rootMotion.translation[1] ?? 0,
    rootMotion.translation[2] ?? 0
  ] as const;
  const along = dotVectors(translation[0], 0, translation[2], resolved.direction[0], 0, resolved.direction[2]);
  const alongVector = [
    resolved.direction[0] * along,
    0,
    resolved.direction[2] * along
  ] as const;
  const perpendicular = [
    translation[0] - alongVector[0],
    translation[1],
    translation[2] - alongVector[2]
  ] as const;

  rootMotion.translation[0] = perpendicular[0] + alongVector[0] * resolved.strideScale;
  rootMotion.translation[1] = perpendicular[1];
  rootMotion.translation[2] = perpendicular[2] + alongVector[2] * resolved.strideScale;
}