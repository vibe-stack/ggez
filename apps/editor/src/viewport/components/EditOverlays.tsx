import { convertBrushToEditableMesh } from "@ggez/geometry-kernel";
import { TransformControls } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { type Brush, type EditableMesh, type GeometryNode, type Transform, type Vec3, vec3 } from "@ggez/shared";
import {
  applyBrushEditTransform,
  collectMeshEdgeLoop,
  applyMeshEditTransform,
  createBrushEditHandles,
  computeBrushEditSelectionCenter,
  computeBrushEditSelectionOrientation,
  computeMeshEditSelectionCenter,
  computeMeshEditSelectionOrientation,
  createMeshEditHandles,
  type BrushEditHandle,
  type MeshEditHandle,
  type MeshEditMode
} from "@/viewport/editing";
import type { ViewportCanvasProps } from "@/viewport/types";
import type { ViewportState } from "@ggez/render-pipeline";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";
import { objectToTransform, worldPointToNodeLocal } from "@/viewport/utils/geometry";
import { findMatchingBrushEdgeHandleId, findMatchingMeshEdgePair, resolveSubobjectSelection } from "@/viewport/utils/interaction";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import { useTransformControlsCameraLock } from "@/viewport/hooks/useTransformControlsCameraLock";
import {
  BatchedHandleLineSegments,
  BatchedHandleMarkers,
  BrushEditHandleMarker,
  BrushEditHandleVisual,
  EdgeLengthLabel,
  EditableEdgeSelectionHitAreas,
  EditableFaceSelectionHitAreas,
  MeshEditHandleMarker,
  MeshEditHandleVisual,
  PreviewLine
} from "@/viewport/components/SelectionVisuals";
import { EditableMeshPreviewOverlay } from "@/viewport/components/EditableMeshPreviewOverlay";
import { Euler, Object3D, Quaternion, Vector3 } from "three";
import type { LastMeshEditAction } from "@/viewport/types";

type EdgeLabel = {
  id: string;
  position: Vec3;
  text: string;
};

