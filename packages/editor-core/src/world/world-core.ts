import type { Asset, Entity, GeometryNode, Material, TextureRecord, Transform } from "@ggez/shared";
import {
  MATERIAL_TEXTURE_FIELDS,
  composeTransforms,
  isTextureReferenceId,
  isBrushNode,
  isInstancingNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  makeTransform,
  resolveSceneGraph,
  vec3
} from "@ggez/shared";
import type { Command, CommandStack } from "../commands/command-stack";
import {
  createSceneDocument,
  createSceneDocumentSnapshot,
  loadSceneDocumentSnapshot,
  normalizeSceneDocumentSnapshot,
  type SceneDocument,
  type SceneDocumentSnapshot
} from "../document/scene-document";
import { createEventBus, type EventBus } from "../events/event-bus";
import { createSelectionState, type SelectionMode, type SelectionState } from "../selection/selection";
import { createBounds, createDocumentSpatialIndex, createWorldSpatialIndex, mergeBounds, type DocumentSpatialIndex, type WorldSpatialIndex } from "./spatial-index";
import type {
  AuthoringDocumentMetadata,
  AuthoringDocumentSnapshot,
  Bounds3,
  CrossDocumentRef,
  DocumentID,
  Ownership,
  PartitionID,
  SharedWorldResources,
  StreamingPartition,
  StreamingPartitionMember,
  WorkingSetState,
  WorldCommand,
  WorldEntityHandle,
  WorldManifest,
  WorldNodeHandle,
  WorldPersistenceBundle,
  WorldSelectionHandle,
  WorldSelectionSnapshot,
  WorldTransaction,
  WorldValidationIssue
} from "./types";

export type AuthoringDocument = SceneDocument & {
  crossDocumentRefs: CrossDocumentRef[];
  documentId: DocumentID;
  metadata: AuthoringDocumentMetadata;
  ownership: Ownership[];
  refreshSpatialIndex: (mountTransform?: Transform) => DocumentSpatialIndex;
  spatialIndex: DocumentSpatialIndex;
};

export type WorldDocument = {
  crossDocumentRefs: Map<string, CrossDocumentRef>;
  documents: Map<DocumentID, AuthoringDocument>;
  manifest: WorldManifest;
  partitions: Map<PartitionID, StreamingPartition>;
  revision: number;
  selection: WorldSelectionState;
  sharedAssets: SharedWorldResources;
  validation: WorldValidationIssue[];
  workingSet: WorkingSetState;
};

type WorldEvents = {
  "active-document:changed": { documentId?: DocumentID; revision: number };
  "selection:changed": WorldSelectionSnapshot;
  "transaction:applied": { label: string; revision: number; transaction: WorldTransaction };
  "world:changed": { reason: string; revision: number };
  "working-set:changed": { revision: number; workingSet: WorkingSetState };
};

type WorldHistory = {
  done: WorldTransaction[];
  undone: WorldTransaction[];
};

export type WorldEditorCore = {
  events: EventBus<WorldEvents>;
  execute: (command: WorldCommand) => void;
  exportBundle: () => WorldPersistenceBundle;
  getActiveDocument: () => AuthoringDocument | undefined;
  getDocument: (documentId: DocumentID) => AuthoringDocument | undefined;
  getDocumentSnapshot: (documentId: DocumentID) => AuthoringDocumentSnapshot | undefined;
  getDocumentSnapshotRef: (documentId: DocumentID) => AuthoringDocumentSnapshot | undefined;
  getDocumentSummaries: () => Array<{
    documentId: DocumentID;
    mount: AuthoringDocumentMetadata["mount"];
    name: string;
    path: string;
    slug: string;
  }>;
  getFlattenedSceneSnapshot: (options?: {
    activeDocumentId?: DocumentID;
    activeDocumentOverride?: SceneDocument;
    includeLoadedOnly?: boolean;
  }) => SceneDocumentSnapshot;
  getPartitionSummaries: () => Array<{ documentIds: DocumentID[]; id: PartitionID; name: string }>;
  getSelectionSnapshot: () => WorldSelectionSnapshot;
  getWorkingSet: () => WorkingSetState;
  getWorldSpatialIndex: () => WorldSpatialIndex;
  history: WorldHistory;
  importBundle: (bundle: WorldPersistenceBundle, reason?: string) => void;
  importLegacySnapshot: (snapshot: SceneDocumentSnapshot, reason?: string) => void;
  loadDocument: (documentId: DocumentID) => void;
  pinDocument: (documentId: DocumentID) => void;
  redo: () => void;
  select: (handles: Iterable<WorldSelectionHandle>, mode?: SelectionMode) => void;
  setActiveDocument: (documentId: DocumentID | undefined) => void;
  setWorldMode: (mode: WorkingSetState["mode"]) => void;
  transact: (transaction: WorldTransaction) => void;
  undo: () => void;
  unpinDocument: (documentId: DocumentID) => void;
  unloadDocument: (documentId: DocumentID) => void;
  updateDocumentMountTransform: (documentId: DocumentID, transform: Transform) => void;
  updateActiveDocument: (label: string, after: SceneDocumentSnapshot) => void;
  world: WorldDocument;
};

export type WorldSelectionState = {
  handles: WorldSelectionHandle[];
  mode: SelectionMode;
  revision: number;
  clear: () => void;
  set: (handles: Iterable<WorldSelectionHandle>, mode?: SelectionMode) => void;
  toSnapshot: () => WorldSelectionSnapshot;
};

export type SceneEditorAdapter = {
  commands: CommandStack;
  events: EventBus<{
    "command:executed": { doneCount: number; label: string; revision: number; undoneCount: number };
    "command:redone": { doneCount: number; label: string; revision: number; undoneCount: number };
    "command:undone": { doneCount: number; label: string; revision: number; undoneCount: number };
    "scene:changed": { entityIds: string[]; nodeIds: string[]; reason: string; revision: number };
    "selection:changed": { ids: string[]; mode: SelectionMode; revision: number };
  }>;
  execute: (command: Command) => void;
  exportSnapshot: () => SceneDocumentSnapshot;
  importSnapshot: (snapshot: SceneDocumentSnapshot, reason?: string) => void;
  redo: () => void;
  scene: SceneDocument;
  selection: SelectionState;
  syncFromWorld: (reason?: string) => void;
  undo: () => void;
  addEntity: (entity: Parameters<SceneDocument["addEntity"]>[0], reason?: string) => void;
  addNode: (node: Parameters<SceneDocument["addNode"]>[0], reason?: string) => void;
  clearSelection: () => void;
  removeEntity: (entityId: string, reason?: string) => void;
  removeNode: (nodeId: string, reason?: string) => void;
  select: (ids: Iterable<string>, mode?: SelectionMode) => void;
};

