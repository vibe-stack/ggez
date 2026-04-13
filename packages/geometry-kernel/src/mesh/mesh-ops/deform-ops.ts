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
      vertices: mesh.vertices.map((vertex) => ({
        ...vertex,
        position: vec3(vertex.position.x, vertex.position.y, vertex.position.z),
      })),
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
    vertices: mesh.vertices.map((vertex) => ({
      ...vertex,
      position: vec3(vertex.position.x, vertex.position.y, vertex.position.z),
    })),
  };
}

function smoothBrushFalloff(distanceRatio: number) {
  const clamped = Math.max(0, Math.min(1, distanceRatio));
  const inverse = 1 - clamped;

  return inverse * inverse * (3 - 2 * inverse);
}