export const MeshEditOverlay = memo(function MeshEditOverlay({
  cameraControlsRef,
  handles,
  meshEditMode,
  node,
  onDragStateChange,
  onCommitTransformAction,
  onPreviewMeshData: _onPreviewMeshData,
  shouldTreatAsClick,
  onUpdateMeshData,
  selectedHandleIds,
  setSelectedHandleIds,
  transformMode,
  viewport
}: {
  cameraControlsRef?: RefObject<any | null>;
  handles: MeshEditHandle[];
  meshEditMode: MeshEditMode;
  node: Extract<GeometryNode, { kind: "mesh" }>;
  onDragStateChange?: (dragging: boolean) => void;
  onCommitTransformAction?: (action: LastMeshEditAction) => void;
  onPreviewMeshData: ViewportCanvasProps["onPreviewMeshData"];
  shouldTreatAsClick?: () => boolean;
  onUpdateMeshData: ViewportCanvasProps["onUpdateMeshData"];
  selectedHandleIds: string[];
  setSelectedHandleIds: (ids: string[]) => void;
  transformMode: ViewportCanvasProps["transformMode"];
  viewport: ViewportState;
}) {
  const [controlObject, setControlObject] = useState<Object3D | null>(null);
  const controlRef = useRef<Object3D | null>(null);
  const transformControlsRef = useRef<any>(null);
  const baselineMeshRef = useRef<EditableMesh | undefined>(undefined);
  const baselineTransformRef = useRef<Transform | undefined>(undefined);
  const [previewMesh, setPreviewMesh] = useState<EditableMesh | null>(null);
  useTransformControlsCameraLock({
    cameraControlsRef,
    onDragStateChange,
    transformControlsRefs: [transformControlsRef]
  });
  const shouldResolveEdgeLabels = selectedHandleIds.length > 0 && (meshEditMode === "edge" || meshEditMode === "face");
  const edgeHandles = useMemo(
    () => (shouldResolveEdgeLabels || meshEditMode === "vertex" ? createMeshEditHandles(node.data, "edge") : []),
    [meshEditMode, node.data, shouldResolveEdgeLabels]
  );
  const faceHandles = useMemo(
    () => (shouldResolveEdgeLabels && meshEditMode === "face" ? createMeshEditHandles(node.data, "face") : []),
    [meshEditMode, node.data, shouldResolveEdgeLabels]
  );
  const vertexModeEdgeHandles = meshEditMode === "vertex" ? edgeHandles : [];
  const handlesById = useMemo(() => new Map(handles.map((handle) => [handle.id, handle])), [handles]);
  const [selectedVertexModeEdgeHandles, unselectedVertexModeEdgeHandles] = useMemo(() => {
    const selectedIds = new Set(selectedHandleIds);
    const selected: MeshEditHandle[] = [];
    const unselected: MeshEditHandle[] = [];

    vertexModeEdgeHandles.forEach((handle) => {
      if (handle.vertexIds.every((vertexId) => selectedIds.has(vertexId))) {
        selected.push(handle);
        return;
      }

      unselected.push(handle);
    });

    return [selected, unselected] as const;
  }, [selectedHandleIds, vertexModeEdgeHandles]);
  const edgeLabels = useMemo(
    () => resolveMeshEdgeLabels(edgeHandles, faceHandles, meshEditMode, node.transform, selectedHandleIds),
    [edgeHandles, faceHandles, meshEditMode, node.transform, selectedHandleIds]
  );
  const snapSize = resolveViewportSnapSize(viewport);
  const selectionCenter = useMemo(
    () => computeMeshEditSelectionCenter(handles, selectedHandleIds),
    [handles, selectedHandleIds]
  );
  const selectionOrientation = useMemo(
    () => computeMeshEditSelectionOrientation(handles, selectedHandleIds, meshEditMode),
    [handles, meshEditMode, selectedHandleIds]
  );
  const selectionPivot = selectionCenter;

  useEffect(() => {
    if (baselineMeshRef.current) {
      return;
    }

    const validIds = new Set(handles.map((handle) => handle.id));
    const nextIds = selectedHandleIds.filter((id) => validIds.has(id));

    if (nextIds.length !== selectedHandleIds.length) {
      setSelectedHandleIds(nextIds);
    }
  }, [handles, selectedHandleIds, setSelectedHandleIds]);

  useEffect(() => {
    if (!controlRef.current || selectedHandleIds.length === 0) {
      return;
    }

    if (!baselineMeshRef.current) {
      controlRef.current.position.set(selectionPivot.x, selectionPivot.y, selectionPivot.z);
      controlRef.current.rotation.set(
        selectionOrientation?.x ?? 0,
        selectionOrientation?.y ?? 0,
        selectionOrientation?.z ?? 0
      );
      controlRef.current.scale.set(1, 1, 1);
    }
  }, [selectedHandleIds.length, selectionOrientation, selectionPivot]);

  const resolveHandleSelection = (handle: MeshEditHandle, event: { altKey: boolean; point?: { x: number; y: number; z: number }; shiftKey: boolean }) => {
    if (meshEditMode !== "edge" || !event.altKey || handle.vertexIds.length !== 2) {
      setSelectedHandleIds(resolveSubobjectSelection(selectedHandleIds, handle.id, event.shiftKey));
      return;
    }

    const clickPoint = event.point
      ? worldPointToNodeLocal(vec3(event.point.x, event.point.y, event.point.z), node.transform)
      : undefined;
    const loopIds = collectMeshEdgeLoop(node.data, handle.vertexIds as [string, string], clickPoint)
      .map((edge) => handles.find((candidate) => candidate.vertexIds.length === 2 && candidate.vertexIds.every((vertexId) => edge.includes(vertexId)))?.id)
      .filter((id): id is string => Boolean(id));

    if (!event.shiftKey) {
      setSelectedHandleIds(loopIds);
      return;
    }

    const nextSelection = loopIds.every((id) => selectedHandleIds.includes(id))
      ? selectedHandleIds.filter((id) => !loopIds.includes(id))
      : Array.from(new Set([...selectedHandleIds, ...loopIds]));

    setSelectedHandleIds(nextSelection);
  };

  return (
    <>
      <NodeTransformGroup transform={node.transform}>
        <BatchedHandleLineSegments color="#94a3b8" handles={unselectedVertexModeEdgeHandles} />
        <BatchedHandleLineSegments color="#7dd3fc" handles={selectedVertexModeEdgeHandles} />

        {meshEditMode === "face" ? (
          <EditableFaceSelectionHitAreas
            handles={handles}
            onSelectHandle={(handleId, event) => {
              if (shouldTreatAsClick && !shouldTreatAsClick()) {
                return;
              }

              event.stopPropagation();
              const handle = handlesById.get(handleId);

              if (handle) {
                resolveHandleSelection(handle, event);
              }
            }}
            selectedHandleIds={selectedHandleIds}
          />
        ) : null}
        {meshEditMode === "edge" ? (
          <EditableEdgeSelectionHitAreas
            handles={handles}
            onSelectHandle={(handleId, event) => {
              if (shouldTreatAsClick && !shouldTreatAsClick()) {
                return;
              }

              event.stopPropagation();
              const handle = handlesById.get(handleId);

              if (handle) {
                resolveHandleSelection(handle, event);
              }
            }}
            selectedHandleIds={selectedHandleIds}
          />
        ) : null}
        {meshEditMode !== "vertex" ? (
          <BatchedHandleLineSegments
            closed={meshEditMode === "face"}
            color={meshEditMode === "face" ? "#67e8f9" : "#94a3b8"}
            handles={handles}
            selectedColor="#7dd3fc"
            selectedHandleIds={selectedHandleIds}
          />
        ) : null}

        {selectedHandleIds.length > 0 ? (
          <group
            ref={(object) => {
              controlRef.current = object;
              setControlObject(object);

              if (object && !baselineMeshRef.current) {
                object.position.set(selectionPivot.x, selectionPivot.y, selectionPivot.z);
                object.rotation.set(
                  selectionOrientation?.x ?? 0,
                  selectionOrientation?.y ?? 0,
                  selectionOrientation?.z ?? 0
                );
                object.scale.set(1, 1, 1);
              }
            }}
          >
            <mesh visible={false}>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </group>
        ) : null}
      </NodeTransformGroup>
      {previewMesh ? <EditableMeshPreviewOverlay mesh={previewMesh} node={node} showWireframe={false} /> : null}

      <BatchedHandleMarkers
        handles={handles}
        mode={meshEditMode}
        nodeTransform={node.transform}
        onSelectHandle={undefined}
        selectedFillColor="#dbeafe"
        selectedHandleIds={selectedHandleIds}
        unselectedFillColor={meshEditMode === "face" ? "#67e8f9" : "#cbd5e1"}
      />

      {edgeLabels.map((label) => (
        <EdgeLengthLabel
          key={`label:${label.id}`}
          nodeTransform={node.transform}
          position={label.position}
          text={label.text}
        />
      ))}

      {selectedHandleIds.length > 0 && controlObject ? (
        <TransformControls
          ref={transformControlsRef as any}
          key={`mesh-edit:${transformMode}:${selectedHandleIds.join(":")}`}
          enabled
          mode={transformMode}
          object={controlObject}
          onMouseDown={() => {
            baselineMeshRef.current = structuredClone(node.data);
            baselineTransformRef.current = objectToTransform(controlObject);
            setPreviewMesh(null);
          }}
          onMouseUp={() => {
            if (!baselineMeshRef.current || !baselineTransformRef.current) {
              return;
            }

            const currentTransform = objectToTransform(controlObject);
            const nextMesh = applyMeshEditTransform(
              baselineMeshRef.current,
              meshEditMode,
              selectedHandleIds,
              baselineTransformRef.current,
              currentTransform
            );
            onUpdateMeshData(node.id, nextMesh, baselineMeshRef.current);
            onCommitTransformAction?.({
              kind: "subobject-transform",
              mode: meshEditMode,
              rotationDelta: resolveRotationDelta(baselineTransformRef.current.rotation, currentTransform.rotation),
              scaleFactor: resolveScaleFactor(baselineTransformRef.current.scale, currentTransform.scale),
              translation: {
                x: controlObject.position.x - baselineTransformRef.current.position.x,
                y: controlObject.position.y - baselineTransformRef.current.position.y,
                z: controlObject.position.z - baselineTransformRef.current.position.z
              }
            });
            baselineMeshRef.current = undefined;
            baselineTransformRef.current = undefined;
            setPreviewMesh(null);
          }}
          onObjectChange={() => {
            if (!baselineMeshRef.current || !baselineTransformRef.current) {
              return;
            }

            const nextMesh = applyMeshEditTransform(
              baselineMeshRef.current,
              meshEditMode,
              selectedHandleIds,
              baselineTransformRef.current,
              objectToTransform(controlObject)
            );
            setPreviewMesh(nextMesh);
          }}
          rotationSnap={Math.PI / 12}
          scaleSnap={Math.max(snapSize / 16, 0.125)}
          space={selectionOrientation && transformMode !== "translate" ? "local" : "world"}
          showX
          showY
          showZ
          translationSnap={snapSize}
        />
      ) : null}
    </>
  );
}, areMeshEditOverlayPropsEqual);

