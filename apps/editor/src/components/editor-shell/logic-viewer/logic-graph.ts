import type { Entity, GameplayObject, GeometryNode } from "@ggez/shared";
import { HOOK_DEFINITION_MAP, isGameplayObject, toObjectArray } from "@/lib/gameplay";
import type { LogicCluster, LogicGraph, LogicGraphEdge, LogicGraphHook, LogicGraphNode } from "./types";

type PortEntry = {
  nodeId: string;
  hookId: string;
  direction: "emit" | "listen";
  targetId?: string;
};

function extractDynamicPorts(hook: { id: string; type: string; config: GameplayObject }) {
  if (!hook.config) return { dynamicEmits: [] as Array<{ event: string; targetId?: string }>, dynamicListens: [] as Array<{ event: string; sourceId?: string }> };

  const dynamicEmits: Array<{ event: string; targetId?: string }> = [];
  const dynamicListens: Array<{ event: string; sourceId?: string }> = [];

  if (hook.type === "sequence") {
    const trigger = hook.config.trigger;
    if (isGameplayObject(trigger) && typeof trigger.event === "string" && trigger.event) {
      dynamicListens.push({
        event: trigger.event,
        sourceId: typeof trigger.fromEntity === "string" ? trigger.fromEntity : undefined
      });
    }

    for (const action of toObjectArray(hook.config.actions)) {
      if (action.type === "emit" && typeof action.event === "string" && action.event) {
        dynamicEmits.push({
          event: action.event,
          targetId: typeof action.target === "string" ? action.target : undefined
        });
      }
    }
  }

  if (hook.type === "condition_listener") {
    for (const cond of toObjectArray(hook.config.allOf)) {
      if (typeof cond.event === "string" && cond.event) {
        dynamicListens.push({
          event: cond.event,
          sourceId: typeof cond.fromEntity === "string" ? cond.fromEntity : undefined
        });
      }
    }
    for (const cond of toObjectArray(hook.config.anyOf)) {
      if (typeof cond.event === "string" && cond.event) {
        dynamicListens.push({
          event: cond.event,
          sourceId: typeof cond.fromEntity === "string" ? cond.fromEntity : undefined
        });
      }
    }

    for (const action of toObjectArray(hook.config.actions)) {
      if (action.type === "emit" && typeof action.event === "string" && action.event) {
        dynamicEmits.push({
          event: action.event,
          targetId: typeof action.target === "string" ? action.target : undefined
        });
      }
    }
  }

  if (hook.type === "audio_emitter") {
    if (typeof hook.config.triggerEvent === "string" && hook.config.triggerEvent) {
      dynamicListens.push({ event: hook.config.triggerEvent });
    }
    if (typeof hook.config.stopEvent === "string" && hook.config.stopEvent) {
      dynamicListens.push({ event: hook.config.stopEvent });
    }
  }

  if (hook.type === "vfx_emitter") {
    const eventMap = hook.config.eventMap;
    if (isGameplayObject(eventMap)) {
      for (const event of Object.keys(eventMap)) {
        if (event) dynamicListens.push({ event });
      }
    }
  }

  return { dynamicEmits, dynamicListens };
}

function resolveEventCategory(event: string): string {
  const prefix = event.split(".")[0];
  const categoryMap: Record<string, string> = {
    interact: "Interaction",
    trigger: "Trigger",
    lock: "State",
    unlock: "State",
    open: "State",
    close: "State",
    toggle: "State",
    state: "State",
    move: "Motion",
    path: "Motion",
    pickup: "Inventory",
    health: "Combat",
    damage: "Combat",
    destroy: "Combat",
    spawn: "Spawning",
    spawner: "Spawning",
    ai: "AI",
    audio: "Feedback",
    vfx: "Feedback",
    flag: "Flags",
    condition: "Logic",
    sequence: "Logic"
  };
  return categoryMap[prefix] ?? "Custom";
}