export function createWorldEditorCore(
  input: WorldPersistenceBundle | SceneDocumentSnapshot = createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(createSceneDocument()))
): WorldEditorCore {
  let storageBundle = isWorldPersistenceBundle(input) ? normalizeWorldPersistenceBundle(cloneWorldBundle(input)) : createWorldBundleFromLegacyScene(input);
  const world: WorldDocument = {
    crossDocumentRefs: new Map<string, CrossDocumentRef>(),
    documents: new Map<DocumentID, AuthoringDocument>(),
    manifest: structuredClone(storageBundle.manifest),
    partitions: new Map<PartitionID, StreamingPartition>(),
    revision: 0,
    selection: createWorldSelectionState(),
    sharedAssets: structuredClone(storageBundle.sharedAssets),
    validation: [],
    workingSet: createInitialWorkingSet(storageBundle)
  };
  const history: WorldHistory = {
    done: [],
    undone: []
  };
  const events = createEventBus<WorldEvents>();
  const documentSpatialIndexes = new Map<DocumentID, DocumentSpatialIndex>();
  let worldSpatialIndex = createWorldSpatialIndex({
    documents: [],
    partitions: []
  });

  const rebuildLoadedDocuments = () => {
    world.documents.clear();

    world.workingSet.loadedDocumentIds.forEach((documentId) => {
      const snapshot = storageBundle.documents[documentId];

      if (!snapshot) {
        return;
      }

      const mountTransform = resolveDocumentMountTransform(storageBundle, documentId);
      const document = createAuthoringDocument(snapshot);
      document.spatialIndex = document.refreshSpatialIndex(mountTransform);
      world.documents.set(documentId, document);
      documentSpatialIndexes.set(documentId, document.spatialIndex);
    });

    world.partitions = new Map(
      Object.values(storageBundle.partitions).map((partition) => [partition.id, structuredClone(partition)])
    );
    world.manifest = structuredClone(storageBundle.manifest);
    world.sharedAssets = structuredClone(storageBundle.sharedAssets);
    world.crossDocumentRefs = new Map(
      Object.values(storageBundle.documents)
        .flatMap((document) => document.crossDocumentRefs)
        .map((ref) => [ref.id, structuredClone(ref)])
    );

    worldSpatialIndex = createWorldSpatialIndex({
      documents: Array.from(documentSpatialIndexes.entries()).map(([documentId, index]) => ({
        documentId,
        index
      })),
      partitions: Object.values(storageBundle.partitions).map((partition) => ({
        bounds: partition.bounds,
        partitionId: partition.id
      }))
    });
    world.validation = validateWorldBundle(storageBundle, world.workingSet.loadedDocumentIds);
  };

  const refreshLoadedDocument = (documentId: DocumentID) => {
    documentSpatialIndexes.delete(documentId);
    world.documents.delete(documentId);

    if (!world.workingSet.loadedDocumentIds.includes(documentId)) {
      return;
    }

    const snapshot = storageBundle.documents[documentId];

    if (!snapshot) {
      return;
    }

    const mountTransform = resolveDocumentMountTransform(storageBundle, documentId);
    const document = createAuthoringDocument(snapshot);
    document.spatialIndex = document.refreshSpatialIndex(mountTransform);
    world.documents.set(documentId, document);
    documentSpatialIndexes.set(documentId, document.spatialIndex);
  };

  const rebuildWorldSpatialIndex = () => {
    worldSpatialIndex = createWorldSpatialIndex({
      documents: Array.from(documentSpatialIndexes.entries()).map(([documentId, index]) => ({
        documentId,
        index
      })),
      partitions: Object.values(storageBundle.partitions).map((partition) => ({
        bounds: partition.bounds,
        partitionId: partition.id
      }))
    });
  };

  const syncSelectionToWorld = (handles: Iterable<WorldSelectionHandle>, mode = world.selection.mode) => {
    world.selection.set(handles, mode);
    events.emit("selection:changed", world.selection.toSnapshot());
  };

  const reconcileWorkingSet = () => {
    const knownDocumentIds = new Set(Object.keys(storageBundle.documents));
    world.workingSet.loadedDocumentIds = uniqueDocumentIds(
      world.workingSet.loadedDocumentIds.filter((documentId) => knownDocumentIds.has(documentId))
    );
    world.workingSet.pinnedDocumentIds = uniqueDocumentIds(
      world.workingSet.pinnedDocumentIds.filter((documentId) => knownDocumentIds.has(documentId))
    );
    world.workingSet.backgroundDocumentIds = uniqueDocumentIds(
      world.workingSet.backgroundDocumentIds.filter((documentId) => knownDocumentIds.has(documentId))
    );

    if (!world.workingSet.activeDocumentId || !knownDocumentIds.has(world.workingSet.activeDocumentId)) {
      world.workingSet.activeDocumentId = storageBundle.manifest.activeDocumentId ?? Object.keys(storageBundle.documents)[0];
    }

    if (world.workingSet.activeDocumentId && !world.workingSet.loadedDocumentIds.includes(world.workingSet.activeDocumentId)) {
      world.workingSet.loadedDocumentIds.push(world.workingSet.activeDocumentId);
    }
  };

  const emitWorldChange = (reason: string) => {
    world.revision += 1;
    events.emit("world:changed", {
      reason,
      revision: world.revision
    });
  };

  const applyTransaction = (transaction: WorldTransaction, historyMode: "normal" | "redo" | "undo") => {
    transaction.documentChanges.forEach((change) => {
      if (!change.after) {
        delete storageBundle.documents[change.documentId];
        return;
      }

      storageBundle.documents[change.documentId] = change.after;
    });

    transaction.partitionChanges.forEach((change) => {
      if (!change.after) {
        delete storageBundle.partitions[change.partitionId];
        return;
      }

      storageBundle.partitions[change.partitionId] = change.after;
    });

    if (transaction.sharedAssetsAfter) {
      storageBundle.sharedAssets = transaction.sharedAssetsAfter;
    }

    if (transaction.manifestAfter) {
      storageBundle.manifest = transaction.manifestAfter;
    }

    const selectionChanged = Boolean(transaction.selectionAfter);
    const workingSetChanged = Boolean(transaction.workingSetAfter);
    const activeDocumentChanged =
      Boolean(transaction.workingSetAfter) &&
      transaction.workingSetBefore?.activeDocumentId !== transaction.workingSetAfter?.activeDocumentId;

    if (transaction.selectionAfter) {
      world.selection.set(transaction.selectionAfter.handles, transaction.selectionAfter.mode);
    }

    if (transaction.workingSetAfter) {
      world.workingSet = structuredClone(transaction.workingSetAfter);
    }

    const documentStructureChanged = transaction.documentChanges.some((change) => !change.before || !change.after);
    const requiresStructuralRebuild =
      documentStructureChanged ||
      transaction.partitionChanges.length > 0 ||
      Boolean(transaction.manifestAfter) ||
      Boolean(transaction.workingSetAfter) ||
      Boolean(transaction.sharedAssetsAfter);

    reconcileWorkingSet();

    if (requiresStructuralRebuild) {
      rebuildLoadedDocuments();
    } else if (transaction.documentChanges.length > 0) {
      transaction.documentChanges.forEach((change) => {
        refreshLoadedDocument(change.documentId);
      });
      rebuildWorldSpatialIndex();
    }

    if (historyMode === "normal") {
      history.done.push(transaction);
      history.undone.length = 0;
    }

    emitWorldChange(`transaction:${transaction.label}`);
    events.emit("transaction:applied", {
      label: transaction.label,
      revision: world.revision,
      transaction
    });

    if (selectionChanged) {
      events.emit("selection:changed", world.selection.toSnapshot());
    }

    if (workingSetChanged) {
      events.emit("working-set:changed", {
        revision: world.revision,
        workingSet: structuredClone(world.workingSet)
      });
    }

    if (activeDocumentChanged) {
      events.emit("active-document:changed", {
        documentId: world.workingSet.activeDocumentId,
        revision: world.revision
      });
    }
  };

  const createTransaction = (input: Omit<WorldTransaction, "timestamp">): WorldTransaction => ({
    ...input,
    timestamp: new Date().toISOString()
  });

  const api: WorldEditorCore = {
    events,
    execute(command) {
      const transaction = command.execute({
        createTransaction,
        exportBundle() {
          return api.exportBundle();
        },
        getSelectionSnapshot() {
          return world.selection.toSnapshot();
        },
        getWorkingSet() {
          return structuredClone(world.workingSet);
        }
      });

      if (!transaction) {
        return;
      }

      api.transact(transaction);
    },
    exportBundle() {
      return cloneWorldBundle(storageBundle);
    },
    getActiveDocument() {
      return world.workingSet.activeDocumentId ? world.documents.get(world.workingSet.activeDocumentId) : undefined;
    },
    getDocument(documentId) {
      return world.documents.get(documentId);
    },
    getDocumentSnapshot(documentId) {
      const snapshot = storageBundle.documents[documentId];
      return snapshot ? structuredClone(snapshot) : undefined;
    },
    getDocumentSnapshotRef(documentId) {
      return storageBundle.documents[documentId];
    },
    getDocumentSummaries() {
      return Object.values(storageBundle.documents).map((document) => ({
        documentId: document.documentId,
        mount: structuredClone(document.metadata.mount),
        name: document.metadata.name,
        path: document.metadata.path,
        slug: document.metadata.slug
      }));
    },
    getFlattenedSceneSnapshot(options = {}) {
      return flattenWorldBundle(storageBundle, {
        activeDocumentId: world.workingSet.activeDocumentId,
        activeDocumentOverride: options.activeDocumentOverride,
        includeDocumentIds: options.includeLoadedOnly
          ? world.workingSet.loadedDocumentIds
          : Object.keys(storageBundle.documents)
      });
    },
    getPartitionSummaries() {
      return Object.values(storageBundle.partitions).map((partition) => ({
        documentIds: uniqueDocumentIds(
          partition.members.flatMap((member) => (member.kind === "document" ? [member.documentId] : []))
        ),
        id: partition.id,
        name: partition.name
      }));
    },
    getSelectionSnapshot() {
      return world.selection.toSnapshot();
    },
    getWorkingSet() {
      return structuredClone(world.workingSet);
    },
    getWorldSpatialIndex() {
      return worldSpatialIndex;
    },
    history,
    importBundle(bundle, reason = "world:import") {
      storageBundle = normalizeWorldPersistenceBundle(cloneWorldBundle(bundle));
      world.selection.clear();
      world.workingSet = createInitialWorkingSet(storageBundle);
      history.done.length = 0;
      history.undone.length = 0;
      reconcileWorkingSet();
      rebuildLoadedDocuments();
      emitWorldChange(reason);
      events.emit("selection:changed", world.selection.toSnapshot());
      events.emit("active-document:changed", {
        documentId: world.workingSet.activeDocumentId,
        revision: world.revision
      });
    },
    importLegacySnapshot(snapshot, reason = "world:import-legacy") {
      api.importBundle(createWorldBundleFromLegacyScene(snapshot), reason);
    },
    loadDocument(documentId) {
      if (!storageBundle.documents[documentId] || world.workingSet.loadedDocumentIds.includes(documentId)) {
        return;
      }

      api.transact(
        createTransaction({
          documentChanges: [],
          label: "load document",
          partitionChanges: [],
          selectionAfter: world.selection.toSnapshot(),
          selectionBefore: world.selection.toSnapshot(),
          workingSetAfter: {
            ...structuredClone(world.workingSet),
            loadedDocumentIds: uniqueDocumentIds([...world.workingSet.loadedDocumentIds, documentId])
          },
          workingSetBefore: structuredClone(world.workingSet)
        })
      );
    },
    pinDocument(documentId) {
      api.transact(
        createTransaction({
          documentChanges: [],
          label: "pin document",
          partitionChanges: [],
          selectionAfter: world.selection.toSnapshot(),
          selectionBefore: world.selection.toSnapshot(),
          workingSetAfter: {
            ...structuredClone(world.workingSet),
            loadedDocumentIds: uniqueDocumentIds([...world.workingSet.loadedDocumentIds, documentId]),
            pinnedDocumentIds: uniqueDocumentIds([...world.workingSet.pinnedDocumentIds, documentId])
          },
          workingSetBefore: structuredClone(world.workingSet)
        })
      );
    },
    redo() {
      const transaction = history.undone.pop();

      if (!transaction) {
        return;
      }

      applyTransaction(transaction, "redo");
      history.done.push(transaction);
    },
    select(handles, mode = world.selection.mode) {
      syncSelectionToWorld(handles, mode);
    },
    setActiveDocument(documentId) {
      api.transact(
        createTransaction({
          documentChanges: [],
          label: "set active document",
          partitionChanges: [],
          selectionAfter: world.selection.toSnapshot(),
          selectionBefore: world.selection.toSnapshot(),
          workingSetAfter: {
            ...structuredClone(world.workingSet),
            activeDocumentId: documentId,
            loadedDocumentIds: documentId
              ? uniqueDocumentIds([...world.workingSet.loadedDocumentIds, documentId])
              : [...world.workingSet.loadedDocumentIds]
          },
          workingSetBefore: structuredClone(world.workingSet)
        })
      );
    },
    setWorldMode(mode) {
      api.transact(
        createTransaction({
          documentChanges: [],
          label: "set world mode",
          partitionChanges: [],
          selectionAfter: world.selection.toSnapshot(),
          selectionBefore: world.selection.toSnapshot(),
          workingSetAfter: {
            ...structuredClone(world.workingSet),
            mode
          },
          workingSetBefore: structuredClone(world.workingSet)
        })
      );
    },
    transact(transaction) {
      applyTransaction(transaction, "normal");
    },
    undo() {
      const transaction = history.done.pop();

      if (!transaction) {
        return;
      }

      const inverse = createTransaction({
        crossDocumentRefsAfter: transaction.crossDocumentRefsBefore,
        crossDocumentRefsBefore: transaction.crossDocumentRefsAfter,
        documentChanges: transaction.documentChanges.map((change) => ({
          after: change.before,
          before: change.after,
          documentId: change.documentId
        })),
        label: transaction.label,
        manifestAfter: transaction.manifestBefore,
        manifestBefore: transaction.manifestAfter,
        partitionChanges: transaction.partitionChanges.map((change) => ({
          after: change.before,
          before: change.after,
          partitionId: change.partitionId
        })),
        selectionAfter: transaction.selectionBefore,
        selectionBefore: transaction.selectionAfter,
        sharedAssetsAfter: transaction.sharedAssetsBefore,
        sharedAssetsBefore: transaction.sharedAssetsAfter,
        workingSetAfter: transaction.workingSetBefore,
        workingSetBefore: transaction.workingSetAfter
      });

      applyTransaction(inverse, "undo");
      history.undone.push(transaction);
    },
    unpinDocument(documentId) {
      api.transact(
        createTransaction({
          documentChanges: [],
          label: "unpin document",
          partitionChanges: [],
          selectionAfter: world.selection.toSnapshot(),
          selectionBefore: world.selection.toSnapshot(),
          workingSetAfter: {
            ...structuredClone(world.workingSet),
            pinnedDocumentIds: world.workingSet.pinnedDocumentIds.filter((id) => id !== documentId)
          },
          workingSetBefore: structuredClone(world.workingSet)
        })
      );
    },
    unloadDocument(documentId) {
      if (world.workingSet.activeDocumentId === documentId || world.workingSet.pinnedDocumentIds.includes(documentId)) {
        return;
      }

      api.transact(
        createTransaction({
          documentChanges: [],
          label: "unload document",
          partitionChanges: [],
          selectionAfter: {
            handles: world.selection.toSnapshot().handles.filter((handle) => !("documentId" in handle && handle.documentId === documentId)),
            mode: world.selection.mode,
            revision: world.selection.revision + 1
          },
          selectionBefore: world.selection.toSnapshot(),
          workingSetAfter: {
            ...structuredClone(world.workingSet),
            backgroundDocumentIds: world.workingSet.backgroundDocumentIds.filter((id) => id !== documentId),
            loadedDocumentIds: world.workingSet.loadedDocumentIds.filter((id) => id !== documentId)
          },
          workingSetBefore: structuredClone(world.workingSet)
        })
      );
    },
    updateDocumentMountTransform(documentId, transform) {
      const before = storageBundle.documents[documentId];

      if (!before) {
        return;
      }

      const after: AuthoringDocumentSnapshot = {
        ...before,
        metadata: {
          ...before.metadata,
          mount: {
            ...before.metadata.mount,
            transform: structuredClone(transform)
          }
        }
      };
      const nextBundle = cloneWorldBundle(storageBundle);
      nextBundle.documents[documentId] = after;

      const affectedPartitionIds = Array.from(
        new Set([...before.metadata.partitionIds, ...after.metadata.partitionIds])
      );
      const partitionChanges = affectedPartitionIds.flatMap((partitionId) => {
        const partitionBefore = storageBundle.partitions[partitionId];

        if (!partitionBefore) {
          return [];
        }

        const partitionAfter: StreamingPartition = {
          ...structuredClone(partitionBefore),
          bounds: derivePartitionBounds(nextBundle, partitionBefore)
        };
        nextBundle.partitions[partitionId] = partitionAfter;
        return [
          {
            after: partitionAfter,
            before: structuredClone(partitionBefore),
            partitionId
          }
        ];
      });

      api.transact(
        createTransaction({
          documentChanges: [
            {
              after,
              before,
              documentId
            }
          ],
          label: "update document mount",
          manifestAfter: refreshWorldManifest(nextBundle),
          manifestBefore: structuredClone(storageBundle.manifest),
          partitionChanges
        })
      );
    },
    updateActiveDocument(label, after) {
      const activeDocumentId = world.workingSet.activeDocumentId;

      if (!activeDocumentId) {
        return;
      }

      const before = storageBundle.documents[activeDocumentId];

      if (!before) {
        return;
      }

      const nextSnapshot: AuthoringDocumentSnapshot = {
        ...after,
        crossDocumentRefs: before.crossDocumentRefs,
        documentId: before.documentId,
        metadata: before.metadata,
        version: 1
      };
      api.transact(
        createTransaction({
          documentChanges: [
            {
              after: nextSnapshot,
              before,
              documentId: activeDocumentId
            }
          ],
          label,
          partitionChanges: []
        })
      );
    },
    world
  };

  reconcileWorkingSet();
  rebuildLoadedDocuments();

  return api;
}

