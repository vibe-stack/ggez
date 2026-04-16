import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  arcEditableMeshEdges,
  bevelEditableMeshEdges,
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
} from "@ggez/geometry-kernel";
import {
  averageVec3,
  crossVec3,
  vec3,
  type EditableMesh,
  type GeometryNode,
  type Vec3
} from "@ggez/shared";
import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";
import {
  applyBrushEditTransform,
  applyMeshEditTransform,
  computeBrushEditSelectionCenter,
  computeBrushEditSelectionOrientation,
  createBrushEditHandles,
  computeMeshEditSelectionCenter,
  computeMeshEditSelectionOrientation,
  createBrushExtrudeHandles,
  createMeshEditHandles,
  createMeshExtrudeHandles,
  extrudeBrushHandle,
  type BrushExtrudeHandle,
  type MeshEditMode
} from "@/viewport/editing";
import { createBrushCreateDragPlane, projectPointerToThreePlane } from "@/viewport/utils/brush-create";
import { composeTransformRotation, rebaseTransformPivot } from "@/viewport/utils/geometry";
import { makeUndirectedPairKey, rejectVec3FromAxis, resolveExtrudeDirection, resolveSubobjectSelection, vec3LengthSquared } from "@/viewport/utils/interaction";
import { resolveExtrudeAmountSign, resolveExtrudeAnchor, resolveExtrudeInteractionNormal } from "@/viewport/utils/viewport-canvas-helpers";
import type { ArcState, BevelState, ExtrudeGestureState, FaceSubdivisionState, LastMeshEditAction, MeshEditToolbarAction, ViewportCanvasProps } from "@/viewport/types";

type MeshEditOperationOptions = {
  activeToolId: ViewportCanvasProps["activeToolId"];
  brushEditHandleIds: string[];
  brushEditHandles: ReturnType<typeof createBrushEditHandles>;
  cameraRef: MutableRefObject<Camera | null>;
  clearMaterialPaintMode: () => void;
  clearSculptMode: () => void;
  clearSubobjectSelection: () => void;
  editableMeshHandles: ReturnType<typeof createMeshEditHandles>;
  editableMeshSource?: EditableMesh;
  faceCutStateExternal?: { faceId: string } | null;
  materialPaintDragging: boolean;
  materialPaintVisible: boolean;
  meshEditMode: MeshEditMode;
  meshEditSelectionIds: string[];
  meshEditToolbarAction?: ViewportCanvasProps["meshEditToolbarAction"];
  meshEditHandles: ReturnType<typeof createMeshEditHandles>;
  onCommitMeshTopology: ViewportCanvasProps["onCommitMeshTopology"];
  onPreviewBrushData: ViewportCanvasProps["onPreviewBrushData"];
  onStartMaterialPaintMode: (mode: "erase" | "paint") => void;
  onStartSculptMode: (mode: "deflate" | "inflate" | "smooth") => void;
  onUpdateBrushData: ViewportCanvasProps["onUpdateBrushData"];
  onUpdateMeshData: ViewportCanvasProps["onUpdateMeshData"];
  onUpdateNodeTransform: ViewportCanvasProps["onUpdateNodeTransform"];
  pointerPositionRef: MutableRefObject<Vector2 | null>;
  raycasterRef: MutableRefObject<Raycaster>;
  resolveSelectedEditableMeshEdgePairs: () => [string, string][];
  resolveSelectedEditableMeshFaceIds: () => string[];
  resolveSelectedEditableMeshVertexIds: () => string[];
  selectedBrushNode?: Extract<GeometryNode, { kind: "brush" }>;
  selectedMeshNode?: Extract<GeometryNode, { kind: "mesh" }>;
  selectedNode?: GeometryNode;
  setCameraControlsEnabled: (enabled: boolean) => void;
  setTransformDragging: (dragging: boolean) => void;
  sculptDragging: boolean;
  sculptVisible: boolean;
  snapSize: number;
  viewportRootRef: RefObject<HTMLDivElement | null>;
};

