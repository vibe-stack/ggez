import type { Brush, EditableMesh, FaceID, VertexID } from "@web-hammer/shared";
import { dotVec3, normalizeVec3, vec3 } from "@web-hammer/shared";
import { reconstructBrushFaces } from "../../brush/brush-kernel";
import { getMeshPolygons, makeUndirectedEdgeKey, orderBoundaryEdges, createEditableMeshFromPolygons } from "./shared";
import type { EdgeBevelProfile } from "./types";
import type { EditableMeshPolygon } from "../editable-mesh";

export function convertBrushToEditableMesh(brush: Brush): EditableMesh | undefined {
  const rebuilt = reconstructBrushFaces(brush);

  if (!rebuilt.valid) {
    return undefined;
  }

  return createEditableMeshFromPolygons(
    rebuilt.faces.map((face) => ({
      id: face.id,
      materialId: face.materialId,
      positions: face.vertices.map((vertex) => vec3(vertex.position.x, vertex.position.y, vertex.position.z))
      ,
      uvScale: face.uvScale
    }))
  );
}

export function invertEditableMeshNormals(mesh: EditableMesh, faceIds?: string[]): EditableMesh {
  const selectedFaceIds = faceIds ? new Set(faceIds) : undefined;
  const polygons = getMeshPolygons(mesh).map((polygon) => ({
    id: polygon.id,
    materialId: polygon.materialId,
    positions:
      !selectedFaceIds || selectedFaceIds.has(polygon.id)
        ? polygon.positions.slice().reverse()
        : polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
    uvScale: polygon.uvScale,
    vertexIds: [...polygon.vertexIds]
  }));

  return createEditableMeshFromPolygons(polygons);
}

export function deleteEditableMeshFaces(mesh: EditableMesh, faceIds: string[]): EditableMesh | undefined {
  const selectedFaceIds = new Set(faceIds);
  const polygons = getMeshPolygons(mesh)
    .filter((polygon) => !selectedFaceIds.has(polygon.id))
    .map((polygon) => ({
      id: polygon.id,
      materialId: polygon.materialId,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      uvScale: polygon.uvScale,
      vertexIds: [...polygon.vertexIds]
    }));

  if (polygons.length === 0) {
    return undefined;
  }

  return createEditableMeshFromPolygons(polygons);
}

export function mergeEditableMeshFaces(mesh: EditableMesh, faceIds: string[], epsilon = 0.0001): EditableMesh | undefined {
  if (faceIds.length < 2) {
    return undefined;
  }

  const polygons = getMeshPolygons(mesh);
  const selectedFaceIds = new Set(faceIds);
  const selected = polygons.filter((polygon) => selectedFaceIds.has(polygon.id));

  if (selected.length < 2) {
    return undefined;
  }

  const baseNormal = normalizeVec3(selected[0].normal);

  if (
    selected.some(
      (polygon) => Math.abs(Math.abs(dotVec3(baseNormal, normalizeVec3(polygon.normal))) - 1) > epsilon * 10
    )
  ) {
    return undefined;
  }

  const boundaryEdges = new Map<
    string,
    {
      count: number;
      endId: VertexID;
      endPosition: typeof selected[number]["positions"][number];
      startId: VertexID;
      startPosition: typeof selected[number]["positions"][number];
    }
  >();

  selected.forEach((polygon) => {
    polygon.vertexIds.forEach((vertexId, index) => {
      const nextIndex = (index + 1) % polygon.vertexIds.length;
      const nextId = polygon.vertexIds[nextIndex];
      const key = makeUndirectedEdgeKey(vertexId, nextId);
      const existing = boundaryEdges.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        boundaryEdges.set(key, {
          count: 1,
          endId: nextId,
          endPosition: polygon.positions[nextIndex],
          startId: vertexId,
          startPosition: polygon.positions[index]
        });
      }
    });
  });

  const orderedBoundary = orderBoundaryEdges(Array.from(boundaryEdges.values()).filter((edge) => edge.count === 1));

  if (!orderedBoundary || orderedBoundary.length < 3) {
    return undefined;
  }

  const mergedPolygon: {
    id: FaceID;
    materialId: string | undefined;
    positions: typeof orderedBoundary[number]["startPosition"][];
    uvScale: typeof selected[0]["uvScale"];
    vertexIds: VertexID[];
  } = {
    id: selected[0].id,
    materialId: selected[0].materialId,
    positions: orderedBoundary.map((edge) => edge.startPosition),
    uvScale: selected[0].uvScale,
    vertexIds: orderedBoundary.map((edge) => edge.startId)
  };
  const nextPolygons = polygons
    .filter((polygon) => !selectedFaceIds.has(polygon.id))
    .map((polygon) => ({
      id: polygon.id,
      materialId: polygon.materialId,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      uvScale: polygon.uvScale,
      vertexIds: [...polygon.vertexIds]
    }));

  nextPolygons.push(mergedPolygon);
  return createEditableMeshFromPolygons(nextPolygons);
}