export function createWorldSelectionState(mode: SelectionMode = "object"): WorldSelectionState {
  const state: WorldSelectionState = {
    handles: [],
    mode,
    revision: 0,
    clear() {
      if (state.handles.length === 0) {
        return;
      }

      state.handles = [];
      state.revision += 1;
    },
    set(handles, nextMode = state.mode) {
      const nextHandles = dedupeSelectionHandles(handles);
      const idsChanged =
        state.handles.length !== nextHandles.length ||
        state.handles.some((handle, index) => JSON.stringify(handle) !== JSON.stringify(nextHandles[index]));
      const modeChanged = state.mode !== nextMode;

      if (!idsChanged && !modeChanged) {
        return;
      }

      state.handles = nextHandles;
      state.mode = nextMode;
      state.revision += 1;
    },
    toSnapshot() {
      return {
        handles: structuredClone(state.handles),
        mode: state.mode,
        revision: state.revision
      };
    }
  };

  return state;
}

export function createAuthoringDocument(snapshot: AuthoringDocumentSnapshot): AuthoringDocument {
  const scene = createSceneDocument();
  loadSceneDocumentSnapshot(scene, snapshot);
  const document = scene as AuthoringDocument;
  document.documentId = snapshot.documentId;
  document.crossDocumentRefs = structuredClone(snapshot.crossDocumentRefs ?? []);
  document.metadata = structuredClone(snapshot.metadata);
  document.ownership = [
    ...snapshot.nodes.map(() => ({ documentId: snapshot.documentId, kind: "document" as const, target: "node" as const })),
    ...snapshot.entities.map(() => ({ documentId: snapshot.documentId, kind: "document" as const, target: "entity" as const }))
  ];
  document.spatialIndex = createDocumentSpatialIndex(snapshot.documentId, document.nodes.values(), document.entities.values());
  document.refreshSpatialIndex = (mountTransform?: Transform) => {
    document.spatialIndex = createDocumentSpatialIndex(
      document.documentId,
      document.nodes.values(),
      document.entities.values(),
      mountTransform
    );
    return document.spatialIndex;
  };
  return document;
}

