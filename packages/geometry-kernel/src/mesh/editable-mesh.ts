import {
  computePolygonNormal,
  triangulatePolygon,
  triangulatePolygon3D
} from "../polygon/polygon-utils";
import type {
  EditableMesh,
  EditableMeshFace,
  EditableMeshHalfEdge,
  EditableMeshVertex,
  FaceID,
  HalfEdgeID,
  MaterialID,
  Vec3,
  Vec2,
  VertexID
} from "@web-hammer/shared";
import { almostEqual, vec3 } from "@web-hammer/shared";

export type EditableMeshPolygon = {
  id?: FaceID;
  materialId?: MaterialID;
  positions: Vec3[];
  uvScale?: Vec2;
  vertexIds?: VertexID[];
};

export type EditableMeshValidation = {
  valid: boolean;
  errors: string[];
};

export type TriangulatedMeshFace = {
  faceId: FaceID;
  vertexIds: VertexID[];
  normal: Vec3;
  indices: number[];
};

export type TriangulatedEditableMesh = EditableMeshValidation & {
  faces: TriangulatedMeshFace[];
  indices: number[];
  positions: number[];
};

export function createEditableMeshFromPolygons(
  polygons: EditableMeshPolygon[],
  epsilon = 0.0001
): EditableMesh {
  const vertices: EditableMeshVertex[] = [];
  const halfEdges: EditableMeshHalfEdge[] = [];
  const faces: EditableMeshFace[] = [];
  const vertexRegistry = new Map<string, EditableMeshVertex>();
  const directedEdges = new Map<string, HalfEdgeID>();

  polygons.forEach((polygon, polygonIndex) => {
    const orderedPositions = normalizePolygonLoop(polygon.positions);
    const orderedVertexIds =
      polygon.vertexIds && polygon.vertexIds.length >= orderedPositions.length
        ? polygon.vertexIds.slice(0, orderedPositions.length)
        : undefined;

    if (orderedPositions.length < 3) {
      return;
    }

    // Preserve caller-provided winding. Topology ops already emit ordered loops,
    // and re-sorting around the face center can corrupt concave or intentionally
    // stitched polygons after cuts/bevels.
    const orderedVertices = orderedPositions;
    const faceId = polygon.id ?? `face:mesh:${polygonIndex}`;
    const faceHalfEdges: EditableMeshHalfEdge[] = [];

    orderedVertices.forEach((position, edgeIndex) => {
      const currentVertex = registerMeshVertex(
        vertexRegistry,
        vertices,
        position,
        epsilon,
        orderedVertexIds?.[edgeIndex]
      );
      const nextVertex = registerMeshVertex(
        vertexRegistry,
        vertices,
        orderedVertices[(edgeIndex + 1) % orderedVertices.length],
        epsilon,
        orderedVertexIds?.[(edgeIndex + 1) % orderedVertices.length]
      );
      const halfEdge: EditableMeshHalfEdge = {
        id: `half-edge:${faceId}:${edgeIndex}`,
        vertex: currentVertex.id,
        face: faceId
      };

      const reverseKey = `${nextVertex.id}:${currentVertex.id}`;
      const reverseHalfEdgeId = directedEdges.get(reverseKey);

      if (reverseHalfEdgeId) {
        halfEdge.twin = reverseHalfEdgeId;
        const reverseHalfEdge = halfEdges.find((candidate) => candidate.id === reverseHalfEdgeId);

        if (reverseHalfEdge) {
          reverseHalfEdge.twin = halfEdge.id;
        }
      }

      directedEdges.set(`${currentVertex.id}:${nextVertex.id}`, halfEdge.id);
      faceHalfEdges.push(halfEdge);
      halfEdges.push(halfEdge);
    });

    faceHalfEdges.forEach((halfEdge, edgeIndex) => {
      halfEdge.next = faceHalfEdges[(edgeIndex + 1) % faceHalfEdges.length].id;
    });

    faces.push({
      id: faceId,
      halfEdge: faceHalfEdges[0].id,
      materialId: polygon.materialId,
      uvScale: polygon.uvScale
    });
  });

  return {
    vertices,
    halfEdges,
    faces
  };
}

export function getFaceVertexIds(mesh: EditableMesh, faceId: FaceID): VertexID[] {
  const face = mesh.faces.find((candidate) => candidate.id === faceId);

  if (!face) {
    return [];
  }

  const ids: VertexID[] = [];
  let currentEdgeId: HalfEdgeID | undefined = face.halfEdge;
  let guard = 0;

  while (currentEdgeId && guard < mesh.halfEdges.length + 1) {
    const halfEdge = mesh.halfEdges.find((candidate) => candidate.id === currentEdgeId);

    if (!halfEdge) {
      return [];
    }

    ids.push(halfEdge.vertex);
    currentEdgeId = halfEdge.next;
    guard += 1;

    if (currentEdgeId === face.halfEdge) {
      break;
    }
  }

  return ids;
}

