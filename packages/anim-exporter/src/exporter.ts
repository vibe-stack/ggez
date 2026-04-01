import { createRigDefinition } from "@ggez/anim-core";
import type { AnimationClipAsset, RigDefinition } from "@ggez/anim-core";
import {
  ANIMATION_ARTIFACT_FORMAT,
  ANIMATION_ARTIFACT_VERSION,
  ANIMATION_BUNDLE_FORMAT,
  ANIMATION_BUNDLE_VERSION,
  animationArtifactSchema,
  animationBundleSchema,
  type AnimationArtifact,
  type AnimationBundle,
  type AnimationBundleClip,
  type AnimationBundleEquipment,
  type CompiledAnimatorGraph,
  type SerializableClip,
  type SerializableRig
} from "@ggez/anim-schema";

function serializeRig(rig: RigDefinition): SerializableRig {
  return {
    boneNames: [...rig.boneNames],
    parentIndices: Array.from(rig.parentIndices),
    rootBoneIndex: rig.rootBoneIndex,
    bindTranslations: Array.from(rig.bindTranslations),
    bindRotations: Array.from(rig.bindRotations),
    bindScales: Array.from(rig.bindScales)
  };
}

function serializeClip(clip: AnimationClipAsset): SerializableClip {
  return {
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    rootBoneIndex: clip.rootBoneIndex,
    tracks: clip.tracks.map((track) => ({
      boneIndex: track.boneIndex,
      translationTimes: track.translationTimes ? Array.from(track.translationTimes) : undefined,
      translationValues: track.translationValues ? Array.from(track.translationValues) : undefined,
      rotationTimes: track.rotationTimes ? Array.from(track.rotationTimes) : undefined,
      rotationValues: track.rotationValues ? Array.from(track.rotationValues) : undefined,
      scaleTimes: track.scaleTimes ? Array.from(track.scaleTimes) : undefined,
      scaleValues: track.scaleValues ? Array.from(track.scaleValues) : undefined
    }))
  };
}

export function createAnimationArtifact(input: {
  graph: CompiledAnimatorGraph;
  rig?: RigDefinition;
  clips?: AnimationClipAsset[];
}): AnimationArtifact {
  return {
    format: ANIMATION_ARTIFACT_FORMAT,
    version: ANIMATION_ARTIFACT_VERSION,
    graph: input.graph,
    rig: input.rig ? serializeRig(input.rig) : input.graph.rig,
    clips: input.clips?.map(serializeClip) ?? []
  };
}

export function serializeAnimationArtifact(artifact: AnimationArtifact): string {
  return JSON.stringify(artifact, null, 2);
}

export function parseAnimationArtifactJson(json: string): AnimationArtifact {
  return animationArtifactSchema.parse(JSON.parse(json));
}

export function createAnimationBundle(input: {
  name: string;
  artifactPath?: string;
  characterAssetPath?: string;
  clips?: AnimationBundleClip[];
  equipment?: AnimationBundleEquipment;
}): AnimationBundle {
  const clipAssets: Record<string, string> = {};

  for (const clip of input.clips ?? []) {
    if (!clip.asset) {
      continue;
    }

    if (clip.name in clipAssets && clipAssets[clip.name] !== clip.asset) {
      throw new Error(`Animation bundle clip name "${clip.name}" is duplicated with conflicting assets.`);
    }

    clipAssets[clip.name] = clip.asset;
  }

  return {
    format: ANIMATION_BUNDLE_FORMAT,
    version: ANIMATION_BUNDLE_VERSION,
    name: input.name,
    artifact: input.artifactPath ?? "./graph.animation.json",
    characterAsset: input.characterAssetPath,
    clips: input.clips ?? [],
    clipAssets,
    equipment: input.equipment ? structuredClone(input.equipment) : undefined
  };
}

export function serializeAnimationBundle(bundle: AnimationBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseAnimationBundleJson(json: string): AnimationBundle {
  return animationBundleSchema.parse(JSON.parse(json));
}

export function loadRigFromArtifact(artifact: AnimationArtifact): RigDefinition | undefined {
  if (!artifact.rig) {
    return undefined;
  }

  return createRigDefinition({
    boneNames: artifact.rig.boneNames,
    parentIndices: artifact.rig.parentIndices,
    rootBoneIndex: artifact.rig.rootBoneIndex,
    bindTranslations: artifact.rig.bindTranslations,
    bindRotations: artifact.rig.bindRotations,
    bindScales: artifact.rig.bindScales
  });
}

export function loadClipsFromArtifact(artifact: AnimationArtifact): AnimationClipAsset[] {
  return artifact.clips.map((clip) => ({
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    rootBoneIndex: clip.rootBoneIndex,
    tracks: clip.tracks.map((track) => ({
      boneIndex: track.boneIndex,
      translationTimes: track.translationTimes ? Float32Array.from(track.translationTimes) : undefined,
      translationValues: track.translationValues ? Float32Array.from(track.translationValues) : undefined,
      rotationTimes: track.rotationTimes ? Float32Array.from(track.rotationTimes) : undefined,
      rotationValues: track.rotationValues ? Float32Array.from(track.rotationValues) : undefined,
      scaleTimes: track.scaleTimes ? Float32Array.from(track.scaleTimes) : undefined,
      scaleValues: track.scaleValues ? Float32Array.from(track.scaleValues) : undefined
    }))
  }));
}