export function createAuthoringDocumentSnapshot(document: AuthoringDocument): AuthoringDocumentSnapshot {
  return {
    ...createSceneDocumentSnapshot(document),
    crossDocumentRefs: structuredClone(document.crossDocumentRefs),
    documentId: document.documentId,
    metadata: structuredClone(document.metadata),
    version: 1
  };
}

export function createSceneEditorAdapter(world: WorldEditorCore): SceneEditorAdapter {
  const scene = createSceneDocument();
  const selection = createSelectionState();
  const events = createEventBus<SceneEditorAdapter["events"] extends EventBus<infer TEvents> ? TEvents : never>();
  const emitSceneChanged = (reason: string) => {
    events.emit("scene:changed", {
      entityIds: Array.from(scene.entities.keys()),
      nodeIds: Array.from(scene.nodes.keys()),
      reason,
      revision: scene.revision
    });
  };
  const commands: CommandStack = {
    done: [],
    undone: [],
    clear() {
      world.history.done.length = 0;
      world.history.undone.length = 0;
      syncHistory();
    },
    canRedo() {
      return world.history.undone.length > 0;
    },
    canUndo() {
      return world.history.done.length > 0;
    },
    push(command) {
      adapter.execute(command);
    },
    redo() {
      adapter.redo();
      return undefined;
    },
    undo() {
      adapter.undo();
      return undefined;
    }
  };

  const toStubCommand = (transaction: WorldTransaction): Command => ({
    execute() {},
    label: transaction.label,
    undo() {}
  });

  const syncHistory = () => {
    commands.done = world.history.done.map(toStubCommand);
    commands.undone = world.history.undone.map(toStubCommand);
  };

  const syncSelection = () => {
    const activeDocumentId = world.world.workingSet.activeDocumentId;
    const snapshot = world.getSelectionSnapshot();
    const localIds = snapshot.handles.flatMap((handle) => {
      if (!("documentId" in handle) || handle.documentId !== activeDocumentId) {
        return [];
      }

      if (handle.kind === "node") {
        return [handle.nodeId];
      }

      if (handle.kind === "entity") {
        return [handle.entityId];
      }

      return [];
    });

    selection.set(localIds, snapshot.mode);
    events.emit("selection:changed", {
      ids: [...selection.ids],
      mode: selection.mode,
      revision: selection.revision
    });
  };

  const syncScene = (reason = "world:sync") => {
    const activeDocument = world.getActiveDocument();

    if (activeDocument) {
      loadSceneDocumentSnapshot(scene, createSceneDocumentSnapshot(activeDocument));
    } else {
      loadSceneDocumentSnapshot(
        scene,
        createSceneDocumentSnapshot(createSceneDocument())
      );
    }

    syncHistory();
    syncSelection();
    emitSceneChanged(reason);
  };

  const shouldCloneMaterials = (label: string) => label.includes("material");
  const shouldCloneTextures = (label: string) => label.includes("texture");
  const shouldCloneAssets = (label: string) => label.includes("asset");
  const shouldCloneLayers = (label: string) => label.includes("layer");
  const shouldCloneSettings = (label: string) => label.includes("settings");

  const captureCommittedSnapshot = (label: string): AuthoringDocumentSnapshot | undefined => {
    const activeDocumentId = world.world.workingSet.activeDocumentId;

    if (!activeDocumentId) {
      return undefined;
    }

    const before = world.getDocumentSnapshotRef(activeDocumentId);

    if (!before) {
      return undefined;
    }

    return {
      assets: shouldCloneAssets(label)
        ? Array.from(scene.assets.values(), (asset) => structuredClone(asset))
        : before.assets,
      crossDocumentRefs: before.crossDocumentRefs,
      documentId: before.documentId,
      entities: Array.from(scene.entities.values(), (entity) => structuredClone(entity)),
      layers: shouldCloneLayers(label)
        ? Array.from(scene.layers.values(), (layer) => structuredClone(layer))
        : before.layers,
      materials: shouldCloneMaterials(label)
        ? Array.from(scene.materials.values(), (material) => structuredClone(material))
        : before.materials,
      metadata: before.metadata,
      nodes: Array.from(scene.nodes.values(), (node) => structuredClone(node)),
      settings: shouldCloneSettings(label) ? structuredClone(scene.settings) : before.settings,
      textures: shouldCloneTextures(label)
        ? Array.from(scene.textures.values(), (texture) => structuredClone(texture))
        : before.textures,
      version: 1
    };
  };

  const adapter: SceneEditorAdapter = {
    addEntity(entity, reason = "entity:add") {
      scene.addEntity(structuredClone(entity));
      const snapshot = captureCommittedSnapshot(reason);

      if (!snapshot) {
        return;
      }

      world.updateActiveDocument(reason, snapshot);
      syncHistory();
      emitSceneChanged(reason);
    },
    addNode(node, reason = "node:add") {
      scene.addNode(structuredClone(node));
      const snapshot = captureCommittedSnapshot(reason);

      if (!snapshot) {
        return;
      }

      world.updateActiveDocument(reason, snapshot);
      syncHistory();
      emitSceneChanged(reason);
    },
    clearSelection() {
      world.select([], selection.mode);
    },
    commands,
    events,
    execute(command) {
      if (!world.getActiveDocument()) {
        return;
      }

      command.execute(scene);
      const snapshot = captureCommittedSnapshot(command.label);

      if (!snapshot) {
        return;
      }

      world.updateActiveDocument(command.label, snapshot);
      syncHistory();
      emitSceneChanged(`command:${command.label}`);
      events.emit("command:executed", {
        doneCount: world.history.done.length,
        label: command.label,
        revision: scene.revision,
        undoneCount: world.history.undone.length
      });
    },
    exportSnapshot() {
      return createSceneDocumentSnapshot(scene);
    },
    importSnapshot(snapshot, reason = "scene:import") {
      loadSceneDocumentSnapshot(scene, snapshot);
      world.updateActiveDocument(reason, snapshot);
      syncHistory();
      syncSelection();
      emitSceneChanged(reason);
    },
    redo() {
      world.redo();
      syncScene("redo");
      events.emit("command:redone", {
        doneCount: world.history.done.length,
        label: world.history.done.at(-1)?.label ?? "redo",
        revision: scene.revision,
        undoneCount: world.history.undone.length
      });
    },
    removeEntity(entityId, reason = "entity:remove") {
      scene.removeEntity(entityId);
      const snapshot = captureCommittedSnapshot(reason);

      if (!snapshot) {
        return;
      }

      world.updateActiveDocument(reason, snapshot);
      syncHistory();
      emitSceneChanged(reason);
    },
    removeNode(nodeId, reason = "node:remove") {
      scene.removeNode(nodeId);
      const snapshot = captureCommittedSnapshot(reason);

      if (!snapshot) {
        return;
      }

      world.updateActiveDocument(reason, snapshot);
      syncHistory();
      emitSceneChanged(reason);
    },
    scene,
    select(ids, mode = selection.mode) {
      const activeDocumentId = world.world.workingSet.activeDocumentId;

      if (!activeDocumentId) {
        return;
      }

      world.select(
        Array.from(ids, (id) => {
          const node = scene.getNode(id);
          return node
            ? ({
                documentId: activeDocumentId,
                kind: "node",
                nodeId: id
              } satisfies WorldNodeHandle)
            : ({
                documentId: activeDocumentId,
                entityId: id,
                kind: "entity"
              } satisfies WorldEntityHandle);
        }),
        mode
      );
    },
    selection,
    syncFromWorld(reason = "world:sync") {
      syncScene(reason);
    },
    undo() {
      world.undo();
      syncScene("undo");
      events.emit("command:undone", {
        doneCount: world.history.done.length,
        label: world.history.undone.at(-1)?.label ?? "undo",
        revision: scene.revision,
        undoneCount: world.history.undone.length
      });
    }
  };

  world.events.on("selection:changed", () => {
    syncSelection();
  });
  world.events.on("active-document:changed", () => {
    syncScene("world:active-document");
  });

  syncScene("world:init");
  return adapter;
}