export const BrushEditOverlay = memo(function BrushEditOverlay({
  cameraControlsRef,
  handles,
  meshEditMode,
  node,
  onDragStateChange,
  onCommitTransformAction,
  onPreviewBrushData: _onPreviewBrushData,
  shouldTreatAsClick,
  onUpdateBrushData,
  selectedHandleIds,
  setSelectedHandleIds,
  transformMode,
  viewport
}: {
  cameraControlsRef?: RefObject<any | null>;
  handles: BrushEditHandle[];
  meshEditMode: MeshEditMode;
  node: Extract<GeometryNode, { kind: "brush" }>;
  onDragStateChange?: (dragging: boolean) => void;
  onCommitTransformAction?: (action: LastMeshEditAction) => void;
  onPreviewBrushData: ViewportCanvasProps["onPreviewBrushData"];
  shouldTreatAsClick?: () => boolean;
  onUpdateBrushData: ViewportCanvasProps["onUpdateBrushData"];
  selectedHandleIds: string[];
  setSelectedHandleIds: (ids: string[]) => void;
  transformMode: ViewportCanvasProps["transformMode"];
  viewport: ViewportState;
}) {
  const [controlObject, setControlObject] = useState<Object3D | null>(null);
  const controlRef = useRef<Object3D | null>(null);
  const transformControlsRef = useRef<any>(null);
  const baselineBrushRef = useRef<Brush | undefined>(undefined);
  const baselineHandlesRef = useRef<BrushEditHandle[] | undefined>(undefined);
  const baselineTransformRef = useRef<Transform | undefined>(undefined);
  const [previewBrush, setPreviewBrush] = useState<Brush | null>(null);
  useTransformControlsCameraLock({
    cameraControlsRef,
    onDragStateChange,
    transformControlsRefs: [transformControlsRef]
  });
  const shouldResolveEdgeLabels = selectedHandleIds.length > 0 && (meshEditMode === "edge" || meshEditMode === "face");
  const edgeHandles = useMemo(
    () => (shouldResolveEdgeLabels || meshEditMode === "vertex" ? createBrushEditHandles(node.data, "edge") : []),
    [meshEditMode, node.data, shouldResolveEdgeLabels]
  );
  const faceHandles = useMemo(
    () => (shouldResolveEdgeLabels && meshEditMode === "face" ? createBrushEditHandles(node.data, "face") : []),
    [meshEditMode, node.data, shouldResolveEdgeLabels]
  );
  const vertexModeEdgeHandles = meshEditMode === "vertex" ? edgeHandles : [];
  const handlesById = useMemo(() => new Map(handles.map((handle) => [handle.id, handle])), [handles]);
  const [selectedVertexModeEdgeHandles, unselectedVertexModeEdgeHandles] = useMemo(() => {
    const selectedIds = new Set(selectedHandleIds);
    const selected: BrushEditHandle[] = [];
    const unselected: BrushEditHandle[] = [];

    vertexModeEdgeHandles.forEach((handle) => {
      if (handle.vertexIds.every((vertexId) => selectedIds.has(vertexId))) {
        selected.push(handle);
        return;
      }

      unselected.push(handle);
    });

    return [selected, unselected] as const;
  }, [selectedHandleIds, vertexModeEdgeHandles]);
  const edgeLabels = useMemo(
    () => resolveBrushEdgeLabels(edgeHandles, faceHandles, meshEditMode, node.transform, selectedHandleIds),
    [edgeHandles, faceHandles, meshEditMode, node.transform, selectedHandleIds]
  );
  const snapSize = resolveViewportSnapSize(viewport);
  const selectionCenter = useMemo(
    () => computeBrushEditSelectionCenter(handles, selectedHandleIds),
    [handles, selectedHandleIds]
  );
  const selectionOrientation = useMemo(
    () => computeBrushEditSelectionOrientation(handles, selectedHandleIds, meshEditMode),
    [handles, meshEditMode, selectedHandleIds]
  );
  const selectionPivot = selectionCenter;
  const editableMesh = useMemo(() => convertBrushToEditableMesh(node.data), [node.data]);
  const editableMeshHandles = useMemo(
    () => (editableMesh ? createMeshEditHandles(editableMesh, "edge") : []),
    [editableMesh]
  );

  useEffect(() => {
    if (baselineBrushRef.current) {
      return;
    }

    const validIds = new Set(handles.map((handle) => handle.id));
    const nextIds = selectedHandleIds.filter((id) => validIds.has(id));

    if (nextIds.length !== selectedHandleIds.length) {
      setSelectedHandleIds(nextIds);
    }
  }, [handles, selectedHandleIds, setSelectedHandleIds]);

  useEffect(() => {
    if (!controlRef.current || selectedHandleIds.length === 0) {
      return;
    }

    if (!baselineBrushRef.current) {
      controlRef.current.position.set(selectionPivot.x, selectionPivot.y, selectionPivot.z);
      controlRef.current.rotation.set(
        selectionOrientation?.x ?? 0,
        selectionOrientation?.y ?? 0,
        selectionOrientation?.z ?? 0
      );
      controlRef.current.scale.set(1, 1, 1);
    }
  }, [selectedHandleIds.length, selectionOrientation, selectionPivot]);

  const resolveHandleSelection = (handle: BrushEditHandle, event: { altKey: boolean; point?: { x: number; y: number; z: number }; shiftKey: boolean }) => {
    if (
      meshEditMode !== "edge" ||
      !event.altKey ||
      !editableMesh ||
      !handle.points ||
      handle.points.length !== 2
    ) {
      setSelectedHandleIds(resolveSubobjectSelection(selectedHandleIds, handle.id, event.shiftKey));
      return;
    }

    const edgePair = findMatchingMeshEdgePair(editableMeshHandles, handle);

    if (!edgePair) {
      setSelectedHandleIds(resolveSubobjectSelection(selectedHandleIds, handle.id, event.shiftKey));
      return;
    }

    const clickPoint = event.point
      ? worldPointToNodeLocal(vec3(event.point.x, event.point.y, event.point.z), node.transform)
      : undefined;
    const loopIds = collectMeshEdgeLoop(editableMesh, edgePair, clickPoint)
      .map((edge) =>
        editableMeshHandles.find(
          (candidate) => candidate.vertexIds.length === 2 && candidate.vertexIds.every((vertexId) => edge.includes(vertexId))
        )
      )
      .map((meshHandle) => (meshHandle ? findMatchingBrushEdgeHandleId(handles, meshHandle) : undefined))
      .filter((id): id is string => Boolean(id));

    if (!event.shiftKey) {
      setSelectedHandleIds(loopIds);
      return;
    }

    const nextSelection = loopIds.every((id) => selectedHandleIds.includes(id))
      ? selectedHandleIds.filter((id) => !loopIds.includes(id))
      : Array.from(new Set([...selectedHandleIds, ...loopIds]));

    setSelectedHandleIds(nextSelection);
  };

  return (
    <>
      <NodeTransformGroup transform={node.transform}>
        <BatchedHandleLineSegments color="#94a3b8" handles={unselectedVertexModeEdgeHandles} />
        <BatchedHandleLineSegments color="#7dd3fc" handles={selectedVertexModeEdgeHandles} />

        {meshEditMode === "face" ? (
          <EditableFaceSelectionHitAreas
            handles={handles}
            onSelectHandle={(handleId, event) => {
              if (shouldTreatAsClick && !shouldTreatAsClick()) {
                return;
              }

              event.stopPropagation();
              const handle = handlesById.get(handleId);

              if (handle) {
                resolveHandleSelection(handle, event);
              }
            }}
            selectedHandleIds={selectedHandleIds}
          />
        ) : null}
        {meshEditMode === "edge" ? (
          <EditableEdgeSelectionHitAreas
            handles={handles}
            onSelectHandle={(handleId, event) => {
              if (shouldTreatAsClick && !shouldTreatAsClick()) {
                return;
              }

              event.stopPropagation();
              const handle = handlesById.get(handleId);

              if (handle) {
                resolveHandleSelection(handle, event);
              }
            }}
            selectedHandleIds={selectedHandleIds}
          />
        ) : null}
        {meshEditMode !== "vertex" ? (
          <BatchedHandleLineSegments
            closed={meshEditMode === "face"}
            color={meshEditMode === "face" ? "#67e8f9" : "#94a3b8"}
            handles={handles}
            selectedColor="#7dd3fc"
            selectedHandleIds={selectedHandleIds}
          />
        ) : null}

        {selectedHandleIds.length > 0 ? (
          <group
            ref={(object) => {
              controlRef.current = object;
              setControlObject(object);

              if (object && !baselineBrushRef.current) {
                object.position.set(selectionPivot.x, selectionPivot.y, selectionPivot.z);
                object.rotation.set(
                  selectionOrientation?.x ?? 0,
                  selectionOrientation?.y ?? 0,
                  selectionOrientation?.z ?? 0
                );
                object.scale.set(1, 1, 1);
              }
            }}
          >
            <mesh visible={false}>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshBasicMaterial opacity={0} transparent />
            </mesh>
          </group>
        ) : null}
      </NodeTransformGroup>
      {previewBrush ? <EditableMeshPreviewOverlay mesh={convertBrushToEditableMesh(previewBrush)} node={node} showWireframe={false} /> : null}

      <BatchedHandleMarkers
        handles={handles}
        mode={meshEditMode}
        nodeTransform={node.transform}
        onSelectHandle={undefined}
        selectedFillColor="#dbeafe"
        selectedHandleIds={selectedHandleIds}
        unselectedFillColor="#e2e8f0"
      />

      {edgeLabels.map((label) => (
        <EdgeLengthLabel
          key={`label:${label.id}`}
          nodeTransform={node.transform}
          position={label.position}
          text={label.text}
        />
      ))}

      {selectedHandleIds.length > 0 && controlObject ? (
        <TransformControls
          ref={transformControlsRef as any}
          key={`brush-edit:${transformMode}:${selectedHandleIds.join(":")}`}
          enabled
          mode={transformMode}
          object={controlObject}
          onMouseDown={() => {
            baselineBrushRef.current = structuredClone(node.data);
            baselineHandlesRef.current = structuredClone(handles);
            baselineTransformRef.current = objectToTransform(controlObject);
            setPreviewBrush(null);
          }}
          onMouseUp={() => {
            if (!baselineBrushRef.current || !baselineTransformRef.current) {
              return;
            }

            const currentTransform = objectToTransform(controlObject);
            const nextBrush = applyBrushEditTransform(
              baselineBrushRef.current,
              baselineHandlesRef.current ?? handles,
              selectedHandleIds,
              baselineTransformRef.current,
              currentTransform,
              snapSize
            );

            if (nextBrush) {
              onUpdateBrushData(node.id, nextBrush, baselineBrushRef.current);
              onCommitTransformAction?.({
                kind: "subobject-transform",
                mode: meshEditMode,
                rotationDelta: resolveRotationDelta(baselineTransformRef.current.rotation, currentTransform.rotation),
                scaleFactor: resolveScaleFactor(baselineTransformRef.current.scale, currentTransform.scale),
                translation: {
                  x: controlObject.position.x - baselineTransformRef.current.position.x,
                  y: controlObject.position.y - baselineTransformRef.current.position.y,
                  z: controlObject.position.z - baselineTransformRef.current.position.z
                }
              });
            } else {
              setPreviewBrush(null);
            }

            baselineBrushRef.current = undefined;
            baselineHandlesRef.current = undefined;
            baselineTransformRef.current = undefined;
            setPreviewBrush(null);
          }}
          onObjectChange={() => {
            if (!baselineBrushRef.current || !baselineTransformRef.current) {
              return;
            }

            const nextBrush = applyBrushEditTransform(
              baselineBrushRef.current,
              baselineHandlesRef.current ?? handles,
              selectedHandleIds,
              baselineTransformRef.current,
              objectToTransform(controlObject),
              snapSize
            );

            if (nextBrush) {
              setPreviewBrush(nextBrush);
            }
          }}
          showX
          showY
          showZ
          rotationSnap={Math.PI / 12}
          scaleSnap={Math.max(snapSize / 16, 0.125)}
          space={selectionOrientation && transformMode !== "translate" ? "local" : "world"}
          translationSnap={snapSize}
        />
      ) : null}
    </>
  );
}, areBrushEditOverlayPropsEqual);

