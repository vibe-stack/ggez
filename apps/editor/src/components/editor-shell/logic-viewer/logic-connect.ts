import type { Entity, GeometryNode, SceneHook } from "@ggez/shared";
import { createGameplayId, isGameplayObject, toObjectArray } from "@/lib/gameplay";

/**
 * Parses a React Flow handle ID into its parts.
 * Handle format: "{hookId}:emit:{event}" or "{hookId}:listen:{event}"
 */
export function parseHandle(handleId: string): { hookId: string; direction: "emit" | "listen"; event: string } | null {
  const emitMatch = handleId.match(/^(.+?):emit:(.+)$/);
  if (emitMatch) return { hookId: emitMatch[1], direction: "emit", event: emitMatch[2] };

  const listenMatch = handleId.match(/^(.+?):listen:(.+)$/);
  if (listenMatch) return { hookId: listenMatch[1], direction: "listen", event: listenMatch[2] };

  return null;
}

type Owner = {
  id: string;
  kind: "node" | "entity";
  hooks: SceneHook[];
};

function findOwner(ownerId: string, nodes: GeometryNode[], entities: Entity[]): Owner | null {
  for (const node of nodes) {
    if (node.id === ownerId && node.hooks) {
      return { id: node.id, kind: "node", hooks: node.hooks };
    }
  }
  for (const entity of entities) {
    if (entity.id === ownerId && entity.hooks) {
      return { id: entity.id, kind: "entity", hooks: entity.hooks };
    }
  }
  return null;
}

export type ConnectionMutation = {
  ownerId: string;
  ownerKind: "node" | "entity";
  hooks: SceneHook[];
  beforeHooks: SceneHook[];
};

/**
 * Given a new connection between two ports, determines the hook mutations needed.
 *
 * Strategy:
 *  1. If the target hook has a dynamic listen that can accept a fromEntity → set it.
 *  2. If the source hook has a dynamic emit that can accept a target → set it.
 *  3. Otherwise, create a new "sequence" hook on the source owner:
 *     trigger listens for sourceEvent from sourceNodeId,
 *     action emits targetEvent to targetNodeId.
 */
export function resolveConnection(
  sourceNodeId: string,
  sourceHandleId: string,
  targetNodeId: string,
  targetHandleId: string,
  nodes: GeometryNode[],
  entities: Entity[]
): ConnectionMutation | null {
  const src = parseHandle(sourceHandleId);
  const tgt = parseHandle(targetHandleId);
  if (!src || !tgt) return null;

  const sourceOwner = findOwner(sourceNodeId, nodes, entities);
  const targetOwner = findOwner(targetNodeId, nodes, entities);
  if (!sourceOwner || !targetOwner) return null;

  const sourceHook = sourceOwner.hooks.find((h) => h.id === src.hookId);
  const targetHook = targetOwner.hooks.find((h) => h.id === tgt.hookId);
  if (!sourceHook || !targetHook) return null;

  // --- Case 1: target hook has a dynamic listen we can bind ---
  const targetMutation = tryBindListen(targetOwner, targetHook, tgt.event, sourceNodeId);
  if (targetMutation) return targetMutation;

  // --- Case 2: source hook has a dynamic emit we can bind ---
  const sourceMutation = tryBindEmit(sourceOwner, sourceHook, src.event, targetNodeId);
  if (sourceMutation) return sourceMutation;

  // --- Case 3: create a new sequence on the source owner ---
  return createBridgeSequence(sourceOwner, sourceNodeId, src.event, targetNodeId, tgt.event);
}

/**
 * Try to set `fromEntity` on a dynamic listen port of the target hook.
 */
function tryBindListen(owner: Owner, hook: SceneHook, event: string, sourceNodeId: string): ConnectionMutation | null {
  const config = structuredClone(hook.config);
  let changed = false;

  // sequence: config.trigger.event matches → set fromEntity
  if (hook.type === "sequence" && isGameplayObject(config.trigger)) {
    if (config.trigger.event === event) {
      config.trigger.fromEntity = sourceNodeId;
      changed = true;
    }
  }

  // condition_listener: find matching entry in allOf/anyOf → set fromEntity
  if (hook.type === "condition_listener") {
    for (const arr of [toObjectArray(config.allOf), toObjectArray(config.anyOf)]) {
      for (const cond of arr) {
        if (cond.event === event && !cond.fromEntity) {
          cond.fromEntity = sourceNodeId;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }

    // If no existing entry, add one to allOf
    if (!changed) {
      const allOf = Array.isArray(config.allOf) ? [...config.allOf] : [];
      allOf.push({ event, fromEntity: sourceNodeId });
      config.allOf = allOf;
      changed = true;
    }
  }

  // audio_emitter: set triggerEvent or stopEvent
  if (hook.type === "audio_emitter") {
    if (!config.triggerEvent || config.triggerEvent === event) {
      config.triggerEvent = event;
      changed = true;
    } else if (!config.stopEvent || config.stopEvent === event) {
      config.stopEvent = event;
      changed = true;
    }
  }

  // vfx_emitter: add event to eventMap
  if (hook.type === "vfx_emitter") {
    const existing = isGameplayObject(config.eventMap) ? config.eventMap : {};
    if (!(event in existing)) {
      config.eventMap = { ...existing, [event]: "" };
      changed = true;
    }
  }

  if (!changed) return null;

  const beforeHooks = structuredClone(owner.hooks);
  const hooks = owner.hooks.map((h) => (h.id === hook.id ? { ...h, config } : h));
  return { ownerId: owner.id, ownerKind: owner.kind, hooks, beforeHooks };
}

/**
 * Try to set `target` on a dynamic emit port of the source hook.
 */
function tryBindEmit(owner: Owner, hook: SceneHook, event: string, targetNodeId: string): ConnectionMutation | null {
  const config = structuredClone(hook.config);
  let changed = false;

  // sequence / condition_listener: find an emit action with matching event → set target
  if (hook.type === "sequence" || hook.type === "condition_listener") {
    for (const action of toObjectArray(config.actions)) {
      if (action.type === "emit" && action.event === event && !action.target) {
        action.target = targetNodeId;
        changed = true;
        break;
      }
    }

    // If no matching action found, add one
    if (!changed) {
      const actions = Array.isArray(config.actions) ? [...config.actions] : [];
      actions.push({ type: "emit", event, target: targetNodeId, payload: null });
      config.actions = actions;
      changed = true;
    }
  }

  if (!changed) return null;

  const beforeHooks = structuredClone(owner.hooks);
  const hooks = owner.hooks.map((h) => (h.id === hook.id ? { ...h, config } : h));
  return { ownerId: owner.id, ownerKind: owner.kind, hooks, beforeHooks };
}

/**
 * Create a new sequence hook on the source owner that bridges
 * sourceEvent → targetEvent on targetNodeId.
 */
function createBridgeSequence(
  owner: Owner,
  sourceNodeId: string,
  sourceEvent: string,
  targetNodeId: string,
  targetEvent: string
): ConnectionMutation {
  const newHook: SceneHook = {
    id: createGameplayId("hook:sequence"),
    type: "sequence",
    enabled: true,
    config: {
      trigger: {
        event: sourceEvent,
        fromEntity: sourceNodeId,
        once: false
      },
      actions: [
        {
          type: "emit",
          event: targetEvent,
          target: targetNodeId,
          payload: null
        }
      ]
    }
  };

  const beforeHooks = structuredClone(owner.hooks);
  return {
    ownerId: owner.id,
    ownerKind: owner.kind,
    hooks: [...owner.hooks, newHook],
    beforeHooks
  };
}
