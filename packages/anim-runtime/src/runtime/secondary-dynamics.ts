import { blendPoses, copyPose } from "@ggez/anim-core";
import type { PoseBuffer } from "@ggez/anim-core";
import type { CompiledSecondaryDynamicsNode } from "@ggez/anim-schema";
import type { EvaluationContext, SecondaryDynamicsChainRuntimeState } from "./types";

const EPSILON = 1e-5;
const WORLD_GRAVITY = 9.81;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readVec3(buffer: Float32Array, offset: number): [number, number, number] {
  return [buffer[offset] ?? 0, buffer[offset + 1] ?? 0, buffer[offset + 2] ?? 0];
}

function writeVec3(buffer: Float32Array, offset: number, x: number, y: number, z: number): void {
  buffer[offset] = x;
  buffer[offset + 1] = y;
  buffer[offset + 2] = z;
}

function readQuat(buffer: Float32Array, offset: number): [number, number, number, number] {
  return [buffer[offset] ?? 0, buffer[offset + 1] ?? 0, buffer[offset + 2] ?? 0, buffer[offset + 3] ?? 1];
}

function writeQuat(buffer: Float32Array, offset: number, x: number, y: number, z: number, w: number): void {
  buffer[offset] = x;
  buffer[offset + 1] = y;
  buffer[offset + 2] = z;
  buffer[offset + 3] = w;
}

function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

function length(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z);
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = length(x, y, z);
  if (len <= EPSILON) {
    return [0, 1, 0];
  }
  return [x / len, y / len, z / len];
}

function cross(ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number] {
  return [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx
  ];
}

function normalizeQuat(x: number, y: number, z: number, w: number): [number, number, number, number] {
  const len = Math.hypot(x, y, z, w);
  if (len <= EPSILON) {
    return [0, 0, 0, 1];
  }
  return [x / len, y / len, z / len, w / len];
}

function multiplyQuat(
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

function invertQuat(x: number, y: number, z: number, w: number): [number, number, number, number] {
  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq <= EPSILON) {
    return [0, 0, 0, 1];
  }
  return [-x / lenSq, -y / lenSq, -z / lenSq, w / lenSq];
}

