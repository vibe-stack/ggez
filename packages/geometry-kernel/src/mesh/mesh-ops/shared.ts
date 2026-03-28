import type { EditableMesh, FaceID, Vec3, VertexID } from "@ggez/shared";
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
} from "@ggez/shared";
import { computePolygonNormal } from "../../polygon/polygon-utils";
import {
  createEditableMeshFromPolygons,
  getFaceVertices,
  type EditableMeshPolygon
} from "../editable-mesh";
import type {
  BevelProfilePoint,
  FacePlanePoint,
  MeshPolygonData,
  OrientedEditablePolygon
} from "./types";

type MeshPolygonCacheEntry = {
  faces: EditableMesh["faces"];
  halfEdges: EditableMesh["halfEdges"];
  polygons: MeshPolygonData[];
  vertices: EditableMesh["vertices"];
};

const meshPolygonCache = new WeakMap<EditableMesh, MeshPolygonCacheEntry>();

export function getMeshPolygons(mesh: EditableMesh): MeshPolygonData[] {
  const cached = meshPolygonCache.get(mesh);

  if (cached && cached.faces === mesh.faces && cached.halfEdges === mesh.halfEdges && cached.vertices === mesh.vertices) {
    return cached.polygons;
  }

  const polygons: Array<MeshPolygonData | undefined> = mesh.faces
    .map((face) => {
      const vertices = getFaceVertices(mesh, face.id);
      const positions = vertices.map((vertex) => vec3(vertex.position.x, vertex.position.y, vertex.position.z));
      const vertexIds = vertices.map((vertex) => vertex.id);

      if (positions.length < 3 || vertexIds.length < 3) {
        return undefined;
      }

      const polygon: MeshPolygonData = {
        center: averageVec3(positions),
        id: face.id,
        materialId: face.materialId,
        normal: computePolygonNormal(positions),
        positions,
        uvScale: face.uvScale,
        vertexIds
      };

      return polygon;
    })

  const resolved = polygons.filter((polygon): polygon is MeshPolygonData => polygon !== undefined);
  meshPolygonCache.set(mesh, {
    faces: mesh.faces,
    halfEdges: mesh.halfEdges,
    polygons: resolved,
    vertices: mesh.vertices
  });
  return resolved;
}

export function orderBoundaryEdges(
  edges: Array<{
    endId: VertexID;
    endPosition: Vec3;
    key?: string;
    startId: VertexID;
    startPosition: Vec3;
  }>
) {
  if (edges.length === 0) {
    return undefined;
  }

  const edgesByStart = new Map(edges.map((edge) => [edge.startId, edge]));
  const ordered = [edges[0]];

  while (ordered.length < edges.length) {
    const current = ordered[ordered.length - 1];
    const next = edgesByStart.get(current.endId);

    if (!next || ordered.includes(next)) {
      return undefined;
    }

    ordered.push(next);
  }

  return ordered[ordered.length - 1].endId === ordered[0].startId ? ordered : undefined;
}

export function makeUndirectedEdgeKey(left: VertexID, right: VertexID) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function findEdgeIndex(vertexIds: VertexID[], edge: [VertexID, VertexID]) {
  return vertexIds.findIndex((vertexId, index) => {
    const nextId = vertexIds[(index + 1) % vertexIds.length];
    return makeUndirectedEdgeKey(vertexId, nextId) === makeUndirectedEdgeKey(edge[0], edge[1]);
  });
}

export function areAdjacentEdgeIndices(length: number, left: number, right: number) {
  return Math.abs(left - right) === 1 || Math.abs(left - right) === length - 1;
}

export function midpoint(left: Vec3, right: Vec3) {
  return vec3((left.x + right.x) * 0.5, (left.y + right.y) * 0.5, (left.z + right.z) * 0.5);
}

export function createFacePlaneBasis(normal: Vec3) {
  const normalizedNormal = normalizeVec3(normal);
  const reference = Math.abs(normalizedNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, normalizedNormal));
  const v = normalizeVec3(crossVec3(normalizedNormal, u));

  return { u, v };
}

