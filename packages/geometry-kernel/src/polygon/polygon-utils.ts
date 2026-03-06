import earcut from "earcut";
import {
  addVec3,
  averageVec3,
  crossVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  vec3
} from "@web-hammer/shared";
import type { Vec3 } from "@web-hammer/shared";

export function computePolygonNormal(vertices: Vec3[]): Vec3 {
  if (vertices.length < 3) {
    return vec3(0, 1, 0);
  }

  let normal = vec3(0, 0, 0);

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];

    normal = addVec3(
      normal,
      vec3(
        (current.y - next.y) * (current.z + next.z),
        (current.z - next.z) * (current.x + next.x),
        (current.x - next.x) * (current.y + next.y)
      )
    );
  }

  const normalized = normalizeVec3(normal);
  return lengthVec3(normalized) === 0 ? vec3(0, 1, 0) : normalized;
}

export function projectPolygonToPlane(vertices: Vec3[], normal = computePolygonNormal(vertices)): Array<[number, number]> {
  const origin = averageVec3(vertices);
  const tangentReference = Math.abs(normal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  let tangent = normalizeVec3(crossVec3(tangentReference, normal));

  if (lengthVec3(tangent) === 0) {
    tangent = normalizeVec3(crossVec3(vec3(0, 0, 1), normal));
  }

  const bitangent = normalizeVec3(crossVec3(normal, tangent));

  return vertices.map((vertex) => {
    const offset = subVec3(vertex, origin);
    return [dotVec3(offset, tangent), dotVec3(offset, bitangent)];
  });
}

export function polygonSignedArea(points: Array<[number, number]>): number {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }

  return area * 0.5;
}

export function sortVerticesOnPlane(vertices: Vec3[], normal: Vec3): Vec3[] {
  const center = averageVec3(vertices);
  const tangentReference = Math.abs(normal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  let tangent = normalizeVec3(crossVec3(tangentReference, normal));

  if (lengthVec3(tangent) === 0) {
    tangent = normalizeVec3(crossVec3(vec3(0, 0, 1), normal));
  }

  const bitangent = normalizeVec3(crossVec3(normal, tangent));
  const sorted = [...vertices].sort((left, right) => {
    const leftOffset = subVec3(left, center);
    const rightOffset = subVec3(right, center);
    const leftAngle = Math.atan2(dotVec3(leftOffset, bitangent), dotVec3(leftOffset, tangent));
    const rightAngle = Math.atan2(dotVec3(rightOffset, bitangent), dotVec3(rightOffset, tangent));

    return leftAngle - rightAngle;
  });

  if (sorted.length < 3) {
    return sorted;
  }

  const windingNormal = normalizeVec3(
    crossVec3(subVec3(sorted[1], sorted[0]), subVec3(sorted[2], sorted[0]))
  );

  return dotVec3(windingNormal, normal) < 0 ? sorted.reverse() : sorted;
}

export function triangulatePolygon(points: Array<[number, number]>): number[] {
  const flattened = points.flatMap(([x, y]) => [x, y]);
  return earcut(flattened);
}

export function triangulatePolygon3D(vertices: Vec3[], normal = computePolygonNormal(vertices)): number[] {
  if (vertices.length < 3) {
    return [];
  }

  const projected = projectPolygonToPlane(vertices, normal);

  if (Math.abs(polygonSignedArea(projected)) <= 0.000001) {
    return [];
  }

  return triangulatePolygon(projected);
}

export function computeFaceCenter(vertices: Vec3[]): Vec3 {
  return averageVec3(vertices);
}

export function scaleFaceFromCenter(vertices: Vec3[], scale: number): Vec3[] {
  const center = computeFaceCenter(vertices);
  return vertices.map((vertex) => addVec3(center, scaleVec3(subVec3(vertex, center), scale)));
}
