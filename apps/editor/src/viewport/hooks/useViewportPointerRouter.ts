import { useEffect, useRef, type MutableRefObject, type PointerEventHandler, type RefObject } from "react";
import { Vector2 } from "three";
import { createScreenRect, intersectsSelectionRect, projectLocalPointToScreen, rectContainsPoint } from "@/viewport/utils/screen-space";
import { resolveSubobjectSelection } from "@/viewport/utils/interaction";
import type { MarqueeState, ViewportCanvasProps } from "@/viewport/types";
import type { GeometryNode, ScenePathDefinition } from "@ggez/shared";

const CLICK_SELECTION_THRESHOLD_PX = 4;

type PointerRouterOptions = {
  activeToolId: ViewportCanvasProps["activeToolId"];
  aiModelPlacementArmed: boolean;
  aiPlacementClickOriginRef: MutableRefObject<Vector2 | null>;
  allowPointerClickSelectionRef: MutableRefObject<boolean>;
  arcState: unknown;
  beginInstanceBrushStroke: (bounds: DOMRect, clientX: number, clientY: number) => boolean;
  beginMaterialPaintStroke: (bounds: DOMRect, clientX: number, clientY: number) => boolean;
  beginSculptStroke: (bounds: DOMRect, clientX: number, clientY: number) => boolean;
  bevelState: unknown;
  brushClickOriginRef: MutableRefObject<Vector2 | null>;
  brushCreateState: unknown;
  brushEditHandleIds: string[];
  brushToolMode: ViewportCanvasProps["brushToolMode"];
  commitArcPreview: () => void;
  commitBevelPreview: () => void;
  commitExtrudePreview: () => void;
  commitInstanceBrushStroke: () => void;
  commitMaterialPaintStroke: () => void;
  commitPathPreview: (dragState: NonNullable<PointerRouterOptions["pathDragState"]>) => void;
  commitSculptStroke: () => void;
  editorInteractionEnabled: boolean;
  eventBlockers: {
    faceCutState: unknown;
    faceSubdivisionState: unknown;
    extrudeState: unknown;
    instanceBrushDragging: boolean;
    materialPaintDragging: boolean;
    materialPaintVisible: boolean;
    sculptDragging: boolean;
    sculptVisible: boolean;
  };
  extrudeState: unknown;
  faceCutState: unknown;
  faceSubdivisionState: unknown;
  handleAiModelPlacementClick: (clientX: number, clientY: number, bounds: DOMRect) => void;
  handleBrushCreateClick: (clientX: number, clientY: number, bounds: DOMRect) => void;
  handlePathAddClick: (bounds: DOMRect, clientX: number, clientY: number) => void;
  handlePathEditClick: (bounds: DOMRect, clientX: number, clientY: number) => void;
  marquee: MarqueeState | null;
  marqueeOriginRef: MutableRefObject<Vector2 | null>;
  meshEditMode: ViewportCanvasProps["meshEditMode"];
  meshEditSelectionIds: string[];
  onActivateViewport: ViewportCanvasProps["onActivateViewport"];
  onClearSelection: ViewportCanvasProps["onClearSelection"];
  onSelectNodes: ViewportCanvasProps["onSelectNodes"];
  pathDefinitions: ScenePathDefinition[];
  pathDragState: {
    beforeSettings: ViewportCanvasProps["sceneSettings"];
    pathId: string;
    plane: any;
    pointIndex: number;
    startPoint: any;
  } | null;
  pathToolClickOriginRef: MutableRefObject<Vector2 | null>;
  pointerPositionRef: MutableRefObject<Vector2 | null>;
  resolveMeshEditEdgeHandleHit: (bounds: DOMRect, clientX: number, clientY: number) => { id: string } | undefined;
  resolveMeshEditVertexHandleHit: (bounds: DOMRect, clientX: number, clientY: number) => { id: string } | undefined;
  resolvePathPointHit: (bounds: DOMRect, clientX: number, clientY: number) => { pathId: string; pointIndex: number } | undefined;
  resolveSceneBrushHit: (bounds: DOMRect, clientX: number, clientY: number) => unknown;
  resolveSelectedMeshSurfaceHit: (bounds: DOMRect, clientX: number, clientY: number) => unknown;
  selectNodesAlongRay: (bounds: DOMRect, clientX: number, clientY: number) => void;
  selectedBrushNode?: GeometryNode;
  selectedDisplayNode?: GeometryNode;
  selectedMeshNode?: GeometryNode;
  selectionClickOriginRef: MutableRefObject<Vector2 | null>;
  setBrushEditHandleIds: (value: string[]) => void;
  setCameraControlsEnabled: (enabled: boolean) => void;
  setMarquee: (value: MarqueeState | null) => void;
  setMeshEditSelectionIds: (value: string[]) => void;
  startPathPointDrag: (pathId: string, pointIndex: number, point: any) => boolean;
  suppressSelectionAfterTransformRef: MutableRefObject<boolean>;
  transformDraggingRef: MutableRefObject<boolean>;
  updateArcPreview: (clientX: number, clientY: number, bounds: DOMRect) => void;
  updateBevelPreview: (clientX: number, clientY: number, bounds: DOMRect) => void;
  updateBrushCreatePreview: (clientX: number, clientY: number, bounds: DOMRect) => void;
  updateExtrudePreview: (clientX: number, clientY: number, bounds: DOMRect) => void;
  updateInstanceBrushStroke: (bounds: DOMRect, clientX: number, clientY: number) => void;
  updateMaterialPaintStroke: (bounds: DOMRect, clientX: number, clientY: number) => void;
  updatePathPreviewPoint: (dragState: NonNullable<PointerRouterOptions["pathDragState"]>, clientX: number, clientY: number, bounds: DOMRect) => void;
  updateSculptStroke: (bounds: DOMRect, clientX: number, clientY: number) => void;
  viewport: ViewportCanvasProps["viewport"];
  viewportId: ViewportCanvasProps["viewportId"];
  viewportRootRef: RefObject<HTMLDivElement | null>;
};

