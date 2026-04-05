import { blendPoses, copyPose } from "@ggez/anim-core";
import type { PoseBuffer } from "@ggez/anim-core";
import type { CompiledSecondaryDynamicsNode } from "@ggez/anim-schema";
import type { EvaluationContext, SecondaryDynamicsChainRuntimeState } from "./types";

const EPSILON = 1e-5;
const WORLD_GRAVITY = 9.81;
const MAX_ROOT_ROTATION_DELTA = 1.2;

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

function quatFromYaw(yaw: number): [number, number, number, number] {
  const halfAngle = yaw * 0.5;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

function clampDirectionToCone(
  direction: [number, number, number],
  targetDirection: [number, number, number],
  maxAngleRadians: number
): [number, number, number] {
  const cosAngle = clamp(dot(direction[0], direction[1], direction[2], targetDirection[0], targetDirection[1], targetDirection[2]), -1, 1);
  const angle = Math.acos(cosAngle);
  if (angle <= maxAngleRadians) {
    return direction;
  }

  const orthoX = direction[0] - targetDirection[0] * cosAngle;
  const orthoY = direction[1] - targetDirection[1] * cosAngle;
  const orthoZ = direction[2] - targetDirection[2] * cosAngle;
  const ortho = normalize(orthoX, orthoY, orthoZ);
  const sinLimit = Math.sin(maxAngleRadians);
  const cosLimit = Math.cos(maxAngleRadians);
  return normalize(
    targetDirection[0] * cosLimit + ortho[0] * sinLimit,
    targetDirection[1] * cosLimit + ortho[1] * sinLimit,
    targetDirection[2] * cosLimit + ortho[2] * sinLimit
  );
}

function quaternionAngleRadians(x: number, y: number, z: number, w: number): number {
  const clampedW = clamp(w, -1, 1);
  const angle = 2 * Math.acos(Math.abs(clampedW));
  return Number.isFinite(angle) ? angle : 0;
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
  sourceWorldRotations: Float32Array,
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
  const rootRotationOffset = boneIndices[0]! * 4;
  state.previousRootRotation[0] = sourceWorldRotations[rootRotationOffset] ?? 0;
  state.previousRootRotation[1] = sourceWorldRotations[rootRotationOffset + 1] ?? 0;
  state.previousRootRotation[2] = sourceWorldRotations[rootRotationOffset + 2] ?? 0;
  state.previousRootRotation[3] = sourceWorldRotations[rootRotationOffset + 3] ?? 1;
  state.initialized = true;
}

function projectChainOutsideSpheres(
  positions: Float32Array,
  jointCount: number,
  particleRadius: number,
  colliders: Array<{ centerX: number; centerY: number; centerZ: number; radius: number }>
): void {
  for (let jointIndex = 1; jointIndex < jointCount; jointIndex += 1) {
    const jointOffset = jointIndex * 3;
    let pointX = positions[jointOffset] ?? 0;
    let pointY = positions[jointOffset + 1] ?? 0;
    let pointZ = positions[jointOffset + 2] ?? 0;

    colliders.forEach((collider) => {
      const pushX = pointX - collider.centerX;
      const pushY = pointY - collider.centerY;
      const pushZ = pointZ - collider.centerZ;
      const pushLength = length(pushX, pushY, pushZ);
      const minDistance = collider.radius + particleRadius;
      if (pushLength < minDistance) {
        const normal = pushLength <= EPSILON ? [0, 1, 0] as [number, number, number] : [pushX / pushLength, pushY / pushLength, pushZ / pushLength] as [number, number, number];
        pointX = collider.centerX + normal[0] * minDistance;
        pointY = collider.centerY + normal[1] * minDistance;
        pointZ = collider.centerZ + normal[2] * minDistance;
      }
    });

    writeVec3(positions, jointOffset, pointX, pointY, pointZ);
  }
}

function carryChainWithRootMotion(
  state: SecondaryDynamicsChainRuntimeState,
  jointCount: number,
  previousRootX: number,
  previousRootY: number,
  previousRootZ: number,
  rootX: number,
  rootY: number,
  rootZ: number,
  rootDeltaRotation: [number, number, number, number]
): void {
  for (let jointIndex = 1; jointIndex < jointCount; jointIndex += 1) {
    const jointOffset = jointIndex * 3;
    const currentRelative = rotateVecByQuat(
      rootDeltaRotation[0],
      rootDeltaRotation[1],
      rootDeltaRotation[2],
      rootDeltaRotation[3],
      (state.currentPositions[jointOffset] ?? 0) - previousRootX,
      (state.currentPositions[jointOffset + 1] ?? 0) - previousRootY,
      (state.currentPositions[jointOffset + 2] ?? 0) - previousRootZ
    );
    const previousRelative = rotateVecByQuat(
      rootDeltaRotation[0],
      rootDeltaRotation[1],
      rootDeltaRotation[2],
      rootDeltaRotation[3],
      (state.previousPositions[jointOffset] ?? 0) - previousRootX,
      (state.previousPositions[jointOffset + 1] ?? 0) - previousRootY,
      (state.previousPositions[jointOffset + 2] ?? 0) - previousRootZ
    );

    writeVec3(
      state.currentPositions,
      jointOffset,
      rootX + currentRelative[0],
      rootY + currentRelative[1],
      rootZ + currentRelative[2]
    );
    writeVec3(
      state.previousPositions,
      jointOffset,
      rootX + previousRelative[0],
      rootY + previousRelative[1],
      rootZ + previousRelative[2]
    );
  }

  writeVec3(state.currentPositions, 0, rootX, rootY, rootZ);
  writeVec3(state.previousPositions, 0, rootX, rootY, rootZ);
}

function sumLengths(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
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

    const particleRadius = Math.max(0.01, Math.min(...chain.restLengths) * 0.35);
    const totalChainLength = sumLengths(chain.restLengths);

    if (!state.initialized) {
      initializeChainState(state, sourceWorldPositions, sourceWorldRotations, chain.boneIndices);
      projectChainOutsideSpheres(state.currentPositions, chain.boneIndices.length, particleRadius, colliderCenters);
      state.previousPositions.set(state.currentPositions);
    }

    const rootBoneIndex = chain.boneIndices[0]!;
    const rootSourceOffset = rootBoneIndex * 3;
    const rootRotationOffset = rootBoneIndex * 4;
    const rootX = sourceWorldPositions[rootSourceOffset] ?? 0;
    const rootY = sourceWorldPositions[rootSourceOffset + 1] ?? 0;
    const rootZ = sourceWorldPositions[rootSourceOffset + 2] ?? 0;
    const previousRootX = state.previousRootPosition[0] ?? rootX;
    const previousRootY = state.previousRootPosition[1] ?? rootY;
    const previousRootZ = state.previousRootPosition[2] ?? rootZ;
    const rootDeltaPositionWorld = [
      rootX - previousRootX,
      rootY - previousRootY,
      rootZ - previousRootZ,
    ] as [number, number, number];
    const rootDeltaDistance = length(rootDeltaPositionWorld[0], rootDeltaPositionWorld[1], rootDeltaPositionWorld[2]);
    const currentRootQuat = readQuat(sourceWorldRotations, rootRotationOffset);
    const previousRootQuat = [
      state.previousRootRotation[0] ?? 0,
      state.previousRootRotation[1] ?? 0,
      state.previousRootRotation[2] ?? 0,
      state.previousRootRotation[3] ?? 1,
    ] as [number, number, number, number];
    const poseRootDeltaRotation = multiplyQuat(
      currentRootQuat[0],
      currentRootQuat[1],
      currentRootQuat[2],
      currentRootQuat[3],
      ...invertQuat(previousRootQuat[0], previousRootQuat[1], previousRootQuat[2], previousRootQuat[3])
    );
    const rootDeltaRotationRaw = poseRootDeltaRotation;
    const rootDeltaRotation = quaternionAngleRadians(
      rootDeltaRotationRaw[0],
      rootDeltaRotationRaw[1],
      rootDeltaRotationRaw[2],
      rootDeltaRotationRaw[3]
    ) > MAX_ROOT_ROTATION_DELTA
      ? [0, 0, 0, 1] as [number, number, number, number]
      : rootDeltaRotationRaw;
    const teleportDistanceThreshold = Math.max(totalChainLength * 0.35, 0.08);
    const suppressImpulse = deltaTime <= EPSILON || rootDeltaDistance > teleportDistanceThreshold;
    const carriedRotation = suppressImpulse ? [0, 0, 0, 1] as [number, number, number, number] : rootDeltaRotation;

    carryChainWithRootMotion(
      state,
      chain.boneIndices.length,
      previousRootX,
      previousRootY,
      previousRootZ,
      rootX,
      rootY,
      rootZ,
      carriedRotation
    );

    if (suppressImpulse) {
      state.previousPositions.set(state.currentPositions);
    }

    state.previousRootPosition[0] = rootX;
    state.previousRootPosition[1] = rootY;
    state.previousRootPosition[2] = rootZ;
    state.previousRootRotation[0] = currentRootQuat[0];
    state.previousRootRotation[1] = currentRootQuat[1];
    state.previousRootRotation[2] = currentRootQuat[2];
    state.previousRootRotation[3] = currentRootQuat[3];

    const authoredDamping = chain.damping + (node.dampingScale > 1 ? node.dampingScale - 1 : 0);
    const authoredStiffness = chain.stiffness + (node.stiffnessScale > 1 ? node.stiffnessScale - 1 : 0);
    const authoredGravityScale = chain.gravityScale + (node.gravityScale > 1 ? node.gravityScale - 1 : 0);
    const damping = clamp(authoredDamping, 0, 0.999);
    const stiffness = clamp(authoredStiffness, 0, 1);
    const safeDeltaTime = Math.max(deltaTime, 0);
    const velocityRetention = safeDeltaTime > EPSILON ? Math.exp(-damping * safeDeltaTime * 7) : 1;
    const followAlpha = safeDeltaTime > EPSILON ? 1 - Math.exp(-stiffness * safeDeltaTime * 10) : 0;
    const gravity = WORLD_GRAVITY * Math.max(0, authoredGravityScale) * safeDeltaTime * safeDeltaTime * 0.35;
    const currentRootInverse = invertQuat(currentRootQuat[0], currentRootQuat[1], currentRootQuat[2], currentRootQuat[3]);
    const rootDeltaLocal = rotateVecByQuat(
      currentRootInverse[0],
      currentRootInverse[1],
      currentRootInverse[2],
      currentRootInverse[3],
      rootDeltaPositionWorld[0],
      rootDeltaPositionWorld[1],
      rootDeltaPositionWorld[2]
    );
    const dragWorld = suppressImpulse
      ? [0, 0, 0] as [number, number, number]
      : rotateVecByQuat(
          currentRootQuat[0],
          currentRootQuat[1],
          currentRootQuat[2],
          currentRootQuat[3],
          -rootDeltaLocal[0] * chain.inertia.x * 2.2,
          -rootDeltaLocal[1] * chain.inertia.y * 2.2,
          -rootDeltaLocal[2] * chain.inertia.z * 2.2
        );

    for (let jointIndex = 1; jointIndex < chain.boneIndices.length; jointIndex += 1) {
      const jointOffset = jointIndex * 3;
      const currentX = state.currentPositions[jointOffset] ?? 0;
      const currentY = state.currentPositions[jointOffset + 1] ?? 0;
      const currentZ = state.currentPositions[jointOffset + 2] ?? 0;
      const previousX = state.previousPositions[jointOffset] ?? currentX;
      const previousY = state.previousPositions[jointOffset + 1] ?? currentY;
      const previousZ = state.previousPositions[jointOffset + 2] ?? currentZ;
      const velocityX = (currentX - previousX) * velocityRetention;
      const velocityY = (currentY - previousY) * velocityRetention;
      const velocityZ = (currentZ - previousZ) * velocityRetention;

      const nextX = currentX + velocityX + dragWorld[0];
      const nextY = currentY + velocityY + dragWorld[1] - gravity;
      const nextZ = currentZ + velocityZ + dragWorld[2];
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
        const parentBoneIndex = chain.boneIndices[segmentIndex]!;
        const childBoneIndex = chain.boneIndices[segmentIndex + 1]!;
        const parentSourceOffset = parentBoneIndex * 3;
        const childSourceOffset = childBoneIndex * 3;
        const targetDir = normalize(
          (sourceWorldPositions[childSourceOffset] ?? 0) - (sourceWorldPositions[parentSourceOffset] ?? 0),
          (sourceWorldPositions[childSourceOffset + 1] ?? 0) - (sourceWorldPositions[parentSourceOffset + 1] ?? 0),
          (sourceWorldPositions[childSourceOffset + 2] ?? 0) - (sourceWorldPositions[parentSourceOffset + 2] ?? 0)
        );

        const followedDir = followAlpha > EPSILON
          ? normalize(
              normalizedDir[0] * (1 - followAlpha) + targetDir[0] * followAlpha,
              normalizedDir[1] * (1 - followAlpha) + targetDir[1] * followAlpha,
              normalizedDir[2] * (1 - followAlpha) + targetDir[2] * followAlpha
            )
          : normalizedDir;

        const constrainedDir = chain.limitAngleRadians < Math.PI - 1e-3
          ? clampDirectionToCone(followedDir, targetDir, chain.limitAngleRadians)
          : followedDir;

        writeVec3(
          state.currentPositions,
          childOffset,
          parentX + constrainedDir[0] * restLength,
          parentY + constrainedDir[1] * restLength,
          parentZ + constrainedDir[2] * restLength
        );
      }

      projectChainOutsideSpheres(state.currentPositions, chain.boneIndices.length, particleRadius, colliderCenters);
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
