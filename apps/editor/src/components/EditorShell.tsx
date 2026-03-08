import type { EditorCore, TransformAxis } from "@web-hammer/editor-core";
import type { GridSnapValue, DerivedRenderScene, ViewportState } from "@web-hammer/render-pipeline";
import type {
  Brush,
  EditableMesh,
  EntityType,
  LightNodeData,
  LightType,
  Material,
  PrimitiveNodeData,
  PrimitiveShape,
  SceneSettings,
  Transform,
  Vec2
} from "@web-hammer/shared";
import type { ToolId } from "@web-hammer/tool-system";
import type { WorkerJob } from "@web-hammer/workers";
import type { ReactNode } from "react";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { StatusBar } from "@/components/editor-shell/StatusBar";
import { ToolPalette } from "@/components/editor-shell/ToolPalette";
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
  activeBrushShape: PrimitiveShape;
  activeRightPanel: RightPanelId;
  activeToolId: ToolId;
  activeViewportId: ViewportPaneId;
  canRedo: boolean;
  canUndo: boolean;
  editor: EditorCore;
  gridSnapValues: readonly GridSnapValue[];
  jobs: WorkerJob[];
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  onActivateViewport: (viewportId: ViewportPaneId) => void;
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onClipSelection: (axis: TransformAxis) => void;
  onCommitMeshTopology: (nodeId: string, mesh: EditableMesh) => void;
  onCreateBrush: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onClearSelection: () => void;
  onExportEngine: () => void;
  onExportGltf: () => void;
  onExtrudeSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onFocusNode: (nodeId: string) => void;
  onDeleteMaterial: (materialId: string) => void;
  onLoadWhmap: () => void;
  onInvertSelectionNormals: () => void;
  onPausePhysics: () => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceLight: (type: LightType) => void;
  onMeshInflate: (factor: number) => void;
  onMirrorSelection: (axis: TransformAxis) => void;
  onPlaceAsset: (position: { x: number; y: number; z: number }) => void;
  onPlaceBrush: (brush: Brush, transform: Transform) => void;
  onPlacePrimitiveNode: (data: PrimitiveNodeData, transform: Transform, name: string) => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onPlayPhysics: () => void;
  onPreviewBrushData: (nodeId: string, brush: Brush) => void;
  onPreviewMeshData: (nodeId: string, mesh: EditableMesh) => void;
  onRedo: () => void;
  onSaveWhmap: () => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterialFaces: (faceIds: string[]) => void;
  onSelectMaterial: (materialId: string) => void;
  onSetUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetActiveBrushShape: (shape: PrimitiveShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetRightPanel: (panel: RightPanelId) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetToolId: (toolId: ToolId) => void;
  onToggleViewportQuality: () => void;
  onSetViewMode: (viewMode: ViewModeId) => void;
  onSplitBrushAtCoordinate: (nodeId: string, axis: TransformAxis, coordinate: number) => void;
  onPreviewNodeTransform: (nodeId: string, transform: Transform) => void;
  onTranslateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onUndo: () => void;
  onUpdateEntityProperties: (entityId: string, properties: Record<string, string | number | boolean>) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  onUpdateViewport: (viewportId: ViewportPaneId, viewport: ViewportState) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpdateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  selectedAssetId: string;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  transformMode: "rotate" | "scale" | "translate";
  tools: Array<{ id: ToolId; label: string }>;
  viewMode: ViewModeId;
  viewportQuality: ViewportQuality;
  viewports: Record<ViewportPaneId, ViewportState>;
};

