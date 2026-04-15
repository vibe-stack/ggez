import { useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import {
  analyzeSceneSpatialLayout,
  createReplaceNodesCommand,
  createSceneEditorAdapter,
  createSceneDocumentSnapshot,
  createSeedSceneDocument,
  createWorldEditorCore,
  type WorldPersistenceBundle
} from "@ggez/editor-core";
import { createDerivedRenderSceneCache, deriveRenderSceneCached } from "@ggez/render-pipeline";
import {
  isModelNode,
  isPrimitiveNode,
} from "@ggez/shared";
import { createWorkerTaskManager, type WorkerJob } from "@ggez/workers";
import { slugifyProjectName } from "@ggez/dev-sync";
import { WorldEditorShell } from "@/components/WorldEditorShell";
import { EditorActionDomainsProvider } from "@/app/editor-action-domains";
import { useAppHotkeys } from "@/app/hooks/useAppHotkeys";
import { useAssetMaterialActions } from "@/app/hooks/useAssetMaterialActions";
import { useCopilot } from "@/app/hooks/useCopilot";
import { useEditorSubscriptions } from "@/app/hooks/useEditorSubscriptions";
import { useExportWorker } from "@/app/hooks/useExportWorker";
import { useGameConnection } from "@/app/hooks/useGameConnection";
import { useProjectTransferActions } from "@/app/hooks/useProjectTransferActions";
import { useSceneDraftPersistence } from "@/app/hooks/useSceneDraftPersistence";
import { useSceneMutationActions } from "@/app/hooks/useSceneMutationActions";
import { useWorldDocumentManagement } from "@/app/hooks/useWorldDocumentManagement";
import { GameConnectionControl } from "@/components/editor-shell/GameConnectionControl";
import { convertPrimitiveNodeToMeshNode } from "@/lib/primitive-to-mesh";
import { buildModelAssetLibrary } from "@/lib/model-assets";
import { resolveEffectiveSceneItemIds } from "@/lib/scene-hierarchy";
import { uiStore } from "@/state/ui-store";
import { projectSessionStore } from "@/state/project-session-store";
import { sceneSessionStore } from "@/state/scene-session-store";
import { toolSessionStore } from "@/state/tool-session-store";

export function App() {
  const [worldEditor] = useState(() => createWorldEditorCore(createSceneDocumentSnapshot(createSeedSceneDocument())));
  const [editor] = useState(() => createSceneEditorAdapter(worldEditor));
  const [workerManager] = useState(() => createWorkerTaskManager());
  const [workerJobs, setWorkerJobs] = useState<WorkerJob[]>([]);
  const [committedSceneRevision, setCommittedSceneRevision] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [worldRevision, setWorldRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sceneDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const glbImportInputRef = useRef<HTMLInputElement | null>(null);
  const modelLodInputRef = useRef<HTMLInputElement | null>(null);
  const renderSceneCacheRef = useRef(createDerivedRenderSceneCache());
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

  const syncEditorFromWorld = (reason: string) => {
    editor.syncFromWorld(reason);
    setWorldRevision((revision) => revision + 1);
    setSceneRevision((revision) => revision + 1);
    setCommittedSceneRevision((revision) => revision + 1);
    setSelectionRevision((revision) => revision + 1);
  };

  const enqueueWorkerJob = (label: string, task: WorkerJob["task"], durationMs?: number) => {
    workerManager.enqueue(task, label, durationMs);
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

  const draftHydrated = useSceneDraftPersistence({
    buildDraft: buildSceneDraftPayload,
    onRestoreDraft: (draft) => {
      worldEditor.importBundle(draft.snapshot, "world:restore-draft");
      syncEditorFromWorld("world:restore-draft");
      projectSessionStore.projectName = draft.projectName || "Untitled Scene";
      projectSessionStore.projectSlug = slugifyProjectName(draft.projectSlug || draft.projectName || "Untitled Scene");
      projectSessionStore.projectSlugDirty = draft.projectSlugDirty;
    },
    saveKey: `${committedSceneRevision}:${projectSlugDirty ? 1 : 0}:${resolvedProjectName}:${resolvedProjectSlug}`
  }).draftHydrated;

  const {
    createBrush,
    instanceSelection,
    physicsActions,
    placementActions: scenePlacementActions,
    sceneActions,
    selectionActions
  } = useSceneMutationActions({
    activeWorldDocumentId,
    blockedSceneItemIdSet,
    bumpSceneRevision: () => {
      setSceneRevision((revision) => revision + 1);
    },
    editor,
    enqueueWorkerJob,
    renderScene,
    syncEditorFromWorld,
    workingSet,
    worldEditor
  });

  const {
    aiActions,
    assetActions,
    fileInputHandlers: assetFileInputHandlers,
    placementActions: assetPlacementActions
  } = useAssetMaterialActions({
    editor,
    enqueueWorkerJob,
    focusNode: selectionActions.focusNode,
    glbImportInputRef,
    modelAssets,
    modelLodInputRef,
    runWorkerRequest
  });

  const {
    fileActions: baseFileActions,
    fileInputHandlers: projectFileInputHandlers,
    gameSyncActions
  } = useProjectTransferActions({
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
    workingSet,
    worldEditor
  });

  const handleUndo = () => {
    editor.undo();
  };

  const handleRedo = () => {
    editor.redo();
  };

  const copilot = useCopilot(editor, {
    requestScenePush: (options) => {
      void gameSyncActions.handlePushSceneToGame(options).catch(() => {});
    }
  });

  const handleToggleCopilot = () => {
    uiStore.copilotPanelOpen = !uiStore.copilotPanelOpen;
  };

  const handleToggleLogicViewer = () => {
    uiStore.logicViewerOpen = !uiStore.logicViewerOpen;
  };

  const {
    handleCreateWorldDocument,
    handleLoadWorldDocument,
    handlePinWorldDocument,
    handleSetActiveWorldDocument,
    handleSetWorldDocumentPosition,
    handleSetWorldMode,
    handleUnloadWorldDocument,
    handleUnpinWorldDocument,
    worldDocuments
  } = useWorldDocumentManagement({
    buildWorldBundle,
    syncEditorFromWorld,
    workingSet,
    worldEditor,
    worldRevision
  });

  useAppHotkeys({
    activeToolId,
    editor,
    enabled: physicsPlayback === "stopped",
    handleDeleteSelection: selectionActions.deleteSelection,
    handleDuplicateSelection: selectionActions.duplicateSelection,
    handleInstanceSelection: instanceSelection,
    handleGroupSelection: selectionActions.groupSelection,
    handleInvertSelectionNormals: selectionActions.invertSelectionNormals,
    handleRedo,
    handleToggleCopilot,
    handleToggleLogicViewer,
    handleTranslateSelection: selectionActions.translateSelection,
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

  const history = {
    canRedo: editor.commands.canRedo(),
    canUndo: editor.commands.canUndo(),
    redo: handleRedo,
    undo: handleUndo
  };
  const placementActions = {
    ...scenePlacementActions,
    ...assetPlacementActions
  };
  const fileActions = {
    ...baseFileActions,
    importGlb: assetActions.importAsset
  };
  const actionDomains = useMemo(
    () => ({
      aiActions,
      assetActions,
      fileActions,
      history,
      physicsActions,
      placementActions,
      sceneActions,
      selectionActions
    }),
    [aiActions, assetActions, fileActions, history, physicsActions, placementActions, sceneActions, selectionActions]
  );
  const world = {
    actions: {
      createDocument: handleCreateWorldDocument,
      loadDocument: handleLoadWorldDocument,
      pinDocument: handlePinWorldDocument,
      setActiveDocument: handleSetActiveWorldDocument,
      setDocumentPosition: handleSetWorldDocumentPosition,
      setWorldMode: handleSetWorldMode,
      unloadDocument: handleUnloadWorldDocument,
      unpinDocument: handleUnpinWorldDocument
    },
    documents: worldDocuments,
    validationIssues: worldEditor.world.validation
  };

  return (
    <>
      <EditorActionDomainsProvider value={actionDomains}>
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
              onProjectNameChange={gameSyncActions.handleProjectNameChange}
              onProjectSlugChange={gameSyncActions.handleProjectSlugChange}
              onPushScene={(forceSwitch) => {
                void gameSyncActions.handlePushSceneToGame({ forceSwitch });
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
          editor={editor}
          jobs={[...workerJobs, ...exportJobs]}
          modelAssets={modelAssets}
          renderScene={renderScene}
          sceneSettings={editor.scene.settings}
          textures={Array.from(editor.scene.textures.values())}
          workingSet={workingSet}
          world={world}
        />
      </EditorActionDomainsProvider>
      <input
        accept=".whmap,.json"
        hidden
        onChange={projectFileInputHandlers.handleWhmapFileChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept=".whdoc,.json"
        hidden
        multiple
        onChange={projectFileInputHandlers.handleSceneDocumentFileChange}
        ref={sceneDocumentInputRef}
        type="file"
      />
      <input
        accept=".glb,.gltf,.obj,model/gltf-binary,model/gltf+json"
        hidden
        multiple
        onChange={assetFileInputHandlers.handleGlbFileChange}
        ref={glbImportInputRef}
        type="file"
      />
      <input
        accept=".glb,.gltf,.obj,model/gltf-binary,model/gltf+json"
        hidden
        onChange={assetFileInputHandlers.handleAssetLodFileChange}
        ref={modelLodInputRef}
        type="file"
      />
    </>
  );
}
