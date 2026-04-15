import {
  axisDelta,
  createDeleteSelectionCommand,
  createExtrudeBrushNodesCommand,
  createDuplicateNodesCommand,
  createInstanceNodesCommand,
  createPlaceInstancingNodesCommand,
  createGroupSelectionCommand,
  createPlaceLightNodeCommand,
  createPlaceBlockoutPlatformCommand,
  createPlaceBlockoutRoomCommand,
  createPlaceBlockoutStairCommand,
  createReplaceNodesCommand,
  createPlacePrimitiveNodeCommand,
  createSetBrushDataCommand,
  createSetEntityCommand,
  createSetMeshDataCommand,
  createSetMeshMaterialLayersCommand,
  createSetNodeCommand,
  createSetNodeTransformCommand,
  createPlaceEntityCommand,
  createMeshRaiseTopCommand,
  createMirrorNodesCommand,
  createPlaceBrushNodeCommand,
  createPlaceMeshNodeCommand,
  createSetSceneSettingsCommand,
  createSplitBrushNodeAtCoordinateCommand,
  createSplitBrushNodesCommand,
  createTranslateNodesCommand,
  type EditorCore,
  type TransformAxis,
  type WorldEditorCore
} from "@ggez/editor-core";
import { convertBrushToEditableMesh, invertEditableMeshNormals } from "@ggez/geometry-kernel";
import type { DerivedRenderScene } from "@ggez/render-pipeline";
import {
  isBrushNode,
  isInstancingNode,
  isInstancingSourceNode,
  isLightNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  makeTransform,
  snapVec3,
  type Brush,
  type EditableMesh,
  type Entity,
  type EntityType,
  type GeometryNode,
  type LightNodeData,
  type LightType,
  type MeshNode,
  type ModelReference,
  type PrimitiveNodeData,
  type SceneSettings,
  type Transform,
  type Vec3
} from "@ggez/shared";
import type { PrimitiveShape } from "@ggez/shared";
import type { WorkerJob } from "@ggez/workers";
import { queueMeshEditToolbarAction, toolSessionStore } from "@/state/tool-session-store";
import { sceneSessionStore } from "@/state/scene-session-store";
import { uiStore } from "@/state/ui-store";
import {
  createDefaultEntity,
  createDefaultLightData,
  createDefaultPrimitiveTransform,
  createLightNodeLabel,
  createPrimitiveNodeData,
  createPrimitiveNodeLabel
} from "@/lib/authoring";
import { convertPrimitiveNodeToMeshNode } from "@/lib/primitive-to-mesh";
import { createEditableMeshFromPlane, createEditableMeshFromPrimitiveData } from "@/lib/primitive-to-mesh";
import { toggleSceneItemId } from "@/lib/scene-hierarchy";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import { focusViewportOnPoint, viewportPaneIds } from "@/viewport/viewports";

type WorkingSetState = {
  activeDocumentId?: string;
  loadedDocumentIds: string[];
  mode: "scene" | "world";
  pinnedDocumentIds: string[];
};

