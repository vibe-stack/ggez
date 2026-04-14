import { useMemo } from "react";
import {
  createSceneDocumentSnapshot,
  createSeedSceneDocument,
  type AuthoringDocumentSnapshot,
  type WorldEditorCore,
  type WorldPersistenceBundle
} from "@ggez/editor-core";
import { makeTransform } from "@ggez/shared";
import { slugifyProjectName } from "@ggez/dev-sync";
import { createUniqueWorldDocumentId, createUniqueWorldPartitionId } from "@/app/world-document-ids";

export function useWorldDocumentManagement({
  buildWorldBundle,
  syncEditorFromWorld,
  workingSet,
  worldEditor,
  worldRevision
}: {
  buildWorldBundle: () => WorldPersistenceBundle;
  syncEditorFromWorld: (reason: string) => void;
  workingSet: {
    activeDocumentId?: string;
    loadedDocumentIds: string[];
    mode: "scene" | "world";
    pinnedDocumentIds: string[];
  };
  worldEditor: WorldEditorCore;
  worldRevision: number;
}) {
  const worldDocuments = useMemo(
    () =>
      worldEditor.getDocumentSummaries().map((document) => ({
        id: document.documentId,
        loaded: workingSet.loadedDocumentIds.includes(document.documentId),
        name: document.name,
        pinned: workingSet.pinnedDocumentIds.includes(document.documentId),
        position: structuredClone(document.mount.transform.position)
      })),
    [workingSet, worldEditor, worldRevision]
  );

  const handleSetWorldMode = (mode: "scene" | "world") => {
    worldEditor.setWorldMode(mode);
  };

  const handleSetActiveWorldDocument = (documentId: string) => {
    worldEditor.setActiveDocument(documentId);
    syncEditorFromWorld("world:set-active-document");
  };

  const handleCreateWorldDocument = () => {
    const requestedName = window.prompt("New document name", `Document ${worldDocuments.length + 1}`)?.trim();

    if (!requestedName) {
      return;
    }

    const nextBundle = buildWorldBundle();
    const slugBase = slugifyProjectName(requestedName) || `document-${worldDocuments.length + 1}`;
    const documentId = createUniqueWorldDocumentId(nextBundle, `document:${slugBase}`);
    const partitionId = createUniqueWorldPartitionId(nextBundle, `partition:${slugBase}`);
    const seedSnapshot = createSceneDocumentSnapshot(createSeedSceneDocument());

    nextBundle.documents[documentId] = {
      ...seedSnapshot,
      crossDocumentRefs: [],
      documentId,
      metadata: {
        documentId,
        mount: {
          transform: makeTransform()
        },
        name: requestedName,
        partitionIds: [partitionId],
        path: `/documents/${documentId}.json`,
        slug: slugBase,
        tags: []
      },
      version: 1
    } satisfies AuthoringDocumentSnapshot;

    nextBundle.partitions[partitionId] = {
      id: partitionId,
      loadDistance: 256,
      members: [
        {
          documentId,
          kind: "document"
        }
      ],
      name: `${requestedName} Partition`,
      path: `/partitions/${partitionId}.json`,
      tags: [],
      unloadDistance: 320,
      version: 1
    };
    nextBundle.manifest.partitions = [
      ...nextBundle.manifest.partitions,
      {
        documentIds: [documentId],
        id: partitionId,
        name: `${requestedName} Partition`,
        path: `/partitions/${partitionId}.json`,
        tags: []
      }
    ];
    nextBundle.manifest.activeDocumentId = documentId;
    worldEditor.importBundle(nextBundle, "world:create-document");
    syncEditorFromWorld("world:create-document");
  };

  const handleLoadWorldDocument = (documentId: string) => {
    worldEditor.loadDocument(documentId);
  };

  const handleUnloadWorldDocument = (documentId: string) => {
    worldEditor.unloadDocument(documentId);
  };

  const handlePinWorldDocument = (documentId: string) => {
    worldEditor.pinDocument(documentId);
  };

  const handleUnpinWorldDocument = (documentId: string) => {
    worldEditor.unpinDocument(documentId);
  };

  const handleSetWorldDocumentPosition = (documentId: string, position: { x: number; y: number; z: number }) => {
    const document = worldEditor.getDocumentSnapshot(documentId);

    if (!document) {
      return;
    }

    worldEditor.updateDocumentMountTransform(documentId, {
      ...document.metadata.mount.transform,
      position
    });
  };

  return {
    handleCreateWorldDocument,
    handleLoadWorldDocument,
    handlePinWorldDocument,
    handleSetActiveWorldDocument,
    handleSetWorldDocumentPosition,
    handleSetWorldMode,
    handleUnloadWorldDocument,
    handleUnpinWorldDocument,
    worldDocuments
  };
}
