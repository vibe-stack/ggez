import type { EditableMesh, EditableMeshMaterialLayer, MaterialID, Vec3, VertexID } from "@ggez/shared";
import { addVec3, averageVec3, clamp01, lengthVec3, normalizeEditableMeshMaterialLayers, normalizeVec3, scaleVec3, subVec3, vec3 } from "@ggez/shared";
import { computePolygonNormal } from "../../polygon/polygon-utils";
import { getFaceVertices } from "../editable-mesh";

export type SculptSample = {
  normal?: Vec3;
  point: Vec3;
};

export type MaterialPaintMode = "add" | "erase";

export function buildEditableMeshVertexNormals(mesh: EditableMesh) {
  const normalsByVertexId = new Map<VertexID, Vec3>();

  mesh.faces.forEach((face) => {
    const vertices = getFaceVertices(mesh, face.id);

    if (vertices.length < 3) {
      return;
    }

    const normal = computePolygonNormal(vertices.map((vertex) => vertex.position));

    vertices.forEach((vertex) => {
      const current = normalsByVertexId.get(vertex.id) ?? vec3(0, 0, 0);
      normalsByVertexId.set(vertex.id, addVec3(current, normal));
    });
  });

  return normalsByVertexId;
}

export function inflateEditableMesh(mesh: EditableMesh, factor: number): EditableMesh {
  if (Math.abs(factor) <= 0.000001) {
    return {
      ...mesh,
      vertices: mesh.vertices.map((vertex) => ({
        ...vertex,
        position: vec3(vertex.position.x, vertex.position.y, vertex.position.z)
      }))
    };
  }

  const normalsByVertexId = buildEditableMeshVertexNormals(mesh);

  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => {
      const averagedNormal = normalizeVec3(normalsByVertexId.get(vertex.id) ?? vec3(0, 0, 0));

      return {
        ...vertex,
        position: addVec3(vertex.position, scaleVec3(averagedNormal, factor))
      };
    })
  };
}

export function translateEditableMeshVertices(
  mesh: EditableMesh,
  vertexIds: VertexID[],
  offset: Vec3,
  epsilon = 0.0001
): EditableMesh | undefined {
  const selectedVertexIds = new Set(
    vertexIds.filter((vertexId) => mesh.vertices.some((vertex) => vertex.id === vertexId))
  );

  if (selectedVertexIds.size === 0) {
    return undefined;
  }

  if (lengthVec3(offset) <= epsilon) {
    return {
      ...mesh,
      vertices: mesh.vertices.map((vertex) => ({
        ...vertex,
        position: vec3(vertex.position.x, vertex.position.y, vertex.position.z)
      }))
    };
  }

  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => ({
      ...vertex,
      position: selectedVertexIds.has(vertex.id)
        ? addVec3(vertex.position, offset)
        : vec3(vertex.position.x, vertex.position.y, vertex.position.z)
    }))
  };
}

export function scaleEditableMeshVertices(
  mesh: EditableMesh,
  vertexIds: VertexID[],
  scale: Vec3,
  pivot?: Vec3,
  epsilon = 0.0001
): EditableMesh | undefined {
  const selectedVertices = mesh.vertices.filter((vertex) => vertexIds.includes(vertex.id));

  if (selectedVertices.length === 0) {
    return undefined;
  }

  const pivotPoint = pivot ?? averageVec3(selectedVertices.map((vertex) => vertex.position));
  const isIdentityScale =
    Math.abs(scale.x - 1) <= epsilon &&
    Math.abs(scale.y - 1) <= epsilon &&
    Math.abs(scale.z - 1) <= epsilon;

  if (isIdentityScale) {
    return {
      ...mesh,
      vertices: mesh.vertices.map((vertex) => ({
        ...vertex,
        position: vec3(vertex.position.x, vertex.position.y, vertex.position.z)
      }))
    };
  }

  const selectedVertexIds = new Set(selectedVertices.map((vertex) => vertex.id));

  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => {
      if (!selectedVertexIds.has(vertex.id)) {
        return {
          ...vertex,
          position: vec3(vertex.position.x, vertex.position.y, vertex.position.z)
        };
      }

      const localOffset = subVec3(vertex.position, pivotPoint);

      return {
        ...vertex,
        position: vec3(
          pivotPoint.x + localOffset.x * scale.x,
          pivotPoint.y + localOffset.y * scale.y,
          pivotPoint.z + localOffset.z * scale.z
        )
      };
    })
  };
}