export function createWorldBundleFromLegacyScene(snapshot: SceneDocumentSnapshot): WorldPersistenceBundle {
  const normalizedSnapshot = normalizeSceneDocumentSnapshot(snapshot);
  const documentId = "document:main";
  const partitionId = "partition:main";
  const documentSnapshot: AuthoringDocumentSnapshot = {
    ...structuredClone(normalizedSnapshot),
    crossDocumentRefs: [],
    documentId,
    metadata: {
      documentId,
      mount: {
        transform: makeTransform()
      },
      name: normalizedSnapshot.metadata?.projectName ?? "Main Scene",
      partitionIds: [partitionId],
      path: `/documents/${documentId}.json`,
      slug: normalizedSnapshot.metadata?.projectSlug ?? "main-scene",
      tags: ["legacy-import"]
    },
    version: 1
  };

  return {
    documents: {
      [documentId]: documentSnapshot
    },
    manifest: {
      activeDocumentId: documentId,
      metadata: structuredClone(normalizedSnapshot.metadata),
      partitions: [
        {
          bounds: deriveSnapshotBounds(documentSnapshot),
          documentIds: [documentId],
          id: partitionId,
          name: "Main Partition",
          path: `/partitions/${partitionId}.json`,
          tags: ["legacy-import"]
        }
      ],
      version: 1
    },
    partitions: {
      [partitionId]: {
        bounds: deriveSnapshotBounds(documentSnapshot),
        id: partitionId,
        loadDistance: 256,
        members: [
          {
            documentId,
            kind: "document"
          }
        ],
        name: "Main Partition",
        path: `/partitions/${partitionId}.json`,
        tags: ["legacy-import"],
        unloadDistance: 320,
        version: 1
      }
    },
    sharedAssets: {
      assets: [],
      materials: [],
      textures: [],
      version: 1
    },
    version: 1
  };
}

