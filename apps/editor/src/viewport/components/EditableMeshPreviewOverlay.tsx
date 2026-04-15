import { getFaceVertexIds, triangulateMeshFace } from "@ggez/geometry-kernel";
import { type EditableMesh, type GeometryNode } from "@ggez/shared";
import { useEffect, useRef, useState } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";

export function EditableMeshPreviewOverlay({
  mesh,
  node,
  presentation = "overlay",
  showWireframe = presentation === "overlay"
}: {
  mesh: EditableMesh;
  node: GeometryNode;
  presentation?: "overlay" | "solid";
  showWireframe?: boolean;
}) {
  const geometryRef = useRef<BufferGeometry>(new BufferGeometry());
  const wireframeGeometryRef = useRef<BufferGeometry>(new BufferGeometry());
  const [hasSurfaceGeometry, setHasSurfaceGeometry] = useState(false);
  const [hasWireframeGeometry, setHasWireframeGeometry] = useState(showWireframe);
  const topologyCacheRef = useRef<EditableMeshPreviewTopology | null>(null);
  const computeNormals = presentation === "solid";

  useEffect(() => {
    let topology = topologyCacheRef.current;

    if (!topology || !isPreviewTopologyCompatible(topology, mesh)) {
      topology = buildEditableMeshPreviewTopology(mesh);
      topologyCacheRef.current = topology;
    }

    if (topology.surfaceVertexIds.length === 0 || topology.surfaceIndices.length === 0) {
      clearGeometry(geometryRef.current);
      setHasSurfaceGeometry(false);
    } else {
      syncIndexedGeometryFromTopology(geometryRef.current, topology, mesh, computeNormals);
      setHasSurfaceGeometry(true);
    }

    if (!showWireframe) {
      clearGeometry(wireframeGeometryRef.current);
      setHasWireframeGeometry(false);
      return;
    }

    if (topology.wireframeEdges.length === 0) {
      clearGeometry(wireframeGeometryRef.current);
      setHasWireframeGeometry(false);
      return;
    }

    syncWireframeGeometryFromTopology(wireframeGeometryRef.current, topology, mesh);
    setHasWireframeGeometry(true);
  }, [mesh, showWireframe]);

  useEffect(
    () => () => {
      geometryRef.current.dispose();
      wireframeGeometryRef.current.dispose();
    },
    []
  );

  if (!hasSurfaceGeometry) {
    return null;
  }

  return (
    <NodeTransformGroup transform={node.transform}>
      <mesh frustumCulled={false} geometry={geometryRef.current} renderOrder={11}>
        {presentation === "solid" ? (
          <meshStandardMaterial
            color="#78c4b7"
            depthWrite
            metalness={0}
            roughness={1}
            side={DoubleSide}
            toneMapped={false}
          />
        ) : (
          <meshBasicMaterial
            color="#8b5cf6"
            depthWrite={false}
            opacity={0.48}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        )}
      </mesh>
      {hasWireframeGeometry && presentation === "overlay" ? (
        <lineSegments frustumCulled={false} geometry={wireframeGeometryRef.current} renderOrder={12}>
          <lineBasicMaterial color="#f8fafc" depthWrite={false} opacity={0.95} toneMapped={false} transparent />
        </lineSegments>
      ) : null}
    </NodeTransformGroup>
  );
}

type EditableMeshPreviewTopology = {
  faceVertexIds: string[][];
  /** Per-face-vertex index into the unique-vertex accumulation buffer (keyed by vertex ID). */
  surfaceVertexAccumIndices: number[];
  surfaceVertexUniqueCount: number;
  /** Pre-allocated accumulation buffer for smooth-normal computation. Cleared before each use. */
  normalAccumBuffer: Float32Array;
  surfaceIndices: number[];
  surfaceVertexIds: string[];
  wireframeEdges: Array<[string, string]>;
};