export function createFaceAlignedPlaneBasis(face: { normal: Vec3; positions: Vec3[] }) {
  let alignedU: Vec3 | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  face.positions.forEach((position, edgeIndex) => {
    const nextPosition = face.positions[(edgeIndex + 1) % face.positions.length];
    const edge = subVec3(nextPosition, position);
    const edgeLength = lengthVec3(edge);

    if (edgeLength <= 0.000001) {
      return;
    }

    const direction = scaleVec3(edge, 1 / edgeLength);
    const familyScore = face.positions.reduce((score, _, candidateIndex) => {
      const candidateNext = face.positions[(candidateIndex + 1) % face.positions.length];
      const candidateEdge = subVec3(candidateNext, face.positions[candidateIndex]);
      const candidateLength = lengthVec3(candidateEdge);

      if (candidateLength <= 0.000001) {
        return score;
      }

      return score + candidateLength * Math.abs(dotVec3(direction, scaleVec3(candidateEdge, 1 / candidateLength)));
    }, 0);

    if (familyScore > bestScore) {
      bestScore = familyScore;
      alignedU = direction;
    }
  });

  if (!alignedU || lengthVec3(alignedU) <= 0.000001) {
    return createFacePlaneBasis(face.normal);
  }

  const normalizedNormal = normalizeVec3(face.normal);
  const u = normalizeVec3(alignedU);
  const v = normalizeVec3(crossVec3(normalizedNormal, u));

  if (lengthVec3(v) <= 0.000001) {
    return createFacePlaneBasis(face.normal);
  }

  return { u, v };
}

export function projectFacePoint(point: Vec3, origin: Vec3, basis: { u: Vec3; v: Vec3 }): FacePlanePoint {
  const offset = subVec3(point, origin);

  return {
    u: dotVec3(offset, basis.u),
    v: dotVec3(offset, basis.v)
  };
}

export function expandPolygonWithInsertedMidpoints(
  polygon: MeshPolygonData,
  inserted: Array<{ edgeIndex: number; id: string; position: Vec3 }>
) {
  const orderedInserted = inserted.slice().sort((left, right) => left.edgeIndex - right.edgeIndex);
  const vertexIds: VertexID[] = [];
  const positions: Vec3[] = [];

  polygon.vertexIds.forEach((vertexId, index) => {
    vertexIds.push(vertexId);
    positions.push(polygon.positions[index]);

    orderedInserted
      .filter((item) => item.edgeIndex === index)
      .forEach((item) => {
        vertexIds.push(item.id);
        positions.push(item.position);
      });
  });

  return { positions, vertexIds };
}

export function ringSlice<T>(points: T[], startIndex: number, endIndex: number) {
  const loop: T[] = [];
  let index = startIndex;

  while (true) {
    loop.push(points[index]);

    if (index === endIndex) {
      break;
    }

    index = (index + 1) % points.length;
  }

  return loop;
}

export function createOrientedPolygon(
  id: FaceID,
  positions: Vec3[],
  expectedNormal?: Vec3,
  vertexIds?: VertexID[]
) {
  const compacted = compactPolygonLoop(positions, vertexIds);

  if (!compacted || compacted.positions.length < 3) {
    return undefined;
  }

  return {
    expectedNormal,
    id,
    positions: compacted.positions,
    vertexIds: compacted.vertexIds
  };
}

export function compactPolygonLoop(positions: Vec3[], vertexIds?: VertexID[]) {
  const compactedPositions: Vec3[] = [];
  const compactedVertexIds: VertexID[] = [];

  positions.forEach((position, index) => {
    const previous = compactedPositions[compactedPositions.length - 1];

    if (previous && lengthVec3(subVec3(position, previous)) <= 0.000001) {
      return;
    }

    compactedPositions.push(vec3(position.x, position.y, position.z));

    if (vertexIds) {
      compactedVertexIds.push(vertexIds[index]);
    }
  });

  if (
    compactedPositions.length > 1 &&
    lengthVec3(subVec3(compactedPositions[0], compactedPositions[compactedPositions.length - 1])) <= 0.000001
  ) {
    compactedPositions.pop();
    compactedVertexIds.pop();
  }

  return compactedPositions.length >= 3
    ? {
        positions: compactedPositions,
        vertexIds: vertexIds ? compactedVertexIds : undefined
      }
    : undefined;
}

export function pointLiesOnSegment(point: Vec3, start: Vec3, end: Vec3, epsilon = 0.0001) {
  const segment = subVec3(end, start);
  const pointOffset = subVec3(point, start);
  const segmentLengthSquared = dotVec3(segment, segment);

  if (segmentLengthSquared <= epsilon * epsilon) {
    return lengthVec3(subVec3(point, start)) <= epsilon;
  }

  const t = dotVec3(pointOffset, segment) / segmentLengthSquared;

  if (t < -epsilon || t > 1 + epsilon) {
    return false;
  }

  const closestPoint = addVec3(start, scaleVec3(segment, Math.max(0, Math.min(1, t))));
  return lengthVec3(subVec3(point, closestPoint)) <= epsilon;
}

