import type { ChangeEvent, RefObject } from "react";
import {
  createDocumentSnapshotFromLegacyScene,
  createDocumentSpatialIndex,
  createSceneDocumentSnapshot,
  createSeedSceneDocument,
  parseAuthoringDocumentSnapshot,
  refreshWorldManifest,
  serializeAuthoringDocumentSnapshot,
  type AuthoringDocumentSnapshot,
  type EditorCore,
  type SceneDocumentSnapshot,
  type WorldEditorCore,
  type WorldPersistenceBundle
} from "@ggez/editor-core";
import { type RuntimeWorldBundle } from "@ggez/runtime-build";
import { isWebHammerEngineBundle } from "@ggez/three-runtime";
import { slugifyProjectName, type EditorFileMetadata } from "@ggez/dev-sync";
import { makeTransform } from "@ggez/shared";
import { createUniqueWorldDocumentId, createUniqueWorldPartitionId } from "@/app/world-document-ids";
import { projectSessionStore, RUNTIME_SYNC_DEBUG_FINGERPRINT } from "@/state/project-session-store";
import { resetAssetSessionStore } from "@/state/asset-session-store";
import { resetSceneSessionStore } from "@/state/scene-session-store";
import { resetToolSessionStore } from "@/state/tool-session-store";
import { uiStore } from "@/state/ui-store";
import type { ExportWorkerRequest, ExportWorkerResponse } from "@/app/hooks/useExportWorker";
import { useGameConnection } from "@/app/hooks/useGameConnection";

type ActiveSceneSnapshot = ReturnType<EditorCore["exportSnapshot"]> & {
  metadata: EditorFileMetadata;
};

type WorkingSetState = {
  activeDocumentId?: string;
  loadedDocumentIds: string[];
  mode: "scene" | "world";
  pinnedDocumentIds: string[];
};

