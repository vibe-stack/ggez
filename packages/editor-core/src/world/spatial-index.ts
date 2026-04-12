import type { Entity, GeometryNode, Transform, Vec3 } from "@ggez/shared";
import { addVec3, composeTransforms, isBrushNode, isMeshNode, isPrimitiveNode, resolveSceneGraph, scaleVec3, vec3 } from "@ggez/shared";
import type {
  Bounds3,
  DocumentID,
  DocumentSpatialIndexEntry,
  PartitionSpatialIndexEntry,
  PartitionID,
  WorldEntityHandle,
  WorldNodeHandle
} from "./types";

export type DocumentSpatialIndex = {
  entries: Map<string, DocumentSpatialIndexEntry>;
  getBounds: () => Bounds3 | undefined;
  queryBounds: (bounds: Bounds3) => DocumentSpatialIndexEntry[];
  queryPoint: (point: Vec3) => DocumentSpatialIndexEntry[];
};

export type WorldSpatialIndex = {
  documentEntries: Map<string, DocumentSpatialIndexEntry>;
  partitionEntries: Map<PartitionID, PartitionSpatialIndexEntry>;
  getBounds: () => Bounds3 | undefined;
  queryBounds: (bounds: Bounds3) => {
    documents: DocumentSpatialIndexEntry[];
    partitions: PartitionSpatialIndexEntry[];
  };
  queryPoint: (point: Vec3) => {
    documents: DocumentSpatialIndexEntry[];
    partitions: PartitionSpatialIndexEntry[];
  };
};

export function createDocumentSpatialIndex(
  documentId: DocumentID,
  nodes: Iterable<GeometryNode>,
  entities: Iterable<Entity>,
  mountTransform?: Transform
): DocumentSpatialIndex {
  const nodeList = Array.from(nodes);
  const entityList = Array.from(entities);
  const sceneGraph = resolveSceneGraph(nodeList, entityList);
  const entries = new Map<string, DocumentSpatialIndexEntry>();

  nodeList.forEach((node) => {
    const handle: WorldNodeHandle = {
      documentId,
      kind: "node",
      nodeId: node.id
    };
    const localTransform = sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform;
    const worldTransform = mountTransform ? composeTransforms(mountTransform, localTransform) : localTransform;
    entries.set(keyForHandle(handle), {
      bounds: createNodeBounds(node, worldTransform),
      handle
    });
  });

  entityList.forEach((entity) => {
    const handle: WorldEntityHandle = {
      documentId,
      entityId: entity.id,
      kind: "entity"
    };
    const localTransform = sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform;
    const worldTransform = mountTransform ? composeTransforms(mountTransform, localTransform) : localTransform;
    entries.set(keyForHandle(handle), {
      bounds: createTransformBounds(worldTransform, vec3(0.5, 0.5, 0.5)),
      handle
    });
  });

  return {
    entries,
    getBounds() {
      return mergeBounds(Array.from(entries.values(), (entry) => entry.bounds));
    },
    queryBounds(bounds) {
      return Array.from(entries.values()).filter((entry) => intersectsBounds(entry.bounds, bounds));
    },
    queryPoint(point) {
      return Array.from(entries.values()).filter((entry) => containsPoint(entry.bounds, point));
    }
  };
}

export function createWorldSpatialIndex(input: {
  documents: Array<{
    documentId: DocumentID;
    index: DocumentSpatialIndex;
  }>;
  partitions: Array<{
    bounds?: Bounds3;
    partitionId: PartitionID;
  }>;
}): WorldSpatialIndex {
  const documentEntries = new Map<string, DocumentSpatialIndexEntry>();
  const partitionEntries = new Map<PartitionID, PartitionSpatialIndexEntry>();

  input.documents.forEach((document) => {
    document.index.entries.forEach((entry, key) => {
      documentEntries.set(key, entry);
    });
  });

  input.partitions.forEach((partition) => {
    if (!partition.bounds) {
      return;
    }

    partitionEntries.set(partition.partitionId, {
      bounds: partition.bounds,
      partitionId: partition.partitionId
    });
  });

  return {
    documentEntries,
    partitionEntries,
    getBounds() {
      return mergeBounds([
        ...Array.from(documentEntries.values(), (entry) => entry.bounds),
        ...Array.from(partitionEntries.values(), (entry) => entry.bounds)
      ]);
    },
    queryBounds(bounds) {
      return {
        documents: Array.from(documentEntries.values()).filter((entry) => intersectsBounds(entry.bounds, bounds)),
        partitions: Array.from(partitionEntries.values()).filter((entry) => intersectsBounds(entry.bounds, bounds))
      };
    },
    queryPoint(point) {
      return {
        documents: Array.from(documentEntries.values()).filter((entry) => containsPoint(entry.bounds, point)),
        partitions: Array.from(partitionEntries.values()).filter((entry) => containsPoint(entry.bounds, point))
      };
    }
  };
}

