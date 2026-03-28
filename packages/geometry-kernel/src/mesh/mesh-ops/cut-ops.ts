import type { EditableMesh, FaceID, Vec3, VertexID } from "@ggez/shared";
import { snapValue, vec3 } from "@ggez/shared";
import {
  areAdjacentEdgeIndices,
  createEditableMeshFromPolygons,
  createFaceAlignedPlaneBasis,
  expandPolygonWithInsertedMidpoints,
  findEdgeIndex,
  getMeshPolygons,
  insertPointsOnPolygonEdge,
  lerpVec3,
  midpoint,
  orientPolygonLoops,
  projectFacePoint,
  ringSlice
} from "./shared";
import type { FacePlanePoint, OrientedEditablePolygon, ResolvedFaceCut } from "./types";

export function cutEditableMeshBetweenEdges(
  mesh: EditableMesh,
  edges: Array<[VertexID, VertexID]>
): EditableMesh | undefined {
  if (edges.length !== 2) {
    return undefined;
  }

  const polygons = getMeshPolygons(mesh);
  const target = polygons.find((polygon) => edges.every((edge) => findEdgeIndex(polygon.vertexIds, edge) >= 0));

  if (!target) {
    return undefined;
  }

  const firstIndex = findEdgeIndex(target.vertexIds, edges[0]);
  const secondIndex = findEdgeIndex(target.vertexIds, edges[1]);

  if (firstIndex < 0 || secondIndex < 0 || areAdjacentEdgeIndices(target.vertexIds.length, firstIndex, secondIndex)) {
    return undefined;
  }

  const firstMidpoint = midpoint(target.positions[firstIndex], target.positions[(firstIndex + 1) % target.positions.length]);
  const secondMidpoint = midpoint(target.positions[secondIndex], target.positions[(secondIndex + 1) % target.positions.length]);
  const [firstCutVertexId, secondCutVertexId] = buildCutVertexIds(target.id, firstIndex, secondIndex);
  const expanded = expandPolygonWithInsertedMidpoints(target, [
    { edgeIndex: firstIndex, id: firstCutVertexId, position: firstMidpoint },
    { edgeIndex: secondIndex, id: secondCutVertexId, position: secondMidpoint }
  ]);
  const cutAIndex = expanded.vertexIds.indexOf(firstCutVertexId);
  const cutBIndex = expanded.vertexIds.indexOf(secondCutVertexId);

  if (cutAIndex < 0 || cutBIndex < 0) {
    return undefined;
  }

  const firstPolygon = ringSlice(expanded.positions, cutAIndex, cutBIndex);
  const secondPolygon = ringSlice(expanded.positions, cutBIndex, cutAIndex);
  const firstPolygonVertexIds = ringSlice(expanded.vertexIds, cutAIndex, cutBIndex);
  const secondPolygonVertexIds = ringSlice(expanded.vertexIds, cutBIndex, cutAIndex);

  if (firstPolygon.length < 3 || secondPolygon.length < 3) {
    return undefined;
  }

  const nextPolygons: OrientedEditablePolygon[] = polygons
    .filter((polygon) => polygon.id !== target.id)
    .map((polygon) => {
      let nextPolygon: OrientedEditablePolygon & { vertexIds: VertexID[] } = {
        expectedNormal: polygon.normal,
        id: polygon.id,
        materialId: polygon.materialId,
        positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
        uvScale: polygon.uvScale,
        vertexIds: [...polygon.vertexIds]
      };

      if (findEdgeIndex(polygon.vertexIds, edges[0]) >= 0) {
        nextPolygon = insertPointsOnPolygonEdge(nextPolygon, edges[0], [{ id: firstCutVertexId, position: firstMidpoint }]);
      }

      if (findEdgeIndex(polygon.vertexIds, edges[1]) >= 0) {
        nextPolygon = insertPointsOnPolygonEdge(nextPolygon, edges[1], [{ id: secondCutVertexId, position: secondMidpoint }]);
      }

      return {
        expectedNormal: nextPolygon.expectedNormal,
        id: nextPolygon.id,
        materialId: nextPolygon.materialId,
        positions: nextPolygon.positions,
        uvScale: nextPolygon.uvScale,
        vertexIds: nextPolygon.vertexIds
      };
    });

  nextPolygons.push(
    {
      id: `${target.id}:cut:1`,
      materialId: target.materialId,
      positions: firstPolygon,
      uvScale: target.uvScale,
      vertexIds: firstPolygonVertexIds
    },
    {
      id: `${target.id}:cut:2`,
      materialId: target.materialId,
      positions: secondPolygon,
      uvScale: target.uvScale,
      vertexIds: secondPolygonVertexIds
    }
  );

  return createEditableMeshFromPolygons(orientPolygonLoops(nextPolygons));
}