function areMeshEditOverlayPropsEqual(
  previous: Parameters<MeshEditOverlayInnerShim>[0],
  next: Parameters<MeshEditOverlayInnerShim>[0]
) {
  return (
    previous.cameraControlsRef === next.cameraControlsRef &&
    previous.handles === next.handles &&
    previous.meshEditMode === next.meshEditMode &&
    previous.node.id === next.node.id &&
    areTransformsEqual(previous.node.transform, next.node.transform) &&
    previous.onDragStateChange === next.onDragStateChange &&
    previous.onCommitTransformAction === next.onCommitTransformAction &&
    previous.onPreviewMeshData === next.onPreviewMeshData &&
    previous.shouldTreatAsClick === next.shouldTreatAsClick &&
    previous.onUpdateMeshData === next.onUpdateMeshData &&
    previous.selectedHandleIds === next.selectedHandleIds &&
    previous.setSelectedHandleIds === next.setSelectedHandleIds &&
    previous.transformMode === next.transformMode &&
    areViewportSnapInputsEqual(previous.viewport, next.viewport)
  );
}

function areBrushEditOverlayPropsEqual(
  previous: Parameters<BrushEditOverlayInnerShim>[0],
  next: Parameters<BrushEditOverlayInnerShim>[0]
) {
  return (
    previous.cameraControlsRef === next.cameraControlsRef &&
    previous.handles === next.handles &&
    previous.meshEditMode === next.meshEditMode &&
    previous.node.id === next.node.id &&
    previous.node.data === next.node.data &&
    areTransformsEqual(previous.node.transform, next.node.transform) &&
    previous.onDragStateChange === next.onDragStateChange &&
    previous.onCommitTransformAction === next.onCommitTransformAction &&
    previous.onPreviewBrushData === next.onPreviewBrushData &&
    previous.shouldTreatAsClick === next.shouldTreatAsClick &&
    previous.onUpdateBrushData === next.onUpdateBrushData &&
    previous.selectedHandleIds === next.selectedHandleIds &&
    previous.setSelectedHandleIds === next.setSelectedHandleIds &&
    previous.transformMode === next.transformMode &&
    areViewportSnapInputsEqual(previous.viewport, next.viewport)
  );
}

