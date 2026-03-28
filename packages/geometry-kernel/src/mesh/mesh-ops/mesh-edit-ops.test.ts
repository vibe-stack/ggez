import { describe, expect, test } from "bun:test";
import { averageVec3, dotVec3, subVec3, vec3 } from "@ggez/shared";
import { computePolygonNormal } from "../../polygon/polygon-utils";
import {
  createEditableMeshFromPolygons,
  getFaceVertexIds,
  getFaceVertices,
  validateEditableMesh
} from "../editable-mesh";
import { bevelEditableMeshEdge, bevelEditableMeshEdges } from "./bevel-ops";
import { buildEditableMeshFaceCutPreview, cutEditableMeshFace } from "./cut-ops";
import { subdivideEditableMeshFace } from "./subdivide-ops";

describe("subdivideEditableMeshFace", () => {
  test("restitches adjacent cube faces with the new boundary vertices", () => {
    const result = subdivideEditableMeshFace(createCube(), "front", 1);

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);
    expect(getFaceVertexIds(result!, "bottom")).toContain("front:subdiv:edge:0:1");
    expect(getFaceVertexIds(result!, "right")).toContain("front:subdiv:edge:1:1");
    expect(getFaceVertexIds(result!, "top")).toContain("front:subdiv:edge:2:1");
    expect(getFaceVertexIds(result!, "left")).toContain("front:subdiv:edge:3:1");
    expect(findHalfEdge(result!, "bottom", "front:subdiv:edge:0:1", "e")?.twin).toBeDefined();
    expect(findHalfEdge(result!, "front:subdiv:0:0", "e", "front:subdiv:edge:0:1")?.twin).toBeDefined();
  });

  test("restitches adjacent faces on primitive cube meshes created without explicit vertex ids", () => {
    const mesh = createPrimitiveCubeMesh();
    const result = subdivideEditableMeshFace(mesh, "brush:cube:face:front", 1);

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);
    expect(findHalfEdge(result!, "brush:cube:face:bottom", "brush:cube:face:front:subdiv:edge:0:1", "vertex:mesh:4")?.twin).toBeDefined();
    expect(findHalfEdge(result!, "brush:cube:face:front:subdiv:0:0", "vertex:mesh:4", "brush:cube:face:front:subdiv:edge:0:1")?.twin).toBeDefined();
  });

  test("keeps the full boundary stitched for high-count subdivision", () => {
    const result = subdivideEditableMeshFace(createPrimitiveCubeMesh(), "brush:cube:face:front", 8);

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);

    const bottomChain = [
      "vertex:mesh:4",
      ...Array.from({ length: 8 }, (_, index) => `brush:cube:face:front:subdiv:edge:0:${index + 1}`),
      "vertex:mesh:3"
    ];

    for (let index = 0; index < bottomChain.length - 1; index += 1) {
      expect(countFacesUsingUndirectedEdge(result!, [bottomChain[index], bottomChain[index + 1]])).toBe(2);
    }
  });
});

describe("buildEditableMeshFaceCutPreview", () => {
  test("chooses the cut axis from the nearest face boundary instead of the face center", () => {
    const mesh = createEditableMeshFromPolygons([
      {
        id: "face",
        positions: [vec3(0, 0, 0), vec3(4, 0, 0), vec3(4, 2, 0), vec3(0, 2, 0)],
        vertexIds: ["a", "b", "c", "d"]
      }
    ]);
    const preview = buildEditableMeshFaceCutPreview(mesh, "face", vec3(3.2, 1.6, 0), 0.5);

    expect(preview).toBeDefined();
    expect(preview!.start.y).toBeCloseTo(1.5, 5);
    expect(preview!.end.y).toBeCloseTo(1.5, 5);
    expect(Math.min(preview!.start.x, preview!.end.x)).toBeCloseTo(0, 5);
    expect(Math.max(preview!.start.x, preview!.end.x)).toBeCloseTo(4, 5);
  });

  test("snaps face cuts from the face boundary instead of a center-shifted local origin", () => {
    const mesh = createEditableMeshFromPolygons([
      {
        id: "face",
        positions: [vec3(0, 0, 0), vec3(3, 0, 0), vec3(3, 2, 0), vec3(0, 2, 0)],
        vertexIds: ["a", "b", "c", "d"]
      }
    ]);
    const preview = buildEditableMeshFaceCutPreview(mesh, "face", vec3(0.8, 1, 0), 1);

    expect(preview).toBeDefined();
    expect(preview!.start.x).toBeCloseTo(1, 5);
    expect(preview!.end.x).toBeCloseTo(1, 5);
    expect(Math.min(preview!.start.y, preview!.end.y)).toBeCloseTo(0, 5);
    expect(Math.max(preview!.start.y, preview!.end.y)).toBeCloseTo(2, 5);
  });
});