function buildEditableMeshPreviewTopology(mesh: EditableMesh): EditableMeshPreviewTopology {
  const faceVertexIds = mesh.faces.map((face) => getFaceVertexIds(mesh, face.id));
  const surfaceIndices: number[] = [];
  const surfaceVertexIds: string[] = [];
  let vertexOffset = 0;

  mesh.faces.forEach((face, faceIndex) => {
    const vertexIds = faceVertexIds[faceIndex];

    if (vertexIds.length < 3) {
      return;
    }

    const triangulated = triangulateMeshFace(mesh, face.id);

    if (!triangulated) {
      return;
    }

    surfaceVertexIds.push(...vertexIds);
    triangulated.indices.forEach((index) => {
      surfaceIndices.push(vertexOffset + index);
    });
    vertexOffset += vertexIds.length;
  });

  const halfEdgesById = new Map(mesh.halfEdges.map((halfEdge) => [halfEdge.id, halfEdge] as const));
  const seenEdges = new Set<string>();
  const wireframeEdges: Array<[string, string]> = [];

  mesh.halfEdges.forEach((halfEdge) => {
    if (!halfEdge.next) {
      return;
    }

    const nextHalfEdge = halfEdgesById.get(halfEdge.next);

    if (!nextHalfEdge) {
      return;
    }

    const edgeKey = halfEdge.vertex < nextHalfEdge.vertex
      ? `${halfEdge.vertex}|${nextHalfEdge.vertex}`
      : `${nextHalfEdge.vertex}|${halfEdge.vertex}`;

    if (seenEdges.has(edgeKey)) {
      return;
    }

    seenEdges.add(edgeKey);
    wireframeEdges.push([halfEdge.vertex, nextHalfEdge.vertex]);
  });

  const vertexIdToAccumIndex = new Map<string, number>();
  let uniqueCount = 0;
  const surfaceVertexAccumIndices: number[] = new Array(surfaceVertexIds.length);

  for (let i = 0; i < surfaceVertexIds.length; i++) {
    const id = surfaceVertexIds[i];
    let idx = vertexIdToAccumIndex.get(id);

    if (idx === undefined) {
      idx = uniqueCount++;
      vertexIdToAccumIndex.set(id, idx);
    }

    surfaceVertexAccumIndices[i] = idx;
  }

  return {
    faceVertexIds,
    surfaceVertexAccumIndices,
    surfaceVertexUniqueCount: uniqueCount,
    normalAccumBuffer: new Float32Array(uniqueCount * 3),
    surfaceIndices,
    surfaceVertexIds,
    wireframeEdges
  };
}

function isPreviewTopologyCompatible(topology: EditableMeshPreviewTopology, mesh: EditableMesh) {
  if (topology.faceVertexIds.length !== mesh.faces.length) {
    return false;
  }

  return mesh.faces.every((face, faceIndex) => {
    const previousVertexIds = topology.faceVertexIds[faceIndex];
    const nextVertexIds = getFaceVertexIds(mesh, face.id);

    if (previousVertexIds.length !== nextVertexIds.length) {
      return false;
    }

    return previousVertexIds.every((vertexId, vertexIndex) => vertexId === nextVertexIds[vertexIndex]);
  });
}

function syncIndexedGeometryFromTopology(
  geometry: BufferGeometry,
  topology: EditableMeshPreviewTopology,
  mesh: EditableMesh,
  computeNormals: boolean
) {
  const verticesById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position] as const));
  const positions = new Float32Array(topology.surfaceVertexIds.length * 3);

  topology.surfaceVertexIds.forEach((vertexId, index) => {
    const position = verticesById.get(vertexId);

    if (!position) {
      return;
    }

    const offset = index * 3;
    positions[offset] = position.x;
    positions[offset + 1] = position.y;
    positions[offset + 2] = position.z;
  });

  syncFloatAttribute(geometry, "position", positions, 3);
  syncIndexAttribute(geometry, topology.surfaceIndices);

  if (computeNormals) {
    syncSmoothNormals(geometry, topology, positions);
  }
}

/**
 * Computes smooth per-vertex normals by accumulating area-weighted face normals per vertex ID,
 * then writes them into the geometry's normal attribute. Reuses pre-allocated buffers stored on
 * the topology to avoid heap allocations during repeated sculpt updates.
 */
