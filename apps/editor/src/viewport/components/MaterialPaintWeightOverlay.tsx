/**
 * Renders a transparent overlay showing per-vertex material paint weights on the mesh during
 * a brush stroke, composited ON TOP of the original mesh material.
 *
 * Strategy: per-vertex `paintWeight` float attribute (0-1) drives fragment alpha directly via a
 * minimal ShaderMaterial. At weight=0 the fragment is fully transparent — the original mesh
 * material shows through unmodified. At weight=1 the overlay is fully opaque at MAX_OVERLAY_OPACITY.
 * This means there is zero visual interference with the underlying material even on terrain with
 * complex textures and lighting.
 *
 * Performance:
 * - Topology (positions, indices) built once and cached while face/vertex count is stable.
 * - Per-frame update: only the `paintWeight` Float32Array is mutated in-place (`needsUpdate`).
 * - `paintColor` uniform is updated via `uniform.value.set()` — no material recreation.
 * - Zero heap allocations per stroke tick after first draw.
 */

import { getFaceVertexIds, triangulateMeshFace } from "@ggez/geometry-kernel";
import { type EditableMesh, type GeometryNode } from "@ggez/shared";
import { useEffect, useRef } from "react";
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, ShaderMaterial, Uint32BufferAttribute } from "three";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";

/** Maximum overlay alpha at weight=1. */
const MAX_OVERLAY_OPACITY = 0.68;

const VERT_SHADER = /* glsl */`
  attribute float paintWeight;
  varying float vAlpha;
  void main() {
    vAlpha = paintWeight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_SHADER = /* glsl */`
  uniform vec3 paintColor;
  uniform float maxOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(paintColor, vAlpha * maxOpacity);
  }
`;

type PaintOverlayTopology = {
  faceCount: number;
  vertexCount: number;
  renderVertexIds: string[];
  surfaceIndices: number[];
};

export function MaterialPaintWeightOverlay({
  mesh,
  node,
  materialId,
  paintColor,
}: {
  mesh: EditableMesh;
  node: GeometryNode;
  materialId: string;
  paintColor: string;
}) {
  const geometryRef = useRef<BufferGeometry>(new BufferGeometry());
  const materialRef = useRef<ShaderMaterial | null>(null);
  const topologyCacheRef = useRef<PaintOverlayTopology | null>(null);

  // Create the shader material once.
  if (!materialRef.current) {
    materialRef.current = new ShaderMaterial({
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        paintColor: { value: new Color(paintColor) },
        maxOpacity: { value: MAX_OVERLAY_OPACITY },
      },
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER,
    });
  }

  // Update the paintColor uniform whenever the prop changes.
  useEffect(() => {
    materialRef.current?.uniforms.paintColor.value.set(paintColor);
  }, [paintColor]);

  useEffect(() => {
    const geometry = geometryRef.current;
    let topology = topologyCacheRef.current;

    if (!topology || topology.faceCount !== mesh.faces.length || topology.vertexCount !== mesh.vertices.length) {
      topology = buildOverlayTopology(mesh);
      topologyCacheRef.current = topology;

      const verticesById = new Map(mesh.vertices.map((v) => [v.id, v.position] as const));
      const n = topology.renderVertexIds.length;
      const positions = new Float32Array(n * 3);

      for (let i = 0; i < n; i++) {
        const pos = verticesById.get(topology.renderVertexIds[i]!);
        if (pos) {
          positions[i * 3]     = pos.x;
          positions[i * 3 + 1] = pos.y;
          positions[i * 3 + 2] = pos.z;
        }
      }

      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setAttribute("paintWeight", new Float32BufferAttribute(new Float32Array(n), 1));
      geometry.setIndex(new Uint32BufferAttribute(new Uint32Array(topology.surfaceIndices), 1));
    } else {
      // Topology compatible — update positions in-place.
      const verticesById = new Map(mesh.vertices.map((v) => [v.id, v.position] as const));
      const n = topology.renderVertexIds.length;
      const posAttr = geometry.getAttribute("position") as Float32BufferAttribute;
      const posArr = posAttr.array as Float32Array;

      for (let i = 0; i < n; i++) {
        const pos = verticesById.get(topology.renderVertexIds[i]!);
        if (pos) {
          posArr[i * 3]     = pos.x;
          posArr[i * 3 + 1] = pos.y;
          posArr[i * 3 + 2] = pos.z;
        }
      }
      posAttr.needsUpdate = true;
    }

    // Update paintWeight attribute in-place.
    const paintedLayer = mesh.materialLayers?.find((l) => l.materialId === materialId);
    const weights = paintedLayer?.weights;
    const vertexIndexById = weights
      ? new Map(mesh.vertices.map((v, i) => [v.id, i] as const))
      : undefined;
    const n = topology.renderVertexIds.length;
    const weightAttr = geometry.getAttribute("paintWeight") as Float32BufferAttribute;
    const weightArr = weightAttr.array as Float32Array;

    if (weights && vertexIndexById) {
      for (let i = 0; i < n; i++) {
        const vertexIdx = vertexIndexById.get(topology.renderVertexIds[i]!) ?? -1;
        weightArr[i] = vertexIdx >= 0 ? (weights[vertexIdx] ?? 0) : 0;
      }
    } else {
      weightArr.fill(0);
    }
    weightAttr.needsUpdate = true;
  }, [mesh, materialId]);

  useEffect(
    () => () => {
      geometryRef.current.dispose();
      materialRef.current?.dispose();
    },
    []
  );

  if (!topologyCacheRef.current?.renderVertexIds.length) return null;

  return (
    <NodeTransformGroup transform={node.transform}>
      <mesh
        frustumCulled={false}
        geometry={geometryRef.current}
        material={materialRef.current!}
        renderOrder={10}
      />
    </NodeTransformGroup>
  );
}

function buildOverlayTopology(mesh: EditableMesh): PaintOverlayTopology {
  const renderVertexIds: string[] = [];
  const surfaceIndices: number[] = [];
  let vertexOffset = 0;

  mesh.faces.forEach((face) => {
    const triangulated = triangulateMeshFace(mesh, face.id);
    if (!triangulated) return;

    const vertexIds = getFaceVertexIds(mesh, face.id);
    if (vertexIds.length < 3) return;

    renderVertexIds.push(...vertexIds);
    triangulated.indices.forEach((idx) => {
      surfaceIndices.push(vertexOffset + idx);
    });
    vertexOffset += vertexIds.length;
  });

  return {
    faceCount: mesh.faces.length,
    vertexCount: mesh.vertices.length,
    renderVertexIds,
    surfaceIndices,
  };
}