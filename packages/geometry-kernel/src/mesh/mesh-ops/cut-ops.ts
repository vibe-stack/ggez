import type { EditableMesh, FaceID, Vec3, VertexID } from "@web-hammer/shared";
import { crossVec3, dotVec3, normalizeVec3, snapValue, subVec3, vec3 } from "@web-hammer/shared";
import {
  areAdjacentEdgeIndices,
  createEditableMeshFromPolygons,
  createFacePlaneBasis,
  expandPolygonWithInsertedMidpoints,
  findEdgeIndex,
  getMeshPolygonWithInsertedPoint,
  getMeshPolygons,
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
  const expanded = expandPolygonWithInsertedMidpoints(target, [
    { edgeIndex: firstIndex, id: "__cut_a__", position: firstMidpoint },
    { edgeIndex: secondIndex, id: "__cut_b__", position: secondMidpoint }
  ]);
  const cutAIndex = expanded.vertexIds.indexOf("__cut_a__");
  const cutBIndex = expanded.vertexIds.indexOf("__cut_b__");

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

  const nextPolygons = polygons
    .filter((polygon) => polygon.id !== target.id)
    .map((polygon) => {
      const containsFirstEdge = findEdgeIndex(polygon.vertexIds, edges[0]) >= 0;
      const containsSecondEdge = findEdgeIndex(polygon.vertexIds, edges[1]) >= 0;
      const firstPassPolygon = containsFirstEdge ? getMeshPolygonWithInsertedPoint(polygon, edges[0], firstMidpoint) : polygon;
      const secondPassPolygon = containsSecondEdge ? getMeshPolygonWithInsertedPoint(firstPassPolygon, edges[1], secondMidpoint) : firstPassPolygon;

      return {
        id: secondPassPolygon.id,
        materialId: polygon.materialId,
        positions: secondPassPolygon.positions.map((position) => vec3(position.x, position.y, position.z)),
        uvScale: polygon.uvScale,
        vertexIds: [...secondPassPolygon.vertexIds]
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

  return createEditableMeshFromPolygons(nextPolygons);
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

  const expanded = expandPolygonWithInsertedMidpoints(resolvedCut.target, [
    {
      edgeIndex: resolvedCut.firstEdgeIndex,
      id: "__cut_a__",
      position: resolvedCut.firstPoint
    },
    {
      edgeIndex: resolvedCut.secondEdgeIndex,
      id: "__cut_b__",
      position: resolvedCut.secondPoint
    }
  ]);
  const cutAIndex = expanded.vertexIds.indexOf("__cut_a__");
  const cutBIndex = expanded.vertexIds.indexOf("__cut_b__");

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
      const containsFirstEdge = findEdgeIndex(polygon.vertexIds, resolvedCut.firstEdge) >= 0;
      const containsSecondEdge = findEdgeIndex(polygon.vertexIds, resolvedCut.secondEdge) >= 0;
      const firstPassPolygon = containsFirstEdge
        ? getMeshPolygonWithInsertedPoint(polygon, resolvedCut.firstEdge, resolvedCut.firstPoint)
        : polygon;
      const secondPassPolygon = containsSecondEdge
        ? getMeshPolygonWithInsertedPoint(firstPassPolygon, resolvedCut.secondEdge, resolvedCut.secondPoint)
        : firstPassPolygon;

      return {
        expectedNormal: polygon.normal,
        id: secondPassPolygon.id,
        materialId: polygon.materialId,
        positions: secondPassPolygon.positions.map((position) => vec3(position.x, position.y, position.z)),
        uvScale: polygon.uvScale,
        vertexIds: [...secondPassPolygon.vertexIds]
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

  const basis = createFacePlaneBasis(target.normal);
  const projectedPoint = projectFacePoint(point, target.center, basis);
  const axis = Math.abs(projectedPoint.u) >= Math.abs(projectedPoint.v) ? "u" : "v";
  const otherAxis = axis === "u" ? "v" : "u";
  const coordinate = snapValue(projectedPoint[axis], snapSize);
  const projectedPositions = target.positions.map((position) => projectFacePoint(position, target.center, basis));
  const bounds = projectedPositions.reduce(
    (current, candidate) => ({
      max: Math.max(current.max, candidate[axis]),
      min: Math.min(current.min, candidate[axis])
    }),
    {
      max: Number.NEGATIVE_INFINITY,
      min: Number.POSITIVE_INFINITY
    }
  );

  if (coordinate <= bounds.min + epsilon || coordinate >= bounds.max - epsilon) {
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

      const t = (coordinate - position[axis]) / delta;

      if (t <= epsilon || t >= 1 - epsilon) {
        return undefined;
      }

      if (coordinate < Math.min(position[axis], next[axis]) - epsilon || coordinate > Math.max(position[axis], next[axis]) + epsilon) {
        return undefined;
      }

      return {
        edge: [target.vertexIds[edgeIndex], target.vertexIds[nextIndex]] as [VertexID, VertexID],
        edgeIndex,
        point: lerpVec3(target.positions[edgeIndex], target.positions[nextIndex], t),
        projected: {
          [axis]: coordinate,
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