export function replacePolygonEdge(
  polygon: MeshPolygonData,
  edge: [VertexID, VertexID],
  firstReplacement: Vec3,
  secondReplacement: Vec3
): (EditableMeshPolygon & { id: FaceID; vertexIds: VertexID[] }) | undefined {
  const edgeIndex = findEdgeIndex(polygon.vertexIds, edge);

  if (edgeIndex < 0) {
    return undefined;
  }

  const nextIndex = (edgeIndex + 1) % polygon.vertexIds.length;
  const sameOrientation = polygon.vertexIds[edgeIndex] === edge[0] && polygon.vertexIds[nextIndex] === edge[1];
  const positions = polygon.positions.map((position) => vec3(position.x, position.y, position.z));

  positions[edgeIndex] = sameOrientation ? firstReplacement : secondReplacement;
  positions[nextIndex] = sameOrientation ? secondReplacement : firstReplacement;

  return {
    id: polygon.id,
    materialId: polygon.materialId,
    positions,
    uvScale: polygon.uvScale,
    vertexIds: [...polygon.vertexIds]
  };
}

export function replacePolygonVertexWithSequence(
  polygon: OrientedEditablePolygon & { vertexIds: VertexID[] },
  targetVertexId: VertexID,
  replacementPoints: BevelProfilePoint[]
) {
  const targetIndex = polygon.vertexIds.indexOf(targetVertexId);

  if (targetIndex < 0 || replacementPoints.length === 0) {
    return {
      expectedNormal: polygon.expectedNormal,
      id: polygon.id,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      vertexIds: [...polygon.vertexIds]
    };
  }

  const positions: Vec3[] = [];
  const vertexIds: VertexID[] = [];

  polygon.vertexIds.forEach((vertexId, index) => {
    if (index !== targetIndex) {
      positions.push(vec3(polygon.positions[index].x, polygon.positions[index].y, polygon.positions[index].z));
      vertexIds.push(vertexId);
      return;
    }

    replacementPoints.forEach((point) => {
      positions.push(vec3(point.position.x, point.position.y, point.position.z));
      vertexIds.push(point.id);
    });
  });

  return {
    expectedNormal: polygon.expectedNormal,
    id: polygon.id,
    positions,
    vertexIds
  };
}

export function replacePolygonVertexWithBevelPoints(
  polygon: MeshPolygonData | OrientedEditablePolygon,
  targetVertexId: VertexID,
  firstFace: MeshPolygonData,
  secondFace: MeshPolygonData,
  firstPoint: Vec3,
  secondPoint: Vec3
): OrientedEditablePolygon & { vertexIds: VertexID[] } {
  const vertexIds = "vertexIds" in polygon && polygon.vertexIds ? [...polygon.vertexIds] : [];
  const expectedNormal =
    ("expectedNormal" in polygon ? polygon.expectedNormal : undefined) ??
    ("normal" in polygon ? polygon.normal : undefined);
  const targetIndex = vertexIds.indexOf(targetVertexId);

  if (targetIndex < 0) {
    return {
      expectedNormal,
      id: polygon.id,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      vertexIds
    };
  }

  const previousVertexId = vertexIds[(targetIndex - 1 + vertexIds.length) % vertexIds.length];
  const nextVertexId = vertexIds[(targetIndex + 1) % vertexIds.length];
  const previousUsesFirstFace = findEdgeIndex(firstFace.vertexIds, [previousVertexId, targetVertexId]) >= 0;
  const previousUsesSecondFace = findEdgeIndex(secondFace.vertexIds, [previousVertexId, targetVertexId]) >= 0;
  const nextUsesFirstFace = findEdgeIndex(firstFace.vertexIds, [targetVertexId, nextVertexId]) >= 0;
  const nextUsesSecondFace = findEdgeIndex(secondFace.vertexIds, [targetVertexId, nextVertexId]) >= 0;
  const previousReplacement = previousUsesFirstFace ? firstPoint : previousUsesSecondFace ? secondPoint : firstPoint;
  const nextReplacement = nextUsesFirstFace ? firstPoint : nextUsesSecondFace ? secondPoint : secondPoint;
  const positions: Vec3[] = [];
  const nextVertexIds: VertexID[] = [];

  vertexIds.forEach((vertexId, index) => {
    if (index !== targetIndex) {
      positions.push(vec3(polygon.positions[index].x, polygon.positions[index].y, polygon.positions[index].z));
      nextVertexIds.push(vertexId);
      return;
    }

    positions.push(vec3(previousReplacement.x, previousReplacement.y, previousReplacement.z));
    positions.push(vec3(nextReplacement.x, nextReplacement.y, nextReplacement.z));
    nextVertexIds.push(`${targetVertexId}:bevel:start`, `${targetVertexId}:bevel:end`);
  });

  return {
    expectedNormal,
    id: polygon.id,
    materialId: polygon.materialId,
    positions,
    uvScale: polygon.uvScale,
    vertexIds: nextVertexIds
  };
}

