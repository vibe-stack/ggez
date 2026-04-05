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

const CLIP_DATA_MAGIC = new Uint8Array([0x47, 0x47, 0x45, 0x5a, 0x43, 0x4c, 0x49, 0x50]);
const CLIP_DATA_VERSION = 1;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getStringSize(value: string): number {
  return 4 + textEncoder.encode(value).length;
}

function getFloat32ArraySize(values: Float32Array | undefined): number {
  return 4 + ((values?.length ?? 0) * 4);
}

function getTrackBinarySize(track: AnimationClipAsset["tracks"][number]): number {
  let size = 5;

  if (track.translationTimes && track.translationValues) {
    size += getFloat32ArraySize(track.translationTimes);
    size += getFloat32ArraySize(track.translationValues);
  }

  if (track.rotationTimes && track.rotationValues) {
    size += getFloat32ArraySize(track.rotationTimes);
    size += getFloat32ArraySize(track.rotationValues);
  }

  if (track.scaleTimes && track.scaleValues) {
    size += getFloat32ArraySize(track.scaleTimes);
    size += getFloat32ArraySize(track.scaleValues);
  }

  return size;
}

function getClipBinarySize(clip: AnimationClipAsset): number {
  return 4 + getStringSize(clip.id) + getStringSize(clip.name) + 4 + 4 + 4 + clip.tracks.reduce((sum, track) => sum + getTrackBinarySize(track), 0);
}

function writeString(view: DataView, bytes: Uint8Array, offset: number, value: string): number {
  const encoded = textEncoder.encode(value);
  view.setUint32(offset, encoded.length, true);
  offset += 4;
  bytes.set(encoded, offset);
  return offset + encoded.length;
}

function writeFloat32Array(view: DataView, offset: number, values: Float32Array | undefined): number {
  const length = values?.length ?? 0;
  view.setUint32(offset, length, true);
  offset += 4;

  if (!values) {
    return offset;
  }

  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(offset, values[index]!, true);
    offset += 4;
  }

  return offset;
}

function readString(view: DataView, bytes: Uint8Array, offset: number): [string, number] {
  const length = view.getUint32(offset, true);
  offset += 4;
  const value = textDecoder.decode(bytes.subarray(offset, offset + length));
  return [value, offset + length];
}

function readFloat32Array(view: DataView, offset: number): [Float32Array | undefined, number] {
  const length = view.getUint32(offset, true);
  offset += 4;

  if (length === 0) {
    return [undefined, offset];
  }

  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = view.getFloat32(offset, true);
    offset += 4;
  }

  return [values, offset];
}

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
  clipDataPath?: string;
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
    clipData: input.clipDataPath,
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

export function serializeClipDataBinary(clips: AnimationClipAsset[]): Uint8Array {
  const totalSize = CLIP_DATA_MAGIC.length + 4 + 4 + clips.reduce((sum, clip) => sum + getClipBinarySize(clip), 0);
  const bytes = new Uint8Array(totalSize);
  bytes.set(CLIP_DATA_MAGIC, 0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = CLIP_DATA_MAGIC.length;
  view.setUint32(offset, CLIP_DATA_VERSION, true);
  offset += 4;
  view.setUint32(offset, clips.length, true);
  offset += 4;

  for (const clip of clips) {
    offset = writeString(view, bytes, offset, clip.id);
    offset = writeString(view, bytes, offset, clip.name);
    view.setFloat32(offset, clip.duration, true);
    offset += 4;
    view.setInt32(offset, clip.rootBoneIndex ?? -1, true);
    offset += 4;
    view.setUint32(offset, clip.tracks.length, true);
    offset += 4;

    for (const track of clip.tracks) {
      view.setUint32(offset, track.boneIndex, true);
      offset += 4;
      let mask = 0;
      if (track.translationTimes && track.translationValues) {
        mask |= 1;
      }
      if (track.rotationTimes && track.rotationValues) {
        mask |= 2;
      }
      if (track.scaleTimes && track.scaleValues) {
        mask |= 4;
      }
      view.setUint8(offset, mask);
      offset += 1;

      if (mask & 1) {
        offset = writeFloat32Array(view, offset, track.translationTimes);
        offset = writeFloat32Array(view, offset, track.translationValues);
      }
      if (mask & 2) {
        offset = writeFloat32Array(view, offset, track.rotationTimes);
        offset = writeFloat32Array(view, offset, track.rotationValues);
      }
      if (mask & 4) {
        offset = writeFloat32Array(view, offset, track.scaleTimes);
        offset = writeFloat32Array(view, offset, track.scaleValues);
      }
    }
  }

  return bytes;
}

export function parseClipDataBinary(bytes: Uint8Array): AnimationClipAsset[] {
  if (bytes.length < CLIP_DATA_MAGIC.length + 8) {
    throw new Error("Clip data binary is truncated.");
  }

  for (let index = 0; index < CLIP_DATA_MAGIC.length; index += 1) {
    if (bytes[index] !== CLIP_DATA_MAGIC[index]) {
      throw new Error("Clip data binary has an invalid header.");
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = CLIP_DATA_MAGIC.length;
  const version = view.getUint32(offset, true);
  offset += 4;
  if (version !== CLIP_DATA_VERSION) {
    throw new Error(`Unsupported clip data binary version ${version}.`);
  }

  const clipCount = view.getUint32(offset, true);
  offset += 4;
  const clips: AnimationClipAsset[] = [];

  for (let clipIndex = 0; clipIndex < clipCount; clipIndex += 1) {
    let id: string;
    [id, offset] = readString(view, bytes, offset);
    let name: string;
    [name, offset] = readString(view, bytes, offset);
    const duration = view.getFloat32(offset, true);
    offset += 4;
    const rootBoneIndex = view.getInt32(offset, true);
    offset += 4;
    const trackCount = view.getUint32(offset, true);
    offset += 4;
    const tracks: AnimationClipAsset["tracks"] = [];

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
      const boneIndex = view.getUint32(offset, true);
      offset += 4;
      const mask = view.getUint8(offset);
      offset += 1;
      let translationTimes: Float32Array | undefined;
      let translationValues: Float32Array | undefined;
      let rotationTimes: Float32Array | undefined;
      let rotationValues: Float32Array | undefined;
      let scaleTimes: Float32Array | undefined;
      let scaleValues: Float32Array | undefined;

      if (mask & 1) {
        [translationTimes, offset] = readFloat32Array(view, offset);
        [translationValues, offset] = readFloat32Array(view, offset);
      }
      if (mask & 2) {
        [rotationTimes, offset] = readFloat32Array(view, offset);
        [rotationValues, offset] = readFloat32Array(view, offset);
      }
      if (mask & 4) {
        [scaleTimes, offset] = readFloat32Array(view, offset);
        [scaleValues, offset] = readFloat32Array(view, offset);
      }

      tracks.push({
        boneIndex,
        translationTimes,
        translationValues,
        rotationTimes,
        rotationValues,
        scaleTimes,
        scaleValues
      });
    }

    clips.push({
      id,
      name,
      duration,
      rootBoneIndex: rootBoneIndex >= 0 ? rootBoneIndex : undefined,
      tracks
    });
  }

  return clips;
}
