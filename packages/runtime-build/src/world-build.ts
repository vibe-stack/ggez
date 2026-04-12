import { zipSync } from "fflate";
import { buildRuntimeBundleFromSnapshot } from "./snapshot-build";
import { buildRuntimeWorldIndex, type ExternalizeRuntimeAssetsOptions } from "./bundle";
import { flattenWorldBundle } from "@ggez/editor-core";
import type {
  AuthoringDocumentSnapshot,
  StreamingPartition,
  WorldPersistenceBundle
} from "@ggez/editor-core";
import type { RuntimeBundleFile, RuntimeWorldBundle, RuntimeWorldChunk } from "@ggez/runtime-format";
import { vec3 } from "@ggez/shared";

export async function buildRuntimeWorldBundleFromWorld(
  bundle: WorldPersistenceBundle,
  options: ExternalizeRuntimeAssetsOptions = {}
): Promise<RuntimeWorldBundle> {
  const files: RuntimeBundleFile[] = [];
  const chunks: RuntimeWorldChunk[] = [];

  for (const partition of Object.values(bundle.partitions)) {
    const partitionSnapshot = buildPartitionSceneSnapshot(bundle, partition);
    const runtimeBundle = await buildRuntimeBundleFromSnapshot(partitionSnapshot, options);
    const manifestPath = `chunks/${partition.id}/scene.runtime.json`;

    files.push({
      bytes: new TextEncoder().encode(JSON.stringify(runtimeBundle.manifest)),
      mimeType: "application/json",
      path: manifestPath
    });

    runtimeBundle.files.forEach((file) => {
      files.push({
        ...file,
        path: `chunks/${partition.id}/${file.path}`
      });
    });

    chunks.push({
      bounds: partition.bounds
        ? [
            partition.bounds.min.x,
            partition.bounds.min.y,
            partition.bounds.min.z,
            partition.bounds.max.x,
            partition.bounds.max.y,
            partition.bounds.max.z
          ]
        : inferChunkBounds(partitionSnapshot),
      id: partition.id,
      loadDistance: partition.loadDistance,
      manifestUrl: `./${manifestPath}`,
      tags: [...partition.tags],
      unloadDistance: partition.unloadDistance
    });
  }

  if (bundle.sharedAssets.assets.length > 0 || bundle.sharedAssets.materials.length > 0 || bundle.sharedAssets.textures.length > 0) {
    files.push({
      bytes: new TextEncoder().encode(JSON.stringify(bundle.sharedAssets, null, 2)),
      mimeType: "application/json",
      path: "shared/shared-assets.json"
    });
  }

  return {
    files,
    index: buildRuntimeWorldIndex(chunks, {
      sharedAssets:
        bundle.sharedAssets.assets.length > 0 || bundle.sharedAssets.materials.length > 0 || bundle.sharedAssets.textures.length > 0
          ? [
              {
                baseUrl: "./shared",
                id: "shared"
              }
            ]
          : undefined
    })
  };
}

export function createRuntimeWorldBundleZip(bundle: RuntimeWorldBundle, worldIndexPath = "world.runtime.json") {
  const entries: Record<string, Uint8Array> = {
    [worldIndexPath]: new TextEncoder().encode(JSON.stringify(bundle.index, null, 2))
  };

  bundle.files.forEach((file) => {
    entries[file.path] = file.bytes;
  });

  return zipSync(entries, {
    level: 6
  });
}

function buildPartitionSceneSnapshot(bundle: WorldPersistenceBundle, partition: StreamingPartition) {
  const filteredDocuments = Object.fromEntries(
    Object.entries(bundle.documents)
      .filter(([documentId]) => documentIncludedInPartition(partition, documentId))
      .map(([documentId, snapshot]) => [documentId, filterDocumentForPartition(snapshot, partition)])
  );

  return flattenWorldBundle(
    {
      ...structuredClone(bundle),
      documents: filteredDocuments
    },
    {
      includeDocumentIds: Object.keys(filteredDocuments)
    }
  );
}

function documentIncludedInPartition(partition: StreamingPartition, documentId: string) {
  return partition.members.some((member) => member.documentId === documentId);
}

function filterDocumentForPartition(snapshot: AuthoringDocumentSnapshot, partition: StreamingPartition): AuthoringDocumentSnapshot {
  if (partition.members.some((member) => member.kind === "document" && member.documentId === snapshot.documentId)) {
    return structuredClone(snapshot);
  }

  const selectedNodeIds = new Set<string>();
  const selectedEntityIds = new Set<string>();

  partition.members.forEach((member) => {
    if (member.documentId !== snapshot.documentId) {
      return;
    }

    if (member.kind === "node") {
      collectNodeIds(snapshot, member.nodeId).forEach((nodeId) => selectedNodeIds.add(nodeId));
      return;
    }

    if (member.kind === "entity") {
      selectedEntityIds.add(member.entityId);
    }
  });

  return {
    ...structuredClone(snapshot),
    entities: snapshot.entities.filter((entity) => selectedEntityIds.has(entity.id) || (entity.parentId ? selectedNodeIds.has(entity.parentId) : false)),
    nodes: snapshot.nodes.filter((node) => selectedNodeIds.has(node.id))
  };
}

function collectNodeIds(snapshot: AuthoringDocumentSnapshot, rootNodeId: string) {
  const ids = new Set<string>();
  const queue = [rootNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (ids.has(nodeId)) {
      continue;
    }

    ids.add(nodeId);
    snapshot.nodes.forEach((node) => {
      if (node.parentId === nodeId) {
        queue.push(node.id);
      }
    });
  }

  return ids;
}

function inferChunkBounds(snapshot: ReturnType<typeof flattenWorldBundle>): RuntimeWorldChunk["bounds"] {
  const positions = snapshot.nodes.map((node) => node.transform.position);
  const fallback = vec3(0, 0, 0);
  const min = positions.reduce(
    (current, position) => vec3(Math.min(current.x, position.x), Math.min(current.y, position.y), Math.min(current.z, position.z)),
    positions[0] ?? fallback
  );
  const max = positions.reduce(
    (current, position) => vec3(Math.max(current.x, position.x), Math.max(current.y, position.y), Math.max(current.z, position.z)),
    positions[0] ?? fallback
  );
  return [min.x, min.y, min.z, max.x, max.y, max.z];
}
