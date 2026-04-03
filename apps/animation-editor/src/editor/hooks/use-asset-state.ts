import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { importAnimationFiles, importCharacterFile, type ImportedCharacterAsset, type ImportedPreviewClip } from "../preview-assets";
import { applyImportedRig, autoBindClipNodes, reconcileImportedClips, upsertClipReferences } from "../workspace/clip-utils";
import type { EditorView } from "../workspace/editor-menubar";

const DEFAULT_ASSET_STATUS = "Import a rigged character to unlock preview and rig-aware compilation.";

export type AssetState = {
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  selectedClipId: string;
  characterSourceFile: File | null;
  assetStatus: string;
  assetError: string | null;
  importedClipsRef: React.RefObject<ImportedPreviewClip[]>;
  setSelectedClipId: (id: string) => void;
  handleCharacterImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleAnimationImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  importAnimationFileList: (files: File[]) => Promise<void>;
  updateImportedClip: (clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) => void;
  createImportedClip: (clip: ImportedPreviewClip, options?: { select?: boolean }) => void;
  deleteImportedClip: (clipId: string) => void;
  setCharacter: React.Dispatch<React.SetStateAction<ImportedCharacterAsset | null>>;
  setImportedClips: React.Dispatch<React.SetStateAction<ImportedPreviewClip[]>>;
  setCharacterSourceFile: React.Dispatch<React.SetStateAction<File | null>>;
  setAssetStatus: (status: string) => void;
  setAssetError: (error: string | null) => void;
  resetAssets: () => void;
};

export function useAssetState(store: AnimationEditorStore, setEditorView: (view: EditorView) => void): AssetState {
  const [character, setCharacter] = useState<ImportedCharacterAsset | null>(null);
  const [importedClips, setImportedClips] = useState<ImportedPreviewClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [characterSourceFile, setCharacterSourceFile] = useState<File | null>(null);
  const [assetStatus, setAssetStatus] = useState(DEFAULT_ASSET_STATUS);
  const [assetError, setAssetError] = useState<string | null>(null);
  const importedClipsRef = useRef(importedClips);
  importedClipsRef.current = importedClips;

  async function handleCharacterImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Importing character "${file.name}"...`);
      const documentClips = store.getState().document.clips;
      const nextCharacter = await importCharacterFile(file, documentClips.map((clip) => clip.id));
      const reconciledClips = reconcileImportedClips(nextCharacter.clips, documentClips);
      setCharacter({
        ...nextCharacter,
        clips: reconciledClips,
      });
      setCharacterSourceFile(file);
      setImportedClips(reconciledClips);
      applyImportedRig(store, nextCharacter.documentRig);
      upsertClipReferences(store, reconciledClips.map((clip) => clip.reference));
      autoBindClipNodes(store, reconciledClips);
      setAssetStatus(`Loaded "${file.name}" with ${nextCharacter.rig.boneNames.length} bones and ${reconciledClips.length} embedded clips.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import character.";
      setAssetError(message);
      setAssetStatus("Character import failed.");
    }
  }

  async function handleAnimationImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    await importAnimationFileList(files);
  }

  async function importAnimationFileList(files: File[]) {
    if (files.length === 0) {
      return;
    }

    if (!character) {
      setAssetError("Import a rigged character first so external animation files can be mapped onto its skeleton.");
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Importing ${files.length} animation file(s)...`);
      const documentClips = store.getState().document.clips;
      const nextClips = await importAnimationFiles(
        files,
        character.rig,
        character.skeleton,
        new Set([...documentClips.map((clip) => clip.id), ...importedClips.map((clip) => clip.id)])
      );
      const reconciledClips = reconcileImportedClips(nextClips, documentClips);
      setImportedClips((current) => {
        const merged = new Map(current.map((clip) => [clip.id, clip]));
        reconciledClips.forEach((clip) => merged.set(clip.id, clip));
        return Array.from(merged.values());
      });
      upsertClipReferences(store, reconciledClips.map((clip) => clip.reference));
      autoBindClipNodes(store, reconciledClips);
      setAssetStatus(`Imported ${reconciledClips.length} animation clip(s) from ${files.length} file(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import animation files.";
      setAssetError(message);
      setAssetStatus("Animation import failed.");
    }
  }

  function updateImportedClip(clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) {
    let nextClip: ImportedPreviewClip | null = null;
    let nextDuration: number | null = null;
    let nextName: string | null = null;
    let nextSource: string | undefined;

    setImportedClips((current) =>
      current.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        nextClip = updater(clip);
        nextDuration = nextClip.reference.duration;
        nextName = nextClip.reference.name;
        nextSource = nextClip.reference.source;
        return nextClip;
      })
    );

    setCharacter((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        clips: current.clips.map((clip) => {
          if (clip.id !== clipId) {
            return clip;
          }

          return nextClip ?? clip;
        }),
      };
    });

    if (nextDuration !== null && nextName !== null) {
      store.updateClip(clipId, {
        duration: nextDuration,
        name: nextName,
        source: nextSource,
      });
    }
  }

  function createImportedClip(clip: ImportedPreviewClip, options?: { select?: boolean }) {
    setImportedClips((current) => [...current, clip]);

    setCharacter((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        clips: [...current.clips, clip],
      };
    });

    store.addClip(clip.reference);

    if (options?.select) {
      setSelectedClipId(clip.id);
      setEditorView("clip");
    }

    setAssetError(null);
    setAssetStatus(`Created clip "${clip.name}".`);
  }

  function deleteImportedClip(clipId: string) {
    setImportedClips((current) => current.filter((clip) => clip.id !== clipId));
    setCharacter((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        clips: current.clips.filter((clip) => clip.id !== clipId),
      };
    });
    store.deleteClip(clipId);
  }

  function resetAssets() {
    setCharacter(null);
    setImportedClips([]);
    setSelectedClipId("");
    setCharacterSourceFile(null);
    setAssetError(null);
    setAssetStatus(DEFAULT_ASSET_STATUS);
    setEditorView("clip");
  }

  return {
    character,
    importedClips,
    selectedClipId,
    characterSourceFile,
    assetStatus,
    assetError,
    importedClipsRef,
    setSelectedClipId,
    handleCharacterImport,
    handleAnimationImport,
    importAnimationFileList,
    updateImportedClip,
    createImportedClip,
    deleteImportedClip,
    setCharacter,
    setImportedClips,
    setCharacterSourceFile,
    setAssetStatus,
    setAssetError,
    resetAssets,
  };
}