export function getFaceVertices(mesh: EditableMesh, faceId: FaceID): EditableMeshVertex[] {
  const verticesById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex]));

  return getFaceVertexIds(mesh, faceId)
    .map((vertexId) => verticesById.get(vertexId))
    .filter((vertex): vertex is EditableMeshVertex => Boolean(vertex));
}

export function validateEditableMesh(mesh: EditableMesh): EditableMeshValidation {
  const errors: string[] = [];
  const verticesById = new Set(mesh.vertices.map((vertex) => vertex.id));
  const halfEdgesById = new Map(mesh.halfEdges.map((halfEdge) => [halfEdge.id, halfEdge]));

  mesh.faces.forEach((face) => {
    if (!halfEdgesById.has(face.halfEdge)) {
      errors.push(`Face ${face.id} references missing half-edge ${face.halfEdge}.`);
      return;
    }

    const faceVertexIds = getFaceVertexIds(mesh, face.id);

    if (faceVertexIds.length < 3) {
      errors.push(`Face ${face.id} does not resolve to a closed polygon loop.`);
    }
  });

  mesh.halfEdges.forEach((halfEdge) => {
    if (!verticesById.has(halfEdge.vertex)) {
      errors.push(`Half-edge ${halfEdge.id} references missing vertex ${halfEdge.vertex}.`);
    }

    if (halfEdge.next && !halfEdgesById.has(halfEdge.next)) {
      errors.push(`Half-edge ${halfEdge.id} references missing next edge ${halfEdge.next}.`);
    }

    if (halfEdge.twin) {
      const twin = halfEdgesById.get(halfEdge.twin);

      if (!twin) {
        errors.push(`Half-edge ${halfEdge.id} references missing twin ${halfEdge.twin}.`);
      } else if (twin.twin !== halfEdge.id) {
        errors.push(`Half-edge ${halfEdge.id} and ${halfEdge.twin} do not reciprocate their twin links.`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

export function triangulateMeshFace(mesh: EditableMesh, faceId: FaceID): TriangulatedMeshFace | undefined {
  const faceVertices = getFaceVertices(mesh, faceId);

  if (faceVertices.length < 3) {
    return undefined;
  }

  const normal = computePolygonNormal(faceVertices.map((vertex) => vertex.position));
  const indices = triangulatePolygon3D(
    faceVertices.map((vertex) => vertex.position),
    normal
  );

  if (indices.length < 3) {
    return undefined;
  }

  return {
    faceId,
    vertexIds: faceVertices.map((vertex) => vertex.id),
    normal,
    indices
  };
}

export function triangulateEditableMesh(mesh: EditableMesh): TriangulatedEditableMesh {
  const validation = validateEditableMesh(mesh);
  const vertexIndexById = new Map(mesh.vertices.map((vertex, index) => [vertex.id, index]));
  const positions = mesh.vertices.flatMap((vertex) => [vertex.position.x, vertex.position.y, vertex.position.z]);
  const faces = mesh.faces
    .map((face) => triangulateMeshFace(mesh, face.id))
    .filter((face): face is TriangulatedMeshFace => Boolean(face));
  const indices = faces.flatMap((face) =>
    face.indices.map((localIndex) => vertexIndexById.get(face.vertexIds[localIndex]) ?? 0)
  );

  return {
    valid: validation.valid && faces.length > 0 && indices.length > 0,
    errors: validation.errors,
    faces,
    indices,
    positions
  };
}

function registerMeshVertex(
  registry: Map<string, EditableMeshVertex>,
  vertices: EditableMeshVertex[],
  position: Vec3,
  epsilon: number,
  preferredId?: VertexID
): EditableMeshVertex {
  const key = preferredId ? `id:${preferredId}` : makeVertexKey(position, epsilon);
  const existing = registry.get(key);

  if (existing) {
    return existing;
  }

  const vertex = {
    id: preferredId ?? `vertex:mesh:${vertices.length}`,
    position: vec3(position.x, position.y, position.z)
  };

  registry.set(key, vertex);
  vertices.push(vertex);
  return vertex;
}

function normalizePolygonLoop(positions: Vec3[]): Vec3[] {
  if (positions.length >= 2) {
    const first = positions[0];
    const last = positions[positions.length - 1];

    if (
      almostEqual(first.x, last.x) &&
      almostEqual(first.y, last.y) &&
      almostEqual(first.z, last.z)
    ) {
      return positions.slice(0, -1);
    }
  }

  return positions;
}

function makeVertexKey(position: Vec3, epsilon: number): string {
  return [
    Math.round(position.x / epsilon),
    Math.round(position.y / epsilon),
    Math.round(position.z / epsilon)
  ].join(":");
}
