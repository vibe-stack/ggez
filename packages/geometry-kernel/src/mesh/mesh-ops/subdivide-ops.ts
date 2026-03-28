import type { EditableMesh, FaceID, Vec3, VertexID } from "@ggez/shared";
import {
  createEditableMeshFromPolygons,
  getMeshPolygons,
  insertPointsOnPolygonEdge,
  lerpVec3,
  makeUndirectedEdgeKey,
  orientPolygonLoops
} from "./shared";
import type { MeshPolygonData, OrientedEditablePolygon } from "./types";

export type MeshSubdivisionPreviewSegment = {
  end: Vec3;
  start: Vec3;
};

export function subdivideEditableMeshFace(
  mesh: EditableMesh,
  faceId: FaceID,
  cuts: number
): EditableMesh | undefined {
  const targetCuts = Math.max(1, Math.round(cuts));
  const polygons = getMeshPolygons(mesh);
  const target = polygons.find((polygon) => polygon.id === faceId);

  if (!target || target.positions.length < 3) {
    return undefined;
  }

  const boundaryInsertionsByEdgeKey = new Map(
    createSubdivisionBoundarySamples(target, targetCuts + 1)
      .filter((sample) => sample.points.length > 0)
      .map((sample) => [
        makeUndirectedEdgeKey(sample.edge[0], sample.edge[1]),
        {
          edge: sample.edge,
          points: sample.points.map((point) => ({
            id: point.id,
            position: point.position
          }))
        }
      ] as const)
  );
  const nextPolygons: Array<OrientedEditablePolygon & { vertexIds: VertexID[] }> = polygons
    .filter((polygon) => polygon.id !== faceId)
    .map((polygon) => {
      let nextPolygon: OrientedEditablePolygon & { vertexIds: VertexID[] } = {
        expectedNormal: polygon.normal,
        id: polygon.id,
        materialId: polygon.materialId,
        positions: polygon.positions,
        uvScale: polygon.uvScale,
        vertexIds: [...polygon.vertexIds]
      };

      boundaryInsertionsByEdgeKey.forEach(({ edge, points }, edgeKey) => {
        const matchingEdgeIndex = nextPolygon.vertexIds.findIndex((vertexId, index) => {
          const nextVertexId = nextPolygon.vertexIds[(index + 1) % nextPolygon.vertexIds.length];
          return makeUndirectedEdgeKey(vertexId, nextVertexId) === edgeKey;
        });

        if (matchingEdgeIndex < 0) {
          return;
        }

        nextPolygon = insertPointsOnPolygonEdge(
          nextPolygon,
          edge,
          points
        );
      });

      return nextPolygon;
    });

  const boundarySamples = createSubdivisionBoundarySamples(target, targetCuts + 1);
  const subdividedPolygons =
    target.positions.length === 4
      ? buildQuadSubdivisionPolygons(target, boundarySamples, targetCuts + 1)
      : buildRadialSubdivisionPolygons(target, boundarySamples, targetCuts + 1);

  if (subdividedPolygons.length === 0) {
    return undefined;
  }

  return createEditableMeshFromPolygons(orientPolygonLoops([...nextPolygons, ...subdividedPolygons]));
}

export function buildEditableMeshFaceSubdivisionPreview(
  mesh: EditableMesh,
  faceId: FaceID,
  cuts: number
): MeshSubdivisionPreviewSegment[] {
  const targetCuts = Math.max(1, Math.round(cuts));
  const polygons = getMeshPolygons(mesh);
  const target = polygons.find((polygon) => polygon.id === faceId);

  if (!target || target.positions.length < 3) {
    return [];
  }

  return target.positions.length === 4
    ? buildQuadSubdivisionPreviewSegments(target, targetCuts + 1)
    : buildRadialSubdivisionPreviewSegments(target, createSubdivisionBoundarySamples(target, targetCuts + 1), targetCuts + 1);
}

function createSubdivisionBoundarySamples(polygon: MeshPolygonData, segments: number) {
  return polygon.vertexIds.map((vertexId, edgeIndex) => {
    const nextIndex = (edgeIndex + 1) % polygon.vertexIds.length;
    const edge: [VertexID, VertexID] = [vertexId, polygon.vertexIds[nextIndex]];
    const points = Array.from({ length: Math.max(0, segments - 1) }, (_, sampleIndex) => {
      const step = sampleIndex + 1;
      const t = step / segments;

      return {
        id: `${polygon.id}:subdiv:edge:${edgeIndex}:${step}`,
        position: lerpVec3(polygon.positions[edgeIndex], polygon.positions[nextIndex], t)
      };
    });

    return {
      edge,
      edgeIndex,
      points
    };
  });
}

function buildQuadSubdivisionPolygons(
  target: MeshPolygonData,
  boundarySamples: Array<{
    edge: [VertexID, VertexID];
    edgeIndex: number;
    points: Array<{ id: VertexID; position: Vec3 }>;
  }>,
  segments: number
) {
  const [corner0, corner1, corner2, corner3] = target.positions;
  const gridPointAt = (column: number, row: number) => {
    const u = column / segments;
    const v = row / segments;
    const bottom = lerpVec3(corner0, corner1, u);
    const top = lerpVec3(corner3, corner2, u);

    return lerpVec3(bottom, top, v);
  };
  const gridVertexIdAt = (column: number, row: number): VertexID => {
    if (row === 0) {
      if (column === 0) {
        return target.vertexIds[0];
      }

      if (column === segments) {
        return target.vertexIds[1];
      }

      return boundarySamples[0].points[column - 1].id;
    }

    if (column === segments) {
      if (row === segments) {
        return target.vertexIds[2];
      }

      return boundarySamples[1].points[row - 1].id;
    }

    if (row === segments) {
      if (column === 0) {
        return target.vertexIds[3];
      }

      return boundarySamples[2].points[segments - column - 1].id;
    }

    if (column === 0) {
      return boundarySamples[3].points[segments - row - 1].id;
    }

    return `${target.id}:subdiv:inner:${column}:${row}`;
  };
  const polygons: OrientedEditablePolygon[] = [];

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      polygons.push({
        expectedNormal: target.normal,
        id: `${target.id}:subdiv:${column}:${row}`,
        materialId: target.materialId,
        positions: [
          gridPointAt(column, row),
          gridPointAt(column + 1, row),
          gridPointAt(column + 1, row + 1),
          gridPointAt(column, row + 1)
        ],
        uvScale: target.uvScale,
        vertexIds: [
          gridVertexIdAt(column, row),
          gridVertexIdAt(column + 1, row),
          gridVertexIdAt(column + 1, row + 1),
          gridVertexIdAt(column, row + 1)
        ]
      });
    }
  }

  return polygons;
}

