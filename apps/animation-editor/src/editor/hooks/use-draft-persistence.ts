import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { useEffect, useRef, useState } from "react";
import { loadStoredAnimationEditorDraft, saveAnimationEditorDraft } from "../draft-storage";
import type { AssetState } from "./use-asset-state";
import type { ProjectOperations } from "./use-project-operations";
import type { UseEquipmentStateReturn } from "./use-equipment-state";

export function useDraftPersistence(options: {
  assets: AssetState;
  equipment: UseEquipmentStateReturn;
  project: ProjectOperations;
  store: AnimationEditorStore;
}) {
  const { assets, equipment, project, store } = options;
  const [documentRevision, setDocumentRevision] = useState(0);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const restoreDraftRef = useRef(project.restoreProjectBundleFile);
  const applyMetadataRef = useRef(project.applyDraftMetadata);
  const createArchiveRef = useRef(project.createProjectArchive);
  const persistDraftRef = useRef(async () => {});

  useEffect(() => {
    restoreDraftRef.current = project.restoreProjectBundleFile;
    applyMetadataRef.current = project.applyDraftMetadata;
    createArchiveRef.current = project.createProjectArchive;
    persistDraftRef.current = async () => {
      const archive = await createArchiveRef.current();
      await saveAnimationEditorDraft({
        archive: new Blob([toArrayBuffer(archive)], { type: "application/zip" }),
        projectName: project.projectName,
        projectSlug: project.resolvedProjectSlug,
        projectSlugDirty: project.projectSlugDirty,
        updatedAt: Date.now(),
        version: 1
      });
    };
  }, [project.applyDraftMetadata, project.createProjectArchive, project.projectName, project.projectSlugDirty, project.resolvedProjectSlug, project.restoreProjectBundleFile]);

  useEffect(() => {
    return store.subscribe(() => {
      setDocumentRevision((current) => current + 1);
    }, ["document"]);
  }, [store]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const draft = await loadStoredAnimationEditorDraft();

        if (!draft || cancelled) {
          return;
        }

        const file = new File([draft.archive], "autosave.ggezanimproj.zip", {
          type: draft.archive.type || "application/zip"
        });

        await restoreDraftRef.current(file, {
          startStatus: "Restoring local draft...",
          successStatus: "Restored local draft.",
          sourceName: "local draft"
        });
        applyMetadataRef.current({
          projectName: draft.projectName,
          projectSlug: draft.projectSlug,
          projectSlugDirty: draft.projectSlugDirty
        });
      } catch (error) {
        console.warn("Failed to restore the Animation Studio draft.", error);
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistDraftRef.current().catch((error) => {
        console.warn("Failed to save the Animation Studio draft.", error);
      });
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    assets.characterSourceFile,
    assets.importedClips,
    documentRevision,
    draftHydrated,
    equipment.items,
    equipment.sockets,
    project.projectName,
    project.projectSlugDirty,
    project.resolvedProjectSlug
  ]);

  useEffect(() => {
    return () => {
      if (!draftHydrated) {
        return;
      }

      void persistDraftRef.current().catch((error) => {
        console.warn("Failed to flush the Animation Studio draft on unload.", error);
      });
    };
  }, [draftHydrated]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}