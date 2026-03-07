import { getFaceVertexIds } from "@web-hammer/geometry-kernel";
import { vec3, type EditableMesh, type GeometryNode, type Vec3 } from "@web-hammer/shared";
import { useMemo } from "react";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";
import { EditableFaceSelectionHitArea, PreviewLine } from "@/viewport/components/SelectionVisuals";
import { createMeshEditHandles } from "@/viewport/editing";

type PreviewEdge = {
  end: Vec3;
  key: string;
  start: Vec3;
};

export function MeshSubdivideOverlay({
  faceId,
  mesh,
  node,
  onCommitSubdivision,
  previewMesh
}: {
  faceId: string;
  mesh: EditableMesh;
  node: GeometryNode;
  onCommitSubdivision: (mesh: EditableMesh) => void;
  previewMesh: EditableMesh;
}) {
  const faceHandle = useMemo(
    () => createMeshEditHandles(mesh, "face").find((handle) => handle.id === faceId),
    [faceId, mesh]
  );
  const previewEdges = useMemo(() => {
    const facePrefix = `${faceId}:subdiv:`;
    const verticesById = new Map(previewMesh.vertices.map((vertex) => [vertex.id, vertex.position] as const));
    const edges = new Map<string, PreviewEdge>();

    previewMesh.faces
      .filter((face) => face.id.startsWith(facePrefix))
      .forEach((face) => {
        const vertexIds = getFaceVertexIds(previewMesh, face.id);

        vertexIds.forEach((vertexId, index) => {
          const nextVertexId = vertexIds[(index + 1) % vertexIds.length];
          const start = verticesById.get(vertexId);
          const end = verticesById.get(nextVertexId);

          if (!start || !end) {
            return;
          }

          const key =
            vertexId < nextVertexId ? `${vertexId}|${nextVertexId}` : `${nextVertexId}|${vertexId}`;

          if (edges.has(key)) {
            return;
          }

          edges.set(key, {
            end: vec3(end.x, end.y, end.z),
            key,
            start: vec3(start.x, start.y, start.z)
          });
        });
      });

    return Array.from(edges.values());
  }, [faceId, previewMesh]);

  if (!faceHandle?.points || faceHandle.points.length < 3) {
    return null;
  }

  return (
    <NodeTransformGroup transform={node.transform}>
      <EditableFaceSelectionHitArea
        normal={faceHandle.normal}
        onSelect={() => {}}
        onSelectPoint={() => {
          onCommitSubdivision(previewMesh);
        }}
        points={faceHandle.points}
        selected
      />
      {previewEdges.map((edge) => (
        <PreviewLine color="#7dd3fc" end={edge.end} key={edge.key} start={edge.start} />
      ))}
    </NodeTransformGroup>
  );
}