function buildRadialSubdivisionPolygons(
  target: MeshPolygonData,
  boundarySamples: Array<{
    edge: [VertexID, VertexID];
    edgeIndex: number;
    points: Array<{ id: VertexID; position: Vec3 }>;
  }>,
  segments: number
) {
  const boundaryLoop = buildSubdivisionBoundaryLoop(target, boundarySamples);
  const rings = Array.from({ length: segments }, (_, ringIndex) => {
    if (ringIndex === 0) {
      return {
        points: boundaryLoop.map((sample) => sample.position),
        vertexIds: boundaryLoop.map((sample) => sample.id)
      };
    }

    const t = 1 - ringIndex / segments;

    return {
      points: boundaryLoop.map((sample) => lerpVec3(target.center, sample.position, t)),
      vertexIds: boundaryLoop.map((_, pointIndex) => `${target.id}:subdiv:ring:${ringIndex}:${pointIndex}`)
    };
  });
  const polygons: OrientedEditablePolygon[] = [];

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const outerRing = rings[ringIndex];
    const innerRing = rings[ringIndex + 1];

    for (let pointIndex = 0; pointIndex < outerRing.points.length; pointIndex += 1) {
      const nextPointIndex = (pointIndex + 1) % outerRing.points.length;

      polygons.push({
        expectedNormal: target.normal,
        id: `${target.id}:subdiv:ring:${ringIndex}:cell:${pointIndex}`,
        materialId: target.materialId,
        positions: [
          outerRing.points[pointIndex],
          outerRing.points[nextPointIndex],
          innerRing.points[nextPointIndex],
          innerRing.points[pointIndex]
        ],
        uvScale: target.uvScale,
        vertexIds: [
          outerRing.vertexIds[pointIndex],
          outerRing.vertexIds[nextPointIndex],
          innerRing.vertexIds[nextPointIndex],
          innerRing.vertexIds[pointIndex]
        ]
      });
    }
  }

  const innerRing = rings[rings.length - 1];

  polygons.push({
    expectedNormal: target.normal,
    id: `${target.id}:subdiv:center`,
    positions: innerRing.points,
    materialId: target.materialId,
    uvScale: target.uvScale,
    vertexIds: innerRing.vertexIds
  });

  return polygons;
}

function buildSubdivisionBoundaryLoop(
  target: MeshPolygonData,
  boundarySamples: Array<{
    edge: [VertexID, VertexID];
    edgeIndex: number;
    points: Array<{ id: VertexID; position: Vec3 }>;
  }>
) {
  return target.vertexIds.flatMap((vertexId, edgeIndex) => {
    const vertex = {
      id: vertexId,
      position: target.positions[edgeIndex]
    };

    return [vertex, ...boundarySamples[edgeIndex].points];
  });
}

function buildQuadSubdivisionPreviewSegments(
  target: MeshPolygonData,
  segments: number
): MeshSubdivisionPreviewSegment[] {
  const [corner0, corner1, corner2, corner3] = target.positions;
  const gridPointAt = (column: number, row: number) => {
    const u = column / segments;
    const v = row / segments;
    const bottom = lerpVec3(corner0, corner1, u);
    const top = lerpVec3(corner3, corner2, u);

    return lerpVec3(bottom, top, v);
  };
  const previewSegments: MeshSubdivisionPreviewSegment[] = [];

  for (let index = 1; index < segments; index += 1) {
    previewSegments.push({
      end: gridPointAt(index, segments),
      start: gridPointAt(index, 0)
    });
    previewSegments.push({
      end: gridPointAt(segments, index),
      start: gridPointAt(0, index)
    });
  }

  return previewSegments;
}

function buildRadialSubdivisionPreviewSegments(
  target: MeshPolygonData,
  boundarySamples: Array<{
    edge: [VertexID, VertexID];
    edgeIndex: number;
    points: Array<{ id: VertexID; position: Vec3 }>;
  }>,
  segments: number
) {
  const boundaryLoop = buildSubdivisionBoundaryLoop(target, boundarySamples);
  const previewSegments: MeshSubdivisionPreviewSegment[] = [];

  boundaryLoop.forEach((sample, index) => {
    previewSegments.push({
      end: target.center,
      start: sample.position
    });
  });

  for (let ringIndex = 1; ringIndex < segments; ringIndex += 1) {
    const t = 1 - ringIndex / segments;
    const ringPoints = boundaryLoop.map((sample) => lerpVec3(target.center, sample.position, t));

    ringPoints.forEach((point, index) => {
      const nextPoint = ringPoints[(index + 1) % ringPoints.length];

      previewSegments.push({
        end: nextPoint,
        start: point
      });
    });
  }

  return previewSegments;
}