function rotateVecByQuat(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  vx: number,
  vy: number,
  vz: number
): [number, number, number] {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

function quatFromUnitVectors(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number
): [number, number, number, number] {
  const r = dot(fromX, fromY, fromZ, toX, toY, toZ) + 1;
  if (r < EPSILON) {
    const axis = Math.abs(fromX) > Math.abs(fromZ)
      ? normalize(-fromY, fromX, 0)
      : normalize(0, -fromZ, fromY);
    return [axis[0], axis[1], axis[2], 0];
  }

  const axis = cross(fromX, fromY, fromZ, toX, toY, toZ);
  return normalizeQuat(axis[0], axis[1], axis[2], r);
}

function computeWorldTransforms(
  context: EvaluationContext,
  pose: PoseBuffer,
  worldPositions: Float32Array,
  worldRotations: Float32Array
): void {
  for (let boneIndex = 0; boneIndex < pose.boneCount; boneIndex += 1) {
    const translationOffset = boneIndex * 3;
    const rotationOffset = boneIndex * 4;
    const parentBoneIndex = context.rig.parentIndices[boneIndex] ?? -1;

    if (parentBoneIndex < 0) {
      writeVec3(
        worldPositions,
        translationOffset,
        pose.translations[translationOffset] ?? 0,
        pose.translations[translationOffset + 1] ?? 0,
        pose.translations[translationOffset + 2] ?? 0
      );
      writeQuat(
        worldRotations,
        rotationOffset,
        pose.rotations[rotationOffset] ?? 0,
        pose.rotations[rotationOffset + 1] ?? 0,
        pose.rotations[rotationOffset + 2] ?? 0,
        pose.rotations[rotationOffset + 3] ?? 1
      );
      continue;
    }

    const parentTranslationOffset = parentBoneIndex * 3;
    const parentRotationOffset = parentBoneIndex * 4;
    const parentQuat = readQuat(worldRotations, parentRotationOffset);
    const localTranslation = readVec3(pose.translations, translationOffset);
    const rotated = rotateVecByQuat(parentQuat[0], parentQuat[1], parentQuat[2], parentQuat[3], localTranslation[0], localTranslation[1], localTranslation[2]);
    writeVec3(
      worldPositions,
      translationOffset,
      (worldPositions[parentTranslationOffset] ?? 0) + rotated[0],
      (worldPositions[parentTranslationOffset + 1] ?? 0) + rotated[1],
      (worldPositions[parentTranslationOffset + 2] ?? 0) + rotated[2]
    );

    const localQuat = readQuat(pose.rotations, rotationOffset);
    const worldQuat = multiplyQuat(parentQuat[0], parentQuat[1], parentQuat[2], parentQuat[3], localQuat[0], localQuat[1], localQuat[2], localQuat[3]);
    writeQuat(worldRotations, rotationOffset, worldQuat[0], worldQuat[1], worldQuat[2], worldQuat[3]);
  }
}

function initializeChainState(
  state: SecondaryDynamicsChainRuntimeState,
  sourceWorldPositions: Float32Array,
  boneIndices: number[]
): void {
  boneIndices.forEach((boneIndex, jointIndex) => {
    const sourceOffset = boneIndex * 3;
    const jointOffset = jointIndex * 3;
    state.currentPositions[jointOffset] = sourceWorldPositions[sourceOffset] ?? 0;
    state.currentPositions[jointOffset + 1] = sourceWorldPositions[sourceOffset + 1] ?? 0;
    state.currentPositions[jointOffset + 2] = sourceWorldPositions[sourceOffset + 2] ?? 0;
    state.previousPositions[jointOffset] = state.currentPositions[jointOffset]!;
    state.previousPositions[jointOffset + 1] = state.currentPositions[jointOffset + 1]!;
    state.previousPositions[jointOffset + 2] = state.currentPositions[jointOffset + 2]!;
  });

  state.previousRootPosition[0] = state.currentPositions[0]!;
  state.previousRootPosition[1] = state.currentPositions[1]!;
  state.previousRootPosition[2] = state.currentPositions[2]!;
  state.initialized = true;
}

export function applySecondaryDynamics(
  context: EvaluationContext,
  node: CompiledSecondaryDynamicsNode,
  sourcePose: PoseBuffer,
  outPose: PoseBuffer,
  deltaTime: number
): void {
  const profile = context.graph.dynamicsProfiles[node.profileIndex];
  if (!profile || profile.chains.length === 0) {
    copyPose(sourcePose, outPose);
    return;
  }

  copyPose(sourcePose, outPose);

  const sourceWorldPositions = new Float32Array(context.rig.boneNames.length * 3);
  const sourceWorldRotations = new Float32Array(context.rig.boneNames.length * 4);
  const dynamicWorldRotations = new Float32Array(context.rig.boneNames.length * 4);
  computeWorldTransforms(context, sourcePose, sourceWorldPositions, sourceWorldRotations);
  dynamicWorldRotations.set(sourceWorldRotations);

  const colliderCenters = profile.sphereColliders
    .filter((collider) => collider.enabled)
    .map((collider) => {
      const boneOffset = collider.boneIndex * 3;
      const rotationOffset = collider.boneIndex * 4;
      const boneQuat = readQuat(sourceWorldRotations, rotationOffset);
      const rotatedOffset = rotateVecByQuat(
        boneQuat[0],
        boneQuat[1],
        boneQuat[2],
        boneQuat[3],
        collider.offset.x,
        collider.offset.y,
        collider.offset.z
      );
      return {
        centerX: (sourceWorldPositions[boneOffset] ?? 0) + rotatedOffset[0],
        centerY: (sourceWorldPositions[boneOffset + 1] ?? 0) + rotatedOffset[1],
        centerZ: (sourceWorldPositions[boneOffset + 2] ?? 0) + rotatedOffset[2],
        radius: collider.radius
      };
    });

  const iterations = Math.max(profile.iterations, node.iterations);

  profile.chains.forEach((chain, chainIndex) => {
    if (!chain.enabled) {
      return;
    }

    const state = context.secondaryDynamicsStates[node.profileIndex]?.[chainIndex];
    if (!state) {
      return;
    }

    if (!state.initialized) {
      initializeChainState(state, sourceWorldPositions, chain.boneIndices);
    }

    const rootBoneIndex = chain.boneIndices[0]!;
    const rootSourceOffset = rootBoneIndex * 3;
    const rootX = sourceWorldPositions[rootSourceOffset] ?? 0;
    const rootY = sourceWorldPositions[rootSourceOffset + 1] ?? 0;
    const rootZ = sourceWorldPositions[rootSourceOffset + 2] ?? 0;
    const rootDeltaX = rootX - (state.previousRootPosition[0] ?? rootX);
    const rootDeltaY = rootY - (state.previousRootPosition[1] ?? rootY);
    const rootDeltaZ = rootZ - (state.previousRootPosition[2] ?? rootZ);
    state.previousRootPosition[0] = rootX;
    state.previousRootPosition[1] = rootY;
    state.previousRootPosition[2] = rootZ;

    writeVec3(state.currentPositions, 0, rootX, rootY, rootZ);
    writeVec3(state.previousPositions, 0, rootX, rootY, rootZ);

    const damping = clamp(chain.damping * node.dampingScale, 0, 0.999);
    const stiffness = clamp(chain.stiffness * node.stiffnessScale, 0, 1);
    const gravity = WORLD_GRAVITY * chain.gravityScale * node.gravityScale * Math.max(deltaTime, 1 / 120) * Math.max(deltaTime, 1 / 120);

    for (let jointIndex = 1; jointIndex < chain.boneIndices.length; jointIndex += 1) {
      const jointOffset = jointIndex * 3;
      const boneIndex = chain.boneIndices[jointIndex]!;
      const sourceOffset = boneIndex * 3;
      const currentX = state.currentPositions[jointOffset] ?? 0;
      const currentY = state.currentPositions[jointOffset + 1] ?? 0;
      const currentZ = state.currentPositions[jointOffset + 2] ?? 0;
      const previousX = state.previousPositions[jointOffset] ?? currentX;
      const previousY = state.previousPositions[jointOffset + 1] ?? currentY;
      const previousZ = state.previousPositions[jointOffset + 2] ?? currentZ;
      const targetX = sourceWorldPositions[sourceOffset] ?? currentX;
      const targetY = sourceWorldPositions[sourceOffset + 1] ?? currentY;
      const targetZ = sourceWorldPositions[sourceOffset + 2] ?? currentZ;

      const nextX = currentX + (currentX - previousX) * damping + (targetX - currentX) * stiffness + rootDeltaX * chain.inertia.x;
      const nextY = currentY + (currentY - previousY) * damping + (targetY - currentY) * stiffness + rootDeltaY * chain.inertia.y - gravity;
      const nextZ = currentZ + (currentZ - previousZ) * damping + (targetZ - currentZ) * stiffness + rootDeltaZ * chain.inertia.z;
      writeVec3(state.previousPositions, jointOffset, currentX, currentY, currentZ);
      writeVec3(state.currentPositions, jointOffset, nextX, nextY, nextZ);
    }

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      writeVec3(state.currentPositions, 0, rootX, rootY, rootZ);

      for (let segmentIndex = 0; segmentIndex < chain.restLengths.length; segmentIndex += 1) {
        const parentOffset = segmentIndex * 3;
        const childOffset = (segmentIndex + 1) * 3;
        const restLength = chain.restLengths[segmentIndex]!;
        const parentX = state.currentPositions[parentOffset] ?? 0;
        const parentY = state.currentPositions[parentOffset + 1] ?? 0;
        const parentZ = state.currentPositions[parentOffset + 2] ?? 0;
        let dirX = (state.currentPositions[childOffset] ?? 0) - parentX;
        let dirY = (state.currentPositions[childOffset + 1] ?? 0) - parentY;
        let dirZ = (state.currentPositions[childOffset + 2] ?? 0) - parentZ;
        let dirLength = length(dirX, dirY, dirZ);

        if (dirLength <= EPSILON) {
          const parentBoneIndex = chain.boneIndices[segmentIndex]!;
          const childBoneIndex = chain.boneIndices[segmentIndex + 1]!;
          const parentSourceOffset = parentBoneIndex * 3;
          const childSourceOffset = childBoneIndex * 3;
          dirX = (sourceWorldPositions[childSourceOffset] ?? 0) - (sourceWorldPositions[parentSourceOffset] ?? 0);
          dirY = (sourceWorldPositions[childSourceOffset + 1] ?? 0) - (sourceWorldPositions[parentSourceOffset + 1] ?? 0);
          dirZ = (sourceWorldPositions[childSourceOffset + 2] ?? 0) - (sourceWorldPositions[parentSourceOffset + 2] ?? 0);
          dirLength = length(dirX, dirY, dirZ);
        }

        const normalizedDir = dirLength <= EPSILON ? [0, 1, 0] as [number, number, number] : [dirX / dirLength, dirY / dirLength, dirZ / dirLength] as [number, number, number];

        if (chain.limitAngleRadians < Math.PI - 1e-3) {
          const parentBoneIndex = chain.boneIndices[segmentIndex]!;
          const childBoneIndex = chain.boneIndices[segmentIndex + 1]!;
          const parentSourceOffset = parentBoneIndex * 3;
          const childSourceOffset = childBoneIndex * 3;
          const targetDir = normalize(
            (sourceWorldPositions[childSourceOffset] ?? 0) - (sourceWorldPositions[parentSourceOffset] ?? 0),
            (sourceWorldPositions[childSourceOffset + 1] ?? 0) - (sourceWorldPositions[parentSourceOffset + 1] ?? 0),
            (sourceWorldPositions[childSourceOffset + 2] ?? 0) - (sourceWorldPositions[parentSourceOffset + 2] ?? 0)
          );
          const angle = Math.acos(clamp(dot(targetDir[0], targetDir[1], targetDir[2], normalizedDir[0], normalizedDir[1], normalizedDir[2]), -1, 1));
          if (angle > chain.limitAngleRadians) {
            const t = chain.limitAngleRadians / Math.max(angle, EPSILON);
            const limited = normalize(
              targetDir[0] * (1 - t) + normalizedDir[0] * t,
              targetDir[1] * (1 - t) + normalizedDir[1] * t,
              targetDir[2] * (1 - t) + normalizedDir[2] * t
            );
            dirX = limited[0];
            dirY = limited[1];
            dirZ = limited[2];
          } else {
            dirX = normalizedDir[0];
            dirY = normalizedDir[1];
            dirZ = normalizedDir[2];
          }
        } else {
          dirX = normalizedDir[0];
          dirY = normalizedDir[1];
          dirZ = normalizedDir[2];
        }

        writeVec3(
          state.currentPositions,
          childOffset,
          parentX + dirX * restLength,
          parentY + dirY * restLength,
          parentZ + dirZ * restLength
        );
      }

      for (let jointIndex = 1; jointIndex < chain.boneIndices.length; jointIndex += 1) {
        const jointOffset = jointIndex * 3;
        let pointX = state.currentPositions[jointOffset] ?? 0;
        let pointY = state.currentPositions[jointOffset + 1] ?? 0;
        let pointZ = state.currentPositions[jointOffset + 2] ?? 0;

        colliderCenters.forEach((collider) => {
          const pushX = pointX - collider.centerX;
          const pushY = pointY - collider.centerY;
          const pushZ = pointZ - collider.centerZ;
          const pushLength = length(pushX, pushY, pushZ);
          const minDistance = collider.radius;
          if (pushLength < minDistance) {
            const normal = pushLength <= EPSILON ? [0, 1, 0] as [number, number, number] : [pushX / pushLength, pushY / pushLength, pushZ / pushLength] as [number, number, number];
            pointX = collider.centerX + normal[0] * minDistance;
            pointY = collider.centerY + normal[1] * minDistance;
            pointZ = collider.centerZ + normal[2] * minDistance;
          }
        });

        writeVec3(state.currentPositions, jointOffset, pointX, pointY, pointZ);
      }
    }

    let lastDelta: [number, number, number, number] = [0, 0, 0, 1];

    for (let segmentIndex = 0; segmentIndex < chain.restLengths.length; segmentIndex += 1) {
      const boneIndex = chain.boneIndices[segmentIndex]!;
      const childBoneIndex = chain.boneIndices[segmentIndex + 1]!;
      const sourceBoneOffset = boneIndex * 3;
      const sourceChildOffset = childBoneIndex * 3;
      const simulatedBoneOffset = segmentIndex * 3;
      const simulatedChildOffset = (segmentIndex + 1) * 3;
      const sourceDir = normalize(
        (sourceWorldPositions[sourceChildOffset] ?? 0) - (sourceWorldPositions[sourceBoneOffset] ?? 0),
        (sourceWorldPositions[sourceChildOffset + 1] ?? 0) - (sourceWorldPositions[sourceBoneOffset + 1] ?? 0),
        (sourceWorldPositions[sourceChildOffset + 2] ?? 0) - (sourceWorldPositions[sourceBoneOffset + 2] ?? 0)
      );
      const simulatedDir = normalize(
        (state.currentPositions[simulatedChildOffset] ?? 0) - (state.currentPositions[simulatedBoneOffset] ?? 0),
        (state.currentPositions[simulatedChildOffset + 1] ?? 0) - (state.currentPositions[simulatedBoneOffset + 1] ?? 0),
        (state.currentPositions[simulatedChildOffset + 2] ?? 0) - (state.currentPositions[simulatedBoneOffset + 2] ?? 0)
      );
      const delta = quatFromUnitVectors(sourceDir[0], sourceDir[1], sourceDir[2], simulatedDir[0], simulatedDir[1], simulatedDir[2]);
      lastDelta = delta;
      const sourceWorldQuat = readQuat(sourceWorldRotations, boneIndex * 4);
      const desiredWorldQuat = multiplyQuat(delta[0], delta[1], delta[2], delta[3], sourceWorldQuat[0], sourceWorldQuat[1], sourceWorldQuat[2], sourceWorldQuat[3]);
      const parentBoneIndex = context.rig.parentIndices[boneIndex] ?? -1;
      const parentWorldQuat = parentBoneIndex >= 0 ? readQuat(dynamicWorldRotations, parentBoneIndex * 4) : [0, 0, 0, 1] as [number, number, number, number];
      const parentWorldInv = invertQuat(parentWorldQuat[0], parentWorldQuat[1], parentWorldQuat[2], parentWorldQuat[3]);
      const localQuat = multiplyQuat(
        parentWorldInv[0],
        parentWorldInv[1],
        parentWorldInv[2],
        parentWorldInv[3],
        desiredWorldQuat[0],
        desiredWorldQuat[1],
        desiredWorldQuat[2],
        desiredWorldQuat[3]
      );
      writeQuat(outPose.rotations, boneIndex * 4, localQuat[0], localQuat[1], localQuat[2], localQuat[3]);
      writeQuat(dynamicWorldRotations, boneIndex * 4, desiredWorldQuat[0], desiredWorldQuat[1], desiredWorldQuat[2], desiredWorldQuat[3]);
    }

    const tipBoneIndex = chain.boneIndices[chain.boneIndices.length - 1]!;
    const tipParentBoneIndex = context.rig.parentIndices[tipBoneIndex] ?? -1;
    const sourceTipWorldQuat = readQuat(sourceWorldRotations, tipBoneIndex * 4);
    const desiredTipWorldQuat = multiplyQuat(lastDelta[0], lastDelta[1], lastDelta[2], lastDelta[3], sourceTipWorldQuat[0], sourceTipWorldQuat[1], sourceTipWorldQuat[2], sourceTipWorldQuat[3]);
    const tipParentWorldQuat = tipParentBoneIndex >= 0 ? readQuat(dynamicWorldRotations, tipParentBoneIndex * 4) : [0, 0, 0, 1] as [number, number, number, number];
    const tipParentWorldInv = invertQuat(tipParentWorldQuat[0], tipParentWorldQuat[1], tipParentWorldQuat[2], tipParentWorldQuat[3]);
    const tipLocalQuat = multiplyQuat(tipParentWorldInv[0], tipParentWorldInv[1], tipParentWorldInv[2], tipParentWorldInv[3], desiredTipWorldQuat[0], desiredTipWorldQuat[1], desiredTipWorldQuat[2], desiredTipWorldQuat[3]);
    writeQuat(outPose.rotations, tipBoneIndex * 4, tipLocalQuat[0], tipLocalQuat[1], tipLocalQuat[2], tipLocalQuat[3]);
    writeQuat(dynamicWorldRotations, tipBoneIndex * 4, desiredTipWorldQuat[0], desiredTipWorldQuat[1], desiredTipWorldQuat[2], desiredTipWorldQuat[3]);
  });

  if (node.weight < 0.999) {
    blendPoses(sourcePose, outPose, node.weight, outPose);
  }
}
