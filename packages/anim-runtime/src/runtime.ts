import { addPoseAdditive, blendPoses, blendPosesMasked, copyPose, createPoseBufferFromRig, createRootMotionDelta, estimateClipDuration, sampleClipPose, sampleClipPoseOnBase, sampleClipRootMotionDelta } from "@ggez/anim-core";
import type { AnimationClipAsset, BoneMask, PoseBuffer, RigDefinition, RootMotionDelta } from "@ggez/anim-core";
import type {
  CompiledAnimatorGraph,
  CompiledCondition,
  CompiledGraphNode,
  CompiledMotionGraph,
  CompiledTransition
} from "@ggez/anim-schema";
import { clamp } from "@ggez/anim-utils";
import { createAnimatorParameterStore, type AnimatorParameterStore } from "./parameters";

interface LayerRuntimeState {
  time: number;
}

interface MachineTransitionState {
  readonly fromStateIndex: number;
  readonly toStateIndex: number;
  readonly duration: number;
  readonly blendCurve: CompiledTransition["blendCurve"];
  readonly interruptionSource: "none" | "current" | "next" | "both";
  elapsed: number;
  nextStateTime: number;
}

interface StateMachineRuntimeState {
  initialized: boolean;
  currentStateIndex: number;
  lastAdvancedUpdateId: number;
  previousNextStateTime: number;
  previousStateTime: number;
  stateTime: number;
  transition: MachineTransitionState | null;
}

interface SyncGroupRuntimeState {
  normalizedPreviousTime: number;
  normalizedTime: number;
}

interface EvaluationContext {
  readonly graph: CompiledAnimatorGraph;
  readonly rig: RigDefinition;
  readonly clips: AnimationClipAsset[];
  readonly masks: BoneMask[];
  readonly parameters: AnimatorParameterStore;
  readonly layerStates: LayerRuntimeState[];
  readonly machineStates: StateMachineRuntimeState[];
  readonly durationCache: Map<string, number>;
  readonly syncGroups: Map<string, SyncGroupRuntimeState>;
  updateId: number;
  poseScratchIndex: number;
  motionScratchIndex: number;
  readonly poseScratch: PoseBuffer[];
  readonly motionScratch: RootMotionDelta[];
}

export interface AnimatorUpdateResult {
  readonly pose: PoseBuffer;
  readonly rootMotion: RootMotionDelta;
}

export interface AnimatorInstance {
  readonly rig: RigDefinition;
  readonly graph: CompiledAnimatorGraph;
  readonly clips: AnimationClipAsset[];
  readonly parameters: AnimatorParameterStore;
  readonly outputPose: PoseBuffer;
  readonly rootMotionDelta: RootMotionDelta;
  setFloat(name: string, value: number): void;
  setInt(name: string, value: number): void;
  setBool(name: string, value: boolean): void;
  trigger(name: string): void;
  update(deltaTime: number): AnimatorUpdateResult;
}

function createMasks(graph: CompiledAnimatorGraph): BoneMask[] {
  return graph.masks.map((mask) => ({ weights: Float32Array.from(mask.weights) }));
}

function createClipsBySlot(graph: CompiledAnimatorGraph, clips: AnimationClipAsset[]): AnimationClipAsset[] {
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));

  return graph.clipSlots.map((slot) => {
    const clip = clipMap.get(slot.id);
    if (!clip) {
      throw new Error(`Missing clip asset for slot "${slot.id}".`);
    }
    return clip;
  });
}

function ensureScratchPose(context: EvaluationContext): PoseBuffer {
  const pose = context.poseScratch[context.poseScratchIndex];
  if (!pose) {
    throw new Error("Animation runtime pose scratch exhausted.");
  }

  context.poseScratchIndex += 1;
  return pose;
}

function releaseScratchPose(context: EvaluationContext): void {
  context.poseScratchIndex -= 1;
}

function ensureScratchMotion(context: EvaluationContext): RootMotionDelta {
  const delta = context.motionScratch[context.motionScratchIndex];
  if (!delta) {
    throw new Error("Animation runtime root motion scratch exhausted.");
  }

  context.motionScratchIndex += 1;
  return delta;
}

function releaseScratchMotion(context: EvaluationContext): void {
  context.motionScratchIndex -= 1;
}

function resetRootMotion(out: RootMotionDelta): RootMotionDelta {
  out.translation[0] = 0;
  out.translation[1] = 0;
  out.translation[2] = 0;
  out.yaw = 0;
  return out;
}

function copyRootMotion(source: RootMotionDelta, out: RootMotionDelta): RootMotionDelta {
  out.translation[0] = source.translation[0];
  out.translation[1] = source.translation[1];
  out.translation[2] = source.translation[2];
  out.yaw = source.yaw;
  return out;
}

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

