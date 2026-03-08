import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSnapshot } from "valtio";
import {
  axisDelta,
  createAssignMaterialCommand,
  createDeleteMaterialCommand,
  createDeleteSelectionCommand,
  createExtrudeBrushNodesCommand,
  createDuplicateNodesCommand,
  createEditorCore,
  createReplaceNodesCommand,
  createSetBrushDataCommand,
  createSetMeshDataCommand,
  createSetNodeTransformCommand,
  createPlaceEntityCommand,
  createMeshInflateCommand,
  createMeshRaiseTopCommand,
  createMirrorNodesCommand,
  createPlaceBrushNodeCommand,
  createPlaceModelNodeCommand,
  createSeedSceneDocument,
  createSetUvScaleCommand,
  createSplitBrushNodeAtCoordinateCommand,
  createSplitBrushNodesCommand,
  createTranslateNodesCommand,
  createUpsertMaterialCommand,
  type TransformAxis
} from "@web-hammer/editor-core";
import { convertBrushToEditableMesh, invertEditableMeshNormals } from "@web-hammer/geometry-kernel";
import { deriveRenderScene, gridSnapValues, type ViewportState } from "@web-hammer/render-pipeline";
import {
  type GeometryNode,
  isBrushNode,
  isMeshNode,
  makeTransform,
  type Material,
  type MeshNode,
  snapVec3,
  vec2,
  vec3,
  type Brush,
  type EditableMesh,
  type Vec2,
  type Vec3
} from "@web-hammer/shared";
import { createToolSession, defaultToolId, defaultTools, type ToolId } from "@web-hammer/tool-system";
import {
  createWorkerTaskManager,
  type WorkerJob
} from "@web-hammer/workers";
import { EditorShell } from "@/components/EditorShell";
import { uiStore } from "@/state/ui-store";
import type { Transform } from "@web-hammer/shared";
import type { MeshEditMode } from "@/viewport/editing";
import { useAppHotkeys } from "@/app/hooks/useAppHotkeys";
import { useEditorSubscriptions } from "@/app/hooks/useEditorSubscriptions";
import { useExportWorker } from "@/app/hooks/useExportWorker";
import { clampSnapSize, resolveViewportSnapSize } from "@/viewport/utils/snap";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import {
  focusViewportOnPoint,
  resolveVisibleViewportPaneIds,
  viewportPaneIds,
  type ViewModeId,
  type ViewportPaneId
} from "@/viewport/viewports";

