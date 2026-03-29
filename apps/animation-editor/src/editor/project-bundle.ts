import type { AnimationClipAsset } from "@ggez/anim-core";
import {
  parseAnimationEditorDocument,
  type AnimationEditorDocument,
  type SerializableClip
} from "@ggez/anim-schema";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { EquipmentBundle } from "./character-equipment";

const PROJECT_BUNDLE_FORMAT = "ggez.animation.editor.project";
const PROJECT_BUNDLE_LEGACY_VERSION = 1;
const PROJECT_BUNDLE_VERSION = 2;
const PROJECT_BUNDLE_MANIFEST_PATH = "project.ggezanimproj.json";

type EncodedFile = {
  name: string;
  type: string;
  dataBase64: string;
};

type LinkedFile = {
  name: string;
  path: string;
  type: string;
};

type LegacyAnimationEditorProjectBundle = {
  format: typeof PROJECT_BUNDLE_FORMAT;
  version: typeof PROJECT_BUNDLE_LEGACY_VERSION;
  document: AnimationEditorDocument;
  assets: {
    characterFile?: EncodedFile;
    clips: SerializableClip[];
    equipmentFiles?: Array<{ id: string } & EncodedFile>;
  };
  extension?: {
    equipment?: EquipmentBundle;
  };
};

type AnimationEditorProjectBundle = {
  format: typeof PROJECT_BUNDLE_FORMAT;
  version: typeof PROJECT_BUNDLE_VERSION;
  document: AnimationEditorDocument;
  assets: {
    characterFile?: LinkedFile;
    clips: SerializableClip[];
    equipmentFiles?: Array<{ id: string } & LinkedFile>;
  };
  extension?: {
    equipment?: EquipmentBundle;
  };
};

export type ParsedProjectBundle = {
  document: AnimationEditorDocument;
  characterFile: File | null;
  clips: AnimationClipAsset[];
  equipmentBundle: EquipmentBundle | null;
  equipmentFiles: Array<{ id: string; file: File }>;
};

export async function createProjectBundleArchive(input: {
  document: AnimationEditorDocument;
  characterFile?: File | null;
  clips: AnimationClipAsset[];
  equipmentBundle?: EquipmentBundle;
  equipmentFiles?: Array<{ id: string; file: File }>;
}): Promise<Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const assetPathsByFile = new Map<File, string>();
  const usedAssetPaths = new Set<string>();

  const reserveAssetPath = (file: File, preferredBaseName?: string) => {
    const existingPath = assetPathsByFile.get(file);
    if (existingPath) {
      return existingPath;
    }

    const extension = getFileExtension(file.name);
    const baseName = slugifySegment(preferredBaseName ?? getFileStem(file.name));
    const relativePath = makeUniquePath(`assets/${baseName}${extension}`, usedAssetPaths);
    assetPathsByFile.set(file, relativePath);
    return relativePath;
  };

  const characterFile = input.characterFile
    ? createLinkedFile(input.characterFile, reserveAssetPath(input.characterFile, `character-${getFileStem(input.characterFile.name)}`))
    : undefined;

  const equipmentFiles =
    input.equipmentFiles && input.equipmentFiles.length > 0
      ? input.equipmentFiles.map(({ id, file }) => ({
          id,
          ...createLinkedFile(file, reserveAssetPath(file, `equipment-${id}-${getFileStem(file.name)}`)),
        }))
      : undefined;

  const bundle: AnimationEditorProjectBundle = {
    format: PROJECT_BUNDLE_FORMAT,
    version: PROJECT_BUNDLE_VERSION,
    document: structuredClone(input.document),
    assets: {
      characterFile,
      clips: input.clips.map(serializeClip),
      equipmentFiles,
    },
    extension: input.equipmentBundle
      ? { equipment: input.equipmentBundle }
      : undefined,
  };

  files.set(PROJECT_BUNDLE_MANIFEST_PATH, strToU8(JSON.stringify(bundle, null, 2)));

  for (const [file, relativePath] of assetPathsByFile.entries()) {
    files.set(relativePath, new Uint8Array(await file.arrayBuffer()));
  }

  return zipSync(Object.fromEntries(files), { level: 6 });
}

export async function parseProjectBundleFile(file: File): Promise<ParsedProjectBundle> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isZipArchive(bytes)) {
    return parseProjectBundleArchive(bytes);
  }

  return parseProjectBundleJson(strFromU8(bytes));
}

export async function parseProjectBundleJson(json: string): Promise<ParsedProjectBundle> {
  return parseProjectBundleObject(JSON.parse(json) as Partial<AnimationEditorProjectBundle | LegacyAnimationEditorProjectBundle>);
}