type MeshEditOverlayInnerShim = typeof meshEditOverlayComparatorShim;
type BrushEditOverlayInnerShim = typeof brushEditOverlayComparatorShim;

function meshEditOverlayComparatorShim(_props: {
  cameraControlsRef?: RefObject<any | null>;
  handles: MeshEditHandle[];
  meshEditMode: MeshEditMode;
  node: Extract<GeometryNode, { kind: "mesh" }>;
  onDragStateChange?: (dragging: boolean) => void;
  onCommitTransformAction?: (action: LastMeshEditAction) => void;
  onPreviewMeshData: ViewportCanvasProps["onPreviewMeshData"];
  shouldTreatAsClick?: () => boolean;
  onUpdateMeshData: ViewportCanvasProps["onUpdateMeshData"];
  selectedHandleIds: string[];
  setSelectedHandleIds: (ids: string[]) => void;
  transformMode: ViewportCanvasProps["transformMode"];
  viewport: ViewportState;
}) {
  return null;
}

function brushEditOverlayComparatorShim(_props: {
  cameraControlsRef?: RefObject<any | null>;
  handles: BrushEditHandle[];
  meshEditMode: MeshEditMode;
  node: Extract<GeometryNode, { kind: "brush" }>;
  onDragStateChange?: (dragging: boolean) => void;
  onCommitTransformAction?: (action: LastMeshEditAction) => void;
  onPreviewBrushData: ViewportCanvasProps["onPreviewBrushData"];
  shouldTreatAsClick?: () => boolean;
  onUpdateBrushData: ViewportCanvasProps["onUpdateBrushData"];
  selectedHandleIds: string[];
  setSelectedHandleIds: (ids: string[]) => void;
  transformMode: ViewportCanvasProps["transformMode"];
  viewport: ViewportState;
}) {
  return null;
}