export function buildEditableMeshFaceCutPreview(
  mesh: EditableMesh,
  faceId: FaceID,
  point: Vec3,
  snapSize: number,
  epsilon = 0.0001
): { end: Vec3; start: Vec3 } | undefined {
  const resolvedCut = resolveEditableMeshFaceCut(mesh, faceId, point, snapSize, epsilon);

  if (!resolvedCut) {
    return undefined;
  }

  return {
    end: resolvedCut.end,
    start: resolvedCut.start
  };
}

export function cutEditableMeshFace(
  mesh: EditableMesh,
  faceId: FaceID,
  point: Vec3,
  snapSize: number,
  epsilon = 0.0001
): EditableMesh | undefined {
  const resolvedCut = resolveEditableMeshFaceCut(mesh, faceId, point, snapSize, epsilon);

  if (!resolvedCut) {
    return undefined;
  }

  const [firstCutVertexId, secondCutVertexId] = buildCutVertexIds(
    resolvedCut.target.id,
    resolvedCut.firstEdgeIndex,
    resolvedCut.secondEdgeIndex
  );
  const expanded = expandPolygonWithInsertedMidpoints(resolvedCut.target, [
    {
      edgeIndex: resolvedCut.firstEdgeIndex,
      id: firstCutVertexId,
      position: resolvedCut.firstPoint
    },
    {
      edgeIndex: resolvedCut.secondEdgeIndex,
      id: secondCutVertexId,
      position: resolvedCut.secondPoint
    }
  ]);
  const cutAIndex = expanded.vertexIds.indexOf(firstCutVertexId);
  const cutBIndex = expanded.vertexIds.indexOf(secondCutVertexId);

  if (cutAIndex < 0 || cutBIndex < 0) {
    return undefined;
  }

  const firstPolygon = ringSlice(expanded.positions, cutAIndex, cutBIndex);
  const secondPolygon = ringSlice(expanded.positions, cutBIndex, cutAIndex);
  const firstPolygonVertexIds = ringSlice(expanded.vertexIds, cutAIndex, cutBIndex);
  const secondPolygonVertexIds = ringSlice(expanded.vertexIds, cutBIndex, cutAIndex);

  if (firstPolygon.length < 3 || secondPolygon.length < 3) {
    return undefined;
  }

  const nextPolygons: OrientedEditablePolygon[] = getMeshPolygons(mesh)
    .filter((polygon) => polygon.id !== resolvedCut.target.id)
    .map((polygon) => {
      let nextPolygon: OrientedEditablePolygon & { vertexIds: VertexID[] } = {
        expectedNormal: polygon.normal,
        id: polygon.id,
        materialId: polygon.materialId,
        positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
        uvScale: polygon.uvScale,
        vertexIds: [...polygon.vertexIds]
      };

      if (findEdgeIndex(polygon.vertexIds, resolvedCut.firstEdge) >= 0) {
        nextPolygon = insertPointsOnPolygonEdge(nextPolygon, resolvedCut.firstEdge, [
          { id: firstCutVertexId, position: resolvedCut.firstPoint }
        ]);
      }

      if (findEdgeIndex(polygon.vertexIds, resolvedCut.secondEdge) >= 0) {
        nextPolygon = insertPointsOnPolygonEdge(nextPolygon, resolvedCut.secondEdge, [
          { id: secondCutVertexId, position: resolvedCut.secondPoint }
        ]);
      }

      return {
        expectedNormal: nextPolygon.expectedNormal,
        id: nextPolygon.id,
        materialId: nextPolygon.materialId,
        positions: nextPolygon.positions,
        uvScale: nextPolygon.uvScale,
        vertexIds: nextPolygon.vertexIds
      };
    });

  nextPolygons.push(
    {
      expectedNormal: resolvedCut.target.normal,
      id: `${resolvedCut.target.id}:cut:1`,
      materialId: resolvedCut.target.materialId,
      positions: firstPolygon,
      uvScale: resolvedCut.target.uvScale,
      vertexIds: firstPolygonVertexIds
    },
    {
      expectedNormal: resolvedCut.target.normal,
      id: `${resolvedCut.target.id}:cut:2`,
      materialId: resolvedCut.target.materialId,
      positions: secondPolygon,
      uvScale: resolvedCut.target.uvScale,
      vertexIds: secondPolygonVertexIds
    }
  );

  return createEditableMeshFromPolygons(orientPolygonLoops(nextPolygons));
}