function stabilizeOrientationWarpLeg(
  rig: RigDefinition,
  pose: PoseBuffer,
  leg: Extract<CompiledGraphNode, { type: "orientationWarp" }>["legs"][number],
  referenceWorld: WorldPose
): void {
  if (leg.weight <= 1e-5) {
    return;
  }

  let world = computeWorldPose(rig, pose);
  const referenceUpper = getWorldPosition(referenceWorld, leg.upperBoneIndex);
  const referenceLower = getWorldPosition(referenceWorld, leg.lowerBoneIndex);
  const referenceFoot = getWorldPosition(referenceWorld, leg.footBoneIndex);
  const referenceFootRotation = getWorldRotation(referenceWorld, leg.footBoneIndex);
  const planeNormal = computeChainPlaneNormal(referenceUpper, referenceLower, referenceFoot);

  const currentFoot = getWorldPosition(world, leg.footBoneIndex);
  const currentFootRotation = getWorldRotation(world, leg.footBoneIndex);
  const targetFoot = [
    currentFoot[0] + (referenceFoot[0] - currentFoot[0]) * leg.weight,
    currentFoot[1] + (referenceFoot[1] - currentFoot[1]) * leg.weight,
    currentFoot[2] + (referenceFoot[2] - currentFoot[2]) * leg.weight
  ] as [number, number, number];
  const targetFootRotation = slerpQuaternion(
    currentFootRotation[0],
    currentFootRotation[1],
    currentFootRotation[2],
    currentFootRotation[3],
    referenceFootRotation[0],
    referenceFootRotation[1],
    referenceFootRotation[2],
    referenceFootRotation[3],
    leg.weight
  );

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

  world = computeWorldPose(rig, pose);
  setBoneWorldRotation(pose, rig, leg.footBoneIndex, world, targetFootRotation);
}

function applyOrientationWarp(
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

  const referenceWorld = computeWorldPose(context.rig, referencePose);
  node.legs.forEach((leg) => stabilizeOrientationWarpLeg(context.rig, outPose, leg, referenceWorld));
}

function getBoneDepth(rig: RigDefinition, boneIndex: number): number {
  let depth = 0;
  let current = boneIndex;

  while (current >= 0) {
    current = rig.parentIndices[current] ?? -1;
    if (current >= 0) {
      depth += 1;
    }
  }

  return depth;
}

function scoreRootMotionBoneName(name: string): number {
  const normalized = name.toLowerCase();

  if (normalized.includes("hips")) {
    return 400;
  }
  if (normalized.includes("pelvis")) {
    return 320;
  }
  if (normalized === "root") {
    return 240;
  }
  if (normalized.includes("root")) {
    return 180;
  }
  if (normalized.includes("armature")) {
    return 60;
  }
  return 0;
}

function estimateTranslationTravel(values: Float32Array | undefined): number {
  if (!values || values.length < 6) {
    return 0;
  }

  let maxDistance = 0;
  const startX = values[0] ?? 0;
  const startY = values[1] ?? 0;
  const startZ = values[2] ?? 0;

  for (let index = 3; index < values.length; index += 3) {
    const dx = (values[index] ?? 0) - startX;
    const dy = (values[index + 1] ?? 0) - startY;
    const dz = (values[index + 2] ?? 0) - startZ;
    maxDistance = Math.max(maxDistance, Math.hypot(dx, dy, dz));
  }

  return maxDistance;
}

function inferMotionRootBoneIndex(clip: AnimationClipAsset, rig: RigDefinition): number {
  const candidates = clip.tracks
    .filter((track) => track.translationTimes && track.translationValues && track.translationValues.length >= 3)
    .map((track) => ({
      boneIndex: track.boneIndex,
      nameScore: scoreRootMotionBoneName(rig.boneNames[track.boneIndex] ?? ""),
      travel: estimateTranslationTravel(track.translationValues),
      depth: getBoneDepth(rig, track.boneIndex)
    }))
    .sort((left, right) => {
      if (left.nameScore !== right.nameScore) {
        return right.nameScore - left.nameScore;
      }
      if (left.travel !== right.travel) {
        return right.travel - left.travel;
      }
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.boneIndex - right.boneIndex;
    });

  return candidates[0]?.boneIndex ?? rig.rootBoneIndex;
}

function getEffectiveRootBoneIndex(clip: AnimationClipAsset, rig: RigDefinition): number {
  return clip.rootBoneIndex ?? inferMotionRootBoneIndex(clip, rig);
}

function forceBoneTranslationToBindPose(context: EvaluationContext, boneIndex: number, pose: PoseBuffer): void {
  const translationOffset = boneIndex * 3;
  pose.translations[translationOffset] = context.rig.bindTranslations[translationOffset]!;
  pose.translations[translationOffset + 1] = context.rig.bindTranslations[translationOffset + 1]!;
  pose.translations[translationOffset + 2] = context.rig.bindTranslations[translationOffset + 2]!;
}

function forceRootMotionChainToBindPose(context: EvaluationContext, rootBoneIndex: number, pose: PoseBuffer): void {
  let current = rootBoneIndex;

  while (current >= 0) {
    forceBoneTranslationToBindPose(context, current, pose);
    current = context.rig.parentIndices[current] ?? -1;
  }
}

function blendRootMotion(a: RootMotionDelta, b: RootMotionDelta, weight: number, out: RootMotionDelta): RootMotionDelta {
  const t = clamp(weight, 0, 1);
  out.translation[0] = a.translation[0] + (b.translation[0] - a.translation[0]) * t;
  out.translation[1] = a.translation[1] + (b.translation[1] - a.translation[1]) * t;
  out.translation[2] = a.translation[2] + (b.translation[2] - a.translation[2]) * t;
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  return out;
}

