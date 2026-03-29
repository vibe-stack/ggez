import type { EditorCore, SceneSpatialAnalysis, TransformAxis } from "@ggez/editor-core";
import type { GridSnapValue, DerivedRenderScene, ViewportState } from "@ggez/render-pipeline";
import type {
  BrushShape,
  Brush,
  EditableMesh,
  Entity,
  EntityType,
  GeometryNode,
  LightNodeData,
  LightType,
  Material,
  SceneSettings,
  TextureRecord,
  Transform,
  Vec2
} from "@ggez/shared";
import type { PrimitiveNodeData, PrimitiveShape } from "@ggez/shared";
import type { ToolId } from "@ggez/tool-system";
import type { WorkerJob } from "@ggez/workers";
import type { ReactNode } from "react";
import type { CopilotSession } from "@/lib/copilot/types";
import { AiModelPromptBar } from "@/components/editor-shell/AiModelPromptBar";
import { CopilotPanel } from "@/components/editor-shell/CopilotPanel";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { SpatialAnalysisPanel } from "@/components/editor-shell/SpatialAnalysisPanel";
import { StatusBar } from "@/components/editor-shell/StatusBar";
import { ToolPalette } from "@/components/editor-shell/ToolPalette";
import { LogicViewerSheet } from "@/components/editor-shell/logic-viewer/LogicViewerSheet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import type { RightPanelId, ViewportQuality } from "@/state/ui-store";
import {
  getViewModePreset,
  viewportPaneDefinitions,
  type ViewModeId,
  type ViewportPaneId
} from "@/viewport/viewports";
import { cn } from "@/lib/utils";