export function orientPolygonLoops(polygons: OrientedEditablePolygon[]) {
  const allPoints = polygons.flatMap((polygon) => polygon.positions);

  if (allPoints.length === 0) {
    return polygons;
  }

  const center = averageVec3(allPoints);

  return polygons.map((polygon) => {
    const normal = computePolygonNormal(polygon.positions);
    const alignedWithExpected = polygon.expectedNormal && dotVec3(normal, polygon.expectedNormal) >= 0;

    if (alignedWithExpected) {
      return polygon;
    }

    if (polygon.expectedNormal && dotVec3(normal, polygon.expectedNormal) < 0) {
      return {
        ...polygon,
        positions: polygon.positions.slice().reverse(),
        uvScale: polygon.uvScale,
        vertexIds: polygon.vertexIds?.slice().reverse()
      };
    }

    const polygonCenter = averageVec3(polygon.positions);

    return dotVec3(normal, subVec3(polygonCenter, center)) >= 0
      ? polygon
      : {
          ...polygon,
          positions: polygon.positions.slice().reverse(),
          uvScale: polygon.uvScale,
          vertexIds: polygon.vertexIds?.slice().reverse()
        };
  });
}

export function getMeshPolygonWithInsertedPoint(
  polygon: MeshPolygonData,
  edge: [VertexID, VertexID],
  insertedPoint: Vec3
): MeshPolygonData {
  const insertedPolygon = insertPointsOnPolygonEdge(
    {
      expectedNormal: polygon.normal,
      id: polygon.id,
      positions: polygon.positions,
      vertexIds: polygon.vertexIds
    },
    edge,
    [
      {
        id: `inserted:${polygon.id}:${edge[0]}:${edge[1]}`,
        position: insertedPoint
      }
    ]
  );

  return {
    center: averageVec3(insertedPolygon.positions),
    id: insertedPolygon.id,
    materialId: polygon.materialId,
    normal: polygon.normal,
    positions: insertedPolygon.positions,
    uvScale: polygon.uvScale,
    vertexIds: insertedPolygon.vertexIds ?? polygon.vertexIds
  };
}

export function insertPointsOnPolygonEdge(
  polygon: OrientedEditablePolygon & { vertexIds: VertexID[] },
  edge: [VertexID, VertexID],
  insertedPoints: Array<{ id: VertexID; position: Vec3 }>
): OrientedEditablePolygon & { vertexIds: VertexID[] } {
  const edgeIndex = findEdgeIndex(polygon.vertexIds, edge);

  if (edgeIndex < 0 || insertedPoints.length === 0) {
    return {
      ...polygon,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      uvScale: polygon.uvScale,
      vertexIds: [...polygon.vertexIds]
    };
  }

  const nextIndex = (edgeIndex + 1) % polygon.vertexIds.length;
  const sameOrientation = polygon.vertexIds[edgeIndex] === edge[0] && polygon.vertexIds[nextIndex] === edge[1];
  const orderedInsertions = sameOrientation ? insertedPoints : insertedPoints.slice().reverse();
  const positions: Vec3[] = [];
  const vertexIds: VertexID[] = [];

  polygon.vertexIds.forEach((vertexId, index) => {
    vertexIds.push(vertexId);
    positions.push(vec3(polygon.positions[index].x, polygon.positions[index].y, polygon.positions[index].z));

    if (index === edgeIndex) {
      orderedInsertions.forEach((inserted) => {
        vertexIds.push(inserted.id);
        positions.push(vec3(inserted.position.x, inserted.position.y, inserted.position.z));
      });
    }
  });

  return {
    expectedNormal: polygon.expectedNormal,
    id: polygon.id,
    materialId: polygon.materialId,
    positions,
    uvScale: polygon.uvScale,
    vertexIds
  };
}