function addScaledRootMotion(target: RootMotionDelta, source: RootMotionDelta, weight: number): RootMotionDelta {
  target.translation[0] += source.translation[0] * weight;
  target.translation[1] += source.translation[1] * weight;
  target.translation[2] += source.translation[2] * weight;
  target.yaw += source.yaw * weight;
  return target;
}

function applyBlendCurve(curve: CompiledTransition["blendCurve"], value: number): number {
  const t = clamp(value, 0, 1);

  switch (curve) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
    case "linear":
    default:
      return t;
  }
}

function evaluateCondition(parameters: AnimatorParameterStore, condition: CompiledCondition): boolean {
  const current = parameters.getValue(condition.parameterIndex);

  switch (condition.operator) {
    case ">":
      return Number(current) > Number(condition.value ?? 0);
    case ">=":
      return Number(current) >= Number(condition.value ?? 0);
    case "<":
      return Number(current) < Number(condition.value ?? 0);
    case "<=":
      return Number(current) <= Number(condition.value ?? 0);
    case "==":
      return current === condition.value;
    case "!=":
      return current !== condition.value;
    case "set":
      return Boolean(current);
    default:
      return false;
  }
}

function getStateDuration(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  stateIndex: number
): number {
  const state = machineNode.states[stateIndex]!;
  return getNodeDuration(context, graphIndex, state.motionNodeIndex);
}

function getSyncedTransitionTime(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
  sourceStateIndex: number,
  sourceStateTime: number
): number {
  if (!transition.syncNormalizedTime) {
    return 0;
  }

  const sourceState = machineNode.states[sourceStateIndex]!;
  const targetState = machineNode.states[transition.toStateIndex]!;
  const sourceDuration = getStateDuration(context, graphIndex, machineNode, sourceStateIndex);
  const targetDuration = getStateDuration(context, graphIndex, machineNode, transition.toStateIndex);

  if (sourceDuration <= 0 || targetDuration <= 0) {
    return 0;
  }

  const sourcePlaybackTime = sourceStateTime + sourceState.cycleOffset;
  const targetPlaybackTime = (sourcePlaybackTime / sourceDuration) * targetDuration;
  return targetPlaybackTime - targetState.cycleOffset;
}