export function useProjectTransferActions({
  buildActiveSceneSnapshot,
  buildWorldBundle,
  createBrush,
  downloadBinaryFile,
  downloadTextFile,
  editor,
  fileInputRef,
  gameConnection,
  resolvedProjectName,
  resolvedProjectSlug,
  runWorkerRequest,
  sceneDocumentInputRef,
  syncEditorFromWorld,
  worldEditor,
  workingSet
}: {
  buildActiveSceneSnapshot: () => ActiveSceneSnapshot;
  buildWorldBundle: () => WorldPersistenceBundle;
  createBrush: () => void;
  downloadBinaryFile: (filename: string, content: Uint8Array, type: string) => void;
  downloadTextFile: (filename: string, content: string, type: string) => void;
  editor: EditorCore;
  fileInputRef: RefObject<HTMLInputElement | null>;
  gameConnection: ReturnType<typeof useGameConnection>;
  resolvedProjectName: string;
  resolvedProjectSlug: string;
  sceneDocumentInputRef: RefObject<HTMLInputElement | null>;
  syncEditorFromWorld: (reason: string) => void;
  worldEditor: WorldEditorCore;
  workingSet: WorkingSetState;
  runWorkerRequest: (request: ExportWorkerRequest, label: string) => Promise<ExportWorkerResponse>;
}) {
  const handleProjectNameChange = (value: string) => {
    const previousAutoSlug = slugifyProjectName(projectSessionStore.projectName);
    projectSessionStore.projectName = value;

    if (!projectSessionStore.projectSlugDirty || projectSessionStore.projectSlug === previousAutoSlug) {
      projectSessionStore.projectSlug = slugifyProjectName(value);
      projectSessionStore.projectSlugDirty = false;
    }
  };

  const handleProjectSlugChange = (value: string) => {
    projectSessionStore.projectSlug = slugifyProjectName(value);
    projectSessionStore.projectSlugDirty = true;
  };

  const handleNewFile = () => {
    if (!window.confirm("Create a new file? The current local draft will be replaced.")) {
      return;
    }

    const nextSnapshot = createSceneDocumentSnapshot(createSeedSceneDocument());
    worldEditor.importLegacySnapshot(nextSnapshot, "scene:new-file");
    syncEditorFromWorld("scene:new-file");
    editor.commands.clear();

    projectSessionStore.projectName = "Untitled Scene";
    projectSessionStore.projectSlug = "untitled-scene";
    projectSessionStore.projectSlugDirty = false;
    projectSessionStore.runtimeSyncDebugLabel = `${RUNTIME_SYNC_DEBUG_FINGERPRINT} idle`;
    resetAssetSessionStore();
    resetSceneSessionStore();
    resetToolSessionStore();
    uiStore.selectedAssetId = "";
    uiStore.selectedMaterialId = "material:blockout:concrete";
  };

  const handleLoadWhmap = () => {
    fileInputRef.current?.click();
  };

  const handleImportSceneDocument = () => {
    sceneDocumentInputRef.current?.click();
  };

  const handleSaveWhmap = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "whmap-save",
        snapshot: buildWorldBundle()
      },
      "Save .whmap"
    );

    if (typeof payload === "string") {
      downloadTextFile(`${resolvedProjectSlug}.whmap`, payload, "application/json");
    }
  };

  const handleWhmapFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    const payload = await runWorkerRequest(
      {
        kind: "whmap-load",
        text
      },
      "Load .whmap"
    );

    if (
      isSceneImportPayload(payload) &&
      !isWebHammerEngineBundle(payload) &&
      !isRuntimeWorldBundlePayload(payload)
    ) {
      applyProjectMetadata(extractProjectMetadata(payload), resolvedProjectName);

      if (isWorldPersistenceBundlePayload(payload)) {
        worldEditor.importBundle(payload, "world:load-whmap");
        syncEditorFromWorld("world:load-whmap");
      } else {
        worldEditor.importLegacySnapshot(payload, "scene:load-whmap");
        syncEditorFromWorld("scene:load-whmap");
      }
    }

    event.target.value = "";
  };

  const handleSceneDocumentFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const nextBundle = buildWorldBundle();
    let activeDocumentId = nextBundle.manifest.activeDocumentId;
    let importedDocumentCount = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        const importedDocuments = parseImportedSceneDocuments(text, file.name);

        importedDocuments.forEach((importedDocument) => {
          const result = appendImportedDocumentToWorldBundle(nextBundle, importedDocument, file.name);
          activeDocumentId = result.documentId;
          importedDocumentCount += 1;
        });
      } catch (error) {
        console.warn(`Failed to import scene document ${file.name}.`, error);
        window.alert(
          `Failed to import ${file.name}: ${error instanceof Error ? error.message : "Unsupported scene document."}`
        );
      }
    }

    if (importedDocumentCount > 0) {
      nextBundle.manifest = {
        ...refreshWorldManifest(nextBundle),
        activeDocumentId
      };
      worldEditor.importBundle(nextBundle, "world:import-scene-document");
      syncEditorFromWorld("world:import-scene-document");
    }

    event.target.value = "";
  };

  const handleExportGltf = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "gltf-export",
        snapshot: buildWorldBundle()
      },
      "Export glTF"
    );

    if (typeof payload === "string") {
      downloadTextFile(`${resolvedProjectSlug}.gltf`, payload, "model/gltf+json");
    }
  };

  const handleExportSceneDocument = () => {
    const activeDocumentId = workingSet.activeDocumentId;

    if (!activeDocumentId) {
      return;
    }

    const snapshot = worldEditor.getDocumentSnapshot(activeDocumentId);

    if (!snapshot) {
      return;
    }

    const payload = serializeAuthoringDocumentSnapshot(snapshot);
    downloadTextFile(`${snapshot.metadata.slug || resolvedProjectSlug}.whdoc`, payload, "application/json");
  };

  const handleExportEngine = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "engine-export-archive",
        snapshot: buildWorldBundle()
      },
      "Export runtime scene"
    );

    if (isWorkerArchivePayload(payload)) {
      downloadBinaryFile(`${resolvedProjectSlug}.${payload.fileExtension}`, payload.bytes, payload.mimeType);
    }
  };

  const handlePushSceneToGame = async (options?: {
    forceSwitch?: boolean;
    gameId?: string;
    projectName?: string;
    projectSlug?: string;
  }) => {
    const nextProjectName = options?.projectName?.trim() || resolvedProjectName;
    const nextProjectSlug = slugifyProjectName(
      options?.projectSlug?.trim() || options?.projectName?.trim() || resolvedProjectSlug || nextProjectName
    );

    if (options?.projectName) {
      projectSessionStore.projectName = nextProjectName;
      if (!options.projectSlug) {
        projectSessionStore.projectSlug = nextProjectSlug;
        projectSessionStore.projectSlugDirty = false;
      }
    }

    if (options?.projectSlug) {
      projectSessionStore.projectSlug = nextProjectSlug;
      projectSessionStore.projectSlugDirty = true;
    }

    const exportStartedAt = performance.now();
    projectSessionStore.runtimeSyncDebugLabel = `${RUNTIME_SYNC_DEBUG_FINGERPRINT} exporting ${nextProjectSlug}`;

    try {
      const exportPayload = await runWorkerRequest(
        {
          kind: "engine-export-archive",
          snapshot: {
            ...buildActiveSceneSnapshot(),
            metadata: {
              projectName: nextProjectName,
              projectSlug: nextProjectSlug
            }
          }
        },
        "Push runtime scene"
      );

      if (!isWorkerArchivePayload(exportPayload)) {
        throw new Error("Failed to export a runtime archive for editor sync.");
      }

      const exportDuration = performance.now() - exportStartedAt;
      const archiveSize = formatBytes(exportPayload.bytes.byteLength);
      projectSessionStore.runtimeSyncDebugLabel =
        `${RUNTIME_SYNC_DEBUG_FINGERPRINT} export ${formatDuration(exportDuration)} ${archiveSize}`;

      const uploadStartedAt = performance.now();
      projectSessionStore.runtimeSyncDebugLabel = `${RUNTIME_SYNC_DEBUG_FINGERPRINT} uploading ${archiveSize}`;

      const pushResult = await gameConnection.pushScene({
        archive: {
          bytes: exportPayload.bytes,
          mimeType: exportPayload.mimeType
        },
        forceSwitch: options?.forceSwitch,
        gameId: options?.gameId ?? gameConnection.activeGame?.id,
        metadata: {
          projectName: nextProjectName,
          projectSlug: nextProjectSlug
        }
      });

      projectSessionStore.runtimeSyncDebugLabel =
        `${RUNTIME_SYNC_DEBUG_FINGERPRINT} done export ${formatDuration(exportDuration)} / upload ${formatDuration(performance.now() - uploadStartedAt)}`;

      return pushResult;
    } catch (pushError) {
      const message = pushError instanceof Error ? pushError.message : "Push failed";
      projectSessionStore.runtimeSyncDebugLabel = `${RUNTIME_SYNC_DEBUG_FINGERPRINT} error ${message}`;
      throw pushError;
    }
  };

  return {
    fileActions: {
      createBrush,
      exportEngine: handleExportEngine,
      exportGltf: handleExportGltf,
      exportSceneDocument: handleExportSceneDocument,
      importSceneDocument: handleImportSceneDocument,
      loadWhmap: handleLoadWhmap,
      newFile: handleNewFile,
      saveWhmap: handleSaveWhmap
    },
    fileInputHandlers: {
      handleSceneDocumentFileChange,
      handleWhmapFileChange
    },
    gameSyncActions: {
      handleProjectNameChange,
      handleProjectSlugChange,
      handlePushSceneToGame
    }
  };
}

