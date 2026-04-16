import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorCore } from "@ggez/editor-core";
import { gridSnapValues } from "@ggez/render-pipeline";
import { isInstancingSourceNode, type Material } from "@ggez/shared";
import { defaultTools } from "@ggez/tool-system";
import { useSnapshot } from "valtio";
import { useEditorActionDomains } from "@/app/editor-action-domains";
import { ToolPalette } from "@/components/editor-shell/ToolPalette";
import { toolSessionStore, stopPhysicsPlayback } from "@/state/tool-session-store";
import { uiStore } from "@/state/ui-store";
import { clampSnapSize } from "@/viewport/utils/snap";
import type { InstanceBrushSourceOption } from "@/viewport/types";
import {
  focusViewportOnPoint,
  resolveVisibleViewportPaneIds,
  type ViewModeId,
  type ViewportPaneId
} from "@/viewport/viewports";

type ToolPaletteSceneState = {
  instanceBrushSourceOptions: InstanceBrushSourceOption[];
  materials: Material[];
  selectedGeometry: boolean;
  selectedMesh: boolean;
};

export const ToolPaletteContainer = memo(function ToolPaletteContainer({
  editor
}: {
  editor: EditorCore;
}) {
  const {
    aiActions,
    assetActions,
    fileActions,
    physicsActions,
    placementActions,
    sceneActions,
    selectionActions
  } = useEditorActionDomains();
  const toolSession = useSnapshot(toolSessionStore);
  const ui = useSnapshot(uiStore);
  const [sceneState, setSceneState] = useState(() => readToolPaletteSceneState(editor));
  const activeViewport = ui.viewports[ui.activeViewportId];

  useEffect(() => {
    const syncSceneState = () => {
      setSceneState((current) => {
        const next = readToolPaletteSceneState(editor);
        return areToolPaletteSceneStatesEqual(current, next) ? current : next;
      });
    };

    syncSceneState();

    const unsubscribeScene = editor.events.on("scene:changed", syncSceneState);
    const unsubscribeSelection = editor.events.on("selection:changed", syncSceneState);

    return () => {
      unsubscribeScene();
      unsubscribeSelection();
    };
  }, [editor]);

  useEffect(() => {
    const validIds = new Set(sceneState.instanceBrushSourceOptions.map((o) => o.id));

    // Prune stale ids from the multi-source list.
    const nextIds = toolSession.instanceBrushSourceNodeIds.filter((id) => validIds.has(id));
    if (nextIds.length !== toolSession.instanceBrushSourceNodeIds.length) {
      toolSessionStore.instanceBrushSourceNodeIds = nextIds;
    }

    const currentIsValid = validIds.has(toolSession.instanceBrushSourceNodeId);
    if (currentIsValid) return;

    const selectedNodeId = editor.selection.ids[0];
    const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
    const selectedSourceId = selectedNode && isInstancingSourceNode(selectedNode) ? selectedNode.id : undefined;

    toolSessionStore.instanceBrushSourceNodeId =
      selectedSourceId ?? sceneState.instanceBrushSourceOptions[0]?.id ?? "";
  }, [editor, sceneState.instanceBrushSourceOptions, toolSession.instanceBrushSourceNodeId, toolSession.instanceBrushSourceNodeIds]);

  const onImportGlb = useEventCallback(fileActions.importGlb);
  const onInvertSelectionNormals = useEventCallback(selectionActions.invertSelectionNormals);
  const onLowerTop = useEventCallback(() => selectionActions.extrudeSelection("y", -1));
  const onMeshEditToolbarAction = useEventCallback(sceneActions.meshEditToolbarAction);
  const onPausePhysics = useEventCallback(physicsActions.pause);
  const onPlaceBlockoutOpenRoom = useEventCallback(placementActions.placeBlockoutOpenRoom);
  const onPlaceBlockoutPlatform = useEventCallback(placementActions.placeBlockoutPlatform);
  const onPlaceBlockoutRoom = useEventCallback(placementActions.placeBlockoutRoom);
  const onPlaceBlockoutStairs = useEventCallback(placementActions.placeBlockoutStairs);
  const onPlaceEntity = useEventCallback(placementActions.placeEntity);
  const onPlaceLight = useEventCallback(placementActions.placeLight);
  const onPlaceProp = useEventCallback(placementActions.placeProp);
  const onPlayPhysics = useEventCallback(physicsActions.play);
  const onRaiseTop = useEventCallback(() => selectionActions.extrudeSelection("y", 1));
  const onSelectMaterial = useEventCallback(assetActions.selectMaterial);
  const onSetRenderMode = useEventCallback((renderMode: typeof ui.renderMode) => {
    uiStore.renderMode = renderMode;
  });
  const onSetSnapEnabled = useEventCallback((enabled: boolean) => {
    (Object.keys(uiStore.viewports) as ViewportPaneId[]).forEach((viewportId) => {
      uiStore.viewports[viewportId].grid.enabled = enabled;
    });
  });
  const onSetSnapSize = useEventCallback((snapSize: number) => {
    const nextSnapSize = clampSnapSize(snapSize);

    (Object.keys(uiStore.viewports) as ViewportPaneId[]).forEach((viewportId) => {
      uiStore.viewports[viewportId].grid.snapSize = nextSnapSize;
    });
  });
  const onSetViewMode = useEventCallback((viewMode: ViewModeId) => {
    uiStore.viewMode = viewMode;

    const visiblePaneIds = resolveVisibleViewportPaneIds(viewMode);

    if (!visiblePaneIds.includes(uiStore.activeViewportId)) {
      uiStore.activeViewportId = "perspective";
    }

    if (viewMode === "3d-only") {
      return;
    }

    const selectedObjectId = editor.selection.ids[0];
    const selectedNode = selectedObjectId ? editor.scene.getNode(selectedObjectId) : undefined;

    if (selectedNode) {
      (["top", "front", "side"] as const).forEach((viewportId) => {
        focusViewportOnPoint(uiStore.viewports[viewportId], selectedNode.transform.position);
      });
      return;
    }

    const selectedEntity = selectedObjectId ? editor.scene.getEntity(selectedObjectId) : undefined;
    const focusPoint = selectedEntity?.transform.position ?? { x: 0, y: 0, z: 0 };

    (["top", "front", "side"] as const).forEach((viewportId) => {
      focusViewportOnPoint(uiStore.viewports[viewportId], focusPoint);
    });
  });
  const onStartAiModelPlacement = useEventCallback(aiActions.startPlacement);
  const onSelectInstanceBrush = useEventCallback(() => {
    toolSessionStore.brushToolMode = "instance";
    toolSessionStore.activeToolId = "brush";
  });
  const onSetMaterialPaintBrushOpacity = useEventCallback((value: number) => {
    toolSessionStore.materialPaintBrushOpacity = value;
  });
  const onSetInstanceBrushDensity = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushDensity = value;
  });
  const onSetInstanceBrushAlignToNormal = useEventCallback((value: boolean) => {
    toolSessionStore.instanceBrushAlignToNormal = value;
  });
  const onSetInstanceBrushAverageNormal = useEventCallback((value: boolean) => {
    toolSessionStore.instanceBrushAverageNormal = value;
  });
  const onSetInstanceBrushRandomness = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushRandomness = value;
  });
  const onSetInstanceBrushSize = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushSize = value;
  });
  const onSetInstanceBrushSourceNodeIds = useEventCallback((nodeIds: string[]) => {
    toolSessionStore.instanceBrushSourceNodeIds = nodeIds;
    toolSessionStore.instanceBrushSourceNodeId = nodeIds[0] ?? "";
  });
  const onSetInstanceBrushYOffsetMin = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushYOffsetMin = value;
  });
  const onSetInstanceBrushYOffsetMax = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushYOffsetMax = value;
  });
  const onSetInstanceBrushScaleMin = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushScaleMin = value;
  });
  const onSetInstanceBrushScaleMax = useEventCallback((value: number) => {
    toolSessionStore.instanceBrushScaleMax = value;
  });
  const onSetSculptBrushRadius = useEventCallback((value: number) => {
    toolSessionStore.sculptBrushRadius = value;
  });
  const onSetSculptBrushStrength = useEventCallback((value: number) => {
    toolSessionStore.sculptBrushStrength = value;
  });
  const onSelectBrushShape = useEventCallback((shape: typeof toolSession.activeBrushShape) => {
    toolSessionStore.brushToolMode = "create";
    toolSessionStore.activeBrushShape = shape;
    toolSessionStore.activeToolId = "brush";
  });
  const onSetMeshEditMode = useEventCallback((mode: typeof toolSession.meshEditMode) => {
    toolSessionStore.meshEditMode = mode;
  });
  const onSetTransformMode = useEventCallback((mode: typeof toolSession.transformMode) => {
    toolSessionStore.transformMode = mode;
  });
  const onSetToolId = useEventCallback((toolId: typeof toolSession.activeToolId) => {
    toolSessionStore.activeToolId = toolId;
  });

  return (
    <ToolPalette
      activeBrushShape={toolSession.activeBrushShape}
      brushToolMode={toolSession.brushToolMode}
      aiModelPlacementActive={Boolean(toolSession.aiModelDraft) || toolSession.aiModelPlacementArmed}
      activeToolId={toolSession.activeToolId}
      currentSnapSize={activeViewport.grid.snapSize}
      gridSnapValues={gridSnapValues}
      instanceBrushAlignToNormal={toolSession.instanceBrushAlignToNormal}
      instanceBrushAverageNormal={toolSession.instanceBrushAverageNormal}
      instanceBrushDensity={toolSession.instanceBrushDensity}
      instanceBrushRandomness={toolSession.instanceBrushRandomness}
      instanceBrushSize={toolSession.instanceBrushSize}
      instanceBrushSourceNodeIds={[...toolSession.instanceBrushSourceNodeIds]}
      instanceBrushSourceOptions={sceneState.instanceBrushSourceOptions}
      instanceBrushYOffsetMin={toolSession.instanceBrushYOffsetMin}
      instanceBrushYOffsetMax={toolSession.instanceBrushYOffsetMax}
      instanceBrushScaleMin={toolSession.instanceBrushScaleMin}
      instanceBrushScaleMax={toolSession.instanceBrushScaleMax}
      materialPaintBrushOpacity={toolSession.materialPaintBrushOpacity}
      materialPaintMode={toolSession.materialPaintMode}
      materials={sceneState.materials}
      meshEditMode={toolSession.meshEditMode}
      onImportGlb={onImportGlb}
      onInvertSelectionNormals={onInvertSelectionNormals}
      onLowerTop={onLowerTop}
      onMeshEditToolbarAction={onMeshEditToolbarAction}
      onPausePhysics={onPausePhysics}
      onPlaceBlockoutOpenRoom={onPlaceBlockoutOpenRoom}
      onPlaceBlockoutPlatform={onPlaceBlockoutPlatform}
      onPlaceBlockoutRoom={onPlaceBlockoutRoom}
      onPlaceBlockoutStairs={onPlaceBlockoutStairs}
      onPlaceEntity={onPlaceEntity}
      onPlaceLight={onPlaceLight}
      onPlaceProp={onPlaceProp}
      onPlayPhysics={onPlayPhysics}
      onRaiseTop={onRaiseTop}
      onSelectBrushShape={onSelectBrushShape}
      onSelectInstanceBrush={onSelectInstanceBrush}
      onSelectMaterial={onSelectMaterial}
      onSetInstanceBrushAlignToNormal={onSetInstanceBrushAlignToNormal}
      onSetInstanceBrushAverageNormal={onSetInstanceBrushAverageNormal}
      onSetInstanceBrushDensity={onSetInstanceBrushDensity}
      onSetInstanceBrushRandomness={onSetInstanceBrushRandomness}
      onSetInstanceBrushSize={onSetInstanceBrushSize}
      onSetInstanceBrushSourceNodeIds={onSetInstanceBrushSourceNodeIds}
      onSetInstanceBrushYOffsetMin={onSetInstanceBrushYOffsetMin}
      onSetInstanceBrushYOffsetMax={onSetInstanceBrushYOffsetMax}
      onSetInstanceBrushScaleMin={onSetInstanceBrushScaleMin}
      onSetInstanceBrushScaleMax={onSetInstanceBrushScaleMax}
      onSetMaterialPaintBrushOpacity={onSetMaterialPaintBrushOpacity}
      onSetMeshEditMode={onSetMeshEditMode}
      onSetRenderMode={onSetRenderMode}
      onSetSculptBrushRadius={onSetSculptBrushRadius}
      onSetSculptBrushStrength={onSetSculptBrushStrength}
      onSetSnapEnabled={onSetSnapEnabled}
      onSetSnapSize={onSetSnapSize}
      onSetToolId={onSetToolId}
      onSetTransformMode={onSetTransformMode}
      onSetViewMode={onSetViewMode}
      onStartAiModelPlacement={onStartAiModelPlacement}
      onStopPhysics={stopPhysicsPlayback}
      physicsPlayback={toolSession.physicsPlayback}
      renderMode={ui.renderMode}
      selectedGeometry={sceneState.selectedGeometry}
      selectedMaterialId={ui.selectedMaterialId}
      selectedMesh={sceneState.selectedMesh}
      sculptBrushRadius={toolSession.sculptBrushRadius}
      sculptBrushStrength={toolSession.sculptBrushStrength}
      sculptMode={toolSession.sculptMode}
      snapEnabled={activeViewport.grid.enabled}
      tools={defaultTools}
      transformMode={toolSession.transformMode}
      viewMode={ui.viewMode}
    />
  );
});