export function refreshWorldManifest(bundle: WorldPersistenceBundle): WorldManifest {
  const partitionIdsByDocumentId = new Map<DocumentID, PartitionID[]>();

  Object.values(bundle.partitions).forEach((partition) => {
    partition.members.forEach((member) => {
      if (member.kind !== "document") {
        return;
      }

      const existing = partitionIdsByDocumentId.get(member.documentId);

      if (existing) {
        existing.push(partition.id);
        return;
      }

      partitionIdsByDocumentId.set(member.documentId, [partition.id]);
    });
  });

  return {
    activeDocumentId: bundle.manifest.activeDocumentId ?? Object.keys(bundle.documents)[0],
    metadata: structuredClone(bundle.manifest.metadata),
    partitions: Object.values(bundle.partitions).map((partition) => ({
      bounds: structuredClone(partition.bounds),
      documentIds: uniqueDocumentIds(
        partition.members.flatMap((member) => (member.kind === "document" ? [member.documentId] : []))
      ),
      id: partition.id,
      name: partition.name,
      path: partition.path,
      tags: [...partition.tags]
    })),
    version: 1
  };
}

export function validateWorldBundle(bundle: WorldPersistenceBundle, loadedDocumentIds: DocumentID[] = Object.keys(bundle.documents)): WorldValidationIssue[] {
  const issues: WorldValidationIssue[] = [];
  const knownDocumentIds = new Set(Object.keys(bundle.documents));
  const knownPartitionIds = new Set(Object.keys(bundle.partitions));

  loadedDocumentIds.forEach((documentId) => {
    if (!knownDocumentIds.has(documentId)) {
      issues.push({
        code: "document-not-loaded",
        message: `Loaded document ${documentId} is missing from storage.`,
        severity: "error"
      });
    }
  });

  Object.values(bundle.documents).forEach((document) => {
    document.metadata.partitionIds.forEach((partitionId) => {
      if (!knownPartitionIds.has(partitionId)) {
        issues.push({
          code: "missing-partition",
          message: `Document ${document.documentId} references missing partition ${partitionId}.`,
          severity: "error"
        });
      }
    });

    const mountParent = document.metadata.mount.parent;

    if (mountParent) {
      const parentDocument = bundle.documents[mountParent.documentId];
      const hasParentNode = parentDocument?.nodes.some((node) => node.id === mountParent.nodeId);

      if (!hasParentNode) {
        issues.push({
          code: "invalid-mount-target",
          message: `Document ${document.documentId} mounts to missing node ${mountParent.documentId}/${mountParent.nodeId}.`,
          severity: "error"
        });
      }
    }

    document.crossDocumentRefs.forEach((ref) => {
      if ("assetId" in ref.target) {
        const target = ref.target as Extract<CrossDocumentRef["target"], { assetId: string }>;
        const exists = bundle.sharedAssets.assets.some((asset) => asset.id === target.assetId);

        if (!exists && ref.required !== false) {
          issues.push({
            code: "missing-reference-target",
            message: `Reference ${ref.id} points to missing shared asset ${target.assetId}.`,
            severity: "error"
          });
        }
        return;
      }

      if ("materialId" in ref.target) {
        const target = ref.target as Extract<CrossDocumentRef["target"], { materialId: string }>;
        const exists = bundle.sharedAssets.materials.some((material) => material.id === target.materialId);

        if (!exists && ref.required !== false) {
          issues.push({
            code: "missing-reference-target",
            message: `Reference ${ref.id} points to missing shared material ${target.materialId}.`,
            severity: "error"
          });
        }
        return;
      }

      if ("textureId" in ref.target) {
        const target = ref.target as Extract<CrossDocumentRef["target"], { textureId: string }>;
        const exists = bundle.sharedAssets.textures.some((texture) => texture.id === target.textureId);

        if (!exists && ref.required !== false) {
          issues.push({
            code: "missing-reference-target",
            message: `Reference ${ref.id} points to missing shared texture ${target.textureId}.`,
            severity: "error"
          });
        }
        return;
      }

      const targetDocument = bundle.documents[ref.target.documentId];

      if (!targetDocument) {
        issues.push({
          code: "document-missing",
          message: `Reference ${ref.id} points to missing document ${ref.target.documentId}.`,
          severity: "error"
        });
        return;
      }

      const target = ref.target as WorldNodeHandle | WorldEntityHandle;
      const exists =
        target.kind === "node"
          ? targetDocument.nodes.some((node) => node.id === target.nodeId)
          : targetDocument.entities.some((entity) => entity.id === target.entityId);

      if (!exists && ref.required !== false) {
        issues.push({
          code: "missing-reference-target",
          message: `Reference ${ref.id} points to missing ${ref.target.kind} target.`,
          severity: "error"
        });
      }
    });
  });

  Object.values(bundle.partitions).forEach((partition) => {
    partition.members.forEach((member) => {
      if (member.kind === "document") {
        if (!bundle.documents[member.documentId]) {
          issues.push({
            code: "invalid-partition-membership",
            message: `Partition ${partition.id} includes missing document ${member.documentId}.`,
            severity: "error"
          });
        }

        return;
      }

      const targetDocument = bundle.documents[member.documentId];

      if (!targetDocument) {
        issues.push({
          code: "invalid-partition-membership",
          message: `Partition ${partition.id} includes member from missing document ${member.documentId}.`,
          severity: "error"
        });
        return;
      }

      const exists =
        member.kind === "node"
          ? targetDocument.nodes.some((node) => node.id === member.nodeId)
          : targetDocument.entities.some((entity) => entity.id === member.entityId);

      if (!exists) {
        issues.push({
          code: "invalid-partition-membership",
          message: `Partition ${partition.id} includes missing ${member.kind} target.`,
          severity: "error"
        });
      }
    });
  });

  return issues;
}

