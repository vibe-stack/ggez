import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { buildEditableMeshVertexNormals, paintEditableMeshMaterialLayers, sculptEditableMeshSamples, smoothEditableMeshSamples } from "@ggez/geometry-kernel";
import {
  addVec3,
  lengthVec3,
  normalizeEditableMeshMaterialLayers,
  normalizeVec3,
  scaleVec3,
  subVec3,
  vec3,
  type EditableMesh,
  type GeometryNode,
  type Transform,
  type Vec3
} from "@ggez/shared";
import { DoubleSide, Matrix4, Object3D, Raycaster, Vector2, Vector3, type Camera, type Material } from "three";
import type { DerivedRenderMesh } from "@ggez/render-pipeline";
import { projectWorldPointToClient, buildInstanceBrushSampleOffsets, buildSculptVertexRenderMap, composeInstanceBrushRotation, createInstanceBrushTransformKey, patchSculptScenePositions, resolvePaintMaterialColor, resolveViewportConstructionPlane, snapPointToViewportPlane } from "@/viewport/utils/viewport-canvas-helpers";
import { resolveBrushCreateSurfaceHit } from "@/viewport/utils/brush-create";
import type { MeshEditMode } from "@/viewport/editing";
import type { ViewportCanvasProps } from "@/viewport/types";

export type SculptBrushMode = "deflate" | "inflate" | "smooth";
export type MaterialPaintBrushMode = "erase" | "paint";

export type SculptBrushHit = {
  normal: Vec3;
  point: Vec3;
};

