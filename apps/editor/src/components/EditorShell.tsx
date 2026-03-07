import type { EditorCore, TransformAxis } from "@web-hammer/editor-core";
import type { GridSnapValue, DerivedRenderScene, ViewportState } from "@web-hammer/render-pipeline";
import type { Brush, EditableMesh, Transform } from "@web-hammer/shared";
import type { ToolId } from "@web-hammer/tool-system";
import type { WorkerJob } from "@web-hammer/workers";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { SceneSidebar } from "@/components/editor-shell/SceneSidebar";
import { StatusBar } from "@/components/editor-shell/StatusBar";
import { ToolPalette } from "@/components/editor-shell/ToolPalette";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";

type EditorShellProps = {
  activeRightPanel: "inspector" | "materials";
  activeToolId: ToolId;
  canRedo: boolean;
  canUndo: boolean;
  editor: EditorCore;
  gridSnapValues: readonly GridSnapValue[];
  jobs: WorkerJob[];
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  onAssignMaterial: (materialId: string) => void;
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
  onLoadWhmap: () => void;
  onInvertSelectionNormals: () => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onPlaceEntity: (type: "spawn" | "light") => void;
  onMeshInflate: (factor: number) => void;
  onMirrorSelection: (axis: TransformAxis) => void;
  onPlaceAsset: (position: { x: number; y: number; z: number }) => void;
  onPlaceBrush: (brush: Brush, transform: Transform) => void;
  onPreviewBrushData: (nodeId: string, brush: Brush) => void;
  onPreviewMeshData: (nodeId: string, mesh: EditableMesh) => void;
  onRedo: () => void;
  onSaveWhmap: () => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetRightPanel: (panel: "inspector" | "materials") => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetToolId: (toolId: ToolId) => void;
  onSplitBrushAtCoordinate: (nodeId: string, axis: TransformAxis, coordinate: number) => void;
  onPreviewNodeTransform: (nodeId: string, transform: Transform) => void;
  onTranslateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  onUndo: () => void;
  onUpdateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  renderScene: DerivedRenderScene;
  selectedAssetId: string;
  selectedMaterialId: string;
  snapEnabled: boolean;
  transformMode: "rotate" | "scale" | "translate";
  tools: Array<{ id: ToolId; label: string }>;
  viewport: ViewportState;
};