export function splitPolygonAlongInsertedEdge(
  polygon: OrientedEditablePolygon & { vertexIds: VertexID[] },
  edge: [VertexID, VertexID],
  insertedPoints: Array<{ id: VertexID; position: Vec3 }>
): Array<OrientedEditablePolygon & { vertexIds: VertexID[] }> {
  const edgeIndex = findEdgeIndex(polygon.vertexIds, edge);

  if (edgeIndex < 0 || insertedPoints.length === 0) {
    return [
      {
        expectedNormal: polygon.expectedNormal,
        id: polygon.id,
        materialId: polygon.materialId,
        positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
        uvScale: polygon.uvScale,
        vertexIds: [...polygon.vertexIds]
      }
    ];
  }

  const nextIndex = (edgeIndex + 1) % polygon.vertexIds.length;
  const previousIndex = (edgeIndex - 1 + polygon.vertexIds.length) % polygon.vertexIds.length;
  const sameOrientation = polygon.vertexIds[edgeIndex] === edge[0] && polygon.vertexIds[nextIndex] === edge[1];
  const orderedInsertions = sameOrientation ? insertedPoints : insertedPoints.slice().reverse();
  const anchor = {
    id: polygon.vertexIds[previousIndex],
    position: vec3(
      polygon.positions[previousIndex].x,
      polygon.positions[previousIndex].y,
      polygon.positions[previousIndex].z
    )
  };
  const chain = [
    {
      id: polygon.vertexIds[edgeIndex],
      position: vec3(polygon.positions[edgeIndex].x, polygon.positions[edgeIndex].y, polygon.positions[edgeIndex].z)
    },
    ...orderedInsertions.map((inserted) => ({
      id: inserted.id,
      position: vec3(inserted.position.x, inserted.position.y, inserted.position.z)
    })),
    {
      id: polygon.vertexIds[nextIndex],
      position: vec3(polygon.positions[nextIndex].x, polygon.positions[nextIndex].y, polygon.positions[nextIndex].z)
    }
  ];
  const tailVertexIds: VertexID[] = [];
  const tailPositions: Vec3[] = [];

  for (
    let index = (nextIndex + 1) % polygon.vertexIds.length;
    index !== previousIndex;
    index = (index + 1) % polygon.vertexIds.length
  ) {
    tailVertexIds.push(polygon.vertexIds[index]);
    tailPositions.push(vec3(polygon.positions[index].x, polygon.positions[index].y, polygon.positions[index].z));
  }

  const nextPolygons: Array<OrientedEditablePolygon & { vertexIds: VertexID[] }> = [];

  for (let index = 0; index < chain.length - 2; index += 1) {
    const triangle = createOrientedPolygon(
      `${polygon.id}:split:${edgeIndex}:${index}`,
      [anchor.position, chain[index].position, chain[index + 1].position],
      polygon.expectedNormal,
      [anchor.id, chain[index].id, chain[index + 1].id]
    );

    if (triangle?.vertexIds) {
      nextPolygons.push({
        expectedNormal: triangle.expectedNormal,
        id: triangle.id,
        materialId: polygon.materialId,
        positions: triangle.positions,
        uvScale: polygon.uvScale,
        vertexIds: triangle.vertexIds
      });
    }
  }

  const remainder = createOrientedPolygon(
    `${polygon.id}:split:${edgeIndex}:remainder`,
    [anchor.position, chain[chain.length - 2].position, chain[chain.length - 1].position, ...tailPositions],
    polygon.expectedNormal,
    [anchor.id, chain[chain.length - 2].id, chain[chain.length - 1].id, ...tailVertexIds]
  );

  if (remainder?.vertexIds) {
    nextPolygons.push({
      expectedNormal: remainder.expectedNormal,
      id: remainder.id,
      materialId: polygon.materialId,
      positions: remainder.positions,
      uvScale: polygon.uvScale,
      vertexIds: remainder.vertexIds
    });
  }

  return nextPolygons.length > 0
    ? nextPolygons
    : [
        {
          expectedNormal: polygon.expectedNormal,
          id: polygon.id,
          materialId: polygon.materialId,
          positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
          uvScale: polygon.uvScale,
          vertexIds: [...polygon.vertexIds]
        }
      ];
}

export function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const normalizedAxis = normalizeVec3(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return addVec3(
    addVec3(scaleVec3(vector, cosine), scaleVec3(crossVec3(normalizedAxis, vector), sine)),
    scaleVec3(normalizedAxis, dotVec3(normalizedAxis, vector) * (1 - cosine))
  );
}

export function lerpVec3(left: Vec3, right: Vec3, t: number): Vec3 {
  return vec3(
    left.x + (right.x - left.x) * t,
    left.y + (right.y - left.y) * t,
    left.z + (right.z - left.z) * t
  );
}

export { createEditableMeshFromPolygons };