function areTransformsEqual(previous: Transform, next: Transform) {
  return (
    areVec3Equal(previous.position, next.position) &&
    areVec3Equal(previous.rotation, next.rotation) &&
    areVec3Equal(previous.scale, next.scale) &&
    areOptionalVec3Equal(previous.pivot, next.pivot)
  );
}

function areViewportSnapInputsEqual(previous: ViewportState, next: ViewportState) {
  return (
    previous.grid.enabled === next.grid.enabled &&
    previous.grid.snapSize === next.grid.snapSize
  );
}

function areOptionalVec3Equal(previous?: Vec3, next?: Vec3) {
  if (!previous || !next) {
    return previous === next;
  }

  return areVec3Equal(previous, next);
}

function areVec3Equal(previous: Vec3, next: Vec3) {
  return previous.x === next.x && previous.y === next.y && previous.z === next.z;
}

function resolveMeshEdgeLabels(
  edgeHandles: MeshEditHandle[],
  faceHandles: MeshEditHandle[],
  meshEditMode: MeshEditMode,
  transform: Transform,
  selectedHandleIds: string[]
): EdgeLabel[] {
  if (selectedHandleIds.length === 0) {
    return [];
  }

  const selectedIds = new Set(selectedHandleIds);
  const affectedEdgeIds = new Set<string>();

  if (meshEditMode === "edge") {
    edgeHandles.forEach((handle) => {
      if (selectedIds.has(handle.id)) {
        affectedEdgeIds.add(handle.id);
      }
    });
  }

  if (meshEditMode === "face") {
    faceHandles.forEach((handle) => {
      if (!selectedIds.has(handle.id)) {
        return;
      }

      handle.vertexIds.forEach((vertexId, index) => {
        const nextVertexId = handle.vertexIds[(index + 1) % handle.vertexIds.length];
        affectedEdgeIds.add([vertexId, nextVertexId].sort().join(":"));
      });
    });
  }

  return edgeHandles
    .filter((handle) => affectedEdgeIds.has(handle.id) && handle.points?.length === 2)
    .map((handle) => ({
      id: handle.id,
      position: handle.position,
      text: formatWorldLength(resolveWorldEdgeLength(handle.points!, transform))
    }));
}