function applyProjectMetadata(metadata: EditorFileMetadata | undefined, fallbackProjectName: string) {
  if (!metadata?.projectName && !metadata?.projectSlug) {
    return;
  }

  const nextProjectName = metadata.projectName?.trim() || fallbackProjectName;
  const nextProjectSlug = slugifyProjectName(metadata.projectSlug?.trim() || nextProjectName);
  projectSessionStore.projectName = nextProjectName;
  projectSessionStore.projectSlug = nextProjectSlug;
  projectSessionStore.projectSlugDirty = Boolean(metadata.projectSlug);
}

function parseImportedSceneDocuments(text: string, filename: string): AuthoringDocumentSnapshot[] {
  const parsed = JSON.parse(text) as Record<string, unknown>;

  if (parsed.format === "whmap") {
    throw new Error("World files must be loaded through File > Import > World `.whmap`.");
  }

  try {
    return [parseAuthoringDocumentSnapshot(text)];
  } catch {
    if (isSceneDocumentSnapshotPayload(parsed)) {
      const fallbackName = resolveFileStem(filename);
      return [
        createDocumentSnapshotFromLegacyScene(parsed, {
          name: fallbackName,
          slug: slugifyProjectName(fallbackName)
        })
      ];
    }
  }

  throw new Error("Unsupported scene document format.");
}