export type SculptBrushState = {
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

export type MaterialPaintState = {
  beforeMesh?: EditableMesh;
  dragging: boolean;
  hovered?: SculptBrushHit;
  lastPoint?: Vec3;
  materialId: string;
  mode: MaterialPaintBrushMode;
  modified: boolean;
  nodeId: string;
  opacity: number;
  paintColor: string;
  previewMesh?: EditableMesh;
  radius: number;
  strength: number;
};

export type InstanceBrushState = {
  dragging: boolean;
  hovered?: SculptBrushHit;
  lastStampedHit?: SculptBrushHit;
  pendingPlacements: Array<{ sourceNodeId: string; transform: Transform }>;
};

type BrushInteractionOptions = {
  activeToolId: ViewportCanvasProps["activeToolId"];
  brushToolMode: ViewportCanvasProps["brushToolMode"];
  editorInteractionEnabled: boolean;
  instanceBrushAlignToNormal: boolean;
  instanceBrushAverageNormal: boolean;
  instanceBrushDensity: number;
  instanceBrushRandomness: number;
  instanceBrushScaleMax: number;
  instanceBrushScaleMin: number;
  instanceBrushSize: number;
  instanceBrushSourceNodeId?: string;
  instanceBrushSourceNodeIds: string[];
  instanceBrushSourceTransform?: Transform;
  instanceBrushYOffsetMax: number;
  instanceBrushYOffsetMin: number;
  materialPaintBrushOpacity: number;
  meshEditMode: MeshEditMode;
  meshObjectsRef: MutableRefObject<Map<string, Object3D>>;
  onCommitMeshMaterialLayers: ViewportCanvasProps["onCommitMeshMaterialLayers"];
  onMaterialPaintModeChange: ViewportCanvasProps["onMaterialPaintModeChange"];
  onPlaceInstanceBrushNodes: ViewportCanvasProps["onPlaceInstanceBrushNodes"];
  onSculptModeChange: ViewportCanvasProps["onSculptModeChange"];
  onUpdateMeshData: ViewportCanvasProps["onUpdateMeshData"];
  pointerPositionRef: MutableRefObject<Vector2 | null>;
  raycasterRef: MutableRefObject<Raycaster>;
  renderMeshes: DerivedRenderMesh[];
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  selectedMaterialId: string;
  selectedMeshNode?: Extract<GeometryNode, { kind: "mesh" }>;
  selectedNode?: GeometryNode;
  setCameraControlsEnabled: (enabled: boolean) => void;
  setTransformDragging: (dragging: boolean) => void;
  snapSize: number;
  viewport: ViewportCanvasProps["viewport"];
  viewportPlane: ViewportCanvasProps["viewportPlane"];
  viewportRootRef: RefObject<HTMLDivElement | null>;
};

export function useViewportBrushInteractions({
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
  onUpdateMeshData,
  pointerPositionRef,
  raycasterRef,
  renderMeshes,
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
}: BrushInteractionOptions) {
  const [materialPaintState, setMaterialPaintState] = useState<MaterialPaintState | null>(null);
  const [instanceBrushState, setInstanceBrushState] = useState<InstanceBrushState | null>(null);
  const [sculptState, setSculptState] = useState<SculptBrushState | null>(null);
  const materialPaintStateRef = useRef<MaterialPaintState | null>(null);
  const instanceBrushStateRef = useRef<InstanceBrushState | null>(null);
  const sculptStateRef = useRef<SculptBrushState | null>(null);
  const sculptVertexMapRef = useRef<Map<string, number[]> | null>(null);
  const sculptBeforeMeshRef = useRef<EditableMesh | null>(null);
  const materialPaintStrokeFrameRef = useRef<number | null>(null);
  const sculptStrokeFrameRef = useRef<number | null>(null);
  const instanceBrushSourceNodeIdsKey = instanceBrushSourceNodeIds.join(":");

  materialPaintStateRef.current = materialPaintState;
  instanceBrushStateRef.current = instanceBrushState;
  sculptStateRef.current = sculptState;

  const resolveSelectedMeshSurfaceHit = (bounds: DOMRect, clientX: number, clientY: number): SculptBrushHit | undefined => {
    if (!selectedMeshNode) {
      return undefined;
    }

    const selectedObject = meshObjectsRef.current.get(selectedMeshNode.id);
    const camera = (viewportRootRef.current?.querySelector("canvas") ? undefined : undefined);
    void camera;

    const sceneCamera = (raycasterRef.current.camera as Camera | null) ?? null;

    if (!selectedObject || !sceneCamera) {
      return undefined;
    }

    const ndc = new Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -(((clientY - bounds.top) / bounds.height) * 2 - 1)
    );

    raycasterRef.current.setFromCamera(ndc, sceneCamera);
    const hit = intersectObjectDoubleSided(raycasterRef.current, selectedObject)[0];

    if (!hit) {
      return undefined;
    }

    const localPoint = selectedObject.worldToLocal(hit.point.clone());
    const faceNormal = hit.face?.normal?.clone() ?? new Vector3(0, 1, 0);
    const worldNormal = faceNormal.transformDirection(hit.object.matrixWorld);

    if (worldNormal.dot(raycasterRef.current.ray.direction) > 0) {
      worldNormal.multiplyScalar(-1);
    }

    const localNormal = worldNormal.transformDirection(new Matrix4().copy(selectedObject.matrixWorld).invert());
    const normal = vec3(localNormal.x, localNormal.y, localNormal.z);

    return {
      normal: lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0),
      point: vec3(localPoint.x, localPoint.y, localPoint.z)
    };
  };

  const applyMaterialPaintHit = (state: MaterialPaintState, hit: SculptBrushHit) => {
    const sourceMesh = state.previewMesh ?? state.beforeMesh;

    if (!sourceMesh || !state.materialId) {
      return state;
    }

    const spacing = Math.max(0.05, state.radius * 0.25);
    const previousPoint = state.lastPoint ?? hit.point;
    const delta = subVec3(hit.point, previousPoint);
    const distance = lengthVec3(delta);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    const samples = Array.from({ length: steps }, (_, index) => {
      const step = index + 1;
      const t = distance <= 0.000001 ? 1 : step / steps;

      return {
        point: vec3(
          previousPoint.x + delta.x * t,
          previousPoint.y + delta.y * t,
          previousPoint.z + delta.z * t
        )
      };
    });
    const nextMesh = paintEditableMeshMaterialLayers(
      sourceMesh,
      state.materialId,
      samples,
      state.radius,
      state.strength,
      state.opacity,
      state.mode === "paint" ? "add" : "erase"
    );

    return {
      ...state,
      hovered: hit,
      lastPoint: hit.point,
      modified: true,
      previewMesh: nextMesh
    } satisfies MaterialPaintState;
  };

  const updateMaterialPaintStroke = (bounds: DOMRect, clientX: number, clientY: number) => {
    const currentState = materialPaintStateRef.current;

    if (!currentState) {
      return;
    }

    const hit = resolveSelectedMeshSurfaceHit(bounds, clientX, clientY);

    if (!hit) {
      return;
    }

    const nextState = currentState.dragging
      ? applyMaterialPaintHit(currentState, hit)
      : {
          ...currentState,
          hovered: hit
        };

    materialPaintStateRef.current = nextState;
    setMaterialPaintState(nextState);
  };

  const beginMaterialPaintStroke = (bounds: DOMRect, clientX: number, clientY: number) => {
    if (!selectedMeshNode || !materialPaintStateRef.current || !selectedMaterialId) {
      return false;
    }

    const hit = resolveSelectedMeshSurfaceHit(bounds, clientX, clientY);

    if (!hit) {
      return false;
    }

    const initialState: MaterialPaintState = {
      ...materialPaintStateRef.current,
      beforeMesh: selectedMeshNode.data,
      dragging: true,
      hovered: hit,
      lastPoint: hit.point,
      materialId: materialPaintStateRef.current.materialId,
      modified: false,
      nodeId: selectedMeshNode.id,
      opacity: materialPaintBrushOpacity,
      previewMesh: undefined,
      radius: sculptBrushRadius,
      strength: sculptBrushStrength
    };
    const nextState = applyMaterialPaintHit(initialState, hit);

    materialPaintStateRef.current = nextState;
    setMaterialPaintState(nextState);
    setCameraControlsEnabled(false);
    setTransformDragging(true);
    return true;
  };

  const cancelMaterialPaintStroke = (exitMode = false) => {
    const currentState = materialPaintStateRef.current;

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
          previewMesh: undefined
        };

    materialPaintStateRef.current = nextState;
    setMaterialPaintState(nextState);
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  };

  const commitMaterialPaintStroke = () => {
    const currentState = materialPaintStateRef.current;

    if (!currentState) {
      return;
    }

    if (currentState.modified && currentState.beforeMesh && currentState.previewMesh) {
      onCommitMeshMaterialLayers(
        currentState.nodeId,
        currentState.previewMesh.materialLayers,
        currentState.beforeMesh.materialLayers
      );
    }

    const nextState = {
      ...currentState,
      beforeMesh: undefined,
      dragging: false,
      lastPoint: undefined,
      modified: false,
      previewMesh: undefined
    };

    materialPaintStateRef.current = nextState;
    setMaterialPaintState(nextState);
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  };

  const startMaterialPaintMode = (mode: MaterialPaintBrushMode) => {
    if (!selectedMeshNode || !selectedMaterialId) {
      return;
    }

    const currentState = materialPaintStateRef.current;
    const currentSculptState = sculptStateRef.current;

    if (currentState?.dragging || currentSculptState?.dragging) {
      return;
    }

    if (currentState?.mode === mode && currentState.nodeId === selectedMeshNode.id && currentState.materialId === selectedMaterialId) {
      materialPaintStateRef.current = null;
      setMaterialPaintState(null);
      return;
    }

    const resolvedMaterialId =
      mode === "erase"
        ? normalizeEditableMeshMaterialLayers(
            selectedMeshNode.data.materialLayers,
            selectedMeshNode.data.vertices.length,
            selectedMeshNode.data.materialBlend
          )?.at(-1)?.materialId ?? selectedMaterialId
        : selectedMaterialId;

    const nextState: MaterialPaintState = {
      dragging: false,
      hovered: currentState?.nodeId === selectedMeshNode.id ? currentState.hovered : undefined,
      materialId: resolvedMaterialId,
      mode,
      modified: false,
      nodeId: selectedMeshNode.id,
      opacity: materialPaintBrushOpacity,
      paintColor: resolvePaintMaterialColor(renderMeshes, selectedMeshNode, resolvedMaterialId),
      radius: sculptBrushRadius,
      strength: sculptBrushStrength
    };

    if (currentSculptState) {
      sculptStateRef.current = null;
      setSculptState(null);
    }

    materialPaintStateRef.current = nextState;
    setMaterialPaintState(nextState);

    const bounds = viewportRootRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;

    if (bounds && pointer) {
      updateMaterialPaintStroke(bounds, pointer.x + bounds.left, pointer.y + bounds.top);
    }
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

    const nextMesh =
      state.mode === "smooth"
        ? smoothEditableMeshSamples(sourceMesh, samples, state.radius, state.strength, 0.0001)
        : sculptEditableMeshSamples(sourceMesh, samples, state.radius, signedStrength, 0.0001, state.strokeVertexNormals);

    return {
      ...state,
      hovered: hit,
      lastPoint: hit.point,
      modified: true,
      previewMesh: nextMesh
    } satisfies SculptBrushState;
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
    setCameraControlsEnabled(false);
    setTransformDragging(true);
    return true;
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
    setCameraControlsEnabled(true);
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
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  };

  const startSculptMode = (mode: SculptBrushMode) => {
    if (!selectedMeshNode) {
      return;
    }

    const currentState = sculptStateRef.current;
    const currentMaterialPaintState = materialPaintStateRef.current;

    if (currentState?.dragging || currentMaterialPaintState?.dragging) {
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

    if (currentMaterialPaintState) {
      materialPaintStateRef.current = null;
      setMaterialPaintState(null);
    }

    sculptStateRef.current = nextState;
    setSculptState(nextState);

    const bounds = viewportRootRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;

    if (bounds && pointer) {
      updateSculptStroke(bounds, pointer.x + bounds.left, pointer.y + bounds.top);
    }
  };

  const resolveSceneBrushHit = (bounds: DOMRect, clientX: number, clientY: number) => {
    const sceneCamera = (raycasterRef.current.camera as Camera | null) ?? null;

    if (!sceneCamera) {
      return undefined;
    }

    const constructionPlane = resolveViewportConstructionPlane(viewportPlane, viewport);
    const hit = resolveBrushCreateSurfaceHit(
      clientX,
      clientY,
      bounds,
      sceneCamera,
      raycasterRef.current,
      meshObjectsRef.current,
      constructionPlane.point,
      constructionPlane.normal
    );

    if (!hit) {
      return undefined;
    }

    return {
      normal: hit.normal,
      point: hit.kind === "plane" && viewport.grid.enabled ? snapPointToViewportPlane(hit.point, viewportPlane, viewport, snapSize) : hit.point
    } satisfies SculptBrushHit;
  };

  const createInstanceBrushStampPlacements = (
    centerHit: SculptBrushHit,
    bounds: DOMRect,
    seededRng: () => number
  ): Array<{ sourceNodeId: string; transform: Transform }> => {
    const sceneCamera = (raycasterRef.current.camera as Camera | null) ?? null;
    if (!sceneCamera || !instanceBrushSourceTransform) {
      return [];
    }

    const sourcePool = instanceBrushSourceNodeIds.length > 0 ? instanceBrushSourceNodeIds : instanceBrushSourceNodeId ? [instanceBrushSourceNodeId] : [];

    if (sourcePool.length === 0) {
      return [];
    }

    const constructionPlane = resolveViewportConstructionPlane(viewportPlane, viewport);
    const offsets = buildInstanceBrushSampleOffsets(Math.max(1, Math.round(instanceBrushDensity)), instanceBrushRandomness);
    const hitNormal = instanceBrushAverageNormal ? centerHit.normal : undefined;
    const basis = createBrushRingBasis(centerHit.normal);
    const surfaceOffset = Math.max(0.01, instanceBrushSize * 0.01);

    return offsets.flatMap((offset) => {
      const samplePoint = addVec3(centerHit.point, addVec3(scaleVec3(basis.u, offset.x * instanceBrushSize), scaleVec3(basis.v, offset.y * instanceBrushSize)));
      const clientPoint = projectWorldPointToClient(samplePoint, sceneCamera, bounds);

      if (!clientPoint) {
        return [];
      }

      const sampleHit = resolveBrushCreateSurfaceHit(
        clientPoint.clientX,
        clientPoint.clientY,
        bounds,
        sceneCamera,
        raycasterRef.current,
        meshObjectsRef.current,
        constructionPlane.point,
        constructionPlane.normal
      );

      if (!sampleHit) {
        return [];
      }

      const normalForRotation = hitNormal ?? sampleHit.normal;
      const yOffset =
        instanceBrushYOffsetMin === instanceBrushYOffsetMax
          ? instanceBrushYOffsetMin
          : instanceBrushYOffsetMin + seededRng() * (instanceBrushYOffsetMax - instanceBrushYOffsetMin);
      const position = addVec3(addVec3(sampleHit.point, scaleVec3(sampleHit.normal, surfaceOffset)), vec3(0, yOffset, 0));
      const uniformScale =
        instanceBrushScaleMin === instanceBrushScaleMax
          ? instanceBrushScaleMin
          : instanceBrushScaleMin + seededRng() * (instanceBrushScaleMax - instanceBrushScaleMin);
      const baseScale = instanceBrushSourceTransform.scale;
      const rotation = instanceBrushAlignToNormal
        ? composeInstanceBrushRotation(normalForRotation, instanceBrushSourceTransform.rotation)
        : instanceBrushSourceTransform.rotation;
      const effectiveRandomness = Math.max(0, Math.min(1, instanceBrushRandomness));
      const sourceIndex = effectiveRandomness > 0 && sourcePool.length > 1 ? Math.floor(seededRng() * sourcePool.length) : 0;
      const sourceNodeId = sourcePool[sourceIndex] ?? sourcePool[0]!;

      return [
        {
          sourceNodeId,
          transform: {
            position,
            rotation,
            scale: { x: baseScale.x * uniformScale, y: baseScale.y * uniformScale, z: baseScale.z * uniformScale }
          }
        }
      ];
    });
  };

  const applyInstanceBrushHit = (state: InstanceBrushState, hit: SculptBrushHit, bounds: DOMRect) => {
    const hasSource = instanceBrushSourceNodeIds.length > 0 || !!instanceBrushSourceNodeId;

    if (!state.dragging || !instanceBrushSourceTransform || !hasSource) {
      return { ...state, hovered: hit };
    }

    const spacing = Math.max(0.2, instanceBrushSize * Math.max(0.18, 0.85 / Math.sqrt(Math.max(1, instanceBrushDensity))));
    const dedupeSize = Math.max(0.08, instanceBrushSize * 0.12);
    const existingKeys = new Set(state.pendingPlacements.map((placement) => createInstanceBrushTransformKey(placement.transform.position, dedupeSize)));
    let nextPendingPlacements = state.pendingPlacements;
    let nextLastStampedHit = state.lastStampedHit;
    let rngSeed = Math.floor(hit.point.x * 1000 + hit.point.z * 997 + nextPendingPlacements.length * 31);
    const rng = () => {
      rngSeed = (rngSeed * 1664525 + 1013904223) & 0xffffffff;
      return (rngSeed >>> 0) / 0x100000000;
    };

    if (!nextLastStampedHit) {
      const stamped = createInstanceBrushStampPlacements(hit, bounds, rng).filter((placement) => {
        const key = createInstanceBrushTransformKey(placement.transform.position, dedupeSize);
        if (existingKeys.has(key)) {
          return false;
        }
        existingKeys.add(key);
        return true;
      });
      nextPendingPlacements = [...nextPendingPlacements, ...stamped];
      nextLastStampedHit = hit;
    } else {
      const delta = subVec3(hit.point, nextLastStampedHit.point);
      const distance = lengthVec3(delta);

      if (distance >= spacing) {
        const startHit = nextLastStampedHit;
        let latestStampedHit = nextLastStampedHit;

        for (let travelled = spacing; travelled <= distance + 0.0001; travelled += spacing) {
          const t = distance <= 0.000001 ? 1 : travelled / distance;
          const stampedHit = {
            normal: normalizeVec3(
              vec3(
                startHit.normal.x + (hit.normal.x - startHit.normal.x) * t,
                startHit.normal.y + (hit.normal.y - startHit.normal.y) * t,
                startHit.normal.z + (hit.normal.z - startHit.normal.z) * t
              )
            ),
            point: vec3(startHit.point.x + delta.x * t, startHit.point.y + delta.y * t, startHit.point.z + delta.z * t)
          } satisfies SculptBrushHit;

          const stamped = createInstanceBrushStampPlacements(stampedHit, bounds, rng).filter((placement) => {
            const key = createInstanceBrushTransformKey(placement.transform.position, dedupeSize);
            if (existingKeys.has(key)) {
              return false;
            }
            existingKeys.add(key);
            return true;
          });

          if (stamped.length > 0) {
            nextPendingPlacements = [...nextPendingPlacements, ...stamped];
          }
          latestStampedHit = stampedHit;
        }

        nextLastStampedHit = latestStampedHit;
      }
    }

    return {
      dragging: true,
      hovered: hit,
      lastStampedHit: nextLastStampedHit,
      pendingPlacements: nextPendingPlacements
    } satisfies InstanceBrushState;
  };

  const beginInstanceBrushStroke = (bounds: DOMRect, clientX: number, clientY: number) => {
    const hasSource = instanceBrushSourceNodeIds.length > 0 || !!instanceBrushSourceNodeId;
    if (!hasSource || !instanceBrushSourceTransform) {
      return false;
    }

    const hit = resolveSceneBrushHit(bounds, clientX, clientY);

    if (!hit) {
      return false;
    }

    const nextState = applyInstanceBrushHit(
      {
        dragging: true,
        hovered: hit,
        pendingPlacements: []
      },
      hit,
      bounds
    );

    instanceBrushStateRef.current = nextState;
    setInstanceBrushState(nextState);
    setCameraControlsEnabled(false);
    setTransformDragging(true);
    return true;
  };

  const updateInstanceBrushStroke = (bounds: DOMRect, clientX: number, clientY: number) => {
    const hasSource = instanceBrushSourceNodeIds.length > 0 || !!instanceBrushSourceNodeId;
    if (!hasSource || !instanceBrushSourceTransform) {
      if (!instanceBrushStateRef.current?.dragging) {
        instanceBrushStateRef.current = null;
        setInstanceBrushState(null);
      }
      return;
    }

    const currentState = instanceBrushStateRef.current;
    const hit = resolveSceneBrushHit(bounds, clientX, clientY);

    if (!hit) {
      if (!currentState?.dragging) {
        instanceBrushStateRef.current = null;
        setInstanceBrushState(null);
      }
      return;
    }

    const nextState = currentState
      ? applyInstanceBrushHit(currentState, hit, bounds)
      : {
          dragging: false,
          hovered: hit,
          pendingPlacements: []
        } satisfies InstanceBrushState;

    instanceBrushStateRef.current = nextState;
    setInstanceBrushState(nextState);
  };

  const cancelInstanceBrushStroke = (exitMode = false) => {
    const currentState = instanceBrushStateRef.current;

    if (!currentState) {
      return;
    }

    const nextState = exitMode
      ? null
      : {
          dragging: false,
          hovered: currentState.hovered,
          pendingPlacements: []
        } satisfies InstanceBrushState;

    instanceBrushStateRef.current = nextState;
    setInstanceBrushState(nextState);
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  };

  const commitInstanceBrushStroke = () => {
    const currentState = instanceBrushStateRef.current;

    if (!currentState) {
      return;
    }

    if (currentState.pendingPlacements.length > 0) {
      onPlaceInstanceBrushNodes(currentState.pendingPlacements);
    }

    const nextState = {
      dragging: false,
      hovered: currentState.hovered,
      pendingPlacements: []
    } satisfies InstanceBrushState;

    instanceBrushStateRef.current = nextState;
    setInstanceBrushState(nextState);
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  };

  const clearMaterialPaintMode = () => {
    materialPaintStateRef.current = null;
    setMaterialPaintState(null);
  };

  const clearSculptMode = () => {
    sculptStateRef.current = null;
    setSculptState(null);
  };

  const resetBrushInteractions = () => {
    if (materialPaintStrokeFrameRef.current !== null) {
      cancelAnimationFrame(materialPaintStrokeFrameRef.current);
      materialPaintStrokeFrameRef.current = null;
    }

    if (sculptStrokeFrameRef.current !== null) {
      cancelAnimationFrame(sculptStrokeFrameRef.current);
      sculptStrokeFrameRef.current = null;
    }

    materialPaintStateRef.current = null;
    instanceBrushStateRef.current = null;
    sculptStateRef.current = null;
    setMaterialPaintState(null);
    setInstanceBrushState(null);
    setSculptState(null);
    sculptVertexMapRef.current = null;
    sculptBeforeMeshRef.current = null;
    setCameraControlsEnabled(true);
    setTransformDragging(false);
  };

  useEffect(() => {
    return () => {
      if (materialPaintStrokeFrameRef.current !== null) {
        cancelAnimationFrame(materialPaintStrokeFrameRef.current);
      }

      if (sculptStrokeFrameRef.current !== null) {
        cancelAnimationFrame(sculptStrokeFrameRef.current);
      }
    };
  }, []);

  const queueMaterialPaintStrokeFrame = () => {
    if (materialPaintStrokeFrameRef.current !== null) {
      return;
    }

    materialPaintStrokeFrameRef.current = requestAnimationFrame(() => {
      materialPaintStrokeFrameRef.current = null;
      const bounds = viewportRootRef.current?.getBoundingClientRect();
      const pointer = pointerPositionRef.current;
      const state = materialPaintStateRef.current;

      if (!state?.dragging || !bounds || !pointer) {
        return;
      }

      updateMaterialPaintStroke(bounds, pointer.x + bounds.left, pointer.y + bounds.top);

      if (materialPaintStateRef.current?.dragging) {
        queueMaterialPaintStrokeFrame();
      }
    });
  };

  const queueSculptStrokeFrame = () => {
    if (sculptStrokeFrameRef.current !== null) {
      return;
    }

    sculptStrokeFrameRef.current = requestAnimationFrame(() => {
      sculptStrokeFrameRef.current = null;
      const bounds = viewportRootRef.current?.getBoundingClientRect();
      const pointer = pointerPositionRef.current;
      const state = sculptStateRef.current;

      if (!state?.dragging || !bounds || !pointer) {
        return;
      }

      updateSculptStroke(bounds, pointer.x + bounds.left, pointer.y + bounds.top);

      if (sculptStateRef.current?.dragging) {
        queueSculptStrokeFrame();
      }
    });
  };

  useEffect(() => {
    const currentState = materialPaintStateRef.current;
    if (!currentState?.dragging) {
      if (materialPaintStrokeFrameRef.current !== null) {
        cancelAnimationFrame(materialPaintStrokeFrameRef.current);
        materialPaintStrokeFrameRef.current = null;
      }
      return;
    }

    if (materialPaintStrokeFrameRef.current !== null) {
      return;
    }

    queueMaterialPaintStrokeFrame();
  }, [materialPaintState?.dragging, pointerPositionRef, viewportRootRef]);

  useEffect(() => {
    const currentState = sculptStateRef.current;
    if (!currentState?.dragging) {
      if (sculptStrokeFrameRef.current !== null) {
        cancelAnimationFrame(sculptStrokeFrameRef.current);
        sculptStrokeFrameRef.current = null;
      }
      return;
    }

    if (sculptStrokeFrameRef.current !== null) {
      return;
    }

    queueSculptStrokeFrame();
  }, [sculptState?.dragging, pointerPositionRef, viewportRootRef]);

  useEffect(() => {
    if (!editorInteractionEnabled) {
      resetBrushInteractions();
    }
  }, [editorInteractionEnabled]);

  useEffect(() => {
    const hasSource = instanceBrushSourceNodeIds.length > 0 || !!instanceBrushSourceNodeId;

    if (activeToolId !== "brush" || brushToolMode !== "instance" || !hasSource || !instanceBrushSourceTransform) {
      instanceBrushStateRef.current = null;
      setInstanceBrushState(null);
      setTransformDragging(false);
    }
  }, [activeToolId, brushToolMode, instanceBrushSourceNodeId, instanceBrushSourceNodeIdsKey, instanceBrushSourceTransform, setTransformDragging]);

  useEffect(() => {
    setMaterialPaintState((current) =>
      current
        ? (() => {
            const nextMaterialId = current.dragging || current.mode === "erase" ? current.materialId : selectedMaterialId;

            if (
              current.materialId === nextMaterialId &&
              current.opacity === materialPaintBrushOpacity &&
              current.radius === sculptBrushRadius &&
              current.strength === sculptBrushStrength
            ) {
              return current;
            }

            return {
              ...current,
              materialId: nextMaterialId,
              opacity: materialPaintBrushOpacity,
              radius: sculptBrushRadius,
              strength: sculptBrushStrength
            };
          })()
        : current
    );
  }, [materialPaintBrushOpacity, sculptBrushRadius, sculptBrushStrength, selectedMaterialId]);

  useEffect(() => {
    setSculptState((current) =>
      current
        ? current.radius === sculptBrushRadius && current.strength === sculptBrushStrength
          ? current
          : {
              ...current,
              radius: sculptBrushRadius,
              strength: sculptBrushStrength
            }
        : current
    );
  }, [sculptBrushRadius, sculptBrushStrength]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!instanceBrushState) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelInstanceBrushStroke(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [instanceBrushState]);

  useEffect(() => {
    onMaterialPaintModeChange(materialPaintState?.mode ?? null);
  }, [materialPaintState?.mode, onMaterialPaintModeChange]);

  useEffect(() => {
    onSculptModeChange(sculptState?.mode ?? null);
  }, [onSculptModeChange, sculptState?.mode]);

  useEffect(() => {
    if (!sculptState?.dragging || !sculptState.previewMesh || !sculptState.beforeMesh) {
      if (sculptBeforeMeshRef.current && sculptVertexMapRef.current) {
        const nodeId = sculptStateRef.current?.nodeId;
        patchSculptScenePositions(
          sculptBeforeMeshRef.current,
          sculptVertexMapRef.current,
          nodeId ? meshObjectsRef.current.get(nodeId) : undefined
        );
      }
      sculptVertexMapRef.current = null;
      sculptBeforeMeshRef.current = null;
      return;
    }

    if (!sculptVertexMapRef.current) {
      sculptVertexMapRef.current = buildSculptVertexRenderMap(sculptState.beforeMesh);
      sculptBeforeMeshRef.current = sculptState.beforeMesh;
    }

    patchSculptScenePositions(
      sculptState.previewMesh,
      sculptVertexMapRef.current,
      meshObjectsRef.current.get(sculptState.nodeId)
    );
  }, [meshObjectsRef, sculptState?.dragging, sculptState?.previewMesh]);

  return {
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
  };
}

function intersectObjectDoubleSided(raycaster: Raycaster, object: Object3D) {
  const overrides: Array<{ material: Material; side: number }> = [];

  object.traverse((child) => {
    const material = (child as Object3D & { material?: Material | Material[] }).material;

    if (!material) {
      return;
    }

    const materials = Array.isArray(material) ? material : [material];

    materials.forEach((entry) => {
      overrides.push({ material: entry, side: entry.side });
      entry.side = DoubleSide;
    });
  });

  try {
    return raycaster.intersectObject(object, true);
  } finally {
    overrides.forEach(({ material, side }) => {
      material.side = side;
    });
  }
}

function createBrushRingBasis(normal: Vec3) {
  const axis = lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0);
  const reference = Math.abs(axis.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3({ x: reference.y * axis.z - reference.z * axis.y, y: reference.z * axis.x - reference.x * axis.z, z: reference.x * axis.y - reference.y * axis.x });
  const v = normalizeVec3({ x: axis.y * u.z - axis.z * u.y, y: axis.z * u.x - axis.x * u.z, z: axis.x * u.y - axis.y * u.x });

  return { u, v };
}