function getNodeDuration(context: EvaluationContext, graphIndex: number, nodeIndex: number, visited = new Set<string>()): number {
  if (nodeIndex < 0) {
    return 0;
  }

  const graph = context.graph.graphs[graphIndex]!;
  const node = graph.nodes[nodeIndex]!;
  const cacheKey = `${graphIndex}:${nodeIndex}`;
  if (node.type !== "selector") {
    const cached = context.durationCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (visited.has(cacheKey)) {
    return 0;
  }
  visited.add(cacheKey);

  let duration = 0;

  switch (node.type) {
    case "clip":
      duration = estimateClipDuration(context.clips[node.clipIndex]!);
      break;
    case "blend1d":
      duration = Math.max(...node.children.map((child) => getNodeDuration(context, graphIndex, child.nodeIndex, visited)));
      break;
    case "blend2d":
      duration = Math.max(...node.children.map((child) => getNodeDuration(context, graphIndex, child.nodeIndex, visited)));
      break;
    case "selector": {
      const child = findSelectorChild(node.children, Number(context.parameters.getValue(node.parameterIndex) ?? 0));
      duration = child ? getNodeDuration(context, graphIndex, child.nodeIndex, visited) : 0;
      break;
    }
    case "orientationWarp":
      duration = getNodeDuration(context, graphIndex, node.sourceNodeIndex, visited);
      break;
    case "subgraph":
      duration = getNodeDuration(context, node.graphIndex, context.graph.graphs[node.graphIndex]!.rootNodeIndex, visited);
      break;
    case "stateMachine":
      duration = Math.max(...node.states.map((state) => getNodeDuration(context, graphIndex, state.motionNodeIndex, visited)));
      break;
  }

  if (node.type !== "selector") {
    context.durationCache.set(cacheKey, duration);
  }
  return duration;
}

function remapBlendChildTime(
  context: EvaluationContext,
  graphIndex: number,
  parentNodeIndex: number,
  childNodeIndex: number,
  time: number,
  previousTime: number
): { time: number; previousTime: number; deltaTime: number } {
  const parentDuration = getNodeDuration(context, graphIndex, parentNodeIndex);
  const childDuration = getNodeDuration(context, graphIndex, childNodeIndex);

  if (parentDuration <= 0 || childDuration <= 0 || Math.abs(parentDuration - childDuration) < 1e-5) {
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  const remappedTime = (time / parentDuration) * childDuration;
  const remappedPreviousTime = (previousTime / parentDuration) * childDuration;

  return {
    time: remappedTime,
    previousTime: remappedPreviousTime,
    deltaTime: remappedTime - remappedPreviousTime
  };
}

function resolveSyncGroupTimes(
  context: EvaluationContext,
  syncGroup: string | undefined,
  duration: number,
  time: number,
  previousTime: number
): { time: number; previousTime: number; deltaTime: number } {
  if (!syncGroup || duration <= 1e-5) {
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  const existing = context.syncGroups.get(syncGroup);
  if (!existing) {
    context.syncGroups.set(syncGroup, {
      normalizedPreviousTime: previousTime / duration,
      normalizedTime: time / duration
    });
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  const remappedTime = existing.normalizedTime * duration;
  const remappedPreviousTime = existing.normalizedPreviousTime * duration;
  return {
    time: remappedTime,
    previousTime: remappedPreviousTime,
    deltaTime: remappedTime - remappedPreviousTime
  };
}

function findBlend1DChildren(
  children: {
    nodeIndex: number;
    threshold: number;
  }[],
  value: number
) {
  if (children.length === 1) {
    return { a: children[0]!, b: children[0]!, t: 0 };
  }

  const sorted = [...children].sort((left, right) => left.threshold - right.threshold);
  if (value <= sorted[0]!.threshold) {
    return { a: sorted[0]!, b: sorted[0]!, t: 0 };
  }
  if (value >= sorted[sorted.length - 1]!.threshold) {
    const last = sorted[sorted.length - 1]!;
    return { a: last, b: last, t: 0 };
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    if (value >= current.threshold && value <= next.threshold) {
      const t = (value - current.threshold) / (next.threshold - current.threshold || 1);
      return { a: current, b: next, t };
    }
  }

  const last = sorted[sorted.length - 1]!;
  return { a: last, b: last, t: 0 };
}

function findSelectorChild(
  children: {
    nodeIndex: number;
    value: number;
  }[],
  value: number
) {
  const exact = children.find((child) => child.value === value);
  if (exact) {
    return exact;
  }

  return [...children].sort((left, right) => {
    const leftDistance = Math.abs(left.value - value);
    const rightDistance = Math.abs(right.value - value);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return left.value - right.value;
  })[0];
}

type Blend2DChild = {
  nodeIndex: number;
  x: number;
  y: number;
};

type WeightedBlend2DChild = {
  child: Blend2DChild;
  weight: number;
};

function sortWeightedBlend2DChildren(children: WeightedBlend2DChild[]): WeightedBlend2DChild[] {
  return [...children]
    .filter((entry) => entry.weight > 1e-5)
    .sort((left, right) => right.weight - left.weight);
}

function computeTriangleBarycentricWeights(
  a: Blend2DChild,
  b: Blend2DChild,
  c: Blend2DChild,
  x: number,
  y: number
): { a: number; b: number; c: number; minWeight: number } | null {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 1e-5) {
    return null;
  }

  const weightA = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
  const weightB = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
  const weightC = 1 - weightA - weightB;

  return {
    a: weightA,
    b: weightB,
    c: weightC,
    minWeight: Math.min(weightA, weightB, weightC)
  };
}

function findContainingBlend2DTriangle(children: Blend2DChild[], x: number, y: number): WeightedBlend2DChild[] | null {
  const epsilon = 1e-5;
  let best:
    | {
        entries: WeightedBlend2DChild[];
        minWeight: number;
      }
    | null = null;

  for (let aIndex = 0; aIndex < children.length - 2; aIndex += 1) {
    const a = children[aIndex]!;
    for (let bIndex = aIndex + 1; bIndex < children.length - 1; bIndex += 1) {
      const b = children[bIndex]!;
      for (let cIndex = bIndex + 1; cIndex < children.length; cIndex += 1) {
        const c = children[cIndex]!;
        const weights = computeTriangleBarycentricWeights(a, b, c, x, y);
        if (!weights || weights.minWeight < -epsilon) {
          continue;
        }

        const entries = sortWeightedBlend2DChildren([
          { child: a, weight: weights.a },
          { child: b, weight: weights.b },
          { child: c, weight: weights.c }
        ]);

        if (!best || weights.minWeight > best.minWeight) {
          best = {
            entries,
            minWeight: weights.minWeight
          };
        }
      }
    }
  }

  return best?.entries ?? null;
}

function findBlend2DEdgeWeights(children: Blend2DChild[], x: number, y: number): WeightedBlend2DChild[] | null {
  let best:
    | {
        distanceSquared: number;
        entries: WeightedBlend2DChild[];
      }
    | null = null;

  for (let aIndex = 0; aIndex < children.length - 1; aIndex += 1) {
    const a = children[aIndex]!;
    for (let bIndex = aIndex + 1; bIndex < children.length; bIndex += 1) {
      const b = children[bIndex]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;

      if (lengthSquared < 1e-5) {
        continue;
      }

      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1);
      const projectedX = a.x + dx * t;
      const projectedY = a.y + dy * t;
      const distanceX = x - projectedX;
      const distanceY = y - projectedY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;
      const entries = sortWeightedBlend2DChildren([
        { child: a, weight: 1 - t },
        { child: b, weight: t }
      ]);

      if (!best || distanceSquared < best.distanceSquared) {
        best = {
          distanceSquared,
          entries
        };
      }
    }
  }

  return best?.entries ?? null;
}

function computeBlend2DChildren(
  children: Blend2DChild[],
  x: number,
  y: number
): WeightedBlend2DChild[] {
  if (children.length === 0) {
    return [];
  }

  if (children.length === 1) {
    return [{ child: children[0]!, weight: 1 }];
  }

  const exact = children.find((child) => Math.hypot(x - child.x, y - child.y) < 1e-5);
  if (exact) {
    return [{ child: exact, weight: 1 }];
  }

  const triangle = findContainingBlend2DTriangle(children, x, y);
  if (triangle && triangle.length > 0) {
    return triangle;
  }

  const edge = findBlend2DEdgeWeights(children, x, y);
  if (edge && edge.length > 0) {
    return edge;
  }

  const nearest = [...children].sort((left, right) => {
    const leftDistance = Math.hypot(x - left.x, y - left.y);
    const rightDistance = Math.hypot(x - right.x, y - right.y);
    return leftDistance - rightDistance;
  })[0];

  return nearest ? [{ child: nearest, weight: 1 }] : [];
}

function evaluateNode(
  context: EvaluationContext,
  compiledGraph: CompiledMotionGraph,
  graphIndex: number,
  nodeIndex: number,
  time: number,
  previousTime: number,
  deltaTime: number,
  outPose: PoseBuffer,
  outRootMotion: RootMotionDelta,
  fallbackPose: PoseBuffer | undefined = undefined
): void {
  const node = compiledGraph.nodes[nodeIndex]!;

  switch (node.type) {
    case "clip": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        estimateClipDuration(context.clips[node.clipIndex]!),
        time,
        previousTime
      );
      const clip = context.clips[node.clipIndex]!;
      if (fallbackPose) {
        sampleClipPoseOnBase(clip, syncedTime.time * node.speed, fallbackPose, outPose, node.loop);
      } else {
        sampleClipPose(clip, context.rig, syncedTime.time * node.speed, outPose, node.loop);
      }
      const rootBoneIndex = getEffectiveRootBoneIndex(clip, context.rig);
      if (node.inPlace) {
        forceRootMotionChainToBindPose(context, rootBoneIndex, outPose);
      }
      const prevPose = ensureScratchPose(context);
      const nextPose = ensureScratchPose(context);
      sampleClipPose(clip, context.rig, syncedTime.previousTime * node.speed, prevPose, node.loop);
      sampleClipPose(clip, context.rig, syncedTime.time * node.speed, nextPose, node.loop);
      if (node.inPlace) {
        forceRootMotionChainToBindPose(context, rootBoneIndex, prevPose);
        forceRootMotionChainToBindPose(context, rootBoneIndex, nextPose);
      }
      copyRootMotion(
        sampleClipRootMotionDelta(clip, context.rig, syncedTime.previousTime * node.speed, syncedTime.time * node.speed, "full"),
        outRootMotion
      );
      if (node.inPlace) {
        resetRootMotion(outRootMotion);
      }
      releaseScratchPose(context);
      releaseScratchPose(context);
      break;
    }
    case "subgraph": {
      const subgraph = context.graph.graphs[node.graphIndex]!;
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, node.graphIndex, subgraph.rootNodeIndex),
        time,
        previousTime
      );
      evaluateNode(context, subgraph, node.graphIndex, subgraph.rootNodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, outPose, outRootMotion, fallbackPose);
      break;
    }
    case "blend1d": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, graphIndex, nodeIndex),
        time,
        previousTime
      );
      const value = Number(context.parameters.getValue(node.parameterIndex) ?? 0);
      const pair = findBlend1DChildren(node.children, value);
      // When the selected pair resolves to a single child (exact threshold match or
      // out-of-range clamp), skip parent-duration normalization so that clip plays at
      // its own natural speed.  Normalizing against max(all-child-durations) when only
      // one child is active can make a short clip play at a tiny fraction of its natural
      // speed (e.g. a 1 s walk clip plays at ~17% speed when the blend tree also
      // contains an 8 s idle clip).  Cross-child synchronization is still applied when
      // two distinct children are being blended together.
      const childATime = pair.a.nodeIndex === pair.b.nodeIndex
        ? syncedTime
        : remapBlendChildTime(context, graphIndex, nodeIndex, pair.a.nodeIndex, syncedTime.time, syncedTime.previousTime);
      evaluateNode(context, compiledGraph, graphIndex, pair.a.nodeIndex, childATime.time, childATime.previousTime, childATime.deltaTime, outPose, outRootMotion, fallbackPose);
      if (pair.a.nodeIndex !== pair.b.nodeIndex) {
        const tempPose = ensureScratchPose(context);
        const tempMotion = ensureScratchMotion(context);
        const childBTime = remapBlendChildTime(context, graphIndex, nodeIndex, pair.b.nodeIndex, syncedTime.time, syncedTime.previousTime);
        evaluateNode(context, compiledGraph, graphIndex, pair.b.nodeIndex, childBTime.time, childBTime.previousTime, childBTime.deltaTime, tempPose, tempMotion, fallbackPose);
        blendPoses(outPose, tempPose, pair.t, outPose);
        blendRootMotion(outRootMotion, tempMotion, pair.t, outRootMotion);
        releaseScratchMotion(context);
        releaseScratchPose(context);
      }
      break;
    }
    case "blend2d": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, graphIndex, nodeIndex),
        time,
        previousTime
      );
      const x = Number(context.parameters.getValue(node.xParameterIndex) ?? 0);
      const y = Number(context.parameters.getValue(node.yParameterIndex) ?? 0);
      const weights = computeBlend2DChildren(node.children, x, y);

      if (weights.length === 0) {
        if (fallbackPose) {
          copyPose(fallbackPose, outPose);
        } else {
          copyPose(createPoseBufferFromRig(context.rig), outPose);
        }
        resetRootMotion(outRootMotion);
        break;
      }

      if (weights.length === 1) {
        const exact = weights[0]!;
        const childTime = syncedTime;
        evaluateNode(context, compiledGraph, graphIndex, exact.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, outPose, outRootMotion, fallbackPose);
        break;
      }

      const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      resetRootMotion(outRootMotion);
      let accumulatedWeight = 0;

      weights.forEach((entry, index) => {
        const normalizedWeight = entry.weight / weightSum;
        const childTime = remapBlendChildTime(context, graphIndex, nodeIndex, entry.child.nodeIndex, syncedTime.time, syncedTime.previousTime);
        if (index === 0) {
          evaluateNode(context, compiledGraph, graphIndex, entry.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, outPose, outRootMotion, fallbackPose);
          accumulatedWeight = normalizedWeight;
          return;
        }

        const tempPose = ensureScratchPose(context);
        const tempMotion = ensureScratchMotion(context);
        evaluateNode(context, compiledGraph, graphIndex, entry.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, tempPose, tempMotion, fallbackPose);
        const blendWeight = normalizedWeight / (accumulatedWeight + normalizedWeight);
        blendPoses(outPose, tempPose, blendWeight, outPose);
        blendRootMotion(outRootMotion, tempMotion, blendWeight, outRootMotion);
        accumulatedWeight += normalizedWeight;
        releaseScratchMotion(context);
        releaseScratchPose(context);
      });
      break;
    }
    case "selector": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, graphIndex, nodeIndex),
        time,
        previousTime
      );
      const child = findSelectorChild(node.children, Number(context.parameters.getValue(node.parameterIndex) ?? 0));
      if (!child) {
        if (fallbackPose) {
          copyPose(fallbackPose, outPose);
        } else {
          copyPose(createPoseBufferFromRig(context.rig), outPose);
        }
        resetRootMotion(outRootMotion);
        break;
      }

      evaluateNode(context, compiledGraph, graphIndex, child.nodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, outPose, outRootMotion, fallbackPose);
      break;
    }
    case "orientationWarp": {
      const sourcePose = ensureScratchPose(context);
      const sourceMotion = ensureScratchMotion(context);
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        node.sourceNodeIndex,
        time,
        previousTime,
        deltaTime,
        sourcePose,
        sourceMotion,
        fallbackPose
      );
      copyPose(sourcePose, outPose);
      copyRootMotion(sourceMotion, outRootMotion);
      applyOrientationWarp(context, node, sourcePose, outPose);
      releaseScratchMotion(context);
      releaseScratchPose(context);
      break;
    }
    case "stateMachine": {
      evaluateStateMachine(context, compiledGraph, graphIndex, node, time, previousTime, deltaTime, outPose, outRootMotion, fallbackPose);
      break;
    }
  }
}