function syncSmoothNormals(
  geometry: BufferGeometry,
  topology: EditableMeshPreviewTopology,
  positions: Float32Array
) {
  const { surfaceIndices, surfaceVertexAccumIndices, surfaceVertexUniqueCount, normalAccumBuffer } = topology;
  const count = topology.surfaceVertexIds.length;

  // Clear the pre-allocated accumulation buffer.
  normalAccumBuffer.fill(0);

  // Accumulate area-weighted face normals into per-vertex-ID buckets.
  for (let i = 0; i < surfaceIndices.length; i += 3) {
    const ia = surfaceIndices[i];
    const ib = surfaceIndices[i + 1];
    const ic = surfaceIndices[i + 2];

    const ax = positions[ia * 3],     ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const bx = positions[ib * 3],     by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3],     cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];

    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;

    // Cross product gives an area-weighted face normal.
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    const accumA = surfaceVertexAccumIndices[ia] * 3;
    const accumB = surfaceVertexAccumIndices[ib] * 3;
    const accumC = surfaceVertexAccumIndices[ic] * 3;

    normalAccumBuffer[accumA]     += nx; normalAccumBuffer[accumA + 1] += ny; normalAccumBuffer[accumA + 2] += nz;
    normalAccumBuffer[accumB]     += nx; normalAccumBuffer[accumB + 1] += ny; normalAccumBuffer[accumB + 2] += nz;
    normalAccumBuffer[accumC]     += nx; normalAccumBuffer[accumC + 1] += ny; normalAccumBuffer[accumC + 2] += nz;
  }

  // Reuse the existing normal attribute buffer when the size matches to avoid allocation.
  const existingAttr = geometry.getAttribute("normal");
  const normals =
    existingAttr instanceof Float32BufferAttribute && existingAttr.array.length === count * 3
      ? (existingAttr.array as Float32Array)
      : new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const accumIdx = surfaceVertexAccumIndices[i] * 3;
    let nx = normalAccumBuffer[accumIdx];
    let ny = normalAccumBuffer[accumIdx + 1];
    let nz = normalAccumBuffer[accumIdx + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (len > 0.000001) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    normals[i * 3]     = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
  }

  if (normals === existingAttr?.array) {
    (existingAttr as Float32BufferAttribute).needsUpdate = true;
  } else {
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  }

  // Suppress unused variable warning – uniqueCount is used only for buffer sizing.
  void surfaceVertexUniqueCount;
}

function syncWireframeGeometryFromTopology(
  geometry: BufferGeometry,
  topology: EditableMeshPreviewTopology,
  mesh: EditableMesh
) {
  const verticesById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position] as const));
  const positions = new Float32Array(topology.wireframeEdges.length * 6);

  topology.wireframeEdges.forEach(([startId, endId], edgeIndex) => {
    const start = verticesById.get(startId);
    const end = verticesById.get(endId);

    if (!start || !end) {
      return;
    }

    const offset = edgeIndex * 6;
    positions[offset] = start.x;
    positions[offset + 1] = start.y;
    positions[offset + 2] = start.z;
    positions[offset + 3] = end.x;
    positions[offset + 4] = end.y;
    positions[offset + 5] = end.z;
  });

  syncFloatAttribute(geometry, "position", positions, 3);
}

function clearGeometry(geometry: BufferGeometry) {
  geometry.deleteAttribute("position");
  geometry.setIndex(null);
}

function syncFloatAttribute(
  geometry: BufferGeometry,
  attributeName: string,
  values: Float32Array,
  itemSize: number
) {
  const current = geometry.getAttribute(attributeName);

  if (!(current instanceof Float32BufferAttribute) || current.array.length !== values.length) {
    geometry.setAttribute(attributeName, new Float32BufferAttribute(values, itemSize));
    return;
  }

  current.array.set(values);
  current.needsUpdate = true;
}

function syncIndexAttribute(geometry: BufferGeometry, indices: number[]) {
  const current = geometry.getIndex();

  if (!(current instanceof Uint32BufferAttribute) || current.array.length !== indices.length) {
    geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    return;
  }

  current.array.set(indices);
  current.needsUpdate = true;
}
