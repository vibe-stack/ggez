import type { AnimationClipAsset, BoneMask, RootMotionDelta } from "@ggez/anim-core";
import type { CompiledAnimatorGraph } from "@ggez/anim-schema";
import type { PoseBuffer } from "@ggez/anim-core";
import type { EvaluationContext } from "./types";

export function createMasks(graph: CompiledAnimatorGraph): BoneMask[] {
  return graph.masks.map((mask) => ({ weights: Float32Array.from(mask.weights) }));
}

export function createClipsBySlot(graph: CompiledAnimatorGraph, clips: AnimationClipAsset[]): AnimationClipAsset[] {
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));

  return graph.clipSlots.map((slot) => {
    const clip = clipMap.get(slot.id);
    if (!clip) {
      throw new Error(`Missing clip asset for slot "${slot.id}".`);
    }
    return clip;
  });
}

export function ensureScratchPose(context: EvaluationContext): PoseBuffer {
  const pose = context.poseScratch[context.poseScratchIndex];
  if (!pose) {
    throw new Error("Animation runtime pose scratch exhausted.");
  }

  context.poseScratchIndex += 1;
  return pose;
}

export function releaseScratchPose(context: EvaluationContext): void {
  context.poseScratchIndex -= 1;
}

export function ensureScratchMotion(context: EvaluationContext): RootMotionDelta {
  const delta = context.motionScratch[context.motionScratchIndex];
  if (!delta) {
    throw new Error("Animation runtime root motion scratch exhausted.");
  }

  context.motionScratchIndex += 1;
  return delta;
}

export function releaseScratchMotion(context: EvaluationContext): void {
  context.motionScratchIndex -= 1;
}

export function resetRootMotion(out: RootMotionDelta): RootMotionDelta {
  out.translation[0] = 0;
  out.translation[1] = 0;
  out.translation[2] = 0;
  out.yaw = 0;
  return out;
}

export function copyRootMotion(source: RootMotionDelta, out: RootMotionDelta): RootMotionDelta {
  out.translation[0] = source.translation[0];
  out.translation[1] = source.translation[1];
  out.translation[2] = source.translation[2];
  out.yaw = source.yaw;
  return out;
}