function resolveBrushEdgeLabels(
  edgeHandles: BrushEditHandle[],
  faceHandles: BrushEditHandle[],
  meshEditMode: MeshEditMode,
  transform: Transform,
  selectedHandleIds: string[]
): EdgeLabel[] {
  if (selectedHandleIds.length === 0) {
    return [];
  }

  const selectedIds = new Set(selectedHandleIds);
  const selectedFaceIds =
    meshEditMode === "face"
      ? new Set(
          faceHandles
            .filter((handle) => selectedIds.has(handle.id))
            .flatMap((handle) => handle.faceIds)
        )
      : new Set<string>();

  return edgeHandles
    .filter((handle) => {
      if (!handle.points || handle.points.length !== 2) {
        return false;
      }

      if (meshEditMode === "edge" && selectedIds.has(handle.id)) {
        return true;
      }

      if (meshEditMode === "face" && handle.faceIds.some((faceId) => selectedFaceIds.has(faceId))) {
        return true;
      }

      return false;
    })
    .map((handle) => ({
      id: handle.id,
      position: handle.position,
      text: formatWorldLength(resolveWorldEdgeLength(handle.points!, transform))
    }));
}

function resolveWorldEdgeLength(points: Vec3[], transform: Transform) {
  const [start, end] = points;
  const worldStart = nodePointToWorldVector(start, transform);
  const worldEnd = nodePointToWorldVector(end, transform);

  return worldStart.distanceTo(worldEnd);
}

