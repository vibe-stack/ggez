import type { EditableMesh, Vec3, VertexID } from "@web-hammer/shared";
import { computePolygonNormal } from "../../polygon/polygon-utils";
import { lengthVec3, vec3 } from "@web-hammer/shared";
import { createEditableMeshFromPolygons, getMeshPolygons, makeUndirectedEdgeKey, orderBoundaryEdges, orientPolygonLoops } from "./shared";
import type { OrientedEditablePolygon } from "./types";

export function fillEditableMeshFaceFromVertices(
  mesh: EditableMesh,
  vertexIds: VertexID[],
  epsilon = 0.0001
): EditableMesh | undefined {
  if (vertexIds.length < 3) {
    return undefined;
  }

  const selectedVertexIds = new Set(vertexIds);
  const boundaryEdges = collectFillBoundaryEdges(mesh).filter(
    (edge) => selectedVertexIds.has(edge.startId) && selectedVertexIds.has(edge.endId)
  );

  if (boundaryEdges.length < 3) {
    return undefined;
  }

  const boundaryVertexIds = new Set(boundaryEdges.flatMap((edge) => [edge.startId, edge.endId]));

  if (
    boundaryVertexIds.size !== selectedVertexIds.size ||
    Array.from(selectedVertexIds).some((vertexId) => !boundaryVertexIds.has(vertexId))
  ) {
    return undefined;
  }

  return fillEditableMeshFaceFromBoundaryEdges(mesh, boundaryEdges, epsilon);
}

export function fillEditableMeshFaceFromEdges(
  mesh: EditableMesh,
  edges: Array<[VertexID, VertexID]>,
  epsilon = 0.0001
): EditableMesh | undefined {
  if (edges.length < 3) {
    return undefined;
  }

  const selectedEdgeKeys = new Set(edges.map((edge) => makeUndirectedEdgeKey(edge[0], edge[1])));
  const boundaryEdges = collectFillBoundaryEdges(mesh).filter((edge) => selectedEdgeKeys.has(edge.key));

  if (boundaryEdges.length !== selectedEdgeKeys.size || boundaryEdges.length < 3) {
    return undefined;
  }

  return fillEditableMeshFaceFromBoundaryEdges(mesh, boundaryEdges, epsilon);
}

function fillEditableMeshFaceFromBoundaryEdges(
  mesh: EditableMesh,
  boundaryEdges: Array<{
    endId: VertexID;
    endPosition: Vec3;
    key: string;
    startId: VertexID;
    startPosition: Vec3;
  }>,
  epsilon: number
) {
  const orderedBoundary = orderBoundaryEdges(boundaryEdges);

  if (!orderedBoundary || orderedBoundary.length < 3) {
    return undefined;
  }

  const orderedPositions = orderedBoundary.map((edge) => edge.startPosition);
  const fillNormal = computePolygonNormal(orderedPositions);

  if (lengthVec3(fillNormal) <= epsilon) {
    return undefined;
  }

  const nextPolygons: OrientedEditablePolygon[] = getMeshPolygons(mesh).map((polygon) => ({
    expectedNormal: polygon.normal,
    id: polygon.id,
    materialId: polygon.materialId,
    positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
    uvScale: polygon.uvScale,
    vertexIds: [...polygon.vertexIds]
  }));
  const faceId = `face:fill:${orderedBoundary.map((edge) => edge.key).join("|")}`;

  nextPolygons.push({
    expectedNormal: fillNormal,
    id: faceId,
    materialId: undefined,
    positions: orderedPositions.map((position) => vec3(position.x, position.y, position.z)),
    uvScale: undefined,
    vertexIds: orderedBoundary.map((edge) => edge.startId)
  });

  return createEditableMeshFromPolygons(orientPolygonLoops(nextPolygons));
}

function collectFillBoundaryEdges(mesh: EditableMesh) {
  const polygons = getMeshPolygons(mesh);
  const edgeCounts = polygons.reduce<Map<string, number>>((counts, polygon) => {
    polygon.vertexIds.forEach((vertexId, index) => {
      const nextVertexId = polygon.vertexIds[(index + 1) % polygon.vertexIds.length];
      const key = makeUndirectedEdgeKey(vertexId, nextVertexId);

      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return counts;
  }, new Map());

  return polygons.flatMap((polygon) =>
    polygon.vertexIds.flatMap((vertexId, index) => {
      const nextIndex = (index + 1) % polygon.vertexIds.length;
      const nextVertexId = polygon.vertexIds[nextIndex];
      const key = makeUndirectedEdgeKey(vertexId, nextVertexId);

      if ((edgeCounts.get(key) ?? 0) !== 1) {
        return [];
      }

      return [
        {
          endId: vertexId,
          endPosition: polygon.positions[index],
          key,
          startId: nextVertexId,
          startPosition: polygon.positions[nextIndex]
        }
      ];
    })
  );
}