import type { EditableMesh, FaceID, Vec3, VertexID } from "@web-hammer/shared";
import { addVec3, averageVec3, normalizeVec3, scaleVec3, vec3 } from "@web-hammer/shared";
import { computePolygonNormal } from "../../polygon/polygon-utils";
import { createEditableMeshFromPolygons, findEdgeIndex, getMeshPolygons, makeUndirectedEdgeKey, orientPolygonLoops } from "./shared";
import type { MeshPolygonData, OrientedEditablePolygon } from "./types";

export function extrudeEditableMeshFace(
  mesh: EditableMesh,
  faceId: FaceID,
  amount: number,
  epsilon = 0.0001
): EditableMesh | undefined {
  if (Math.abs(amount) <= epsilon) {
    return structuredClone(mesh);
  }

  const polygons = normalizeExtrudeSourcePolygons(mesh);
  const target = polygons.find((polygon) => polygon.id === faceId);

  if (!target) {
    return undefined;
  }

  const offset = scaleVec3(normalizeVec3(target.normal), amount);
  const capPositions = target.positions.map((position) => addVec3(position, offset));
  const extrudedVertexIds = target.vertexIds.map((vertexId) => `${vertexId}:extrude`);
  const extrudedPolygons: OrientedEditablePolygon[] = polygons
    .filter((polygon) => polygon.id !== target.id)
    .map((polygon) => ({
      expectedNormal: polygon.normal,
      id: polygon.id,
      materialId: polygon.materialId,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z))
      ,
      uvScale: polygon.uvScale,
      vertexIds: [...polygon.vertexIds]
    }));

  extrudedPolygons.push({
    expectedNormal: target.normal,
    id: `${target.id}:extrude:cap`,
    materialId: target.materialId,
    positions: capPositions,
    uvScale: target.uvScale,
    vertexIds: extrudedVertexIds
  });

  target.positions.forEach((position, index) => {
    const nextIndex = (index + 1) % target.positions.length;
    const sidePositions = [position, target.positions[nextIndex], capPositions[nextIndex], capPositions[index]];

    extrudedPolygons.push({
      expectedNormal: computePolygonNormal(sidePositions),
      id: `${target.id}:extrude:side:${index}`,
      materialId: target.materialId,
      positions: sidePositions,
      uvScale: target.uvScale,
      vertexIds: [
        target.vertexIds[index],
        target.vertexIds[nextIndex],
        extrudedVertexIds[nextIndex],
        extrudedVertexIds[index]
      ]
    });
  });

  return createEditableMeshFromPolygons(orientPolygonLoops(extrudedPolygons));
}

export function extrudeEditableMeshFaces(
  mesh: EditableMesh,
  faceIds: FaceID[],
  amount: number,
  epsilon = 0.0001
): EditableMesh | undefined {
  if (faceIds.length === 0) {
    return undefined;
  }

  return Array.from(new Set(faceIds)).reduce<EditableMesh | undefined>(
    (currentMesh, faceId) => (currentMesh ? extrudeEditableMeshFace(currentMesh, faceId, amount, epsilon) : currentMesh),
    mesh
  );
}

