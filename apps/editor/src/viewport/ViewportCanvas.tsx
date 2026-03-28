import { Canvas, useThree, type RootState } from "@react-three/fiber";
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
  sculptEditableMeshSamples,
  subdivideEditableMeshFace
} from "@ggez/geometry-kernel";
import {
  applyWebHammerWorldSettings,
  clearWebHammerWorldSettings
} from "@ggez/three-runtime";
import {
  addVec3,
  averageVec3,
  crossVec3,
  type GeometryNode,
  isBrushNode,
  isMeshNode,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  snapValue,
  toTuple,
  subVec3,
  vec3,
  type ScenePathDefinition,
  type EditableMesh,
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
import { BrushEditOverlay, MeshEditOverlay } from "@/viewport/components/EditOverlays";
import { EditorCameraRig } from "@/viewport/components/EditorCameraRig";
import { BrushExtrudeOverlay, ExtrudeAxisGuide, MeshExtrudeOverlay } from "@/viewport/components/ExtrudeOverlays";
import { MeshCutOverlay } from "@/viewport/components/MeshCutOverlay";
import { MeshSubdivideOverlay } from "@/viewport/components/MeshSubdivideOverlay";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";
import { ObjectTransformGizmo } from "@/viewport/components/ObjectTransformGizmo";
import { ScenePreview } from "@/viewport/components/ScenePreview";
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
  createScreenRect,
  intersectsSelectionRect,
  projectLocalPointToScreen,
  rectContainsPoint
} from "@/viewport/utils/screen-space";
import { composeTransformRotation, rebaseTransformPivot } from "@/viewport/utils/geometry";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import { useEffect, useMemo, useRef, useState, type PointerEventHandler } from "react";
import { BufferGeometry, Camera, Color, Float32BufferAttribute, Matrix4, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
import type {
  ArcState,
  BevelState,
  BrushCreateState,
  ExtrudeGestureState,
  FaceSubdivisionState,
  LastMeshEditAction,
  MarqueeState,
  MeshEditToolbarAction,
  ViewportCanvasProps
} from "@/viewport/types";

type SculptBrushMode = "deflate" | "inflate";

type SculptBrushHit = {
  normal: Vec3;
  point: Vec3;
};

type SculptBrushState = {
  beforeMesh?: EditableMesh;
  dragging: boolean;
  hovered?: SculptBrushHit;
  lastPoint?: Vec3;
  mode: SculptBrushMode;
  modified: boolean;
  nodeId: string;
  previewMesh?: EditableMesh;
  radius: number;
  strokeVertexNormals?: ReadonlyMap<string, Vec3>;
  strength: number;
};

function ViewportWorldSettings({ renderMode, sceneSettings }: Pick<ViewportCanvasProps, "renderMode" | "sceneSettings">) {
  const { scene } = useThree();

  useEffect(() => {
    if (renderMode !== "lit") {
      clearWebHammerWorldSettings(scene);
      scene.background = new Color("#091018");
      scene.environment = null;
      return;
    }

    scene.background = new Color(sceneSettings.world.fogColor);

    void applyWebHammerWorldSettings(scene, { settings: sceneSettings });

    return () => {
      clearWebHammerWorldSettings(scene);
      scene.background = null;
      scene.environment = null;
    };
  }, [renderMode, scene, sceneSettings]);

  return null;
}

export function ViewportCanvas({
  activeBrushShape,
  aiModelPlacementArmed,
  activeToolId,
  dprScale,
  hiddenSceneItemIds = [],
  isActiveViewport,
  meshEditMode,
  meshEditToolbarAction,
  sculptBrushRadius,
  sculptBrushStrength,
  onActivateViewport,
  onClearSelection,
  onCommitMeshTopology,
  onFocusNode,
  onPlaceAsset,
  onPlaceAiModelPlaceholder,
  onPlaceBrush,
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
  const aiPlacementClickOriginRef = useRef<Vector2 | null>(null);
  const brushClickOriginRef = useRef<Vector2 | null>(null);
  const marqueeOriginRef = useRef<Vector2 | null>(null);
  const pathToolClickOriginRef = useRef<Vector2 | null>(null);
  const pointerPositionRef = useRef<Vector2 | null>(null);
  const selectionClickOriginRef = useRef<Vector2 | null>(null);
  const viewportRootRef = useRef<HTMLDivElement | null>(null);
  const meshObjectsRef = useRef(new Map<string, Object3D>());
  const raycasterRef = useRef(new Raycaster());
  const [brushEditHandleIds, setBrushEditHandleIds] = useState<string[]>([]);
  const [brushCreateState, setBrushCreateState] = useState<BrushCreateState | null>(null);
  const [arcState, setArcState] = useState<ArcState | null>(null);
  const [bevelState, setBevelState] = useState<BevelState | null>(null);
  const [extrudeState, setExtrudeState] = useState<ExtrudeGestureState | null>(null);
  const [faceCutState, setFaceCutState] = useState<{ faceId: string } | null>(null);
  const [faceSubdivisionState, setFaceSubdivisionState] = useState<FaceSubdivisionState | null>(null);
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
  const [sculptState, setSculptState] = useState<SculptBrushState | null>(null);
  const snapSize = resolveViewportSnapSize(viewport);
  const editorInteractionEnabled = physicsPlayback === "stopped";
  const [meshEditSelectionIds, setMeshEditSelectionIds] = useState<string[]>([]);
  const [transformDragging, setTransformDragging] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const extrudeStateRef = useRef<ExtrudeGestureState | null>(null);
  const pathPreviewPathsRef = useRef<ScenePathDefinition[] | null>(null);
  const sculptStateRef = useRef<SculptBrushState | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const sculptStrokeFrameRef = useRef<number | null>(null);
  const pendingPreviewUpdateRef = useRef<{
    bounds: DOMRect;
    clientX: number;
    clientY: number;
    kind: "arc" | "bevel" | "extrude" | "sculpt";
  } | null>(null);
  const lastMeshEditActionRef = useRef<LastMeshEditAction | null>(null);
  const previewBrushDataRef = useRef(onPreviewBrushData);
  const transformDraggingRef = useRef(false);
  const suppressSelectionAfterTransformRef = useRef(false);
  extrudeStateRef.current = extrudeState;
  pathPreviewPathsRef.current = pathPreviewPaths;
  sculptStateRef.current = sculptState;
  previewBrushDataRef.current = onPreviewBrushData;

  const handleTransformDragStateChange = (dragging: boolean) => {
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
  };

  const handleSceneSelectNodes = (nodeIds: string[]) => {
    if (transformDraggingRef.current || suppressSelectionAfterTransformRef.current) {
      return;
    }

    onSelectNodes(nodeIds);
  };

  useEffect(() => {
    return () => {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }

      if (sculptStrokeFrameRef.current !== null) {
        cancelAnimationFrame(sculptStrokeFrameRef.current);
      }
    };
  }, []);

  const stopSculptStrokeLoop = () => {
    if (sculptStrokeFrameRef.current !== null) {
      cancelAnimationFrame(sculptStrokeFrameRef.current);
      sculptStrokeFrameRef.current = null;
    }
  };

  const queueSculptStrokeFrame = () => {
    if (sculptStrokeFrameRef.current !== null) {
      return;
    }

    sculptStrokeFrameRef.current = requestAnimationFrame(() => {
      sculptStrokeFrameRef.current = null;

      const currentState = sculptStateRef.current;
      const bounds = viewportRootRef.current?.getBoundingClientRect();
      const pointer = pointerPositionRef.current;

      if (!currentState?.dragging || !bounds || !pointer) {
        return;
      }

      updateSculptStroke(bounds, pointer.x + bounds.left, pointer.y + bounds.top);
      queueSculptStrokeFrame();
    });
  };

  useEffect(() => {
    const currentExtrudeState = extrudeStateRef.current;

    if (currentExtrudeState?.kind === "brush") {
      previewBrushDataRef.current(currentExtrudeState.nodeId, currentExtrudeState.baseBrush);
    }

    extrudeStateRef.current = null;
    sculptStateRef.current = null;
    setMeshEditSelectionIds([]);
    setBrushEditHandleIds([]);
    setArcState(null);
    setBevelState(null);
    setFaceCutState(null);
    setFaceSubdivisionState(null);
    setExtrudeState(null);
    setPathAddSessionId(null);
    setPathDragState(null);
    pathPreviewPathsRef.current = null;
    setPathPreviewPaths(null);
    setSelectedPathPointIndex(null);
    setSculptState(null);
    setTransformDragging(false);
  }, [activeToolId, meshEditMode, selectedNode?.id, selectedNode?.kind]);

  useEffect(() => {
    if (activeToolId !== "brush") {
      setBrushCreateState(null);
    }
  }, [activeToolId]);

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
    sculptStateRef.current = null;
    setSculptState(null);
    setMarquee(null);
    setTransformDragging(false);
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
  const brushEditHandles = useMemo(
    () =>
      activeToolId === "mesh-edit" && selectedBrushNode
        ? createBrushEditHandles(selectedBrushNode.data, meshEditMode)
        : [],
    [activeToolId, meshEditMode, selectedBrushNode?.data]
  );
  const meshEditHandles = useMemo(
    () =>
      activeToolId === "mesh-edit" && selectedMeshNode
        ? createMeshEditHandles(selectedMeshNode.data, meshEditMode)
        : [],
    [activeToolId, meshEditMode, selectedMeshNode?.data]
  );
  const editableMeshSource = useMemo(
    () =>
      activeToolId === "mesh-edit" && selectedBrushNode
        ? convertBrushToEditableMesh(selectedBrushNode.data)
        : activeToolId === "mesh-edit" && selectedMeshNode
          ? selectedMeshNode.data
          : undefined,
    [activeToolId, selectedBrushNode?.data, selectedMeshNode?.data]
  );
  const editableMeshHandles = useMemo(
    () =>
      activeToolId === "mesh-edit" && editableMeshSource
        ? selectedMeshNode
          ? meshEditHandles
          : createMeshEditHandles(editableMeshSource, meshEditMode)
        : [],
    [activeToolId, editableMeshSource, meshEditMode, meshEditHandles, selectedMeshNode]
  );
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
      selectedDisplayNode
    );
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

  const resolveSelectedMeshSurfaceHit = (bounds: DOMRect, clientX: number, clientY: number): SculptBrushHit | undefined => {
    if (!cameraRef.current || !selectedMeshNode) {
      return undefined;
    }

    const selectedObject = meshObjectsRef.current.get(selectedMeshNode.id);

    if (!selectedObject) {
      return undefined;
    }

    const ndc = new Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -(((clientY - bounds.top) / bounds.height) * 2 - 1)
    );

    raycasterRef.current.setFromCamera(ndc, cameraRef.current);
    const hit = raycasterRef.current.intersectObject(selectedObject, true)[0];

    if (!hit) {
      return undefined;
    }

    const localPoint = selectedObject.worldToLocal(hit.point.clone());
    const faceNormal = hit.face?.normal?.clone() ?? new Vector3(0, 1, 0);
    const worldNormal = faceNormal.transformDirection(hit.object.matrixWorld);
    const localNormal = worldNormal.transformDirection(new Matrix4().copy(selectedObject.matrixWorld).invert());

    const normal = vec3(localNormal.x, localNormal.y, localNormal.z);

    return {
      normal: lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0),
      point: vec3(localPoint.x, localPoint.y, localPoint.z)
    };
  };

  const applySculptHit = (state: SculptBrushState, hit: SculptBrushHit) => {
    const sourceMesh = state.previewMesh ?? state.beforeMesh;

    if (!sourceMesh) {
      return state;
    }

    const signedStrength = state.mode === "inflate" ? state.strength : -state.strength;
    const spacing = Math.max(0.05, state.radius * 0.25);
    const previousPoint = state.lastPoint ?? hit.point;
    const delta = subVec3(hit.point, previousPoint);
    const distance = lengthVec3(delta);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    const samples = Array.from({ length: steps }, (_, index) => {
      const step = index + 1;
      const t = distance <= 0.000001 ? 1 : step / steps;
      const point = vec3(
        previousPoint.x + delta.x * t,
        previousPoint.y + delta.y * t,
        previousPoint.z + delta.z * t
      );
      const normal = normalizeVec3(
        vec3(
          (state.hovered?.normal.x ?? hit.normal.x) * (1 - t) + hit.normal.x * t,
          (state.hovered?.normal.y ?? hit.normal.y) * (1 - t) + hit.normal.y * t,
          (state.hovered?.normal.z ?? hit.normal.z) * (1 - t) + hit.normal.z * t
        )
      );

      return {
        normal,
        point
      };
    });
    const nextMesh = sculptEditableMeshSamples(
      sourceMesh,
      samples,
      state.radius,
      signedStrength,
      0.0001,
      state.strokeVertexNormals
    );

    return {
      ...state,
      hovered: hit,
      lastPoint: hit.point,
      modified: true,
      previewMesh: nextMesh
    };
  };

  const beginSculptStroke = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (!selectedMeshNode || !sculptStateRef.current) {
      return false;
    }

    const hit = resolveSelectedMeshSurfaceHit(bounds, clientX, clientY);

    if (!hit) {
      return false;
    }

    const initialState: SculptBrushState = {
      ...sculptStateRef.current,
      beforeMesh: selectedMeshNode.data,
      dragging: true,
      hovered: hit,
      lastPoint: hit.point,
      modified: false,
      nodeId: selectedMeshNode.id,
      previewMesh: undefined,
      strokeVertexNormals: buildEditableMeshVertexNormals(selectedMeshNode.data)
    };
    const nextState = applySculptHit(initialState, hit);

    sculptStateRef.current = nextState;
    setSculptState(nextState);
    setTransformDragging(true);
    return true;
  };

  const updateSculptStroke = (bounds: DOMRect, clientX: number, clientY: number) => {
    const currentState = sculptStateRef.current;

    if (!currentState) {
      return;
    }

    const hit = resolveSelectedMeshSurfaceHit(bounds, clientX, clientY);

    if (!hit) {
      return;
    }

    const nextState = currentState.dragging
      ? applySculptHit(currentState, hit)
      : {
          ...currentState,
          hovered: hit
        };

    sculptStateRef.current = nextState;
    setSculptState(nextState);
  };

  const cancelSculptStroke = (exitMode = false) => {
    const currentState = sculptStateRef.current;

    if (!currentState) {
      return;
    }

    const nextState = exitMode
      ? null
      : {
          ...currentState,
          beforeMesh: undefined,
          dragging: false,
          lastPoint: undefined,
          modified: false,
          previewMesh: undefined,
          strokeVertexNormals: undefined
        };

    sculptStateRef.current = nextState;
    setSculptState(nextState);
    setTransformDragging(false);
  };

  const commitSculptStroke = () => {
    const currentState = sculptStateRef.current;

    if (!currentState) {
      return;
    }

    if (currentState.modified && currentState.beforeMesh && currentState.previewMesh) {
      onUpdateMeshData(currentState.nodeId, currentState.previewMesh, currentState.beforeMesh);
    }

    const nextState = {
      ...currentState,
      beforeMesh: undefined,
      dragging: false,
      lastPoint: undefined,
      modified: false,
      previewMesh: undefined,
      strokeVertexNormals: undefined
    };

    sculptStateRef.current = nextState;
    setSculptState(nextState);
    setTransformDragging(false);
  };

  const startSculptMode = (mode: SculptBrushMode) => {
    if (!selectedMeshNode) {
      return;
    }

    const currentState = sculptStateRef.current;

    if (currentState?.dragging) {
      return;
    }

    if (currentState?.mode === mode && currentState.nodeId === selectedMeshNode.id) {
      sculptStateRef.current = null;
      setSculptState(null);
      return;
    }

    const nextState: SculptBrushState = {
      dragging: false,
      hovered: currentState?.nodeId === selectedMeshNode.id ? currentState.hovered : undefined,
      mode,
      modified: false,
      nodeId: selectedMeshNode.id,
      radius: sculptBrushRadius,
      strength: sculptBrushStrength
    };

    sculptStateRef.current = nextState;
    setSculptState(nextState);

    const bounds = viewportRootRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;

    if (bounds && pointer) {
      updateSculptStroke(bounds, pointer.x + bounds.left, pointer.y + bounds.top);
    }
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

  const updateSelectedNodePivot = (nextPivot?: { x: number; y: number; z: number }) => {
    if (!selectedNode) {
      return;
    }

    onUpdateNodeTransform(
      selectedNode.id,
      rebaseTransformPivot(selectedNode.transform, nextPivot ? vec3(nextPivot.x, nextPivot.y, nextPivot.z) : undefined),
      selectedNode.transform
    );
  };

  const startFaceCutOperation = () => {
    if (meshEditMode !== "face" || !editableMeshSource) {
      return;
    }

    const selectedFaces = resolveSelectedEditableMeshFaceIds();

    if (selectedFaces.length !== 1) {
      return;
    }

    setFaceCutState({
      faceId: selectedFaces[0]
    });
  };

  const startFaceSubdivisionOperation = () => {
    if (meshEditMode !== "face" || !editableMeshSource) {
      return;
    }

    const selectedFaces = resolveSelectedEditableMeshFaceIds();

    if (selectedFaces.length !== 1) {
      return;
    }

    setFaceSubdivisionState({
      baseMesh: structuredClone(editableMeshSource),
      cuts: 1,
      faceId: selectedFaces[0]
    });
  };

  const repeatLastMeshEditAction = () => {
    const action = lastMeshEditActionRef.current;

    if (!action || !selectedNode) {
      return;
    }

    if (action.kind === "extrude") {
      if (action.handleKind === "face") {
        const selectedFaces = resolveSelectedEditableMeshFaceIds();

        if (selectedFaces.length === 0) {
          return;
        }

        if (selectedBrushNode) {
          const handle = createBrushExtrudeHandles(selectedBrushNode.data).find(
            (candidate) => candidate.kind === "face" && candidate.id === selectedFaces[0]
          );

          if (!handle) {
            return;
          }

          const nextBrush = extrudeBrushHandle(selectedBrushNode.data, handle, action.amount);

          if (nextBrush) {
            onUpdateBrushData(selectedBrushNode.id, nextBrush, selectedBrushNode.data);
          }
          return;
        }

        if (selectedMeshNode) {
          const nextMesh =
            selectedFaces.length === 1
              ? extrudeEditableMeshFace(selectedMeshNode.data, selectedFaces[0], action.amount)
              : extrudeEditableMeshFaces(selectedMeshNode.data, selectedFaces, action.amount);

          if (nextMesh) {
            onUpdateMeshData(selectedMeshNode.id, nextMesh, selectedMeshNode.data);
          }
        }
        return;
      }

      const selectedEdges = resolveSelectedEditableMeshEdgePairs();

      if (selectedEdges.length !== 1) {
        return;
      }

      const direction = action.direction ?? vec3(0, 0, 0);

      if (selectedMeshNode) {
        const nextMesh = extrudeEditableMeshEdge(selectedMeshNode.data, selectedEdges[0], action.amount, direction);

        if (nextMesh) {
          onUpdateMeshData(selectedMeshNode.id, nextMesh, selectedMeshNode.data);
        }
      } else if (editableMeshSource) {
        const nextMesh = extrudeEditableMeshEdge(editableMeshSource, selectedEdges[0], action.amount, direction);

        if (nextMesh) {
          commitMeshTopology(nextMesh);
        }
      }
      return;
    }

    if (meshEditMode !== action.mode) {
      return;
    }

    const baselinePosition = selectedNode.transform.pivot
      ?? (selectedMeshNode
        ? computeMeshEditSelectionCenter(meshEditHandles, meshEditSelectionIds)
        : selectedBrushNode
          ? computeBrushEditSelectionCenter(brushEditHandles, brushEditHandleIds)
          : vec3(0, 0, 0));
    const baselineRotation =
      selectedMeshNode
        ? computeMeshEditSelectionOrientation(meshEditHandles, meshEditSelectionIds, meshEditMode)
        : selectedBrushNode
          ? computeBrushEditSelectionOrientation(brushEditHandles, brushEditHandleIds, meshEditMode)
          : undefined;
    const baselineTransform = {
      position: vec3(baselinePosition.x, baselinePosition.y, baselinePosition.z),
      rotation: baselineRotation ?? vec3(0, 0, 0),
      scale: vec3(1, 1, 1)
    };
    const currentTransform = {
      position: vec3(
        baselinePosition.x + action.translation.x,
        baselinePosition.y + action.translation.y,
        baselinePosition.z + action.translation.z
      ),
      rotation: composeTransformRotation(
        baselineTransform.rotation,
        action.rotationDelta
      ),
      scale: vec3(action.scaleFactor.x, action.scaleFactor.y, action.scaleFactor.z)
    };

    if (selectedMeshNode && meshEditSelectionIds.length > 0) {
      const nextMesh = applyMeshEditTransform(
        selectedMeshNode.data,
        meshEditMode,
        meshEditSelectionIds,
        baselineTransform,
        currentTransform
      );
      onUpdateMeshData(selectedMeshNode.id, nextMesh, selectedMeshNode.data);
      return;
    }

    if (selectedBrushNode && brushEditHandleIds.length > 0) {
      const nextBrush = applyBrushEditTransform(
        selectedBrushNode.data,
        brushEditHandles,
        brushEditHandleIds,
        baselineTransform,
        currentTransform,
        snapSize
      );

      if (nextBrush) {
        onUpdateBrushData(selectedBrushNode.id, nextBrush, selectedBrushNode.data);
      }
    }
  };

  const commitMeshTopology = (mesh: EditableMesh | undefined) => {
    if (!selectedNode || !mesh) {
      return;
    }

    onCommitMeshTopology(selectedNode.id, mesh);
    clearSubobjectSelection();
    setArcState(null);
    setBevelState(null);
    setFaceSubdivisionState(null);
  };

  const startArcOperation = () => {
    if (!editableMeshSource || !cameraRef.current || !selectedNode || !pointerPositionRef.current) {
      return;
    }

    const selectedEdges = resolveSelectedEditableMeshEdgePairs();

    if (selectedEdges.length === 0) {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const selectedEdgeHandles = selectedEdges.flatMap((selectedEdge) => {
      const handle = editableMeshHandles.find(
        (candidate) =>
          candidate.vertexIds.length === 2 &&
          makeUndirectedPairKey(candidate.vertexIds as [string, string]) === makeUndirectedPairKey(selectedEdge)
      );

      return handle?.points && handle.points.length === 2
        ? [handle as typeof handle & { points: [Vec3, Vec3] }]
        : [];
    });

    if (selectedEdgeHandles.length !== selectedEdges.length) {
      return;
    }

    const midpoints = selectedEdgeHandles.map((handle) => averageVec3(handle.points!));
    const anchor = averageVec3(midpoints);
    const averageAxis = normalizeVec3(
      averageVec3(selectedEdgeHandles.map((handle) => normalizeVec3(subVec3(handle.points![1], handle.points![0]))))
    );
    const cameraDirection = cameraRef.current.getWorldDirection(new Vector3());
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(
      cameraDirection.clone().normalize(),
      new Vector3(anchor.x, anchor.y, anchor.z)
    );
    const startPoint =
      projectPointerToThreePlane(
        pointerPositionRef.current.x + bounds.left,
        pointerPositionRef.current.y + bounds.top,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        dragPlane
      ) ?? new Vector3(anchor.x, anchor.y, anchor.z);
    const worldUp = vec3(0, 1, 0);
    const yDragDirection = rejectVec3FromAxis(
      worldUp,
      vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z)
    );
    const fallbackDirection = normalizeVec3(
      crossVec3(
        vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z),
        vec3LengthSquared(averageAxis) > 0.000001 ? averageAxis : vec3(0, 1, 0)
      )
    );

    setArcState({
      baseMesh: structuredClone(editableMeshSource),
      dragDirection:
        vec3LengthSquared(yDragDirection) > 0.000001 ? normalizeVec3(yDragDirection) : fallbackDirection,
      dragPlane,
      edges: selectedEdges,
      offset: 0,
      previewMesh: structuredClone(editableMeshSource),
      segments: 4,
      startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
    });
  };

  const startBevelOperation = () => {
    if (!editableMeshSource || !cameraRef.current || !selectedNode || !pointerPositionRef.current) {
      return;
    }

    const selectedEdges = resolveSelectedEditableMeshEdgePairs();

    if (selectedEdges.length === 0) {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const selectedEdgeHandles = selectedEdges.flatMap((selectedEdge) => {
      const handle = editableMeshHandles.find(
        (candidate) =>
          candidate.vertexIds.length === 2 &&
          makeUndirectedPairKey(candidate.vertexIds as [string, string]) === makeUndirectedPairKey(selectedEdge)
      );

      return handle?.points && handle.points.length === 2
        ? [handle as typeof handle & { points: [Vec3, Vec3] }]
        : [];
    });

    if (selectedEdgeHandles.length !== selectedEdges.length) {
      return;
    }

    const midpoints = selectedEdgeHandles.map((handle) => averageVec3(handle.points!));
    const anchor = averageVec3(midpoints);
    const axes = selectedEdgeHandles.map((handle) => normalizeVec3(subVec3(handle.points![1], handle.points![0])));
    const faceHandles = createMeshEditHandles(editableMeshSource, "face");
    const faceDirections = selectedEdgeHandles
      .flatMap((edgeHandle) => {
        const midpoint = averageVec3(edgeHandle.points!);
        const axis = normalizeVec3(subVec3(edgeHandle.points![1], edgeHandle.points![0]));

        return faceHandles
          .filter((handle) => edgeHandle.vertexIds.every((vertexId) => handle.vertexIds.includes(vertexId)))
          .map((handle) => rejectVec3FromAxis(subVec3(handle.position, midpoint), axis));
      })
      .filter((direction) => vec3LengthSquared(direction) > 0.000001);
    const averageAxis = normalizeVec3(averageVec3(axes));
    const cameraDirection = cameraRef.current.getWorldDirection(new Vector3());
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(
      cameraDirection.clone().normalize(),
      new Vector3(anchor.x, anchor.y, anchor.z)
    );
    const startPoint =
      projectPointerToThreePlane(
        pointerPositionRef.current.x + bounds.left,
        pointerPositionRef.current.y + bounds.top,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        dragPlane
      ) ?? new Vector3(anchor.x, anchor.y, anchor.z);
    const averagedFaceDirection = rejectVec3FromAxis(
      normalizeVec3(averageVec3(faceDirections)),
      vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z)
    );
    const fallbackDirection = normalizeVec3(
      crossVec3(
        vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z),
        vec3LengthSquared(averageAxis) > 0.000001 ? averageAxis : vec3(0, 1, 0)
      )
    );

    setBevelState({
      baseMesh: structuredClone(editableMeshSource),
      dragDirection:
        vec3LengthSquared(averagedFaceDirection) > 0.000001 ? averagedFaceDirection : fallbackDirection,
      dragPlane,
      edges: selectedEdges,
      profile: "flat",
      previewMesh: structuredClone(editableMeshSource),
      startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
      steps: 1,
      width: 0
    });
  };

  const startExtrudeOperation = () => {
    if (!cameraRef.current || !selectedNode || !pointerPositionRef.current) {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    if (selectedBrushNode) {
      if (meshEditMode === "vertex" || brushEditHandleIds.length !== 1) {
        return;
      }

      const handle = createBrushExtrudeHandles(selectedBrushNode.data).find(
        (candidate) => candidate.id === brushEditHandleIds[0]
      );

      if (!handle?.normal) {
        return;
      }

      if (handle.kind === "edge") {
        const baseMesh = convertBrushToEditableMesh(selectedBrushNode.data);

        if (!baseMesh) {
          return;
        }

        const editableEdgePair = findMatchingMeshEdgePair(createMeshEditHandles(baseMesh, "edge"), handle);

        if (!editableEdgePair) {
          return;
        }

        const meshHandle = createMeshExtrudeHandles(baseMesh).find(
          (candidate) =>
            candidate.kind === "edge" &&
            makeUndirectedPairKey(candidate.vertexIds as [string, string]) === makeUndirectedPairKey(editableEdgePair)
        );

        if (!meshHandle) {
          return;
        }

        const anchor = resolveExtrudeAnchor(meshHandle.position, meshHandle.normal, meshHandle.kind);
        const dragPlane = createBrushCreateDragPlane(cameraRef.current, meshHandle.normal, anchor);
        const startPoint =
          projectPointerToThreePlane(
            pointerPositionRef.current.x + bounds.left,
            pointerPositionRef.current.y + bounds.top,
            bounds,
            cameraRef.current,
            raycasterRef.current,
            dragPlane
          ) ?? new Vector3(anchor.x, anchor.y, anchor.z);

        setExtrudeState({
          amount: 0,
          amountSign: 1,
          baseBrush: structuredClone(selectedBrushNode.data),
          baseMesh: structuredClone(baseMesh),
          dragPlane,
          handle: structuredClone(meshHandle),
          kind: "brush-mesh",
          nodeId: selectedBrushNode.id,
          normal: vec3(meshHandle.normal.x, meshHandle.normal.y, meshHandle.normal.z),
          previewMesh: structuredClone(baseMesh),
          startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
        });
        return;
      }

      const interactionNormal = resolveExtrudeInteractionNormal(cameraRef.current, handle.normal, handle.kind);
      const amountSign = resolveExtrudeAmountSign(interactionNormal, handle.normal, handle.kind);
      const anchor = resolveExtrudeAnchor(handle.position, interactionNormal, handle.kind);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, interactionNormal, anchor);
      const startPoint =
        projectPointerToThreePlane(
          pointerPositionRef.current.x + bounds.left,
          pointerPositionRef.current.y + bounds.top,
          bounds,
          cameraRef.current,
          raycasterRef.current,
          dragPlane
        ) ?? new Vector3(anchor.x, anchor.y, anchor.z);

      setExtrudeState({
        amount: 0,
        amountSign,
        baseBrush: structuredClone(selectedBrushNode.data),
        dragPlane,
        handle: structuredClone(handle),
        kind: "brush",
        nodeId: selectedBrushNode.id,
        normal: vec3(interactionNormal.x, interactionNormal.y, interactionNormal.z),
        previewBrush: structuredClone(selectedBrushNode.data),
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      });
      return;
    }

    if (selectedMeshNode) {
      if (meshEditSelectionIds.length === 0) {
        return;
      }

      const selectedFaceIds = meshEditMode === "face" ? resolveSelectedEditableMeshFaceIds() : [];
      const handles = createMeshExtrudeHandles(selectedMeshNode.data);
      const handle =
        meshEditMode === "face"
          ? handles.find((candidate) => candidate.kind === "face" && candidate.id === selectedFaceIds[0])
          : handles.find((candidate) => candidate.id === meshEditSelectionIds[0]);

      if (!handle) {
        return;
      }

      const resolvedNormal =
        meshEditMode === "face" && selectedFaceIds.length > 1
          ? normalizeVec3(
              averageVec3(
                handles
                  .filter((candidate) => candidate.kind === "face" && selectedFaceIds.includes(candidate.id))
                  .map((candidate) => candidate.normal)
              )
            )
          : handle.normal;
      const resolvedAnchor =
        meshEditMode === "face" && selectedFaceIds.length > 1
          ? averageVec3(
              handles
                .filter((candidate) => candidate.kind === "face" && selectedFaceIds.includes(candidate.id))
                .map((candidate) => candidate.position)
            )
          : handle.position;
      const baseNormal = vec3LengthSquared(resolvedNormal) > 0.000001 ? resolvedNormal : handle.normal;
      const normal = resolveExtrudeInteractionNormal(cameraRef.current, baseNormal, handle.kind);
      const amountSign = resolveExtrudeAmountSign(normal, handle.normal, handle.kind);

      const anchor = resolveExtrudeAnchor(resolvedAnchor, normal, handle.kind);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, normal, anchor);
      const startPoint =
        projectPointerToThreePlane(
          pointerPositionRef.current.x + bounds.left,
          pointerPositionRef.current.y + bounds.top,
          bounds,
          cameraRef.current,
          raycasterRef.current,
          dragPlane
        ) ?? new Vector3(anchor.x, anchor.y, anchor.z);

      setExtrudeState({
        amount: 0,
        amountSign,
        baseMesh: structuredClone(selectedMeshNode.data),
        dragPlane,
        faceIds: meshEditMode === "face" ? selectedFaceIds : undefined,
        handle: structuredClone(handle),
        kind: "mesh",
        nodeId: selectedMeshNode.id,
        normal: vec3(normal.x, normal.y, normal.z),
        previewMesh: structuredClone(selectedMeshNode.data),
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      });
    }
  };

  const runMeshEditToolbarAction = (action: MeshEditToolbarAction) => {
    if (
      activeToolId !== "mesh-edit" ||
      !selectedNode ||
      arcState ||
      bevelState ||
      extrudeState ||
      faceCutState ||
      faceSubdivisionState ||
      sculptState?.dragging
    ) {
      return;
    }

    if (sculptState && action !== "inflate" && action !== "deflate") {
      sculptStateRef.current = null;
      setSculptState(null);
    }

    switch (action) {
      case "arc": {
        if (meshEditMode === "edge") {
          startArcOperation();
        }
        return;
      }
      case "bevel": {
        if (meshEditMode === "edge") {
          startBevelOperation();
        }
        return;
      }
      case "cut": {
        if (meshEditMode === "face") {
          startFaceCutOperation();
          return;
        }

        if (meshEditMode === "edge") {
          const selectedEdges = resolveSelectedEditableMeshEdgePairs();

          if (selectedEdges.length === 2) {
            commitMeshTopology(cutEditableMeshBetweenEdges(editableMeshSource ?? emptyEditableMesh(), selectedEdges));
          }
        }
        return;
      }
      case "delete": {
        if (meshEditMode === "face") {
          const selectedFaces = resolveSelectedEditableMeshFaceIds();

          if (selectedFaces.length > 0) {
            commitMeshTopology(deleteEditableMeshFaces(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
          }
        }
        return;
      }
      case "extrude": {
        if (meshEditMode !== "vertex") {
          startExtrudeOperation();
        }
        return;
      }
      case "fill-face": {
        if (meshEditMode === "edge") {
          const selectedEdges = resolveSelectedEditableMeshEdgePairs();

          if (selectedEdges.length >= 3) {
            commitMeshTopology(fillEditableMeshFaceFromEdges(editableMeshSource ?? emptyEditableMesh(), selectedEdges));
          }
          return;
        }

        if (meshEditMode === "vertex") {
          const selectedVertices = resolveSelectedEditableMeshVertexIds();

          if (selectedVertices.length >= 3) {
            commitMeshTopology(fillEditableMeshFaceFromVertices(editableMeshSource ?? emptyEditableMesh(), selectedVertices));
          }
        }
        return;
      }
      case "inflate": {
        startSculptMode("inflate");
        return;
      }
      case "invert-normals": {
        if (meshEditMode === "face") {
          const selectedFaces = resolveSelectedEditableMeshFaceIds();

          if (selectedFaces.length > 0) {
            commitMeshTopology(invertEditableMeshNormals(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
            return;
          }
        }

        commitMeshTopology(invertEditableMeshNormals(editableMeshSource ?? emptyEditableMesh()));
        return;
      }
      case "merge": {
        if (meshEditMode === "face") {
          const selectedFaces = resolveSelectedEditableMeshFaceIds();

          if (selectedFaces.length > 1) {
            commitMeshTopology(mergeEditableMeshFaces(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
          }
          return;
        }

        if (meshEditMode === "edge") {
          const selectedEdges = resolveSelectedEditableMeshEdgePairs();

          if (selectedEdges.length > 0) {
            commitMeshTopology(mergeEditableMeshEdges(editableMeshSource ?? emptyEditableMesh(), selectedEdges));
          }
          return;
        }

        if (meshEditMode === "vertex") {
          const selectedVertices = resolveSelectedEditableMeshVertexIds();

          if (selectedVertices.length > 1) {
            commitMeshTopology(mergeEditableMeshVertices(editableMeshSource ?? emptyEditableMesh(), selectedVertices));
          }
        }
        return;
      }
      case "deflate": {
        startSculptMode("deflate");
        return;
      }
      case "subdivide": {
        if (meshEditMode === "face") {
          startFaceSubdivisionOperation();
        }
        return;
      }
      default:
        return;
    }
  };

  useEffect(() => {
    if (!meshEditToolbarAction) {
      return;
    }

    runMeshEditToolbarAction(meshEditToolbarAction.kind);
  }, [meshEditToolbarAction?.id]);

  useEffect(() => {
    setSculptState((current) =>
      current
        ? {
            ...current,
            radius: sculptBrushRadius,
            strength: sculptBrushStrength
          }
        : current
    );
  }, [sculptBrushRadius, sculptBrushStrength]);

  useEffect(() => {
    onSculptModeChange(sculptState?.mode ?? null);
  }, [onSculptModeChange, sculptState?.mode]);

  useEffect(() => {
    if (sculptState?.dragging) {
      queueSculptStrokeFrame();
      return;
    }

    stopSculptStrokeLoop();
  }, [sculptState?.dragging]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!arcState) {
        return;
      }

      event.preventDefault();
      setArcState((current) =>
        current
          ? {
              ...current,
              previewMesh:
                arcEditableMeshEdges(
                  current.baseMesh,
                  current.edges,
                  current.offset,
                  Math.max(2, current.segments + (event.deltaY < 0 ? 1 : -1)),
                  current.dragDirection
                ) ?? current.previewMesh,
              segments: Math.max(2, current.segments + (event.deltaY < 0 ? 1 : -1))
            }
          : current
      );
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [arcState]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!bevelState) {
        return;
      }

      event.preventDefault();
      setBevelState((current) =>
        current
          ? {
              ...current,
              previewMesh:
                bevelEditableMeshEdges(
                  current.baseMesh,
                  current.edges,
                  current.width,
                  Math.max(1, current.steps + (event.deltaY < 0 ? 1 : -1)),
                  current.profile
                ) ?? current.previewMesh,
              steps: Math.max(1, current.steps + (event.deltaY < 0 ? 1 : -1))
            }
          : current
      );
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [bevelState]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!faceSubdivisionState) {
        return;
      }

      event.preventDefault();
      setFaceSubdivisionState((current) => {
        if (!current) {
          return current;
        }

        const nextCuts = Math.max(1, current.cuts + (event.deltaY < 0 ? 1 : -1));

        return {
          ...current,
          cuts: nextCuts
        };
      });
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [faceSubdivisionState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeToolId !== "mesh-edit" || !selectedNode) {
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;

      if (event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        repeatLastMeshEditAction();
        return;
      }

      if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();

        if (event.shiftKey) {
          updateSelectedNodePivot(undefined);
          return;
        }

        const nextPivot =
          selectedMeshNode && meshEditSelectionIds.length > 0
            ? computeMeshEditSelectionCenter(meshEditHandles, meshEditSelectionIds)
            : selectedBrushNode && brushEditHandleIds.length > 0
              ? computeBrushEditSelectionCenter(brushEditHandles, brushEditHandleIds)
              : undefined;

        if (nextPivot) {
          updateSelectedNodePivot(nextPivot);
        }
        return;
      }

      if (sculptState) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelSculptStroke(!sculptState.dragging);
        }
        return;
      }

      if (extrudeState) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelExtrudePreview();
        } else if (event.key.toLowerCase() === "x") {
          event.preventDefault();
          updateExtrudeAxisLock("x");
        } else if (event.key.toLowerCase() === "y") {
          event.preventDefault();
          updateExtrudeAxisLock("y");
        } else if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          updateExtrudeAxisLock("z");
        }
        return;
      }

      if (faceCutState) {
        if (event.key === "Escape") {
          event.preventDefault();
          setFaceCutState(null);
        }
        return;
      }

      if (faceSubdivisionState) {
        if (event.key === "Escape") {
          event.preventDefault();
          setFaceSubdivisionState(null);
        }
        return;
      }

      if (arcState) {
        if (event.key === "Escape") {
          event.preventDefault();
          setArcState(null);
          setTransformDragging(false);
        }
        return;
      }

      if (bevelState) {
        if (event.key === "Escape") {
          event.preventDefault();
          setBevelState(null);
          setTransformDragging(false);
        } else if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          setBevelState((current) =>
            current
              ? {
                  ...current,
                  previewMesh:
                    bevelEditableMeshEdges(
                      current.baseMesh,
                      current.edges,
                      current.width,
                      current.steps,
                      current.profile === "flat" ? "round" : "flat"
                    ) ?? current.previewMesh,
                  profile: current.profile === "flat" ? "round" : "flat"
                }
              : current
          );
        }
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && meshEditMode === "face") {
        event.preventDefault();
        runMeshEditToolbarAction("delete");
        return;
      }

      if (event.key.toLowerCase() === "m" && meshEditMode === "face") {
        event.preventDefault();
        runMeshEditToolbarAction("merge");
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "k" && meshEditMode === "face") {
        event.preventDefault();
        runMeshEditToolbarAction("cut");
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "d" && meshEditMode === "face") {
        event.preventDefault();
        runMeshEditToolbarAction("subdivide");
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "k" && meshEditMode === "edge") {
        event.preventDefault();
        runMeshEditToolbarAction("cut");
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        runMeshEditToolbarAction("fill-face");
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "a" && meshEditMode === "edge") {
        event.preventDefault();
        runMeshEditToolbarAction("arc");
        return;
      }

      if (event.key.toLowerCase() === "b" && meshEditMode === "edge") {
        event.preventDefault();
        runMeshEditToolbarAction("bevel");
        return;
      }

      if (event.key.toLowerCase() === "x" && meshEditMode !== "vertex") {
        event.preventDefault();
        runMeshEditToolbarAction("extrude");
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        runMeshEditToolbarAction("invert-normals");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeToolId,
    arcState,
    bevelState,
    brushEditHandleIds,
    brushEditHandles,
    editableMeshHandles,
    editableMeshSource,
    extrudeState,
    faceCutState,
    faceSubdivisionState,
    meshEditHandles,
    meshEditMode,
    meshEditSelectionIds,
    sculptState,
    selectedBrushNode,
    selectedMeshNode,
    selectedNode
  ]);

  const updateArcPreview = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current || !arcState) {
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      arcState.dragPlane
    );

    if (!point) {
      return;
    }

    const offset =
      (point.x - arcState.startPoint.x) * arcState.dragDirection.x +
      (point.y - arcState.startPoint.y) * arcState.dragDirection.y +
      (point.z - arcState.startPoint.z) * arcState.dragDirection.z;

    setArcState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const previewMesh =
        arcEditableMeshEdges(
          currentState.baseMesh,
          currentState.edges,
          offset,
          currentState.segments,
          currentState.dragDirection
        ) ?? currentState.previewMesh;

      return {
        ...currentState,
        offset,
        previewMesh
      };
    });
  };

  const commitArcPreview = () => {
    if (!arcState) {
      return;
    }

    if (Math.abs(arcState.offset) <= 0.0001) {
      setArcState(null);
      setTransformDragging(false);
      return;
    }

    setArcState(null);
    setTransformDragging(false);
    commitMeshTopology(arcState.previewMesh);
  };

  const updateBevelPreview = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current || !bevelState) {
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      bevelState.dragPlane
    );

    if (!point) {
      return;
    }

    const width =
      (point.x - bevelState.startPoint.x) * bevelState.dragDirection.x +
      (point.y - bevelState.startPoint.y) * bevelState.dragDirection.y +
      (point.z - bevelState.startPoint.z) * bevelState.dragDirection.z;

    setBevelState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const previewMesh =
        bevelEditableMeshEdges(
          currentState.baseMesh,
          currentState.edges,
          width,
          currentState.steps,
          currentState.profile
        ) ?? currentState.previewMesh;

      return {
        ...currentState,
        previewMesh,
        width
      };
    });
  };

  const commitBevelPreview = () => {
    if (!bevelState) {
      return;
    }

    if (Math.abs(bevelState.width) <= 0.0001) {
      setBevelState(null);
      setTransformDragging(false);
      return;
    }

    setBevelState(null);
    setTransformDragging(false);
    commitMeshTopology(bevelState.previewMesh);
  };

  function buildExtrudePreviewState(state: ExtrudeGestureState, amount: number): ExtrudeGestureState {
    const appliedAmount = amount * state.amountSign;

    if (state.kind === "brush") {
      const previewBrush =
        extrudeBrushHandle(
          state.baseBrush,
          state.handle,
          appliedAmount,
          resolveExtrudeDirection(state)
        ) ?? state.baseBrush;
      onPreviewBrushData(state.nodeId, previewBrush);

      return {
        ...state,
        amount,
        previewBrush
      };
    }

    const previewMesh =
      state.handle.kind === "face"
        ? (
            state.faceIds && state.faceIds.length > 1
              ? extrudeEditableMeshFaces(state.baseMesh, state.faceIds, appliedAmount)
              : extrudeEditableMeshFace(state.baseMesh, state.handle.id, appliedAmount)
          ) ?? state.baseMesh
        : extrudeEditableMeshEdge(
            state.baseMesh,
            state.handle.vertexIds as [string, string],
            appliedAmount,
            resolveExtrudeDirection(state)
          ) ?? state.baseMesh;

    return {
      ...state,
      amount,
      previewMesh
    };
  }

  function updateExtrudePreview(
    clientX: number,
    clientY: number,
    bounds: DOMRect,
    stateOverride?: ExtrudeGestureState
  ) {
    const currentExtrudeState = stateOverride ?? extrudeStateRef.current;

    if (!cameraRef.current || !currentExtrudeState) {
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      currentExtrudeState.dragPlane
    );

    if (!point) {
      return;
    }

    const effectiveNormal = resolveExtrudeDirection(currentExtrudeState);
    const extrusionNormal = new Vector3(
      effectiveNormal.x,
      effectiveNormal.y,
      effectiveNormal.z
    ).normalize();
    const amount =
      Math.round(
        point
          .clone()
          .sub(new Vector3(currentExtrudeState.startPoint.x, currentExtrudeState.startPoint.y, currentExtrudeState.startPoint.z))
          .dot(extrusionNormal) / snapSize
      ) * snapSize;

    const nextState = buildExtrudePreviewState(currentExtrudeState, amount);
    extrudeStateRef.current = nextState;
    setExtrudeState(nextState);
  }

  function cancelExtrudePreview() {
    if (!extrudeState) {
      return;
    }

    if (extrudeState.kind === "brush") {
      onPreviewBrushData(extrudeState.nodeId, extrudeState.baseBrush);
    }

    extrudeStateRef.current = null;
    setExtrudeState(null);
    setTransformDragging(false);
  }

  function commitExtrudePreview() {
    if (!extrudeState) {
      return;
    }

    if (Math.abs(extrudeState.amount) <= 0.0001) {
      cancelExtrudePreview();
      return;
    }

    lastMeshEditActionRef.current = {
      amount: extrudeState.amount * extrudeState.amountSign,
      direction: extrudeState.handle.kind === "edge" ? resolveExtrudeDirection(extrudeState) : undefined,
      handleKind: extrudeState.handle.kind,
      kind: "extrude"
    };

    if (extrudeState.kind === "brush") {
      onUpdateBrushData(extrudeState.nodeId, extrudeState.previewBrush, extrudeState.baseBrush);
    } else if (extrudeState.kind === "mesh") {
      onUpdateMeshData(extrudeState.nodeId, extrudeState.previewMesh, extrudeState.baseMesh);
    } else {
      commitMeshTopology(extrudeState.previewMesh);
    }

    extrudeStateRef.current = null;
    setExtrudeState(null);
    setTransformDragging(false);
  }

  function updateExtrudeAxisLock(axisLock?: "x" | "y" | "z") {
    if (!extrudeStateRef.current || !cameraRef.current) {
      return;
    }

    if (extrudeStateRef.current.handle.kind === "face") {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;

    if (!bounds || !pointer) {
      const currentState = extrudeStateRef.current;

      if (!currentState) {
        return;
      }

      const nextState = {
        ...currentState,
        axisLock
      };
      extrudeStateRef.current = nextState;
      setExtrudeState(nextState);
      return;
    }

    const currentState = extrudeStateRef.current;

    if (!currentState) {
      return;
    }

    const nextState = {
      ...currentState,
      axisLock
    };
    const nextDirection = resolveExtrudeDirection(nextState);
    const nextDragPlane = createBrushCreateDragPlane(
      cameraRef.current!,
      nextDirection,
      resolveExtrudeAnchor(nextState.handle.position, nextDirection, nextState.handle.kind)
    );
    const point = projectPointerToThreePlane(
      pointer.x + bounds.left,
      pointer.y + bounds.top,
      bounds,
      cameraRef.current!,
      raycasterRef.current,
      nextDragPlane
    );
    const nextStateWithPlane = point
      ? {
          ...nextState,
          dragPlane: nextDragPlane,
          startPoint: vec3(
            point.x - nextDirection.x * nextState.amount,
            point.y - nextDirection.y * nextState.amount,
            point.z - nextDirection.z * nextState.amount
          )
        }
      : {
          ...nextState,
          dragPlane: nextDragPlane
        };

    extrudeStateRef.current = nextStateWithPlane;
    setExtrudeState(nextStateWithPlane);
    updateExtrudePreview(pointer.x + bounds.left, pointer.y + bounds.top, bounds, nextStateWithPlane);
  }

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

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    onActivateViewport(viewportId);

    if (!editorInteractionEnabled) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    selectionClickOriginRef.current =
      event.button === 0 && !event.shiftKey
        ? new Vector2(event.clientX - bounds.left, event.clientY - bounds.top)
        : null;

    if (extrudeState || arcState || bevelState || faceCutState || faceSubdivisionState || sculptState?.dragging) {
      return;
    }

    if (aiModelPlacementArmed && event.button === 0 && !event.shiftKey) {
      aiPlacementClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }

    if (activeToolId === "brush" && event.button === 0 && !event.shiftKey) {
      brushClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }

    if ((activeToolId === "path-add" || activeToolId === "path-edit") && event.button === 0 && !event.shiftKey) {
      pathToolClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

      if (activeToolId === "path-edit") {
        const pointHit = resolvePathPointHit(bounds, event.clientX, event.clientY);
        const pathPoint = pointHit
          ? pathDefinitions.find((pathDefinition) => pathDefinition.id === pointHit.pathId)?.points[pointHit.pointIndex]
          : undefined;

        if (pointHit && pathPoint) {
          startPathPointDrag(pointHit.pathId, pointHit.pointIndex, pathPoint);
        }
      }

      return;
    }

    if (activeToolId === "mesh-edit" && sculptState && selectedMeshNode && event.button === 0 && !event.shiftKey) {
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

    if (extrudeState) {
      queuePreviewUpdate("extrude", event.clientX, event.clientY, bounds);
      return;
    }

    if (sculptState) {
      if (sculptState.dragging) {
        return;
      }

      queuePreviewUpdate("sculpt", event.clientX, event.clientY, bounds);
      return;
    }

    if (arcState) {
      queuePreviewUpdate("arc", event.clientX, event.clientY, bounds);
      return;
    }

    if (faceCutState) {
      return;
    }

    if (faceSubdivisionState) {
      return;
    }

    if (bevelState) {
      queuePreviewUpdate("bevel", event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "brush") {
      if (brushCreateState) {
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

  const queuePreviewUpdate = (
    kind: "arc" | "bevel" | "extrude" | "sculpt",
    clientX: number,
    clientY: number,
    bounds: DOMRect
  ) => {
    pendingPreviewUpdateRef.current = {
      bounds,
      clientX,
      clientY,
      kind
    };

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

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!editorInteractionEnabled) {
      return;
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
      if (event.button === 0) {
        commitExtrudePreview();
      }
      return;
    }

    if (sculptState?.dragging) {
      if (event.button === 0) {
        commitSculptStroke();
      }
      return;
    }

    if (arcState) {
      if (event.button === 0) {
        commitArcPreview();
      }
      return;
    }

    if (faceCutState) {
      return;
    }

    if (faceSubdivisionState) {
      return;
    }

    if (bevelState) {
      if (event.button === 0) {
        commitBevelPreview();
      }
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

      const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

      if (point.distanceTo(origin) > 4) {
        return;
      }

      handleAiModelPlacementClick(event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "brush") {
      const origin = brushClickOriginRef.current;
      brushClickOriginRef.current = null;

      if (!origin) {
        return;
      }

      const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

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

      const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

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
      meshEditMode === "edge" &&
      event.button === 0 &&
      !event.altKey &&
      clickOrigin &&
      point.distanceTo(clickOrigin) <= 4
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
      point.distanceTo(selectionOrigin) <= 4
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

    const finalMarquee = {
      ...marquee,
      current: point,
      origin
    };

    setMarquee(null);

    if (!cameraRef.current) {
      return;
    }

    const selectionRect = createScreenRect(finalMarquee.origin, finalMarquee.current);

    if (selectionRect.width < 4 && selectionRect.height < 4) {
      return;
    }

    if (activeToolId === "mesh-edit" && selectedDisplayNode) {
      const handleSelections = (selectedBrushNode ? brushEditHandles : meshEditHandles)
        .filter((handle) =>
          rectContainsPoint(
            selectionRect,
            projectLocalPointToScreen(handle.position, selectedDisplayNode, cameraRef.current!, bounds)
          )
        )
        .map((handle) => handle.id);

      if (handleSelections.length > 0) {
        if (selectedBrushNode) {
          setBrushEditHandleIds(handleSelections);
        } else {
          setMeshEditSelectionIds(handleSelections);
        }
        return;
      }
    }

    const selectedIds = Array.from(meshObjectsRef.current.entries())
      .filter(([, object]) => intersectsSelectionRect(object, cameraRef.current!, bounds, selectionRect))
      .map(([nodeId]) => nodeId);

    if (selectedIds.length > 0) {
      onSelectNodes(selectedIds);
      return;
    }

    onClearSelection();
  };

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
        shadows={renderMode === "lit"}
      >
        <ViewportWorldSettings renderMode={renderMode} sceneSettings={sceneSettings} />
        {renderMode === "lit" ? (
          <ambientLight color={sceneSettings.world.ambientColor} intensity={sceneSettings.world.ambientIntensity} />
        ) : null}
        {renderMode === "lit" ? <hemisphereLight args={["#9ec5f8", "#0f1721", 0.7]} /> : null}
        {renderMode === "lit" ? <DefaultViewportSun center={renderScene.boundsCenter} /> : null}
        <EditorCameraRig
          controlsEnabled={
            isActiveViewport &&
            editorInteractionEnabled &&
            !marquee &&
            !transformDragging &&
            !brushCreateState &&
            !bevelState &&
            !extrudeState &&
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
        {renderMode === "lit" && editorInteractionEnabled ? <axesHelper args={[3]} /> : null}
        <ScenePreview
          hiddenSceneItemIds={
            selectedNode &&
            (arcState || bevelState || extrudeState?.kind === "brush-mesh" || extrudeState?.kind === "mesh")
              ? [...hiddenSceneItemIds, selectedNode.id]
              : hiddenSceneItemIds
          }
          interactive={activeToolId !== "brush" && activeToolId !== "mesh-edit" && activeToolId !== "path-add" && activeToolId !== "path-edit" && viewport.projection === "perspective" && editorInteractionEnabled}
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
          <EditableMeshPreviewOverlay mesh={sculptState.previewMesh} node={selectedDisplayNode} presentation="solid" />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && extrudeState && selectedDisplayNode ? (
          <ExtrudeAxisGuide node={selectedDisplayNode} state={extrudeState} viewport={viewport} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && sculptState && selectedDisplayNode ? (
          <SculptBrushOverlay hovered={sculptState.hovered} node={selectedDisplayNode} radius={sculptState.radius} />
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
            handles={brushEditHandles}
            meshEditMode={meshEditMode}
            node={selectedBrushDisplayNode}
            onCommitTransformAction={(action) => {
              lastMeshEditActionRef.current = action;
            }}
            onPreviewBrushData={onPreviewBrushData}
            onUpdateBrushData={onUpdateBrushData}
            selectedHandleIds={brushEditHandleIds}
            setSelectedHandleIds={setBrushEditHandleIds}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && selectedMeshDisplayNode && !arcState && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
          <MeshEditOverlay
            handles={meshEditHandles}
            meshEditMode={meshEditMode}
            node={selectedMeshDisplayNode}
            onCommitTransformAction={(action) => {
              lastMeshEditActionRef.current = action;
            }}
            onPreviewMeshData={onPreviewMeshData}
            onUpdateMeshData={onUpdateMeshData}
            selectedHandleIds={meshEditSelectionIds}
            setSelectedHandleIds={setMeshEditSelectionIds}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport ? (
          <ObjectTransformGizmo
            activeToolId={activeToolId}
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

      {editorInteractionEnabled && (arcState || bevelState || extrudeState || sculptState || faceCutState || faceSubdivisionState) ? (
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

function DefaultViewportSun({ center }: { center: Vec3 }) {
  const lightRef = useRef<any>(null);
  const targetRef = useRef<Object3D | null>(null);

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) {
      return;
    }

    lightRef.current.target = targetRef.current;
    targetRef.current.updateMatrixWorld();
  }, [center.x, center.y, center.z]);

  return (
    <>
      <directionalLight
        castShadow
        intensity={1.35}
        position={[center.x + 28, center.y + 42, center.z + 24]}
        ref={lightRef}
        shadow-bias={-0.00015}
        shadow-camera-bottom={-72}
        shadow-camera-far={180}
        shadow-camera-left={-72}
        shadow-camera-right={72}
        shadow-camera-top={72}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
        shadow-normalBias={0.03}
      />
      <object3D position={[center.x, center.y, center.z]} ref={targetRef} />
    </>
  );
}

function resolveViewportConstructionPlane(
  viewportPlane: ViewportCanvasProps["viewportPlane"],
  viewport: ViewportCanvasProps["viewport"]
) {
  switch (viewportPlane) {
    case "xy":
      return {
        normal: vec3(0, 0, 1),
        point: vec3(0, 0, viewport.camera.target.z)
      };
    case "yz":
      return {
        normal: vec3(1, 0, 0),
        point: vec3(viewport.camera.target.x, 0, 0)
      };
    case "xz":
    default:
      return {
        normal: vec3(0, 1, 0),
        point: vec3(0, viewport.grid.elevation, 0)
      };
  }
}

function snapPointToViewportPlane(
  point: Vec3,
  viewportPlane: ViewportCanvasProps["viewportPlane"],
  viewport: ViewportCanvasProps["viewport"],
  snapSize: number
) {
  switch (viewportPlane) {
    case "xy":
      return vec3(snapValue(point.x, snapSize), snapValue(point.y, snapSize), viewport.camera.target.z);
    case "yz":
      return vec3(viewport.camera.target.x, snapValue(point.y, snapSize), snapValue(point.z, snapSize));
    case "xz":
    default:
      return vec3(snapValue(point.x, snapSize), viewport.grid.elevation, snapValue(point.z, snapSize));
  }
}

function snapPathEditorPoint(
  point: Vec3,
  viewportPlane: ViewportCanvasProps["viewportPlane"],
  viewport: ViewportCanvasProps["viewport"],
  snapSize: number
) {
  if (!viewport.grid.enabled) {
    return point;
  }

  switch (viewport.projection) {
    case "orthographic":
      return snapPointToViewportPlane(point, viewportPlane, viewport, snapSize);
    default:
      return vec3(
        snapValue(point.x, snapSize),
        snapValue(point.y, snapSize),
        snapValue(point.z, snapSize)
      );
  }
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

function createNextScenePathDefinition(paths: ScenePathDefinition[]): ScenePathDefinition {
  let index = paths.length + 1;
  let id = `path_${index}`;

  while (paths.some((pathDefinition) => pathDefinition.id === id)) {
    index += 1;
    id = `path_${index}`;
  }

  return {
    id,
    loop: false,
    name: `Path ${index}`,
    points: []
  };
}

function appendScenePathPoint(paths: ScenePathDefinition[], pathId: string, point: Vec3) {
  return paths.map((pathDefinition) =>
    pathDefinition.id === pathId
      ? {
          ...pathDefinition,
          points: [...pathDefinition.points, point]
        }
      : pathDefinition
  );
}

function insertScenePathPoint(paths: ScenePathDefinition[], pathId: string, insertIndex: number, point: Vec3) {
  return paths.map((pathDefinition) =>
    pathDefinition.id === pathId
      ? {
          ...pathDefinition,
          points: [
            ...pathDefinition.points.slice(0, insertIndex),
            point,
            ...pathDefinition.points.slice(insertIndex)
          ]
        }
      : pathDefinition
  );
}

function updateScenePathPoint(paths: ScenePathDefinition[], pathId: string, pointIndex: number, point: Vec3) {
  return paths.map((pathDefinition) =>
    pathDefinition.id === pathId
      ? {
          ...pathDefinition,
          points: pathDefinition.points.map((entry, index) => (index === pointIndex ? point : entry))
        }
      : pathDefinition
  );
}

function findPathPointHit(
  paths: ScenePathDefinition[],
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  camera: Camera
) {
  let bestHit: { distance: number; pathId: string; pointIndex: number } | undefined;
  const pointerX = clientX - bounds.left;
  const pointerY = clientY - bounds.top;

  paths.forEach((pathDefinition) => {
    pathDefinition.points.forEach((point, pointIndex) => {
      const projected = projectWorldPointToScreen(point, camera, bounds);
      const distance = Math.hypot(projected.x - pointerX, projected.y - pointerY);

      if (distance > 14 || (bestHit && bestHit.distance <= distance)) {
        return;
      }

      bestHit = {
        distance,
        pathId: pathDefinition.id,
        pointIndex
      };
    });
  });

  return bestHit;
}

function findPathSegmentHit(
  paths: ScenePathDefinition[],
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  camera: Camera,
  selectedPathId?: string
) {
  let bestHit: { distance: number; insertIndex: number; pathId: string } | undefined;
  const pointer = { x: clientX - bounds.left, y: clientY - bounds.top };

  const orderedPaths = selectedPathId
    ? [
        ...paths.filter((pathDefinition) => pathDefinition.id === selectedPathId),
        ...paths.filter((pathDefinition) => pathDefinition.id !== selectedPathId)
      ]
    : paths;

  orderedPaths.forEach((pathDefinition) => {
    const segments = buildPathSegments(pathDefinition);

    segments.forEach((segment) => {
      const start = projectWorldPointToScreen(segment.start, camera, bounds);
      const end = projectWorldPointToScreen(segment.end, camera, bounds);
      const distance = distanceToScreenSegment(
        pointer,
        start,
        end
      );

      if (distance > 10 || (bestHit && bestHit.distance <= distance)) {
        return;
      }

      bestHit = {
        distance,
        insertIndex: segment.insertIndex,
        pathId: pathDefinition.id
      };
    });
  });

  return bestHit;
}

function findEditableEdgeHandleHit(
  handles: Array<{ id: string; points?: Vec3[] }>,
  selectedIds: ReadonlySet<string>,
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  camera: Camera,
  node: GeometryNode,
  threshold = 12
) {
  const pointer = { x: clientX - bounds.left, y: clientY - bounds.top };
  let bestHit:
    | {
        distance: number;
        endpointClearance: number;
        id: string;
        selected: boolean;
      }
    | undefined;

  handles.forEach((handle) => {
    if (!handle.points || handle.points.length !== 2) {
      return;
    }

    const start = projectLocalPointToScreen(handle.points[0], node, camera, bounds);
    const end = projectLocalPointToScreen(handle.points[1], node, camera, bounds);

    if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
      return;
    }

    const measurement = measureScreenSegmentDistance(pointer, start, end);

    if (measurement.distance > threshold) {
      return;
    }

    const endpointClearance = Math.min(measurement.t, 1 - measurement.t);
    const selected = selectedIds.has(handle.id);

    if (!bestHit) {
      bestHit = {
        distance: measurement.distance,
        endpointClearance,
        id: handle.id,
        selected
      };
      return;
    }

    const distanceDelta = measurement.distance - bestHit.distance;
    const endpointDelta = endpointClearance - bestHit.endpointClearance;

    if (
      distanceDelta < -0.5 ||
      (Math.abs(distanceDelta) <= 0.5 && endpointDelta > 0.05) ||
      (Math.abs(distanceDelta) <= 0.5 && Math.abs(endpointDelta) <= 0.05 && selected && !bestHit.selected)
    ) {
      bestHit = {
        distance: measurement.distance,
        endpointClearance,
        id: handle.id,
        selected
      };
    }
  });

  return bestHit;
}

function buildPathSegments(pathDefinition: ScenePathDefinition) {
  const segments: Array<{ end: Vec3; insertIndex: number; start: Vec3 }> = [];
  const points = pathDefinition.points;

  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push({
      end: points[index + 1],
      insertIndex: index + 1,
      start: points[index]
    });
  }

  if (pathDefinition.loop && points.length > 2) {
    segments.push({
      end: points[0],
      insertIndex: points.length,
      start: points[points.length - 1]
    });
  }

  return segments;
}

function projectWorldPointToScreen(point: Vec3, camera: Camera, bounds: DOMRect) {
  const projected = new Vector3(point.x, point.y, point.z).project(camera);

  return {
    x: ((projected.x + 1) * 0.5) * bounds.width,
    y: ((1 - projected.y) * 0.5) * bounds.height
  };
}

function distanceToScreenSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  return measureScreenSegmentDistance(point, start, end).distance;
}

function measureScreenSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared <= 0.0001) {
    return {
      distance: Math.hypot(point.x - start.x, point.y - start.y),
      t: 0
    };
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared));
  const projectedX = start.x + deltaX * t;
  const projectedY = start.y + deltaY * t;

  return {
    distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    t
  };
}

function vec3ApproximatelyEqual(left: Vec3, right: Vec3, epsilon = 0.0001) {
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.z - right.z) <= epsilon
  );
}

function SculptBrushOverlay({
  hovered,
  node,
  radius
}: {
  hovered?: SculptBrushHit;
  node: ViewportCanvasProps["selectedNode"];
  radius: number;
}) {
  const geometryRef = useRef<BufferGeometry>(new BufferGeometry());

  useEffect(() => {
    const geometry = geometryRef.current;

    if (!hovered) {
      geometry.deleteAttribute("position");
      return;
    }

    const basis = createBrushRingBasis(hovered.normal);
    const segmentCount = 40;
    const positions: number[] = [];

    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2;
      const radialOffset = addVec3(
        scaleVec3(basis.u, Math.cos(angle) * radius),
        scaleVec3(basis.v, Math.sin(angle) * radius)
      );
      const point = addVec3(hovered.point, addVec3(radialOffset, scaleVec3(hovered.normal, 0.02)));

      positions.push(point.x, point.y, point.z);
    }

    const current = geometry.getAttribute("position");

    if (!(current instanceof Float32BufferAttribute) || current.array.length !== positions.length) {
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    } else {
      current.array.set(positions);
      current.needsUpdate = true;
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }, [hovered, radius]);

  useEffect(
    () => () => {
      geometryRef.current.dispose();
    },
    []
  );

  if (!hovered || !node) {
    return null;
  }

  return (
    <NodeTransformGroup transform={node.transform}>
      <lineLoop geometry={geometryRef.current} renderOrder={14}>
        <lineBasicMaterial color="#f8fafc" depthWrite={false} opacity={0.95} toneMapped={false} transparent />
      </lineLoop>
    </NodeTransformGroup>
  );
}

function createBrushRingBasis(normal: Vec3) {
  const axis = lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0);
  const reference = Math.abs(axis.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, axis));
  const v = normalizeVec3(crossVec3(axis, u));

  return { u, v };
}