function tryStartTransition(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  machineState: StateMachineRuntimeState
): void {
  if (machineState.transition) {
    return;
  }

  const candidates = [...machineNode.anyStateTransitions, ...machineNode.transitions];
  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const currentDuration = getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex);
  const normalizedTime = currentDuration > 0 ? machineState.stateTime / currentDuration : 0;

  for (const transition of candidates) {
    if (transition.fromStateIndex >= 0 && transition.fromStateIndex !== machineState.currentStateIndex) {
      continue;
    }

    if (transition.hasExitTime && normalizedTime < Number(transition.exitTime ?? 1)) {
      continue;
    }

    if (!transition.conditions.every((condition: CompiledCondition) => evaluateCondition(context.parameters, condition))) {
      continue;
    }

    machineState.transition = {
      fromStateIndex: machineState.currentStateIndex,
      toStateIndex: transition.toStateIndex,
      duration: transition.duration,
      blendCurve: transition.blendCurve,
      interruptionSource: transition.interruptionSource,
      elapsed: 0,
      nextStateTime: getSyncedTransitionTime(context, graphIndex, machineNode, transition, machineState.currentStateIndex, machineState.stateTime)
    };
    return;
  }
}

function tryInterruptTransition(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  machineState: StateMachineRuntimeState
): void {
  const activeTransition = machineState.transition;
  if (!activeTransition || activeTransition.interruptionSource === "none") {
    return;
  }

  const allowCurrent = activeTransition.interruptionSource === "current" || activeTransition.interruptionSource === "both";
  const allowNext = activeTransition.interruptionSource === "next" || activeTransition.interruptionSource === "both";

  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const currentDuration = getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex);
  const currentNormalizedTime = currentDuration > 0 ? machineState.stateTime / currentDuration : 0;

  const nextState = machineNode.states[activeTransition.toStateIndex]!;
  const nextDuration = getStateDuration(context, graphIndex, machineNode, activeTransition.toStateIndex);
  const nextNormalizedTime = nextDuration > 0 ? activeTransition.nextStateTime / nextDuration : 0;

  const transitionCanStart = (
    transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
    sourceStateIndex: number,
    normalizedTime: number
  ) => {
    if (transition.hasExitTime && normalizedTime < Number(transition.exitTime ?? 1)) {
      return false;
    }

    return transition.conditions.every((condition: CompiledCondition) => evaluateCondition(context.parameters, condition));
  };

  const startInterruptedTransition = (
    transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
    sourceStateIndex: number,
    sourceStateTime: number
  ) => {
    machineState.currentStateIndex = sourceStateIndex;
    machineState.stateTime = sourceStateTime;
    machineState.transition = {
      fromStateIndex: sourceStateIndex,
      toStateIndex: transition.toStateIndex,
      duration: transition.duration,
      blendCurve: transition.blendCurve,
      interruptionSource: transition.interruptionSource,
      elapsed: 0,
      nextStateTime: getSyncedTransitionTime(context, graphIndex, machineNode, transition, sourceStateIndex, sourceStateTime)
    };
  };

  for (const transition of machineNode.anyStateTransitions) {
    const sourceStateIndex = allowNext ? activeTransition.toStateIndex : machineState.currentStateIndex;
    const normalizedTime = allowNext ? nextNormalizedTime : currentNormalizedTime;
    const sourceStateTime = allowNext ? activeTransition.nextStateTime : machineState.stateTime;

    if (!transitionCanStart(transition, sourceStateIndex, normalizedTime)) {
      continue;
    }

    startInterruptedTransition(transition, sourceStateIndex, sourceStateTime);
    return;
  }

  if (allowCurrent) {
    for (const transition of machineNode.transitions) {
      if (transition.fromStateIndex !== machineState.currentStateIndex) {
        continue;
      }

      if (!transitionCanStart(transition, machineState.currentStateIndex, currentNormalizedTime)) {
        continue;
      }

      startInterruptedTransition(transition, machineState.currentStateIndex, machineState.stateTime);
      return;
    }
  }

  if (allowNext) {
    for (const transition of machineNode.transitions) {
      if (transition.fromStateIndex !== activeTransition.toStateIndex) {
        continue;
      }

      if (!transitionCanStart(transition, activeTransition.toStateIndex, nextNormalizedTime)) {
        continue;
      }

      startInterruptedTransition(transition, activeTransition.toStateIndex, activeTransition.nextStateTime);
      return;
    }
  }
}