export function flattenWorldBundle(
  bundle: WorldPersistenceBundle,
  options: {
    activeDocumentId?: DocumentID;
    activeDocumentOverride?: SceneDocument;
    includeDocumentIds?: DocumentID[];
  } = {}
): SceneDocumentSnapshot {
  const includeDocumentIds = options.includeDocumentIds ?? Object.keys(bundle.documents);
  const nodes: GeometryNode[] = [];
  const entities: Entity[] = [];
  const materials: Material[] = [];
  const textures: TextureRecord[] = [];
  const assets: Asset[] = [];
  const layers: SceneDocumentSnapshot["layers"] = [];
  const seenMaterialIds = new Set<string>();
  const seenTextureIds = new Set<string>();
  const seenAssetIds = new Set<string>();
  const seenLayerIds = new Set<string>();

  includeDocumentIds.forEach((documentId) => {
    const sourceSnapshot =
      options.activeDocumentOverride && options.activeDocumentId === documentId
        ? {
            ...createSceneDocumentSnapshot(options.activeDocumentOverride),
            crossDocumentRefs: bundle.documents[documentId]?.crossDocumentRefs ?? [],
            documentId,
            metadata: bundle.documents[documentId]?.metadata ?? createDefaultDocumentMetadata(documentId, "Document"),
            version: 1 as const
          }
        : bundle.documents[documentId];

    if (!sourceSnapshot) {
      return;
    }

    const documentTransform = resolveDocumentMountTransform(bundle, documentId);
    const nodeIdMap = new Map(sourceSnapshot.nodes.map((node) => [node.id, namespaceId(documentId, node.id)]));

    sourceSnapshot.nodes.forEach((node) => {
      const remappedNode = remapNodeForWorld(sourceSnapshot, documentId, node, nodeIdMap, documentTransform);
      nodes.push(remappedNode);
    });

    sourceSnapshot.entities.forEach((entity) => {
      entities.push({
        ...structuredClone(entity),
        id: namespaceId(documentId, entity.id),
        parentId: entity.parentId ? nodeIdMap.get(entity.parentId) : undefined,
        transform: entity.parentId ? structuredClone(entity.transform) : composeTransforms(documentTransform, entity.transform)
      });
    });

    sourceSnapshot.materials.forEach((material) => {
      const nextMaterial = remapMaterialForWorld(
        {
          ...structuredClone(material),
          id: namespaceId(documentId, material.id)
        },
        (textureId) => namespaceId(documentId, textureId)
      );

      if (!seenMaterialIds.has(nextMaterial.id)) {
        seenMaterialIds.add(nextMaterial.id);
        materials.push(nextMaterial);
      }
    });

    sourceSnapshot.textures.forEach((texture) => {
      const nextTexture = {
        ...structuredClone(texture),
        id: namespaceId(documentId, texture.id)
      };

      if (!seenTextureIds.has(nextTexture.id)) {
        seenTextureIds.add(nextTexture.id);
        textures.push(nextTexture);
      }
    });

    sourceSnapshot.assets.forEach((asset) => {
      const nextAsset = {
        ...structuredClone(asset),
        id: namespaceId(documentId, asset.id)
      };

      if (!seenAssetIds.has(nextAsset.id)) {
        seenAssetIds.add(nextAsset.id);
        assets.push(nextAsset);
      }
    });

    sourceSnapshot.layers.forEach((layer) => {
      const nextLayer = {
        ...structuredClone(layer),
        id: namespaceId(documentId, layer.id)
      };

      if (!seenLayerIds.has(nextLayer.id)) {
        seenLayerIds.add(nextLayer.id);
        layers.push(nextLayer);
      }
    });
  });

  return {
    assets: [...assets, ...bundle.sharedAssets.assets.map((asset) => ({ ...structuredClone(asset), id: namespaceSharedId(asset.id) }))],
    entities,
    layers,
    materials: [
      ...materials,
      ...bundle.sharedAssets.materials.map((material) =>
        remapMaterialForWorld(
          { ...structuredClone(material), id: namespaceSharedId(material.id) },
          namespaceSharedId
        )
      )
    ],
    metadata: structuredClone(bundle.manifest.metadata),
    nodes,
    settings: resolveFlattenedWorldSettings(bundle, includeDocumentIds[0]),
    textures: [...textures, ...bundle.sharedAssets.textures.map((texture) => ({ ...structuredClone(texture), id: namespaceSharedId(texture.id) }))]
  };
}

function remapMaterialForWorld(material: Material, remapTextureId: (textureId: string) => string): Material {
  const nextMaterial = structuredClone(material);

  MATERIAL_TEXTURE_FIELDS.forEach((field) => {
    const reference = nextMaterial[field];

    if (typeof reference === "string" && isTextureReferenceId(reference)) {
      nextMaterial[field] = remapTextureId(reference);
    }
  });

  return nextMaterial;
}

function cloneWorldBundle(bundle: WorldPersistenceBundle): WorldPersistenceBundle {
  return structuredClone(bundle);
}

export function normalizeWorldPersistenceBundle(bundle: WorldPersistenceBundle): WorldPersistenceBundle {
  return {
    ...structuredClone(bundle),
    documents: Object.fromEntries(
      Object.entries(bundle.documents).map(([documentId, snapshot]) => {
        const normalizedScene = normalizeSceneDocumentSnapshot(snapshot);

        return [
          documentId,
          {
            ...structuredClone(snapshot),
            assets: normalizedScene.assets,
            entities: normalizedScene.entities,
            layers: normalizedScene.layers,
            materials: normalizedScene.materials,
            nodes: normalizedScene.nodes,
            settings: normalizedScene.settings,
            textures: normalizedScene.textures
          } satisfies AuthoringDocumentSnapshot
        ];
      })
    )
  };
}

function createDefaultDocumentMetadata(documentId: DocumentID, name: string): AuthoringDocumentMetadata {
  return {
    documentId,
    mount: {
      transform: makeTransform()
    },
    name,
    partitionIds: [],
    path: `/documents/${documentId}.json`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    tags: []
  };
}

