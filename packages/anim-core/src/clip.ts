import { clamp, inverseLerp } from "@ggez/anim-utils";
import type { AnimationClipAsset, AnimationTrack, PoseBuffer, RigDefinition } from "./types";
import { extractRootMotionDelta, type RootMotionMode } from "./root-motion";
import { copyPose, copyRigBindPose } from "./pose-buffer";

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

function findKeyframeIndex(times: Float32Array, time: number): number {
  if (times.length <= 1) {
    return 0;
  }

  let low = 0;
  let high = times.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid]!;
    if (value <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, Math.min(times.length - 2, high));
}

function sampleScalarTriplet(times: Float32Array, values: Float32Array, time: number, out: Float32Array): void {
  if (times.length === 1) {
    out[0] = values[0]!;
    out[1] = values[1]!;
    out[2] = values[2]!;
    return;
  }

  const index = findKeyframeIndex(times, time);
  const aOffset = index * 3;
  const bOffset = (index + 1) * 3;
  const t = clamp(inverseLerp(times[index]!, times[index + 1]!, time), 0, 1);

  out[0] = values[aOffset]! + (values[bOffset]! - values[aOffset]!) * t;
  out[1] = values[aOffset + 1]! + (values[bOffset + 1]! - values[aOffset + 1]!) * t;
  out[2] = values[aOffset + 2]! + (values[bOffset + 2]! - values[aOffset + 2]!) * t;
}

function sampleQuaternion(times: Float32Array, values: Float32Array, time: number, out: Float32Array): void {
  if (times.length === 1) {
    out[0] = values[0]!;
    out[1] = values[1]!;
    out[2] = values[2]!;
    out[3] = values[3]!;
    return;
  }

  const index = findKeyframeIndex(times, time);
  const aOffset = index * 4;
  const bOffset = (index + 1) * 4;
  const t = clamp(inverseLerp(times[index]!, times[index + 1]!, time), 0, 1);

  let ax = values[aOffset]!;
  let ay = values[aOffset + 1]!;
  let az = values[aOffset + 2]!;
  let aw = values[aOffset + 3]!;
  let bx = values[bOffset]!;
  let by = values[bOffset + 1]!;
  let bz = values[bOffset + 2]!;
  let bw = values[bOffset + 3]!;

  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }

  if (dot > 0.9995) {
    out[0] = ax + (bx - ax) * t;
    out[1] = ay + (by - ay) * t;
    out[2] = az + (bz - az) * t;
    out[3] = aw + (bw - aw) * t;
    return;
  }

  const theta = Math.acos(clamp(dot, -1, 1));
  const sinTheta = Math.sin(theta) || 1;
  const ratioA = Math.sin((1 - t) * theta) / sinTheta;
  const ratioB = Math.sin(t * theta) / sinTheta;
  ax = ax * ratioA + bx * ratioB;
  ay = ay * ratioA + by * ratioB;
  az = az * ratioA + bz * ratioB;
  aw = aw * ratioA + bw * ratioB;
  const length = Math.hypot(ax, ay, az, aw) || 1;
  out[0] = ax / length;
  out[1] = ay / length;
  out[2] = az / length;
  out[3] = aw / length;
}

function sampleTrackChannel(
  track: AnimationTrack,
  time: number,
  pose: PoseBuffer
): void {
  const vecOffset = track.boneIndex * 3;
  const quatOffset = track.boneIndex * 4;

  if (track.translationTimes && track.translationValues) {
    sampleScalarTriplet(track.translationTimes, track.translationValues, time, pose.translations.subarray(vecOffset, vecOffset + 3));
  }

  if (track.rotationTimes && track.rotationValues) {
    sampleQuaternion(track.rotationTimes, track.rotationValues, time, pose.rotations.subarray(quatOffset, quatOffset + 4));
  }

  if (track.scaleTimes && track.scaleValues) {
    sampleScalarTriplet(track.scaleTimes, track.scaleValues, time, pose.scales.subarray(vecOffset, vecOffset + 3));
  }
}

export function normalizeClipTime(clip: AnimationClipAsset, time: number, loop: boolean): number {
  if (clip.duration <= 0) {
    return 0;
  }

  if (!loop) {
    return clamp(time, 0, clip.duration);
  }

  const remainder = time % clip.duration;
  return remainder < 0 ? remainder + clip.duration : remainder;
}