type EditorShellProps = {
  activeBrushShape: BrushShape;
  aiModelPlacementActive: boolean;
  copilot: {
    session: CopilotSession;
    sendMessage: (prompt: string) => void;
    abort: () => void;
    clearHistory: () => void;
    isConfigured: boolean;
    refreshConfigured: () => void;
  };
  copilotPanelOpen: boolean;
  gameConnectionControl?: ReactNode;
  logicViewerOpen: boolean;
  aiModelPlacementArmed: boolean;
  aiModelPrompt: string;
  aiModelPromptBusy: boolean;
  aiModelPromptError?: string;
  activeRightPanel: RightPanelId | null;
  activeToolId: ToolId;
  activeViewportId: ViewportPaneId;
  analysis: SceneSpatialAnalysis;
  canRedo: boolean;
  canUndo: boolean;
  editor: EditorCore;
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  gridSnapValues: readonly GridSnapValue[];
  hiddenSceneItemIds: string[];
  jobs: WorkerJob[];
  lockedSceneItemIds: string[];
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  sculptMode?: "deflate" | "inflate" | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  onActivateViewport: (viewportId: ViewportPaneId) => void;
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onClipSelection: (axis: TransformAxis) => void;
  onCommitMeshTopology: (nodeId: string, mesh: EditableMesh) => void;
  onCreateBrush: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onClearSelection: () => void;
  onExportEngine: () => void;
  onExportGltf: () => void;
  onExtrudeSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onFocusNode: (nodeId: string) => void;
  onDeleteMaterial: (materialId: string) => void;
  onDeleteTexture: (textureId: string) => void;
  onCancelAiModelPlacement: () => void;
  onLoadWhmap: () => void;
  onNewFile: () => void;
  onInvertSelectionNormals: () => void;
  onPausePhysics: () => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceBlockoutOpenRoom: () => void;
  onPlaceBlockoutPlatform: () => void;
  onPlaceBlockoutRoom: () => void;
  onPlaceBlockoutStairs: () => void;
  onMirrorSelection: (axis: TransformAxis) => void;
  onGenerateAiModel: () => void;
  onImportGlb: () => void;
  onPlaceAsset: (position: { x: number; y: number; z: number }) => void;
  onPlaceAiModelPlaceholder: (position: { x: number; y: number; z: number }) => void;
  onPlaceBrush: (brush: Brush, transform: Transform) => void;
  onPlaceMeshNode: (mesh: EditableMesh, transform: Transform, name: string) => void;
  onPlacePrimitiveNode: (data: PrimitiveNodeData, transform: Transform, name: string) => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onPlayPhysics: () => void;
  onPreviewBrushData: (nodeId: string, brush: Brush) => void;
  onPreviewEntityTransform: (entityId: string, transform: Transform) => void;
  onPreviewMeshData: (nodeId: string, mesh: EditableMesh) => void;
  onSculptModeChange: (mode: "deflate" | "inflate" | null) => void;
  onRedo: () => void;
  onSaveWhmap: () => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterialFaces: (faceIds: string[]) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectScenePath: (pathId: string | undefined) => void;
  onStartAiModelPlacement: () => void;
  onToggleSceneItemLock: (itemId: string) => void;
  onToggleSceneItemVisibility: (itemId: string) => void;
  onSetUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetActiveBrushShape: (shape: BrushShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onSetRightPanel: (panel: RightPanelId | null) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetToolId: (toolId: ToolId) => void;
  onToggleCopilot: () => void;
  onToggleLogicViewer: () => void;
  onToggleViewportQuality: () => void;
  onSetViewMode: (viewMode: ViewModeId) => void;
  onSplitBrushAtCoordinate: (nodeId: string, axis: TransformAxis, coordinate: number) => void;
  onPreviewNodeTransform: (nodeId: string, transform: Transform) => void;
  onTranslateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onUndo: () => void;
  onUpdateEntityProperties: (entityId: string, properties: Record<string, string | number | boolean>) => void;
  onUpdateEntityHooks: (entityId: string, hooks: NonNullable<Entity["hooks"]>, beforeHooks?: NonNullable<Entity["hooks"]>) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
  onUpdateNodeHooks: (nodeId: string, hooks: NonNullable<GeometryNode["hooks"]>, beforeHooks?: NonNullable<GeometryNode["hooks"]>) => void;
  onUpdateAiModelPrompt: (prompt: string) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  onUpdateViewport: (viewportId: ViewportPaneId, viewport: ViewportState) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpsertTexture: (texture: TextureRecord) => void;
  onUpdateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  selectedScenePathId?: string;
  selectedAssetId: string;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  transformMode: "rotate" | "scale" | "translate";
  textures: TextureRecord[];
  tools: Array<{ id: ToolId; label: string }>;
  viewMode: ViewModeId;
  viewportQuality: ViewportQuality;
  viewports: Record<ViewportPaneId, ViewportState>;
};

export function EditorShell({
  activeBrushShape,
  aiModelPlacementActive,
  aiModelPlacementArmed,
  copilot,
  copilotPanelOpen,
  gameConnectionControl,
  logicViewerOpen,
  aiModelPrompt,
  aiModelPromptBusy,
  aiModelPromptError,
  activeRightPanel,
  activeToolId,
  activeViewportId,
  analysis,
  canRedo,
  canUndo,
  editor,
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  gridSnapValues,
  hiddenSceneItemIds,
  jobs,
  lockedSceneItemIds,
  meshEditMode,
  meshEditToolbarAction,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  onActivateViewport,
  onApplyMaterial,
  onClipSelection,
  onCommitMeshTopology,
  onCreateBrush,
  onDeleteSelection,
  onDuplicateSelection,
  onGroupSelection,
  onClearSelection,
  onExportEngine,
  onExportGltf,
  onExtrudeSelection,
  onFocusNode,
  onDeleteMaterial,
  onDeleteTexture,
  onCancelAiModelPlacement,
  onLoadWhmap,
  onNewFile,
  onInvertSelectionNormals,
  onPausePhysics,
  onMeshEditToolbarAction,
  onPlaceEntity,
  onPlaceLight,
  onPlaceBlockoutOpenRoom,
  onPlaceBlockoutPlatform,
  onPlaceBlockoutRoom,
  onPlaceBlockoutStairs,
  onMirrorSelection,
  onGenerateAiModel,
  onImportGlb,
  onPlaceAsset,
  onPlaceAiModelPlaceholder,
  onPlaceBrush,
  onPlaceMeshNode,
  onPlacePrimitiveNode,
  onPlaceProp,
  onPlayPhysics,
  onPreviewBrushData,
  onPreviewEntityTransform,
  onPreviewMeshData,
  onSculptModeChange,
  onRedo,
  onSaveWhmap,
  onSelectAsset,
  onSelectMaterialFaces,
  onSelectMaterial,
  onSelectScenePath,
  onStartAiModelPlacement,
  onToggleSceneItemLock,
  onToggleSceneItemVisibility,
  onSetUvOffset,
  onSetUvScale,
  onSelectNodes,
  onSetActiveBrushShape,
  onSetMeshEditMode,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onSetRightPanel,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onSetTransformMode,
  onSetToolId,
  onToggleCopilot,
  onToggleLogicViewer,
  onToggleViewportQuality,
  onSetViewMode,
  onSplitBrushAtCoordinate,
  onPreviewNodeTransform,
  onTranslateSelection,
  onUndo,
  onUpdateEntityProperties,
  onUpdateEntityHooks,
  onUpdateEntityTransform,
  onUpdateNodeData,
  onUpdateNodeHooks,
  onUpdateAiModelPrompt,
  onUpdateSceneSettings,
  onUpdateViewport,
  onUpsertMaterial,
  onUpsertTexture,
  onUpdateBrushData,
  onUpdateMeshData,
  onUpdateNodeTransform,
  physicsPlayback,
  physicsRevision,
  renderScene,
  sceneSettings,
  selectedScenePathId,
  selectedAssetId,
  selectedFaceIds,
  selectedMaterialId,
  transformMode,
  textures,
  tools,
  viewMode,
  viewportQuality,
  viewports
}: EditorShellProps) {
  const selectionEnabled = physicsPlayback === "stopped";
  const nodes = Array.from(editor.scene.nodes.values());
  const entities = Array.from(editor.scene.entities.values());
  const materials = Array.from(editor.scene.materials.values());
  const assets = Array.from(editor.scene.assets.values());
  const selectedObjectId = selectionEnabled ? editor.selection.ids[0] : undefined;
  const selectedNodeId = selectedObjectId && editor.scene.getNode(selectedObjectId) ? selectedObjectId : undefined;
  const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
  const selectedEntity = !selectedNodeId && selectedObjectId ? editor.scene.getEntity(selectedObjectId) : undefined;
  const selectedNodeIds = selectionEnabled ? editor.selection.ids : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => editor.scene.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const activeToolLabel = tools.find((tool) => tool.id === activeToolId)?.label ?? activeToolId;
  const selectedIsGeometry =
    selectedNode?.kind === "brush" || selectedNode?.kind === "mesh" || selectedNode?.kind === "primitive";
  const selectedIsMesh = selectedNode?.kind === "mesh";
  const activeViewport = viewports[activeViewportId];

  const renderViewportPane = (viewportId: ViewportPaneId) => {
    const definition = viewportPaneDefinitions[viewportId];

    return (
      <ViewportPaneFrame
        key={viewportId}
        label={definition.shortLabel}
      >
        <ViewportCanvas
          activeBrushShape={activeBrushShape}
          aiModelPlacementArmed={aiModelPlacementArmed}
          activeToolId={activeToolId}
          dprScale={resolveViewportDprScale(viewportQuality)}
          hiddenSceneItemIds={effectiveHiddenSceneItemIds}
          isActiveViewport={activeViewportId === viewportId}
          meshEditMode={meshEditMode}
          meshEditToolbarAction={meshEditToolbarAction}
          sculptBrushRadius={sculptBrushRadius}
          sculptBrushStrength={sculptBrushStrength}
          onActivateViewport={onActivateViewport}
          onClearSelection={onClearSelection}
          onCommitMeshTopology={onCommitMeshTopology}
          onFocusNode={onFocusNode}
          onPlaceAsset={onPlaceAsset}
          onPlaceAiModelPlaceholder={onPlaceAiModelPlaceholder}
          onPlaceBrush={onPlaceBrush}
          onPlaceMeshNode={onPlaceMeshNode}
          onPlacePrimitiveNode={onPlacePrimitiveNode}
          onPreviewBrushData={onPreviewBrushData}
          onPreviewEntityTransform={onPreviewEntityTransform}
          onPreviewMeshData={onPreviewMeshData}
          onPreviewNodeTransform={onPreviewNodeTransform}
          onSculptModeChange={activeViewportId === viewportId ? onSculptModeChange : () => {}}
          onSelectMaterialFaces={onSelectMaterialFaces}
          onSelectScenePath={onSelectScenePath}
          onSelectNodes={onSelectNodes}
          onSetToolId={onSetToolId}
          onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
          onUpdateBrushData={onUpdateBrushData}
          onUpdateEntityTransform={onUpdateEntityTransform}
          onUpdateMeshData={onUpdateMeshData}
          onUpdateNodeTransform={onUpdateNodeTransform}
          onUpdateSceneSettings={onUpdateSceneSettings}
          onViewportChange={onUpdateViewport}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          renderMode={definition.renderMode}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
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
          canRedo={canRedo}
          canUndo={canUndo}
          copilotOpen={copilotPanelOpen}
          gameConnectionControl={gameConnectionControl}
          logicViewerOpen={logicViewerOpen}
          onClearSelection={onClearSelection}
          onCreateBrush={onCreateBrush}
          onDeleteSelection={onDeleteSelection}
          onDuplicateSelection={onDuplicateSelection}
          onGroupSelection={onGroupSelection}
          onExportEngine={onExportEngine}
          onExportGltf={onExportGltf}
          onFocusSelection={() => {
            if (selectedObjectId) {
              onFocusNode(selectedObjectId);
            }
          }}
          onLoadWhmap={onLoadWhmap}
          onNewFile={onNewFile}
          onRedo={onRedo}
          onSaveWhmap={onSaveWhmap}
          onToggleCopilot={onToggleCopilot}
          onToggleLogicViewer={onToggleLogicViewer}
          onToggleViewportQuality={onToggleViewportQuality}
          onUndo={onUndo}
          viewportQuality={viewportQuality}
        />
      </header>

      <main className="relative min-h-0 flex-1 flex">
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            <ViewportLayout renderViewportPane={renderViewportPane} viewMode={viewMode} />
          </div>

        <ToolPalette
          activeBrushShape={activeBrushShape}
          aiModelPlacementActive={aiModelPlacementActive || aiModelPlacementArmed}
          activeToolId={activeToolId}
          currentSnapSize={activeViewport.grid.snapSize}
          gridSnapValues={gridSnapValues}
          meshEditMode={meshEditMode}
          onInvertSelectionNormals={onInvertSelectionNormals}
          onLowerTop={() => onExtrudeSelection("y", -1)}
          onPausePhysics={onPausePhysics}
          onMeshEditToolbarAction={onMeshEditToolbarAction}
          onImportGlb={onImportGlb}
          onPlaceEntity={onPlaceEntity}
          onPlaceLight={onPlaceLight}
          onPlaceBlockoutOpenRoom={onPlaceBlockoutOpenRoom}
          onPlaceBlockoutPlatform={onPlaceBlockoutPlatform}
          onPlaceBlockoutRoom={onPlaceBlockoutRoom}
          onPlaceBlockoutStairs={onPlaceBlockoutStairs}
          onPlaceProp={onPlaceProp}
          onPlayPhysics={onPlayPhysics}
          onRaiseTop={() => onExtrudeSelection("y", 1)}
          onSetSculptBrushRadius={onSetSculptBrushRadius}
          onSetSculptBrushStrength={onSetSculptBrushStrength}
          onStartAiModelPlacement={onStartAiModelPlacement}
          onSelectBrushShape={(shape) => {
            onSetActiveBrushShape(shape);
            onSetToolId("brush");
          }}
          onSetMeshEditMode={onSetMeshEditMode}
          onSetSnapEnabled={onSetSnapEnabled}
          onSetSnapSize={onSetSnapSize}
          onStopPhysics={onStopPhysics}
          onSetTransformMode={onSetTransformMode}
          onSetToolId={onSetToolId}
          onSetViewMode={onSetViewMode}
          physicsPlayback={physicsPlayback}
          sculptMode={sculptMode}
          sculptBrushRadius={sculptBrushRadius}
          sculptBrushStrength={sculptBrushStrength}
          selectedGeometry={selectedIsGeometry}
          selectedMesh={selectedIsMesh}
          snapEnabled={activeViewport.grid.enabled}
          tools={tools}
          transformMode={transformMode}
          viewMode={viewMode}
        />

        <AiModelPromptBar
          active={aiModelPlacementActive}
          armed={aiModelPlacementArmed}
          busy={aiModelPromptBusy}
          error={aiModelPromptError}
          onCancel={onCancelAiModelPlacement}
          onChangePrompt={onUpdateAiModelPrompt}
          onSubmit={onGenerateAiModel}
          prompt={aiModelPrompt}
        />

        {/* <SpatialAnalysisPanel analysis={analysis} /> */}

        <InspectorSidebar
          activeRightPanel={activeRightPanel}
          activeToolId={activeToolId}
          assets={assets}
          effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
          effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
          entities={entities}
          hiddenSceneItemIds={hiddenSceneItemIds}
          lockedSceneItemIds={lockedSceneItemIds}
          materials={materials}
          meshEditMode={meshEditMode}
          nodes={nodes}
          onApplyMaterial={onApplyMaterial}
          onChangeRightPanel={onSetRightPanel}
          onClipSelection={onClipSelection}
          onDeleteMaterial={onDeleteMaterial}
          onDeleteTexture={onDeleteTexture}
          onExtrudeSelection={onExtrudeSelection}
          onFocusNode={onFocusNode}
          onMeshEditToolbarAction={onMeshEditToolbarAction}
          onMirrorSelection={onMirrorSelection}
          onPlaceAsset={onPlaceAsset}
          onSelectAsset={onSelectAsset}
          onSelectMaterial={onSelectMaterial}
          onSelectScenePath={onSelectScenePath}
          onSelectNodes={onSelectNodes}
          onSetToolId={onSetToolId}
          onToggleSceneItemLock={onToggleSceneItemLock}
          onToggleSceneItemVisibility={onToggleSceneItemVisibility}
          onSetUvOffset={onSetUvOffset}
          onSetUvScale={onSetUvScale}
          onUpdateMeshData={onUpdateMeshData}
          onTranslateSelection={onTranslateSelection}
          onUpsertMaterial={onUpsertMaterial}
          onUpsertTexture={onUpsertTexture}
          onUpdateEntityProperties={onUpdateEntityProperties}
          onUpdateEntityHooks={onUpdateEntityHooks}
          onUpdateEntityTransform={onUpdateEntityTransform}
          onUpdateNodeData={onUpdateNodeData}
          onUpdateNodeHooks={onUpdateNodeHooks}
          onUpdateSceneSettings={onUpdateSceneSettings}
          onUpdateNodeTransform={onUpdateNodeTransform}
          sceneSettings={sceneSettings}
          selectedScenePathId={selectedScenePathId}
          selectionEnabled={selectionEnabled}
          selectedEntity={selectedEntity}
          selectedAssetId={selectedAssetId}
          selectedFaceIds={selectedFaceIds}
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
          selectedNode={selectedNode}
          viewModeLabel={getViewModePreset(viewMode).shortLabel}
          viewport={activeViewport}
        />

        {logicViewerOpen && (
          <LogicViewerSheet
            entities={entities}
            nodes={nodes}
            onClose={onToggleLogicViewer}
            onNodeClick={(objectId) => {
              onSelectNodes([objectId]);
              if (editor.scene.getNode(objectId)) {
                onFocusNode(objectId);
              }
            }}
            onUpdateEntityHooks={onUpdateEntityHooks}
            onUpdateNodeHooks={onUpdateNodeHooks}
          />
        )}
        </div>

        {copilotPanelOpen && (
          <div className="w-80 shrink-0">
            <CopilotPanel
              isConfigured={copilot.isConfigured}
              onAbort={copilot.abort}
              onClearHistory={copilot.clearHistory}
              onClose={onToggleCopilot}
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
      className="bg-white/8 after:bg-transparent hover:bg-emerald-400/22 data-[dragging]:bg-emerald-400/28"
      withHandle={direction === "vertical"}
    />
  );
}