function evaluateStateMachine(
  context: EvaluationContext,
  compiledGraph: CompiledMotionGraph,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  _time: number,
  _previousTime: number,
  deltaTime: number,
  outPose: PoseBuffer,
  outRootMotion: RootMotionDelta,
  fallbackPose: PoseBuffer | undefined
): void {
  const machineState = context.machineStates[machineNode.machineIndex]!;

  if (!machineState.initialized) {
    machineState.initialized = true;
    machineState.currentStateIndex = machineNode.entryStateIndex;
    machineState.previousNextStateTime = 0;
    machineState.previousStateTime = 0;
    machineState.stateTime = 0;
    machineState.transition = null;
  }

  if (machineState.lastAdvancedUpdateId !== context.updateId) {
    const currentState = machineNode.states[machineState.currentStateIndex]!;
    const stateSpeed = currentState.speed;
    machineState.lastAdvancedUpdateId = context.updateId;
    machineState.previousStateTime = machineState.stateTime;
    machineState.stateTime += deltaTime * stateSpeed;

    if (machineState.transition) {
      tryInterruptTransition(context, graphIndex, machineNode, machineState);
    } else {
      tryStartTransition(context, graphIndex, machineNode, machineState);
    }

    machineState.previousNextStateTime = machineState.transition?.nextStateTime ?? 0;
    if (machineState.transition) {
      const nextState = machineNode.states[machineState.transition.toStateIndex]!;
      machineState.transition.elapsed += deltaTime;
      machineState.transition.nextStateTime += deltaTime * nextState.speed;
    }
  }

  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const previousStateTime = machineState.previousStateTime;
  const stateSpeed = currentState.speed;

  if (!machineState.transition) {
    if (currentState.motionNodeIndex < 0) {
      if (fallbackPose) {
        copyPose(fallbackPose, outPose);
      } else {
        copyPose(createPoseBufferFromRig(context.rig), outPose);
      }
      resetRootMotion(outRootMotion);
    } else {
      const syncedTime = resolveSyncGroupTimes(
        context,
        currentState.syncGroup,
        getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex),
        machineState.stateTime + currentState.cycleOffset,
        previousStateTime + currentState.cycleOffset
      );
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        currentState.motionNodeIndex,
        syncedTime.time,
        syncedTime.previousTime,
        syncedTime.deltaTime,
        outPose,
        outRootMotion,
        fallbackPose
      );
    }
    return;
  }

  const transition = machineState.transition;
  const nextState = machineNode.states[transition.toStateIndex]!;
  const previousNextStateTime = machineState.previousNextStateTime;

  if (currentState.motionNodeIndex < 0) {
    if (fallbackPose) {
      copyPose(fallbackPose, outPose);
    } else {
      copyPose(createPoseBufferFromRig(context.rig), outPose);
    }
    resetRootMotion(outRootMotion);
  } else {
    const syncedTime = resolveSyncGroupTimes(
      context,
      currentState.syncGroup,
      getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex),
      machineState.stateTime + currentState.cycleOffset,
      previousStateTime + currentState.cycleOffset
    );
    evaluateNode(
      context,
      compiledGraph,
      graphIndex,
      currentState.motionNodeIndex,
      syncedTime.time,
      syncedTime.previousTime,
      syncedTime.deltaTime,
      outPose,
      outRootMotion,
      fallbackPose
    );
  }

  const nextPose = ensureScratchPose(context);
  const nextMotion = ensureScratchMotion(context);
  if (nextState.motionNodeIndex < 0) {
    if (fallbackPose) {
      copyPose(fallbackPose, nextPose);
    } else {
      copyPose(createPoseBufferFromRig(context.rig), nextPose);
    }
    resetRootMotion(nextMotion);
  } else {
    const syncedTime = resolveSyncGroupTimes(
      context,
      nextState.syncGroup,
      getStateDuration(context, graphIndex, machineNode, transition.toStateIndex),
      transition.nextStateTime + nextState.cycleOffset,
      previousNextStateTime + nextState.cycleOffset
    );
    evaluateNode(
      context,
      compiledGraph,
      graphIndex,
      nextState.motionNodeIndex,
      syncedTime.time,
      syncedTime.previousTime,
      syncedTime.deltaTime,
      nextPose,
      nextMotion,
      fallbackPose
    );
  }

  const progress = applyBlendCurve(transition.blendCurve, transition.elapsed / Math.max(0.0001, transition.duration));
  blendPoses(outPose, nextPose, progress, outPose);
  blendRootMotion(outRootMotion, nextMotion, progress, outRootMotion);

  if (progress >= 1) {
    machineState.currentStateIndex = transition.toStateIndex;
    machineState.stateTime = transition.nextStateTime;
    machineState.transition = null;
  }

  releaseScratchMotion(context);
  releaseScratchPose(context);
}