export function offsetEditableMeshTop(mesh: EditableMesh, amount: number, epsilon = 0.0001): EditableMesh {
  if (Math.abs(amount) <= epsilon) {
    return {
      ...mesh,
      vertices: mesh.vertices.map((vertex) => ({
        ...vertex,
        position: vec3(vertex.position.x, vertex.position.y, vertex.position.z)
      }))
    };
  }

  const maxY = mesh.vertices.reduce((currentMax, vertex) => Math.max(currentMax, vertex.position.y), Number.NEGATIVE_INFINITY);

  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => ({
      ...vertex,
      position:
        Math.abs(vertex.position.y - maxY) <= epsilon
          ? vec3(vertex.position.x, vertex.position.y + amount, vertex.position.z)
          : vec3(vertex.position.x, vertex.position.y, vertex.position.z)
    }))
  };
}

export function sculptEditableMesh(
  mesh: EditableMesh,
  center: Vec3,
  radius: number,
  amount: number,
  brushNormal?: Vec3,
  epsilon = 0.0001
): EditableMesh {
  return sculptEditableMeshSamples(mesh, [{ normal: brushNormal, point: center }], radius, amount, epsilon);
}

/**
 * Smooths surface deformations under the brush using Laplacian relaxation weighted by a
 * smooth cubic falloff. For each vertex within `radius` of any sample point, its position
 * is pulled toward the average position of its immediate neighbours, blended by
 * `strength * falloff`. The effect is applied independently per sample then accumulated,
 * so stroke interpolation produces continuous results identical to `sculptEditableMeshSamples`.
 *
 * Unlike inflate/deflate, smoothing does NOT use or modify vertex normals — it purely
 * relaxes position variance, producing the zBrush-style smooth behaviour.
 */
export function smoothEditableMeshSamples(
  mesh: EditableMesh,
  samples: SculptSample[],
  radius: number,
  strength: number,
  epsilon = 0.0001
): EditableMesh {
  if (radius <= epsilon || Math.abs(strength) <= epsilon || mesh.vertices.length === 0) {
    return mesh;
  }

  // Build vertex adjacency: for each vertex id, collect the ids of immediately connected vertices
  // (one edge away) so we can compute the Laplacian average quickly.
  const neighbourIds = new Map<VertexID, VertexID[]>();

  mesh.vertices.forEach((vertex) => {
    if (!neighbourIds.has(vertex.id)) {
      neighbourIds.set(vertex.id, []);
    }
  });

  // Walk half-edges to extract the 1-ring neighbourhood for every vertex.
  const halfEdgesById = new Map(mesh.halfEdges.map((he) => [he.id, he]));

  mesh.halfEdges.forEach((he) => {
    if (!he.next) return;
    const next = halfEdgesById.get(he.next);
    if (!next) return;
    const from = he.vertex;
    const to = next.vertex;
    if (from === to) return;
    const list = neighbourIds.get(from);
    if (list && !list.includes(to)) list.push(to);
  });

  const posById = new Map(mesh.vertices.map((v) => [v.id, v.position]));
  const clampedStrength = Math.max(0, Math.min(1, strength));

  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => {
      // Accumulate the maximum falloff weight from all samples to this vertex.
      let maxFalloff = 0;

      for (const sample of samples) {
        const dist = lengthVec3(subVec3(vertex.position, sample.point));
        if (dist < radius) {
          const f = smoothBrushFalloff(dist / radius);
          if (f > maxFalloff) maxFalloff = f;
        }
      }

      if (maxFalloff <= epsilon) {
        return vertex;
      }

      const neighbours = neighbourIds.get(vertex.id);
      if (!neighbours || neighbours.length === 0) {
        return vertex;
      }

      // Laplacian centroid of 1-ring neighbours.
      let cx = 0, cy = 0, cz = 0;
      for (const nid of neighbours) {
        const np = posById.get(nid);
        if (np) { cx += np.x; cy += np.y; cz += np.z; }
      }
      const n = neighbours.length;
      cx /= n; cy /= n; cz /= n;

      // Move vertex toward centroid by strength * falloff.
      const t = clampedStrength * maxFalloff;
      return {
        ...vertex,
        position: vec3(
          vertex.position.x + (cx - vertex.position.x) * t,
          vertex.position.y + (cy - vertex.position.y) * t,
          vertex.position.z + (cz - vertex.position.z) * t
        )
      };
    })
  };
}