function resolveEditableMeshFaceCut(
  mesh: EditableMesh,
  faceId: FaceID,
  point: Vec3,
  snapSize: number,
  epsilon: number
): ResolvedFaceCut | undefined {
  const target = getMeshPolygons(mesh).find((polygon) => polygon.id === faceId);

  if (!target || target.positions.length < 3) {
    return undefined;
  }

  const basis = createFaceAlignedPlaneBasis(target);
  const projectedPoint = projectFacePoint(point, target.center, basis);
  const projectedPositions = target.positions.map((position) => projectFacePoint(position, target.center, basis));
  const bounds = {
    u: projectedPositions.reduce(
      (current, candidate) => ({
        max: Math.max(current.max, candidate.u),
        min: Math.min(current.min, candidate.u)
      }),
      {
        max: Number.NEGATIVE_INFINITY,
        min: Number.POSITIVE_INFINITY
      }
    ),
    v: projectedPositions.reduce(
      (current, candidate) => ({
        max: Math.max(current.max, candidate.v),
        min: Math.min(current.min, candidate.v)
      }),
      {
        max: Number.NEGATIVE_INFINITY,
        min: Number.POSITIVE_INFINITY
      }
    )
  };
  const axis = resolveFaceCutAxis(projectedPoint, bounds, epsilon);
  const otherAxis = axis === "u" ? "v" : "u";
  const snappedCoordinate = snapFaceCutCoordinate(projectedPoint[axis], bounds[axis].min, snapSize, epsilon);

  if (snappedCoordinate <= bounds[axis].min + epsilon || snappedCoordinate >= bounds[axis].max - epsilon) {
    return undefined;
  }

  const intersections = projectedPositions
    .map((position, edgeIndex) => {
      const nextIndex = (edgeIndex + 1) % projectedPositions.length;
      const next = projectedPositions[nextIndex];
      const delta = next[axis] - position[axis];

      if (Math.abs(delta) <= epsilon) {
        return undefined;
      }

      const t = (snappedCoordinate - position[axis]) / delta;

      if (t <= epsilon || t >= 1 - epsilon) {
        return undefined;
      }

      if (
        snappedCoordinate < Math.min(position[axis], next[axis]) - epsilon ||
        snappedCoordinate > Math.max(position[axis], next[axis]) + epsilon
      ) {
        return undefined;
      }

      return {
        edge: [target.vertexIds[edgeIndex], target.vertexIds[nextIndex]] as [VertexID, VertexID],
        edgeIndex,
        point: lerpVec3(target.positions[edgeIndex], target.positions[nextIndex], t),
        projected: {
          [axis]: snappedCoordinate,
          [otherAxis]: position[otherAxis] + (next[otherAxis] - position[otherAxis]) * t
        } as FacePlanePoint
      };
    })
    .filter(
      (
        intersection
      ): intersection is {
        edge: [VertexID, VertexID];
        edgeIndex: number;
        point: Vec3;
        projected: FacePlanePoint;
      } => Boolean(intersection)
    )
    .filter(
      (intersection, index, collection) =>
        collection.findIndex(
          (candidate) =>
            candidate.edgeIndex === intersection.edgeIndex ||
            (
              Math.abs(candidate.point.x - intersection.point.x) <= epsilon &&
              Math.abs(candidate.point.y - intersection.point.y) <= epsilon &&
              Math.abs(candidate.point.z - intersection.point.z) <= epsilon
            )
        ) === index
    )
    .sort((left, right) => left.projected[otherAxis] - right.projected[otherAxis]);

  if (intersections.length !== 2) {
    return undefined;
  }

  const [firstIntersection, secondIntersection] = intersections;

  return {
    end: secondIntersection.point,
    firstEdge: firstIntersection.edge,
    firstEdgeIndex: firstIntersection.edgeIndex,
    firstPoint: firstIntersection.point,
    secondEdge: secondIntersection.edge,
    secondEdgeIndex: secondIntersection.edgeIndex,
    secondPoint: secondIntersection.point,
    start: firstIntersection.point,
    target
  };
}

function resolveFaceCutAxis(
  point: FacePlanePoint,
  bounds: Record<"u" | "v", { max: number; min: number }>,
  epsilon: number
) {
  const uSpan = Math.max(bounds.u.max - bounds.u.min, epsilon);
  const vSpan = Math.max(bounds.v.max - bounds.v.min, epsilon);
  const uBoundaryDistance = Math.min(Math.abs(point.u - bounds.u.min), Math.abs(bounds.u.max - point.u));
  const vBoundaryDistance = Math.min(Math.abs(point.v - bounds.v.min), Math.abs(bounds.v.max - point.v));

  if (Math.abs(uBoundaryDistance - vBoundaryDistance) <= epsilon * 10) {
    return uSpan >= vSpan ? "u" : "v";
  }

  return uBoundaryDistance <= vBoundaryDistance ? "u" : "v";
}

function snapFaceCutCoordinate(value: number, min: number, snapSize: number, epsilon: number) {
  if (snapSize <= epsilon) {
    return value;
  }

  return min + snapValue(value - min, snapSize);
}

function buildCutVertexIds(faceId: FaceID, firstEdgeIndex: number, secondEdgeIndex: number) {
  return [
    `${faceId}:cut:${firstEdgeIndex}:${secondEdgeIndex}:a`,
    `${faceId}:cut:${firstEdgeIndex}:${secondEdgeIndex}:b`
  ] as const;
}
