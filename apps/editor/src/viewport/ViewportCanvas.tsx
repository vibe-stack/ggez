import { Canvas, type RootState } from "@react-three/fiber";
import {
  arcEditableMeshEdges,
  bevelEditableMeshEdges,
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
  subdivideEditableMeshFace
} from "@web-hammer/geometry-kernel";
import {
  averageVec3,
  crossVec3,
  isBrushNode,
  isMeshNode,
  normalizeVec3,
  snapValue,
  toTuple,
  subVec3,
  vec3,
  type EditableMesh,
  type Vec3
} from "@web-hammer/shared";
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
import { Camera, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
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

export function ViewportCanvas({
  activeBrushShape,
  aiModelPlacementArmed,
  activeToolId,
  dprScale,
  isActiveViewport,
  meshEditMode,
  meshEditToolbarAction,
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
  onSelectMaterialFaces,
  onSelectNodes,
  onSplitBrushAtCoordinate,
  onUpdateBrushData,
  onUpdateEntityTransform,
  onUpdateMeshData,
  onUpdateNodeTransform,
  onViewportChange,
  physicsPlayback,
  physicsRevision,
  renderMode,
  renderScene,
  sceneSettings,
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
  const snapSize = resolveViewportSnapSize(viewport);
  const editorInteractionEnabled = physicsPlayback === "stopped";
  const [meshEditSelectionIds, setMeshEditSelectionIds] = useState<string[]>([]);
  const [transformDragging, setTransformDragging] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const extrudeStateRef = useRef<ExtrudeGestureState | null>(null);
  const lastMeshEditActionRef = useRef<LastMeshEditAction | null>(null);
  const previewBrushDataRef = useRef(onPreviewBrushData);
  extrudeStateRef.current = extrudeState;
  previewBrushDataRef.current = onPreviewBrushData;

  useEffect(() => {
    const currentExtrudeState = extrudeStateRef.current;

    if (currentExtrudeState?.kind === "brush") {
      previewBrushDataRef.current(currentExtrudeState.nodeId, currentExtrudeState.baseBrush);
    }

    extrudeStateRef.current = null;
    setMeshEditSelectionIds([]);
    setBrushEditHandleIds([]);
    setArcState(null);
    setBevelState(null);
    setFaceCutState(null);
    setFaceSubdivisionState(null);
    setExtrudeState(null);
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
    selectionClickOriginRef.current = null;
    setMarquee(null);
    setTransformDragging(false);
  }, [editorInteractionEnabled]);

  useEffect(() => {
    setBrushCreateState((current) => (current && current.shape !== activeBrushShape ? null : current));
  }, [activeBrushShape]);

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
      if (!brushCreateState || brushCreateState.shape !== "stairs") {
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
        ? createMeshEditHandles(editableMeshSource, meshEditMode)
        : [],
    [activeToolId, editableMeshSource, meshEditMode]
  );

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
          .map((intersection) => resolveNodeIdFromSceneObject(intersection.object))
          .filter((nodeId): nodeId is string => Boolean(nodeId))
      )
    );

    if (selectedIds.length > 0) {
      onSelectNodes(selectedIds);
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

    const previewMesh = subdivideEditableMeshFace(editableMeshSource, selectedFaces[0], 1);

    if (!previewMesh) {
      return;
    }

    setFaceSubdivisionState({
      baseMesh: structuredClone(editableMeshSource),
      cuts: 1,
      faceId: selectedFaces[0],
      previewMesh
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

      const anchor = resolveExtrudeAnchor(handle.position, handle.normal, handle.kind);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, handle.normal, anchor);
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
        baseBrush: structuredClone(selectedBrushNode.data),
        dragPlane,
        handle: structuredClone(handle),
        kind: "brush",
        nodeId: selectedBrushNode.id,
        normal: vec3(handle.normal.x, handle.normal.y, handle.normal.z),
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
      const normal = vec3LengthSquared(resolvedNormal) > 0.000001 ? resolvedNormal : handle.normal;

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
    if (activeToolId !== "mesh-edit" || !selectedNode || arcState || bevelState || extrudeState || faceCutState || faceSubdivisionState) {
      return;
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
          cuts: nextCuts,
          previewMesh:
            subdivideEditableMeshFace(current.baseMesh, current.faceId, nextCuts) ?? current.previewMesh
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
    if (state.kind === "brush") {
      const previewBrush =
        extrudeBrushHandle(
          state.baseBrush,
          state.handle,
          amount,
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
              ? extrudeEditableMeshFaces(state.baseMesh, state.faceIds, amount)
              : extrudeEditableMeshFace(state.baseMesh, state.handle.id, amount)
          ) ?? state.baseMesh
        : extrudeEditableMeshEdge(
            state.baseMesh,
            state.handle.vertexIds as [string, string],
            amount,
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
      amount: extrudeState.amount,
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

    if (extrudeState || arcState || bevelState || faceCutState || faceSubdivisionState) {
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
      updateExtrudePreview(event.clientX, event.clientY, bounds);
      return;
    }

    if (arcState) {
      updateArcPreview(event.clientX, event.clientY, bounds);
      return;
    }

    if (faceCutState) {
      return;
    }

    if (faceSubdivisionState) {
      return;
    }

    if (bevelState) {
      updateBevelPreview(event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "brush") {
      if (brushCreateState) {
        updateBrushCreatePreview(event.clientX, event.clientY, bounds);
      }
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

    const bounds = event.currentTarget.getBoundingClientRect();
    const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    pointerPositionRef.current = point;

    if (extrudeState) {
      if (event.button === 0) {
        commitExtrudePreview();
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

    const selectionOrigin = selectionClickOriginRef.current;
    selectionClickOriginRef.current = null;

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

    if (activeToolId === "mesh-edit" && selectedNode) {
      const handleSelections = (selectedBrushNode ? brushEditHandles : meshEditHandles)
        .filter((handle) =>
          rectContainsPoint(
            selectionRect,
            projectLocalPointToScreen(handle.position, selectedNode, cameraRef.current!, bounds)
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
            extrudeState ||
            arcState ||
            bevelState ||
            faceCutState ||
            faceSubdivisionState ||
            marqueeOriginRef.current ||
            marquee
          ) {
            return;
          }

          if (activeToolId === "mesh-edit" && (meshEditSelectionIds.length > 0 || brushEditHandleIds.length > 0)) {
            setMeshEditSelectionIds([]);
            setBrushEditHandleIds([]);
            return;
          }

          if (activeToolId === "mesh-edit") {
            return;
          }

          onClearSelection();
        }}
        shadows={renderMode === "lit"}
      >
        <color attach="background" args={[renderMode === "lit" ? "#0b1118" : "#091018"]} />
        {renderMode === "lit" ? <fog attach="fog" args={["#0b1118", 45, 180]} /> : null}
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
          hiddenNodeIds={
            selectedNode &&
            (arcState || bevelState || extrudeState?.kind === "brush-mesh" || (extrudeState?.kind === "mesh" && extrudeState.handle.kind === "edge"))
              ? [selectedNode.id]
              : []
          }
          interactive={activeToolId !== "brush" && activeToolId !== "mesh-edit" && viewport.projection === "perspective" && editorInteractionEnabled}
          onFocusNode={onFocusNode}
          onMeshObjectChange={handleMeshObjectChange}
          onSelectNode={onSelectNodes}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          renderMode={renderMode}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
          selectedNodeIds={selectedNodeIds}
        />
        {editorInteractionEnabled && isActiveViewport && arcState && selectedNode ? <EditableMeshPreviewOverlay mesh={arcState.previewMesh} node={selectedNode} /> : null}
        {editorInteractionEnabled && isActiveViewport && bevelState && selectedNode ? <EditableMeshPreviewOverlay mesh={bevelState.previewMesh} node={selectedNode} /> : null}
        {editorInteractionEnabled && isActiveViewport && (extrudeState?.kind === "mesh" || extrudeState?.kind === "brush-mesh") && selectedNode ? (
          <EditableMeshPreviewOverlay mesh={extrudeState.previewMesh} node={selectedNode} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && extrudeState && selectedNode ? (
          <ExtrudeAxisGuide node={selectedNode} state={extrudeState} viewport={viewport} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "brush" && brushCreateState ? (
          <BrushCreatePreview snapSize={snapSize} state={brushCreateState} />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "clip" && selectedBrushNode ? (
          <BrushClipOverlay
            node={selectedBrushNode}
            onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && faceCutState && selectedNode && editableMeshSource ? (
          <MeshCutOverlay
            faceId={faceCutState.faceId}
            mesh={editableMeshSource}
            node={selectedNode}
            onCommitCut={(mesh) => {
              setFaceCutState(null);
              commitMeshTopology(mesh);
            }}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && faceSubdivisionState && selectedNode ? (
          <MeshSubdivideOverlay
            faceId={faceSubdivisionState.faceId}
            mesh={faceSubdivisionState.baseMesh}
            node={selectedNode}
            onCommitSubdivision={(mesh) => {
              setFaceSubdivisionState(null);
              commitMeshTopology(mesh);
            }}
            previewMesh={faceSubdivisionState.previewMesh}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "extrude" && selectedBrushNode ? (
          <BrushExtrudeOverlay
            node={selectedBrushNode}
            onCommitMeshTopology={onCommitMeshTopology}
            onPreviewBrushData={onPreviewBrushData}
            onUpdateBrushData={onUpdateBrushData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "extrude" && selectedMeshNode ? (
          <MeshExtrudeOverlay
            node={selectedMeshNode}
            onUpdateMeshData={onUpdateMeshData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && selectedBrushNode && !arcState && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
          <BrushEditOverlay
            handles={brushEditHandles}
            meshEditMode={meshEditMode}
            node={selectedBrushNode}
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
        {editorInteractionEnabled && isActiveViewport && activeToolId === "mesh-edit" && selectedMeshNode && !arcState && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
          <MeshEditOverlay
            handles={meshEditHandles}
            meshEditMode={meshEditMode}
            node={selectedMeshNode}
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
            onPreviewEntityTransform={onPreviewEntityTransform}
            onPreviewNodeTransform={onPreviewNodeTransform}
            onUpdateEntityTransform={onUpdateEntityTransform}
            onUpdateNodeTransform={onUpdateNodeTransform}
            selectedEntity={selectedEntity}
            selectedNode={selectedNode}
            selectedNodeIds={selectedNodeIds}
            selectedNodes={selectedNodes}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
      </Canvas>

      {editorInteractionEnabled && (arcState || bevelState || extrudeState || faceCutState || faceSubdivisionState) ? (
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
