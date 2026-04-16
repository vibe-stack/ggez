import type { EditorCore, SceneSpatialAnalysis } from "@ggez/editor-core";
import { gridSnapValues, type DerivedRenderScene, type ViewportState } from "@ggez/render-pipeline";
import { isInstancingSourceNode } from "@ggez/shared";
import type {
  SceneSettings,
  TextureRecord,
  Transform,
} from "@ggez/shared";
import { defaultTools } from "@ggez/tool-system";
import type { WorkerJob } from "@ggez/workers";
import { useEffect, useMemo, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import type { CopilotSession } from "@/lib/copilot/types";
import { useEditorActionDomains } from "@/app/editor-action-domains";
import { AiModelPromptBar } from "@/components/editor-shell/AiModelPromptBar";
import { CopilotPanel } from "@/components/editor-shell/CopilotPanel";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { StatusBar } from "@/components/editor-shell/StatusBar";
import { ToolPaletteContainer } from "@/components/editor-shell/ToolPaletteContainer";
import { LogicViewerSheet } from "@/components/editor-shell/logic-viewer/LogicViewerSheet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { ModelAssetLibraryItem } from "@/lib/model-assets";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import { projectSessionStore } from "@/state/project-session-store";
import { sceneSessionStore } from "@/state/scene-session-store";
import { toolSessionStore } from "@/state/tool-session-store";
import { uiStore, type ViewportQuality } from "@/state/ui-store";
import {
  getViewModePreset,
  viewportPaneDefinitions,
  type ViewModeId,
  type ViewportPaneId,
} from "@/viewport/viewports";
import { cn } from "@/lib/utils";

type EditorShellProps = {
  copilot: {
    session: CopilotSession;
    sendMessage: (prompt: string) => void;
    abort: () => void;
    clearHistory: () => void;
    isConfigured: boolean;
    refreshConfigured: () => void;
  };
  gameConnectionControl?: ReactNode;
  analysis: SceneSpatialAnalysis;
  editor: EditorCore;
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  jobs: WorkerJob[];
  modelAssets: ModelAssetLibraryItem[];
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  textures: TextureRecord[];
  workingSet: {
    activeDocumentId?: string;
    loadedDocumentIds: string[];
    mode: "scene" | "world";
    pinnedDocumentIds: string[];
  };
};

export function EditorShell({
  copilot,
  gameConnectionControl,
  analysis,
  editor,
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  jobs,
  modelAssets,
  renderScene,
  sceneSettings,
  textures,
  workingSet
}: EditorShellProps) {
  void analysis;
  const {
    aiActions,
    assetActions,
    fileActions,
    history,
    placementActions,
    sceneActions,
    selectionActions
  } = useEditorActionDomains();
  const { canRedo, canUndo, redo: onRedo, undo: onUndo } = history;
  const {
    cancelPlacement: onCancelAiModelPlacement,
    generateModel: onGenerateAiModel,
    updatePrompt: onUpdateAiModelPrompt
  } = aiActions;
  const {
    applyMaterial: onApplyMaterial,
    assignAssetLod: onAssignAssetLod,
    clearAssetLod: onClearAssetLod,
    deleteAsset: onDeleteAsset,
    deleteMaterial: onDeleteMaterial,
    deleteTexture: onDeleteTexture,
    focusAssetNodes: onFocusAssetNodes,
    importAsset: onImportAsset,
    insertAsset: onInsertAsset,
    selectAsset: onSelectAsset,
    selectMaterial: onSelectMaterial,
    setUvOffset: onSetUvOffset,
    setUvScale: onSetUvScale,
    upsertMaterial: onUpsertMaterial,
    upsertTexture: onUpsertTexture
  } = assetActions;
  const {
    createBrush: onCreateBrush,
    exportEngine: onExportEngine,
    exportGltf: onExportGltf,
    exportSceneDocument: onExportSceneDocument,
    importSceneDocument: onImportSceneDocument,
    loadWhmap: onLoadWhmap,
    newFile: onNewFile,
    saveWhmap: onSaveWhmap
  } = fileActions;
  const {
    placeAiModelPlaceholder: onPlaceAiModelPlaceholder,
    placeAsset: onPlaceAsset,
    placeBrush: onPlaceBrush,
    placeInstancingNodes: onPlaceInstancingNodes,
    placeMeshNode: onPlaceMeshNode,
    placePrimitiveNode: onPlacePrimitiveNode,
  } = placementActions;
  const {
    commitMeshMaterialLayers: onCommitMeshMaterialLayers,
    commitMeshTopology: onCommitMeshTopology,
    meshEditToolbarAction: onMeshEditToolbarAction,
    previewBrushData: onPreviewBrushData,
    previewEntityTransform: onPreviewEntityTransform,
    previewMeshData: onPreviewMeshData,
    previewNodeTransform: onPreviewNodeTransform,
    splitBrushAtCoordinate: onSplitBrushAtCoordinate,
    updateBrushData: onUpdateBrushData,
    updateEntityHooks: onUpdateEntityHooks,
    updateEntityProperties: onUpdateEntityProperties,
    updateEntityTransform: onUpdateEntityTransform,
    updateMeshData: onUpdateMeshData,
    updateNodeData: onUpdateNodeData,
    updateNodeHooks: onUpdateNodeHooks,
    updateNodeTransform: onUpdateNodeTransform,
    updateSceneSettings: onUpdateSceneSettings
  } = sceneActions;
  const {
    clearSelection: onClearSelection,
    clipSelection: onClipSelection,
    deleteSelection: onDeleteSelection,
    duplicateSelection: onDuplicateSelection,
    extrudeSelection: onExtrudeSelection,
    focusNode: onFocusNode,
    groupSelection: onGroupSelection,
    mirrorSelection: onMirrorSelection,
    selectNodes: onSelectNodes,
    toggleSceneItemLock: onToggleSceneItemLock,
    toggleSceneItemVisibility: onToggleSceneItemVisibility,
    translateSelection: onTranslateSelection
  } = selectionActions;
  const ui = useSnapshot(uiStore);
  const toolSession = useSnapshot(toolSessionStore);
  const projectSession = useSnapshot(projectSessionStore);
  const sceneSession = useSnapshot(sceneSessionStore);
  const {
    activeBrushShape,
    activeToolId,
    aiModelDraft,
    aiModelPlacementArmed,
    brushToolMode,
    instanceBrushAlignToNormal,
    instanceBrushAverageNormal,
    instanceBrushDensity,
    instanceBrushRandomness,
    instanceBrushSize,
    instanceBrushSourceNodeId,
    instanceBrushSourceNodeIds,
    instanceBrushYOffsetMin,
    instanceBrushYOffsetMax,
    instanceBrushScaleMin,
    instanceBrushScaleMax,
    materialPaintBrushOpacity,
    materialPaintMode,
    meshEditMode,
    meshEditToolbarAction,
    physicsPlayback,
    physicsRevision,
    sculptBrushRadius,
    sculptBrushStrength,
    sculptMode,
    transformMode
  } = toolSession;
  const activeRightPanel = ui.rightPanel;
  const activeViewportId = ui.activeViewportId;
  const renderMode = ui.renderMode;
  const selectedAssetId = ui.selectedAssetId;
  const selectedMaterialId = ui.selectedMaterialId;
  const viewMode = ui.viewMode;
  const viewportQuality = ui.viewportQuality;
  const viewports = ui.viewports;
  const hiddenSceneItemIds = sceneSession.hiddenSceneItemIds;
  const lockedSceneItemIds = sceneSession.lockedSceneItemIds;
  const selectedFaceIds = sceneSession.selectedMaterialFaceIds;
  const selectedScenePathId = sceneSession.selectedScenePathId;
  const selectionEnabled = physicsPlayback === "stopped";
  const nodes = Array.from(editor.scene.nodes.values());
  const entities = Array.from(editor.scene.entities.values());
  const materials = Array.from(editor.scene.materials.values());
  const selectedObjectId = selectionEnabled ? editor.selection.ids[0] : undefined;
  const selectedNodeId = selectedObjectId && editor.scene.getNode(selectedObjectId) ? selectedObjectId : undefined;
  const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
  const selectedEntity = !selectedNodeId && selectedObjectId ? editor.scene.getEntity(selectedObjectId) : undefined;
  const selectedNodeIds = selectionEnabled ? editor.selection.ids : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => editor.scene.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const activeToolLabel = defaultTools.find((tool) => tool.id === activeToolId)?.label ?? activeToolId;
  const activeViewport = viewports[activeViewportId];
  const aiModelPlacementActive = Boolean(aiModelDraft);
  const aiModelPrompt = aiModelDraft?.prompt ?? "";
  const aiModelPromptError = aiModelDraft?.error;
  const instanceBrushSourceNode = useMemo(
    () => nodes.find((node) => node.id === instanceBrushSourceNodeId && isInstancingSourceNode(node)),
    [instanceBrushSourceNodeId, nodes]
  );
  const instanceBrushSourceTransform = useMemo(() => {
    if (!instanceBrushSourceNode) {
      return undefined;
    }

    return (
      renderScene.nodeTransforms.get(instanceBrushSourceNode.id) ??
      (workingSet.mode === "world" && workingSet.activeDocumentId
        ? renderScene.nodeTransforms.get(`${workingSet.activeDocumentId}::${instanceBrushSourceNode.id}`)
        : undefined) ??
      instanceBrushSourceNode.transform
    );
  }, [instanceBrushSourceNode, renderScene.nodeTransforms, workingSet.activeDocumentId, workingSet.mode]);
  const handleActivateViewport = (viewportId: ViewportPaneId) => {
    uiStore.activeViewportId = viewportId;
  };

  const handleUpdateViewport = (viewportId: ViewportPaneId, viewport: ViewportState) => {
    uiStore.viewports[viewportId].projection = viewport.projection;
    uiStore.viewports[viewportId].camera = viewport.camera;
  };

  const handleToggleViewportQuality = () => {
    uiStore.viewportQuality =
      uiStore.viewportQuality === 0.5
        ? 0.75
        : uiStore.viewportQuality === 0.75
          ? 1
          : uiStore.viewportQuality === 1
            ? 1.5
            : 0.5;
  };

  const handleToggleCopilot = () => {
    uiStore.copilotPanelOpen = !uiStore.copilotPanelOpen;
  };

  const handleToggleLogicViewer = () => {
    uiStore.logicViewerOpen = !uiStore.logicViewerOpen;
  };

  const editorMenuActions = {
    onClearSelection,
    onCreateBrush,
    onDeleteSelection,
    onDuplicateSelection,
    onExportEngine,
    onExportGltf,
    onExportSceneDocument,
    onGroupSelection,
    onImportSceneDocument,
    onLoadWhmap,
    onNewFile,
    onRedo,
    onSaveWhmap,
    onToggleCopilot: handleToggleCopilot,
    onToggleLogicViewer: handleToggleLogicViewer,
    onToggleViewportQuality: handleToggleViewportQuality,
    onUndo
  };
  const viewportActions = {
    onActivateViewport: handleActivateViewport,
    onClearSelection,
    onCommitMeshMaterialLayers,
    onCommitMeshTopology,
    onFocusNode,
    onPlaceAsset,
    onPlaceAiModelPlaceholder,
    onPlaceBrush,
    onPlaceInstancingNodes,
    onPlaceInstanceBrushNodes: (placements: Array<{ sourceNodeId: string; transform: Transform }>) => {
      if (placements.length === 0) return;
      // Group by sourceNodeId and make one call per unique source.
      const grouped = new Map<string, Transform[]>();
      for (const { sourceNodeId, transform } of placements) {
        const existing = grouped.get(sourceNodeId);
        if (existing) existing.push(transform);
        else grouped.set(sourceNodeId, [transform]);
      }
      grouped.forEach((transforms, sourceNodeId) => {
        onPlaceInstancingNodes(sourceNodeId, transforms);
      });
    },
    onPlaceMeshNode,
    onPlacePrimitiveNode,
    onPreviewBrushData,
    onPreviewEntityTransform,
    onPreviewMeshData,
    onPreviewNodeTransform,
    onSelectNodes,
    onSplitBrushAtCoordinate,
    onUpdateBrushData,
    onUpdateEntityTransform,
    onUpdateMeshData,
    onUpdateNodeTransform,
    onUpdateSceneSettings,
    onViewportChange: handleUpdateViewport
  };
  const inspectorActions = {
    onApplyMaterial,
    onAssignAssetLod,
    onChangeRightPanel: (panel: typeof activeRightPanel) => {
      uiStore.rightPanel = panel;
    },
    onClearAssetLod,
    onClipSelection,
    onDeleteAsset,
    onDeleteMaterial,
    onDeleteTexture,
    onExtrudeSelection,
    onFocusAssetNodes,
    onFocusNode,
    onImportAsset,
    onInsertAsset,
    onMeshEditToolbarAction,
    onMirrorSelection,
    onPlaceAsset,
    onSelectAsset,
    onSelectMaterial,
    onSelectNodes,
    onSetUvOffset,
    onSetUvScale,
    onToggleSceneItemLock,
    onToggleSceneItemVisibility,
    onTranslateSelection,
    onUpdateEntityHooks,
    onUpdateEntityProperties,
    onUpdateEntityTransform,
    onUpdateMeshData,
    onUpdateNodeData,
    onUpdateNodeHooks,
    onUpdateNodeTransform,
    onUpdateSceneSettings,
    onUpsertMaterial,
    onUpsertTexture
  };
  const logicViewerActions = {
    onClose: handleToggleLogicViewer,
    onUpdateEntityHooks,
    onUpdateNodeHooks
  };

  const renderViewportPane = (viewportId: ViewportPaneId) => {
    const definition = viewportPaneDefinitions[viewportId];

    return (
      <ViewportPaneFrame
        key={viewportId}
        label={definition.shortLabel}
      >
        <ViewportCanvas
          {...viewportActions}
          activeBrushShape={activeBrushShape}
          brushToolMode={brushToolMode}
          aiModelPlacementArmed={aiModelPlacementArmed}
          activeToolId={activeToolId}
          dprScale={resolveViewportDprScale(viewportQuality)}
          hiddenSceneItemIds={effectiveHiddenSceneItemIds}
          instanceBrushAlignToNormal={instanceBrushAlignToNormal}
          instanceBrushAverageNormal={instanceBrushAverageNormal}
          instanceBrushDensity={instanceBrushDensity}
          instanceBrushRandomness={instanceBrushRandomness}
          instanceBrushSize={instanceBrushSize}
          instanceBrushSourceNodeId={instanceBrushSourceNodeId}
          instanceBrushSourceNodeIds={[...instanceBrushSourceNodeIds]}
          instanceBrushSourceTransform={instanceBrushSourceTransform}
          instanceBrushYOffsetMin={instanceBrushYOffsetMin}
          instanceBrushYOffsetMax={instanceBrushYOffsetMax}
          instanceBrushScaleMin={instanceBrushScaleMin}
          instanceBrushScaleMax={instanceBrushScaleMax}
          isActiveViewport={activeViewportId === viewportId}
          materialPaintBrushOpacity={materialPaintBrushOpacity}
          meshEditMode={meshEditMode}
          meshEditToolbarAction={meshEditToolbarAction}
          sculptBrushRadius={sculptBrushRadius}
          sculptBrushStrength={sculptBrushStrength}
          onMaterialPaintModeChange={activeViewportId === viewportId ? (mode) => {
            toolSessionStore.materialPaintMode = mode;
          } : () => {}}
          onSculptModeChange={activeViewportId === viewportId ? (mode) => {
            toolSessionStore.sculptMode = mode;
          } : () => {}}
          onSelectMaterialFaces={(faceIds) => {
            sceneSessionStore.selectedMaterialFaceIds = faceIds;
          }}
          onSelectScenePath={(pathId) => {
            sceneSessionStore.selectedScenePathId = pathId;
          }}
          onSetToolId={(toolId) => {
            toolSessionStore.activeToolId = toolId;
          }}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          renderMode={renderMode}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
          selectedMaterialId={selectedMaterialId}
          selectedScenePathId={selectedScenePathId}
          selectedEntity={selectedEntity}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          selectedNodes={selectedNodes}
          transformMode={transformMode}
          viewport={viewports[viewportId]}
          viewportId={viewportId}
          viewportPlane={definition.plane}
        />
      </ViewportPaneFrame>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#08100d_0%,#050807_100%)] text-foreground">
      <header className="shrink-0 bg-black/18 backdrop-blur-xl">
        <EditorMenuBar
          {...editorMenuActions}
          canRedo={canRedo}
          canUndo={canUndo}
          copilotOpen={ui.copilotPanelOpen}
          gameConnectionControl={gameConnectionControl}
          logicViewerOpen={ui.logicViewerOpen}
          onFocusSelection={() => {
            if (selectedObjectId) {
              onFocusNode(selectedObjectId);
            }
          }}
          viewportQuality={viewportQuality}
        />
      </header>

      <main className="relative min-h-0 flex-1 flex">
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            <ViewportLayout renderViewportPane={renderViewportPane} viewMode={viewMode} />
          </div>

        <ToolPaletteContainer editor={editor} />

        <AiModelPromptBar
          active={aiModelPlacementActive}
          armed={aiModelPlacementArmed}
          busy={false}
          error={aiModelPromptError}
          onCancel={onCancelAiModelPlacement}
          onChangePrompt={onUpdateAiModelPrompt}
          onSubmit={onGenerateAiModel}
          prompt={aiModelPrompt}
        />

        {/* <SpatialAnalysisPanel analysis={analysis} /> */}
        <InspectorSidebar
          {...inspectorActions}
          activeRightPanel={activeRightPanel}
          activeToolId={activeToolId}
          effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
          effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
          entities={entities}
          hiddenSceneItemIds={[...hiddenSceneItemIds]}
          lockedSceneItemIds={[...lockedSceneItemIds]}
          materials={materials}
          meshEditMode={meshEditMode}
          modelAssets={modelAssets}
          nodes={nodes}
          onSelectScenePath={(pathId) => {
            sceneSessionStore.selectedScenePathId = pathId;
          }}
          onSetToolId={(toolId) => {
            toolSessionStore.activeToolId = toolId;
          }}
          sceneSettings={sceneSettings}
          selectedScenePathId={selectedScenePathId}
          selectionEnabled={selectionEnabled}
          selectedEntity={selectedEntity}
          selectedAssetId={selectedAssetId}
          selectedFaceIds={[...selectedFaceIds]}
          selectedMaterialId={selectedMaterialId}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          textures={textures}
          viewportTarget={activeViewport.camera.target}
        />

        <StatusBar
          activeBrushShape={activeBrushShape}
          activeToolLabel={activeToolLabel}
          activeViewportId={activeViewportId}
          gridSnapValues={gridSnapValues}
          jobs={jobs}
          meshEditMode={meshEditMode}
          runtimeSyncDebugLabel={projectSession.runtimeSyncDebugLabel}
          selectedNode={selectedNode}
          viewModeLabel={getViewModePreset(viewMode).shortLabel}
          viewport={activeViewport}
        />

        {ui.logicViewerOpen && (
          <LogicViewerSheet
            {...logicViewerActions}
            entities={entities}
            nodes={nodes}
            onNodeClick={(objectId) => {
              onSelectNodes([objectId]);
              if (editor.scene.getNode(objectId)) {
                onFocusNode(objectId);
              }
            }}
          />
        )}
        </div>

        {ui.copilotPanelOpen && (
          <div className="w-80 shrink-0">
            <CopilotPanel
              isConfigured={copilot.isConfigured}
              onAbort={copilot.abort}
              onClearHistory={copilot.clearHistory}
              onClose={handleToggleCopilot}
              onSendMessage={copilot.sendMessage}
              onSettingsChanged={copilot.refreshConfigured}
              session={copilot.session}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function resolveViewportDprScale(quality: ViewportQuality) {
  return quality;
}

function ViewportLayout({
  renderViewportPane,
  viewMode
}: {
  renderViewportPane: (viewportId: ViewportPaneId) => ReactNode;
  viewMode: ViewModeId;
}) {
  const preset = getViewModePreset(viewMode);

  if (preset.layout === "single") {
    return <div className="size-full">{renderViewportPane("perspective")}</div>;
  }

  if (preset.layout === "split") {
    return (
      <ResizablePanelGroup className="size-full" orientation="horizontal">
        <ResizablePanel defaultSize={62} minSize={35}>
          {renderViewportPane("perspective")}
        </ResizablePanel>
        <ViewportSplitHandle />
        <ResizablePanel defaultSize={38} minSize={20}>
          {renderViewportPane(preset.secondaryPaneId)}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  return (
    <ResizablePanelGroup className="size-full" orientation="horizontal">
      <ResizablePanel defaultSize={50} minSize={32}>
        <ResizablePanelGroup className="size-full" orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("top")}
          </ResizablePanel>
          <ViewportSplitHandle direction="horizontal" />
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("perspective")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ViewportSplitHandle />
      <ResizablePanel defaultSize={50} minSize={32}>
        <ResizablePanelGroup className="size-full" orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("front")}
          </ResizablePanel>
          <ViewportSplitHandle direction="horizontal" />
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("side")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ViewportPaneFrame({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn("relative size-full overflow-hidden bg-[#071016]")}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-black/36 px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] text-foreground/72 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function ViewportSplitHandle({ direction = "vertical" }: { direction?: "horizontal" | "vertical" }) {
  return (
    <ResizableHandle
      className="bg-white/8 after:bg-transparent hover:bg-emerald-400/22 data-dragging:bg-emerald-400/28"
      withHandle={direction === "vertical"}
    />
  );
}