function createInitialWorkingSet(bundle: WorldPersistenceBundle): WorkingSetState {
  const documentIds = Object.keys(bundle.documents);
  const activeDocumentId = bundle.manifest.activeDocumentId ?? documentIds[0];
  return {
    activeDocumentId,
    backgroundDocumentIds: [],
    loadedDocumentIds: activeDocumentId ? [activeDocumentId] : [],
    mode: "scene",
    pinnedDocumentIds: activeDocumentId ? [activeDocumentId] : []
  };
}

function dedupeSelectionHandles(handles: Iterable<WorldSelectionHandle>) {
  const seen = new Set<string>();
  const deduped: WorldSelectionHandle[] = [];

  for (const handle of handles) {
    const key = JSON.stringify(handle);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(structuredClone(handle));
  }

  return deduped;
}

function deriveSnapshotBounds(snapshot: SceneDocumentSnapshot): Bounds3 | undefined {
  const positions = snapshot.nodes.map((node) => node.transform.position);

  if (positions.length === 0) {
    return undefined;
  }

  return createBounds(
    vec3(
      Math.min(...positions.map((position) => position.x)),
      Math.min(...positions.map((position) => position.y)),
      Math.min(...positions.map((position) => position.z))
    ),
    vec3(
      Math.max(...positions.map((position) => position.x)),
      Math.max(...positions.map((position) => position.y)),
      Math.max(...positions.map((position) => position.z))
    )
  );
}

function derivePartitionBounds(bundle: WorldPersistenceBundle, partition: StreamingPartition): Bounds3 | undefined {
  const indexCache = new Map<DocumentID, DocumentSpatialIndex>();
  const bounds: Bounds3[] = [];

  const resolveDocumentIndex = (documentId: DocumentID) => {
    const cached = indexCache.get(documentId);

    if (cached) {
      return cached;
    }

    const snapshot = bundle.documents[documentId];

    if (!snapshot) {
      return undefined;
    }

    const index = createDocumentSpatialIndex(
      documentId,
      snapshot.nodes,
      snapshot.entities,
      resolveDocumentMountTransform(bundle, documentId)
    );
    indexCache.set(documentId, index);
    return index;
  };

  partition.members.forEach((member) => {
    if (member.kind === "document") {
      const documentBounds = resolveDocumentIndex(member.documentId)?.getBounds();

      if (documentBounds) {
        bounds.push(documentBounds);
      }

      return;
    }

    const index = resolveDocumentIndex(member.documentId);
    const entry = index
      ? Array.from(index.entries.values()).find((candidate) => {
          if (member.kind === "node") {
            return candidate.handle.kind === "node" && candidate.handle.nodeId === member.nodeId;
          }

          return candidate.handle.kind === "entity" && candidate.handle.entityId === member.entityId;
        })
      : undefined;

    if (entry) {
      bounds.push(entry.bounds);
    }
  });

  return mergeBounds(bounds);
}

function isWorldPersistenceBundle(value: WorldPersistenceBundle | SceneDocumentSnapshot): value is WorldPersistenceBundle {
  return "documents" in value && "manifest" in value && "partitions" in value;
}

function namespaceId(documentId: DocumentID, id: string) {
  return `${documentId}::${id}`;
}

function namespaceSharedId(id: string) {
  return `shared::${id}`;
}

function remapAssetId(documentId: DocumentID, assetId: string) {
  return namespaceId(documentId, assetId);
}

function remapMaterialId(documentId: DocumentID, materialId?: string) {
  return materialId ? namespaceId(documentId, materialId) : undefined;
}

function remapNodeForWorld(
  snapshot: AuthoringDocumentSnapshot,
  documentId: DocumentID,
  node: GeometryNode,
  nodeIdMap: Map<string, string>,
  documentTransform: Transform
): GeometryNode {
  const remappedNode = structuredClone(node);
  remappedNode.id = nodeIdMap.get(node.id) ?? namespaceId(documentId, node.id);
  remappedNode.parentId = node.parentId ? nodeIdMap.get(node.parentId) : undefined;

  if (!node.parentId) {
    remappedNode.transform = composeTransforms(documentTransform, node.transform);
  }

  if (isPrimitiveNode(remappedNode)) {
    remappedNode.data.materialId = remapMaterialId(documentId, remappedNode.data.materialId);
  }

  if (isBrushNode(remappedNode)) {
    remappedNode.data.faces = remappedNode.data.faces.map((face) => ({
      ...face,
      materialId: remapMaterialId(documentId, face.materialId)
    }));
  }

  if (isMeshNode(remappedNode)) {
    remappedNode.data.faces = remappedNode.data.faces.map((face) => ({
      ...face,
      materialId: remapMaterialId(documentId, face.materialId)
    }));
  }

  if (isModelNode(remappedNode)) {
    remappedNode.data.assetId = remapAssetId(documentId, remappedNode.data.assetId);
  }

  if (isInstancingNode(remappedNode)) {
    remappedNode.data.sourceNodeId =
      nodeIdMap.get(remappedNode.data.sourceNodeId) ?? namespaceId(documentId, remappedNode.data.sourceNodeId);
  }

  return remappedNode;
}

function resolveCommittedNodeWorldTransform(bundle: WorldPersistenceBundle, handle: WorldNodeHandle, stack = new Set<string>()): Transform | undefined {
  const key = `${handle.documentId}:${handle.nodeId}`;

  if (stack.has(key)) {
    return undefined;
  }

  const snapshot = bundle.documents[handle.documentId];

  if (!snapshot) {
    return undefined;
  }

  stack.add(key);
  const sceneGraph = resolveSceneGraph(snapshot.nodes, snapshot.entities);
  const nodeTransform = sceneGraph.nodeWorldTransforms.get(handle.nodeId);
  stack.delete(key);

  if (!nodeTransform) {
    return undefined;
  }

  return composeTransforms(resolveDocumentMountTransform(bundle, handle.documentId, stack), nodeTransform);
}

function resolveDocumentMountTransform(bundle: WorldPersistenceBundle, documentId: DocumentID, stack = new Set<string>()): Transform {
  const snapshot = bundle.documents[documentId];
  const mount = snapshot?.metadata.mount;

  if (!mount) {
    return makeTransform();
  }

  if (!mount.parent) {
    return structuredClone(mount.transform);
  }

  const parentTransform = resolveCommittedNodeWorldTransform(bundle, mount.parent, stack);
  return parentTransform ? composeTransforms(parentTransform, mount.transform) : structuredClone(mount.transform);
}

function resolveFlattenedWorldSettings(bundle: WorldPersistenceBundle, firstDocumentId?: DocumentID) {
  if (!firstDocumentId) {
    return createSceneDocumentSnapshot(createSceneDocument()).settings;
  }

  return structuredClone(bundle.documents[firstDocumentId]?.settings ?? createSceneDocumentSnapshot(createSceneDocument()).settings);
}

function uniqueDocumentIds(documentIds: DocumentID[]) {
  return Array.from(new Set(documentIds));
}