export function sampleClipPose(
  clip: AnimationClipAsset,
  rig: RigDefinition,
  time: number,
  out: PoseBuffer,
  loop = true
): PoseBuffer {
  copyRigBindPose(rig, out);
  const normalizedTime = normalizeClipTime(clip, time, loop);

  for (const track of clip.tracks) {
    sampleTrackChannel(track, normalizedTime, out);
  }

  return out;
}

export function sampleClipPoseOnBase(
  clip: AnimationClipAsset,
  time: number,
  basePose: PoseBuffer,
  out: PoseBuffer,
  loop = true
): PoseBuffer {
  copyPose(basePose, out);
  const normalizedTime = normalizeClipTime(clip, time, loop);

  for (const track of clip.tracks) {
    sampleTrackChannel(track, normalizedTime, out);
  }

  return out;
}

export function estimateClipDuration(clip: AnimationClipAsset): number {
  return clip.duration;
}

export function sampleClipRootMotionDelta(
  clip: AnimationClipAsset,
  rig: RigDefinition,
  previousTime: number,
  nextTime: number,
  mode: RootMotionMode
) {
  if (mode === "none" || clip.duration <= 0 || previousTime === nextTime) {
    return extractRootMotionDelta(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      mode
    );
  }

  const rootBoneIndex = clip.rootBoneIndex ?? inferMotionRootBoneIndex(clip, rig);
  const tempA = new Float32Array(4);
  const tempB = new Float32Array(4);
  const accumulated = extractRootMotionDelta(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    mode
  );
  const prevPose = {
    translations: new Float32Array(rig.boneNames.length * 3),
    rotations: new Float32Array(rig.boneNames.length * 4),
    scales: new Float32Array(rig.boneNames.length * 3),
    boneCount: rig.boneNames.length
  };
  const nextPose = {
    translations: new Float32Array(rig.boneNames.length * 3),
    rotations: new Float32Array(rig.boneNames.length * 4),
    scales: new Float32Array(rig.boneNames.length * 3),
    boneCount: rig.boneNames.length
  };
  let segmentStart = previousTime;
  let remaining = nextTime - previousTime;

  while (remaining > 1e-6) {
    const normalizedStart = normalizeClipTime(clip, segmentStart, true);
    const untilWrap = normalizedStart >= clip.duration ? clip.duration : clip.duration - normalizedStart;
    const segmentDelta = Math.min(remaining, Math.max(untilWrap, 1e-6));
    const segmentEnd = segmentStart + segmentDelta;

    // Sample with loop=false and pre-normalized times so the clip-end sample stays at
    // the final keyframe instead of wrapping back to t=0 at the loop boundary.
    const normalizedEnd = Math.min(normalizedStart + segmentDelta, clip.duration);
    sampleClipPose(clip, rig, normalizedStart, prevPose, false);
    sampleClipPose(clip, rig, normalizedEnd, nextPose, false);

    const prevTranslationOffset = rootBoneIndex * 3;
    const nextTranslationOffset = rootBoneIndex * 3;
    const prevRotationOffset = rootBoneIndex * 4;
    const nextRotationOffset = rootBoneIndex * 4;

    tempA.set(prevPose.rotations.subarray(prevRotationOffset, prevRotationOffset + 4));
    tempB.set(nextPose.rotations.subarray(nextRotationOffset, nextRotationOffset + 4));

    const segmentMotion = extractRootMotionDelta(
      {
        x: prevPose.translations[prevTranslationOffset]!,
        y: prevPose.translations[prevTranslationOffset + 1]!,
        z: prevPose.translations[prevTranslationOffset + 2]!
      },
      {
        x: tempA[0]!,
        y: tempA[1]!,
        z: tempA[2]!,
        w: tempA[3]!
      },
      {
        x: nextPose.translations[nextTranslationOffset]!,
        y: nextPose.translations[nextTranslationOffset + 1]!,
        z: nextPose.translations[nextTranslationOffset + 2]!
      },
      {
        x: tempB[0]!,
        y: tempB[1]!,
        z: tempB[2]!,
        w: tempB[3]!
      },
      mode
    );

    accumulated.translation[0] += segmentMotion.translation[0]!;
    accumulated.translation[1] += segmentMotion.translation[1]!;
    accumulated.translation[2] += segmentMotion.translation[2]!;
    accumulated.yaw += segmentMotion.yaw;

    segmentStart = segmentEnd;
    remaining -= segmentDelta;
  }

  return accumulated;
}