export function useViewportPointerRouter({
  activeToolId,
  aiModelPlacementArmed,
  aiPlacementClickOriginRef,
  allowPointerClickSelectionRef,
  arcState,
  beginInstanceBrushStroke,
  beginMaterialPaintStroke,
  beginSculptStroke,
  bevelState,
  brushClickOriginRef,
  brushCreateState,
  brushEditHandleIds,
  brushToolMode,
  commitArcPreview,
  commitBevelPreview,
  commitExtrudePreview,
  commitInstanceBrushStroke,
  commitMaterialPaintStroke,
  commitPathPreview,
  commitSculptStroke,
  editorInteractionEnabled,
  eventBlockers,
  extrudeState,
  faceCutState,
  faceSubdivisionState,
  handleAiModelPlacementClick,
  handleBrushCreateClick,
  handlePathAddClick,
  handlePathEditClick,
  marquee,
  marqueeOriginRef,
  meshEditMode,
  meshEditSelectionIds,
  onActivateViewport,
  onClearSelection,
  pathDefinitions,
  pathDragState,
  pathToolClickOriginRef,
  pointerPositionRef,
  resolveMeshEditEdgeHandleHit,
  resolveMeshEditVertexHandleHit,
  resolvePathPointHit,
  resolveSceneBrushHit,
  resolveSelectedMeshSurfaceHit,
  selectNodesAlongRay,
  selectedBrushNode,
  selectedDisplayNode,
  selectedMeshNode,
  selectionClickOriginRef,
  setBrushEditHandleIds,
  setCameraControlsEnabled,
  setMarquee,
  setMeshEditSelectionIds,
  startPathPointDrag,
  suppressSelectionAfterTransformRef,
  transformDraggingRef,
  updateArcPreview,
  updateBevelPreview,
  updateBrushCreatePreview,
  updateExtrudePreview,
  updateInstanceBrushStroke,
  updateMaterialPaintStroke,
  updatePathPreviewPoint,
  updateSculptStroke,
  viewport,
  viewportId
}: PointerRouterOptions) {
  const previewFrameRef = useRef<number | null>(null);
  const pendingPreviewUpdateRef = useRef<{
    bounds: DOMRect;
    clientX: number;
    clientY: number;
    kind: "arc" | "bevel" | "extrude" | "material-paint" | "sculpt";
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
    };
  }, []);

  const queuePreviewUpdate = (
    kind: "arc" | "bevel" | "extrude" | "material-paint" | "sculpt",
    clientX: number,
    clientY: number,
    bounds: DOMRect
  ) => {
    pendingPreviewUpdateRef.current = { bounds, clientX, clientY, kind };

    if (previewFrameRef.current !== null) {
      return;
    }

    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const pending = pendingPreviewUpdateRef.current;
      pendingPreviewUpdateRef.current = null;

      if (!pending) {
        return;
      }

      switch (pending.kind) {
        case "extrude":
          updateExtrudePreview(pending.clientX, pending.clientY, pending.bounds);
          return;
        case "material-paint":
          updateMaterialPaintStroke(pending.bounds, pending.clientX, pending.clientY);
          return;
        case "sculpt":
          updateSculptStroke(pending.bounds, pending.clientX, pending.clientY);
          return;
        case "arc":
          updateArcPreview(pending.clientX, pending.clientY, pending.bounds);
          return;
        case "bevel":
          updateBevelPreview(pending.clientX, pending.clientY, pending.bounds);
          return;
      }
    });
  };

  const handlePointerDownCapture: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!editorInteractionEnabled || event.button !== 0 || event.shiftKey) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    if (activeToolId === "brush" && brushToolMode === "instance" && resolveSceneBrushHit(bounds, event.clientX, event.clientY)) {
      setCameraControlsEnabled(false);
      return;
    }

    if (activeToolId !== "mesh-edit" || !selectedMeshNode) {
      return;
    }

    const meshHit = resolveSelectedMeshSurfaceHit(bounds, event.clientX, event.clientY);

    if (!meshHit) {
      return;
    }

    if (eventBlockers.materialPaintVisible || eventBlockers.sculptVisible) {
      setCameraControlsEnabled(false);
    }
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    onActivateViewport(viewportId);

    if (!editorInteractionEnabled) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    allowPointerClickSelectionRef.current = event.button === 0;
    selectionClickOriginRef.current = event.button === 0 ? new Vector2(event.clientX - bounds.left, event.clientY - bounds.top) : null;

    if (
      extrudeState ||
      arcState ||
      bevelState ||
      faceCutState ||
      faceSubdivisionState ||
      eventBlockers.materialPaintDragging ||
      eventBlockers.sculptDragging ||
      eventBlockers.instanceBrushDragging
    ) {
      return;
    }

    if (aiModelPlacementArmed && event.button === 0 && !event.shiftKey) {
      aiPlacementClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }

    if (activeToolId === "brush" && brushToolMode === "instance" && event.button === 0 && !event.shiftKey) {
      beginInstanceBrushStroke(bounds, event.clientX, event.clientY);
      return;
    }

    if (activeToolId === "brush" && brushToolMode === "create" && event.button === 0 && !event.shiftKey) {
      brushClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }

    if ((activeToolId === "path-add" || activeToolId === "path-edit") && event.button === 0 && !event.shiftKey) {
      pathToolClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

      if (activeToolId === "path-edit") {
        const pointHit = resolvePathPointHit(bounds, event.clientX, event.clientY);
        const pathPoint = pointHit ? pathDefinitions.find((pathDefinition) => pathDefinition.id === pointHit.pathId)?.points[pointHit.pointIndex] : undefined;

        if (pointHit && pathPoint) {
          startPathPointDrag(pointHit.pathId, pointHit.pointIndex, pathPoint);
        }
      }

      return;
    }

    if (
      activeToolId === "mesh-edit" &&
      eventBlockers.materialPaintVisible &&
      !eventBlockers.materialPaintDragging &&
      selectedMeshNode &&
      event.button === 0 &&
      !event.shiftKey
    ) {
      if (beginMaterialPaintStroke(bounds, event.clientX, event.clientY)) {
        return;
      }
    }

    if (
      activeToolId === "mesh-edit" &&
      eventBlockers.sculptVisible &&
      !eventBlockers.sculptDragging &&
      selectedMeshNode &&
      event.button === 0 &&
      !event.shiftKey
    ) {
      if (beginSculptStroke(bounds, event.clientX, event.clientY)) {
        return;
      }
    }

    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    marqueeOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!editorInteractionEnabled) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (
      allowPointerClickSelectionRef.current &&
      selectionClickOriginRef.current &&
      pointerPositionRef.current.distanceTo(selectionClickOriginRef.current) > CLICK_SELECTION_THRESHOLD_PX
    ) {
      allowPointerClickSelectionRef.current = false;
    }

    if (extrudeState) {
      queuePreviewUpdate("extrude", event.clientX, event.clientY, bounds);
      return;
    }

    if (eventBlockers.materialPaintDragging || eventBlockers.sculptDragging) {
      return;
    }

    if (activeToolId === "mesh-edit" && selectedMeshNode && (eventBlockers.materialPaintVisible || eventBlockers.sculptVisible)) {
      if (resolveSelectedMeshSurfaceHit(bounds, event.clientX, event.clientY)) {
        if (eventBlockers.materialPaintVisible && !eventBlockers.materialPaintDragging) {
          queuePreviewUpdate("material-paint", event.clientX, event.clientY, bounds);
        } else if (eventBlockers.sculptVisible && !eventBlockers.sculptDragging) {
          queuePreviewUpdate("sculpt", event.clientX, event.clientY, bounds);
        }
      }
    }

    if (arcState) {
      queuePreviewUpdate("arc", event.clientX, event.clientY, bounds);
      return;
    }

    if (faceCutState || faceSubdivisionState) {
      return;
    }

    if (bevelState) {
      queuePreviewUpdate("bevel", event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "brush" && brushToolMode === "instance") {
      updateInstanceBrushStroke(bounds, event.clientX, event.clientY);
      return;
    }

    if (activeToolId === "brush") {
      if (brushToolMode === "create" && brushCreateState) {
        updateBrushCreatePreview(event.clientX, event.clientY, bounds);
      }

      return;
    }

    if (pathDragState) {
      updatePathPreviewPoint(pathDragState, event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "path-add" || activeToolId === "path-edit") {
      return;
    }

    if (!marqueeOriginRef.current) {
      return;
    }

    const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    const origin = marqueeOriginRef.current;

    if (!marquee && point.distanceTo(origin) < 4) {
      return;
    }

    setMarquee({
      active: true,
      current: point,
      origin
    });
  };

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!editorInteractionEnabled) {
      return;
    }

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        allowPointerClickSelectionRef.current = false;
      });
    }

    if (transformDraggingRef.current || suppressSelectionAfterTransformRef.current) {
      selectionClickOriginRef.current = null;
      marqueeOriginRef.current = null;
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    pointerPositionRef.current = point;

    if (extrudeState) {
      if (event.button === 0) commitExtrudePreview();
      return;
    }

    if (eventBlockers.materialPaintDragging) {
      if (event.button === 0) commitMaterialPaintStroke();
      return;
    }

    if (eventBlockers.sculptDragging) {
      if (event.button === 0) commitSculptStroke();
      return;
    }

    if (eventBlockers.instanceBrushDragging) {
      if (event.button === 0) commitInstanceBrushStroke();
      return;
    }

    if (arcState) {
      if (event.button === 0) commitArcPreview();
      return;
    }

    if (faceCutState || faceSubdivisionState) {
      return;
    }

    if (bevelState) {
      if (event.button === 0) commitBevelPreview();
      return;
    }

    if (pathDragState) {
      if (event.button === 0) {
        pathToolClickOriginRef.current = null;
        commitPathPreview(pathDragState);
      }
      return;
    }

    if (aiModelPlacementArmed) {
      const origin = aiPlacementClickOriginRef.current;
      aiPlacementClickOriginRef.current = null;

      if (!origin) {
        return;
      }

      if (point.distanceTo(origin) > 4) {
        return;
      }

      handleAiModelPlacementClick(event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "brush" && brushToolMode === "instance") {
      return;
    }

    if (activeToolId === "brush") {
      const origin = brushClickOriginRef.current;
      brushClickOriginRef.current = null;

      if (!origin) {
        return;
      }

      if (point.distanceTo(origin) > 4) {
        return;
      }

      handleBrushCreateClick(event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "path-add" || activeToolId === "path-edit") {
      const origin = pathToolClickOriginRef.current;
      pathToolClickOriginRef.current = null;

      if (!origin) {
        return;
      }

      if (point.distanceTo(origin) > 4) {
        return;
      }

      if (activeToolId === "path-add") {
        handlePathAddClick(bounds, event.clientX, event.clientY);
      } else {
        handlePathEditClick(bounds, event.clientX, event.clientY);
      }
      return;
    }

    const selectionOrigin = selectionClickOriginRef.current;
    selectionClickOriginRef.current = null;
    const clickOrigin = selectionOrigin ?? marqueeOriginRef.current;

    if (
      activeToolId === "mesh-edit" &&
      meshEditMode === "vertex" &&
      event.button === 0 &&
      clickOrigin &&
      point.distanceTo(clickOrigin) <= CLICK_SELECTION_THRESHOLD_PX
    ) {
      const vertexHandleHit = resolveMeshEditVertexHandleHit(bounds, event.clientX, event.clientY);

      if (vertexHandleHit) {
        marqueeOriginRef.current = null;
        setMarquee(null);

        if (selectedBrushNode) {
          setBrushEditHandleIds(resolveSubobjectSelection(brushEditHandleIds, vertexHandleHit.id, event.shiftKey));
        } else {
          setMeshEditSelectionIds(resolveSubobjectSelection(meshEditSelectionIds, vertexHandleHit.id, event.shiftKey));
        }

        return;
      }
    }

    if (
      activeToolId === "mesh-edit" &&
      meshEditMode === "edge" &&
      event.button === 0 &&
      !event.altKey &&
      clickOrigin &&
      point.distanceTo(clickOrigin) <= CLICK_SELECTION_THRESHOLD_PX
    ) {
      const edgeHandleHit = resolveMeshEditEdgeHandleHit(bounds, event.clientX, event.clientY);

      if (edgeHandleHit) {
        marqueeOriginRef.current = null;
        setMarquee(null);

        if (selectedBrushNode) {
          setBrushEditHandleIds(resolveSubobjectSelection(brushEditHandleIds, edgeHandleHit.id, event.shiftKey));
        } else {
          setMeshEditSelectionIds(resolveSubobjectSelection(meshEditSelectionIds, edgeHandleHit.id, event.shiftKey));
        }

        return;
      }
    }

    if (
      viewport.projection === "orthographic" &&
      activeToolId !== "mesh-edit" &&
      event.button === 0 &&
      !event.shiftKey &&
      selectionOrigin &&
      point.distanceTo(selectionOrigin) <= CLICK_SELECTION_THRESHOLD_PX
    ) {
      selectNodesAlongRay(bounds, event.clientX, event.clientY);
      return;
    }

    if (!marqueeOriginRef.current) {
      return;
    }

    const origin = marqueeOriginRef.current;
    marqueeOriginRef.current = null;

    if (!marquee) {
      return;
    }

    const finalMarquee = { ...marquee, current: point, origin };
    setMarquee(null);

    const selectionRect = createScreenRect(finalMarquee.origin, finalMarquee.current);

    if (selectionRect.width < 4 && selectionRect.height < 4) {
      return;
    }

    if (activeToolId === "mesh-edit" && selectedDisplayNode) {
      const handleSelections = (selectedBrushNode ? [] : [])
        .filter(Boolean);
      void handleSelections;
    }

    selectNodesAlongRay(bounds, event.clientX, event.clientY);
  };

  return {
    handlePointerDownCapture,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    queuePreviewUpdate
  };
}
