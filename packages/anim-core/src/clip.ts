import { clamp, inverseLerp } from "@ggez/anim-utils";
import type { AnimationClipAsset, AnimationTrack, PoseBuffer, RigDefinition } from "./types";
import { extractRootMotionDelta, type RootMotionMode } from "./root-motion";
import { copyPose, copyRigBindPose } from "./pose-buffer";

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
  const rootBoneIndex = clip.rootBoneIndex ?? rig.rootBoneIndex;
  const tempA = new Float32Array(4);
  const tempB = new Float32Array(4);
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
  sampleClipPose(clip, rig, previousTime, prevPose);
  sampleClipPose(clip, rig, nextTime, nextPose);

  const prevTranslationOffset = rootBoneIndex * 3;
  const nextTranslationOffset = rootBoneIndex * 3;
  const prevRotationOffset = rootBoneIndex * 4;
  const nextRotationOffset = rootBoneIndex * 4;

  tempA.set(prevPose.rotations.subarray(prevRotationOffset, prevRotationOffset + 4));
  tempB.set(nextPose.rotations.subarray(nextRotationOffset, nextRotationOffset + 4));

  return extractRootMotionDelta(
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
}
