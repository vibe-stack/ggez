import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSnapshot } from "valtio";
import {
  analyzeSceneSpatialLayout,
  axisDelta,
  createAssignMaterialCommand,
  createSceneEditorAdapter,
  createDeleteAssetCommand,
  createDeleteMaterialCommand,
  createUpsertAssetCommand,
  createDocumentSnapshotFromLegacyScene,
  createDocumentSpatialIndex,
  createDeleteTextureCommand,
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
  createPlaceModelNodeCommand,
  createSceneDocumentSnapshot,
  createSeedSceneDocument,
  createWorldEditorCore,
  createSetUvOffsetCommand,
  createSetUvScaleCommand,
  createSplitBrushNodeAtCoordinateCommand,
  createSplitBrushNodesCommand,
  createSetSceneSettingsCommand,
  createTranslateNodesCommand,
  createUpsertMaterialCommand,
  createUpsertTextureCommand,
  parseAuthoringDocumentSnapshot,
  refreshWorldManifest,
  serializeAuthoringDocumentSnapshot,
  type AuthoringDocumentSnapshot,
  type SceneDocumentSnapshot,
  type TransformAxis,
  type WorldPersistenceBundle
} from "@ggez/editor-core";
import { convertBrushToEditableMesh, invertEditableMeshNormals } from "@ggez/geometry-kernel";
import { type RuntimeWorldBundle } from "@ggez/runtime-build";
import { createDerivedRenderSceneCache, deriveRenderSceneCached } from "@ggez/render-pipeline";
import {
  buildModelLodLevelOrder,
  createSerializedModelAssetFiles,
  type GeometryNode,
  isBrushNode,
  isInstancingSourceNode,
  isInstancingNode,
  isLightNode,
  isMeshNode,
  isModelNode,
  isPrimitiveNode,
  makeTransform,
  HIGH_MODEL_LOD_LEVEL,
  type ModelAssetFile,
  type ModelLodLevel,
  type ModelReference,
  type WorldLodLevelDefinition,
  type Material,
  type MeshNode,
  type ModelNode,
  type PrimitiveNodeData,
  resolveModelAssetFiles,
  resolveModelFormat,
  resolveSceneGraph,
  snapVec3,
  vec2,
  vec3,
  type Asset,
  type Brush,
  type EditableMesh,
  type Entity,
  type EntityType,
  type LightNodeData,
  type LightType,
  type TextureRecord,
  type Vec2,
  type Vec3,
  type SceneSettings
} from "@ggez/shared";
import type { PrimitiveShape } from "@ggez/shared";
import {
  createWorkerTaskManager,
  type WorkerJob
} from "@ggez/workers";
import { isWebHammerEngineBundle } from "@ggez/three-runtime";
import { slugifyProjectName, type EditorFileMetadata } from "@ggez/dev-sync";
import { WorldEditorShell } from "@/components/WorldEditorShell";
import { useGameConnection } from "@/app/hooks/useGameConnection";
import { uiStore } from "@/state/ui-store";
import type { Transform } from "@ggez/shared";
import { useAppHotkeys } from "@/app/hooks/useAppHotkeys";
import { useCopilot } from "@/app/hooks/useCopilot";
import { GameConnectionControl } from "@/components/editor-shell/GameConnectionControl";
import { useEditorSubscriptions } from "@/app/hooks/useEditorSubscriptions";
import { useExportWorker } from "@/app/hooks/useExportWorker";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import {
  createDefaultEntity,
  createDefaultLightData,
  createDefaultPrimitiveTransform,
  createLightNodeLabel,
  createPrimitiveNodeData,
  createPrimitiveNodeLabel
} from "@/lib/authoring";
import type { ObjectGenerationResponse } from "@/lib/object-generation-contract";
import { convertPrimitiveNodeToMeshNode } from "@/lib/primitive-to-mesh";
import {
  analyzeModelSource,
  buildModelAssetLibrary,
  createAiModelPlaceholder,
  createModelAsset,
  dedupeModelFiles,
  inferModelLodLevelFromFileName,
  readFileAsDataUrl,
  resolveImportedModelAssetName,
  resolveModelFitScale,
  resolveModelAssetName,
  resolvePrimitiveNodeBounds
} from "@/lib/model-assets";
import { createEditableMeshFromPlane, createEditableMeshFromPrimitiveData } from "@/lib/primitive-to-mesh";
import { resolveEffectiveSceneItemIds, toggleSceneItemId } from "@/lib/scene-hierarchy";
import {
  focusViewportOnPoint,
  viewportPaneIds,
  type ViewportPaneId,
} from "@/viewport/viewports";
import { loadStoredSceneEditorDraft, saveSceneEditorDraft } from "@/lib/draft-storage";
import { projectSessionStore, RUNTIME_SYNC_DEBUG_FINGERPRINT } from "@/state/project-session-store";
import { resetSceneSessionStore, sceneSessionStore } from "@/state/scene-session-store";
import { queueMeshEditToolbarAction, resetToolSessionStore, toolSessionStore } from "@/state/tool-session-store";