describe("cutEditableMeshFace", () => {
  test("reuses the same cut vertices on the target face and neighboring faces", () => {
    const result = cutEditableMeshFace(createCube(), "front", vec3(0.4, 0.5, 1), 0.25);

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);

    const cutVertexIds = result!.vertices
      .filter((vertex) => Math.abs(vertex.position.x - 0.5) <= 0.000001 && Math.abs(vertex.position.z - 1) <= 0.000001)
      .map((vertex) => vertex.id);

    expect(cutVertexIds).toHaveLength(2);
    cutVertexIds.forEach((vertexId) => {
      expect(getFaceVertexIds(result!, "front:cut:1").includes(vertexId) || getFaceVertexIds(result!, "front:cut:2").includes(vertexId)).toBe(true);
    });
    expect(getFaceVertexIds(result!, "top").some((vertexId) => cutVertexIds.includes(vertexId))).toBe(true);
    expect(getFaceVertexIds(result!, "bottom").some((vertexId) => cutVertexIds.includes(vertexId))).toBe(true);
  });

  test("reuses the same cut vertices on primitive cube meshes created without explicit vertex ids", () => {
    const result = cutEditableMeshFace(createPrimitiveCubeMesh(), "brush:cube:face:front", vec3(0, 0, 0.5), 0.25);

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);

    const cutVertexIds = result!.vertices
      .filter((vertex) => Math.abs(vertex.position.x) <= 0.000001 && Math.abs(vertex.position.z - 0.5) <= 0.000001)
      .map((vertex) => vertex.id);

    expect(cutVertexIds).toHaveLength(2);
    expect(getFaceVertexIds(result!, "brush:cube:face:top").some((vertexId) => cutVertexIds.includes(vertexId))).toBe(true);
    expect(getFaceVertexIds(result!, "brush:cube:face:bottom").some((vertexId) => cutVertexIds.includes(vertexId))).toBe(true);
  });
});

describe("bevelEditableMeshEdge", () => {
  test("keeps beveled cube face normals pointing outward for inward and outward bevel widths", () => {
    for (const width of [0.2, -0.2]) {
      const result = bevelEditableMeshEdge(createCube(), ["g", "h"], width, 2, "flat");

      expect(result).toBeDefined();
      expect(validateEditableMesh(result!).valid).toBe(true);

      const meshCenter = averageVec3(result!.vertices.map((vertex) => vertex.position));

      result!.faces.forEach((face) => {
        const positions = getFaceVertices(result!, face.id).map((vertex) => vertex.position);
        const normal = computePolygonNormal(positions);
        const faceCenter = averageVec3(positions);

        expect(dotVec3(normal, subVec3(faceCenter, meshCenter))).toBeGreaterThan(0.0001);
      });
    }
  });
});

