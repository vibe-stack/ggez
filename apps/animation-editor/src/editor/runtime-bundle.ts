import { createAnimationArtifact, createAnimationBundle, serializeAnimationArtifact, serializeAnimationBundle, serializeClipDataBinary } from "@ggez/anim-exporter";
import { compileAnimationEditorDocumentOrThrow } from "@ggez/anim-compiler";
import { strToU8, zipSync } from "fflate";
import type { EquipmentBundle } from "./character-equipment";
import { synchronizeAnimationDocument } from "./document-sync";
import type { ImportedPreviewClip } from "./preview-assets";

type RuntimeBundleExportResult = {
  fileName: string;
  bytes: Uint8Array;
  folderName: string;
};

export type RuntimeBundleSyncResult = {
  files: Array<{
    bytes: number[];
    mimeType: string;
    path: string;
  }>;
  folderName: string;
};

function slugifySegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "animation";
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

async function buildZipFiles(input: {
  characterFile: File | null;
  equipmentBundle?: EquipmentBundle | null;
  equipmentFiles?: Array<{ id: string; file: File }>;
  folderName: string;
  importedClips: ImportedPreviewClip[];
  sourceDocument: unknown;
  title: string;
}) {
  const editorDocument = synchronizeAnimationDocument(input.sourceDocument, input.importedClips);
  const compiledGraph = compileAnimationEditorDocumentOrThrow(editorDocument);
  const clipsById = new Map(input.importedClips.map((clip) => [clip.id, clip]));
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

  if (input.characterFile) {
    reserveAssetPath(input.characterFile, getFileStem(input.characterFile.name));
  }

  const equipmentFilesById = new Map(
    (input.equipmentFiles ?? []).map(({ id, file }) => [id, file] as const)
  );

  for (const [itemId, file] of equipmentFilesById) {
    reserveAssetPath(file, `equipment-${itemId}-${getFileStem(file.name)}`);
  }

  const bundleClips = compiledGraph.clipSlots.map((slot) => {
    const importedClip = clipsById.get(slot.id);
    if (!importedClip) {
      throw new Error(`Compiled graph references clip "${slot.id}" but no imported animation source is available for export.`);
    }

    return {
      id: slot.id,
      name: slot.name,
      duration: slot.duration,
      source: importedClip.source
    };
  });

  const artifact = createAnimationArtifact({
    graph: compiledGraph
  });
  const clipDataPath = "./assets/graph.animation.clips.bin";
  const manifest = createAnimationBundle({
    name: input.title,
    artifactPath: "./graph.animation.json",
    characterAssetPath: input.characterFile ? `./${reserveAssetPath(input.characterFile, getFileStem(input.characterFile.name))}` : undefined,
    clipDataPath,
    clips: bundleClips,
    equipment: input.equipmentBundle
      ? {
          sockets: structuredClone(input.equipmentBundle.sockets),
          items: input.equipmentBundle.items.map((item) => {
            const file = equipmentFilesById.get(item.id);

            if (!file) {
              throw new Error(`Equipment item "${item.name}" (${item.id}) is missing its source asset file.`);
            }

            return {
              ...item,
              transform: structuredClone(item.transform),
              asset: `./${reserveAssetPath(file, `equipment-${item.id}-${getFileStem(file.name)}`)}`
            };
          })
        }
      : undefined
  });

  files.set("animation.bundle.json", strToU8(serializeAnimationBundle(manifest)));
  files.set("animation.meta.json", strToU8(JSON.stringify({
    id: input.folderName,
    title: input.title
  }, null, 2)));
  files.set("graph.animation.json", strToU8(serializeAnimationArtifact(artifact)));
  files.set(clipDataPath.replace(/^\.\//, ""), serializeClipDataBinary(bundleClips.map((bundleClip) => clipsById.get(bundleClip.id)!.asset)));
  files.set("index.ts", strToU8(createRuntimeBundleIndexModule({
    folderName: input.folderName,
    title: input.title
  })));

  const fileEntries = Array.from(assetPathsByFile.entries());
  for (const [file, relativePath] of fileEntries) {
    files.set(relativePath, new Uint8Array(await file.arrayBuffer()));
  }

  return files;
}

function getMimeType(path: string): string {
  if (path.endsWith(".ts")) {
    return "text/plain";
  }

  if (path.endsWith(".json")) {
    return "application/json";
  }

  if (path.endsWith(".glb")) {
    return "model/gltf-binary";
  }

  if (path.endsWith(".gltf")) {
    return "model/gltf+json";
  }

  return "application/octet-stream";
}

function createRuntimeBundleIndexModule(input: {
  folderName: string;
  title: string;
}) {
  return [
    'import {',
    '  createColocatedRuntimeAnimationSource,',
    '  defineGameAnimationBundle',
    '} from "../../game/runtime-animation-sources";',
    "",
    'const assetUrlLoaders = import.meta.glob("./assets/**/*", {',
    '  import: "default",',
    '  query: "?url"',
    '}) as Record<string, () => Promise<string>>;',
    "",
    "export const animationBundle = defineGameAnimationBundle({",
    `  id: ${JSON.stringify(input.folderName)},`,
    "  source: createColocatedRuntimeAnimationSource({",
    '    artifactLoader: () => import("./graph.animation.json?raw").then((module) => module.default),',
    "    assetUrlLoaders,",
    '    manifestLoader: () => import("./animation.bundle.json").then((module) => module.default)',
    "  }),",
    `  title: ${JSON.stringify(input.title)}`,
    "});",
    ""
  ].join("\n");
}

export async function createRuntimeBundleZip(input: {
  characterFile: File | null;
  equipmentBundle?: EquipmentBundle | null;
  equipmentFiles?: Array<{ id: string; file: File }>;
  importedClips: ImportedPreviewClip[];
  sourceDocument: unknown;
}): Promise<RuntimeBundleExportResult> {
  const editorDocument = synchronizeAnimationDocument(input.sourceDocument, input.importedClips);
  const folderName = slugifySegment(editorDocument.name);
  const files = await buildZipFiles({
    characterFile: input.characterFile,
    equipmentBundle: input.equipmentBundle,
    equipmentFiles: input.equipmentFiles,
    folderName,
    importedClips: input.importedClips,
    sourceDocument: editorDocument,
    title: editorDocument.name
  });

  const prefixedFiles = Object.fromEntries(
    Array.from(files.entries()).map(([path, bytes]) => [`animations/${folderName}/${path}`, bytes])
  );

  return {
    fileName: `${folderName}.ggezanim.zip`,
    bytes: zipSync(prefixedFiles, { level: 6 }),
    folderName
  };
}

export async function createRuntimeBundleSyncResult(input: {
  characterFile: File | null;
  equipmentBundle?: EquipmentBundle | null;
  equipmentFiles?: Array<{ id: string; file: File }>;
  folderName: string;
  importedClips: ImportedPreviewClip[];
  sourceDocument: unknown;
  title: string;
}): Promise<RuntimeBundleSyncResult> {
  const files = await buildZipFiles({
    characterFile: input.characterFile,
    equipmentBundle: input.equipmentBundle,
    equipmentFiles: input.equipmentFiles,
    folderName: input.folderName,
    importedClips: input.importedClips,
    sourceDocument: input.sourceDocument,
    title: input.title
  });

  return {
    files: Array.from(files.entries()).map(([path, bytes]) => ({
      bytes: Array.from(bytes),
      mimeType: getMimeType(path),
      path
    })),
    folderName: input.folderName
  };
}