function resolveNodeIdFromIntersection(intersection: { instanceId?: number; object: Object3D }) {
  return typeof intersection.instanceId === "number"
    ? resolveInstancedNodeIdFromSceneObject(intersection.object, intersection.instanceId)
    : resolveNodeIdFromSceneObject(intersection.object);
}

function resolveNodeIdFromSceneObject(object: Object3D | null) {
  let current: Object3D | null = object;

  while (current) {
    if (current.name.startsWith("node:")) {
      return current.name.slice(5);
    }

    current = current.parent;
  }

  return undefined;
}

function resolveInstancedNodeIdFromSceneObject(object: Object3D | null, instanceId: number) {
  let current: Object3D | null = object;

  while (current) {
    const instanceNodeIds = (current.userData.webHammer as { instanceNodeIds?: string[] } | undefined)?.instanceNodeIds;

    if (Array.isArray(instanceNodeIds)) {
      return instanceNodeIds[instanceId];
    }

    current = current.parent;
  }

  return undefined;
}

function resolveExtrudeAnchor(
  position: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  kind: "edge" | "face"
) {
  const distance = kind === "face" ? 0.42 : 0.3;

  return vec3(
    position.x + normal.x * distance,
    position.y + normal.y * distance,
    position.z + normal.z * distance
  );
}

function resolveExtrudeInteractionNormal(
  _camera: Camera,
  normal: { x: number; y: number; z: number },
  _kind: "edge" | "face"
) {
  return vec3(normal.x, normal.y, normal.z);
}

function resolveExtrudeAmountSign(
  _interactionNormal: { x: number; y: number; z: number },
  _handleNormal: { x: number; y: number; z: number },
  _kind: "edge" | "face"
): 1 | -1 {
  return 1;
}