describe("bevelEditableMeshEdges", () => {
  test("keeps inward multi-edge bevel normals pointing outward", () => {
    for (const width of [0.2, -0.2]) {
      const result = bevelEditableMeshEdges(createCube(), [["e", "f"], ["f", "g"], ["g", "h"], ["h", "e"]], width, 2, "flat");

      expect(result).toBeDefined();
      expect(validateEditableMesh(result!).valid).toBe(true);

      const meshCenter = averageVec3(result!.vertices.map((vertex) => vertex.position));

      result!.faces.forEach((face) => {
        const positions = getFaceVertices(result!, face.id).map((vertex) => vertex.position);
        const normal = computePolygonNormal(positions);
        const faceCenter = averageVec3(positions);

        expect(dotVec3(normal, subVec3(faceCenter, meshCenter))).toBeGreaterThan(0.0001);
      });
    }
  });

  test("keeps primitive cube face bevel normals pointing outward", () => {
    for (const width of [0.2, -0.2]) {
      const result = bevelEditableMeshEdges(
        createPrimitiveCubeMesh(),
        [
          ["vertex:mesh:4", "vertex:mesh:5"],
          ["vertex:mesh:5", "vertex:mesh:6"],
          ["vertex:mesh:6", "vertex:mesh:7"],
          ["vertex:mesh:7", "vertex:mesh:4"]
        ],
        width,
        2,
        "flat"
      );

      expect(result).toBeDefined();
      expect(validateEditableMesh(result!).valid).toBe(true);

      const meshCenter = averageVec3(result!.vertices.map((vertex) => vertex.position));

      result!.faces.forEach((face) => {
        const positions = getFaceVertices(result!, face.id).map((vertex) => vertex.position);
        const normal = computePolygonNormal(positions);
        const faceCenter = averageVec3(positions);

        expect(dotVec3(normal, subVec3(faceCenter, meshCenter))).toBeGreaterThan(0.0001);
      });
    }
  });

  test("keeps single-edge bevel topology stitched without coincident duplicate vertices", () => {
    const result = bevelEditableMeshEdges(createPrimitiveCubeMesh(), [["vertex:mesh:4", "vertex:mesh:3"]], 0.2, 2, "flat");

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);
    expect(findCoincidentVertexGroups(result!).length).toBe(0);
  });

  test("keeps every bevel slice connected for single-edge bevels with many steps", () => {
    const result = bevelEditableMeshEdges(createPrimitiveCubeMesh(), [["vertex:mesh:4", "vertex:mesh:3"]], 0.2, 5, "flat");

    expect(result).toBeDefined();
    expect(validateEditableMesh(result!).valid).toBe(true);

    const edgeUsage = collectUndirectedEdgeUsage(result!);

    edgeUsage.forEach((count) => {
      expect(count).toBe(2);
    });
  });
});

function createCube() {
  return createEditableMeshFromPolygons([
    {
      id: "back",
      positions: [vec3(0, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), vec3(1, 0, 0)],
      vertexIds: ["a", "d", "c", "b"]
    },
    {
      id: "front",
      positions: [vec3(0, 0, 1), vec3(1, 0, 1), vec3(1, 1, 1), vec3(0, 1, 1)],
      vertexIds: ["e", "f", "g", "h"]
    },
    {
      id: "left",
      positions: [vec3(0, 0, 0), vec3(0, 0, 1), vec3(0, 1, 1), vec3(0, 1, 0)],
      vertexIds: ["a", "e", "h", "d"]
    },
    {
      id: "right",
      positions: [vec3(1, 0, 0), vec3(1, 1, 0), vec3(1, 1, 1), vec3(1, 0, 1)],
      vertexIds: ["b", "c", "g", "f"]
    },
    {
      id: "bottom",
      positions: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 0, 1), vec3(0, 0, 1)],
      vertexIds: ["a", "b", "f", "e"]
    },
    {
      id: "top",
      positions: [vec3(0, 1, 0), vec3(0, 1, 1), vec3(1, 1, 1), vec3(1, 1, 0)],
      vertexIds: ["d", "h", "g", "c"]
    }
  ]);
}