export function App() {
  const [editor] = useState(() => createEditorCore(createSeedSceneDocument()));
  const [activeToolId, setActiveToolId] = useState<ToolId>(defaultToolId);
  const [meshEditMode, setMeshEditMode] = useState<MeshEditMode>("vertex");
  const [meshEditToolbarAction, setMeshEditToolbarAction] = useState<MeshEditToolbarActionRequest>();
  const [selectedMaterialFaceIds, setSelectedMaterialFaceIds] = useState<string[]>([]);
  const [transformMode, setTransformMode] = useState<"rotate" | "scale" | "translate">("translate");
  const [workerManager] = useState(() => createWorkerTaskManager());
  const [workerJobs, setWorkerJobs] = useState<WorkerJob[]>([]);
  const [, setRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ui = useSnapshot(uiStore);
  const toolSession = useMemo(() => createToolSession(activeToolId), [activeToolId]);
  const { downloadTextFile, exportJobs, runWorkerRequest } = useExportWorker();
  const renderScene = deriveRenderScene(
    editor.scene.nodes.values(),
    editor.scene.entities.values(),
    editor.scene.materials.values(),
    editor.scene.assets.values()
  );

  useEditorSubscriptions(editor, setRevision);

  useEffect(() => workerManager.subscribe(setWorkerJobs), [workerManager]);

  const handleSelectNodes = (nodeIds: string[]) => {
    editor.select(nodeIds, "object");
  };

  const handleSetToolId = (toolId: ToolId) => {
    setActiveToolId(toolId);
  };

  const handleSetRightPanel = (panel: "inspector" | "materials" | "scene") => {
    uiStore.rightPanel = panel;
  };

  const handleActivateViewport = (viewportId: ViewportPaneId) => {
    uiStore.activeViewportId = viewportId;
  };

  const resolveViewportFocusPoint = () => {
    const selectedNodeId = editor.selection.ids[0];
    const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;

    return selectedNode
      ? vec3(
          selectedNode.transform.position.x,
          selectedNode.transform.position.y,
          selectedNode.transform.position.z
        )
      : vec3(0, 0, 0);
  };

  const handleSetViewMode = (viewMode: ViewModeId) => {
    uiStore.viewMode = viewMode;

    const visiblePaneIds = resolveVisibleViewportPaneIds(viewMode);

    if (!visiblePaneIds.includes(uiStore.activeViewportId)) {
      uiStore.activeViewportId = "perspective";
    }

    if (viewMode === "3d-only") {
      return;
    }

    const focusPoint = resolveViewportFocusPoint();

    (["top", "front", "side"] as const).forEach((viewportId) => {
      focusViewportOnPoint(uiStore.viewports[viewportId], focusPoint);
    });
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

  const handleClearSelection = () => {
    editor.clearSelection();
  };

  const handleFocusNode = (nodeId: string) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    viewportPaneIds.forEach((viewportId) => {
      focusViewportOnPoint(uiStore.viewports[viewportId], node.transform.position);
    });
  };

  const handleSetSnapSize = (snapSize: number) => {
    const nextSnapSize = clampSnapSize(snapSize);

    viewportPaneIds.forEach((viewportId) => {
      uiStore.viewports[viewportId].grid.snapSize = nextSnapSize;
    });
  };

  const handleSetSnapEnabled = (enabled: boolean) => {
    viewportPaneIds.forEach((viewportId) => {
      uiStore.viewports[viewportId].grid.enabled = enabled;
    });
  };

  const handleMeshEditToolbarAction = (kind: MeshEditToolbarActionRequest["kind"]) => {
    setMeshEditToolbarAction((current) => ({
      id: (current?.id ?? 0) + 1,
      kind
    }));
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
    enqueueWorkerJob("Transform update", { task: node.kind === "mesh" ? "triangulation" : "brush-rebuild", worker: "geometryWorker" }, 550);
  };

  const handlePreviewBrushData = (nodeId: string, brush: Brush) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isBrushNode(node)) {
      return;
    }

    node.data = structuredClone(brush);
    editor.scene.touch();
    setRevision((revision) => revision + 1);
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

    node.data = structuredClone(mesh);
    editor.scene.touch();
    setRevision((revision) => revision + 1);
  };

  const handleUpdateMeshData = (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node || !isMeshNode(node)) {
      return;
    }

    editor.execute(createSetMeshDataCommand(editor.scene, nodeId, mesh, beforeMesh));
    enqueueWorkerJob("Mesh edit", { task: "triangulation", worker: "meshWorker" }, 800);
  };

  const handlePreviewNodeTransform = (nodeId: string, transform: Transform) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    node.transform = structuredClone(transform);
    editor.scene.touch();
    setRevision((revision) => revision + 1);
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

  const handleMeshInflate = (factor: number) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    editor.execute(createMeshInflateCommand(editor.scene, editor.selection.ids, factor));
    enqueueWorkerJob("Mesh edit", { task: "bevel", worker: "meshWorker" }, 850);
  };

  const handlePlaceAsset = (position: Vec3) => {
    const snapped = snapVec3(position, resolveViewportSnapSize(resolveActiveViewportState()));
    const asset = editor.scene.assets.get(uiStore.selectedAssetId);

    if (!asset || asset.type !== "model") {
      return;
    }

    const label = asset.id.endsWith("barrel") ? "Barrel Prop" : "Crate Prop";
    const { command, nodeId } = createPlaceModelNodeCommand(editor.scene, vec3(snapped.x, 1.1, snapped.z), {
      data: {
        assetId: asset.id,
        path: asset.path
      },
      name: label
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Asset placement", { task: "triangulation", worker: "geometryWorker" }, 650);
  };

  const handleCreateBrush = () => {
    const activeViewportState = resolveActiveViewportState();
    const snappedTarget = snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
    const { command, nodeId } = createPlaceBrushNodeCommand(
      editor.scene,
      makeTransform(vec3(snappedTarget.x, 1.5, snappedTarget.z))
    );

    editor.execute(command);
    editor.select([nodeId], "object");
    enqueueWorkerJob("Brush placement", { task: "brush-rebuild", worker: "geometryWorker" }, 650);
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

  const handleCommitMeshTopology = (nodeId: string, mesh: EditableMesh) => {
    const node = editor.scene.getNode(nodeId);

    if (!node) {
      return;
    }

    if (isMeshNode(node)) {
      editor.execute(createSetMeshDataCommand(editor.scene, nodeId, mesh, node.data));
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

  const handleUpsertMaterial = (material: Material) => {
    editor.execute(createUpsertMaterialCommand(editor.scene, material));
    uiStore.selectedMaterialId = material.id;
    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
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

  const handleSelectMaterial = (materialId: string) => {
    uiStore.selectedMaterialId = materialId;
  };

  const handlePlaceEntity = (type: "spawn" | "light") => {
    const activeViewportState = resolveActiveViewportState();
    const position = vec3(
      activeViewportState.camera.target.x,
      type === "light" ? 3 : 1,
      activeViewportState.camera.target.z
    );
    const entityId = `entity:${type}:${editor.scene.entities.size + 1}`;
    editor.execute(
      createPlaceEntityCommand({
        id: entityId,
        properties:
          type === "light"
            ? { color: "#ffd089", enabled: true, intensity: 500 }
            : { enabled: true, team: "player" },
        transform: makeTransform(position),
        type
      })
    );
    enqueueWorkerJob("Entity authoring", { task: "navmesh", worker: "navWorker" }, 800);
  };

  const handleSaveWhmap = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "whmap-save",
        snapshot: editor.exportSnapshot()
      },
      "Save .whmap"
    );

    if (typeof payload === "string") {
      downloadTextFile("scene.whmap", payload, "application/json");
    }
  };

  const handleLoadWhmap = () => {
    fileInputRef.current?.click();
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

    if (typeof payload !== "string") {
      editor.importSnapshot(payload, "scene:load-whmap");
    }

    event.target.value = "";
  };

  const handleExportGltf = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "gltf-export",
        snapshot: editor.exportSnapshot()
      },
      "Export glTF"
    );

    if (typeof payload === "string") {
      downloadTextFile("scene.gltf", payload, "model/gltf+json");
    }
  };

  const handleExportEngine = async () => {
    const payload = await runWorkerRequest(
      {
        kind: "engine-export",
        snapshot: editor.exportSnapshot()
      },
      "Export engine scene"
    );

    if (typeof payload === "string") {
      downloadTextFile("scene.engine.json", payload, "application/json");
    }
  };

  const handleUndo = () => {
    editor.undo();
  };

  const handleRedo = () => {
    editor.redo();
  };

  useAppHotkeys({
    activeToolId,
    editor,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleInvertSelectionNormals,
    handleRedo,
    handleTranslateSelection,
    handleUndo,
    setActiveToolId: handleSetToolId,
    setMeshEditMode,
    setTransformMode
  });

  return (
    <>
      <EditorShell
        activeRightPanel={ui.rightPanel}
        activeToolId={toolSession.toolId}
        activeViewportId={ui.activeViewportId}
        canRedo={editor.commands.canRedo()}
        canUndo={editor.commands.canUndo()}
        editor={editor}
        gridSnapValues={gridSnapValues}
        jobs={[...workerJobs, ...exportJobs]}
        meshEditToolbarAction={meshEditToolbarAction}
        onActivateViewport={handleActivateViewport}
        onInvertSelectionNormals={handleInvertSelectionNormals}
        onApplyMaterial={handleApplyMaterial}
        onClipSelection={handleClipSelection}
        onCreateBrush={handleCreateBrush}
        onDeleteSelection={handleDeleteSelection}
        onDuplicateSelection={handleDuplicateSelection}
        onClearSelection={handleClearSelection}
        onCommitMeshTopology={handleCommitMeshTopology}
        onDeleteMaterial={handleDeleteMaterial}
        onExportEngine={handleExportEngine}
        onExportGltf={handleExportGltf}
        onExtrudeSelection={handleExtrudeSelection}
        onFocusNode={handleFocusNode}
        onLoadWhmap={handleLoadWhmap}
        onMeshEditToolbarAction={handleMeshEditToolbarAction}
        onMeshInflate={handleMeshInflate}
        onMirrorSelection={handleMirrorSelection}
        onPlaceAsset={handlePlaceAsset}
        onPlaceBrush={handlePlaceBrush}
        onPlaceEntity={handlePlaceEntity}
        onPreviewBrushData={handlePreviewBrushData}
        onPreviewMeshData={handlePreviewMeshData}
        onPreviewNodeTransform={handlePreviewNodeTransform}
        onRedo={handleRedo}
        onSaveWhmap={handleSaveWhmap}
        onSelectAsset={handleSelectAsset}
        onSelectMaterialFaces={setSelectedMaterialFaceIds}
        onSelectMaterial={handleSelectMaterial}
        onSetUvScale={handleSetMaterialUvScale}
        onSelectNodes={handleSelectNodes}
        onSetMeshEditMode={setMeshEditMode}
        onSetRightPanel={handleSetRightPanel}
        onSetSnapEnabled={handleSetSnapEnabled}
        onSetSnapSize={handleSetSnapSize}
        onSetTransformMode={setTransformMode}
        onSetToolId={handleSetToolId}
        onToggleViewportQuality={handleToggleViewportQuality}
        onSetViewMode={handleSetViewMode}
        onSplitBrushAtCoordinate={handleSplitBrushAtCoordinate}
        onTranslateSelection={handleTranslateSelection}
        onUndo={handleUndo}
        onUpdateViewport={handleUpdateViewport}
        onUpsertMaterial={handleUpsertMaterial}
        onUpdateBrushData={handleUpdateBrushData}
        onUpdateMeshData={handleUpdateMeshData}
        onUpdateNodeTransform={handleUpdateNodeTransform}
        meshEditMode={meshEditMode}
        renderScene={renderScene}
        selectedAssetId={ui.selectedAssetId}
        selectedFaceIds={selectedMaterialFaceIds}
        selectedMaterialId={ui.selectedMaterialId}
        transformMode={transformMode}
        tools={defaultTools}
        viewMode={ui.viewMode}
        viewportQuality={ui.viewportQuality}
        viewports={ui.viewports}
      />
      <input
        accept=".whmap,.json"
        hidden
        onChange={handleWhmapFileChange}
        ref={fileInputRef}
        type="file"
      />
    </>
  );
}