export function App() {
  const [worldEditor] = useState(() => createWorldEditorCore(createSceneDocumentSnapshot(createSeedSceneDocument())));
  const [editor] = useState(() => createSceneEditorAdapter(worldEditor));
  const [workerManager] = useState(() => createWorkerTaskManager());
  const [workerJobs, setWorkerJobs] = useState<WorkerJob[]>([]);
  const [committedSceneRevision, setCommittedSceneRevision] = useState(0);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [worldRevision, setWorldRevision] = useState(0);
  const latestDraftRef = useRef<ReturnType<typeof buildSceneDraftPayload> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sceneDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const glbImportInputRef = useRef<HTMLInputElement | null>(null);
  const modelLodInputRef = useRef<HTMLInputElement | null>(null);
  const renderSceneCacheRef = useRef(createDerivedRenderSceneCache());
  const [pendingAssetLodUpload, setPendingAssetLodUpload] = useState<{
    assetId: string;
    level: ModelLodLevel;
  } | null>(null);
  const toolSessionSnapshot = useSnapshot(toolSessionStore);
  const projectSessionSnapshot = useSnapshot(projectSessionStore);
  const sceneSessionSnapshot = useSnapshot(sceneSessionStore);
  const activeToolId = toolSessionSnapshot.activeToolId;
  const aiModelDraft = toolSessionSnapshot.aiModelDraft;
  const physicsPlayback = toolSessionSnapshot.physicsPlayback;
  const projectName = projectSessionSnapshot.projectName;
  const projectSlug = projectSessionSnapshot.projectSlug;
  const projectSlugDirty = projectSessionSnapshot.projectSlugDirty;
  const hiddenSceneItemIds = sceneSessionSnapshot.hiddenSceneItemIds;
  const lockedSceneItemIds = sceneSessionSnapshot.lockedSceneItemIds;
  const selectedScenePathId = sceneSessionSnapshot.selectedScenePathId;
  const { downloadBinaryFile, downloadTextFile, exportJobs, runWorkerRequest } = useExportWorker();
  const gameConnection = useGameConnection();
  const workingSet = useMemo(() => worldEditor.getWorkingSet(), [worldEditor, worldRevision]);
  const activeWorldDocumentId = workingSet.activeDocumentId;
  const flattenedWorldSnapshot = useMemo(
    () =>
      workingSet.mode === "world"
        ? worldEditor.getFlattenedSceneSnapshot({
            activeDocumentId: activeWorldDocumentId,
            activeDocumentOverride: editor.scene,
            includeLoadedOnly: true
          })
        : null,
    [activeWorldDocumentId, editor, sceneRevision, worldEditor, workingSet.mode, worldRevision]
  );
  const renderScene = useMemo(
    () =>
      deriveRenderSceneCached(
        workingSet.mode === "world" && flattenedWorldSnapshot
          ? flattenedWorldSnapshot.nodes
          : editor.scene.nodes.values(),
        workingSet.mode === "world" && flattenedWorldSnapshot
          ? flattenedWorldSnapshot.entities
          : editor.scene.entities.values(),
        workingSet.mode === "world" && flattenedWorldSnapshot
          ? flattenedWorldSnapshot.materials
          : editor.scene.materials.values(),
        workingSet.mode === "world" && flattenedWorldSnapshot
          ? flattenedWorldSnapshot.assets
          : editor.scene.assets.values(),
        renderSceneCacheRef.current,
        workingSet.mode === "world" && flattenedWorldSnapshot
          ? flattenedWorldSnapshot.textures
          : editor.scene.textures.values()
      ),
    [editor, flattenedWorldSnapshot, sceneRevision, workingSet.mode]
  );
  const spatialAnalysis = useMemo(
    () => analyzeSceneSpatialLayout(workingSet.mode === "world" && flattenedWorldSnapshot ? flattenedWorldSnapshot : editor.scene),
    [committedSceneRevision, editor, flattenedWorldSnapshot, workingSet.mode]
  );
  const sceneNodes = useMemo(() => Array.from(editor.scene.nodes.values()), [editor, committedSceneRevision]);
  const sceneEntities = useMemo(() => Array.from(editor.scene.entities.values()), [editor, committedSceneRevision]);
  const modelAssets = useMemo(
    () => buildModelAssetLibrary(editor.scene.assets.values(), editor.scene.nodes.values()),
    [editor, committedSceneRevision]
  );
  const sceneItemIdSet = useMemo(
    () => new Set<string>([...sceneNodes.map((node) => node.id), ...sceneEntities.map((entity) => entity.id)]),
    [sceneEntities, sceneNodes]
  );
  const effectiveHiddenSceneItemIds = useMemo(
    () => resolveEffectiveSceneItemIds(sceneNodes, sceneEntities, hiddenSceneItemIds),
    [hiddenSceneItemIds, sceneEntities, sceneNodes]
  );
  const effectiveLockedSceneItemIds = useMemo(
    () => resolveEffectiveSceneItemIds(sceneNodes, sceneEntities, lockedSceneItemIds),
    [lockedSceneItemIds, sceneEntities, sceneNodes]
  );
  const blockedSceneItemIdSet = useMemo(
    () => new Set<string>([...effectiveHiddenSceneItemIds, ...effectiveLockedSceneItemIds]),
    [effectiveHiddenSceneItemIds, effectiveLockedSceneItemIds]
  );
  const resolvedProjectName = projectName.trim() || "Untitled Scene";
  const resolvedProjectSlug = slugifyProjectName(projectSlug.trim() || resolvedProjectName);

  useEditorSubscriptions(editor, setSceneRevision, setCommittedSceneRevision, setSelectionRevision);

  useEffect(() => workerManager.subscribe(setWorkerJobs), [workerManager]);

  useEffect(() => worldEditor.events.on("world:changed", () => setWorldRevision((revision) => revision + 1)), [worldEditor]);

  useEffect(() => {
    const filterValidIds = (currentIds: string[]) => {
      const nextIds = currentIds.filter((id) => sceneItemIdSet.has(id));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    };

    sceneSessionStore.hiddenSceneItemIds = filterValidIds(sceneSessionStore.hiddenSceneItemIds);
    sceneSessionStore.lockedSceneItemIds = filterValidIds(sceneSessionStore.lockedSceneItemIds);
  }, [sceneItemIdSet]);

  useEffect(() => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const nextSelection = editor.selection.ids.filter((id) => !blockedSceneItemIdSet.has(id));

    if (nextSelection.length === editor.selection.ids.length) {
      return;
    }

    editor.select(nextSelection, "object");
  }, [blockedSceneItemIdSet, editor, selectionRevision]);

  useEffect(() => {
    if (!aiModelDraft) {
      return;
    }

    const node = editor.scene.getNode(aiModelDraft.nodeId);

    if (node && !isModelNode(node)) {
      return;
    }

    toolSessionStore.aiModelDraft = null;
    toolSessionStore.aiModelPlacementArmed = false;
  }, [aiModelDraft, committedSceneRevision, editor]);

  useEffect(() => {
    if (uiStore.selectedAssetId && !editor.scene.assets.has(uiStore.selectedAssetId)) {
      uiStore.selectedAssetId = "";
    }
  }, [committedSceneRevision, editor]);

  useEffect(() => {
    const scenePaths = editor.scene.settings.paths ?? [];

    if (scenePaths.length === 0) {
      sceneSessionStore.selectedScenePathId = undefined;
      return;
    }

    if (!selectedScenePathId || !scenePaths.some((pathDefinition) => pathDefinition.id === selectedScenePathId)) {
      sceneSessionStore.selectedScenePathId = scenePaths[0]?.id;
    }
  }, [committedSceneRevision, editor, selectedScenePathId]);

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

  const handleSelectNodes = (nodeIds: string[]) => {
    if (physicsPlayback !== "stopped") {
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

  const syncEditorFromWorld = (reason: string) => {
    editor.syncFromWorld(reason);
    setWorldRevision((revision) => revision + 1);
    setSceneRevision((revision) => revision + 1);
    setCommittedSceneRevision((revision) => revision + 1);
    setSelectionRevision((revision) => revision + 1);
  };

  useEffect(() => {
    if (activeToolId !== "mesh-edit") {
      toolSessionStore.sculptMode = null;
      return;
    }

    const selectedNodeId = editor.selection.ids[0];
    const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;

    if (!selectedNode || !isPrimitiveNode(selectedNode) || selectedNode.data.role !== "prop") {
      return;
    }

    editor.execute(
      createReplaceNodesCommand(
        editor.scene,
        [convertPrimitiveNodeToMeshNode(selectedNode)],
        "promote prop to mesh"
      )
    );
  }, [activeToolId, committedSceneRevision, editor, selectionRevision]);

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

  const handleUpdateNode = (nodeId: string, nextNode: GeometryNode, beforeNode?: GeometryNode) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    editor.execute(createSetNodeCommand(editor.scene, nodeId, nextNode, beforeNode));
  };

  const handlePreviewBrushData = (nodeId: string, brush: Brush) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isBrushNode(node)) {
      return;
    }

    node.data = structuredClone(brush);
    editor.scene.touch();
    setSceneRevision((revision) => revision + 1);
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
    setSceneRevision((revision) => revision + 1);
  };

  const handleUpdateMeshData = (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    editor.execute(
      createSetMeshDataCommand(
        editor.scene,
        nodeId,
        preserveMeshMetadata(mesh, node.data),
        beforeMesh
      )
    );
    enqueueWorkerJob("Mesh edit", { task: "triangulation", worker: "meshWorker" }, 800);
  };

  const handleCommitMeshMaterialLayers = (
    nodeId: string,
    layers: EditableMesh["materialLayers"],
    beforeLayers?: EditableMesh["materialLayers"],
  ) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    editor.execute(createSetMeshMaterialLayersCommand(editor.scene, nodeId, structuredClone(layers), structuredClone(beforeLayers)));
    setSceneRevision((revision) => revision + 1);
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
    setSceneRevision((revision) => revision + 1);
  };

  const handlePreviewEntityTransform = (entityId: string, transform: Transform) => {
    const entity = editor.scene.getEntity(entityId);

    if (!entity) {
      return;
    }

    entity.transform = structuredClone(transform);
    editor.scene.touch();
    setSceneRevision((revision) => revision + 1);
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

  const enqueueWorkerJob = (label: string, task: Parameters<typeof workerManager.enqueue>[0], durationMs?: number) => {
    workerManager.enqueue(task, label, durationMs);
  };

  const resolveActiveViewportState = () => uiStore.viewports[uiStore.activeViewportId];

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
        createMeshRaiseTopCommand(editor.scene, editor.selection.ids, resolveViewportSnapSize(resolveActiveViewportState()) * direction)
      );
      enqueueWorkerJob("Mesh triangulation", { task: "triangulation", worker: "meshWorker" }, 850);
    }
  };

  const placeAssetAtPosition = (assetId: string, position: Vec3) => {
    const snapped = snapVec3(position, resolveViewportSnapSize(resolveActiveViewportState()));
    const asset = editor.scene.assets.get(assetId);

    if (!asset || asset.type !== "model") {
      return;
    }

    const label = resolveModelAssetName(asset) || "Model Prop";
    const { command, nodeId } = createPlaceModelNodeCommand(editor.scene, vec3(snapped.x, 1.1, snapped.z), {
      data: {
        assetId: asset.id,
        path: asset.path
      },
      name: label
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    uiStore.selectedAssetId = asset.id;
    enqueueWorkerJob("Asset placement", { task: "triangulation", worker: "geometryWorker" }, 650);
  };

  const handlePlaceAsset = (position: Vec3) => {
    if (!uiStore.selectedAssetId) {
      return;
    }

    placeAssetAtPosition(uiStore.selectedAssetId, position);
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

  const handleInsertAsset = (assetId: string) => {
    placeAssetAtPosition(assetId, resolvePlacementTarget());
  };

  const handleImportGlb = () => {
    glbImportInputRef.current?.click();
  };

  const handleGlbFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    try {
      const resolvedFiles = await resolveImportedModelFiles(files, editor.scene.settings.world.lod.levels);
      const primaryFile = resolvedFiles.find((entry) => entry.level === HIGH_MODEL_LOD_LEVEL) ?? resolvedFiles[0];

      if (!primaryFile) {
        return;
      }

      const bounds = await analyzeModelSource({
        format: primaryFile.format,
        path: primaryFile.path
      });
      const name = resolveImportedModelAssetName(files);
      const asset = createModelAsset({
        center: bounds.center,
        files: resolvedFiles,
        format: primaryFile.format,
        name,
        path: primaryFile.path,
        size: bounds.size,
        source: "import"
      });
      const fitScale = resolveModelFitScale(vec3(2, 2, 2), bounds);
      const target = resolvePlacementTarget();
      const { command, nodeId } = createPlaceModelNodeCommand(
        editor.scene,
        {
          position: vec3(target.x, target.y + 1, target.z),
          rotation: vec3(0, 0, 0),
          scale: vec3(fitScale, fitScale, fitScale)
        },
        {
          data: {
            assetId: asset.id,
            path: asset.path
          },
          name
        }
      );

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(command);
      editor.select([nodeId], "object");
      uiStore.selectedAssetId = asset.id;
      uiStore.rightPanel = "assets";
      enqueueWorkerJob("GLB import", { task: "triangulation", worker: "geometryWorker" }, 650);
    } finally {
      event.target.value = "";
    }
  };

  const handleAssignAssetLod = (assetId: string, level: ModelLodLevel) => {
    setPendingAssetLodUpload({ assetId, level });
    modelLodInputRef.current?.click();
  };

  const handleClearAssetLod = (assetId: string, level: ModelLodLevel) => {
    if (level === HIGH_MODEL_LOD_LEVEL) {
      return;
    }

    const asset = editor.scene.assets.get(assetId);

    if (!asset || asset.type !== "model") {
      return;
    }

    const nextFiles = dedupeModelFiles(resolveModelAssetFiles(asset).filter((file) => file.level !== level));
    const nextAsset = updateModelAssetFiles(asset, nextFiles);

    editor.execute(createUpsertAssetCommand(editor.scene, nextAsset));
  };

  const handleAssetLodFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const pendingUpload = pendingAssetLodUpload;

    setPendingAssetLodUpload(null);

    if (!file || !pendingUpload) {
      event.target.value = "";
      return;
    }

    try {
      const asset = editor.scene.assets.get(pendingUpload.assetId);

      if (!asset || asset.type !== "model") {
        return;
      }

      const path = await readFileAsDataUrl(file);
      const format = resolveImportedModelFormat(file.name);
      const nextFiles = dedupeModelFiles([
        ...resolveModelAssetFiles(asset).filter((entry) => entry.level !== pendingUpload.level),
        {
          format,
          level: pendingUpload.level,
          path
        } satisfies ModelAssetFile
      ]);

      const bounds = pendingUpload.level === HIGH_MODEL_LOD_LEVEL
        ? await analyzeModelSource({ format, path })
        : undefined;
      const nextAsset = updateModelAssetFiles(asset, nextFiles, bounds);

      editor.execute(createUpsertAssetCommand(editor.scene, nextAsset));
      uiStore.selectedAssetId = nextAsset.id;
      uiStore.rightPanel = "assets";
    } finally {
      event.target.value = "";
    }
  };

  const resolvePlacementPosition = (size: Vec3) => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));

    return vec3(snappedTarget.x, Math.max(size.y * 0.5, snappedTarget.y), snappedTarget.z);
  };

  const resolvePlacementTarget = () => {
    const activeViewportState = resolveActiveViewportState();
    return snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
  };

  const handleArmAiModelPlacement = () => {
    if (aiModelDraft?.nodeId && editor.scene.getNode(aiModelDraft.nodeId)) {
      editor.select([aiModelDraft.nodeId], "object");
      toolSessionStore.activeToolId = "transform";
      toolSessionStore.transformMode = "scale";
      toolSessionStore.aiModelPlacementArmed = false;
      return;
    }

    toolSessionStore.aiModelPlacementArmed = true;
    toolSessionStore.aiModelDraft = toolSessionStore.aiModelDraft
      ? {
          ...toolSessionStore.aiModelDraft,
          error: undefined
        }
      : toolSessionStore.aiModelDraft;
    toolSessionStore.activeToolId = "brush";
  };

  const handleCancelAiModelPlacement = () => {
    toolSessionStore.aiModelPlacementArmed = false;
    toolSessionStore.aiModelDraft = null;
  };

  const handleUpdateAiModelPrompt = (prompt: string) => {
    toolSessionStore.aiModelDraft = toolSessionStore.aiModelDraft
      ? {
          ...toolSessionStore.aiModelDraft,
          error: undefined,
          prompt
        }
      : toolSessionStore.aiModelDraft;
  };

  const handlePlaceAiModelPlaceholder = (position: Vec3) => {
    const placeholder = createAiModelPlaceholder(position);
    const { command, nodeId } = createPlacePrimitiveNodeCommand(editor.scene, placeholder.transform, {
      data: placeholder.data,
      name: placeholder.name
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    toolSessionStore.aiModelPlacementArmed = false;
    toolSessionStore.activeToolId = "transform";
    toolSessionStore.transformMode = "scale";
    toolSessionStore.aiModelDraft = {
      error: undefined,
      nodeId,
      prompt: toolSessionStore.aiModelDraft?.prompt ?? ""
    };
    enqueueWorkerJob("AI proxy placement", { task: "triangulation", worker: "geometryWorker" }, 500);
  };

  const handleGenerateAiModel = async () => {
    if (!aiModelDraft || aiModelDraft.prompt.trim().length === 0) {
      return;
    }

    const { nodeId, prompt } = aiModelDraft;
    const node = editor.scene.getNode(nodeId);

    if (!node || !isPrimitiveNode(node)) {
      toolSessionStore.aiModelDraft = toolSessionStore.aiModelDraft
        ? {
            ...toolSessionStore.aiModelDraft,
            error: "Proxy cube is missing."
          }
        : toolSessionStore.aiModelDraft;
      return;
    }

    toolSessionStore.aiModelDraft = null;
    toolSessionStore.aiModelPlacementArmed = false;
    void queueAiModelGeneration(nodeId, prompt.trim());
  };

  const queueAiModelGeneration = async (nodeId: string, prompt: string) => {
    try {
      const payload = await runWorkerRequest(
        {
          kind: "ai-model-generate",
          prompt
        },
        "Generate AI 3D"
      );

      if (typeof payload !== "string") {
        throw new Error("Invalid AI model response.");
      }

      const parsed = JSON.parse(payload) as ObjectGenerationResponse;

      if (!parsed.asset) {
        throw new Error("Missing AI model payload.");
      }

      const generated = parsed.asset;
      const bounds = await analyzeModelSource({
        format: "obj",
        path: generated.modelDataUrl
      });
      const asset = createModelAsset({
        center: bounds.center,
        format: "obj",
        materialMtlText: generated.materialMtlText,
        name: generated.name,
        path: generated.modelDataUrl,
        prompt: generated.prompt,
        size: bounds.size,
        source: "ai",
        texturePath: generated.textureDataUrl
      });
      const latestNode = editor.scene.getNode(nodeId);

      if (!latestNode || !isPrimitiveNode(latestNode)) {
        return;
      }

      const targetBounds = resolvePrimitiveNodeBounds(latestNode) ?? vec3(2, 2, 2);
      const fitScale = resolveModelFitScale(targetBounds, bounds);
      const replacement: ModelNode = {
        id: latestNode.id,
        kind: "model",
        name: generated.name,
        transform: {
          ...structuredClone(latestNode.transform),
          scale: vec3(fitScale, fitScale, fitScale)
        },
        data: {
          assetId: asset.id,
          path: asset.path
        }
      };

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "generate ai model"));
      if (editor.selection.ids.includes(replacement.id)) {
        editor.select([replacement.id], "object");
      }
      uiStore.selectedAssetId = asset.id;
      uiStore.rightPanel = "assets";
      enqueueWorkerJob("AI model generation", { task: "triangulation", worker: "geometryWorker" }, 700);
    } catch (error) {
      toolSessionStore.aiModelDraft = {
        error: error instanceof Error ? error.message : "Failed to generate model.",
        nodeId,
        prompt
      };
    }
  };

  const handlePlaceBlockoutPlatform = () => {
    const target = resolvePlacementTarget();
    const { command, nodeId } = createPlaceBlockoutPlatformCommand(editor.scene, {
      name: "Open Platform",
      position: vec3(target.x, target.y + 0.25, target.z),
      size: vec3(8, 0.5, 8),
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
      position: vec3(target.x, target.y, target.z),
      size: vec3(10, 4, 10),
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
      position: vec3(target.x, target.y + 0.1, target.z),
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
      const size = vec3(2, 0, 2);

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
    const transform = createDefaultPrimitiveTransform(
      resolvePlacementPosition(data.size)
    );
    const meshData = convertPrimitiveNodeToMeshNode({
      id: `node:prop:${shape}:${crypto.randomUUID()}`,
      kind: "primitive",
      name: createPrimitiveNodeLabel("prop", shape),
      transform,
      data
    }).data;

    handlePlaceMeshNode(
      meshData,
      transform,
      createPrimitiveNodeLabel("prop", shape)
    );
  };

  const handlePlaceLight = (type: LightType) => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
    const position = vec3(snappedTarget.x, type === "ambient" ? 0 : 3, snappedTarget.z);
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
      editor.execute(
        createSetMeshDataCommand(
          editor.scene,
          nodeId,
          preserveMeshMetadata(mesh, node.data),
          node.data
        )
      );
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
              kind: "mesh" as const,
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

  const handleApplyMaterial = (materialId: string, scope: "faces" | "object", faceIds: string[]) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    uiStore.selectedMaterialId = materialId;
    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createAssignMaterialCommand(editor.scene, targets, materialId));
    enqueueWorkerJob("Material preview rebuild", { task: "triangulation", worker: "geometryWorker" }, 600);
  };

  const handleSetMaterialUvScale = (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createSetUvScaleCommand(editor.scene, targets, vec2(uvScale.x, uvScale.y)));
    enqueueWorkerJob("UV update", { task: "triangulation", worker: "geometryWorker" }, 450);
  };

  const handleSetMaterialUvOffset = (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createSetUvOffsetCommand(editor.scene, targets, vec2(uvOffset.x, uvOffset.y)));
    enqueueWorkerJob("UV update", { task: "triangulation", worker: "geometryWorker" }, 450);
  };

  const handleUpsertMaterial = (material: Material) => {
    editor.execute(createUpsertMaterialCommand(editor.scene, material));
    uiStore.selectedMaterialId = material.id;
    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
  };

  const handleUpsertTexture = (texture: TextureRecord) => {
    editor.execute(createUpsertTextureCommand(editor.scene, texture));
  };

  const handleDeleteTexture = (textureId: string) => {
    editor.execute(createDeleteTextureCommand(editor.scene, textureId));
    enqueueWorkerJob("Texture library update", { task: "triangulation", worker: "geometryWorker" }, 250);
  };

  const handleDeleteMaterial = (materialId: string) => {
    const fallbackMaterial = Array.from(editor.scene.materials.values()).find((material) => material.id !== materialId);

    if (!fallbackMaterial) {
      return;
    }

    editor.execute(createDeleteMaterialCommand(editor.scene, materialId, fallbackMaterial.id));

    if (uiStore.selectedMaterialId === materialId) {
      uiStore.selectedMaterialId = fallbackMaterial.id;
    }

    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
  };

  const handleSelectAsset = (assetId: string) => {
    uiStore.selectedAssetId = assetId;
  };

  const handleFocusAssetNodes = (assetId: string) => {
    const assetEntry = modelAssets.find((item) => item.asset.id === assetId);

    if (!assetEntry || assetEntry.nodeIds.length === 0) {
      return;
    }

    uiStore.selectedAssetId = assetId;
    editor.select(assetEntry.nodeIds, "object");
    handleFocusNode(assetEntry.nodeIds[0]);
  };

  const handleDeleteAsset = (assetId: string) => {
    const assetEntry = modelAssets.find((item) => item.asset.id === assetId);

    if (!assetEntry || assetEntry.usageCount > 0) {
      return;
    }

    editor.execute(createDeleteAssetCommand(editor.scene, assetId));

    if (uiStore.selectedAssetId === assetId) {
      const nextSelectedAsset = modelAssets.find((item) => item.asset.id !== assetId);
      uiStore.selectedAssetId = nextSelectedAsset?.asset.id ?? "";
    }
  };

  const handleSelectMaterial = (materialId: string) => {
    uiStore.selectedMaterialId = materialId;
  };

  const handlePlaceEntity = (type: EntityType) => {
    const activeViewportState = resolveActiveViewportState();
    const position = vec3(activeViewportState.camera.target.x, 1, activeViewportState.camera.target.z);
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
      const replacement = {
        ...structuredClone(node),
        data: structuredClone(data as PrimitiveNodeData)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "update primitive"));
      enqueueWorkerJob("Primitive update", { task: "triangulation", worker: "geometryWorker" }, 500);
      return;
    }

    if (isModelNode(node)) {
      const replacement = {
        ...structuredClone(node),
        data: structuredClone(data as ModelReference)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "update model"));
      enqueueWorkerJob("Model update", { task: "triangulation", worker: "geometryWorker" }, 500);
      return;
    }

    if (isLightNode(node)) {
      const replacement = {
        ...structuredClone(node),
        data: structuredClone(data as LightNodeData)
      };

      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "update light"));
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

  const buildActiveSceneSnapshot = () => ({
    ...editor.exportSnapshot(),
    metadata: {
      projectName: resolvedProjectName,
      projectSlug: resolvedProjectSlug
    }
  });

  const buildWorldBundle = (): WorldPersistenceBundle => {
    const bundle = worldEditor.exportBundle();

    return {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        activeDocumentId: worldEditor.getWorkingSet().activeDocumentId,
        metadata: {
          projectName: resolvedProjectName,
          projectSlug: resolvedProjectSlug
        }
      }
    };
  };

  const buildSceneDraftPayload = () => ({
    projectName: resolvedProjectName,
    projectSlug: resolvedProjectSlug,
    projectSlugDirty,
    snapshot: buildWorldBundle(),
    updatedAt: Date.now(),
    version: 2 as const
  });

  const applyProjectMetadata = (metadata?: EditorFileMetadata) => {
    if (!metadata?.projectName && !metadata?.projectSlug) {
      return;
    }

    const nextProjectName = metadata.projectName?.trim() || resolvedProjectName;
    const nextProjectSlug = slugifyProjectName(metadata.projectSlug?.trim() || nextProjectName);
    projectSessionStore.projectName = nextProjectName;
    projectSessionStore.projectSlug = nextProjectSlug;
    projectSessionStore.projectSlugDirty = Boolean(metadata.projectSlug);
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const draft = await loadStoredSceneEditorDraft();

        if (!draft || cancelled) {
          return;
        }

        worldEditor.importBundle(draft.snapshot, "world:restore-draft");
        syncEditorFromWorld("world:restore-draft");
        projectSessionStore.projectName = draft.projectName || "Untitled Scene";
        projectSessionStore.projectSlug = slugifyProjectName(draft.projectSlug || draft.projectName || "Untitled Scene");
        projectSessionStore.projectSlugDirty = draft.projectSlugDirty;
      } catch (error) {
        console.warn("Failed to restore the Trident draft.", error);
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editor, worldEditor]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    latestDraftRef.current = buildSceneDraftPayload();

    const timeoutId = window.setTimeout(() => {
      void saveSceneEditorDraft(buildSceneDraftPayload()).catch((error) => {
        console.warn("Failed to save the Trident draft.", error);
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [committedSceneRevision, draftHydrated, projectSlugDirty, resolvedProjectName, resolvedProjectSlug]);

  useEffect(() => {
    return () => {
      const draft = latestDraftRef.current;

      if (!draft) {
        return;
      }

      void saveSceneEditorDraft(draft).catch((error) => {
        console.warn("Failed to flush the Trident draft on unload.", error);
      });
    };
  }, []);

  const handleProjectNameChange = (value: string) => {
    const previousAutoSlug = slugifyProjectName(projectName);
    projectSessionStore.projectName = value;

    if (!projectSlugDirty || projectSlug === previousAutoSlug) {
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
    resetSceneSessionStore();
    resetToolSessionStore();
    uiStore.selectedAssetId = "";
    uiStore.selectedMaterialId = "material:blockout:concrete";
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

  const handleLoadWhmap = () => {
    fileInputRef.current?.click();
  };

  const handleImportSceneDocument = () => {
    sceneDocumentInputRef.current?.click();
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
      typeof payload !== "string" &&
      !("bytes" in payload) &&
      !isWebHammerEngineBundle(payload) &&
      !isRuntimeWorldBundlePayload(payload)
    ) {
      applyProjectMetadata(extractProjectMetadata(payload));

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

    if (typeof payload !== "string" && "bytes" in payload) {
      downloadBinaryFile(`${resolvedProjectSlug}.${payload.fileExtension}`, payload.bytes, payload.mimeType);
    }
  };

  const handleUndo = () => {
    editor.undo();
  };

  const handleRedo = () => {
    editor.redo();
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

      if (typeof exportPayload === "string" || !("bytes" in exportPayload)) {
        throw new Error("Failed to export a runtime archive for editor sync.");
      }

      const exportDuration = performance.now() - exportStartedAt;
      const archiveSize = formatBytes(exportPayload.bytes.byteLength);
      projectSessionStore.runtimeSyncDebugLabel = `${RUNTIME_SYNC_DEBUG_FINGERPRINT} export ${formatDuration(exportDuration)} ${archiveSize}`;

      console.info(
        `[editor] Push runtime scene archive ready in ${formatDuration(exportDuration)} ` +
          `(archive=${archiveSize}, slug=${nextProjectSlug})`
      );

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

  const copilot = useCopilot(editor, {
    requestScenePush: (options) => {
      void handlePushSceneToGame(options).catch(() => {});
    }
  });

  const handleToggleCopilot = () => {
    uiStore.copilotPanelOpen = !uiStore.copilotPanelOpen;
  };

  const handleToggleLogicViewer = () => {
    uiStore.logicViewerOpen = !uiStore.logicViewerOpen;
  };

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
  const worldPartitions = useMemo(
    () => worldEditor.getPartitionSummaries(),
    [worldEditor, worldRevision]
  );
  const selectionHandles = useMemo(
    () =>
      worldEditor.getSelectionSnapshot().handles.map((handle) =>
        "documentId" in handle
          ? handle.kind === "node"
            ? `${handle.documentId}/${handle.nodeId}`
            : handle.kind === "entity"
              ? `${handle.documentId}/${handle.entityId}`
              : `${handle.documentId}/${handle.kind}`
          : `${handle.kind}:${handle.partitionId}`
      ),
    [selectionRevision, worldEditor, worldRevision]
  );

  useAppHotkeys({
    activeToolId,
    editor,
    enabled: physicsPlayback === "stopped",
    handleDeleteSelection,
    handleDuplicateSelection,
    handleInstanceSelection,
    handleGroupSelection,
    handleInvertSelectionNormals,
    handleRedo,
    handleToggleCopilot,
    handleToggleLogicViewer,
    handleTranslateSelection,
    handleUndo,
    setActiveToolId: (toolId) => {
      toolSessionStore.activeToolId = toolId;
    },
    setMeshEditMode: (mode) => {
      toolSessionStore.meshEditMode = mode;
    },
    setTransformMode: (mode) => {
      toolSessionStore.transformMode = mode;
    }
  });

  return (
    <>
      <WorldEditorShell
        analysis={spatialAnalysis}
        copilot={copilot}
        gameConnectionControl={
          <GameConnectionControl
            activeGame={gameConnection.activeGame}
            error={gameConnection.error}
            games={gameConnection.games}
            isLoading={gameConnection.isLoading}
            isPushing={gameConnection.isPushing}
            lastPush={gameConnection.lastPush}
            onProjectNameChange={handleProjectNameChange}
            onProjectSlugChange={handleProjectSlugChange}
            onPushScene={(forceSwitch) => {
              void handlePushSceneToGame({ forceSwitch });
            }}
            onRefresh={gameConnection.refresh}
            onSelectGame={gameConnection.setSelectedGameId}
            projectName={projectName}
            projectSlug={resolvedProjectSlug}
            selectedGameId={gameConnection.selectedGameId}
          />
        }
        effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
        effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
        canRedo={editor.commands.canRedo()}
        canUndo={editor.commands.canUndo()}
        editor={editor}
        jobs={[...workerJobs, ...exportJobs]}
        modelAssets={modelAssets}
        onInvertSelectionNormals={handleInvertSelectionNormals}
        onInsertAsset={handleInsertAsset}
        onApplyMaterial={handleApplyMaterial}
        onAssignAssetLod={handleAssignAssetLod}
        onClipSelection={handleClipSelection}
        onClearAssetLod={handleClearAssetLod}
        onCreateBrush={handleCreateBrush}
        onDeleteAsset={handleDeleteAsset}
        onDeleteSelection={handleDeleteSelection}
        onDuplicateSelection={handleDuplicateSelection}
        onClearSelection={handleClearSelection}
        onCommitMeshMaterialLayers={handleCommitMeshMaterialLayers}
        onCommitMeshTopology={handleCommitMeshTopology}
        onDeleteMaterial={handleDeleteMaterial}
        onExportEngine={handleExportEngine}
        onExportGltf={handleExportGltf}
        onExtrudeSelection={handleExtrudeSelection}
        onFocusAssetNodes={handleFocusAssetNodes}
        onFocusNode={handleFocusNode}
        onGroupSelection={handleGroupSelection}
        onGenerateAiModel={handleGenerateAiModel}
        onImportGlb={handleImportGlb}
        onImportAsset={handleImportGlb}
        onLoadWhmap={handleLoadWhmap}
        onNewFile={handleNewFile}
        onPausePhysics={handlePausePhysics}
        onMeshEditToolbarAction={handleMeshEditToolbarAction}
        onMirrorSelection={handleMirrorSelection}
        onCancelAiModelPlacement={handleCancelAiModelPlacement}
        onPlaceAsset={handlePlaceAsset}
        onPlaceAiModelPlaceholder={handlePlaceAiModelPlaceholder}
        onPlaceBrush={handlePlaceBrush}
        onPlaceInstancingNodes={handlePlaceInstancingNodes}
        onPlaceMeshNode={handlePlaceMeshNode}
        onPlaceBlockoutOpenRoom={() => handlePlaceBlockoutRoom(["south"])}
        onPlaceBlockoutPlatform={handlePlaceBlockoutPlatform}
        onPlaceBlockoutRoom={() => handlePlaceBlockoutRoom()}
        onPlaceBlockoutStairs={handlePlaceBlockoutStairs}
        onPlaceEntity={handlePlaceEntity}
        onPlaceLight={handlePlaceLight}
        onPlacePrimitiveNode={handlePlacePrimitiveNode}
        onPlaceProp={handlePlaceProp}
        onPlayPhysics={handlePlayPhysics}
        onPreviewBrushData={handlePreviewBrushData}
        onPreviewEntityTransform={handlePreviewEntityTransform}
        onPreviewMeshData={handlePreviewMeshData}
        onPreviewNodeTransform={handlePreviewNodeTransform}
        onRedo={handleRedo}
        onSaveWhmap={handleSaveWhmap}
        onSelectAsset={handleSelectAsset}
        onSelectMaterial={handleSelectMaterial}
        onStartAiModelPlacement={handleArmAiModelPlacement}
        onToggleSceneItemLock={handleToggleSceneItemLock}
        onToggleSceneItemVisibility={handleToggleSceneItemVisibility}
        onSetUvOffset={handleSetMaterialUvOffset}
        onSetUvScale={handleSetMaterialUvScale}
        onSelectNodes={handleSelectNodes}
        onSplitBrushAtCoordinate={handleSplitBrushAtCoordinate}
        onTranslateSelection={handleTranslateSelection}
        onUndo={handleUndo}
        onUpdateEntityProperties={handleUpdateEntityProperties}
        onUpdateEntityHooks={handleUpdateEntityHooks}
        onUpdateEntityTransform={handleUpdateEntityTransform}
        onUpdateNodeData={handleUpdateNodeData}
        onUpdateNodeHooks={handleUpdateNodeHooks}
        onUpdateAiModelPrompt={handleUpdateAiModelPrompt}
        onUpdateSceneSettings={handleUpdateSceneSettings}
        onUpsertMaterial={handleUpsertMaterial}
        onDeleteTexture={handleDeleteTexture}
        onUpsertTexture={handleUpsertTexture}
        onUpdateBrushData={handleUpdateBrushData}
        onImportSceneDocument={handleImportSceneDocument}
        onUpdateMeshData={handleUpdateMeshData}
        onUpdateNodeTransform={handleUpdateNodeTransform}
        onExportSceneDocument={handleExportSceneDocument}
        renderScene={renderScene}
        sceneSettings={editor.scene.settings}
        textures={Array.from(editor.scene.textures.values())}
        onPinDocument={handlePinWorldDocument}
        onCreateDocument={handleCreateWorldDocument}
        onLoadDocument={handleLoadWorldDocument}
        onSetActiveDocument={handleSetActiveWorldDocument}
        onSetDocumentPosition={handleSetWorldDocumentPosition}
        onSetWorldMode={handleSetWorldMode}
        onUnloadDocument={handleUnloadWorldDocument}
        onUnpinDocument={handleUnpinWorldDocument}
        workingSet={workingSet}
        worldDocuments={worldDocuments}
        worldValidationIssues={worldEditor.world.validation}
      />
      <input
        accept=".whmap,.json"
        hidden
        onChange={handleWhmapFileChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept=".whdoc,.json"
        hidden
        multiple
        onChange={handleSceneDocumentFileChange}
        ref={sceneDocumentInputRef}
        type="file"
      />
      <input
        accept=".glb,.gltf,.obj,model/gltf-binary,model/gltf+json"
        hidden
        multiple
        onChange={handleGlbFileChange}
        ref={glbImportInputRef}
        type="file"
      />
      <input
        accept=".glb,.gltf,.obj,model/gltf-binary,model/gltf+json"
        hidden
        onChange={handleAssetLodFileChange}
        ref={modelLodInputRef}
        type="file"
      />
    </>
  );
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

async function resolveImportedModelFiles(files: File[], configuredLevels: WorldLodLevelDefinition[]) {
  const resolvedEntries = await Promise.all(
    files.map(async (file) => ({
      file,
      format: resolveImportedModelFormat(file.name),
      path: await readFileAsDataUrl(file)
    }))
  );
  const filesByLevel = new Map<ModelLodLevel, ModelAssetFile>();
  const availableLevels = buildModelLodLevelOrder([HIGH_MODEL_LOD_LEVEL, ...configuredLevels.map((level) => level.id)]);

  resolvedEntries.forEach((entry, index) => {
    const inferredLevel = inferModelLodLevelFromFileName(entry.file.name);
    const exactLevelMatch = configuredLevels.find((level) => entry.file.name.toLowerCase().includes(level.id.toLowerCase()));
    const desiredLevel = exactLevelMatch?.id ?? inferredLevel;
    const fallbackLevel = availableLevels.find((level) => !filesByLevel.has(level));
    const level = filesByLevel.has(desiredLevel) ? fallbackLevel ?? desiredLevel : desiredLevel;

    filesByLevel.set(level, {
      format: entry.format,
      level,
      path: entry.path
    });

    if (index === 0 && !filesByLevel.has(HIGH_MODEL_LOD_LEVEL)) {
      filesByLevel.set(HIGH_MODEL_LOD_LEVEL, {
        format: entry.format,
        level: HIGH_MODEL_LOD_LEVEL,
        path: entry.path
      });
    }
  });

  if (!filesByLevel.has(HIGH_MODEL_LOD_LEVEL)) {
    const firstFile = filesByLevel.values().next().value;

    if (firstFile) {
      filesByLevel.set(HIGH_MODEL_LOD_LEVEL, {
        ...firstFile,
        level: HIGH_MODEL_LOD_LEVEL
      });
    }
  }

  return dedupeModelFiles(Array.from(filesByLevel.values()));
}

function resolveImportedModelFormat(fileName: string) {
  return resolveModelFormat(undefined, fileName);
}

function updateModelAssetFiles(
  asset: Asset,
  files: ModelAssetFile[],
  bounds?: Awaited<ReturnType<typeof analyzeModelSource>>
): Asset {
  const nextFiles = dedupeModelFiles(files);
  const primaryFile = nextFiles.find((file) => file.level === HIGH_MODEL_LOD_LEVEL) ?? nextFiles[0];

  if (!primaryFile) {
    return structuredClone(asset);
  }

  return {
    ...structuredClone(asset),
    metadata: {
      ...structuredClone(asset.metadata),
      ...(bounds
        ? {
            nativeCenterX: bounds.center.x,
            nativeCenterY: bounds.center.y,
            nativeCenterZ: bounds.center.z,
            nativeSizeX: bounds.size.x,
            nativeSizeY: bounds.size.y,
            nativeSizeZ: bounds.size.z
          }
        : {}),
      materialMtlText: primaryFile.materialMtlText ?? "",
      modelFiles: createSerializedModelAssetFiles(nextFiles),
      modelFormat: primaryFile.format,
      texturePath: primaryFile.texturePath ?? ""
    },
    path: primaryFile.path
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

function extractProjectMetadata(
  payload: SceneDocumentSnapshot | WorldPersistenceBundle
): EditorFileMetadata | undefined {
  if ("documents" in payload) {
    return payload.manifest.metadata;
  }

  return payload.metadata;
}

function createUniqueWorldDocumentId(bundle: WorldPersistenceBundle, preferredId: string) {
  let nextId = preferredId;
  let attempt = 2;

  while (bundle.documents[nextId]) {
    nextId = `${preferredId}-${attempt}`;
    attempt += 1;
  }

  return nextId;
}

function createUniqueWorldPartitionId(bundle: WorldPersistenceBundle, preferredId: string) {
  let nextId = preferredId;
  let attempt = 2;

  while (bundle.partitions[nextId]) {
    nextId = `${preferredId}-${attempt}`;
    attempt += 1;
  }

  return nextId;
}

function resolveFileStem(filename?: string) {
  if (!filename) {
    return "Imported Scene";
  }

  return filename.replace(/\.[^.]+$/, "") || "Imported Scene";
}
