import { triangleMesh } from "crashcat";

const PLANAR_RELATIVE_EPSILON = 1e-4;
const PLANAR_ABSOLUTE_EPSILON = 1e-5;
const MIN_PLANAR_THICKNESS = 0.04;

export function createTriangleMeshShape(input: { indices: number[]; positions: number[] }) {
  const planarAxis = resolvePlanarAxis(input.positions);

  if (planarAxis === undefined) {
    return triangleMesh.create(input);
  }

  const normal = resolveTriangleNormal(input.positions, input.indices);

  if (!normal) {
    return triangleMesh.create(input);
  }

  const extruded = extrudePlanarTriangleMesh(input.positions, input.indices, normal, resolvePlanarThickness(input.positions));
  return triangleMesh.create(extruded);
}

function resolvePlanarAxis(positions: number[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const extents = [maxX - minX, maxY - minY, maxZ - minZ] as const;
  const maxExtent = Math.max(...extents);
  const threshold = Math.max(PLANAR_ABSOLUTE_EPSILON, maxExtent * PLANAR_RELATIVE_EPSILON);
  const smallestExtent = Math.min(...extents);

  if (smallestExtent > threshold) {
    return undefined;
  }

  return extents.indexOf(smallestExtent);
}

function resolvePlanarThickness(positions: number[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  return Math.max(MIN_PLANAR_THICKNESS, maxExtent * 0.01);
}

function resolveTriangleNormal(positions: number[], indices: number[]) {
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;

    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);

    if (length > 1e-6) {
      return [nx / length, ny / length, nz / length] as const;
    }
  }

  return undefined;
}

function extrudePlanarTriangleMesh(positions: number[], indices: number[], normal: readonly [number, number, number], thickness: number) {
  const halfThickness = thickness * 0.5;
  const vertexCount = positions.length / 3;
  const extrudedPositions = new Array<number>(positions.length * 2);

  for (let index = 0; index < vertexCount; index += 1) {
    const base = index * 3;
    extrudedPositions[base] = positions[base] + normal[0] * halfThickness;
    extrudedPositions[base + 1] = positions[base + 1] + normal[1] * halfThickness;
    extrudedPositions[base + 2] = positions[base + 2] + normal[2] * halfThickness;

    const mirroredBase = positions.length + base;
    extrudedPositions[mirroredBase] = positions[base] - normal[0] * halfThickness;
    extrudedPositions[mirroredBase + 1] = positions[base + 1] - normal[1] * halfThickness;
    extrudedPositions[mirroredBase + 2] = positions[base + 2] - normal[2] * halfThickness;
  }

  const extrudedIndices = [...indices];

  for (let index = 0; index + 2 < indices.length; index += 3) {
    extrudedIndices.push(
      indices[index + 2] + vertexCount,
      indices[index + 1] + vertexCount,
      indices[index] + vertexCount
    );
  }

  const edges = new Map<string, { count: number; from: number; to: number }>();

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];

    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const from = triangle[edgeIndex]!;
      const to = triangle[(edgeIndex + 1) % 3]!;
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const existing = edges.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        edges.set(key, { count: 1, from, to });
      }
    }
  }

  for (const edge of edges.values()) {
    if (edge.count !== 1) {
      continue;
    }

    const a = edge.from;
    const b = edge.to;
    const aBack = a + vertexCount;
    const bBack = b + vertexCount;

    extrudedIndices.push(a, b, bBack, a, bBack, aBack);
  }

  return {
    indices: extrudedIndices,
    positions: extrudedPositions
  };
}