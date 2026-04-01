import { createDefaultAnimationEditorDocument, type AnimationEditorStore } from "@ggez/anim-editor-core";
import { slugifyProjectName } from "@ggez/dev-sync";
import { useCallback, useState } from "react";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "../preview-assets";
import { importCharacterFile } from "../preview-assets";
import { createProjectBundleArchive, parseProjectBundleFile, type ParsedProjectBundle } from "../project-bundle";
import { createRuntimeBundleSyncResult, createRuntimeBundleZip } from "../runtime-bundle";
import { synchronizeAnimationDocument } from "../document-sync";
import type { AssetState } from "./use-asset-state";
import type { useGameConnection } from "./use-game-connection";
import type { UseEquipmentStateReturn } from "./use-equipment-state";

type DraftMetadata = {
  projectName?: string;
  projectSlug?: string;
  projectSlugDirty?: boolean;
};

type RestoreProjectOptions = {
  sourceName?: string;
  startStatus?: string;
  successStatus?: string;
};

export type ProjectOperations = {
  projectName: string;
  projectSlugDirty: boolean;
  resolvedProjectName: string;
  resolvedProjectSlug: string;
  applyDraftMetadata: (metadata?: DraftMetadata) => void;
  createProjectArchive: () => Promise<Uint8Array>;
  handleNewProject: () => void;
  handleProjectNameChange: (value: string) => void;
  handleProjectSlugChange: (value: string) => void;
  handleSaveProject: () => Promise<void>;
  handleExportRuntimeBundle: () => Promise<void>;
  handlePushAnimationToGame: (options?: { gameId?: string; projectName?: string; projectSlug?: string }) => Promise<unknown>;
  handleProjectLoad: (event: React.ChangeEvent<HTMLInputElement>, assets: AssetState) => Promise<void>;
  restoreProjectBundleFile: (file: File, options?: RestoreProjectOptions) => Promise<void>;
};