export function sculptEditableMeshSamples(
  mesh: EditableMesh,
  samples: SculptSample[],
  radius: number,
  amount: number,
  epsilon = 0.0001,
  vertexNormals?: ReadonlyMap<VertexID, Vec3>
): EditableMesh {
  if (radius <= epsilon || Math.abs(amount) <= epsilon) {
    return {
      ...mesh,
      vertices: mesh.vertices.map((vertex) => ({
        ...vertex,
        position: vec3(vertex.position.x, vertex.position.y, vertex.position.z)
      }))
    };
  }

  const normalsByVertexId = vertexNormals ?? buildEditableMeshVertexNormals(mesh);
  const normalizedSamples = samples.map((sample) => ({
    normal:
      sample.normal && lengthVec3(sample.normal) > epsilon
        ? normalizeVec3(sample.normal)
        : undefined,
    point: sample.point
  }));
  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => {
      const averagedNormal = normalizeVec3(normalsByVertexId.get(vertex.id) ?? vec3(0, 0, 0));
      let displacement = vec3(0, 0, 0);

      normalizedSamples.forEach((sample) => {
        const offset = subVec3(vertex.position, sample.point);
        const distance = lengthVec3(offset);

        if (distance >= radius) {
          return;
        }

        const falloff = smoothBrushFalloff(distance / radius);
        const direction =
          sample.normal && lengthVec3(averagedNormal) > epsilon
            ? normalizeVec3(averageVec3([averagedNormal, sample.normal]))
            : sample.normal ?? averagedNormal;

        if (lengthVec3(direction) <= epsilon) {
          return;
        }

        displacement = addVec3(displacement, scaleVec3(direction, amount * falloff));
      });

      if (lengthVec3(displacement) <= epsilon) {
        return vertex;
      }

      return {
        ...vertex,
        position: addVec3(vertex.position, displacement)
      };
    })
  };
}

export function paintEditableMeshMaterialLayers(
  mesh: EditableMesh,
  materialId: MaterialID,
  samples: SculptSample[],
  radius: number,
  amount: number,
  opacity = 1,
  mode: MaterialPaintMode = "add",
  epsilon = 0.0001,
): EditableMesh {
  if (!materialId || radius <= epsilon || Math.abs(amount) <= epsilon || mesh.vertices.length === 0) {
    return {
      ...mesh,
      materialBlend: undefined,
      materialLayers: normalizeEditableMeshMaterialLayers(mesh.materialLayers, mesh.vertices.length, mesh.materialBlend),
    };
  }

  const sourceLayers = normalizeEditableMeshMaterialLayers(mesh.materialLayers, mesh.vertices.length, mesh.materialBlend) ?? [];
  const sourceLayerIndex = sourceLayers.findIndex((layer) => layer.materialId === materialId);
  const sourceLayer = sourceLayerIndex >= 0 ? sourceLayers[sourceLayerIndex] : undefined;
  const signedAmount = mode === "erase" ? -Math.abs(amount) : Math.abs(amount);
  const normalizedSamples = samples.map((sample) => sample.point);
  const nextWeights = mesh.vertices.map((vertex, vertexIndex) => {
    const currentWeight = sourceLayer?.weights[vertexIndex] ?? 0;
    let nextWeight = currentWeight;

    normalizedSamples.forEach((point) => {
      const distance = lengthVec3(subVec3(vertex.position, point));

      if (distance >= radius) {
        return;
      }

      nextWeight = clamp01(nextWeight + signedAmount * smoothBrushFalloff(distance / radius));
    });

    return nextWeight;
  });

  const nextLayer: EditableMeshMaterialLayer = {
    materialId,
    opacity,
    weights: nextWeights,
  };
  const nextLayers = [...sourceLayers];

  if (sourceLayerIndex >= 0) {
    nextLayers[sourceLayerIndex] = nextLayer;
  } else {
    nextLayers.push(nextLayer);
  }

  const normalizedLayers = normalizeEditableMeshMaterialLayers(nextLayers, mesh.vertices.length);

  return {
    ...mesh,
    materialBlend: undefined,
    materialLayers: normalizedLayers,
  };
}

function smoothBrushFalloff(distanceRatio: number) {
  const clamped = Math.max(0, Math.min(1, distanceRatio));
  const inverse = 1 - clamped;

  return inverse * inverse * (3 - 2 * inverse);
}
