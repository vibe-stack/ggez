import { Canvas, type RootState } from "@react-three/fiber";
import {
  arcEditableMeshEdges,
  bevelEditableMeshEdges,
  buildEditableMeshVertexNormals,
  convertBrushToEditableMesh,
  cutEditableMeshBetweenEdges,
  deleteEditableMeshFaces,
  extrudeEditableMeshEdge,
  extrudeEditableMeshFace,
  extrudeEditableMeshFaces,
  fillEditableMeshFaceFromEdges,
  fillEditableMeshFaceFromVertices,
  invertEditableMeshNormals,
  mergeEditableMeshEdges,
  mergeEditableMeshFaces,
  mergeEditableMeshVertices,
  paintEditableMeshMaterialLayers,
  sculptEditableMeshSamples,
  smoothEditableMeshSamples,
  subdivideEditableMeshFace
} from "@ggez/geometry-kernel";
import {
  addVec3,
  averageVec3,
  crossVec3,
  normalizeEditableMeshMaterialLayers,
  type GeometryNode,
  isBrushNode,
  isMeshNode,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  toTuple,
  subVec3,
  vec3,
  type ScenePathDefinition,
  type EditableMesh,
  type Transform,
  type Vec3
} from "@ggez/shared";
import {
  applyBrushEditTransform,
  applyMeshEditTransform,
  createBrushEditHandles,
  createBrushExtrudeHandles,
  computeBrushEditSelectionCenter,
  computeBrushEditSelectionOrientation,
  computeMeshEditSelectionCenter,
  computeMeshEditSelectionOrientation,
  createMeshEditHandles,
  createMeshExtrudeHandles,
  extrudeBrushHandle
} from "@/viewport/editing";
import { BrushClipOverlay } from "@/viewport/components/BrushClipOverlay";
import { BrushCreatePreview } from "@/viewport/components/BrushCreatePreview";
import { ConstructionGrid } from "@/viewport/components/ConstructionGrid";
import { EditableMeshPreviewOverlay } from "@/viewport/components/EditableMeshPreviewOverlay";
import { MaterialPaintWeightOverlay } from "@/viewport/components/MaterialPaintWeightOverlay";
import { InstanceBrushPreview, SculptBrushOverlay } from "@/viewport/components/ViewportBrushOverlays";
import { BrushEditOverlay, MeshEditOverlay } from "@/viewport/components/EditOverlays";
import { EditorCameraRig } from "@/viewport/components/EditorCameraRig";
import { BrushExtrudeOverlay, ExtrudeAxisGuide, MeshExtrudeOverlay } from "@/viewport/components/ExtrudeOverlays";
import { MeshCutOverlay } from "@/viewport/components/MeshCutOverlay";
import { MeshSubdivideOverlay } from "@/viewport/components/MeshSubdivideOverlay";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";
import { ObjectTransformGizmo } from "@/viewport/components/ObjectTransformGizmo";
import { ScenePreview } from "@/viewport/components/ScenePreview";
import { DefaultViewportSun, ViewportShadowMapSettings, ViewportWorldSettings } from "@/viewport/components/ViewportEnvironment";
import { useEventCallback } from "@/viewport/hooks/useEventCallback";
import { useViewportBrushInteractions } from "@/viewport/hooks/useViewportBrushInteractions";
import { useViewportMeshEditOperations } from "@/viewport/hooks/useViewportMeshEditOperations";
import { useViewportPointerRouter } from "@/viewport/hooks/useViewportPointerRouter";
import { useStableOverlayHandles } from "@/viewport/hooks/useStableOverlayHandles";
import {
  createBrushCreateBasis,
  createBrushCreateDragPlane,
  projectPointerToThreePlane,
  resolveBrushCreateSurfaceHit
} from "@/viewport/utils/brush-create";
import {
  adjustBrushCreateStateWithWheel,
  advanceBrushCreateState,
  finalizeBrushCreateState,
  startBrushCreateState,
  updateBrushCreateState
} from "@/viewport/utils/brush-create-session";
import {
  findMatchingMeshEdgePair,
  makeUndirectedPairKey,
  rejectVec3FromAxis,
  resolveSubobjectSelection,
  resolveExtrudeDirection,
  vec3LengthSquared
} from "@/viewport/utils/interaction";
import {
  appendScenePathPoint,
  buildInstanceBrushSampleOffsets,
  buildSculptVertexRenderMap,
  composeInstanceBrushRotation,
  createInstanceBrushTransformKey,
  createNextScenePathDefinition,
  findEditableEdgeHandleHit,
  findPathPointHit,
  findPathSegmentHit,
  insertScenePathPoint,
  patchSculptScenePositions,
  projectWorldPointToClient,
  resolveExtrudeAmountSign,
  resolveExtrudeAnchor,
  resolveExtrudeInteractionNormal,
  resolveNodeIdFromIntersection,
  resolvePaintMaterialColor,
  resolveViewportConstructionPlane,
  snapPathEditorPoint,
  snapPointToViewportPlane,
  updateScenePathPoint,
  vec3ApproximatelyEqual,
} from "@/viewport/utils/viewport-canvas-helpers";
import {
  createScreenRect,
  intersectsSelectionRect,
  projectLocalPointToScreen,
  rectContainsPoint
} from "@/viewport/utils/screen-space";
import { composeTransformRotation, rebaseTransformPivot } from "@/viewport/utils/geometry";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import {
  renderModeUsesEditorLighting,
  renderModeUsesShadows
} from "@/viewport/viewports";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEventHandler } from "react";
import { Camera, Matrix4, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
import type {
  BrushCreateState,
  MarqueeState,
  ViewportCanvasProps
} from "@/viewport/types";

const CLICK_SELECTION_THRESHOLD_PX = 4;
const VERTEX_HANDLE_HIT_THRESHOLD_PX = 14;

export function ViewportCanvas({
  activeBrushShape,
  brushToolMode,
  aiModelPlacementArmed,
  activeToolId,
  dprScale,
  hiddenSceneItemIds = [],
  instanceBrushAlignToNormal,
  instanceBrushAverageNormal,
  instanceBrushDensity,
  instanceBrushRandomness,
  instanceBrushSize,
  instanceBrushSourceNodeId,
  instanceBrushSourceNodeIds,
  instanceBrushSourceTransform,
  instanceBrushYOffsetMin,
  instanceBrushYOffsetMax,
  instanceBrushScaleMin,
  instanceBrushScaleMax,
  isActiveViewport,
  materialPaintBrushOpacity,
  meshEditMode,
  meshEditToolbarAction,
  sculptBrushRadius,
  sculptBrushStrength,
  onActivateViewport,
  onClearSelection,
  onCommitMeshTopology,
  onCommitMeshMaterialLayers,
  onFocusNode,
  onMaterialPaintModeChange,
  onPlaceAsset,
  onPlaceAiModelPlaceholder,
  onPlaceBrush,
  onPlaceInstancingNodes,
  onPlaceInstanceBrushNodes,
  onPlaceMeshNode,
  onPlacePrimitiveNode,
  onPreviewBrushData,
  onPreviewEntityTransform,
  onPreviewMeshData,
  onPreviewNodeTransform,
  onSculptModeChange,
  onSelectScenePath,
  onSelectMaterialFaces,
  onSelectNodes,
  onSetToolId,
  onSplitBrushAtCoordinate,
  onUpdateBrushData,
  onUpdateEntityTransform,
  onUpdateMeshData,
  onUpdateNodeTransform,
  onUpdateSceneSettings,
  onViewportChange,
  physicsPlayback,
  physicsRevision,
  renderMode,
  renderScene,
  sceneSettings,
  selectedMaterialId,
  selectedScenePathId,
  selectedEntity,
  selectedNode,
  selectedNodeIds,
  selectedNodes,
  transformMode,
  viewportId,
  viewportPlane,
  viewport
}: ViewportCanvasProps) {
  const cameraRef = useRef<Camera | null>(null);
  const cameraControlsRef = useRef<any>(null);
  const aiPlacementClickOriginRef = useRef<Vector2 | null>(null);
  const brushClickOriginRef = useRef<Vector2 | null>(null);
  const marqueeOriginRef = useRef<Vector2 | null>(null);
  const pathToolClickOriginRef = useRef<Vector2 | null>(null);
  const pointerPositionRef = useRef<Vector2 | null>(null);
  const selectionClickOriginRef = useRef<Vector2 | null>(null);
  const allowPointerClickSelectionRef = useRef(false);
  const viewportRootRef = useRef<HTMLDivElement | null>(null);
  const meshObjectsRef = useRef(new Map<string, Object3D>());
  const raycasterRef = useRef(new Raycaster());
  const [brushEditHandleIds, setBrushEditHandleIds] = useState<string[]>([]);
  const [brushCreateState, setBrushCreateState] = useState<BrushCreateState | null>(null);
  const [pathAddSessionId, setPathAddSessionId] = useState<string | null>(null);
  const [pathDragState, setPathDragState] = useState<{
    beforeSettings: ViewportCanvasProps["sceneSettings"];
    pathId: string;
    plane: Plane;
    pointIndex: number;
    startPoint: Vec3;
  } | null>(null);
  const [pathPreviewPaths, setPathPreviewPaths] = useState<ScenePathDefinition[] | null>(null);
  const [selectedPathPointIndex, setSelectedPathPointIndex] = useState<number | null>(null);
  const snapSize = resolveViewportSnapSize(viewport);
  const editorInteractionEnabled = physicsPlayback === "stopped";
  const [meshEditSelectionIds, setMeshEditSelectionIds] = useState<string[]>([]);
  const [transformDragging, setTransformDragging] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const pathPreviewPathsRef = useRef<ScenePathDefinition[] | null>(null);
  const transformDraggingRef = useRef(false);
  const suppressSelectionAfterTransformRef = useRef(false);
  pathPreviewPathsRef.current = pathPreviewPaths;
  const handlePreviewBrushData = useEventCallback(onPreviewBrushData);
  const handleUpdateBrushData = useEventCallback(onUpdateBrushData);
  const handlePreviewMeshData = useEventCallback(onPreviewMeshData);
  const handleUpdateMeshData = useEventCallback(onUpdateMeshData);

  const setCameraControlsEnabled = (enabled: boolean) => {
    const controls = cameraControlsRef.current;

    if (!controls || !("enabled" in controls)) {
      return;
    }

    controls.enabled = enabled;

    if (!enabled && typeof controls.state === "number") {
      controls.state = -1;
    }

    controls.update?.();
  };

  const handleTransformDragStateChange = useCallback((dragging: boolean) => {
    setCameraControlsEnabled(!dragging);
    transformDraggingRef.current = dragging;
    suppressSelectionAfterTransformRef.current = true;
    selectionClickOriginRef.current = null;
    marqueeOriginRef.current = null;
    setTransformDragging(dragging);

    if (!dragging && typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        suppressSelectionAfterTransformRef.current = false;
      });
    }
  }, []);

  const handleSceneSelectNodes = (nodeIds: string[]) => {
    if (!allowPointerClickSelectionRef.current) {
      return;
    }

    if (transformDraggingRef.current || suppressSelectionAfterTransformRef.current) {
      return;
    }

    onSelectNodes(nodeIds);
  };

  useEffect(() => {
    setMeshEditSelectionIds([]);
    setBrushEditHandleIds([]);
    setPathAddSessionId(null);
    setPathDragState(null);
    pathPreviewPathsRef.current = null;
    setPathPreviewPaths(null);
    setSelectedPathPointIndex(null);
    resetBrushInteractions();
    resetMeshEditOperations();
  }, [activeToolId, meshEditMode, selectedNode?.id, selectedNode?.kind]);

  useEffect(() => {
    if (activeToolId !== "brush" || brushToolMode !== "create") {
      setBrushCreateState(null);
    }
  }, [activeToolId, brushToolMode]);

  useEffect(() => {
    if (editorInteractionEnabled) {
      return;
    }

    brushClickOriginRef.current = null;
    aiPlacementClickOriginRef.current = null;
    marqueeOriginRef.current = null;
    pathToolClickOriginRef.current = null;
    selectionClickOriginRef.current = null;
    setPathDragState(null);
    pathPreviewPathsRef.current = null;
    setPathPreviewPaths(null);
    setMarquee(null);
    resetBrushInteractions();
    resetMeshEditOperations();
  }, [editorInteractionEnabled]);

  useEffect(() => {
    const scenePaths = sceneSettings.paths ?? [];

    if (!selectedScenePathId || !scenePaths.some((pathDefinition) => pathDefinition.id === selectedScenePathId)) {
      setSelectedPathPointIndex(null);
      return;
    }

    const selectedPath = scenePaths.find((pathDefinition) => pathDefinition.id === selectedScenePathId);

    if (!selectedPath || selectedPathPointIndex === null || selectedPathPointIndex < selectedPath.points.length) {
      return;
    }

    setSelectedPathPointIndex(selectedPath.points.length > 0 ? selectedPath.points.length - 1 : null);
  }, [sceneSettings.paths, selectedPathPointIndex, selectedScenePathId]);

  useEffect(() => {
    setBrushCreateState((current) => (current && current.shape !== activeBrushShape ? null : current));
  }, [activeBrushShape]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeToolId === "path-add" && event.key === "Enter") {
        event.preventDefault();
        setPathAddSessionId(null);
        onSetToolId("path-edit");
        return;
      }

      if (event.key === "Escape" && (activeToolId === "path-add" || activeToolId === "path-edit")) {
        event.preventDefault();
        setPathAddSessionId(null);
        setPathDragState(null);
        pathPreviewPathsRef.current = null;
        setPathPreviewPaths(null);
        setSelectedPathPointIndex(null);
        return;
      }

      if (activeToolId !== "path-edit" || selectedScenePathId === undefined || selectedPathPointIndex === null) {
        return;
      }

      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }

      const scenePaths = sceneSettings.paths ?? [];
      const selectedPath = scenePaths.find((pathDefinition) => pathDefinition.id === selectedScenePathId);

      if (!selectedPath) {
        return;
      }

      event.preventDefault();

      const nextPaths = scenePaths.map((pathDefinition) =>
        pathDefinition.id === selectedScenePathId
          ? {
              ...pathDefinition,
              points: pathDefinition.points.filter((_, index) => index !== selectedPathPointIndex)
            }
          : pathDefinition
      );

      onUpdateSceneSettings(
        {
          ...sceneSettings,
          paths: nextPaths
        },
        sceneSettings
      );
      setSelectedPathPointIndex(
        selectedPath.points.length <= 1 ? null : Math.max(0, Math.min(selectedPathPointIndex - 1, selectedPath.points.length - 2))
      );
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeToolId, onSetToolId, onUpdateSceneSettings, sceneSettings, selectedPathPointIndex, selectedScenePathId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!brushCreateState) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setBrushCreateState(null);
        return;
      }

      if (event.key !== "Enter" || brushCreateState.shape !== "custom-polygon" || brushCreateState.stage !== "outline") {
        return;
      }

      event.preventDefault();

      const bounds = viewportRootRef.current?.getBoundingClientRect();
      const pointer = pointerPositionRef.current;

      const result = finalizeBrushCreateState(
        brushCreateState,
        cameraRef.current && bounds && pointer
          ? {
              bounds,
              camera: cameraRef.current,
              clientX: pointer.x + bounds.left,
              clientY: pointer.y + bounds.top,
              raycaster: raycasterRef.current,
              snapSize
            }
          : undefined
      );

      if (result.nextState) {
        setBrushCreateState(result.nextState);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [brushCreateState, snapSize]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!brushCreateState || (brushCreateState.shape !== "stairs" && brushCreateState.shape !== "ramp")) {
        return;
      }

      event.preventDefault();
      setBrushCreateState((current) => (current ? adjustBrushCreateStateWithWheel(current, event.deltaY) : current));
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [brushCreateState]);

  const selectedBrushNode = selectedNode && isBrushNode(selectedNode) ? selectedNode : undefined;
  const selectedMeshNode = selectedNode && isMeshNode(selectedNode) ? selectedNode : undefined;
  const selectedNodeWorldTransform = selectedNode ? renderScene.nodeTransforms.get(selectedNode.id) ?? selectedNode.transform : undefined;
  const selectedEntityWorldTransform = selectedEntity
    ? renderScene.entityTransforms.get(selectedEntity.id) ?? selectedEntity.transform
    : undefined;
  const selectedDisplayNode = selectedNode && selectedNodeWorldTransform
    ? {
        ...selectedNode,
        transform: selectedNodeWorldTransform
      }
    : selectedNode;
  const selectedBrushDisplayNode =
    selectedBrushNode && selectedNodeWorldTransform
      ? {
          ...selectedBrushNode,
          transform: selectedNodeWorldTransform
        }
      : selectedBrushNode;
  const selectedMeshDisplayNode =
    selectedMeshNode && selectedNodeWorldTransform
      ? {
          ...selectedMeshNode,
          transform: selectedNodeWorldTransform
        }
      : selectedMeshNode;
  const selectedDisplayNodes = selectedNodes.map((node) => ({
    ...node,
    transform: renderScene.nodeTransforms.get(node.id) ?? node.transform
  }));
  const pathDefinitions = pathPreviewPaths ?? (sceneSettings.paths ?? []);
  const selectedPath = selectedScenePathId
    ? pathDefinitions.find((pathDefinition) => pathDefinition.id === selectedScenePathId)
    : undefined;
  const {
    materialPaintState,
    instanceBrushState,
    sculptState,
    beginInstanceBrushStroke,
    beginMaterialPaintStroke,
    beginSculptStroke,
    cancelInstanceBrushStroke,
    cancelMaterialPaintStroke,
    cancelSculptStroke,
    clearMaterialPaintMode,
    clearSculptMode,
    commitInstanceBrushStroke,
    commitMaterialPaintStroke,
    commitSculptStroke,
    resetBrushInteractions,
    resolveSceneBrushHit,
    resolveSelectedMeshSurfaceHit,
    startMaterialPaintMode,
    startSculptMode,
    updateInstanceBrushStroke,
    updateMaterialPaintStroke,
    updateSculptStroke
  } = useViewportBrushInteractions({
    activeToolId,
    brushToolMode,
    editorInteractionEnabled,
    instanceBrushAlignToNormal,
    instanceBrushAverageNormal,
    instanceBrushDensity,
    instanceBrushRandomness,
    instanceBrushScaleMax,
    instanceBrushScaleMin,
    instanceBrushSize,
    instanceBrushSourceNodeId,
    instanceBrushSourceNodeIds,
    instanceBrushSourceTransform,
    instanceBrushYOffsetMax,
    instanceBrushYOffsetMin,
    materialPaintBrushOpacity,
    meshEditMode,
    meshObjectsRef,
    onCommitMeshMaterialLayers,
    onMaterialPaintModeChange,
    onPlaceInstanceBrushNodes,
    onSculptModeChange,
    onUpdateMeshData: handleUpdateMeshData,
    pointerPositionRef,
    raycasterRef,
    renderMeshes: renderScene.meshes,
    sculptBrushRadius,
    sculptBrushStrength,
    selectedMaterialId,
    selectedMeshNode,
    selectedNode,
    setCameraControlsEnabled,
    setTransformDragging,
    snapSize,
    viewport,
    viewportPlane,
    viewportRootRef
  });

  useEffect(() => {
    if (!isActiveViewport) {
      return;
    }

    if (activeToolId !== "mesh-edit" || meshEditMode !== "face") {
      onSelectMaterialFaces([]);
      return;
    }

    if (selectedMeshNode) {
      onSelectMaterialFaces(meshEditSelectionIds);
      return;
    }

    if (selectedBrushNode) {
      onSelectMaterialFaces(brushEditHandleIds);
      return;
    }

    onSelectMaterialFaces([]);
  }, [activeToolId, brushEditHandleIds, isActiveViewport, meshEditMode, meshEditSelectionIds, onSelectMaterialFaces, selectedBrushNode, selectedMeshNode]);
  const nextBrushEditHandles = useMemo(
    () =>
      activeToolId === "mesh-edit" && selectedBrushNode
        ? createBrushEditHandles(selectedBrushNode.data, meshEditMode)
        : [],
    [activeToolId, meshEditMode, selectedBrushNode?.data]
  );
  const brushEditHandles = useStableOverlayHandles(nextBrushEditHandles);
  const nextMeshEditHandles = useMemo(
    () =>
      activeToolId === "mesh-edit" && selectedMeshNode
        ? createMeshEditHandles(selectedMeshNode.data, meshEditMode)
        : [],
    [activeToolId, meshEditMode, selectedMeshNode?.data]
  );
  const meshEditHandles = useStableOverlayHandles(nextMeshEditHandles);
  const editableMeshSource = useMemo(
    () =>
      activeToolId === "mesh-edit" && selectedBrushNode
        ? convertBrushToEditableMesh(selectedBrushNode.data)
        : activeToolId === "mesh-edit" && selectedMeshNode
          ? selectedMeshNode.data
          : undefined,
    [activeToolId, selectedBrushNode?.data, selectedMeshNode?.data]
  );
  const nextEditableMeshHandles = useMemo(
    () =>
      activeToolId === "mesh-edit" && editableMeshSource
        ? selectedMeshNode
          ? meshEditHandles
          : createMeshEditHandles(editableMeshSource, meshEditMode)
        : [],
    [activeToolId, editableMeshSource, meshEditMode, meshEditHandles, selectedMeshNode]
  );
  const editableMeshHandles = useStableOverlayHandles(nextEditableMeshHandles);
  const shouldTreatAsSelectionClick = useCallback(() => allowPointerClickSelectionRef.current, []);
  const resolveMeshEditEdgeHandleHit = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (activeToolId !== "mesh-edit" || meshEditMode !== "edge" || !cameraRef.current || !selectedDisplayNode) {
      return undefined;
    }

    return findEditableEdgeHandleHit(
      selectedBrushNode ? brushEditHandles : meshEditHandles,
      new Set(selectedBrushNode ? brushEditHandleIds : meshEditSelectionIds),
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      selectedDisplayNode,
      projectLocalPointToScreen
    );
  };
  const resolveMeshEditVertexHandleHit = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (activeToolId !== "mesh-edit" || meshEditMode !== "vertex" || !cameraRef.current || !selectedDisplayNode) {
      return undefined;
    }

    const handles = selectedBrushNode ? brushEditHandles : meshEditHandles;
    const selectedIds = new Set(selectedBrushNode ? brushEditHandleIds : meshEditSelectionIds);
    const pointer = {
      x: clientX - bounds.left,
      y: clientY - bounds.top
    };
    let bestHit:
      | {
          distance: number;
          id: string;
          selected: boolean;
        }
      | undefined;

    handles.forEach((handle) => {
      if (handle.vertexIds.length !== 1) {
        return;
      }

      const projected = projectLocalPointToScreen(handle.position, selectedDisplayNode, cameraRef.current!, bounds);
      const distance = Math.hypot(projected.x - pointer.x, projected.y - pointer.y);

      if (!Number.isFinite(distance) || distance > VERTEX_HANDLE_HIT_THRESHOLD_PX) {
        return;
      }

      const selected = selectedIds.has(handle.id);

      if (
        !bestHit ||
        distance < bestHit.distance - 0.5 ||
        (Math.abs(distance - bestHit.distance) <= 0.5 && selected && !bestHit.selected)
      ) {
        bestHit = {
          distance,
          id: handle.id,
          selected
        };
      }
    });

    return bestHit;
  };

  const resolveSelectedEditableMeshEdgePairs = () => {
    if (!editableMeshSource) {
      return [];
    }

    if (selectedMeshNode) {
      return editableMeshHandles
        .filter((handle) => meshEditSelectionIds.includes(handle.id))
        .map((handle) => handle.vertexIds as [string, string])
        .filter((vertexIds): vertexIds is [string, string] => vertexIds.length === 2);
    }

    return brushEditHandles
      .filter((handle) => brushEditHandleIds.includes(handle.id))
      .map((handle) => findMatchingMeshEdgePair(editableMeshHandles, handle))
      .filter((edge): edge is [string, string] => Boolean(edge));
  };

  const resolveSelectedEditableMeshFaceIds = () => {
    if (!editableMeshSource) {
      return [];
    }

    return selectedMeshNode ? meshEditSelectionIds : brushEditHandleIds;
  };

  const resolveSelectedEditableMeshVertexIds = () => {
    if (!editableMeshSource) {
      return [];
    }

    return selectedMeshNode ? meshEditSelectionIds : brushEditHandleIds;
  };
  const {
    arcState,
    bevelState,
    extrudeState,
    faceCutState,
    faceSubdivisionState,
    cancelExtrudePreview,
    commitArcPreview,
    commitBevelPreview,
    commitExtrudePreview,
    commitMeshTopology,
    handleCommitMeshEditAction,
    resetMeshEditOperations,
    runMeshEditToolbarAction,
    setFaceCutState,
    setFaceSubdivisionState,
    updateArcPreview,
    updateBevelPreview,
    updateExtrudeAxisLock,
    updateExtrudePreview
  } = useViewportMeshEditOperations({
    activeToolId,
    brushEditHandleIds,
    brushEditHandles,
    cameraRef,
    clearMaterialPaintMode,
    clearSculptMode,
    clearSubobjectSelection: () => {
      setBrushEditHandleIds([]);
      setMeshEditSelectionIds([]);
    },
    editableMeshHandles,
    editableMeshSource,
    materialPaintDragging: Boolean(materialPaintState?.dragging),
    materialPaintVisible: Boolean(materialPaintState),
    meshEditMode,
    meshEditSelectionIds,
    meshEditToolbarAction,
    meshEditHandles,
    onCommitMeshTopology,
    onPreviewBrushData,
    onStartMaterialPaintMode: startMaterialPaintMode,
    onStartSculptMode: startSculptMode,
    onUpdateBrushData: handleUpdateBrushData,
    onUpdateMeshData: handleUpdateMeshData,
    onUpdateNodeTransform,
    pointerPositionRef,
    raycasterRef,
    resolveSelectedEditableMeshEdgePairs,
    resolveSelectedEditableMeshFaceIds,
    resolveSelectedEditableMeshVertexIds,
    selectedBrushNode,
    selectedMeshNode,
    selectedNode,
    setCameraControlsEnabled,
    setTransformDragging,
    sculptDragging: Boolean(sculptState?.dragging),
    sculptVisible: Boolean(sculptState),
    snapSize,
    viewportRootRef
  });

  const handleMeshObjectChange = (nodeId: string, object: Object3D | null) => {
    if (object) {
      meshObjectsRef.current.set(nodeId, object);
      return;
    }

    meshObjectsRef.current.delete(nodeId);
  };

  const resolvePathCanvasPoint = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (!cameraRef.current) {
      return undefined;
    }

    const constructionPlane = resolveViewportConstructionPlane(viewportPlane, viewport);
    const hit = resolveBrushCreateSurfaceHit(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      meshObjectsRef.current,
      constructionPlane.point,
      constructionPlane.normal
    );

    if (!hit) {
      return undefined;
    }

    return hit.kind === "plane" && viewport.grid.enabled
      ? snapPointToViewportPlane(hit.point, viewportPlane, viewport, snapSize)
      : hit.point;
  };

  const resolvePathPointHit = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (!cameraRef.current) {
      return undefined;
    }

    return findPathPointHit(pathDefinitions, clientX, clientY, bounds, cameraRef.current);
  };

  const resolvePathSegmentHit = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (!cameraRef.current) {
      return undefined;
    }

    return findPathSegmentHit(pathDefinitions, clientX, clientY, bounds, cameraRef.current, selectedScenePathId);
  };

  const buildPathDragPlane = (point: Vec3) => {
    if (!cameraRef.current) {
      return undefined;
    }

    if (viewport.projection === "orthographic") {
      const constructionPlane = resolveViewportConstructionPlane(viewportPlane, viewport);

      return new Plane().setFromNormalAndCoplanarPoint(
        new Vector3(constructionPlane.normal.x, constructionPlane.normal.y, constructionPlane.normal.z),
        new Vector3(point.x, point.y, point.z)
      );
    }

    const cameraDirection = cameraRef.current.getWorldDirection(new Vector3()).normalize();
    return new Plane().setFromNormalAndCoplanarPoint(cameraDirection, new Vector3(point.x, point.y, point.z));
  };

  const updatePathPreviewPoint = (dragState: NonNullable<typeof pathDragState>, clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current) {
      return;
    }

    const projected = projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, dragState.plane);

    if (!projected) {
      return;
    }

    const rawPoint = vec3(projected.x, projected.y, projected.z);
    const nextPoint = snapPathEditorPoint(rawPoint, viewportPlane, viewport, snapSize);
    const nextPaths = updateScenePathPoint(pathDefinitions, dragState.pathId, dragState.pointIndex, nextPoint);
    pathPreviewPathsRef.current = nextPaths;
    setPathPreviewPaths(nextPaths);
  };

  const commitPathPreview = (dragState: NonNullable<typeof pathDragState>) => {
    const nextPaths = pathPreviewPathsRef.current ?? pathDefinitions;
    const nextPoint = nextPaths.find((pathDefinition) => pathDefinition.id === dragState.pathId)?.points[dragState.pointIndex];

    if (nextPoint && !vec3ApproximatelyEqual(nextPoint, dragState.startPoint)) {
      onUpdateSceneSettings(
        {
          ...sceneSettings,
          paths: nextPaths
        },
        dragState.beforeSettings
      );
    }

    setPathDragState(null);
    pathPreviewPathsRef.current = null;
    setPathPreviewPaths(null);
    setTransformDragging(false);
  };

  const startPathPointDrag = (pathId: string, pointIndex: number, point: Vec3) => {
    const plane = buildPathDragPlane(point);

    if (!plane) {
      return false;
    }

    onSelectScenePath(pathId);
    setSelectedPathPointIndex(pointIndex);
    setPathDragState({
      beforeSettings: structuredClone(sceneSettings),
      pathId,
      plane,
      pointIndex,
      startPoint: structuredClone(point)
    });
    setTransformDragging(true);
    return true;
  };

  const handlePathAddClick = (bounds: DOMRect, clientX: number, clientY: number) => {
    const point = resolvePathCanvasPoint(bounds, clientX, clientY);

    if (!point) {
      return;
    }

    const currentPaths = sceneSettings.paths ?? [];

    if (!pathAddSessionId || !currentPaths.some((pathDefinition) => pathDefinition.id === pathAddSessionId)) {
      const nextPath = createNextScenePathDefinition(currentPaths);

      nextPath.points = [point];
      onUpdateSceneSettings(
        {
          ...sceneSettings,
          paths: [...currentPaths, nextPath]
        },
        sceneSettings
      );
      onSelectScenePath(nextPath.id);
      setSelectedPathPointIndex(0);
      setPathAddSessionId(nextPath.id);
      return;
    }

    const nextPaths = appendScenePathPoint(currentPaths, pathAddSessionId, point);
    const nextPath = nextPaths.find((pathDefinition) => pathDefinition.id === pathAddSessionId);

    onUpdateSceneSettings(
      {
        ...sceneSettings,
        paths: nextPaths
      },
      sceneSettings
    );
    onSelectScenePath(pathAddSessionId);
    setSelectedPathPointIndex((nextPath?.points.length ?? 1) - 1);
  };

  const handlePathEditClick = (bounds: DOMRect, clientX: number, clientY: number) => {
    const pointHit = resolvePathPointHit(bounds, clientX, clientY);

    if (pointHit) {
      onSelectScenePath(pointHit.pathId);
      setSelectedPathPointIndex(pointHit.pointIndex);
      return;
    }

    const segmentHit = resolvePathSegmentHit(bounds, clientX, clientY);

    if (!segmentHit) {
      setSelectedPathPointIndex(null);
      return;
    }

    if (segmentHit.pathId !== selectedScenePathId) {
      onSelectScenePath(segmentHit.pathId);
      setSelectedPathPointIndex(null);
      return;
    }

    const point = resolvePathCanvasPoint(bounds, clientX, clientY);

    if (!point) {
      return;
    }

    const nextPaths = insertScenePathPoint(pathDefinitions, segmentHit.pathId, segmentHit.insertIndex, point);

    onUpdateSceneSettings(
      {
        ...sceneSettings,
        paths: nextPaths
      },
      sceneSettings
    );
    setSelectedPathPointIndex(segmentHit.insertIndex);
  };

  const selectNodesAlongRay = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (!cameraRef.current) {
      return;
    }

    const ndc = new Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -(((clientY - bounds.top) / bounds.height) * 2 - 1)
    );
    const objects = Array.from(meshObjectsRef.current.values());

    raycasterRef.current.setFromCamera(ndc, cameraRef.current);

    const selectedIds = Array.from(
      new Set(
        raycasterRef.current.intersectObjects(objects, true)
          .map((intersection) => resolveNodeIdFromIntersection(intersection))
          .filter((nodeId): nodeId is string => Boolean(nodeId))
      )
    );

    if (selectedIds.length > 0) {
      onSelectNodes(selectedIds);
      return;
    }

    if (activeToolId === "mesh-edit") {
      return;
    }

    onClearSelection();
  };

  const clearSubobjectSelection = () => {
    setBrushEditHandleIds([]);
    setMeshEditSelectionIds([]);
  };

  const updateBrushCreatePreview = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current || !brushCreateState) {
      return;
    }
    const nextState = updateBrushCreateState(brushCreateState, {
      bounds,
      camera: cameraRef.current,
      clientX,
      clientY,
      raycaster: raycasterRef.current,
      snapSize
    });

    if (nextState) {
      setBrushCreateState(nextState);
    }
  };

  const handleBrushCreateClick = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current) {
      return;
    }

    if (!brushCreateState) {
      const constructionPlane = resolveViewportConstructionPlane(viewportPlane, viewport);
      const hit = resolveBrushCreateSurfaceHit(
        clientX,
        clientY,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        meshObjectsRef.current,
        constructionPlane.point,
        constructionPlane.normal
      );

      if (!hit) {
        return;
      }

      const anchorPoint =
        hit.kind === "plane" && viewport.grid.enabled
          ? snapPointToViewportPlane(hit.point, viewportPlane, viewport, snapSize)
          : hit.point;

      setBrushCreateState(startBrushCreateState(activeBrushShape, anchorPoint, createBrushCreateBasis(hit.normal)));
      return;
    }
    const result = advanceBrushCreateState(brushCreateState, {
      bounds,
      camera: cameraRef.current,
      clientX,
      clientY,
      raycaster: raycasterRef.current,
      snapSize
    });

    if (result.nextState) {
      setBrushCreateState(result.nextState);
      return;
    }

    const placement = result.placement;

    if (!placement) {
      return;
    }

    if (placement.kind === "brush") {
      onPlaceBrush(placement.brush, placement.transform);
    } else if (placement.kind === "mesh") {
      onPlaceMeshNode(placement.mesh, placement.transform, placement.name);
    } else {
      onPlacePrimitiveNode(placement.primitive, placement.transform, placement.name);
    }
    setBrushCreateState(null);
  };

  const handleAiModelPlacementClick = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current) {
      return;
    }

    const constructionPlane = resolveViewportConstructionPlane(viewportPlane, viewport);
    const hit = resolveBrushCreateSurfaceHit(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      meshObjectsRef.current,
      constructionPlane.point,
      constructionPlane.normal
    );

    if (!hit) {
      return;
    }

    onPlaceAiModelPlaceholder(
      hit.kind === "plane" && viewport.grid.enabled
        ? snapPointToViewportPlane(hit.point, viewportPlane, viewport, snapSize)
        : hit.point
    );
  };

  const {
    handlePointerDownCapture,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp
  } = useViewportPointerRouter({
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
    eventBlockers: {
      faceCutState,
      faceSubdivisionState,
      extrudeState,
      instanceBrushDragging: Boolean(instanceBrushState?.dragging),
      materialPaintDragging: Boolean(materialPaintState?.dragging),
      materialPaintVisible: Boolean(materialPaintState),
      sculptDragging: Boolean(sculptState?.dragging),
      sculptVisible: Boolean(sculptState)
    },
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
    onSelectNodes,
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
    viewportId,
    viewportRootRef
  });

  const marqueeRect = marquee ? createScreenRect(marquee.origin, marquee.current) : undefined;
  const canvasCamera =
    viewport.projection === "orthographic"
      ? {
          far: viewport.camera.far,
          near: viewport.camera.near,
          position: toTuple(viewport.camera.position),
          zoom: viewport.camera.zoom
        }
      : {
          far: viewport.camera.far,
          fov: viewport.camera.fov,
          near: viewport.camera.near,
          position: toTuple(viewport.camera.position)
        };

  return (
    <div
      className="relative size-full overflow-hidden"
      ref={viewportRootRef}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Canvas
        camera={canvasCamera}
        dpr={Math.max(0.5, Math.min((typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1) * dprScale, 2.5))}
        orthographic={viewport.projection === "orthographic"}
        onCreated={(state: RootState) => {
          cameraRef.current = state.camera;
        }}
        onPointerMissed={() => {
          if (!editorInteractionEnabled) {
            return;
          }

          if (!allowPointerClickSelectionRef.current) {
            return;
          }

          if (
            aiModelPlacementArmed ||
            activeToolId === "brush" ||
            activeToolId === "path-add" ||
            activeToolId === "path-edit" ||
            extrudeState ||
            sculptState ||
            arcState ||
            bevelState ||
            faceCutState ||
            faceSubdivisionState ||
            marqueeOriginRef.current ||
            marquee
          ) {
            return;
          }

          if (activeToolId === "mesh-edit") {
            return;
          }

          onClearSelection();
        }}
        shadows={renderModeUsesShadows(renderMode)}
      >
        <ViewportShadowMapSettings renderMode={renderMode} />
        <ViewportWorldSettings renderMode={renderMode} sceneSettings={sceneSettings} />
        {renderModeUsesEditorLighting(renderMode) ? (
          <ambientLight color={sceneSettings.world.ambientColor} intensity={sceneSettings.world.ambientIntensity} />
        ) : null}
        {renderModeUsesEditorLighting(renderMode) ? <hemisphereLight args={["#9ec5f8", "#0f1721", 0.7]} /> : null}
        {renderModeUsesEditorLighting(renderMode) ? <DefaultViewportSun center={renderScene.boundsCenter} /> : null}
        <EditorCameraRig
          controlsRef={cameraControlsRef}
          controlsEnabled={
            isActiveViewport &&
            editorInteractionEnabled &&
            !marquee &&
            !transformDragging &&
            !brushCreateState &&
            !bevelState &&
            !extrudeState &&
            !instanceBrushState?.dragging &&
            !materialPaintState?.dragging &&
            !sculptState?.dragging &&
            !faceCutState &&
            !faceSubdivisionState
          }
          onViewportChange={onViewportChange}
          viewportId={viewportId}
          viewport={viewport}
        />
        {editorInteractionEnabled ? (
          <ConstructionGrid activeToolId={activeToolId} onPlaceAsset={onPlaceAsset} viewport={viewport} viewportPlane={viewportPlane} />
        ) : null}
        {renderMode !== "wireframe" && editorInteractionEnabled ? <axesHelper args={[3]} /> : null}
        <ScenePreview
          hiddenSceneItemIds={
            selectedNode &&
            (arcState || bevelState || extrudeState?.kind === "brush-mesh" || extrudeState?.kind === "mesh")
              ? [...hiddenSceneItemIds, selectedNode.id]
              : hiddenSceneItemIds
          }
          interactive={
            activeToolId !== "brush" &&
            activeToolId !== "mesh-edit" &&
            activeToolId !== "path-add" &&
            activeToolId !== "path-edit" &&
            !transformDragging &&
            viewport.projection === "perspective" &&
            editorInteractionEnabled
          }
          onFocusNode={onFocusNode}
          onMeshObjectChange={handleMeshObjectChange}
          onSelectNode={handleSceneSelectNodes}
          pathDefinitions={pathDefinitions}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          renderMode={renderMode}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
          selectedHookNodes={selectedNodes}
          selectedPathId={selectedScenePathId}
          selectedNodeIds={selectedNodeIds}
        />
        {editorInteractionEnabled && isActiveViewport && selectedPath && selectedPathPointIndex !== null ? (
          <SelectedPathPointOverlay
            pathId={selectedPath.id}
            point={selectedPath.points[selectedPathPointIndex]}
            visible={Boolean(selectedPath.points[selectedPathPointIndex])}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && arcState && selectedDisplayNode ? <EditableMeshPreviewOverlay mesh={arcState.previewMesh} node={selectedDisplayNode} /> : null}
        {editorInteractionEnabled && isActiveViewport && bevelState && selectedDisplayNode ? <EditableMeshPreviewOverlay mesh={bevelState.previewMesh} node={selectedDisplayNode} /> : null}
        {editorInteractionEnabled && isActiveViewport && (extrudeState?.kind === "mesh" || extrudeState?.kind === "brush-mesh") && selectedDisplayNode ? (
          <EditableMeshPreviewOverlay mesh={extrudeState.previewMesh} node={selectedDisplayNode} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && sculptState?.dragging && sculptState.previewMesh && selectedDisplayNode ? (
          null /* positions are patched directly onto the scene geometry — no overlay needed */
        ) : null}
        {editorInteractionEnabled && isActiveViewport && extrudeState && selectedDisplayNode ? (
          <ExtrudeAxisGuide node={selectedDisplayNode} state={extrudeState} viewport={viewport} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && materialPaintState && selectedDisplayNode ? (
          <SculptBrushOverlay hovered={materialPaintState.hovered} node={selectedDisplayNode} radius={materialPaintState.radius} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && materialPaintState?.dragging && materialPaintState.previewMesh && selectedDisplayNode ? (
          <MaterialPaintWeightOverlay
            mesh={materialPaintState.previewMesh}
            node={selectedDisplayNode}
            materialId={materialPaintState.materialId}
            paintColor={materialPaintState.paintColor}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && sculptState && selectedDisplayNode ? (
          <SculptBrushOverlay hovered={sculptState.hovered} node={selectedDisplayNode} radius={sculptState.radius} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "brush" && brushToolMode === "instance" && instanceBrushState?.hovered ? (
          <SculptBrushOverlay hovered={instanceBrushState.hovered} radius={instanceBrushSize} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "brush" && brushToolMode === "instance" && instanceBrushState?.dragging && instanceBrushState.pendingPlacements.length > 0 ? (
          <InstanceBrushPreview placements={instanceBrushState.pendingPlacements} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "brush" && brushCreateState ? (
          <BrushCreatePreview snapSize={snapSize} state={brushCreateState} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "clip" && selectedBrushDisplayNode ? (
          <BrushClipOverlay
            node={selectedBrushDisplayNode}
            onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && faceCutState && selectedDisplayNode && editableMeshSource ? (
          <MeshCutOverlay
            faceId={faceCutState.faceId}
            mesh={editableMeshSource}
            node={selectedDisplayNode}
            onCommitCut={(mesh) => {
              setFaceCutState(null);
              commitMeshTopology(mesh);
            }}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && faceSubdivisionState && selectedDisplayNode ? (
          <MeshSubdivideOverlay
            cuts={faceSubdivisionState.cuts}
            faceId={faceSubdivisionState.faceId}
            mesh={faceSubdivisionState.baseMesh}
            node={selectedDisplayNode}
            onCommitSubdivision={() => {
              const mesh = subdivideEditableMeshFace(
                faceSubdivisionState.baseMesh,
                faceSubdivisionState.faceId,
                faceSubdivisionState.cuts
              );
              setFaceSubdivisionState(null);

              if (mesh) {
                commitMeshTopology(mesh);
              }
            }}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "extrude" && selectedBrushDisplayNode ? (
          <BrushExtrudeOverlay
            node={selectedBrushDisplayNode}
            onCommitMeshTopology={onCommitMeshTopology}
            onPreviewBrushData={onPreviewBrushData}
            onUpdateBrushData={onUpdateBrushData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "extrude" && selectedMeshDisplayNode ? (
          <MeshExtrudeOverlay
            node={selectedMeshDisplayNode}
            onUpdateMeshData={onUpdateMeshData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && selectedBrushDisplayNode && !arcState && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
          <BrushEditOverlay
            cameraControlsRef={cameraControlsRef}
            handles={brushEditHandles}
            meshEditMode={meshEditMode}
            node={selectedBrushDisplayNode}
            onDragStateChange={handleTransformDragStateChange}
            onCommitTransformAction={handleCommitMeshEditAction}
            onPreviewBrushData={handlePreviewBrushData}
            shouldTreatAsClick={shouldTreatAsSelectionClick}
            onUpdateBrushData={handleUpdateBrushData}
            selectedHandleIds={brushEditHandleIds}
            setSelectedHandleIds={setBrushEditHandleIds}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && selectedMeshDisplayNode && !arcState && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
          <MeshEditOverlay
            cameraControlsRef={cameraControlsRef}
            handles={meshEditHandles}
            meshEditMode={meshEditMode}
            node={selectedMeshDisplayNode}
            onDragStateChange={handleTransformDragStateChange}
            onCommitTransformAction={handleCommitMeshEditAction}
            onPreviewMeshData={handlePreviewMeshData}
            shouldTreatAsClick={shouldTreatAsSelectionClick}
            onUpdateMeshData={handleUpdateMeshData}
            selectedHandleIds={meshEditSelectionIds}
            setSelectedHandleIds={setMeshEditSelectionIds}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport ? (
          <ObjectTransformGizmo
            activeToolId={activeToolId}
            cameraControlsRef={cameraControlsRef}
            onDragStateChange={handleTransformDragStateChange}
            onPreviewEntityTransform={onPreviewEntityTransform}
            onPreviewNodeTransform={onPreviewNodeTransform}
            onUpdateEntityTransform={onUpdateEntityTransform}
            onUpdateNodeTransform={onUpdateNodeTransform}
            selectedEntity={selectedEntity}
            selectedNode={selectedNode}
            selectedEntityWorldTransform={selectedEntityWorldTransform}
            selectedNodeWorldTransform={selectedNodeWorldTransform}
            selectedNodeIds={selectedNodeIds}
            selectedNodes={selectedNodes}
            selectedWorldNodes={selectedDisplayNodes}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
      </Canvas>

      {editorInteractionEnabled && (arcState || bevelState || extrudeState || sculptState || instanceBrushState?.dragging || faceCutState || faceSubdivisionState) ? (
        <div className="pointer-events-none absolute inset-0 z-20 cursor-crosshair" />
      ) : null}

      {editorInteractionEnabled && marqueeRect ? (
        <div
          className="pointer-events-none absolute rounded-sm bg-emerald-400/12 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.75)]"
          style={{
            height: marqueeRect.height,
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width
          }}
        />
      ) : null}
    </div>
  );
}

function emptyEditableMesh(): EditableMesh {
  return { faces: [], halfEdges: [], vertices: [] };
}

function createBrushRingBasis(normal: Vec3) {
  const axis = lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0);
  const reference = Math.abs(axis.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, axis));
  const v = normalizeVec3(crossVec3(axis, u));

  return { u, v };
}

function SelectedPathPointOverlay({
  pathId,
  point,
  visible
}: {
  pathId: string;
  point?: Vec3;
  visible: boolean;
}) {
  if (!visible || !point) {
    return null;
  }

  return (
    <group name={`path-selection:${pathId}`}>
      <mesh position={[point.x, point.y, point.z]} raycast={() => null}>
        <sphereGeometry args={[0.18, 14, 14]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.95} />
      </mesh>
      <mesh position={[point.x, point.y, point.z]} raycast={() => null}>
        <sphereGeometry args={[0.28, 14, 14]} />
        <meshBasicMaterial color="#fdba74" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}