export function EditorShell({
  activeBrushShape,
  activeRightPanel,
  activeToolId,
  activeViewportId,
  canRedo,
  canUndo,
  editor,
  gridSnapValues,
  jobs,
  meshEditMode,
  meshEditToolbarAction,
  onActivateViewport,
  onApplyMaterial,
  onClipSelection,
  onCommitMeshTopology,
  onCreateBrush,
  onDeleteSelection,
  onDuplicateSelection,
  onClearSelection,
  onExportEngine,
  onExportGltf,
  onExtrudeSelection,
  onFocusNode,
  onDeleteMaterial,
  onLoadWhmap,
  onInvertSelectionNormals,
  onPausePhysics,
  onMeshEditToolbarAction,
  onPlaceEntity,
  onPlaceLight,
  onMeshInflate,
  onMirrorSelection,
  onPlaceAsset,
  onPlaceBrush,
  onPlacePrimitiveNode,
  onPlaceProp,
  onPlayPhysics,
  onPreviewBrushData,
  onPreviewMeshData,
  onRedo,
  onSaveWhmap,
  onSelectAsset,
  onSelectMaterialFaces,
  onSelectMaterial,
  onSetUvOffset,
  onSetUvScale,
  onSelectNodes,
  onSetActiveBrushShape,
  onSetMeshEditMode,
  onSetRightPanel,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onSetTransformMode,
  onSetToolId,
  onToggleViewportQuality,
  onSetViewMode,
  onSplitBrushAtCoordinate,
  onPreviewNodeTransform,
  onTranslateSelection,
  onUndo,
  onUpdateEntityProperties,
  onUpdateEntityTransform,
  onUpdateNodeData,
  onUpdateSceneSettings,
  onUpdateViewport,
  onUpsertMaterial,
  onUpdateBrushData,
  onUpdateMeshData,
  onUpdateNodeTransform,
  physicsPlayback,
  physicsRevision,
  renderScene,
  sceneSettings,
  selectedAssetId,
  selectedFaceIds,
  selectedMaterialId,
  transformMode,
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
          activeToolId={activeToolId}
          dprScale={resolveViewportDprScale(viewportQuality)}
          isActiveViewport={activeViewportId === viewportId}
          meshEditMode={meshEditMode}
          meshEditToolbarAction={meshEditToolbarAction}
          onActivateViewport={onActivateViewport}
          onClearSelection={onClearSelection}
          onCommitMeshTopology={onCommitMeshTopology}
          onFocusNode={onFocusNode}
          onPlaceAsset={onPlaceAsset}
          onPlaceBrush={onPlaceBrush}
          onPlacePrimitiveNode={onPlacePrimitiveNode}
          onPreviewBrushData={onPreviewBrushData}
          onPreviewMeshData={onPreviewMeshData}
          onPreviewNodeTransform={onPreviewNodeTransform}
          onSelectMaterialFaces={onSelectMaterialFaces}
          onSelectNodes={onSelectNodes}
          onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
          onUpdateBrushData={onUpdateBrushData}
          onUpdateMeshData={onUpdateMeshData}
          onUpdateNodeTransform={onUpdateNodeTransform}
          onViewportChange={onUpdateViewport}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          renderMode={definition.renderMode}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
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
          onClearSelection={onClearSelection}
          onCreateBrush={onCreateBrush}
          onDeleteSelection={onDeleteSelection}
          onDuplicateSelection={onDuplicateSelection}
          onExportEngine={onExportEngine}
          onExportGltf={onExportGltf}
          onFocusSelection={() => {
            if (selectedObjectId) {
              onFocusNode(selectedObjectId);
            }
          }}
          onLoadWhmap={onLoadWhmap}
          onRedo={onRedo}
          onSaveWhmap={onSaveWhmap}
          onToggleViewportQuality={onToggleViewportQuality}
          onUndo={onUndo}
          viewportQuality={viewportQuality}
        />
      </header>

      <main className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <ViewportLayout renderViewportPane={renderViewportPane} viewMode={viewMode} />
        </div>

        <ToolPalette
          activeBrushShape={activeBrushShape}
          activeToolId={activeToolId}
          currentSnapSize={activeViewport.grid.snapSize}
          gridSnapValues={gridSnapValues}
          meshEditMode={meshEditMode}
          onInvertSelectionNormals={onInvertSelectionNormals}
          onLowerTop={() => onExtrudeSelection("y", -1)}
          onPausePhysics={onPausePhysics}
          onMeshEditToolbarAction={onMeshEditToolbarAction}
          onMeshInflate={onMeshInflate}
          onPlaceEntity={onPlaceEntity}
          onPlaceLight={onPlaceLight}
          onPlaceProp={onPlaceProp}
          onPlayPhysics={onPlayPhysics}
          onRaiseTop={() => onExtrudeSelection("y", 1)}
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
          selectedGeometry={selectedIsGeometry}
          selectedMesh={selectedIsMesh}
          snapEnabled={activeViewport.grid.enabled}
          tools={tools}
          transformMode={transformMode}
          viewMode={viewMode}
        />

        <InspectorSidebar
          activeRightPanel={activeRightPanel}
          activeToolId={activeToolId}
          assets={assets}
          entities={entities}
          materials={materials}
          meshEditMode={meshEditMode}
          nodes={nodes}
          onApplyMaterial={onApplyMaterial}
          onChangeRightPanel={onSetRightPanel}
          onClipSelection={onClipSelection}
          onDeleteMaterial={onDeleteMaterial}
          onExtrudeSelection={onExtrudeSelection}
          onFocusNode={onFocusNode}
          onMeshInflate={onMeshInflate}
          onMirrorSelection={onMirrorSelection}
          onPlaceAsset={onPlaceAsset}
          onSelectAsset={onSelectAsset}
          onSelectMaterial={onSelectMaterial}
          onSelectNodes={onSelectNodes}
          onSetUvOffset={onSetUvOffset}
          onSetUvScale={onSetUvScale}
          onTranslateSelection={onTranslateSelection}
          onUpsertMaterial={onUpsertMaterial}
          onUpdateEntityProperties={onUpdateEntityProperties}
          onUpdateEntityTransform={onUpdateEntityTransform}
          onUpdateNodeData={onUpdateNodeData}
          onUpdateSceneSettings={onUpdateSceneSettings}
          onUpdateNodeTransform={onUpdateNodeTransform}
          sceneSettings={sceneSettings}
          selectionEnabled={selectionEnabled}
          selectedEntity={selectedEntity}
          selectedAssetId={selectedAssetId}
          selectedFaceIds={selectedFaceIds}
          selectedMaterialId={selectedMaterialId}
          selectedNode={selectedNode}
          selectedNodeId={selectedObjectId}
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