export function useViewportMeshEditOperations({
  activeToolId,
  brushEditHandleIds,
  brushEditHandles,
  cameraRef,
  clearMaterialPaintMode,
  clearSculptMode,
  clearSubobjectSelection,
  editableMeshHandles,
  editableMeshSource,
  materialPaintDragging,
  materialPaintVisible,
  meshEditMode,
  meshEditSelectionIds,
  meshEditToolbarAction,
  meshEditHandles,
  onCommitMeshTopology,
  onPreviewBrushData,
  onStartMaterialPaintMode,
  onStartSculptMode,
  onUpdateBrushData,
  onUpdateMeshData,
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
  sculptDragging,
  sculptVisible,
  snapSize,
  viewportRootRef
}: MeshEditOperationOptions) {
  const [arcState, setArcState] = useState<ArcState | null>(null);
  const [bevelState, setBevelState] = useState<BevelState | null>(null);
  const [extrudeState, setExtrudeState] = useState<ExtrudeGestureState | null>(null);
  const [faceCutState, setFaceCutState] = useState<{ faceId: string } | null>(null);
  const [faceSubdivisionState, setFaceSubdivisionState] = useState<FaceSubdivisionState | null>(null);
  const extrudeStateRef = useRef<ExtrudeGestureState | null>(null);
  const lastMeshEditActionRef = useRef<LastMeshEditAction | null>(null);

  extrudeStateRef.current = extrudeState;

  const resetMeshEditOperations = useCallback(() => {
    if (extrudeStateRef.current?.kind === "brush") {
      onPreviewBrushData(extrudeStateRef.current.nodeId, extrudeStateRef.current.baseBrush);
    }

    extrudeStateRef.current = null;
    setArcState(null);
    setBevelState(null);
    setFaceCutState(null);
    setFaceSubdivisionState(null);
    setExtrudeState(null);
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  }, [onPreviewBrushData, setCameraControlsEnabled, setTransformDragging]);

  const commitMeshTopology = useCallback((mesh: EditableMesh | undefined) => {
    if (!selectedNode || !mesh) {
      return;
    }

    onCommitMeshTopology(selectedNode.id, mesh);
    clearSubobjectSelection();
    setArcState(null);
    setBevelState(null);
    setFaceSubdivisionState(null);
  }, [clearSubobjectSelection, onCommitMeshTopology, selectedNode]);

  const updateSelectedNodePivot = useCallback((nextPivot?: { x: number; y: number; z: number }) => {
    if (!selectedNode) {
      return;
    }

    onUpdateNodeTransform(
      selectedNode.id,
      rebaseTransformPivot(selectedNode.transform, nextPivot ? vec3(nextPivot.x, nextPivot.y, nextPivot.z) : undefined),
      selectedNode.transform
    );
  }, [onUpdateNodeTransform, selectedNode]);

  const startFaceCutOperation = useCallback(() => {
    if (meshEditMode !== "face" || !editableMeshSource) {
      return;
    }

    const selectedFaces = resolveSelectedEditableMeshFaceIds();

    if (selectedFaces.length !== 1) {
      return;
    }

    setFaceCutState({ faceId: selectedFaces[0] });
  }, [editableMeshSource, meshEditMode, resolveSelectedEditableMeshFaceIds]);

  const startFaceSubdivisionOperation = useCallback(() => {
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
  }, [editableMeshSource, meshEditMode, resolveSelectedEditableMeshFaceIds]);

  const repeatLastMeshEditAction = useCallback(() => {
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

    const baselinePosition =
      selectedNode.transform.pivot ??
      (selectedMeshNode
        ? computeMeshEditSelectionCenter(meshEditHandles, meshEditSelectionIds)
        : selectedBrushNode
          ? computeBrushEditSelectionCenter(brushEditHandles, brushEditHandleIds)
          : vec3(0, 0, 0));
    const baselineRotation = selectedMeshNode
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
      rotation: composeTransformRotation(baselineTransform.rotation, action.rotationDelta),
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
  }, [
    brushEditHandleIds,
    brushEditHandles,
    commitMeshTopology,
    editableMeshSource,
    meshEditHandles,
    meshEditMode,
    meshEditSelectionIds,
    onUpdateBrushData,
    onUpdateMeshData,
    resolveSelectedEditableMeshEdgePairs,
    resolveSelectedEditableMeshFaceIds,
    selectedBrushNode,
    selectedMeshNode,
    selectedNode,
    snapSize
  ]);

  const startArcOperation = useCallback(() => {
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

      return handle?.points && handle.points.length === 2 ? [handle as typeof handle & { points: [Vec3, Vec3] }] : [];
    });

    if (selectedEdgeHandles.length !== selectedEdges.length) {
      return;
    }

    const midpoints = selectedEdgeHandles.map((handle) => averageVec3(handle.points));
    const anchor = averageVec3(midpoints);
    const averageAxis = averageVec3(selectedEdgeHandles.map((handle) => vec3(handle.points[1].x - handle.points[0].x, handle.points[1].y - handle.points[0].y, handle.points[1].z - handle.points[0].z)));
    const cameraDirection = cameraRef.current.getWorldDirection(new Vector3());
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(cameraDirection.clone().normalize(), new Vector3(anchor.x, anchor.y, anchor.z));
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
    const yDragDirection = rejectVec3FromAxis(worldUp, vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z));
    const fallbackDirection = vec3LengthSquared(yDragDirection) > 0.000001
      ? yDragDirection
      : crossVec3(vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z), vec3LengthSquared(averageAxis) > 0.000001 ? averageAxis : vec3(0, 1, 0));

    setArcState({
      baseMesh: structuredClone(editableMeshSource),
      dragDirection: fallbackDirection,
      dragPlane,
      edges: selectedEdges,
      offset: 0,
      previewMesh: structuredClone(editableMeshSource),
      segments: 4,
      startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
    });
  }, [cameraRef, editableMeshHandles, editableMeshSource, pointerPositionRef, raycasterRef, resolveSelectedEditableMeshEdgePairs, selectedNode, viewportRootRef]);

  const startBevelOperation = useCallback(() => {
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

      return handle?.points && handle.points.length === 2 ? [handle as typeof handle & { points: [Vec3, Vec3] }] : [];
    });

    if (selectedEdgeHandles.length !== selectedEdges.length) {
      return;
    }

    const midpoints = selectedEdgeHandles.map((handle) => averageVec3(handle.points));
    const anchor = averageVec3(midpoints);
    const axes = selectedEdgeHandles.map((handle) => vec3(handle.points[1].x - handle.points[0].x, handle.points[1].y - handle.points[0].y, handle.points[1].z - handle.points[0].z));
    const faceHandles = createMeshEditHandles(editableMeshSource, "face");
    const faceDirections = selectedEdgeHandles
      .flatMap((edgeHandle) => {
        const midpoint = averageVec3(edgeHandle.points);
        const axis = vec3(edgeHandle.points[1].x - edgeHandle.points[0].x, edgeHandle.points[1].y - edgeHandle.points[0].y, edgeHandle.points[1].z - edgeHandle.points[0].z);

        return faceHandles
          .filter((handle) => edgeHandle.vertexIds.every((vertexId) => handle.vertexIds.includes(vertexId)))
          .map((handle) => rejectVec3FromAxis(vec3(handle.position.x - midpoint.x, handle.position.y - midpoint.y, handle.position.z - midpoint.z), axis));
      })
      .filter((direction) => vec3LengthSquared(direction) > 0.000001);
    const averageAxis = averageVec3(axes);
    const cameraDirection = cameraRef.current.getWorldDirection(new Vector3());
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(cameraDirection.clone().normalize(), new Vector3(anchor.x, anchor.y, anchor.z));
    const startPoint =
      projectPointerToThreePlane(
        pointerPositionRef.current.x + bounds.left,
        pointerPositionRef.current.y + bounds.top,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        dragPlane
      ) ?? new Vector3(anchor.x, anchor.y, anchor.z);
    const averagedFaceDirection = rejectVec3FromAxis(averageVec3(faceDirections), vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z));
    const fallbackDirection = crossVec3(vec3(cameraDirection.x, cameraDirection.y, cameraDirection.z), vec3LengthSquared(averageAxis) > 0.000001 ? averageAxis : vec3(0, 1, 0));

    setBevelState({
      baseMesh: structuredClone(editableMeshSource),
      dragDirection: vec3LengthSquared(averagedFaceDirection) > 0.000001 ? averagedFaceDirection : fallbackDirection,
      dragPlane,
      edges: selectedEdges,
      profile: "flat",
      previewMesh: structuredClone(editableMeshSource),
      startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
      steps: 1,
      width: 0
    });
  }, [cameraRef, editableMeshHandles, editableMeshSource, pointerPositionRef, raycasterRef, resolveSelectedEditableMeshEdgePairs, selectedNode, viewportRootRef]);

  const startExtrudeOperation = useCallback(() => {
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

      const handle = createBrushExtrudeHandles(selectedBrushNode.data).find((candidate) => candidate.id === brushEditHandleIds[0]);

      if (!handle?.normal) {
        return;
      }

      if (handle.kind === "edge") {
        const baseMesh = editableMeshSource;

        if (!baseMesh) {
          return;
        }

        const meshHandle = createMeshExtrudeHandles(baseMesh).find(
          (candidate) => candidate.kind === "edge" && makeUndirectedPairKey(candidate.vertexIds as [string, string]) === makeUndirectedPairKey(handle.vertexIds as [string, string])
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
        handle: structuredClone(handle as BrushExtrudeHandle),
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
          ? averageVec3(
              handles
                .filter((candidate) => candidate.kind === "face" && selectedFaceIds.includes(candidate.id))
                .map((candidate) => candidate.normal)
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
  }, [
    brushEditHandleIds,
    cameraRef,
    editableMeshSource,
    meshEditMode,
    meshEditSelectionIds,
    pointerPositionRef,
    raycasterRef,
    resolveSelectedEditableMeshFaceIds,
    selectedBrushNode,
    selectedMeshNode,
    selectedNode,
    viewportRootRef
  ]);

  const runMeshEditToolbarAction = useCallback((action: MeshEditToolbarAction) => {
    if (
      activeToolId !== "mesh-edit" ||
      !selectedNode ||
      arcState ||
      bevelState ||
      extrudeState ||
      faceCutState ||
      faceSubdivisionState ||
      materialPaintDragging ||
      sculptDragging
    ) {
      return;
    }

    if (materialPaintVisible && action !== "paint-material" && action !== "erase-material") {
      clearMaterialPaintMode();
    }

    if (sculptVisible && action !== "inflate" && action !== "deflate" && action !== "smooth") {
      clearSculptMode();
    }

    switch (action) {
      case "arc":
        if (meshEditMode === "edge") startArcOperation();
        return;
      case "bevel":
        if (meshEditMode === "edge") startBevelOperation();
        return;
      case "cut":
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
      case "delete":
        if (meshEditMode === "face") {
          const selectedFaces = resolveSelectedEditableMeshFaceIds();
          if (selectedFaces.length > 0) {
            commitMeshTopology(deleteEditableMeshFaces(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
          }
        }
        return;
      case "extrude":
        if (meshEditMode !== "vertex") startExtrudeOperation();
        return;
      case "erase-material":
        onStartMaterialPaintMode("erase");
        return;
      case "fill-face":
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
      case "inflate":
        onStartSculptMode("inflate");
        return;
      case "paint-material":
        onStartMaterialPaintMode("paint");
        return;
      case "deflate":
        onStartSculptMode("deflate");
        return;
      case "smooth":
        onStartSculptMode("smooth");
        return;
      case "invert-normals":
        if (meshEditMode === "face") {
          const selectedFaces = resolveSelectedEditableMeshFaceIds();
          if (selectedFaces.length > 0) {
            commitMeshTopology(invertEditableMeshNormals(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
            return;
          }
        }
        commitMeshTopology(invertEditableMeshNormals(editableMeshSource ?? emptyEditableMesh()));
        return;
      case "merge":
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
      case "subdivide":
        if (meshEditMode === "face") {
          startFaceSubdivisionOperation();
        }
        return;
      default:
        return;
    }
  }, [
    activeToolId,
    arcState,
    bevelState,
    clearMaterialPaintMode,
    clearSculptMode,
    commitMeshTopology,
    editableMeshSource,
    extrudeState,
    faceCutState,
    faceSubdivisionState,
    materialPaintDragging,
    materialPaintVisible,
    meshEditMode,
    onStartMaterialPaintMode,
    onStartSculptMode,
    resolveSelectedEditableMeshEdgePairs,
    resolveSelectedEditableMeshFaceIds,
    resolveSelectedEditableMeshVertexIds,
    sculptDragging,
    sculptVisible,
    selectedNode,
    startArcOperation,
    startBevelOperation,
    startExtrudeOperation,
    startFaceCutOperation,
    startFaceSubdivisionOperation
  ]);

  const runMeshEditToolbarActionRef = useRef(runMeshEditToolbarAction);
  runMeshEditToolbarActionRef.current = runMeshEditToolbarAction;

  useEffect(() => {
    if (!meshEditToolbarAction) {
      return;
    }

    runMeshEditToolbarActionRef.current(meshEditToolbarAction.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshEditToolbarAction?.id]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!arcState) return;
      event.preventDefault();
      setArcState((current) =>
        current
          ? {
              ...current,
              previewMesh: arcEditableMeshEdges(current.baseMesh, current.edges, current.offset, Math.max(2, current.segments + (event.deltaY < 0 ? 1 : -1)), current.dragDirection) ?? current.previewMesh,
              segments: Math.max(2, current.segments + (event.deltaY < 0 ? 1 : -1))
            }
          : current
      );
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [arcState]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!bevelState) return;
      event.preventDefault();
      setBevelState((current) =>
        current
          ? {
              ...current,
              previewMesh: bevelEditableMeshEdges(current.baseMesh, current.edges, current.width, Math.max(1, current.steps + (event.deltaY < 0 ? 1 : -1)), current.profile) ?? current.previewMesh,
              steps: Math.max(1, current.steps + (event.deltaY < 0 ? 1 : -1))
            }
          : current
      );
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [bevelState]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!faceSubdivisionState) return;
      event.preventDefault();
      setFaceSubdivisionState((current) =>
        current
          ? {
              ...current,
              cuts: Math.max(1, current.cuts + (event.deltaY < 0 ? 1 : -1))
            }
          : current
      );
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [faceSubdivisionState]);

  useEffect(() => {
    if (!faceSubdivisionState) {
      return;
    }

    setCameraControlsEnabled(false);
    return () => setCameraControlsEnabled(true);
  }, [faceSubdivisionState, setCameraControlsEnabled]);

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
                  previewMesh: bevelEditableMeshEdges(current.baseMesh, current.edges, current.width, current.steps, current.profile === "flat" ? "round" : "flat") ?? current.previewMesh,
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeToolId,
    arcState,
    bevelState,
    brushEditHandleIds,
    brushEditHandles,
    extrudeState,
    faceCutState,
    faceSubdivisionState,
    meshEditHandles,
    meshEditMode,
    meshEditSelectionIds,
    repeatLastMeshEditAction,
    runMeshEditToolbarAction,
    selectedBrushNode,
    selectedMeshNode,
    selectedNode,
    setTransformDragging,
    updateSelectedNodePivot
  ]);

  const updateArcPreview = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current || !arcState) {
      return;
    }

    const point = projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, arcState.dragPlane);

    if (!point) {
      return;
    }

    const offset =
      (point.x - arcState.startPoint.x) * arcState.dragDirection.x +
      (point.y - arcState.startPoint.y) * arcState.dragDirection.y +
      (point.z - arcState.startPoint.z) * arcState.dragDirection.z;

    setArcState((current) =>
      current
        ? {
            ...current,
            offset,
            previewMesh: arcEditableMeshEdges(current.baseMesh, current.edges, offset, current.segments, current.dragDirection) ?? current.previewMesh
          }
        : current
    );
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

    const point = projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, bevelState.dragPlane);

    if (!point) {
      return;
    }

    const width =
      (point.x - bevelState.startPoint.x) * bevelState.dragDirection.x +
      (point.y - bevelState.startPoint.y) * bevelState.dragDirection.y +
      (point.z - bevelState.startPoint.z) * bevelState.dragDirection.z;

    setBevelState((current) =>
      current
        ? {
            ...current,
            width,
            previewMesh: bevelEditableMeshEdges(current.baseMesh, current.edges, width, current.steps, current.profile) ?? current.previewMesh
          }
        : current
    );
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
      const previewBrush = extrudeBrushHandle(state.baseBrush, state.handle, appliedAmount, resolveExtrudeDirection(state)) ?? state.baseBrush;
      onPreviewBrushData(state.nodeId, previewBrush);

      return {
        ...state,
        amount,
        previewBrush
      };
    }

    const previewMesh =
      state.handle.kind === "face"
        ? (state.faceIds && state.faceIds.length > 1 ? extrudeEditableMeshFaces(state.baseMesh, state.faceIds, appliedAmount) : extrudeEditableMeshFace(state.baseMesh, state.handle.id, appliedAmount)) ?? state.baseMesh
        : extrudeEditableMeshEdge(state.baseMesh, state.handle.vertexIds as [string, string], appliedAmount, resolveExtrudeDirection(state)) ?? state.baseMesh;

    return {
      ...state,
      amount,
      previewMesh
    };
  }

  function updateExtrudePreview(clientX: number, clientY: number, bounds: DOMRect, stateOverride?: ExtrudeGestureState) {
    const currentExtrudeState = stateOverride ?? extrudeStateRef.current;

    if (!cameraRef.current || !currentExtrudeState) {
      return;
    }

    const point = projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, currentExtrudeState.dragPlane);

    if (!point) {
      return;
    }

    const effectiveNormal = resolveExtrudeDirection(currentExtrudeState);
    const extrusionNormal = new Vector3(effectiveNormal.x, effectiveNormal.y, effectiveNormal.z).normalize();
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
      const current = extrudeStateRef.current;
      if (!current) {
        return;
      }
      const nextState = { ...current, axisLock };
      extrudeStateRef.current = nextState;
      setExtrudeState(nextState);
      return;
    }

    const current = extrudeStateRef.current;
    if (!current) {
      return;
    }

    const nextState = { ...current, axisLock };
    const nextDirection = resolveExtrudeDirection(nextState);
    const nextDragPlane = createBrushCreateDragPlane(cameraRef.current, nextDirection, resolveExtrudeAnchor(nextState.handle.position, nextDirection, nextState.handle.kind));
    const point = projectPointerToThreePlane(pointer.x + bounds.left, pointer.y + bounds.top, bounds, cameraRef.current, raycasterRef.current, nextDragPlane);
    const nextStateWithPlane = point
      ? {
          ...nextState,
          dragPlane: nextDragPlane,
          startPoint: vec3(point.x - nextDirection.x * nextState.amount, point.y - nextDirection.y * nextState.amount, point.z - nextDirection.z * nextState.amount)
        }
      : {
          ...nextState,
          dragPlane: nextDragPlane
        };

    extrudeStateRef.current = nextStateWithPlane;
    setExtrudeState(nextStateWithPlane);
    updateExtrudePreview(pointer.x + bounds.left, pointer.y + bounds.top, bounds, nextStateWithPlane);
  }

  const handleCommitMeshEditAction = useCallback((action: LastMeshEditAction) => {
    lastMeshEditActionRef.current = action;
  }, []);

  return {
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
  };
}

function emptyEditableMesh(): EditableMesh {
  return { faces: [], halfEdges: [], vertices: [] };
}