function createPrimitiveCubeMesh() {
  return createEditableMeshFromPolygons([
    {
      id: "brush:cube:face:right",
      positions: [vec3(0.5, -0.5, -0.5), vec3(0.5, 0.5, -0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, -0.5, 0.5)]
    },
    {
      id: "brush:cube:face:left",
      positions: [vec3(-0.5, -0.5, 0.5), vec3(-0.5, 0.5, 0.5), vec3(-0.5, 0.5, -0.5), vec3(-0.5, -0.5, -0.5)]
    },
    {
      id: "brush:cube:face:top",
      positions: [vec3(-0.5, 0.5, -0.5), vec3(-0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, -0.5)]
    },
    {
      id: "brush:cube:face:bottom",
      positions: [vec3(-0.5, -0.5, 0.5), vec3(-0.5, -0.5, -0.5), vec3(0.5, -0.5, -0.5), vec3(0.5, -0.5, 0.5)]
    },
    {
      id: "brush:cube:face:front",
      positions: [vec3(-0.5, -0.5, 0.5), vec3(0.5, -0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(-0.5, 0.5, 0.5)]
    },
    {
      id: "brush:cube:face:back",
      positions: [vec3(0.5, -0.5, -0.5), vec3(-0.5, -0.5, -0.5), vec3(-0.5, 0.5, -0.5), vec3(0.5, 0.5, -0.5)]
    }
  ]);
}

function findHalfEdge(mesh: ReturnType<typeof createCube>, faceId: string, startId: string, endId: string) {
  const face = mesh.faces.find((candidate) => candidate.id === faceId);

  if (!face) {
    return undefined;
  }

  const halfEdgesById = new Map(mesh.halfEdges.map((halfEdge) => [halfEdge.id, halfEdge] as const));
  let currentId: string | undefined = face.halfEdge;
  let guard = 0;

  while (currentId && guard < mesh.halfEdges.length + 1) {
    const halfEdge = halfEdgesById.get(currentId);

    if (!halfEdge?.next) {
      return undefined;
    }

    const nextHalfEdge = halfEdgesById.get(halfEdge.next);

    if (!nextHalfEdge) {
      return undefined;
    }

    if (halfEdge.vertex === startId && nextHalfEdge.vertex === endId) {
      return halfEdge;
    }

    currentId = halfEdge.next;
    guard += 1;

    if (currentId === face.halfEdge) {
      break;
    }
  }

  return undefined;
}

function countFacesUsingUndirectedEdge(mesh: ReturnType<typeof createCube>, edge: [string, string]) {
  return mesh.faces.filter((face) => {
    const vertexIds = getFaceVertexIds(mesh, face.id);

    return vertexIds.some((vertexId, index) => {
      const nextVertexId = vertexIds[(index + 1) % vertexIds.length];
      return makeUndirectedEdgeKey(vertexId, nextVertexId) === makeUndirectedEdgeKey(edge[0], edge[1]);
    });
  }).length;
}

function findCoincidentVertexGroups(mesh: ReturnType<typeof createCube>, epsilon = 0.000001) {
  const groups = new Map<string, string[]>();

  mesh.vertices.forEach((vertex) => {
    const key = [
      Math.round(vertex.position.x / epsilon),
      Math.round(vertex.position.y / epsilon),
      Math.round(vertex.position.z / epsilon)
    ].join(":");
    const ids = groups.get(key) ?? [];

    ids.push(vertex.id);
    groups.set(key, ids);
  });

  return Array.from(groups.values()).filter((ids) => ids.length > 1);
}

function makeUndirectedEdgeKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function collectUndirectedEdgeUsage(mesh: ReturnType<typeof createCube>) {
  const counts = new Map<string, number>();

  mesh.faces.forEach((face) => {
    const vertexIds = getFaceVertexIds(mesh, face.id);

    vertexIds.forEach((vertexId, index) => {
      const nextVertexId = vertexIds[(index + 1) % vertexIds.length];
      const key = makeUndirectedEdgeKey(vertexId, nextVertexId);

      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return counts;
}
