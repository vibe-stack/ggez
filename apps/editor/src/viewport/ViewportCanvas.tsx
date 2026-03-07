import { Canvas, type RootState } from "@react-three/fiber";
import { WebGPURenderer } from "three/webgpu";
import {
  bevelEditableMeshEdges,
  convertBrushToEditableMesh,
  cutEditableMeshBetweenEdges,
  deleteEditableMeshFaces,
  extrudeEditableMeshEdge,
  extrudeEditableMeshFace,
  fillEditableMeshFaceFromEdges,
  fillEditableMeshFaceFromVertices,
  invertEditableMeshNormals,
  mergeEditableMeshFaces,
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
  buildBrushCreatePlacement,
  computeBrushCreateCenter,
  createBrushCreateBasis,
  createBrushCreateDragPlane,
  measureBrushCreateBase,
  projectPointerToPlane,
  projectPointerToThreePlane,
  resolveBrushCreateSurfaceHit
} from "@/viewport/utils/brush-create";
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
import { useEffect, useRef, useState, type PointerEventHandler } from "react";
import { Mesh, Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import type {
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
  activeToolId,
  meshEditMode,
  meshEditToolbarAction,
  onClearSelection,
  onCommitMeshTopology,
  onFocusNode,
  onPlaceAsset,
  onPlaceBrush,
  onPreviewBrushData,
  onPreviewMeshData,
  onPreviewNodeTransform,
  onSelectNodes,
  onSplitBrushAtCoordinate,
  onUpdateBrushData,
  onUpdateMeshData,
  onUpdateNodeTransform,
  renderScene,
  selectedNode,
  selectedNodeIds,
  transformMode,
  viewport
}: ViewportCanvasProps) {
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const brushClickOriginRef = useRef<Vector2 | null>(null);
  const marqueeOriginRef = useRef<Vector2 | null>(null);
  const pointerPositionRef = useRef<Vector2 | null>(null);
  const viewportRootRef = useRef<HTMLDivElement | null>(null);
  const meshObjectsRef = useRef(new Map<string, Mesh>());
  const raycasterRef = useRef(new Raycaster());
  const [brushEditHandleIds, setBrushEditHandleIds] = useState<string[]>([]);
  const [brushCreateState, setBrushCreateState] = useState<BrushCreateState | null>(null);
  const [bevelState, setBevelState] = useState<BevelState | null>(null);
  const [extrudeState, setExtrudeState] = useState<ExtrudeGestureState | null>(null);
  const [faceCutState, setFaceCutState] = useState<{ faceId: string } | null>(null);
  const [faceSubdivisionState, setFaceSubdivisionState] = useState<FaceSubdivisionState | null>(null);
  const snapSize = resolveViewportSnapSize(viewport);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !brushCreateState) {
        return;
      }

      event.preventDefault();
      setBrushCreateState(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [brushCreateState]);

  const selectedBrushNode = selectedNode && isBrushNode(selectedNode) ? selectedNode : undefined;
  const selectedMeshNode = selectedNode && isMeshNode(selectedNode) ? selectedNode : undefined;
  const brushEditHandles =
    activeToolId === "mesh-edit" && selectedBrushNode
      ? createBrushEditHandles(selectedBrushNode.data, meshEditMode)
      : [];
  const meshEditHandles =
    activeToolId === "mesh-edit" && selectedMeshNode
      ? createMeshEditHandles(selectedMeshNode.data, meshEditMode)
      : [];
  const editableMeshSource =
    activeToolId === "mesh-edit" && selectedBrushNode
      ? convertBrushToEditableMesh(selectedBrushNode.data)
      : activeToolId === "mesh-edit" && selectedMeshNode
        ? selectedMeshNode.data
        : undefined;
  const editableMeshHandles =
    activeToolId === "mesh-edit" && editableMeshSource
      ? createMeshEditHandles(editableMeshSource, meshEditMode)
      : [];

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

  const handleMeshObjectChange = (nodeId: string, object: Mesh | null) => {
    if (object) {
      meshObjectsRef.current.set(nodeId, object);
      return;
    }

    meshObjectsRef.current.delete(nodeId);
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

        if (selectedFaces.length !== 1) {
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
          const nextMesh = extrudeEditableMeshFace(selectedMeshNode.data, selectedFaces[0], action.amount);

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
    setBevelState(null);
    setFaceSubdivisionState(null);
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
      if (meshEditSelectionIds.length !== 1) {
        return;
      }

      const handle = createMeshExtrudeHandles(selectedMeshNode.data).find(
        (candidate) => candidate.id === meshEditSelectionIds[0]
      );

      if (!handle) {
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
        baseMesh: structuredClone(selectedMeshNode.data),
        dragPlane,
        handle: structuredClone(handle),
        kind: "mesh",
        nodeId: selectedMeshNode.id,
        normal: vec3(handle.normal.x, handle.normal.y, handle.normal.z),
        previewMesh: structuredClone(selectedMeshNode.data),
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      });
    }
  };

  const runMeshEditToolbarAction = (action: MeshEditToolbarAction) => {
    if (activeToolId !== "mesh-edit" || !selectedNode || bevelState || extrudeState || faceCutState || faceSubdivisionState) {
      return;
    }

    switch (action) {
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
        ? extrudeEditableMeshFace(state.baseMesh, state.handle.id, amount) ?? state.baseMesh
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
    const amount = Math.max(
      0,
      Math.round(
        point
          .clone()
          .sub(new Vector3(currentExtrudeState.startPoint.x, currentExtrudeState.startPoint.y, currentExtrudeState.startPoint.z))
          .dot(extrusionNormal) / snapSize
      ) * snapSize
    );

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

    if (extrudeState.amount <= 0.0001) {
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

    if (brushCreateState.stage === "base") {
      const point = projectPointerToPlane(
        clientX,
        clientY,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        brushCreateState.anchor,
        brushCreateState.basis.normal
      );

      if (!point) {
        return;
      }

      setBrushCreateState((currentState) =>
        currentState?.stage === "base"
          ? {
              ...currentState,
              currentPoint: point
            }
          : currentState
      );
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      brushCreateState.dragPlane
    );

    if (!point) {
      return;
    }

    const normal = new Vector3(
      brushCreateState.basis.normal.x,
      brushCreateState.basis.normal.y,
      brushCreateState.basis.normal.z
    );
    const startPoint = new Vector3(
      brushCreateState.startPoint.x,
      brushCreateState.startPoint.y,
      brushCreateState.startPoint.z
    );
    const nextHeight = snapValue(point.clone().sub(startPoint).dot(normal), snapSize);

    setBrushCreateState((currentState) =>
      currentState?.stage === "height" && currentState.height !== nextHeight
        ? {
            ...currentState,
            height: nextHeight
          }
        : currentState
    );
  };

  const handleBrushCreateClick = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current) {
      return;
    }

    if (!brushCreateState) {
      const hit = resolveBrushCreateSurfaceHit(
        clientX,
        clientY,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        meshObjectsRef.current,
        viewport.grid.elevation,
        viewport.grid.enabled,
        snapSize
      );

      if (!hit) {
        return;
      }

      setBrushCreateState({
        anchor: hit.point,
        basis: createBrushCreateBasis(hit.normal),
        currentPoint: hit.point,
        stage: "base"
      });
      return;
    }

    if (brushCreateState.stage === "base") {
      const point =
        projectPointerToPlane(
          clientX,
          clientY,
          bounds,
          cameraRef.current,
          raycasterRef.current,
          brushCreateState.anchor,
          brushCreateState.basis.normal
        ) ?? brushCreateState.currentPoint;
      const { depth, width } = measureBrushCreateBase(
        brushCreateState.anchor,
        brushCreateState.basis,
        point,
        snapSize
      );

      if (Math.abs(width) <= snapSize * 0.5 || Math.abs(depth) <= snapSize * 0.5) {
        return;
      }

      const center = computeBrushCreateCenter(brushCreateState.anchor, brushCreateState.basis, width, depth, 0);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, brushCreateState.basis.normal, center);
      const startPoint =
        projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, dragPlane) ??
        new Vector3(center.x, center.y, center.z);

      setBrushCreateState({
        ...brushCreateState,
        depth,
        dragPlane,
        height: 0,
        stage: "height",
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
        width
      });
      return;
    }

    const point =
      projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, brushCreateState.dragPlane) ??
      new Vector3(brushCreateState.startPoint.x, brushCreateState.startPoint.y, brushCreateState.startPoint.z);
    const height = snapValue(
      point
        .clone()
        .sub(new Vector3(brushCreateState.startPoint.x, brushCreateState.startPoint.y, brushCreateState.startPoint.z))
        .dot(new Vector3(brushCreateState.basis.normal.x, brushCreateState.basis.normal.y, brushCreateState.basis.normal.z)),
      snapSize
    );
    const placement = buildBrushCreatePlacement({
      ...brushCreateState,
      height
    });

    if (!placement) {
      return;
    }

    onPlaceBrush(placement.brush, placement.transform);
    setBrushCreateState(null);
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (extrudeState || bevelState || faceCutState || faceSubdivisionState) {
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
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (extrudeState) {
      updateExtrudePreview(event.clientX, event.clientY, bounds);
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
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (extrudeState) {
      if (event.button === 0) {
        commitExtrudePreview();
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

    if (!marqueeOriginRef.current) {
      return;
    }

    const origin = marqueeOriginRef.current;
    marqueeOriginRef.current = null;

    if (!marquee) {
      return;
    }

    const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
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

  return (
    <div
      className="relative size-full overflow-hidden"
      ref={viewportRootRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Canvas
        camera={{
          far: viewport.camera.far,
          fov: viewport.camera.fov,
          near: viewport.camera.near,
          position: toTuple(viewport.camera.position)
        }}
        gl={async (props) => {
          const renderer = new WebGPURenderer(props as ConstructorParameters<typeof WebGPURenderer>[0]);
          await renderer.init();
          return renderer;
        }}
        onCreated={(state: RootState) => {
          cameraRef.current = state.camera as PerspectiveCamera;
        }}
        onPointerMissed={() => {
          if (
            activeToolId === "brush" ||
            extrudeState ||
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

          onClearSelection();
        }}
        shadows
      >
        <color attach="background" args={["#0b1118"]} />
        <fog attach="fog" args={["#0b1118", 45, 180]} />
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#9ec5f8", "#0f1721", 0.7]} />
        <directionalLight
          castShadow
          intensity={1.4}
          position={[18, 26, 12]}
          shadow-bias={-0.0002}
          shadow-mapSize-height={2048}
          shadow-mapSize-width={2048}
          shadow-normalBias={0.045}
        />
        <EditorCameraRig
          controlsEnabled={
            !marquee &&
            !transformDragging &&
            !brushCreateState &&
            !bevelState &&
            !extrudeState &&
            !faceCutState &&
            !faceSubdivisionState
          }
          viewport={viewport}
        />
        <ConstructionGrid activeToolId={activeToolId} onPlaceAsset={onPlaceAsset} viewport={viewport} />
        <axesHelper args={[3]} />
        <ScenePreview
          hiddenNodeIds={
            selectedNode &&
            (bevelState || extrudeState?.kind === "brush-mesh" || (extrudeState?.kind === "mesh" && extrudeState.handle.kind === "edge"))
              ? [selectedNode.id]
              : []
          }
          interactive={activeToolId !== "brush"}
          onFocusNode={onFocusNode}
          onMeshObjectChange={handleMeshObjectChange}
          onSelectNode={onSelectNodes}
          renderScene={renderScene}
          selectedNodeIds={selectedNodeIds}
        />
        {bevelState && selectedNode ? <EditableMeshPreviewOverlay mesh={bevelState.previewMesh} node={selectedNode} /> : null}
        {(extrudeState?.kind === "mesh" || extrudeState?.kind === "brush-mesh") && selectedNode ? (
          <EditableMeshPreviewOverlay mesh={extrudeState.previewMesh} node={selectedNode} />
        ) : null}
        {extrudeState && selectedNode ? (
          <ExtrudeAxisGuide node={selectedNode} state={extrudeState} viewport={viewport} />
        ) : null}
        {activeToolId === "brush" && brushCreateState ? (
          <BrushCreatePreview snapSize={snapSize} state={brushCreateState} />
        ) : null}
        {activeToolId === "clip" && selectedBrushNode ? (
          <BrushClipOverlay
            node={selectedBrushNode}
            onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "mesh-edit" && faceCutState && selectedNode && editableMeshSource ? (
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
        {activeToolId === "mesh-edit" && faceSubdivisionState && selectedNode ? (
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
        {activeToolId === "extrude" && selectedBrushNode ? (
          <BrushExtrudeOverlay
            node={selectedBrushNode}
            onCommitMeshTopology={onCommitMeshTopology}
            onPreviewBrushData={onPreviewBrushData}
            onUpdateBrushData={onUpdateBrushData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "extrude" && selectedMeshNode ? (
          <MeshExtrudeOverlay
            node={selectedMeshNode}
            onUpdateMeshData={onUpdateMeshData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "mesh-edit" && selectedBrushNode && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
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
        {activeToolId === "mesh-edit" && selectedMeshNode && !bevelState && !extrudeState && !faceCutState && !faceSubdivisionState ? (
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
        <ObjectTransformGizmo
          activeToolId={activeToolId}
          onPreviewNodeTransform={onPreviewNodeTransform}
          onUpdateNodeTransform={onUpdateNodeTransform}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          transformMode={transformMode}
          viewport={viewport}
        />
      </Canvas>

      {bevelState || extrudeState || faceCutState || faceSubdivisionState ? (
        <div className="pointer-events-none absolute inset-0 z-20 cursor-crosshair" />
      ) : null}

      {marqueeRect ? (
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