export function EditorShell({
  activeRightPanel,
  activeToolId,
  canRedo,
  canUndo,
  editor,
  gridSnapValues,
  jobs,
  meshEditMode,
  meshEditToolbarAction,
  onAssignMaterial,
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
  onLoadWhmap,
  onInvertSelectionNormals,
  onMeshEditToolbarAction,
  onPlaceEntity,
  onMeshInflate,
  onMirrorSelection,
  onPlaceAsset,
  onPlaceBrush,
  onPreviewBrushData,
  onPreviewMeshData,
  onRedo,
  onSaveWhmap,
  onSelectAsset,
  onSelectMaterial,
  onSelectNodes,
  onSetMeshEditMode,
  onSetRightPanel,
  onSetSnapEnabled,
  onSetSnapSize,
  onSetTransformMode,
  onSetToolId,
  onSplitBrushAtCoordinate,
  onPreviewNodeTransform,
  onTranslateSelection,
  onUndo,
  onUpdateBrushData,
  onUpdateMeshData,
  onUpdateNodeTransform,
  renderScene,
  selectedAssetId,
  selectedMaterialId,
  snapEnabled,
  transformMode,
  tools,
  viewport
}: EditorShellProps) {
  const nodes = Array.from(editor.scene.nodes.values());
  const materials = Array.from(editor.scene.materials.values());
  const assets = Array.from(editor.scene.assets.values());
  const selectedNodeId = editor.selection.ids[0];
  const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
  const selectedNodes = editor.selection.ids
    .map((nodeId) => editor.scene.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const activeToolLabel = tools.find((tool) => tool.id === activeToolId)?.label ?? activeToolId;
  const selectedIsGeometry = selectedNode?.kind === "brush" || selectedNode?.kind === "mesh";
  const selectedIsMesh = selectedNode?.kind === "mesh";

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
            if (selectedNodeId) {
              onFocusNode(selectedNodeId);
            }
          }}
          onLoadWhmap={onLoadWhmap}
          onRedo={onRedo}
          onSaveWhmap={onSaveWhmap}
          onUndo={onUndo}
        />
      </header>

      <main className="relative min-h-0 flex-1">
        <ViewportCanvas
          activeToolId={activeToolId}
          meshEditMode={meshEditMode}
          meshEditToolbarAction={meshEditToolbarAction}
          onClearSelection={onClearSelection}
          onCommitMeshTopology={onCommitMeshTopology}
          onFocusNode={onFocusNode}
          onPlaceAsset={onPlaceAsset}
          onPlaceBrush={onPlaceBrush}
          onPreviewBrushData={onPreviewBrushData}
          onPreviewMeshData={onPreviewMeshData}
          onPreviewNodeTransform={onPreviewNodeTransform}
          onSelectNodes={onSelectNodes}
          onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
          onUpdateBrushData={onUpdateBrushData}
          onUpdateMeshData={onUpdateMeshData}
          onUpdateNodeTransform={onUpdateNodeTransform}
          renderScene={renderScene}
          selectedNode={selectedNode}
          selectedNodeIds={editor.selection.ids}
          selectedNodes={selectedNodes}
          transformMode={transformMode}
          viewport={viewport}
        />

        <ToolPalette
          activeToolId={activeToolId}
          currentSnapSize={viewport.grid.snapSize}
          gridSnapValues={gridSnapValues}
          meshEditMode={meshEditMode}
          onInvertSelectionNormals={onInvertSelectionNormals}
          onLowerTop={() => onExtrudeSelection("y", -1)}
          onMeshEditToolbarAction={onMeshEditToolbarAction}
          onMeshInflate={onMeshInflate}
          onRaiseTop={() => onExtrudeSelection("y", 1)}
          onSetMeshEditMode={onSetMeshEditMode}
          onSetSnapEnabled={onSetSnapEnabled}
          onSetSnapSize={onSetSnapSize}
          onSetTransformMode={onSetTransformMode}
          onSetToolId={onSetToolId}
          selectedGeometry={selectedIsGeometry}
          selectedMesh={selectedIsMesh}
          snapEnabled={snapEnabled}
          transformMode={transformMode}
          tools={tools}
        />

        <SceneSidebar
          nodes={nodes}
          onCreateBrush={onCreateBrush}
          onFocusNode={onFocusNode}
          onSelectNodes={onSelectNodes}
          selectedNodeId={selectedNodeId}
        />

        <InspectorSidebar
          activeRightPanel={activeRightPanel}
          activeToolId={activeToolId}
          assets={assets}
          materials={materials}
          onAssignMaterial={onAssignMaterial}
          onChangeRightPanel={onSetRightPanel}
          onClipSelection={onClipSelection}
          onExtrudeSelection={onExtrudeSelection}
          onMeshInflate={onMeshInflate}
          onMirrorSelection={onMirrorSelection}
          onPlaceAsset={onPlaceAsset}
          onPlaceEntity={onPlaceEntity}
          onSelectAsset={onSelectAsset}
          onSelectMaterial={onSelectMaterial}
          onTranslateSelection={onTranslateSelection}
          onUpdateNodeTransform={onUpdateNodeTransform}
          selectedAssetId={selectedAssetId}
          selectedMaterialId={selectedMaterialId}
          selectedNode={selectedNode}
          viewportTarget={viewport.camera.target}
        />

        <StatusBar
          activeToolLabel={activeToolLabel}
          gridSnapValues={gridSnapValues}
          jobs={jobs}
          meshEditMode={meshEditMode}
          selectedNode={selectedNode}
          viewport={viewport}
        />
      </main>
    </div>
  );
}