function appendImportedDocumentToWorldBundle(
  bundle: WorldPersistenceBundle,
  importedDocument: AuthoringDocumentSnapshot,
  sourceFilename?: string
) {
  const requestedName = importedDocument.metadata.name?.trim() || resolveFileStem(sourceFilename);
  const slugBase =
    slugifyProjectName(importedDocument.metadata.slug?.trim() || requestedName || "imported-scene") || "imported-scene";
  const documentId = createUniqueWorldDocumentId(bundle, `document:${slugBase}`);
  const partitionId = createUniqueWorldPartitionId(bundle, `partition:${slugBase}`);
  const tags = Array.from(new Set([...(importedDocument.metadata.tags ?? []), "imported"]));
  const nextDocument: AuthoringDocumentSnapshot = {
    ...structuredClone(importedDocument),
    documentId,
    metadata: {
      ...structuredClone(importedDocument.metadata),
      documentId,
      mount: {
        transform: structuredClone(importedDocument.metadata.mount?.transform ?? makeTransform())
      },
      name: requestedName || "Imported Scene",
      partitionIds: [partitionId],
      path: `/documents/${documentId}.json`,
      slug: slugBase,
      tags
    }
  };
  const partitionBounds = createDocumentSpatialIndex(
    documentId,
    nextDocument.nodes,
    nextDocument.entities,
    nextDocument.metadata.mount.transform
  ).getBounds();

  bundle.documents[documentId] = nextDocument;
  bundle.partitions[partitionId] = {
    bounds: partitionBounds,
    id: partitionId,
    loadDistance: 256,
    members: [
      {
        documentId,
        kind: "document"
      }
    ],
    name: `${nextDocument.metadata.name} Partition`,
    path: `/partitions/${partitionId}.json`,
    tags,
    unloadDistance: 320,
    version: 1
  };

  return {
    documentId,
    partitionId
  };
}

function isSceneDocumentSnapshotPayload(value: unknown): value is SceneDocumentSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.layers) &&
    Array.isArray(candidate.materials) &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.textures) &&
    typeof candidate.settings === "object"
  );
}

function isSceneImportPayload(value: ExportWorkerResponse): value is SceneDocumentSnapshot | WorldPersistenceBundle {
  return Boolean(value) && typeof value !== "string" && !isWorkerArchivePayload(value);
}

function isWorldPersistenceBundlePayload(
  value: SceneDocumentSnapshot | WorldPersistenceBundle | RuntimeWorldBundle
): value is WorldPersistenceBundle {
  return "documents" in value && "manifest" in value && "partitions" in value;
}

function isRuntimeWorldBundlePayload(
  value: SceneDocumentSnapshot | WorldPersistenceBundle | RuntimeWorldBundle
): value is RuntimeWorldBundle {
  return "index" in value && "files" in value;
}

function isWorkerArchivePayload(value: ExportWorkerResponse): value is Extract<ExportWorkerResponse, { bytes: Uint8Array }> {
  return Boolean(value) && typeof value !== "string" && "bytes" in value;
}

function extractProjectMetadata(
  payload: SceneDocumentSnapshot | WorldPersistenceBundle
): EditorFileMetadata | undefined {
  if ("documents" in payload) {
    return payload.manifest.metadata;
  }

  return payload.metadata;
}

function resolveFileStem(filename?: string) {
  if (!filename) {
    return "Imported Scene";
  }

  return filename.replace(/\.[^.]+$/, "") || "Imported Scene";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(1)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}
