import { getFaceVertexIds, triangulateMeshFace } from "@ggez/geometry-kernel";
import { normalizeEditableMeshMaterialLayers } from "@ggez/shared";
import {
  lengthVec3,
  normalizeVec3,
  snapValue,
  vec3,
  type EditableMesh,
  type GeometryNode,
  type ScenePathDefinition,
  type Vec3
} from "@ggez/shared";
import { Mesh, Object3D, type BufferGeometry, Camera, Float32BufferAttribute, Quaternion, Euler, Vector3 } from "three";
import type { DerivedRenderMesh } from "@ggez/render-pipeline";
import type { ViewportCanvasProps } from "@/viewport/types";

export function resolveViewportConstructionPlane(
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

export function snapPointToViewportPlane(
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

export function snapPathEditorPoint(
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

export function createNextScenePathDefinition(paths: ScenePathDefinition[]): ScenePathDefinition {
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

export function appendScenePathPoint(paths: ScenePathDefinition[], pathId: string, point: Vec3) {
  return paths.map((pathDefinition) =>
    pathDefinition.id === pathId
      ? {
          ...pathDefinition,
          points: [...pathDefinition.points, point]
        }
      : pathDefinition
  );
}

export function insertScenePathPoint(paths: ScenePathDefinition[], pathId: string, insertIndex: number, point: Vec3) {
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

export function updateScenePathPoint(paths: ScenePathDefinition[], pathId: string, pointIndex: number, point: Vec3) {
  return paths.map((pathDefinition) =>
    pathDefinition.id === pathId
      ? {
          ...pathDefinition,
          points: pathDefinition.points.map((entry, index) => (index === pointIndex ? point : entry))
        }
      : pathDefinition
  );
}

export function findPathPointHit(
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

export function findPathSegmentHit(
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
      const distance = distanceToScreenSegment(pointer, start, end);

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

export function findEditableEdgeHandleHit(
  handles: Array<{ id: string; points?: Vec3[] }>,
  selectedIds: ReadonlySet<string>,
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  camera: Camera,
  node: GeometryNode,
  projectLocalPointToScreen: (point: Vec3, node: GeometryNode, camera: Camera, bounds: DOMRect) => { x: number; y: number },
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

export type ComparableOverlayHandle = {
  faceIds?: string[];
  id: string;
  normal?: Vec3;
  points?: Vec3[];
  position: Vec3;
  vertexIds: string[];
};

export function areOverlayHandlesEqual<T extends ComparableOverlayHandle>(previous: T[], next: T[]) {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((handle, index) => areOverlayHandleEqual(handle, next[index]));
}

export function vec3ApproximatelyEqual(left: Vec3, right: Vec3, epsilon = 0.0001) {
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.z - right.z) <= epsilon
  );
}

export function buildInstanceBrushSampleOffsets(count: number, randomness: number) {
  const normalizedRandomness = Math.max(0, Math.min(1, randomness));
  const safeCount = Math.max(1, count);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: safeCount }, (_, index) => {
    const uniformRadius = Math.sqrt((index + 0.5) / safeCount);
    const uniformAngle = index * goldenAngle;
    const randomRadius = Math.sqrt(Math.random());
    const randomAngle = Math.random() * Math.PI * 2;
    const x = Math.cos(uniformAngle) * uniformRadius * (1 - normalizedRandomness) + Math.cos(randomAngle) * randomRadius * normalizedRandomness;
    const y = Math.sin(uniformAngle) * uniformRadius * (1 - normalizedRandomness) + Math.sin(randomAngle) * randomRadius * normalizedRandomness;
    const length = Math.hypot(x, y);

    if (length <= 1) {
      return { x, y };
    }

    return {
      x: x / length,
      y: y / length
    };
  });
}

export function projectWorldPointToClient(point: Vec3, camera: Camera, bounds: DOMRect) {
  const projected = new Vector3(point.x, point.y, point.z).project(camera);

  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) {
    return undefined;
  }

  return {
    clientX: bounds.left + ((projected.x + 1) * 0.5) * bounds.width,
    clientY: bounds.top + ((1 - projected.y) * 0.5) * bounds.height
  };
}

export function composeInstanceBrushRotation(normal: Vec3, baseRotation: Vec3) {
  const alignedNormal = lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0);
  const alignment = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    new Vector3(alignedNormal.x, alignedNormal.y, alignedNormal.z)
  );
  const base = new Quaternion().setFromEuler(new Euler(baseRotation.x, baseRotation.y, baseRotation.z, "XYZ"));
  const rotation = alignment.multiply(base);
  const euler = new Euler().setFromQuaternion(rotation, "XYZ");

  return vec3(euler.x, euler.y, euler.z);
}

export function createInstanceBrushTransformKey(position: Vec3, cellSize: number) {
  return [
    snapValue(position.x, cellSize),
    snapValue(position.y, cellSize),
    snapValue(position.z, cellSize)
  ].join(":");
}

export function resolveNodeIdFromIntersection(intersection: { instanceId?: number; object: Object3D }) {
  return typeof intersection.instanceId === "number"
    ? resolveInstancedNodeIdFromSceneObject(intersection.object, intersection.instanceId)
    : resolveNodeIdFromSceneObject(intersection.object);
}

export function resolveExtrudeAnchor(
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

export function buildSculptVertexRenderMap(mesh: EditableMesh): Map<string, number[]> {
  const map = new Map<string, number[]>();
  let renderOffset = 0;

  mesh.faces.forEach((face) => {
    const triangulated = triangulateMeshFace(mesh, face.id);
    const vertexIds = getFaceVertexIds(mesh, face.id);

    if (!triangulated || vertexIds.length === 0) {
      return;
    }

    vertexIds.forEach((vertexId, index) => {
      const indices = map.get(vertexId);
      const renderIndex = renderOffset + index;

      if (indices) {
        indices.push(renderIndex);
      } else {
        map.set(vertexId, [renderIndex]);
      }
    });

    renderOffset += vertexIds.length;
  });

  return map;
}

export function patchSculptScenePositions(
  mesh: EditableMesh,
  vertexMap: Map<string, number[]>,
  sceneObject: Object3D | undefined
) {
  if (!sceneObject) {
    return;
  }

  let geometry: BufferGeometry | null = null;
  sceneObject.traverse((child) => {
    if (!geometry && child instanceof Mesh) {
      const position = child.geometry.getAttribute("position");

      if (position) {
        geometry = child.geometry as BufferGeometry;
      }
    }
  });

  if (!geometry) {
    return;
  }

  const resolvedGeometry = geometry as BufferGeometry;
  const positionAttribute = resolvedGeometry.getAttribute("position") as Float32BufferAttribute | null;

  if (!positionAttribute) {
    return;
  }

  const positionArray = positionAttribute.array as Float32Array;

  for (const vertex of mesh.vertices) {
    const indices = vertexMap.get(vertex.id);

    if (!indices) {
      continue;
    }

    for (const index of indices) {
      const base = index * 3;

      if (base + 2 >= positionArray.length) {
        continue;
      }

      positionArray[base] = vertex.position.x;
      positionArray[base + 1] = vertex.position.y;
      positionArray[base + 2] = vertex.position.z;
    }
  }

  positionAttribute.needsUpdate = true;
  resolvedGeometry.computeVertexNormals();
}

export function resolveExtrudeInteractionNormal(
  _camera: Camera,
  normal: { x: number; y: number; z: number },
  _kind: "edge" | "face"
) {
  return vec3(normal.x, normal.y, normal.z);
}

export function resolveExtrudeAmountSign(
  _interactionNormal: { x: number; y: number; z: number },
  _handleNormal: { x: number; y: number; z: number },
  _kind: "edge" | "face"
): 1 | -1 {
  return 1;
}

export function resolvePaintMaterialColor(
  renderMeshes: DerivedRenderMesh[],
  meshNode: Extract<GeometryNode, { kind: "mesh" }>,
  materialId: string
): string {
  const renderMesh = renderMeshes.find((mesh) => mesh.nodeId === meshNode.id);

  if (!renderMesh?.materialLayers) {
    return "#f97316";
  }

  const normalizedLayers = normalizeEditableMeshMaterialLayers(
    meshNode.data.materialLayers,
    meshNode.data.vertices.length,
    meshNode.data.materialBlend
  );
  const layerIndex = normalizedLayers?.findIndex((layer) => layer.materialId === materialId) ?? -1;

  return renderMesh.materialLayers[layerIndex]?.material.color ?? "#f97316";
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

function areOverlayHandleEqual(previous: ComparableOverlayHandle, next: ComparableOverlayHandle) {
  return (
    previous === next ||
    (previous.id === next.id &&
      areVec3Equal(previous.position, next.position) &&
      areOptionalVec3Equal(previous.normal, next.normal) &&
      areVec3ArraysEqual(previous.points, next.points) &&
      areStringArraysEqual(previous.vertexIds, next.vertexIds) &&
      areStringArraysEqual(previous.faceIds, next.faceIds))
  );
}

function areVec3ArraysEqual(previous?: Vec3[], next?: Vec3[]) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return previous === next;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((point, index) => areVec3Equal(point, next[index]));
}

function areStringArraysEqual(previous?: string[], next?: string[]) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return previous === next;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((value, index) => value === next[index]);
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
