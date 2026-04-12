import type { SceneDocumentSnapshot } from "../document/scene-document";
import type { Vec3 } from "@ggez/shared";
import { addVec3 } from "@ggez/shared";
import type {
  AuthoringDocumentSnapshot,
  DocumentID,
  WorldCommand,
  WorldEntityHandle,
  WorldNodeHandle,
  WorldSelectionHandle
} from "./types";

export function createSetWorldSelectionCommand(handles: WorldSelectionHandle[], mode: "edge" | "face" | "object" | "vertex" = "object"): WorldCommand {
  return {
    execute(world) {
      const selectionBefore = world.getSelectionSnapshot();
      return world.createTransaction({
        documentChanges: [],
        label: "set world selection",
        partitionChanges: [],
        selectionAfter: {
          handles,
          mode,
          revision: selectionBefore.revision + 1
        },
        selectionBefore,
        workingSetAfter: world.getWorkingSet(),
        workingSetBefore: world.getWorkingSet()
      });
    },
    label: "set world selection"
  };
}

export function createTranslateWorldSelectionCommand(handles: Array<WorldEntityHandle | WorldNodeHandle>, delta: Vec3): WorldCommand {
  return {
    execute(world) {
      const bundle = world.exportBundle();
      const changedDocuments = new Map<DocumentID, { after: AuthoringDocumentSnapshot; before: AuthoringDocumentSnapshot }>();

      handles.forEach((handle) => {
        const snapshot = bundle.documents[handle.documentId];

        if (!snapshot) {
          return;
        }

        const entry = changedDocuments.get(handle.documentId) ?? {
          after: structuredClone(snapshot),
          before: structuredClone(snapshot)
        };

        if (handle.kind === "node") {
          entry.after.nodes = entry.after.nodes.map((node) =>
            node.id === handle.nodeId
              ? {
                  ...node,
                  transform: {
                    ...node.transform,
                    position: addVec3(node.transform.position, delta)
                  }
                }
              : node
          );
        } else {
          entry.after.entities = entry.after.entities.map((entity) =>
            entity.id === handle.entityId
              ? {
                  ...entity,
                  transform: {
                    ...entity.transform,
                    position: addVec3(entity.transform.position, delta)
                  }
                }
              : entity
          );
        }

        changedDocuments.set(handle.documentId, entry);
      });

      if (changedDocuments.size === 0) {
        return undefined;
      }

      return world.createTransaction({
        documentChanges: Array.from(changedDocuments.entries()).map(([documentId, change]) => ({
          after: change.after,
          before: change.before,
          documentId
        })),
        label: "translate world selection",
        partitionChanges: [],
        selectionAfter: world.getSelectionSnapshot(),
        selectionBefore: world.getSelectionSnapshot(),
        workingSetAfter: world.getWorkingSet(),
        workingSetBefore: world.getWorkingSet()
      });
    },
    label: "translate world selection"
  };
}

export function createDeleteWorldSelectionCommand(handles: Array<WorldEntityHandle | WorldNodeHandle>): WorldCommand {
  return {
    execute(world) {
      const bundle = world.exportBundle();
      const changedDocuments = new Map<DocumentID, { after: AuthoringDocumentSnapshot; before: AuthoringDocumentSnapshot }>();

      handles.forEach((handle) => {
        const snapshot = bundle.documents[handle.documentId];

        if (!snapshot) {
          return;
        }

        const entry = changedDocuments.get(handle.documentId) ?? {
          after: structuredClone(snapshot),
          before: structuredClone(snapshot)
        };

        if (handle.kind === "node") {
          const removedNodeIds = collectNodeSubtreeIds(entry.after, handle.nodeId);
          entry.after.nodes = entry.after.nodes.filter((node) => !removedNodeIds.has(node.id));
          entry.after.entities = entry.after.entities.filter((entity) => !entity.parentId || !removedNodeIds.has(entity.parentId));
        } else {
          entry.after.entities = entry.after.entities.filter((entity) => entity.id !== handle.entityId);
        }

        changedDocuments.set(handle.documentId, entry);
      });

      if (changedDocuments.size === 0) {
        return undefined;
      }

      return world.createTransaction({
        documentChanges: Array.from(changedDocuments.entries()).map(([documentId, change]) => ({
          after: change.after,
          before: change.before,
          documentId
        })),
        label: "delete world selection",
        partitionChanges: [],
        selectionAfter: {
          handles: [],
          mode: world.getSelectionSnapshot().mode,
          revision: world.getSelectionSnapshot().revision + 1
        },
        selectionBefore: world.getSelectionSnapshot(),
        workingSetAfter: world.getWorkingSet(),
        workingSetBefore: world.getWorkingSet()
      });
    },
    label: "delete world selection"
  };
}

export function createMoveNodeToDocumentCommand(
  source: WorldNodeHandle,
  targetDocumentId: DocumentID,
  options: {
    nextParentId?: string;
  } = {}
): WorldCommand {
  return {
    execute(world) {
      const bundle = world.exportBundle();
      const sourceDocument = bundle.documents[source.documentId];
      const targetDocument = bundle.documents[targetDocumentId];

      if (!sourceDocument || !targetDocument) {
        return undefined;
      }

      const movedNodeIds = collectNodeSubtreeIds(sourceDocument, source.nodeId);
      const movedNodes = sourceDocument.nodes.filter((node) => movedNodeIds.has(node.id));
      const movedEntities = sourceDocument.entities.filter((entity) => entity.parentId && movedNodeIds.has(entity.parentId));

      if (movedNodes.length === 0) {
        return undefined;
      }

      const nextSource = structuredClone(sourceDocument);
      nextSource.nodes = nextSource.nodes.filter((node) => !movedNodeIds.has(node.id));
      nextSource.entities = nextSource.entities.filter((entity) => !entity.parentId || !movedNodeIds.has(entity.parentId));

      const nextTarget = structuredClone(targetDocument);
      const rootNodeId = movedNodes.find((node) => node.id === source.nodeId)?.id;

      nextTarget.nodes.push(
        ...movedNodes.map((node) => ({
          ...structuredClone(node),
          parentId: node.id === rootNodeId ? options.nextParentId : node.parentId
        }))
      );
      nextTarget.entities.push(...movedEntities.map((entity) => structuredClone(entity)));

      return world.createTransaction({
        documentChanges: [
          {
            after: nextSource,
            before: structuredClone(sourceDocument),
            documentId: source.documentId
          },
          {
            after: nextTarget,
            before: structuredClone(targetDocument),
            documentId: targetDocumentId
          }
        ],
        label: "move node to document",
        partitionChanges: [],
        selectionAfter: {
          handles: [
            {
              documentId: targetDocumentId,
              kind: "node",
              nodeId: source.nodeId
            }
          ],
          mode: world.getSelectionSnapshot().mode,
          revision: world.getSelectionSnapshot().revision + 1
        },
        selectionBefore: world.getSelectionSnapshot(),
        workingSetAfter: {
          ...world.getWorkingSet(),
          loadedDocumentIds: Array.from(new Set([...world.getWorkingSet().loadedDocumentIds, targetDocumentId]))
        },
        workingSetBefore: world.getWorkingSet()
      });
    },
    label: "move node to document"
  };
}

function collectNodeSubtreeIds(snapshot: SceneDocumentSnapshot, rootNodeId: string) {
  const result = new Set<string>();
  const queue = [rootNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (result.has(nodeId)) {
      continue;
    }

    result.add(nodeId);
    snapshot.nodes.forEach((node) => {
      if (node.parentId === nodeId) {
        queue.push(node.id);
      }
    });
  }

  return result;
}