export function deriveLogicGraph(
  nodes: GeometryNode[],
  entities: Entity[]
): LogicGraph {
  const graphNodes: LogicGraphNode[] = [];
  const eventIndex = new Map<string, PortEntry[]>();

  const processHooks = (
    ownerId: string,
    ownerLabel: string,
    ownerKind: string,
    hooks: NonNullable<GeometryNode["hooks"]>
  ) => {
    const graphHooks: LogicGraphHook[] = [];

    for (const hook of hooks) {
      const definition = HOOK_DEFINITION_MAP.get(hook.type);
      if (!definition) continue;

      const { dynamicEmits, dynamicListens } = extractDynamicPorts({
        id: hook.id,
        type: hook.type,
        config: hook.config
      });

      const graphHook: LogicGraphHook = {
        hookId: hook.id,
        hookType: hook.type,
        label: definition.label,
        category: definition.category,
        enabled: hook.enabled !== false,
        emits: definition.emits,
        listens: definition.listens,
        dynamicEmits,
        dynamicListens
      };

      graphHooks.push(graphHook);

      // Index static emits
      for (const event of definition.emits) {
        const entries = eventIndex.get(event) ?? [];
        entries.push({ nodeId: ownerId, hookId: hook.id, direction: "emit" });
        eventIndex.set(event, entries);
      }

      // Index static listens
      for (const event of definition.listens) {
        const entries = eventIndex.get(event) ?? [];
        entries.push({ nodeId: ownerId, hookId: hook.id, direction: "listen" });
        eventIndex.set(event, entries);
      }

      // Index dynamic emits
      for (const de of dynamicEmits) {
        const entries = eventIndex.get(de.event) ?? [];
        entries.push({ nodeId: ownerId, hookId: hook.id, direction: "emit", targetId: de.targetId });
        eventIndex.set(de.event, entries);
      }

      // Index dynamic listens
      for (const dl of dynamicListens) {
        const entries = eventIndex.get(dl.event) ?? [];
        entries.push({ nodeId: ownerId, hookId: hook.id, direction: "listen", targetId: dl.sourceId });
        eventIndex.set(dl.event, entries);
      }
    }

    if (graphHooks.length > 0) {
      graphNodes.push({
        id: ownerId,
        label: ownerLabel,
        kind: ownerKind,
        hooks: graphHooks
      });
    }
  };

  for (const node of nodes) {
    if (node.hooks && node.hooks.length > 0) {
      processHooks(node.id, node.name || node.id, node.kind, node.hooks);
    }
  }

  for (const entity of entities) {
    if (entity.hooks && entity.hooks.length > 0) {
      processHooks(entity.id, entity.name || entity.id, entity.type, entity.hooks);
    }
  }

  // Build edges by connecting emitters to listeners for each event
  const edges: LogicGraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const [event, entries] of eventIndex) {
    const emitters = entries.filter((e) => e.direction === "emit");
    const listeners = entries.filter((e) => e.direction === "listen");

    for (const emitter of emitters) {
      for (const listener of listeners) {
        // Don't self-connect the same hook
        if (emitter.nodeId === listener.nodeId && emitter.hookId === listener.hookId) continue;

        // If emitter has a specific targetId, only connect to that target
        if (emitter.targetId && emitter.targetId !== listener.nodeId) continue;

        // If listener has a specific sourceId (targetId on listen side), only connect from that source
        if (listener.targetId && listener.targetId !== emitter.nodeId) continue;

        const edgeKey = `${emitter.nodeId}:${emitter.hookId}->${listener.nodeId}:${listener.hookId}@${event}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        edges.push({
          id: edgeKey,
          sourceNodeId: emitter.nodeId,
          sourceHookId: emitter.hookId,
          targetNodeId: listener.nodeId,
          targetHookId: listener.hookId,
          event,
          category: resolveEventCategory(event)
        });
      }
    }
  }

  // Compute connected-component clusters via BFS
  const adjacency = new Map<string, Set<string>>();
  for (const n of graphNodes) adjacency.set(n.id, new Set());
  for (const e of edges) {
    adjacency.get(e.sourceNodeId)?.add(e.targetNodeId);
    adjacency.get(e.targetNodeId)?.add(e.sourceNodeId);
  }

  const visited = new Set<string>();
  const clusters: LogicCluster[] = [];
  const nodeMap = new Map(graphNodes.map((n) => [n.id, n]));
  let clusterIndex = 0;

  for (const gn of graphNodes) {
    if (visited.has(gn.id)) continue;

    const memberIds: string[] = [];
    const queue = [gn.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      memberIds.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    // Compute dominant category
    const categoryCounts = new Map<string, number>();
    for (const nid of memberIds) {
      const node = nodeMap.get(nid);
      if (!node) continue;
      for (const h of node.hooks) {
        categoryCounts.set(h.category, (categoryCounts.get(h.category) ?? 0) + 1);
      }
    }

    const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
    const dominantCategory = sorted[0]?.[0] ?? "Custom";
    const label = sorted.length > 1
      ? `${sorted[0][0]} · ${sorted[1][0]}`
      : sorted[0]?.[0] ?? `Group ${clusterIndex + 1}`;

    clusters.push({
      id: `cluster:${clusterIndex}`,
      nodeIds: memberIds,
      label,
      dominantCategory
    });
    clusterIndex++;
  }

  return { nodes: graphNodes, edges, clusters };
}