export function createBounds(min: Vec3, max: Vec3): Bounds3 {
  return {
    max,
    min
  };
}

export function mergeBounds(boundsList: Bounds3[]): Bounds3 | undefined {
  if (boundsList.length === 0) {
    return undefined;
  }

  return boundsList.slice(1).reduce(
    (merged, bounds) => ({
      max: vec3(
        Math.max(merged.max.x, bounds.max.x),
        Math.max(merged.max.y, bounds.max.y),
        Math.max(merged.max.z, bounds.max.z)
      ),
      min: vec3(
        Math.min(merged.min.x, bounds.min.x),
        Math.min(merged.min.y, bounds.min.y),
        Math.min(merged.min.z, bounds.min.z)
      )
    }),
    boundsList[0]
  );
}

export function containsPoint(bounds: Bounds3, point: Vec3) {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}

export function intersectsBounds(left: Bounds3, right: Bounds3) {
  return !(
    left.max.x < right.min.x ||
    left.min.x > right.max.x ||
    left.max.y < right.min.y ||
    left.min.y > right.max.y ||
    left.max.z < right.min.z ||
    left.min.z > right.max.z
  );
}

function createNodeBounds(node: GeometryNode, transform: Transform): Bounds3 {
  if (isPrimitiveNode(node)) {
    return createTransformBounds(transform, scaleVec3(node.data.size, 0.5));
  }

  if (isBrushNode(node)) {
    return createTransformBounds(transform, scaleVec3(node.data.previewSize, 0.5));
  }

  if (isMeshNode(node)) {
    const points = node.data.vertices.map((vertex) =>
      addVec3(vertex.position, transform.position)
    );
    const meshBounds = points.length > 0 ? boundsFromPoints(points) : undefined;
    return meshBounds ?? createTransformBounds(transform, vec3(0.5, 0.5, 0.5));
  }

  return createTransformBounds(transform, vec3(0.5, 0.5, 0.5));
}

function createTransformBounds(transform: Transform, halfSize: Vec3): Bounds3 {
  return {
    max: vec3(
      transform.position.x + Math.abs(halfSize.x * transform.scale.x),
      transform.position.y + Math.abs(halfSize.y * transform.scale.y),
      transform.position.z + Math.abs(halfSize.z * transform.scale.z)
    ),
    min: vec3(
      transform.position.x - Math.abs(halfSize.x * transform.scale.x),
      transform.position.y - Math.abs(halfSize.y * transform.scale.y),
      transform.position.z - Math.abs(halfSize.z * transform.scale.z)
    )
  };
}

function boundsFromPoints(points: Vec3[]): Bounds3 | undefined {
  if (points.length === 0) {
    return undefined;
  }

  let min = structuredClone(points[0]);
  let max = structuredClone(points[0]);

  points.forEach((point) => {
    min = vec3(Math.min(min.x, point.x), Math.min(min.y, point.y), Math.min(min.z, point.z));
    max = vec3(Math.max(max.x, point.x), Math.max(max.y, point.y), Math.max(max.z, point.z));
  });

  return {
    max,
    min
  };
}

function keyForHandle(handle: WorldEntityHandle | WorldNodeHandle) {
  return handle.kind === "node"
    ? `node:${handle.documentId}:${handle.nodeId}`
    : `entity:${handle.documentId}:${handle.entityId}`;
}