export function useSceneMutationActions({
  activeWorldDocumentId,
  blockedSceneItemIdSet,
  bumpSceneRevision,
  editor,
  enqueueWorkerJob,
  renderScene,
  syncEditorFromWorld,
  workingSet,
  worldEditor
}: {
  activeWorldDocumentId?: string;
  blockedSceneItemIdSet: Set<string>;
  bumpSceneRevision: () => void;
  editor: EditorCore;
  enqueueWorkerJob: (label: string, task: WorkerJob["task"], durationMs?: number) => void;
  renderScene: DerivedRenderScene;
  syncEditorFromWorld: (reason: string) => void;
  workingSet: WorkingSetState;
  worldEditor: WorldEditorCore;
}) {
  const resolveDocumentScopedId = (id: string) => {
    const separatorIndex = id.indexOf("::");

    if (separatorIndex < 0) {
      return {
        documentId: activeWorldDocumentId,
        localId: id
      };
    }

    return {
      documentId: id.slice(0, separatorIndex),
      localId: id.slice(separatorIndex + 2)
    };
  };

  const resolveActiveViewportState = () => uiStore.viewports[uiStore.activeViewportId];

  const resolvePlacementPosition = (size: Vec3) => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));

    return {
      x: snappedTarget.x,
      y: Math.max(size.y * 0.5, snappedTarget.y),
      z: snappedTarget.z
    };
  };

  const resolvePlacementTarget = () => {
    const activeViewportState = resolveActiveViewportState();
    return snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
  };

  const handleSelectNodes = (nodeIds: string[]) => {
    if (toolSessionStore.physicsPlayback !== "stopped") {
      return;
    }

    const firstResolved = nodeIds[0] ? resolveDocumentScopedId(nodeIds[0]) : undefined;

    if (firstResolved?.documentId && firstResolved.documentId !== activeWorldDocumentId) {
      worldEditor.setActiveDocument(firstResolved.documentId);
      syncEditorFromWorld("world:select-document");
    }

    const localIds = nodeIds
      .map((nodeId) => resolveDocumentScopedId(nodeId))
      .filter((resolved) => resolved.documentId === (firstResolved?.documentId ?? activeWorldDocumentId))
      .map((resolved) => resolved.localId)
      .filter((nodeId) => !blockedSceneItemIdSet.has(nodeId));

    editor.select(localIds, "object");
  };

  const handleToggleSceneItemVisibility = (itemId: string) => {
    sceneSessionStore.hiddenSceneItemIds = toggleSceneItemId(sceneSessionStore.hiddenSceneItemIds, itemId);
  };

  const handleToggleSceneItemLock = (itemId: string) => {
    sceneSessionStore.lockedSceneItemIds = toggleSceneItemId(sceneSessionStore.lockedSceneItemIds, itemId);
  };

  const handleClearSelection = () => {
    editor.clearSelection();
  };

  const handleFocusNode = (nodeId: string) => {
    const resolved = resolveDocumentScopedId(nodeId);

    if (resolved.documentId && resolved.documentId !== activeWorldDocumentId) {
      worldEditor.setActiveDocument(resolved.documentId);
      syncEditorFromWorld("world:focus-document");
    }

    const node = editor.scene.getNode(resolved.localId);

    if (!node) {
      const entity = editor.scene.getEntity(resolved.localId);

      if (!entity) {
        return;
      }

      viewportPaneIds.forEach((viewportId) => {
        focusViewportOnPoint(
          uiStore.viewports[viewportId],
          renderScene.entityTransforms.get(
            workingSet.mode === "world" && resolved.documentId ? `${resolved.documentId}::${entity.id}` : entity.id
          )?.position ?? entity.transform.position
        );
      });
      return;
    }

    viewportPaneIds.forEach((viewportId) => {
      focusViewportOnPoint(
        uiStore.viewports[viewportId],
        renderScene.nodeTransforms.get(
          workingSet.mode === "world" && resolved.documentId ? `${resolved.documentId}::${node.id}` : node.id
        )?.position ?? node.transform.position
      );
    });
  };

  const handleMeshEditToolbarAction = (kind: Parameters<typeof queueMeshEditToolbarAction>[0]) => {
    queueMeshEditToolbarAction(kind);
  };

  const handleUpdateNode = (nodeId: string, nextNode: GeometryNode, beforeNode?: GeometryNode) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    editor.execute(createSetNodeCommand(editor.scene, nodeId, nextNode, beforeNode));
  };

  const handleUpdateNodeTransform = (
    nodeId: string,
    transform: Parameters<typeof createSetNodeTransformCommand>[2],
    beforeTransform?: Parameters<typeof createSetNodeTransformCommand>[3]
  ) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    editor.execute(createSetNodeTransformCommand(editor.scene, nodeId, transform, beforeTransform));
    enqueueWorkerJob(
      "Transform update",
      { task: node.kind === "brush" ? "brush-rebuild" : "triangulation", worker: "geometryWorker" },
      550
    );
  };

  const handlePreviewBrushData = (nodeId: string, brush: Brush) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isBrushNode(node)) {
      return;
    }

    node.data = structuredClone(brush);
    editor.scene.touch();
    bumpSceneRevision();
  };

  const handleUpdateBrushData = (nodeId: string, brush: Brush, beforeBrush?: Brush) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isBrushNode(node)) {
      return;
    }

    editor.execute(createSetBrushDataCommand(editor.scene, nodeId, brush, beforeBrush));
    enqueueWorkerJob("Brush edit", { task: "brush-rebuild", worker: "geometryWorker" }, 700);
  };

  const handleSplitBrushAtCoordinate = (nodeId: string, axis: TransformAxis, coordinate: number) => {
    const { command, splitIds } = createSplitBrushNodeAtCoordinateCommand(editor.scene, nodeId, axis, coordinate);

    if (splitIds.length === 0) {
      return;
    }

    editor.execute(command);
    editor.select(splitIds, "object");
    enqueueWorkerJob("Clip brush", { task: "clip", worker: "geometryWorker" }, 950);
  };

  const handlePreviewMeshData = (nodeId: string, mesh: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    node.data = preserveMeshMetadata(mesh, node.data);
    editor.scene.touch();
    bumpSceneRevision();
  };

  const handleUpdateMeshData = (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    editor.execute(createSetMeshDataCommand(editor.scene, nodeId, preserveMeshMetadata(mesh, node.data), beforeMesh));
    enqueueWorkerJob("Mesh edit", { task: "triangulation", worker: "meshWorker" }, 800);
  };

  const handleCommitMeshMaterialLayers = (
    nodeId: string,
    layers: EditableMesh["materialLayers"],
    beforeLayers?: EditableMesh["materialLayers"]
  ) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    editor.execute(
      createSetMeshMaterialLayersCommand(editor.scene, nodeId, structuredClone(layers), structuredClone(beforeLayers))
    );
    bumpSceneRevision();
  };

  const handlePreviewNodeTransform = (nodeId: string, transform: Transform) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    node.transform = isInstancingNode(node)
      ? {
          position: structuredClone(transform.position),
          rotation: structuredClone(transform.rotation),
          scale: structuredClone(transform.scale)
        }
      : structuredClone(transform);
    editor.scene.touch();
    bumpSceneRevision();
  };

  const handlePreviewEntityTransform = (entityId: string, transform: Transform) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    entity.transform = structuredClone(transform);
    editor.scene.touch();
    bumpSceneRevision();
  };

  const handleUpdateEntity = (entityId: string, nextEntity: Entity, beforeEntity?: Entity) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    editor.execute(createSetEntityCommand(editor.scene, entityId, nextEntity, beforeEntity));
    enqueueWorkerJob("Entity update", { task: "navmesh", worker: "navWorker" }, 450);
  };

  const handleUpdateEntityTransform = (entityId: string, transform: Transform, beforeTransform?: Transform) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    handleUpdateEntity(
      entityId,
      {
        ...structuredClone(entity),
        transform: structuredClone(transform)
      },
      beforeTransform
        ? {
            ...structuredClone(entity),
            transform: structuredClone(beforeTransform)
          }
        : entity
    );
  };

  const handleUpdateEntityProperties = (
    entityId: string,
    properties: Entity["properties"],
    beforeProperties?: Entity["properties"]
  ) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    handleUpdateEntity(
      entityId,
      {
        ...structuredClone(entity),
        properties: structuredClone(properties)
      },
      beforeProperties
        ? {
            ...structuredClone(entity),
            properties: structuredClone(beforeProperties)
          }
        : entity
    );
  };

  const handleUpdateNodeHooks = (
    nodeId: string,
    hooks: NonNullable<GeometryNode["hooks"]>,
    beforeHooks?: NonNullable<GeometryNode["hooks"]>
  ) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    handleUpdateNode(
      nodeId,
      {
        ...structuredClone(node),
        hooks: structuredClone(hooks)
      },
      beforeHooks
        ? {
            ...structuredClone(node),
            hooks: structuredClone(beforeHooks)
          }
        : node
    );
  };

  const handleUpdateEntityHooks = (
    entityId: string,
    hooks: NonNullable<Entity["hooks"]>,
    beforeHooks?: NonNullable<Entity["hooks"]>
  ) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    handleUpdateEntity(
      entityId,
      {
        ...structuredClone(entity),
        hooks: structuredClone(hooks)
      },
      beforeHooks
        ? {
            ...structuredClone(entity),
            hooks: structuredClone(beforeHooks)
          }
        : entity
    );
  };

  const handleTranslateSelection = (axis: TransformAxis, direction: -1 | 1) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const delta = axisDelta(axis, resolveViewportSnapSize(resolveActiveViewportState()) * direction);
    editor.execute(createTranslateNodesCommand(editor.selection.ids, delta));
    enqueueWorkerJob("Geometry rebuild", { task: "brush-rebuild", worker: "geometryWorker" }, 700);
  };

  const handleDuplicateSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const { command, duplicateIds } = createDuplicateNodesCommand(
      editor.scene,
      editor.selection.ids,
      axisDelta("x", resolveViewportSnapSize(resolveActiveViewportState()))
    );

    editor.execute(command);
    editor.select(duplicateIds, "object");
    enqueueWorkerJob("Duplicate selection", { task: "triangulation", worker: "geometryWorker" }, 700);
  };

  const handleInstanceSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const { command, instanceIds } = createInstanceNodesCommand(
      editor.scene,
      editor.selection.ids,
      axisDelta("x", resolveViewportSnapSize(resolveActiveViewportState()))
    );

    if (instanceIds.length === 0) {
      return;
    }

    editor.execute(command);
    editor.select(instanceIds, "object");
  };

  const handleGroupSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const result = createGroupSelectionCommand(editor.scene, editor.selection.ids);

    if (!result) {
      return;
    }

    editor.execute(result.command);
    editor.select([result.groupId], "object");
    enqueueWorkerJob("Group selection", { task: "triangulation", worker: "geometryWorker" }, 550);
  };

  const handleDeleteSelection = () => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    editor.execute(createDeleteSelectionCommand(editor.scene, editor.selection.ids));
    editor.clearSelection();
    enqueueWorkerJob("Delete selection", { task: "brush-rebuild", worker: "geometryWorker" }, 550);
  };

  const handleMirrorSelection = (axis: TransformAxis) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    editor.execute(createMirrorNodesCommand(editor.selection.ids, axis));
    enqueueWorkerJob("Mirror selection", { task: "triangulation", worker: "geometryWorker" }, 700);
  };

  const handleClipSelection = (axis: TransformAxis) => {
    const { command, splitIds } = createSplitBrushNodesCommand(editor.scene, editor.selection.ids, axis);

    if (splitIds.length === 0) {
      return;
    }

    editor.execute(command);
    editor.select(splitIds, "object");
    enqueueWorkerJob("Clip brush", { task: "clip", worker: "geometryWorker" }, 950);
  };

  const handleExtrudeSelection = (axis: TransformAxis, direction: -1 | 1) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const selectedNode = editor.scene.getNode(editor.selection.ids[0]);

    if (selectedNode && isBrushNode(selectedNode)) {
      editor.execute(
        createExtrudeBrushNodesCommand(
          editor.scene,
          editor.selection.ids,
          axis,
          resolveViewportSnapSize(resolveActiveViewportState()),
          direction
        )
      );
      enqueueWorkerJob("Brush extrude", { task: "brush-rebuild", worker: "geometryWorker" }, 950);
      return;
    }

    if (selectedNode && isMeshNode(selectedNode) && axis === "y") {
      editor.execute(
        createMeshRaiseTopCommand(
          editor.scene,
          editor.selection.ids,
          resolveViewportSnapSize(resolveActiveViewportState()) * direction
        )
      );
      enqueueWorkerJob("Mesh triangulation", { task: "triangulation", worker: "meshWorker" }, 850);
    }
  };

  const handlePlaceInstancingNodes = (sourceNodeId: string, transforms: Transform[]) => {
    if (transforms.length === 0) {
      return;
    }

    const sourceNode = editor.scene.getNode(sourceNodeId);

    if (!sourceNode || !isInstancingSourceNode(sourceNode)) {
      return;
    }

    const { command } = createPlaceInstancingNodesCommand(editor.scene, transforms, {
      data: {
        sourceNodeId
      },
      name: `${sourceNode.name} Instance`
    });

    editor.execute(command);
    enqueueWorkerJob("Instance brush placement", { task: "triangulation", worker: "geometryWorker" }, 650);
  };

  const handlePlaceBlockoutPlatform = () => {
    const target = resolvePlacementTarget();
    const { command, nodeId } = createPlaceBlockoutPlatformCommand(editor.scene, {
      name: "Open Platform",
      position: { x: target.x, y: target.y + 0.25, z: target.z },
      size: { x: 8, y: 0.5, z: 8 },
      tags: ["play-space", "open-area"]
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Blockout platform", { task: "brush-rebuild", worker: "geometryWorker" }, 650);
  };

  const handlePlaceBlockoutRoom = (openSides: Array<"east" | "north" | "south" | "top" | "west"> = []) => {
    const target = resolvePlacementTarget();
    const { command, nodeIds } = createPlaceBlockoutRoomCommand(editor.scene, {
      name: openSides.length > 0 ? "Open Room" : "Closed Room",
      openSides,
      position: { x: target.x, y: target.y, z: target.z },
      size: { x: 10, y: 4, z: 10 },
      tags: [openSides.length > 0 ? "open-room" : "closed-room", "play-space"]
    });

    editor.execute(command);
    editor.select(nodeIds, "object");
    enqueueWorkerJob("Blockout room", { task: "brush-rebuild", worker: "geometryWorker" }, 800);
  };

  const handlePlaceBlockoutStairs = () => {
    const target = resolvePlacementTarget();
    const { command, nodeIds } = createPlaceBlockoutStairCommand(editor.scene, {
      direction: "north",
      name: "Blockout Stairs",
      position: { x: target.x, y: target.y + 0.1, z: target.z },
      stepCount: 10,
      stepHeight: 0.2,
      tags: ["vertical-connector"],
      treadDepth: 0.6,
      width: 3
    });

    editor.execute(command);
    editor.select(nodeIds, "object");
    enqueueWorkerJob("Blockout stairs", { task: "brush-rebuild", worker: "geometryWorker" }, 850);
  };

  const handleCreateBrush = () => {
    const { activeBrushShape } = toolSessionStore;

    if (activeBrushShape === "custom-polygon" || activeBrushShape === "stairs" || activeBrushShape === "ramp") {
      toolSessionStore.activeToolId = "brush";
      return;
    }

    if (activeBrushShape === "plane") {
      const size = { x: 2, y: 0, z: 2 };

      handlePlaceMeshNode(
        createEditableMeshFromPlane(size, "brush:plane"),
        createDefaultPrimitiveTransform(resolvePlacementPosition(size)),
        "Blockout Plane"
      );
      return;
    }

    const data = createPrimitiveNodeData("brush", activeBrushShape);
    handlePlaceMeshNode(
      createEditableMeshFromPrimitiveData(data, `brush:${activeBrushShape}`),
      createDefaultPrimitiveTransform(resolvePlacementPosition(data.size)),
      createPrimitiveNodeLabel("brush", activeBrushShape)
    );
  };

  const handlePlaceBrush = (brush: Brush, transform: Transform) => {
    const { command, nodeId } = createPlaceBrushNodeCommand(editor.scene, transform, {
      data: brush,
      name: "Blockout Brush"
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Brush creation", { task: "brush-rebuild", worker: "geometryWorker" }, 700);
  };

  const handlePlaceMeshNode = (mesh: EditableMesh, transform: Transform, name: string) => {
    const { command, nodeId } = createPlaceMeshNodeCommand(editor.scene, transform, {
      data: mesh,
      name
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Mesh creation", { task: "triangulation", worker: "geometryWorker" }, 700);
  };

  const handlePlacePrimitiveNode = (data: PrimitiveNodeData, transform: Transform, name: string) => {
    const { command, nodeId } = createPlacePrimitiveNodeCommand(editor.scene, transform, {
      data,
      name
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob(
      `${data.role === "brush" ? "Brush" : "Prop"} placement`,
      { task: "triangulation", worker: "geometryWorker" },
      650
    );
  };

  const handlePlaceProp = (shape: PrimitiveShape) => {
    const data = createPrimitiveNodeData("prop", shape);
    const transform = createDefaultPrimitiveTransform(resolvePlacementPosition(data.size));
    const meshData = convertPrimitiveNodeToMeshNode({
      id: `node:prop:${shape}:${crypto.randomUUID()}`,
      kind: "primitive",
      name: createPrimitiveNodeLabel("prop", shape),
      transform,
      data
    }).data;

    handlePlaceMeshNode(meshData, transform, createPrimitiveNodeLabel("prop", shape));
  };

  const handlePlaceLight = (type: LightType) => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
    const position = { x: snappedTarget.x, y: type === "ambient" ? 0 : 3, z: snappedTarget.z };
    const { command, nodeId } = createPlaceLightNodeCommand(editor.scene, makeTransform(position), {
      data: createDefaultLightData(type),
      name: createLightNodeLabel(type)
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Light authoring", { task: "triangulation", worker: "geometryWorker" }, 500);
  };

  const handleCommitMeshTopology = (nodeId: string, mesh: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    if (isMeshNode(node)) {
      editor.execute(createSetMeshDataCommand(editor.scene, nodeId, preserveMeshMetadata(mesh, node.data), node.data));
    } else if (isBrushNode(node)) {
      const replacement: MeshNode = {
        id: node.id,
        kind: "mesh",
        name: node.name,
        transform: structuredClone(node.transform),
        data: structuredClone(mesh)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "promote brush to mesh"));
    }

    enqueueWorkerJob("Topology edit", { task: "triangulation", worker: "meshWorker" }, 850);
  };

  const handleInvertSelectionNormals = () => {
    const replacements: GeometryNode[] = editor.selection.ids
      .map((nodeId) => editor.scene.getNode(nodeId))
      .filter((node): node is GeometryNode => Boolean(node))
      .flatMap((node) => {
        if (isMeshNode(node)) {
          return [
            {
              ...structuredClone(node),
              data: invertEditableMeshNormals(node.data)
            } satisfies MeshNode
          ];
        }

        if (isBrushNode(node)) {
          const converted = convertBrushToEditableMesh(node.data);

          if (!converted) {
            return [];
          }

          return [
            {
              id: node.id,
              kind: "mesh",
              name: node.name,
              transform: structuredClone(node.transform),
              data: invertEditableMeshNormals(converted)
            } satisfies MeshNode
          ];
        }

        return [];
      });

    if (replacements.length === 0) {
      return;
    }

    editor.execute(createReplaceNodesCommand(editor.scene, replacements, "invert normals"));
    enqueueWorkerJob("Invert normals", { task: "triangulation", worker: "meshWorker" }, 650);
  };

  const handlePlaceEntity = (type: EntityType) => {
    const activeViewportState = resolveActiveViewportState();
    const position = { x: activeViewportState.camera.target.x, y: 1, z: activeViewportState.camera.target.z };
    const entity = createDefaultEntity(type, position, editor.scene.entities.size + 1);
    editor.execute(createPlaceEntityCommand(entity));
    editor.select([entity.id], "object");
    enqueueWorkerJob("Entity authoring", { task: "navmesh", worker: "navWorker" }, 800);
  };

  const handleUpdateNodeData = (nodeId: string, data: PrimitiveNodeData | LightNodeData | ModelReference) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    if (isPrimitiveNode(node)) {
      editor.execute(
        createReplaceNodesCommand(
          editor.scene,
          [
            {
              ...structuredClone(node),
              data: structuredClone(data as PrimitiveNodeData)
            }
          ],
          "update primitive"
        )
      );
      enqueueWorkerJob("Primitive update", { task: "triangulation", worker: "geometryWorker" }, 500);
      return;
    }

    if (isModelNode(node)) {
      editor.execute(
        createReplaceNodesCommand(
          editor.scene,
          [
            {
              ...structuredClone(node),
              data: structuredClone(data as ModelReference)
            }
          ],
          "update model"
        )
      );
      enqueueWorkerJob("Model update", { task: "triangulation", worker: "geometryWorker" }, 500);
      return;
    }

    if (isLightNode(node)) {
      editor.execute(
        createReplaceNodesCommand(
          editor.scene,
          [
            {
              ...structuredClone(node),
              data: structuredClone(data as LightNodeData)
            }
          ],
          "update light"
        )
      );
      enqueueWorkerJob("Light update", { task: "triangulation", worker: "geometryWorker" }, 500);
    }
  };

  const handleUpdateSceneSettings = (settings: SceneSettings, beforeSettings?: SceneSettings) => {
    editor.execute(createSetSceneSettingsCommand(editor.scene, settings, beforeSettings));
    enqueueWorkerJob("Scene settings", { task: "triangulation", worker: "geometryWorker" }, 300);
  };

  const handlePlayPhysics = () => {
    editor.clearSelection();
    toolSessionStore.physicsPlayback = "running";
  };

  const handlePausePhysics = () => {
    toolSessionStore.physicsPlayback = toolSessionStore.physicsPlayback === "stopped" ? "stopped" : "paused";
  };

  return {
    createBrush: handleCreateBrush,
    instanceSelection: handleInstanceSelection,
    physicsActions: {
      pause: handlePausePhysics,
      play: handlePlayPhysics
    },
    placementActions: {
      placeBlockoutOpenRoom: () => handlePlaceBlockoutRoom(["south"]),
      placeBlockoutPlatform: handlePlaceBlockoutPlatform,
      placeBlockoutRoom: () => handlePlaceBlockoutRoom(),
      placeBlockoutStairs: handlePlaceBlockoutStairs,
      placeBrush: handlePlaceBrush,
      placeEntity: handlePlaceEntity,
      placeInstancingNodes: handlePlaceInstancingNodes,
      placeLight: handlePlaceLight,
      placeMeshNode: handlePlaceMeshNode,
      placePrimitiveNode: handlePlacePrimitiveNode,
      placeProp: handlePlaceProp
    },
    sceneActions: {
      commitMeshMaterialLayers: handleCommitMeshMaterialLayers,
      commitMeshTopology: handleCommitMeshTopology,
      meshEditToolbarAction: handleMeshEditToolbarAction,
      previewBrushData: handlePreviewBrushData,
      previewEntityTransform: handlePreviewEntityTransform,
      previewMeshData: handlePreviewMeshData,
      previewNodeTransform: handlePreviewNodeTransform,
      splitBrushAtCoordinate: handleSplitBrushAtCoordinate,
      updateBrushData: handleUpdateBrushData,
      updateEntityHooks: handleUpdateEntityHooks,
      updateEntityProperties: handleUpdateEntityProperties,
      updateEntityTransform: handleUpdateEntityTransform,
      updateMeshData: handleUpdateMeshData,
      updateNodeData: handleUpdateNodeData,
      updateNodeHooks: handleUpdateNodeHooks,
      updateNodeTransform: handleUpdateNodeTransform,
      updateSceneSettings: handleUpdateSceneSettings
    },
    selectionActions: {
      clearSelection: handleClearSelection,
      clipSelection: handleClipSelection,
      deleteSelection: handleDeleteSelection,
      duplicateSelection: handleDuplicateSelection,
      extrudeSelection: handleExtrudeSelection,
      focusNode: handleFocusNode,
      groupSelection: handleGroupSelection,
      invertSelectionNormals: handleInvertSelectionNormals,
      mirrorSelection: handleMirrorSelection,
      selectNodes: handleSelectNodes,
      toggleSceneItemLock: handleToggleSceneItemLock,
      toggleSceneItemVisibility: handleToggleSceneItemVisibility,
      translateSelection: handleTranslateSelection
    }
  };
}

function preserveMeshMetadata(mesh: EditableMesh, existingMesh?: EditableMesh) {
  return existingMesh?.role === "prop" || existingMesh?.physics
    ? {
        ...structuredClone(mesh),
        physics: structuredClone(mesh.physics ?? existingMesh.physics),
        role: mesh.role ?? existingMesh.role
      }
    : structuredClone(mesh);
}