async function parseProjectBundleArchive(bytes: Uint8Array): Promise<ParsedProjectBundle> {
  const archive = unzipSync(bytes);
  const manifestPath = findArchiveEntryPath(archive, PROJECT_BUNDLE_MANIFEST_PATH);

  if (!manifestPath) {
    throw new Error(`Project bundle is missing "${PROJECT_BUNDLE_MANIFEST_PATH}".`);
  }

  const raw = JSON.parse(strFromU8(archive[manifestPath]!)) as Partial<AnimationEditorProjectBundle | LegacyAnimationEditorProjectBundle>;
  return parseProjectBundleObject(raw, async (path, name, type) => {
    const entryPath = findArchiveEntryPath(archive, path);
    if (!entryPath) {
      throw new Error(`Project bundle is missing asset "${path}".`);
    }

    return new File([toArrayBuffer(archive[entryPath]!)], name, { type });
  });
}

async function parseProjectBundleObject(
  raw: Partial<AnimationEditorProjectBundle | LegacyAnimationEditorProjectBundle>,
  readLinkedFile?: (path: string, name: string, type: string) => Promise<File>
): Promise<ParsedProjectBundle> {
  if (raw.format !== PROJECT_BUNDLE_FORMAT) {
    throw new Error("Unsupported animation editor project bundle.");
  }

  if (raw.version === PROJECT_BUNDLE_LEGACY_VERSION) {
    return parseLegacyProjectBundle(raw as Partial<LegacyAnimationEditorProjectBundle>);
  }

  if (raw.version !== PROJECT_BUNDLE_VERSION) {
    throw new Error("Unsupported animation editor project bundle.");
  }

  if (!readLinkedFile) {
    throw new Error("Project bundle references external assets but no archive was provided.");
  }

  const document = parseAnimationEditorDocument(raw.document);
  const characterFile = raw.assets?.characterFile
    ? await readLinkedFile(raw.assets.characterFile.path, raw.assets.characterFile.name, raw.assets.characterFile.type)
    : null;
  const clips = Array.isArray(raw.assets?.clips) ? raw.assets.clips.map(deserializeClip) : [];
  const equipmentFiles = raw.assets?.equipmentFiles
    ? await Promise.all(
        raw.assets.equipmentFiles.map(async (file) => ({
          id: file.id,
          file: await readLinkedFile(file.path, file.name, file.type),
        }))
      )
    : [];

  return {
    document,
    characterFile,
    clips,
    equipmentBundle: raw.extension?.equipment ?? null,
    equipmentFiles,
  };
}

async function parseLegacyProjectBundle(raw: Partial<LegacyAnimationEditorProjectBundle>): Promise<ParsedProjectBundle> {
  const document = parseAnimationEditorDocument(raw.document);
  const characterFile = raw.assets?.characterFile ? await decodeFile(raw.assets.characterFile) : null;
  const clips = Array.isArray(raw.assets?.clips) ? raw.assets.clips.map(deserializeClip) : [];
  const equipmentFiles = raw.assets?.equipmentFiles
    ? await Promise.all(
        raw.assets.equipmentFiles.map(async (file) => ({
          id: file.id,
          file: await decodeFile(file),
        }))
      )
    : [];

  return {
    document,
    characterFile,
    clips,
    equipmentBundle: raw.extension?.equipment ?? null,
    equipmentFiles,
  };
}

function createLinkedFile(file: File, path: string): LinkedFile {
  return {
    name: file.name,
    path,
    type: file.type,
  };
}

function findArchiveEntryPath(archive: Record<string, Uint8Array>, requestedPath: string): string | null {
  const normalizedRequestedPath = normalizeArchivePath(requestedPath);

  for (const entryPath of Object.keys(archive)) {
    if (normalizeArchivePath(entryPath) === normalizedRequestedPath) {
      return entryPath;
    }
  }

  return null;
}

function normalizeArchivePath(path: string): string {
  return path.replace(/^\.?\//, "").replace(/\\/g, "/");
}

function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function slugifySegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "asset";
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? `.${extension}` : "";
}

function getFileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function makeUniquePath(basePath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }

  const extension = getFileExtension(basePath);
  const stem = extension ? basePath.slice(0, -extension.length) : basePath;
  let suffix = 2;

  while (usedPaths.has(`${stem}-${suffix}${extension}`)) {
    suffix += 1;
  }

  const nextPath = `${stem}-${suffix}${extension}`;
  usedPaths.add(nextPath);
  return nextPath;
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

async function decodeFile(file: EncodedFile): Promise<File> {
  const bytes = base64ToUint8Array(file.dataBase64);
  return new File([toArrayBuffer(bytes)], file.name, { type: file.type });
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
