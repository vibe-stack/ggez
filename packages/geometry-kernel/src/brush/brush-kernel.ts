import {
  addVec3,
  crossVec3,
  dotVec3,
  normalizeVec3,
  scaleVec3,
  vec3
} from "@web-hammer/shared";
import type { Brush, Face, Plane, Vec3 } from "@web-hammer/shared";
import { computeFaceCenter, sortVerticesOnPlane, triangulatePolygon3D } from "../polygon/polygon-utils";

export type ReconstructedBrushVertex = {
  id: string;
  position: Vec3;
};

export type ReconstructedBrushFace = Face & {
  center: Vec3;
  normal: Vec3;
  triangleIndices: number[];
  vertices: ReconstructedBrushVertex[];
};

export type BrushRebuildResult = {
  faces: ReconstructedBrushFace[];
  vertices: ReconstructedBrushVertex[];
  valid: boolean;
  errors: string[];
};

export function reconstructBrushFaces(brush: Brush, epsilon = 0.0001): BrushRebuildResult {
  if (brush.planes.length < 4) {
    return {
      faces: [],
      vertices: [],
      valid: false,
      errors: ["Brush reconstruction requires at least four planes."]
    };
  }

  const vertexRegistry = new Map<string, ReconstructedBrushVertex>();
  const faces: ReconstructedBrushFace[] = [];

  for (let planeIndex = 0; planeIndex < brush.planes.length; planeIndex += 1) {
    const plane = brush.planes[planeIndex];
    const faceVertices = collectFaceVertices(brush.planes, planeIndex, epsilon);

    if (faceVertices.length < 3) {
      continue;
    }

    const orderedVertices = sortVerticesOnPlane(faceVertices, normalizeVec3(plane.normal));
    const triangleIndices = triangulatePolygon3D(orderedVertices, plane.normal);

    if (triangleIndices.length < 3) {
      continue;
    }

    const vertices = orderedVertices.map((position) => registerBrushVertex(vertexRegistry, position, epsilon));
    const seedFace = brush.faces[planeIndex];

    faces.push({
      id: seedFace?.id ?? `face:brush:${planeIndex}`,
      plane,
      materialId: seedFace?.materialId,
      vertexIds: vertices.map((vertex) => vertex.id),
      vertices,
      center: computeFaceCenter(orderedVertices),
      normal: normalizeVec3(plane.normal),
      triangleIndices
    });
  }

  return {
    faces,
    vertices: Array.from(vertexRegistry.values()),
    valid: faces.length >= 4,
    errors: faces.length >= 4 ? [] : ["Brush reconstruction did not produce a closed convex solid."]
  };
}

export function classifyPointAgainstPlane(point: Vec3, plane: Plane, epsilon = 0.0001): "inside" | "outside" {
  const signedDistance = signedDistanceToPlane(point, plane);

  return signedDistance > epsilon ? "outside" : "inside";
}

export function signedDistanceToPlane(point: Vec3, plane: Plane): number {
  return dotVec3(plane.normal, point) - plane.distance;
}

export function intersectPlanes(
  first: Plane,
  second: Plane,
  third: Plane,
  epsilon = 0.000001
): Vec3 | undefined {
  const denominator = dotVec3(first.normal, crossVec3(second.normal, third.normal));

  if (Math.abs(denominator) <= epsilon) {
    return undefined;
  }

  const firstTerm = scaleVec3(crossVec3(second.normal, third.normal), first.distance);
  const secondTerm = scaleVec3(crossVec3(third.normal, first.normal), second.distance);
  const thirdTerm = scaleVec3(crossVec3(first.normal, second.normal), third.distance);

  return scaleVec3(addVec3(addVec3(firstTerm, secondTerm), thirdTerm), 1 / denominator);
}

function collectFaceVertices(planes: Plane[], planeIndex: number, epsilon: number): Vec3[] {
  const plane = planes[planeIndex];
  const vertices = new Map<string, Vec3>();

  for (let firstIndex = 0; firstIndex < planes.length; firstIndex += 1) {
    if (firstIndex === planeIndex) {
      continue;
    }

    for (let secondIndex = firstIndex + 1; secondIndex < planes.length; secondIndex += 1) {
      if (secondIndex === planeIndex) {
        continue;
      }

      const intersection = intersectPlanes(plane, planes[firstIndex], planes[secondIndex], epsilon);

      if (!intersection) {
        continue;
      }

      const liesOnPlane = Math.abs(signedDistanceToPlane(intersection, plane)) <= epsilon * 4;
      const insideAllPlanes = planes.every(
        (candidatePlane) => classifyPointAgainstPlane(intersection, candidatePlane, epsilon * 4) === "inside"
      );

      if (!liesOnPlane || !insideAllPlanes) {
        continue;
      }

      vertices.set(makeVertexKey(intersection, epsilon), intersection);
    }
  }

  return Array.from(vertices.values());
}

function registerBrushVertex(
  registry: Map<string, ReconstructedBrushVertex>,
  position: Vec3,
  epsilon: number
): ReconstructedBrushVertex {
  const key = makeVertexKey(position, epsilon);
  const existing = registry.get(key);

  if (existing) {
    return existing;
  }

  const vertex = {
    id: `vertex:brush:${registry.size}`,
    position: vec3(position.x, position.y, position.z)
  };

  registry.set(key, vertex);
  return vertex;
}

function makeVertexKey(position: Vec3, epsilon: number): string {
  return [
    Math.round(position.x / epsilon),
    Math.round(position.y / epsilon),
    Math.round(position.z / epsilon)
  ].join(":");
}