function useEventCallback<T extends (...args: any[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}

function readToolPaletteSceneState(editor: EditorCore): ToolPaletteSceneState {
  const selectedObjectId = editor.selection.ids[0];
  const selectedNode = selectedObjectId ? editor.scene.getNode(selectedObjectId) : undefined;

  return {
    instanceBrushSourceOptions: Array.from(editor.scene.nodes.values())
      .filter((node) => isInstancingSourceNode(node))
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        label: `${node.name} · ${node.kind}`
      })),
    materials: Array.from(editor.scene.materials.values()),
    selectedGeometry:
      selectedNode?.kind === "brush" || selectedNode?.kind === "mesh" || selectedNode?.kind === "primitive",
    selectedMesh: selectedNode?.kind === "mesh"
  };
}

function areToolPaletteSceneStatesEqual(previous: ToolPaletteSceneState, next: ToolPaletteSceneState) {
  return (
    previous.selectedGeometry === next.selectedGeometry &&
    previous.selectedMesh === next.selectedMesh &&
    areMaterialsEqual(previous.materials, next.materials) &&
    areInstanceBrushSourceOptionsEqual(previous.instanceBrushSourceOptions, next.instanceBrushSourceOptions)
  );
}

function areMaterialsEqual(previous: Material[], next: Material[]) {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((material, index) => {
    const nextMaterial = next[index];

    return material === nextMaterial || (material.id === nextMaterial.id && material.name === nextMaterial.name);
  });
}

function areInstanceBrushSourceOptionsEqual(
  previous: InstanceBrushSourceOption[],
  next: InstanceBrushSourceOption[]
) {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((option, index) => {
    const nextOption = next[index];

    return (
      option === nextOption ||
      (option.id === nextOption.id && option.kind === nextOption.kind && option.label === nextOption.label)
    );
  });
}
