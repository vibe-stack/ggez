import type { AnimationClipAsset } from "@ggez/anim-core";
import {
  parseAnimationEditorDocument,
  type AnimationEditorDocument,
  type SerializableClip
} from "@ggez/anim-schema";
import type { EquipmentBundle } from "./character-equipment";

const PROJECT_BUNDLE_FORMAT = "ggez.animation.editor.project";
const PROJECT_BUNDLE_VERSION = 1;

type EncodedFile = {
  name: string;
  type: string;
  dataBase64: string;
};

type AnimationEditorProjectBundle = {
  format: typeof PROJECT_BUNDLE_FORMAT;
  version: typeof PROJECT_BUNDLE_VERSION;
  document: AnimationEditorDocument;
  assets: {
    characterFile?: EncodedFile;
    clips: SerializableClip[];
    // Equipment GLB files encoded as base64 alongside the character file
    equipmentFiles?: Array<{ id: string } & EncodedFile>;
  };
  // Optional editor extensions — missing in older bundles, always handled gracefully
  extension?: {
    equipment?: EquipmentBundle;
  };
};

export async function createProjectBundleJson(input: {
  document: AnimationEditorDocument;
  characterFile?: File | null;
  clips: AnimationClipAsset[];
  equipmentBundle?: EquipmentBundle;
  equipmentFiles?: Array<{ id: string; file: File }>;
}): Promise<string> {
  const equipmentFilesEncoded =
    input.equipmentFiles && input.equipmentFiles.length > 0
      ? await Promise.all(
          input.equipmentFiles.map(async ({ id, file }) => ({
            id,
            ...(await encodeFile(file)),
          }))
        )
      : undefined;

  const bundle: AnimationEditorProjectBundle = {
    format: PROJECT_BUNDLE_FORMAT,
    version: PROJECT_BUNDLE_VERSION,
    document: structuredClone(input.document),
    assets: {
      characterFile: input.characterFile ? await encodeFile(input.characterFile) : undefined,
      clips: input.clips.map(serializeClip),
      equipmentFiles: equipmentFilesEncoded,
    },
    extension: input.equipmentBundle
      ? { equipment: input.equipmentBundle }
      : undefined,
  };

  return JSON.stringify(bundle, null, 2);
}

export async function parseProjectBundleJson(json: string): Promise<{
  document: AnimationEditorDocument;
  characterFile: File | null;
  clips: AnimationClipAsset[];
  equipmentBundle: EquipmentBundle | null;
  equipmentFiles: Array<{ id: string; file: File }>;
}> {
  const raw = JSON.parse(json) as Partial<AnimationEditorProjectBundle>;

  if (raw.format !== PROJECT_BUNDLE_FORMAT || raw.version !== PROJECT_BUNDLE_VERSION) {
    throw new Error("Unsupported animation editor project bundle.");
  }

  const document = parseAnimationEditorDocument(raw.document);
  const characterFile = raw.assets?.characterFile ? await decodeFile(raw.assets.characterFile) : null;
  const clips = Array.isArray(raw.assets?.clips) ? raw.assets.clips.map(deserializeClip) : [];

  const equipmentFiles = raw.assets?.equipmentFiles
    ? await Promise.all(
        raw.assets.equipmentFiles.map(async (ef) => ({
          id: ef.id,
          file: await decodeFile(ef),
        }))
      )
    : [];

  const equipmentBundle = raw.extension?.equipment ?? null;

  return {
    document,
    characterFile,
    clips,
    equipmentBundle,
    equipmentFiles,
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

function deserializeClip(clip: SerializableClip): AnimationClipAsset {
  return {
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
  };
}

async function encodeFile(file: File): Promise<EncodedFile> {
  const buffer = await file.arrayBuffer();
  return {
    name: file.name,
    type: file.type,
    dataBase64: uint8ArrayToBase64(new Uint8Array(buffer))
  };
}

async function decodeFile(file: EncodedFile): Promise<File> {
  const bytes = base64ToUint8Array(file.dataBase64);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], file.name, { type: file.type });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32768;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}