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
      syncIndexedGeometryFromTopology(geometryRef.current, topology, mesh);
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
          <meshBasicMaterial
            color="#78c4b7"
            depthWrite
            opacity={0.88}
            side={DoubleSide}
            toneMapped={false}
            transparent
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

  return {
    faceVertexIds,
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
  mesh: EditableMesh
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