export function createAnimatorInstance(input: {
  rig: RigDefinition;
  graph: CompiledAnimatorGraph;
  clips: AnimationClipAsset[];
}): AnimatorInstance {
  const parameters = createAnimatorParameterStore(input.graph);
  const clips = createClipsBySlot(input.graph, input.clips);
  const masks = createMasks(input.graph);
  const layerStates: LayerRuntimeState[] = input.graph.layers.map(() => ({ time: 0 }));
  const machineCount = input.graph.graphs.flatMap((graph) => graph.nodes).reduce((count, node) => {
    if (node.type === "stateMachine") {
      return Math.max(count, node.machineIndex + 1);
    }
    return count;
  }, 0);
  const machineStates: StateMachineRuntimeState[] = Array.from({ length: machineCount }, () => ({
    initialized: false,
    currentStateIndex: 0,
    lastAdvancedUpdateId: -1,
    previousNextStateTime: 0,
    previousStateTime: 0,
    stateTime: 0,
    transition: null
  }));
  const outputPose = createPoseBufferFromRig(input.rig);
  const rootMotionDelta = createRootMotionDelta();

  const context: EvaluationContext = {
    graph: input.graph,
    rig: input.rig,
    clips,
    masks,
    parameters,
    layerStates,
    machineStates,
    durationCache: new Map(),
    syncGroups: new Map(),
    updateId: 0,
    poseScratch: Array.from({ length: 32 }, () => createPoseBufferFromRig(input.rig)),
    motionScratch: Array.from({ length: 32 }, () => createRootMotionDelta()),
    poseScratchIndex: 0,
    motionScratchIndex: 0
  };

  function update(deltaTime: number): AnimatorUpdateResult {
    context.updateId += 1;
    context.poseScratchIndex = 0;
    context.motionScratchIndex = 0;
    context.syncGroups.clear();
    resetRootMotion(rootMotionDelta);

    let hasBaseLayer = false;

    input.graph.layers.forEach((layer, layerIndex) => {
      if (!layer.enabled || layer.weight <= 0) {
        return;
      }

      const layerState = context.layerStates[layerIndex]!;
      const previousTime = layerState.time;
      layerState.time += deltaTime;

      const graph = input.graph.graphs[layer.graphIndex]!;
      const layerPose = ensureScratchPose(context);
      const layerMotion = ensureScratchMotion(context);
      const fallbackPose = layer.blendMode === "override" && layer.maskIndex !== undefined ? outputPose : undefined;

      evaluateNode(context, graph, layer.graphIndex, graph.rootNodeIndex, layerState.time, previousTime, deltaTime, layerPose, layerMotion, fallbackPose);

      const mask = layer.maskIndex === undefined ? undefined : context.masks[layer.maskIndex];
      if (!hasBaseLayer) {
        copyPose(layerPose, outputPose);
        hasBaseLayer = true;
      } else if (layer.blendMode === "additive") {
        addPoseAdditive(outputPose, layerPose, input.rig, layer.weight, mask, outputPose);
      } else {
        blendPosesMasked(outputPose, layerPose, layer.weight, mask, outputPose);
      }

      if (layer.rootMotionMode !== "none") {
        addScaledRootMotion(rootMotionDelta, layerMotion, layer.weight);
        if (layer.rootMotionMode === "xz" || layer.rootMotionMode === "xz-yaw") {
          rootMotionDelta.translation[1] = 0;
        }
        if (layer.rootMotionMode === "xz") {
          rootMotionDelta.yaw = 0;
        }
      }

      releaseScratchMotion(context);
      releaseScratchPose(context);
    });

    parameters.resetTriggers();
    return {
      pose: outputPose,
      rootMotion: rootMotionDelta
    };
  }

  return {
    rig: input.rig,
    graph: input.graph,
    clips,
    parameters,
    outputPose,
    rootMotionDelta,
    setFloat(name, value) {
      parameters.setFloat(name, value);
    },
    setInt(name, value) {
      parameters.setInt(name, value);
    },
    setBool(name, value) {
      parameters.setBool(name, value);
    },
    trigger(name) {
      parameters.trigger(name);
    },
    update
  };
}
