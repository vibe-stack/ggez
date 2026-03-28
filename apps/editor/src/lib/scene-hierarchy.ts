import { resolveSceneGraph, type Entity, type GeometryNode } from "@ggez/shared";

export function resolveEffectiveSceneItemIds(
  nodes: GeometryNode[],
  entities: Entity[],
  explicitIds: Iterable<string>
): string[] {
  const sceneGraph = resolveSceneGraph(nodes, entities);
  const effectiveIds = new Set<string>();

  const visitNode = (nodeId: string) => {
    if (effectiveIds.has(nodeId)) {
      return;
    }

    effectiveIds.add(nodeId);
    sceneGraph.nodeChildrenByParentId.get(nodeId)?.forEach(visitNode);
    sceneGraph.entityChildrenByParentId.get(nodeId)?.forEach((entityId) => {
      effectiveIds.add(entityId);
    });
  };

  for (const id of explicitIds) {
    visitNode(id);

    if (!effectiveIds.has(id)) {
      effectiveIds.add(id);
    }
  }

  return Array.from(effectiveIds);
}

export function toggleSceneItemId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((existingId) => existingId !== id) : [...ids, id];
}