function nodePointToWorldVector(point: Vec3, transform: Transform) {
  const worldPoint = objectToTransformPoint(point, transform);

  return new Vector3(worldPoint.x, worldPoint.y, worldPoint.z);
}

function objectToTransformPoint(point: Vec3, transform: Transform) {
  const pivot = transform.pivot ?? vec3(0, 0, 0);
  const world = new Vector3(point.x, point.y, point.z)
    .sub(new Vector3(pivot.x, pivot.y, pivot.z))
    .multiply(new Vector3(transform.scale.x, transform.scale.y, transform.scale.z))
    .applyEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ"))
    .add(new Vector3(transform.position.x, transform.position.y, transform.position.z));

  return vec3(world.x, world.y, world.z);
}

function formatWorldLength(value: number) {
  return value.toFixed(2);
}

function resolveRotationDelta(baselineRotation: Vec3, currentRotation: Vec3) {
  const baselineQuaternion = new Quaternion().setFromEuler(
    new Euler(baselineRotation.x, baselineRotation.y, baselineRotation.z, "XYZ")
  );
  const currentQuaternion = new Quaternion().setFromEuler(
    new Euler(currentRotation.x, currentRotation.y, currentRotation.z, "XYZ")
  );
  const deltaQuaternion = currentQuaternion.multiply(baselineQuaternion.invert());
  const deltaRotation = new Euler().setFromQuaternion(deltaQuaternion, "XYZ");

  return vec3(deltaRotation.x, deltaRotation.y, deltaRotation.z);
}

function resolveScaleFactor(baselineScale: Vec3, currentScale: Vec3) {
  return vec3(
    safeDivide(currentScale.x, baselineScale.x),
    safeDivide(currentScale.y, baselineScale.y),
    safeDivide(currentScale.z, baselineScale.z)
  );
}

function safeDivide(value: number, divisor: number) {
  return Math.abs(divisor) <= 0.0001 ? 1 : value / divisor;
}