export function useProjectOperations(
  store: AnimationEditorStore,
  assets: AssetState,
  equipment: UseEquipmentStateReturn,
  gameConnection: ReturnType<typeof useGameConnection>
): ProjectOperations {
  const [projectName, setProjectName] = useState(() => store.getState().document.name || "Untitled Animation");
  const [projectSlug, setProjectSlug] = useState(() => slugifyProjectName(store.getState().document.name || "Untitled Animation"));
  const [projectSlugDirty, setProjectSlugDirty] = useState(false);

  const resolvedProjectName = projectName.trim() || store.getState().document.name.trim() || "Untitled Animation";
  const resolvedProjectSlug = slugifyProjectName(projectSlug.trim() || resolvedProjectName);

  const applyDraftMetadata = useCallback((metadata?: DraftMetadata) => {
    if (!metadata) {
      return;
    }

    const nextProjectName = metadata.projectName?.trim() || store.getState().document.name || "Untitled Animation";
    const nextProjectSlug = slugifyProjectName(metadata.projectSlug?.trim() || nextProjectName);

    setProjectName(nextProjectName);
    setProjectSlug(nextProjectSlug);
    setProjectSlugDirty(Boolean(metadata.projectSlugDirty));
  }, [store]);

  const getRuntimeEquipmentFiles = useCallback(() => (
    [...equipment.filesRef.current.entries()].map(([id, file]) => ({
      id,
      file,
    }))
  ), [equipment]);

  const createProjectArchive = useCallback(async () => {
    const editorDocument = synchronizeAnimationDocument(store.getState().document, assets.importedClips);
    const equipmentFiles = getRuntimeEquipmentFiles();

    return createProjectBundleArchive({
      document: editorDocument,
      characterFile: assets.characterSourceFile,
      clips: assets.importedClips.map((clip) => clip.asset),
      equipmentBundle: equipment.getBundle(),
      equipmentFiles,
    });
  }, [assets.characterSourceFile, assets.importedClips, equipment, getRuntimeEquipmentFiles, store]);

  const handleProjectNameChange = useCallback((value: string) => {
    const previousAutoSlug = slugifyProjectName(projectName);
    setProjectName(value);

    if (!projectSlugDirty || projectSlug === previousAutoSlug) {
      setProjectSlug(slugifyProjectName(value));
      setProjectSlugDirty(false);
    }
  }, [projectName, projectSlug, projectSlugDirty]);

  const handleProjectSlugChange = useCallback((value: string) => {
    setProjectSlug(slugifyProjectName(value));
    setProjectSlugDirty(true);
  }, []);

  const handleNewProject = useCallback(() => {
    if (!window.confirm("Create a new file? The current local draft will be replaced.")) {
      return;
    }

    const nextDocument = createDefaultAnimationEditorDocument();
    store.setDocument(nextDocument);
    store.clearHistory();
    assets.resetAssets();
    equipment.resetEquipment();
    setProjectName(nextDocument.name || "Untitled Animation");
    setProjectSlug(slugifyProjectName(nextDocument.name || "Untitled Animation"));
    setProjectSlugDirty(false);
  }, [assets, equipment, store]);

  const restoreProjectBundleFile = useCallback(async (file: File, options?: RestoreProjectOptions) => {
    try {
      assets.setAssetError(null);
      assets.setAssetStatus(options?.startStatus ?? `Loading project "${options?.sourceName ?? file.name}"...`);
      const loaded = await parseProjectBundleFile(file);
      await restoreParsedProjectBundle({
        assets,
        equipment,
        loaded,
        store
      });

      const restoredProjectName = loaded.document.name || "Untitled Animation";
      setProjectName(restoredProjectName);
      setProjectSlug(slugifyProjectName(restoredProjectName));
      setProjectSlugDirty(false);
      assets.setAssetStatus(
        options?.successStatus ??
          `Loaded project "${options?.sourceName ?? file.name}" with ${loaded.document.graphs.length} graph(s) and ${loaded.clips.length} clip asset(s).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load project bundle.";
      assets.setAssetError(message);
      assets.setAssetStatus("Project load failed.");
    }
  }, [assets, equipment, store]);

  const handleSaveProject = useCallback(async () => {
    try {
      assets.setAssetError(null);
      assets.setAssetStatus("Saving project bundle...");
      const editorDocument = synchronizeAnimationDocument(store.getState().document, assets.importedClips);
      const archive = await createProjectArchive();
      const fileName = `${editorDocument.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "animation-graph"}.ggezanimproj.zip`;
      const zipBytes = new Uint8Array(archive.byteLength);
      zipBytes.set(archive);
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      assets.setAssetStatus(`Saved project bundle as "${fileName}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save project bundle.";
      assets.setAssetError(message);
      assets.setAssetStatus("Project save failed.");
    }
  }, [assets, createProjectArchive, store]);

  const handleExportRuntimeBundle = useCallback(async () => {
    try {
      assets.setAssetError(null);
      assets.setAssetStatus("Exporting runtime bundle...");
      const result = await createRuntimeBundleZip({
        characterFile: assets.characterSourceFile,
        equipmentBundle: equipment.getBundle(),
        equipmentFiles: getRuntimeEquipmentFiles(),
        importedClips: assets.importedClips,
        sourceDocument: store.getState().document,
      });
      const zipBytes = new Uint8Array(result.bytes.byteLength);
      zipBytes.set(result.bytes);
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      assets.setAssetStatus(`Exported runtime bundle as "${result.fileName}" with folder animations/${result.folderName}/.`);
    } catch (error) {
      console.error("Runtime bundle export failed.", error);
      const message = error instanceof Error ? error.message : "Failed to export runtime bundle.";
      assets.setAssetError(message);
      assets.setAssetStatus("Runtime bundle export failed.");
    }
  }, [assets, equipment, getRuntimeEquipmentFiles, store]);

  const handlePushAnimationToGame = useCallback(async (options?: { gameId?: string; projectName?: string; projectSlug?: string }) => {
    const nextProjectName = options?.projectName?.trim() || resolvedProjectName;
    const nextProjectSlug = slugifyProjectName(
      options?.projectSlug?.trim() || options?.projectName?.trim() || resolvedProjectSlug || nextProjectName
    );

    if (options?.projectName) {
      setProjectName(nextProjectName);
      if (!options.projectSlug) {
        setProjectSlug(nextProjectSlug);
        setProjectSlugDirty(false);
      }
    }

    if (options?.projectSlug) {
      setProjectSlug(nextProjectSlug);
      setProjectSlugDirty(true);
    }

    try {
      assets.setAssetError(null);
      assets.setAssetStatus(`Pushing animation bundle to ${gameConnection.activeGame?.name ?? "connected game"}...`);
      const bundle = await createRuntimeBundleSyncResult({
        characterFile: assets.characterSourceFile,
        equipmentBundle: equipment.getBundle(),
        equipmentFiles: getRuntimeEquipmentFiles(),
        folderName: nextProjectSlug,
        importedClips: assets.importedClips,
        sourceDocument: store.getState().document,
        title: nextProjectName,
      });

      const result = await gameConnection.pushAnimation({
        bundle: { files: bundle.files },
        gameId: options?.gameId ?? gameConnection.activeGame?.id,
        metadata: { projectName: nextProjectName, projectSlug: nextProjectSlug },
      });

      assets.setAssetStatus(`Pushed animation bundle to ${result.animationPath} in ${result.game.name}.`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to push animation bundle to game.";
      assets.setAssetError(message);
      assets.setAssetStatus("Animation sync failed.");
      throw error;
    }
  }, [assets, equipment, gameConnection, getRuntimeEquipmentFiles, resolvedProjectName, resolvedProjectSlug, store]);

  const handleProjectLoad = useCallback(async (event: React.ChangeEvent<HTMLInputElement>, a: AssetState) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await restoreProjectBundleFile(file, { sourceName: file.name });
  }, [restoreProjectBundleFile]);

  return {
    applyDraftMetadata,
    createProjectArchive,
    projectName,
    projectSlugDirty,
    resolvedProjectName,
    resolvedProjectSlug,
    handleNewProject,
    handleProjectNameChange,
    handleProjectSlugChange,
    handleSaveProject,
    handleExportRuntimeBundle,
    handlePushAnimationToGame,
    handleProjectLoad,
    restoreProjectBundleFile,
  };
}

async function restoreParsedProjectBundle(input: {
  assets: AssetState;
  equipment: UseEquipmentStateReturn;
  loaded: ParsedProjectBundle;
  store: AnimationEditorStore;
}) {
  const { assets, equipment, loaded, store } = input;
  store.setDocument(loaded.document);

  const clipReferencesById = new Map(loaded.document.clips.map((clip) => [clip.id, clip]));
  let nextCharacter: ImportedCharacterAsset | null = null;

  if (loaded.characterFile) {
    const importedCharacter = await importCharacterFile(loaded.characterFile, []);
    nextCharacter = {
      ...importedCharacter,
      documentRig: loaded.document.rig ?? importedCharacter.documentRig,
      clips: [],
    };
  }

  const restoredClips: ImportedPreviewClip[] = loaded.clips.map((asset) => {
    const reference = clipReferencesById.get(asset.id) ?? {
      id: asset.id,
      name: asset.name,
      duration: asset.duration,
      source: undefined,
    };

    return {
      id: asset.id,
      name: reference.name,
      duration: reference.duration,
      source: reference.source ?? "project-bundle",
      asset,
      reference,
    };
  });

  if (nextCharacter) {
    nextCharacter = { ...nextCharacter, clips: restoredClips };
  }

  assets.setCharacter(nextCharacter);
  assets.setCharacterSourceFile(loaded.characterFile);
  assets.setImportedClips(restoredClips);

  if (loaded.equipmentBundle) {
    equipment.restoreFromBundle(loaded.equipmentBundle, loaded.equipmentFiles);
  } else {
    equipment.restoreFromBundle({ sockets: [], items: [] }, []);
  }
}
