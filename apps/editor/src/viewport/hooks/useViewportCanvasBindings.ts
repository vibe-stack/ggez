import { useCallback, useMemo } from "react";
import { useSnapshot } from "valtio";
import { useEditorActionDomains } from "@/app/editor-action-domains";
import { sceneSessionStore } from "@/state/scene-session-store";
import { toolSessionStore } from "@/state/tool-session-store";
import { uiStore } from "@/state/ui-store";
import type { ViewportCanvasBindings } from "@/viewport/types";
import type { ViewportPaneId } from "@/viewport/viewports";

export function useViewportCanvasBindings(viewportId: ViewportPaneId): ViewportCanvasBindings {
  const { placementActions, sceneActions, selectionActions } = useEditorActionDomains();
  const ui = useSnapshot(uiStore);
  const toolSession = useSnapshot(toolSessionStore);
  const sceneSession = useSnapshot(sceneSessionStore);
  const isActiveViewport = ui.activeViewportId === viewportId;

  const handleActivateViewport = useCallback((nextViewportId: ViewportPaneId) => {
    uiStore.activeViewportId = nextViewportId;
  }, []);

  const handleViewportChange = useCallback<ViewportCanvasBindings["onViewportChange"]>((nextViewportId, viewport) => {
    uiStore.viewports[nextViewportId].projection = viewport.projection;
    uiStore.viewports[nextViewportId].camera = viewport.camera;
  }, []);

  const handleMaterialPaintModeChange = useCallback<ViewportCanvasBindings["onMaterialPaintModeChange"]>((mode) => {
    if (uiStore.activeViewportId !== viewportId) {
      return;
    }

    toolSessionStore.materialPaintMode = mode;
  }, [viewportId]);

  const handleSculptModeChange = useCallback<ViewportCanvasBindings["onSculptModeChange"]>((mode) => {
    if (uiStore.activeViewportId !== viewportId) {
      return;
    }

    toolSessionStore.sculptMode = mode;
  }, [viewportId]);

  const handleSelectMaterialFaces = useCallback<ViewportCanvasBindings["onSelectMaterialFaces"]>((faceIds) => {
    sceneSessionStore.selectedMaterialFaceIds = faceIds;
  }, []);

  const handleSelectScenePath = useCallback<ViewportCanvasBindings["onSelectScenePath"]>((pathId) => {
    sceneSessionStore.selectedScenePathId = pathId;
  }, []);

  const handleSetToolId = useCallback<ViewportCanvasBindings["onSetToolId"]>((toolId) => {
    toolSessionStore.activeToolId = toolId;
  }, []);

  const handlePlaceInstanceBrushNodes = useCallback<ViewportCanvasBindings["onPlaceInstanceBrushNodes"]>((placements) => {
    if (placements.length === 0) {
      return;
    }

    const grouped = new Map<string, ViewportCanvasBindings["onPlaceInstancingNodes"] extends (sourceNodeId: string, transforms: infer T) => void ? T : never>();

    for (const { sourceNodeId, transform } of placements) {
      const existing = grouped.get(sourceNodeId);

      if (existing) {
        existing.push(transform);
      } else {
        grouped.set(sourceNodeId, [transform]);
      }
    }

    grouped.forEach((transforms, sourceNodeId) => {
      placementActions.placeInstancingNodes(sourceNodeId, transforms);
    });
  }, [placementActions]);

  return useMemo(
    () => ({
      activeBrushShape: toolSession.activeBrushShape,
      brushToolMode: toolSession.brushToolMode,
      aiModelPlacementArmed: toolSession.aiModelPlacementArmed,
      activeToolId: toolSession.activeToolId,
      dprScale: ui.viewportQuality,
      instanceBrushAlignToNormal: toolSession.instanceBrushAlignToNormal,
      instanceBrushAverageNormal: toolSession.instanceBrushAverageNormal,
      instanceBrushDensity: toolSession.instanceBrushDensity,
      instanceBrushRandomness: toolSession.instanceBrushRandomness,
      instanceBrushSize: toolSession.instanceBrushSize,
      instanceBrushSourceNodeId: toolSession.instanceBrushSourceNodeId,
      instanceBrushSourceNodeIds: [...toolSession.instanceBrushSourceNodeIds],
      instanceBrushYOffsetMin: toolSession.instanceBrushYOffsetMin,
      instanceBrushYOffsetMax: toolSession.instanceBrushYOffsetMax,
      instanceBrushScaleMin: toolSession.instanceBrushScaleMin,
      instanceBrushScaleMax: toolSession.instanceBrushScaleMax,
      isActiveViewport,
      materialPaintBrushOpacity: toolSession.materialPaintBrushOpacity,
      meshEditMode: toolSession.meshEditMode,
      meshEditToolbarAction: toolSession.meshEditToolbarAction,
      sculptBrushRadius: toolSession.sculptBrushRadius,
      sculptBrushStrength: toolSession.sculptBrushStrength,
      onMaterialPaintModeChange: handleMaterialPaintModeChange,
      onActivateViewport: handleActivateViewport,
      onClearSelection: selectionActions.clearSelection,
      onCommitMeshMaterialLayers: sceneActions.commitMeshMaterialLayers,
      onCommitMeshTopology: sceneActions.commitMeshTopology,
      onFocusNode: selectionActions.focusNode,
      onPlaceAsset: placementActions.placeAsset,
      onPlaceAiModelPlaceholder: placementActions.placeAiModelPlaceholder,
      onPlaceBrush: placementActions.placeBrush,
      onPlaceInstancingNodes: placementActions.placeInstancingNodes,
      onPlaceInstanceBrushNodes: handlePlaceInstanceBrushNodes,
      onPlaceMeshNode: placementActions.placeMeshNode,
      onPlacePrimitiveNode: placementActions.placePrimitiveNode,
      onPreviewBrushData: sceneActions.previewBrushData,
      onPreviewEntityTransform: sceneActions.previewEntityTransform,
      onPreviewMeshData: sceneActions.previewMeshData,
      onPreviewNodeTransform: sceneActions.previewNodeTransform,
      onSculptModeChange: handleSculptModeChange,
      onSelectScenePath: handleSelectScenePath,
      onSelectMaterialFaces: handleSelectMaterialFaces,
      onSelectNodes: selectionActions.selectNodes,
      onSetToolId: handleSetToolId,
      onSplitBrushAtCoordinate: sceneActions.splitBrushAtCoordinate,
      onUpdateBrushData: sceneActions.updateBrushData,
      onUpdateEntityTransform: sceneActions.updateEntityTransform,
      onUpdateMeshData: sceneActions.updateMeshData,
      onUpdateNodeTransform: sceneActions.updateNodeTransform,
      onUpdateSceneSettings: sceneActions.updateSceneSettings,
      onViewportChange: handleViewportChange,
      physicsPlayback: toolSession.physicsPlayback,
      physicsRevision: toolSession.physicsRevision,
      renderMode: ui.renderMode,
      selectedMaterialId: ui.selectedMaterialId,
      selectedScenePathId: sceneSession.selectedScenePathId,
      transformMode: toolSession.transformMode,
      viewport: ui.viewports[viewportId]
    }),
    [
      handleActivateViewport,
      handleMaterialPaintModeChange,
      handlePlaceInstanceBrushNodes,
      handleSculptModeChange,
      handleSelectMaterialFaces,
      handleSelectScenePath,
      handleSetToolId,
      handleViewportChange,
      isActiveViewport,
      placementActions,
      sceneActions,
      sceneSession.selectedScenePathId,
      selectionActions,
      toolSession,
      ui.renderMode,
      ui.selectedMaterialId,
      ui.viewportQuality,
      ui.viewports,
      viewportId
    ]
  );
}