export function extrudeEditableMeshEdge(
  mesh: EditableMesh,
  edge: [VertexID, VertexID],
  amount: number,
  overrideNormal?: Vec3,
  epsilon = 0.0001
): EditableMesh | undefined {
  if (Math.abs(amount) <= epsilon) {
    return structuredClone(mesh);
  }

  const polygons = normalizeExtrudeSourcePolygons(mesh);
  const adjacent = polygons.filter((polygon) => findEdgeIndex(polygon.vertexIds, edge) >= 0);

  if (adjacent.length === 0 || adjacent.length > 2) {
    return undefined;
  }

  const [target] = adjacent;
  const edgeIndex = findEdgeIndex(target.vertexIds, edge);

  if (edgeIndex < 0) {
    return undefined;
  }

  const nextIndex = (edgeIndex + 1) % target.vertexIds.length;
  const orientedEdge: [VertexID, VertexID] = [target.vertexIds[edgeIndex], target.vertexIds[nextIndex]];
  const startPosition = target.positions[edgeIndex];
  const endPosition = target.positions[nextIndex];
  const extrusionNormal = normalizeVec3(overrideNormal ?? averageVec3(adjacent.map((polygon) => polygon.normal)));

  if (Math.abs(extrusionNormal.x) <= epsilon && Math.abs(extrusionNormal.y) <= epsilon && Math.abs(extrusionNormal.z) <= epsilon) {
    return undefined;
  }

  const offset = scaleVec3(extrusionNormal, amount);
  const extrudedStart = addVec3(startPosition, offset);
  const extrudedEnd = addVec3(endPosition, offset);
  const edgeKey = makeUndirectedEdgeKey(edge[0], edge[1]);
  const extrudedStartId = `extrude:${edgeKey}:start`;
  const extrudedEndId = `extrude:${edgeKey}:end`;
  const nextPolygons: OrientedEditablePolygon[] = polygons.map((polygon) => ({
    expectedNormal: polygon.normal,
    id: polygon.id,
    materialId: polygon.materialId,
    positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
    uvScale: polygon.uvScale,
    vertexIds: [...polygon.vertexIds]
  }));

  if (adjacent.length === 2) {
    adjacent.forEach((polygon, polygonIndex) => {
      const polygonEdgeIndex = findEdgeIndex(polygon.vertexIds, orientedEdge);

      if (polygonEdgeIndex < 0) {
        return;
      }

      const polygonNextIndex = (polygonEdgeIndex + 1) % polygon.vertexIds.length;
      const localStartId = polygon.vertexIds[polygonEdgeIndex];
      const localEndId = polygon.vertexIds[polygonNextIndex];
      const localStartExtruded = localStartId === orientedEdge[0] ? extrudedStart : extrudedEnd;
      const localEndExtruded = localEndId === orientedEdge[1] ? extrudedEnd : extrudedStart;
      const localStartExtrudedId = localStartId === orientedEdge[0] ? extrudedStartId : extrudedEndId;
      const localEndExtrudedId = localEndId === orientedEdge[1] ? extrudedEndId : extrudedStartId;

      nextPolygons.push({
        expectedNormal: computePolygonNormal([
          polygon.positions[polygonEdgeIndex],
          polygon.positions[polygonNextIndex],
          localEndExtruded,
          localStartExtruded
        ]),
        id: `${polygon.id}:extrude:side:${polygonIndex}`,
        materialId: polygon.materialId,
        positions: [
          polygon.positions[polygonEdgeIndex],
          polygon.positions[polygonNextIndex],
          localEndExtruded,
          localStartExtruded
        ],
        uvScale: polygon.uvScale,
        vertexIds: [
          `${polygon.id}:extrude:${edgeKey}:start`,
          `${polygon.id}:extrude:${edgeKey}:end`,
          localEndExtrudedId,
          localStartExtrudedId
        ]
      });
    });

    return createEditableMeshFromPolygons(orientPolygonLoops(nextPolygons));
  }

  nextPolygons.push({
    expectedNormal: computePolygonNormal([
      vec3(startPosition.x, startPosition.y, startPosition.z),
      vec3(endPosition.x, endPosition.y, endPosition.z),
      vec3(extrudedEnd.x, extrudedEnd.y, extrudedEnd.z),
      vec3(extrudedStart.x, extrudedStart.y, extrudedStart.z)
    ]),
    id: `${target.id}:extrude:${edgeKey}`,
    materialId: target.materialId,
    positions: [
      vec3(startPosition.x, startPosition.y, startPosition.z),
      vec3(endPosition.x, endPosition.y, endPosition.z),
      vec3(extrudedEnd.x, extrudedEnd.y, extrudedEnd.z),
      vec3(extrudedStart.x, extrudedStart.y, extrudedStart.z)
    ],
    uvScale: target.uvScale,
    vertexIds: [orientedEdge[0], orientedEdge[1], extrudedEndId, extrudedStartId]
  });

  return createEditableMeshFromPolygons(orientPolygonLoops(nextPolygons));
}

function normalizeExtrudeSourcePolygons(mesh: EditableMesh) {
  const oriented = orientPolygonLoops(
    getMeshPolygons(mesh).map((polygon) => ({
      id: polygon.id,
      materialId: polygon.materialId,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      uvScale: polygon.uvScale,
      vertexIds: [...polygon.vertexIds]
    }))
  );

  return oriented.map((polygon): MeshPolygonData => ({
    center: averageVec3(polygon.positions),
    id: polygon.id,
    materialId: polygon.materialId,
    normal: computePolygonNormal(polygon.positions),
    positions: polygon.positions,
    uvScale: polygon.uvScale,
    vertexIds: polygon.vertexIds ?? []
  }));
}