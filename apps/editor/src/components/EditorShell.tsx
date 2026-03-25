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
import { useState, useCallback, useEffect, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import type { CopilotSession } from "@/lib/copilot/types";
import { AiModelPromptBar } from "@/components/editor-shell/AiModelPromptBar";
import { CopilotPanel } from "@/components/editor-shell/CopilotPanel";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { FileBrowserPanel } from "@/components/editor-shell/FileBrowserPanel";
import { MonacoEditorPanel, resolveLanguage, type OpenFile } from "@/components/editor-shell/MonacoEditorPanel";
import { WelcomeScreen } from "@/components/editor-shell/WelcomeScreen";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { SpatialAnalysisPanel } from "@/components/editor-shell/SpatialAnalysisPanel";
import { StatusBar } from "@/components/editor-shell/StatusBar";
import { ToolPalette } from "@/components/editor-shell/ToolPalette";
import { LogicViewerSheet } from "@/components/editor-shell/logic-viewer/LogicViewerSheet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import { uiStore, type RightPanelId, type ViewportQuality } from "@/state/ui-store";
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
  gridSnapValues: readonly GridSnapValue[];
  jobs: WorkerJob[];
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
  gridSnapValues,
  jobs,
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
  const ui = useSnapshot(uiStore);
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

  // ── File Browser + Monaco Editor State ──────────────────────────

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const api = (window as any).electronAPI;
  const isElectron = !!api?.isElectron;

  // Listen for Electron project:opened events
  useEffect(() => {
    if (!isElectron) return;
    const unsub = api.onProjectOpened?.((projectPath: string) => {
      uiStore.projectPath = projectPath;
      uiStore.fileBrowserOpen = true;
    });
    return unsub;
  }, [isElectron]);

  // Listen for menu events to toggle file browser
  useEffect(() => {
    if (!isElectron) return;
    const unsubOpen = api.onOpenProject?.(() => api.openProject());
    const unsubCreate = api.onCreateProject?.(() => api.createProject());
    return () => { unsubOpen?.(); unsubCreate?.(); };
  }, [isElectron]);

  const handleFileOpen = useCallback(async (filePath: string) => {
    // Don't open binary files in Monaco
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const binaryExts = ["png", "jpg", "jpeg", "gif", "webp", "glb", "gltf", "hdr", "exr", "mp3", "wav", "ogg", "mp4", "webm", "fbx", "obj", "zip"];
    if (binaryExts.includes(ext)) return;

    // Check if file is already open
    const existing = openFiles.find((f) => f.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }

    if (!isElectron) return;

    try {
      const content = await api.readFile(filePath, "utf8");
      const name = filePath.split(/[\\/]/).pop() ?? "file";
      const newFile: OpenFile = {
        path: filePath,
        name,
        content: typeof content === "string" ? content : "",
        language: resolveLanguage(name),
        isDirty: false,
      };
      setOpenFiles((prev) => [...prev, newFile]);
      setActiveFilePath(filePath);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  }, [openFiles, isElectron]);

  const handleCloseFile = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== path));
    setActiveFilePath((current) => {
      if (current !== path) return current;
      const remaining = openFiles.filter((f) => f.path !== path);
      return remaining.length > 0 ? remaining[remaining.length - 1].path : null;
    });
  }, [openFiles]);

  const handleCloseAllFiles = useCallback(() => {
    setOpenFiles([]);
    setActiveFilePath(null);
  }, []);

  const handleContentChange = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, content, isDirty: true } : f))
    );
  }, []);

  const handleSaveFile = useCallback(async (path: string, content: string) => {
    if (!isElectron) return;
    try {
      await api.writeFile(path, content);
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, isDirty: false } : f))
      );
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [isElectron]);

  const handleToggleFileBrowser = useCallback(() => {
    uiStore.fileBrowserOpen = !uiStore.fileBrowserOpen;
  }, []);

  // ── Project Management Actions ───────────────────────────────────

  const handleOpenProject = useCallback(async () => {
    if (!isElectron) return;
    const projectPath = await api.openProject();
    if (projectPath) {
      uiStore.projectPath = projectPath;
      uiStore.fileBrowserOpen = true;
    }
  }, [isElectron]);

  const handleCreateProject = useCallback(async () => {
    if (!isElectron) return;
    const projectPath = await api.createProject();
    if (projectPath) {
      uiStore.projectPath = projectPath;
      uiStore.fileBrowserOpen = true;
    }
  }, [isElectron]);

  // Keyboard shortcuts for project management
  useEffect(() => {
    if (!isElectron) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          void handleOpenProject();
        } else if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void handleCreateProject();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isElectron, handleOpenProject, handleCreateProject]);

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

  // ── Electron: Show WelcomeScreen when no project is open ────────
  if (isElectron && !ui.projectPath) {
    return (
      <WelcomeScreen
        onOpenProject={handleOpenProject}
        onCreateProject={handleCreateProject}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#08100d_0%,#050807_100%)] text-foreground">
      <header className="shrink-0 bg-black/18 backdrop-blur-xl">
        <EditorMenuBar
          canRedo={canRedo}
          canUndo={canUndo}
          copilotOpen={copilotPanelOpen}
          fileBrowserOpen={ui.fileBrowserOpen}
          gameConnectionControl={gameConnectionControl}
          isElectron={isElectron}
          logicViewerOpen={logicViewerOpen}
          onClearSelection={onClearSelection}
          onCreateBrush={onCreateBrush}
          onCreateProject={handleCreateProject}
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
          onOpenProject={handleOpenProject}
          onRedo={onRedo}
          onSaveWhmap={onSaveWhmap}
          onToggleCopilot={onToggleCopilot}
          onToggleFileBrowser={handleToggleFileBrowser}
          onToggleLogicViewer={onToggleLogicViewer}
          onToggleViewportQuality={onToggleViewportQuality}
          onUndo={onUndo}
          projectName={ui.projectPath?.split(/[\\/]/).pop() ?? null}
          viewportQuality={viewportQuality}
        />
      </header>

      <main className="relative min-h-0 flex-1 flex">
        {/* Left: File Browser Panel */}
        {ui.fileBrowserOpen && (
          <div className="w-56 shrink-0">
            <FileBrowserPanel
              projectPath={ui.projectPath}
              onFileOpen={handleFileOpen}
              onClose={handleToggleFileBrowser}
            />
          </div>
        )}

        {/* Center: Viewport + Overlays + Monaco */}
        <div className="relative min-w-0 flex-1 flex flex-col">
          {/* Viewport + Overlays */}
          <div className={cn("relative flex-1 min-h-0", openFiles.length > 0 && "flex-[3]")}>
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

          {/* Monaco Editor (bottom split) */}
          {openFiles.length > 0 && (
            <div className="flex-[2] min-h-[200px] max-h-[50%]">
              <MonacoEditorPanel
                files={openFiles}
                activeFilePath={activeFilePath}
                onSelectFile={setActiveFilePath}
                onCloseFile={handleCloseFile}
                onSaveFile={handleSaveFile}
                onContentChange={handleContentChange}
                onCloseAll={handleCloseAllFiles}
              />
            </div>
          )}
        </div>

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
          onSetUvOffset={onSetUvOffset}
          onSetUvScale={onSetUvScale}
          onTranslateSelection={onTranslateSelection}
          onUpsertMaterial={onUpsertMaterial}
          onUpsertTexture={onUpsertTexture}
          onUpdateEntityProperties={onUpdateEntityProperties}
          onUpdateEntityHooks={onUpdateEntityHooks}
          onUpdateEntityTransform={onUpdateEntityTransform}
          onUpdateMeshData={onUpdateMeshData}
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
