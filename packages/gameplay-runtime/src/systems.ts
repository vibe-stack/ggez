import { vec3, type GameplayObject, type GameplayValue, type Transform, type Vec3 } from "@ggez/shared";
import {
  type GameplayActor,
  type GameplayHookTarget,
  type GameplayPathDefinition,
  type GameplayPathResolver,
  type GameplayRuntimeSystemContext,
  type GameplayRuntimeSystemDefinition,
  type GameplaySystemBlueprint
} from "./types";

export const GAMEPLAY_SYSTEM_BLUEPRINTS: GameplaySystemBlueprint[] = [
  {
    description: "Queues and dispatches events with target filtering, frame ordering, and recursion guards.",
    id: "event_bus",
    implemented: true,
    label: "EventBus"
  },
  {
    description: "Overlap checks, enter/exit tracking, fire-once, cooldowns, and actor filtering.",
    hookTypes: ["trigger_volume"],
    id: "trigger",
    implemented: true,
    label: "TriggerSystem"
  },
  {
    description: "Selects current interact target and emits interact.requested with actor context.",
    hookTypes: ["interactable"],
    id: "interaction",
    implemented: true,
    label: "InteractionSystem"
  },
  {
    description: "Evaluates keys, items, flags, and codes and emits allow or deny results.",
    hookTypes: ["lock"],
    id: "lock",
    implemented: true,
    label: "LockSystem"
  },
  {
    description: "Tracks door or hatch logical state and forwards movement requests.",
    hookTypes: ["openable"],
    id: "openable",
    implemented: true,
    label: "OpenableSystem"
  },
  {
    description: "Animates transforms or authored clips deterministically.",
    hookTypes: ["mover"],
    id: "mover",
    implemented: true,
    label: "MoverSystem"
  },
  {
    description: "Moves targets along paths or splines and manages progress state.",
    hookTypes: ["path_mover"],
    id: "path_mover",
    implemented: true,
    label: "PathMoverSystem"
  },
  {
    description: "Handles pickups and grants inventory or state rewards.",
    hookTypes: ["pickup"],
    id: "pickup",
    implemented: true,
    label: "PickupSystem"
  },
  {
    description: "Stores inventory state such as keys and items.",
    hookTypes: ["inventory_keys"],
    id: "inventory",
    implemented: false,
    label: "InventorySystem"
  },
  {
    description: "Tracks health state and zero transitions.",
    hookTypes: ["health"],
    id: "health",
    implemented: true,
    label: "HealthSystem"
  },
  {
    description: "Applies damage and kill events with typed payloads.",
    hookTypes: ["damageable"],
    id: "damage",
    implemented: true,
    label: "DamageSystem"
  },
  {
    description: "Creates runtime entities or prefabs and enforces spawn rules.",
    hookTypes: ["spawner"],
    id: "spawner",
    implemented: true,
    label: "SpawnerSystem"
  },
  {
    description: "Manages AI enablement and target assignment.",
    hookTypes: ["ai_agent"],
    id: "ai",
    implemented: true,
    label: "AiSystem"
  },
  {
    description: "Routes gameplay events to audio playback.",
    hookTypes: ["audio_emitter"],
    id: "audio",
    implemented: true,
    label: "AudioSystem"
  },
  {
    description: "Manages world and mission flag writes or queries.",
    hookTypes: ["flag_setter", "flag_condition"],
    id: "flag",
    implemented: true,
    label: "FlagSystem"
  },
  {
    description: "Runs ordered action lists triggered by events.",
    hookTypes: ["sequence"],
    id: "sequence",
    implemented: true,
    label: "SequenceSystem"
  },
  {
    description: "Tracks allOf or anyOf event conditions and fires actions when met.",
    hookTypes: ["condition_listener"],
    id: "condition",
    implemented: true,
    label: "ConditionSystem"
  },
  {
    description: "Handles destruction lifecycle when targets are killed or destroy-requested.",
    hookTypes: ["destructible"],
    id: "destructible",
    implemented: true,
    label: "DestructibleSystem"
  },
  {
    description: "Routes gameplay events to VFX playback via vfx_emitter hooks.",
    hookTypes: ["vfx_emitter"],
    id: "vfx",
    implemented: true,
    label: "VfxEmitterSystem"
  }
];

export function createTriggerSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Tracks actors overlapping trigger hooks and emits enter, exit, and stay events.",
    hookTypes: ["trigger_volume"],
    id: "trigger",
    label: "TriggerSystem",
    create(context) {
      const triggerStates = new Map<string, TriggerRuntimeState>();

      return {
        stop() {
          triggerStates.clear();
        },
        update() {
          context.getHookTargetsByType("trigger_volume")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const worldTransform = context.getTargetWorldTransform(target.targetId);

              if (!worldTransform) {
                return;
              }

              const state = ensureTriggerRuntimeState(triggerStates, target.hook.id);
              const nextInsideActorIds = new Set<string>();
              const fireOnce = readBoolean(target.hook.config.fireOnce, false);

              context.getActors().forEach((actor) => {
                if (!matchesTriggerFilters(actor, target.hook.config)) {
                  return;
                }

                if (!isActorInsideTrigger(actor, target.hook.config, worldTransform)) {
                  return;
                }

                nextInsideActorIds.add(actor.id);

                if (!state.insideActorIds.has(actor.id)) {
                  if (!fireOnce || !state.fired) {
                    const now = performance.now();

                    if (now >= state.nextAllowedAt) {
                      emitTriggerEvent(context, target, "trigger.enter", actor);
                      state.fired = true;
                      state.nextAllowedAt = now + Math.max(0, readNumber(target.hook.config.cooldown, 0)) * 1000;
                    }
                  }

                  return;
                }

                if (!fireOnce) {
                  emitTriggerEvent(context, target, "trigger.stay", actor);
                }
              });

              state.insideActorIds.forEach((actorId) => {
                if (nextInsideActorIds.has(actorId)) {
                  return;
                }

                const actor = context.getActor(actorId);

                if (actor) {
                  emitTriggerEvent(context, target, "trigger.exit", actor);
                } else {
                  context.emitFromHookTarget(target, "trigger.exit", { actorId });
                }
              });

              state.insideActorIds = nextInsideActorIds;
            });
        }
      };
    }
  };
}

export function createSequenceSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Runs ordered actions when configured trigger events arrive.",
    hookTypes: ["sequence"],
    id: "sequence",
    label: "SequenceSystem",
    create(context) {
      const runners: SequenceRunner[] = [];
      const onceTriggeredHookIds = new Set<string>();
      const unsubscribe = context.eventBus.subscribe((event) => {
        context.getHookTargetsByType("sequence")
          .filter((target) => target.hook.enabled !== false)
          .forEach((target) => {
            const trigger = asObject(target.hook.config.trigger);

            if (!trigger) {
              return;
            }

            const fromEntity = readString(trigger.fromEntity, "");
            const triggerEvent = readString(trigger.event, "");
            const once = readBoolean(trigger.once, false);

            if (event.sourceId !== fromEntity || event.event !== triggerEvent) {
              return;
            }

            if (once && onceTriggeredHookIds.has(target.hook.id)) {
              return;
            }

            if (once) {
              onceTriggeredHookIds.add(target.hook.id);
            }

            const runner: SequenceRunner = {
              actionIndex: 0,
              actions: asObjectArray(target.hook.config.actions),
              hookTarget: target,
              waitRemaining: 0
            };

            context.emitFromHookTarget(target, "sequence.started", {
              event: event.event,
              sourceId: event.sourceId
            });
            const completed = advanceSequenceRunner(context, runner);

            if (!completed) {
              runners.push(runner);
            }
          });
      });

      return {
        stop() {
          unsubscribe();
          runners.splice(0, runners.length);
          onceTriggeredHookIds.clear();
        },
        update(deltaSeconds) {
          for (let index = runners.length - 1; index >= 0; index -= 1) {
            const runner = runners[index];

            if (runner.waitRemaining > 0) {
              runner.waitRemaining = Math.max(0, runner.waitRemaining - deltaSeconds);

              if (runner.waitRemaining > 0) {
                continue;
              }
            }

            const completed = advanceSequenceRunner(context, runner);

            if (completed) {
              runners.splice(index, 1);
            }
          }
        }
      };
    }
  };
}

export function createOpenableSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Tracks open and close state and emits lifecycle events while delegating movement.",
    hookTypes: ["openable"],
    id: "openable",
    label: "OpenableSystem",
    create(context) {
      const unsubscribeRequests = context.eventBus.subscribe(
        { event: ["open.requested", "close.requested", "toggle.requested"] },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("openable")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              // If target has a lock hook, only process lock-forwarded events
              const hasLock = context.getHookTargetsByType("lock")
                .some((lt) => lt.targetId === target.targetId && lt.hook.enabled !== false);
              if (hasLock && readPayloadField(event.payload, "fromLock") !== true) {
                return;
              }

              const currentState = readOpenableState(
                context.getLocalState(target.targetId, "openable:state"),
                resolveOpenableInitialState(target.hook.config)
              );
              const nextState =
                event.event === "toggle.requested"
                  ? currentState === "open" || currentState === "opening"
                    ? "closed"
                    : "open"
                  : event.event === "open.requested"
                    ? "open"
                    : "closed";

              if (nextState === "open" && (currentState === "open" || currentState === "opening")) {
                return;
              }

              if (nextState === "closed" && (currentState === "closed" || currentState === "closing")) {
                return;
              }

              context.setLocalState(target.targetId, "openable:state", nextState === "open" ? "opening" : "closing");
              context.emitFromHookTarget(target, nextState === "open" ? "open.started" : "close.started");
              context.emitFromHookTarget(target, "move.to", { state: nextState });
            });
        }
      );
      const unsubscribeMovement = context.eventBus.subscribe({ event: "move.completed" }, (event) => {
        if (!event.targetId) {
          return;
        }

        context.getHookTargetsByType("openable")
          .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
          .forEach((target) => {
            const nextState = readStateName(event.payload) === "open" ? "open" : "closed";
            context.setLocalState(target.targetId, "openable:state", nextState);
            context.emitFromHookTarget(target, nextState === "open" ? "open.completed" : "close.completed");
            context.emitFromHookTarget(target, "state.changed", nextState);
          });
      });

      return {
        start() {
          context.getHookTargetsByType("openable").forEach((target) => {
            context.setLocalState(target.targetId, "openable:state", resolveOpenableInitialState(target.hook.config));
          });
        },
        stop() {
          unsubscribeRequests();
          unsubscribeMovement();
        }
      };
    }
  };
}

export function createMoverSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Animates local transforms toward named target states.",
    hookTypes: ["mover"],
    id: "mover",
    label: "MoverSystem",
    create(context) {
      const activeAnimations = new Map<
        string,
        {
          duration: number;
          from: Transform;
          progress: number;
          state: string;
          targetId: string;
          to: Transform;
        }
      >();
      const unsubscribe = context.eventBus.subscribe({ event: ["move.to", "open.started", "close.started"] }, (event) => {
        if (!event.targetId) {
          return;
        }

        context.getHookTargetsByType("mover")
          .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
          .forEach((target) => {
            const state =
              event.event === "open.started"
                ? "open"
                : event.event === "close.started"
                  ? "closed"
                  : readStateName(event.payload);
            const targetTransform = resolveMoverTargetTransform(
              target.hook.config,
              state,
              context.getTargetInitialLocalTransform(target.targetId)
            );
            const currentTransform = context.getTargetLocalTransform(target.targetId);

            if (!targetTransform || !currentTransform) {
              return;
            }

            activeAnimations.set(target.hook.id, {
              duration: Math.max(0.001, readNumber(target.hook.config.duration, 0.8)),
              from: structuredClone(currentTransform),
              progress: 0,
              state,
              targetId: target.targetId,
              to: targetTransform
            });
            context.emitFromHookTarget(target, "move.started", { state });
          });
      });

      return {
        stop() {
          unsubscribe();
          activeAnimations.clear();
        },
        update(deltaSeconds) {
          activeAnimations.forEach((animation, hookId) => {
            const hookTarget = context.getHookTargets().find((target) => target.hook.id === hookId);

            if (!hookTarget) {
              activeAnimations.delete(hookId);
              return;
            }

            animation.progress = Math.min(1, animation.progress + deltaSeconds / animation.duration);
            context.setTargetLocalTransform(animation.targetId, interpolateTransform(animation.from, animation.to, animation.progress));

            if (animation.progress >= 1) {
              activeAnimations.delete(hookId);
              context.emitFromHookTarget(hookTarget, "move.completed", { state: animation.state });
            }
          });
        }
      };
    }
  };
}

export function createPathMoverSystemDefinition(resolvePath: GameplayPathResolver): GameplayRuntimeSystemDefinition {
  return {
    description: "Moves targets along consumer-provided paths and emits start, stop, and completion events.",
    hookTypes: ["path_mover"],
    id: "path_mover",
    label: "PathMoverSystem",
    create(context) {
      const unsubscribe = context.eventBus.subscribe(
        { event: ["path.start", "path.stop", "path.pause", "path.resume", "path.reverse"] },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("path_mover")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const nextState = ensurePathState(context, target.targetId, target.hook.config);

              if (event.event === "path.start") {
                if (nextState.active && !nextState.paused) {
                  context.setLocalState(target.targetId, "path_mover:state", nextState);
                  return;
                }

                nextState.active = true;
                nextState.paused = false;
                context.emitFromHookTarget(target, "path.started");
              } else if (event.event === "path.stop") {
                nextState.active = false;
                nextState.paused = false;
                context.emitFromHookTarget(target, "path.stopped");
              } else if (event.event === "path.pause") {
                nextState.paused = true;
              } else if (event.event === "path.resume") {
                nextState.paused = false;
              } else if (event.event === "path.reverse") {
                nextState.direction = nextState.direction === 1 ? -1 : 1;
              }

              context.setLocalState(target.targetId, "path_mover:state", nextState);
            });
        }
      );

      return {
        start() {
          context.getHookTargetsByType("path_mover").forEach((target) => {
            const state = ensurePathState(context, target.targetId, target.hook.config);

            if (state.active) {
              context.emitFromHookTarget(target, "path.started");
            }
          });
        },
        stop() {
          unsubscribe();
        },
        update(deltaSeconds) {
          context.getHookTargetsByType("path_mover")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const state = ensurePathState(context, target.targetId, target.hook.config);
              const path = resolvePath(target);
              const baseTransform = context.getTargetInitialLocalTransform(target.targetId);

              if (!state.active || state.paused || !path || !baseTransform) {
                return;
              }

              const speed = Math.max(0.001, readNumber(target.hook.config.speed, 0.1));
              const pathLength = Math.max(0.000001, path.length ?? 1);
              const loopEnabled = readBoolean(target.hook.config.loop, path.loop ?? false);
              const pingPong = loopEnabled && readBoolean(target.hook.config.reverse, false);
              state.progress += (deltaSeconds * speed * state.direction) / pathLength;

              if (pingPong) {
                if (state.progress >= 1) {
                  state.progress = 1;
                  state.direction = -1;
                } else if (state.progress <= 0) {
                  state.progress = 0;
                  state.direction = 1;
                }
              } else if (loopEnabled) {
                state.progress = wrapProgress(state.progress);
              } else if (state.progress >= 1 || state.progress <= 0) {
                state.progress = clampProgress(state.progress);

                if (readBoolean(target.hook.config.stopAtEnd, true)) {
                  state.active = false;
                  context.emitFromHookTarget(target, "path.completed");
                }
              }

              context.setTargetLocalTransform(target.targetId, {
                ...baseTransform,
                position: addVec3Values(baseTransform.position, subVec3Values(path.sample(state.progress), path.sample(0)))
              });
              context.setLocalState(target.targetId, "path_mover:state", state);
            });
        }
      };
    }
  };
}

export function createWaypointPath(points: Vec3[], loop = false): GameplayPathDefinition {
  const normalizedPoints = points.length > 0 ? points : [vec3(0, 0, 0)];
  const segmentLengths = normalizedPoints.slice(0, -1).map((point, index) => lengthBetween(point, normalizedPoints[index + 1]));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);

  return {
    length: totalLength,
    loop,
    sample(progress) {
      if (normalizedPoints.length === 1) {
        return normalizedPoints[0];
      }

      const clampedProgress = clampProgress(progress);
      if (totalLength <= 0.000001) {
        return normalizedPoints[0];
      }

      const targetDistance = clampedProgress * totalLength;
      let traversedDistance = 0;
      let index = 0;

      while (index < segmentLengths.length - 1 && traversedDistance + segmentLengths[index] < targetDistance) {
        traversedDistance += segmentLengths[index];
        index += 1;
      }

      const nextIndex = Math.min(normalizedPoints.length - 1, index + 1);
      const start = normalizedPoints[index];
      const end = normalizedPoints[nextIndex];
      const segmentLength = segmentLengths[index] ?? 0;
      const alpha = segmentLength <= 0.000001 ? 0 : (targetDistance - traversedDistance) / segmentLength;

      return vec3(
        start.x + (end.x - start.x) * alpha,
        start.y + (end.y - start.y) * alpha,
        start.z + (end.z - start.z) * alpha
      );
    }
  };
}

export function createScenePathResolver(paths: Array<{ id: string; loop?: boolean; points: Vec3[] }> = []): GameplayPathResolver {
  const pathsById = new Map(
    paths.map((pathDefinition) => [
      pathDefinition.id,
      createWaypointPath(pathDefinition.points, pathDefinition.loop ?? false)
    ] as const)
  );

  return (target) => {
    if (target.hook.type !== "path_mover") {
      return undefined;
    }

    const pathId = readString(target.hook.config.pathId, "");

    if (!pathId) {
      return undefined;
    }

    return pathsById.get(pathId);
  };
}

type TriggerRuntimeState = {
  fired: boolean;
  insideActorIds: Set<string>;
  nextAllowedAt: number;
};

type SequenceRunner = {
  actionIndex: number;
  actions: GameplayObject[];
  hookTarget: GameplayHookTarget;
  waitRemaining: number;
};

function ensureTriggerRuntimeState(store: Map<string, TriggerRuntimeState>, hookId: string): TriggerRuntimeState {
  const existing = store.get(hookId);

  if (existing) {
    return existing;
  }

  const created: TriggerRuntimeState = {
    fired: false,
    insideActorIds: new Set<string>(),
    nextAllowedAt: 0
  };

  store.set(hookId, created);
  return created;
}

function emitTriggerEvent(
  context: GameplayRuntimeSystemContext,
  target: GameplayHookTarget,
  eventName: "trigger.enter" | "trigger.exit" | "trigger.stay",
  actor: GameplayActor
) {
  context.emitFromHookTarget(target, eventName, {
    actorId: actor.id,
    actorTags: actor.tags ?? []
  });
}

function matchesTriggerFilters(actor: GameplayActor, config: GameplayObject) {
  const filters = readStringArray(config.filters);

  if (filters.length === 0) {
    return true;
  }

  return (actor.tags ?? []).some((tag) => filters.includes(tag));
}

function isActorInsideTrigger(actor: GameplayActor, config: GameplayObject, transform: Transform) {
  const shape = readString(config.shape, "box");
  const actorRadius = Math.max(0, actor.radius ?? 0);
  const actorHalfHeight = Math.max(0, (actor.height ?? actor.radius ?? 0) * 0.5);

  if (shape === "sphere") {
    const radius = Math.max(0.001, readNumber(config.radius, 1)) * maxScaleComponent(transform.scale) + actorRadius;
    return distanceSquared(actor.position, transform.position) <= radius * radius;
  }

  if (shape === "capsule") {
    const radius = Math.max(0.001, readNumber(config.radius, 0.5)) * Math.max(transform.scale.x, transform.scale.z) + actorRadius;
    const height = Math.max(radius * 2, readNumber(config.height, radius * 2) * transform.scale.y);
    const segmentHalf = Math.max(0, height * 0.5 - radius);
    const start = vec3(transform.position.x, transform.position.y - segmentHalf, transform.position.z);
    const end = vec3(transform.position.x, transform.position.y + segmentHalf, transform.position.z);

    return distanceToSegmentSquared(actor.position, start, end) <= radius * radius;
  }

  const size = readVec3(config.size, vec3(1, 1, 1));
  const halfExtents = vec3(
    Math.abs(size.x * transform.scale.x) * 0.5 + actorRadius,
    Math.abs(size.y * transform.scale.y) * 0.5 + actorHalfHeight,
    Math.abs(size.z * transform.scale.z) * 0.5 + actorRadius
  );

  return (
    Math.abs(actor.position.x - transform.position.x) <= halfExtents.x &&
    Math.abs(actor.position.y - transform.position.y) <= halfExtents.y &&
    Math.abs(actor.position.z - transform.position.z) <= halfExtents.z
  );
}

function advanceSequenceRunner(context: GameplayRuntimeSystemContext, runner: SequenceRunner) {
  while (runner.actionIndex < runner.actions.length) {
    const action = runner.actions[runner.actionIndex];
    const actionType = readString(action.type, "");

    context.emitFromHookTarget(runner.hookTarget, "sequence.step", {
      actionIndex: runner.actionIndex,
      actionType
    });

    runner.actionIndex += 1;

    if (actionType === "wait") {
      runner.waitRemaining = Math.max(0, readNumber(action.seconds, 0));

      if (runner.waitRemaining > 0) {
        return false;
      }

      continue;
    }

    executeSequenceAction(context, runner.hookTarget, action);
  }

  context.emitFromHookTarget(runner.hookTarget, "sequence.completed");
  return true;
}

function executeSequenceAction(
  context: GameplayRuntimeSystemContext,
  hookTarget: GameplayHookTarget,
  action: GameplayObject
) {
  const actionType = readString(action.type, "");

  if (actionType === "emit") {
    const eventName = readString(action.event, "");
    const targetId = readString(action.target, hookTarget.targetId);

    if (!eventName) {
      return;
    }

    context.emitEvent({
      event: eventName,
      payload: action.payload,
      sourceHookType: hookTarget.hook.type,
      sourceId: hookTarget.targetId,
      sourceKind: hookTarget.targetKind,
      targetId
    });
    return;
  }

  if (actionType === "set_flag") {
    const flag = readString(action.flag, "");

    if (!flag) {
      return;
    }

    context.setWorldState(flag, action.value ?? null);
    context.emitFromHookTarget(hookTarget, "flag.changed", {
      flag,
      value: action.value ?? null
    });
    return;
  }

  if (actionType === "enable" || actionType === "disable") {
    const targetId = readString(action.target, "");

    if (!targetId) {
      return;
    }

    context.getHookTargets()
      .filter((target) => target.targetId === targetId)
      .forEach((target) => {
        target.hook.enabled = actionType === "enable";
      });
    return;
  }

  if (actionType === "spawn") {
    const targetId = readString(action.target, "");

    if (targetId) {
      context.emitEvent({
        event: "spawn.requested",
        sourceHookType: hookTarget.hook.type,
        sourceId: hookTarget.targetId,
        sourceKind: hookTarget.targetKind,
        targetId
      });
    }

    return;
  }

  if (actionType === "destroy") {
    const targetId = readString(action.target, "");

    if (targetId) {
      context.emitEvent({
        event: "destroy.requested",
        sourceHookType: hookTarget.hook.type,
        sourceId: hookTarget.targetId,
        sourceKind: hookTarget.targetKind,
        targetId
      });
    }
  }
}

function resolveOpenableInitialState(config: GameplayObject) {
  return readString(config.initialState, "closed") === "open" ? "open" : "closed";
}

function resolveMoverTargetTransform(config: GameplayObject, state: string, fallback?: Transform) {
  const targets = asObject(config.targets);
  const nextState = asObject(targets?.[state]);
  const base = structuredClone(fallback);

  if (!base || !nextState) {
    return undefined;
  }

  return {
    ...base,
    position: readVec3(nextState.position, base.position),
    rotation: readVec3(nextState.rotation, base.rotation),
    scale: readVec3(nextState.scale, base.scale)
  };
}

function ensurePathState(context: GameplayRuntimeSystemContext, targetId: string, config: GameplayObject) {
  const current = asObject(context.getLocalState(targetId, "path_mover:state"));

  if (current) {
    return {
      active: readBoolean(current.active, false),
      direction: readNumber(current.direction, 1) < 0 ? -1 as const : 1 as const,
      paused: readBoolean(current.paused, false),
      progress: readNumber(current.progress, 0)
    };
  }

  const reverse = readBoolean(config.reverse, false);
  const loop = readBoolean(config.loop, false);

  return {
    active: readBoolean(config.active, false),
    direction: reverse && !loop ? -1 as const : 1 as const,
    paused: false,
    progress: reverse && !loop ? 1 : 0
  };
}

function interpolateTransform(from: Transform, to: Transform, progress: number): Transform {
  return {
    pivot: to.pivot ?? from.pivot,
    position: interpolateVec3(from.position, to.position, progress),
    rotation: interpolateVec3(from.rotation, to.rotation, progress),
    scale: interpolateVec3(from.scale, to.scale, progress)
  };
}

function interpolateVec3(from: Vec3, to: Vec3, progress: number): Vec3 {
  return vec3(
    from.x + (to.x - from.x) * progress,
    from.y + (to.y - from.y) * progress,
    from.z + (to.z - from.z) * progress
  );
}

function addVec3Values(left: Vec3, right: Vec3): Vec3 {
  return vec3(left.x + right.x, left.y + right.y, left.z + right.z);
}

function subVec3Values(left: Vec3, right: Vec3): Vec3 {
  return vec3(left.x - right.x, left.y - right.y, left.z - right.z);
}

function distanceSquared(left: Vec3, right: Vec3) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;

  return dx * dx + dy * dy + dz * dz;
}

function lengthBetween(left: Vec3, right: Vec3) {
  return Math.sqrt(distanceSquared(left, right));
}

function distanceToSegmentSquared(point: Vec3, start: Vec3, end: Vec3) {
  const segment = vec3(end.x - start.x, end.y - start.y, end.z - start.z);
  const segmentLengthSquared = distanceSquared(start, end);

  if (segmentLengthSquared <= 0.000001) {
    return distanceSquared(point, start);
  }

  const projection = clampProgress(
    ((point.x - start.x) * segment.x + (point.y - start.y) * segment.y + (point.z - start.z) * segment.z) /
      segmentLengthSquared
  );
  const closest = vec3(
    start.x + segment.x * projection,
    start.y + segment.y * projection,
    start.z + segment.z * projection
  );

  return distanceSquared(point, closest);
}

function maxScaleComponent(scale: Vec3) {
  return Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
}

function readOpenableState(value: GameplayValue | undefined, fallback: "closed" | "open") {
  return value === "opening" || value === "closing" || value === "open" || value === "closed" ? value : fallback;
}

function readStateName(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object" && "state" in payload && typeof payload.state === "string") {
    return payload.state;
  }

  return "open";
}

function readString(value: GameplayValue | undefined, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: GameplayValue | undefined) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readNumber(value: GameplayValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: GameplayValue | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readVec3(value: GameplayValue | undefined, fallback: Vec3) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return vec3(
    typeof value[0] === "number" ? value[0] : fallback.x,
    typeof value[1] === "number" ? value[1] : fallback.y,
    typeof value[2] === "number" ? value[2] : fallback.z
  );
}

function asObject(value: GameplayValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function asObjectArray(value: GameplayValue | undefined) {
  return Array.isArray(value) ? value.map((entry) => asObject(entry)).filter((entry): entry is GameplayObject => Boolean(entry)) : [];
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function wrapProgress(value: number) {
  return ((value % 1) + 1) % 1;
}

export function createAudioSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Routes gameplay events to audio playback via audio_emitter hooks.",
    hookTypes: ["audio_emitter"],
    id: "audio",
    label: "AudioSystem",
    create(context) {
      const unsubscribes: Array<() => void> = [];

      return {
        start() {
          context.getHookTargetsByType("audio_emitter")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const autoPlay = readBoolean(target.hook.config.autoPlay, false);

              if (autoPlay) {
                emitAudioPlay(context, target);
              }

              const triggerEvent = readString(target.hook.config.triggerEvent, "");

              if (triggerEvent) {
                const unsub = context.eventBus.subscribe(
                  { event: triggerEvent, targetId: target.targetId },
                  () => {
                    if (target.hook.enabled === false) {
                      return;
                    }

                    emitAudioPlay(context, target);
                  }
                );

                unsubscribes.push(unsub);
              }

              const stopEvent = readString(target.hook.config.stopEvent, "");

              if (stopEvent) {
                const unsub = context.eventBus.subscribe(
                  { event: stopEvent, targetId: target.targetId },
                  () => {
                    context.emitFromHookTarget(target, "audio.stop", {
                      hookId: target.hook.id
                    });
                  }
                );

                unsubscribes.push(unsub);
              }
            });

          // Global audio control events.
          unsubscribes.push(
            context.eventBus.subscribe({ event: "audio.stop_all" }, () => {
              context.getHookTargetsByType("audio_emitter").forEach((target) => {
                context.emitFromHookTarget(target, "audio.stop", {
                  hookId: target.hook.id
                });
              });
            })
          );
        },
        stop() {
          unsubscribes.forEach((unsub) => unsub());
          unsubscribes.length = 0;
        }
      };
    }
  };
}

function emitAudioPlay(
  context: GameplayRuntimeSystemContext,
  target: GameplayHookTarget
) {
  const clip = readString(target.hook.config.clip, "");

  if (!clip) {
    return;
  }

  const worldTransform = context.getTargetWorldTransform(target.targetId);

  context.emitFromHookTarget(target, "audio.play", {
    channel: readString(target.hook.config.channel, "sfx"),
    clip,
    distanceModel: readString(target.hook.config.distanceModel, "inverse"),
    hookId: target.hook.id,
    loop: readBoolean(target.hook.config.loop, false),
    maxDistance: readNumber(target.hook.config.maxDistance, 10000),
    pitch: readNumber(target.hook.config.pitch, 1),
    position: worldTransform ? [worldTransform.position.x, worldTransform.position.y, worldTransform.position.z] : null,
    refDistance: readNumber(target.hook.config.refDistance, 1),
    rolloffFactor: readNumber(target.hook.config.rolloffFactor, 1),
    spatial: readBoolean(target.hook.config.spatial, false),
    volume: readNumber(target.hook.config.volume, 1)
  });
}

// ---------------------------------------------------------------------------
// InteractionSystem
// ---------------------------------------------------------------------------

export function createInteractionSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Validates interact requests against range and emits started or denied events.",
    hookTypes: ["interactable"],
    id: "interaction",
    label: "InteractionSystem",
    create(context) {
      const unsubscribe = context.eventBus.subscribe(
        { event: "interact.requested" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("interactable")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const range = readNumber(target.hook.config.range, 3);
              const allowedActors = readStringArray(target.hook.config.allowedActors);
              const worldTransform = context.getTargetWorldTransform(target.targetId);

              if (!worldTransform) {
                return;
              }

              const player = context.getActors().find((actor) => {
                const tags = actor.tags ?? [];

                if (allowedActors.length > 0) {
                  return allowedActors.some((allowed) => tags.includes(allowed));
                }

                return tags.includes("player");
              });

              if (!player) {
                context.emitFromHookTarget(target, "interact.denied", { reason: "no_player" });
                return;
              }

              const dist = Math.sqrt(distanceSquared(player.position, worldTransform.position));

              if (dist > range) {
                context.emitFromHookTarget(target, "interact.denied", { reason: "out_of_range", distance: dist });
                return;
              }

              context.emitFromHookTarget(target, "interact.started", {
                actorId: player.id,
                prompt: readString(target.hook.config.prompt, "Interact")
              });
            });
        }
      );

      return {
        stop() {
          unsubscribe();
        }
      };
    }
  };
}

// ---------------------------------------------------------------------------
// LockSystem
// ---------------------------------------------------------------------------

export function createLockSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Evaluates lock conditions and emits allow or deny results.",
    hookTypes: ["lock"],
    id: "lock",
    label: "LockSystem",
    create(context) {
      const unsubscribe = context.eventBus.subscribe(
        { event: ["open.requested", "unlock.requested", "toggle.requested"] },
        (event) => {
          if (!event.targetId) {
            return;
          }

          // Skip events already forwarded by the lock to avoid infinite loop
          if (readPayloadField(event.payload, "fromLock") === true) {
            return;
          }

          context.getHookTargetsByType("lock")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const mode = readString(target.hook.config.mode, "key");
              let allowed = false;

              if (mode === "key") {
                const keyId = readString(target.hook.config.keyId, "");
                allowed = Boolean(context.getPlayerState("key:" + keyId));

                if (allowed && readBoolean(target.hook.config.consumesKey, false)) {
                  context.setPlayerState("key:" + keyId, false);
                }
              } else if (mode === "flag") {
                const flag = readString(target.hook.config.flag, "");
                const expectedValue = target.hook.config.expectedValue;
                const currentValue = context.getWorldState(flag);
                allowed = expectedValue !== undefined ? currentValue === expectedValue : Boolean(currentValue);
              } else if (mode === "item") {
                const itemId = readString(target.hook.config.itemId, "");
                allowed = Boolean(context.getPlayerState("item:" + itemId));
              } else if (mode === "code" || mode === "team") {
                allowed = true;
              }

              if (allowed) {
                context.emitFromHookTarget(target, "lock.allowed");

                if (readBoolean(target.hook.config.autoUnlock, false)) {
                  context.emitFromHookTarget(target, "lock.unlocked");
                }

                context.emitEvent({
                  event: event.event,
                  payload: { fromLock: true },
                  sourceHookType: target.hook.type,
                  sourceId: target.targetId,
                  sourceKind: target.targetKind,
                  targetId: target.targetId
                });
              } else {
                context.emitFromHookTarget(target, "lock.denied", { mode });
              }
            });
        }
      );

      return {
        stop() {
          unsubscribe();
        }
      };
    }
  };
}

// ---------------------------------------------------------------------------
// PickupSystem
// ---------------------------------------------------------------------------

export function createPickupSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Handles pickups and grants inventory or state rewards.",
    hookTypes: ["pickup"],
    id: "pickup",
    label: "PickupSystem",
    create(context) {
      const unsubscribeTrigger = context.eventBus.subscribe(
        { event: "trigger.enter" },
        (event) => {
          processPickupEvent(context, event.targetId, false);
        }
      );
      const unsubscribeInteract = context.eventBus.subscribe(
        { event: "interact.started" },
        (event) => {
          processPickupEvent(context, event.targetId, true);
        }
      );

      return {
        stop() {
          unsubscribeTrigger();
          unsubscribeInteract();
        }
      };
    }
  };
}

function processPickupEvent(
  context: GameplayRuntimeSystemContext,
  targetId: string | undefined,
  isInteraction: boolean
) {
  if (!targetId) {
    return;
  }

  context.getHookTargetsByType("pickup")
    .filter((target) => target.targetId === targetId && target.hook.enabled !== false)
    .forEach((target) => {
      const requiresInteract = readBoolean(target.hook.config.requiresInteract, false);

      if (requiresInteract && !isInteraction) {
        return;
      }

      if (!requiresInteract && isInteraction) {
        return;
      }

      const grants = asObjectArray(target.hook.config.grants);

      grants.forEach((grant) => {
        const kind = readString(grant.kind, "");
        const id = readString(grant.id, "");

        if (!kind || !id) {
          return;
        }

        if (kind === "key") {
          context.setPlayerState("key:" + id, true);
        } else if (kind === "item") {
          context.setPlayerState("item:" + id, true);
        } else if (kind === "health") {
          const healAmount = readNumber(grant.amount, 25);
          context.emitEvent({
            event: "health.changed",
            payload: { delta: healAmount, source: "pickup" },
            sourceHookType: target.hook.type,
            sourceId: target.targetId,
            sourceKind: target.targetKind,
            targetId: target.targetId
          });
        } else if (kind === "ammo") {
          const current = context.getPlayerState("ammo:" + id);
          context.setPlayerState("ammo:" + id, (typeof current === "number" ? current : 0) + 1);
        } else if (kind === "flag") {
          context.setWorldState(id, true);
        }
      });

      context.emitFromHookTarget(target, "pickup.completed");

      if (readBoolean(target.hook.config.consumeOnPickup, true)) {
        target.hook.enabled = false;
      }
    });
}

// ---------------------------------------------------------------------------
// HealthSystem
// ---------------------------------------------------------------------------

export function createHealthSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Tracks health state and zero transitions.",
    hookTypes: ["health"],
    id: "health",
    label: "HealthSystem",
    create(context) {
      const unsubscribe = context.eventBus.subscribe(
        { event: "health.changed" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("health")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const max = readNumber(target.hook.config.max, readNumber(target.hook.config.initial, 100));
              const current = readNumber(
                context.getLocalState(target.targetId, "health:current") as number | undefined,
                readNumber(target.hook.config.initial, 100)
              );
              const delta = readNumber(readPayloadField(event.payload, "delta"), 0);

              let newHealth = Math.min(max, Math.max(0, current + delta));

              context.setLocalState(target.targetId, "health:current", newHealth);

              if (newHealth <= 0 && current > 0) {
                context.emitFromHookTarget(target, "health.zero");
                context.emitFromHookTarget(target, "damage.killed");
              }
            });
        }
      );

      return {
        start() {
          context.getHookTargetsByType("health")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const initial = readNumber(target.hook.config.initial, 100);
              context.setLocalState(target.targetId, "health:current", initial);
            });
        },
        stop() {
          unsubscribe();
        }
      };
    }
  };
}

function readPayloadField(payload: unknown, field: string): GameplayValue | undefined {
  if (payload && typeof payload === "object" && field in payload) {
    return (payload as Record<string, GameplayValue>)[field];
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// DamageSystem
// ---------------------------------------------------------------------------

export function createDamageSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Applies damage and kill events with typed payloads.",
    hookTypes: ["damageable"],
    id: "damage",
    label: "DamageSystem",
    create(context) {
      const unsubscribe = context.eventBus.subscribe(
        { event: "damage.apply" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("damageable")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const baseAmount = readNumber(readPayloadField(event.payload, "amount"), 0);
              const damageType = readString(
                readPayloadField(event.payload, "damageType") as string | undefined,
                "default"
              );
              const multipliers = asObject(target.hook.config.multipliers);
              const multiplier = multipliers ? readNumber(multipliers[damageType], 1) : 1;
              const finalAmount = baseAmount * multiplier;

              context.emitFromHookTarget(target, "damage.received", {
                amount: finalAmount,
                damageType
              });

              // Delegate health bookkeeping to HealthSystem via health.changed
              context.emitEvent({
                event: "health.changed",
                payload: { delta: -finalAmount, source: "damage" },
                sourceHookType: target.hook.type,
                sourceId: target.targetId,
                sourceKind: target.targetKind,
                targetId: target.targetId
              });
            });
        }
      );

      return {
        stop() {
          unsubscribe();
        }
      };
    }
  };
}

// ---------------------------------------------------------------------------
// SpawnerSystem
// ---------------------------------------------------------------------------

export function createSpawnerSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Creates runtime entities or prefabs and enforces spawn rules.",
    hookTypes: ["spawner"],
    id: "spawner",
    label: "SpawnerSystem",
    create(context) {
      const respawnTimers = new Map<string, number>();
      const unsubscribeSpawn = context.eventBus.subscribe(
        { event: "spawn.requested" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("spawner")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              attemptSpawn(context, target);
            });
        }
      );
      const unsubscribeActivate = context.eventBus.subscribe(
        { event: "spawner.activate" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("spawner")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              context.setLocalState(target.targetId, "spawner:active", true);
              context.emitFromHookTarget(target, "spawner.activated");
              attemptSpawn(context, target);
            });
        }
      );
      const unsubscribeDeactivate = context.eventBus.subscribe(
        { event: "spawner.deactivate" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("spawner")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              context.setLocalState(target.targetId, "spawner:active", false);
              context.emitFromHookTarget(target, "spawner.deactivated");
            });
        }
      );
      const unsubscribeDeath = context.eventBus.subscribe(
        { event: ["damage.killed", "destroy.completed"] },
        () => {
          context.getHookTargetsByType("spawner")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const alive = readNumber(
                context.getLocalState(target.targetId, "spawner:alive") as number | undefined,
                0
              );
              if (alive > 0) {
                context.setLocalState(target.targetId, "spawner:alive", alive - 1);
              }
            });
        }
      );

      function attemptSpawn(spawnContext: GameplayRuntimeSystemContext, target: GameplayHookTarget) {
        const maxAlive = readNumber(target.hook.config.maxAlive, Infinity);
        const maxTotal = readNumber(target.hook.config.maxTotal, Infinity);
        const currentCount = readNumber(
          spawnContext.getLocalState(target.targetId, "spawner:count") as number | undefined,
          0
        );
        const currentAlive = readNumber(
          spawnContext.getLocalState(target.targetId, "spawner:alive") as number | undefined,
          0
        );

        if (currentAlive >= maxAlive || currentCount >= maxTotal) {
          spawnContext.emitFromHookTarget(target, "spawn.failed", { reason: "limit_reached" });
          return;
        }

        const prefabId = readString(target.hook.config.prefabId, "");
        spawnContext.setLocalState(target.targetId, "spawner:count", currentCount + 1);
        spawnContext.setLocalState(target.targetId, "spawner:alive", currentAlive + 1);
        spawnContext.emitFromHookTarget(target, "spawn.completed", { prefabId });

        if (readBoolean(target.hook.config.respawn, false)) {
          const delay = readNumber(target.hook.config.respawnDelay, 5);
          respawnTimers.set(target.hook.id, delay);
        }
      }

      return {
        stop() {
          unsubscribeSpawn();
          unsubscribeActivate();
          unsubscribeDeactivate();
          unsubscribeDeath();
          respawnTimers.clear();
        },
        update(deltaSeconds) {
          respawnTimers.forEach((remaining, hookId) => {
            const next = remaining - deltaSeconds;

            if (next <= 0) {
              respawnTimers.delete(hookId);

              const target = context.getHookTargetsByType("spawner").find((t) => t.hook.id === hookId);

              if (target && target.hook.enabled !== false) {
                const active = context.getLocalState(target.targetId, "spawner:active");

                if (active !== false) {
                  attemptSpawn(context, target);
                }
              }
            } else {
              respawnTimers.set(hookId, next);
            }
          });
        }
      };
    }
  };
}

// ---------------------------------------------------------------------------
// AiSystem
// ---------------------------------------------------------------------------

export function createAiSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Manages AI enablement and target assignment.",
    hookTypes: ["ai_agent"],
    id: "ai",
    label: "AiSystem",
    create(context) {
      const unsubscribeEnable = context.eventBus.subscribe(
        { event: "ai.enable" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("ai_agent")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              context.setLocalState(target.targetId, "ai:active", true);
              context.emitFromHookTarget(target, "ai.enabled");
            });
        }
      );
      const unsubscribeDisable = context.eventBus.subscribe(
        { event: "ai.disable" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("ai_agent")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              context.setLocalState(target.targetId, "ai:active", false);
              context.emitFromHookTarget(target, "ai.disabled");
            });
        }
      );
      const unsubscribeSetTarget = context.eventBus.subscribe(
        { event: "ai.set_target" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("ai_agent")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const aiTarget = readString(
                readPayloadField(event.payload, "target") as string | undefined,
                ""
              );
              context.setLocalState(target.targetId, "ai:target", aiTarget);
              context.emitFromHookTarget(target, "ai.target_acquired", { target: aiTarget });
            });
        }
      );

      return {
        start() {
          context.getHookTargetsByType("ai_agent")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const enabled = readBoolean(target.hook.config.enabled, false);

              if (enabled) {
                context.setLocalState(target.targetId, "ai:active", true);
                context.emitFromHookTarget(target, "ai.enabled");
              }
            });
        },
        stop() {
          unsubscribeEnable();
          unsubscribeDisable();
          unsubscribeSetTarget();
        }
      };
    }
  };
}

// ---------------------------------------------------------------------------
// FlagSystem
// ---------------------------------------------------------------------------

export function createFlagSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Manages world and mission flag writes or queries.",
    hookTypes: ["flag_setter", "flag_condition"],
    id: "flag",
    label: "FlagSystem",
    create(context) {
      const unsubscribeSet = context.eventBus.subscribe(
        { event: "flag.set" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("flag_setter")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const flag = readString(target.hook.config.flag, "");

              if (!flag) {
                return;
              }

              const value = target.hook.config.value ?? true;
              context.setWorldState(flag, value);
              context.emitFromHookTarget(target, "flag.changed", { flag, value });
            });
        }
      );
      const unsubscribeCheck = context.eventBus.subscribe(
        { event: "condition.check" },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("flag_condition")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              const flag = readString(target.hook.config.flag, "");

              if (!flag) {
                return;
              }

              const expected = target.hook.config.expected;
              const current = context.getWorldState(flag);
              const matched = expected !== undefined ? current === expected : Boolean(current);

              if (matched) {
                context.emitFromHookTarget(target, "condition.true", { flag, value: current });
              } else {
                context.emitFromHookTarget(target, "condition.false", { flag, value: current, expected });
              }
            });
        }
      );

      return {
        stop() {
          unsubscribeSet();
          unsubscribeCheck();
        }
      };
    }
  };
}

// ---------------------------------------------------------------------------
// ConditionListenerSystem
// ---------------------------------------------------------------------------

export function createConditionListenerSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Tracks allOf or anyOf event conditions and fires actions when met.",
    hookTypes: ["condition_listener"],
    id: "condition",
    label: "ConditionListenerSystem",
    create(context) {
      const conditionStates = new Map<string, ConditionListenerState>();
      const unsubscribes: Array<() => void> = [];

      return {
        start() {
          context.getHookTargetsByType("condition_listener")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const allOf = asObjectArray(target.hook.config.allOf);
              const anyOf = asObjectArray(target.hook.config.anyOf);
              const once = readBoolean(target.hook.config.once, false);

              const state: ConditionListenerState = {
                allOfMet: new Set<number>(),
                anyOfMet: false,
                fired: false
              };

              conditionStates.set(target.hook.id, state);

              allOf.forEach((condition, index) => {
                const eventName = readString(condition.event, "");
                const fromEntity = readString(condition.fromEntity, "");

                if (!eventName) {
                  return;
                }

                const unsub = context.eventBus.subscribe(
                  (event) => {
                    if (event.event !== eventName) {
                      return;
                    }

                    if (fromEntity && event.sourceId !== fromEntity) {
                      return;
                    }

                    if (target.hook.enabled === false) {
                      return;
                    }

                    state.allOfMet.add(index);
                    evaluateConditionListener(context, target, state, allOf.length, anyOf.length, once);
                  }
                );

                unsubscribes.push(unsub);
              });

              anyOf.forEach((condition) => {
                const eventName = readString(condition.event, "");
                const fromEntity = readString(condition.fromEntity, "");

                if (!eventName) {
                  return;
                }

                const unsub = context.eventBus.subscribe(
                  (event) => {
                    if (event.event !== eventName) {
                      return;
                    }

                    if (fromEntity && event.sourceId !== fromEntity) {
                      return;
                    }

                    if (target.hook.enabled === false) {
                      return;
                    }

                    state.anyOfMet = true;
                    evaluateConditionListener(context, target, state, allOf.length, anyOf.length, once);
                  }
                );

                unsubscribes.push(unsub);
              });
            });
        },
        stop() {
          unsubscribes.forEach((unsub) => unsub());
          unsubscribes.length = 0;
          conditionStates.clear();
        }
      };
    }
  };
}

type ConditionListenerState = {
  allOfMet: Set<number>;
  anyOfMet: boolean;
  fired: boolean;
};

function evaluateConditionListener(
  context: GameplayRuntimeSystemContext,
  target: GameplayHookTarget,
  state: ConditionListenerState,
  allOfCount: number,
  anyOfCount: number,
  once: boolean
) {
  if (once && state.fired) {
    return;
  }

  const allOfSatisfied = allOfCount === 0 || state.allOfMet.size >= allOfCount;
  const anyOfSatisfied = anyOfCount === 0 || state.anyOfMet;

  if (!allOfSatisfied || !anyOfSatisfied) {
    return;
  }

  state.fired = true;
  context.emitFromHookTarget(target, "condition.met");

  const actions = asObjectArray(target.hook.config.actions);

  actions.forEach((action) => {
    executeConditionAction(context, target, action);
  });

  // Reset state for non-once conditions so they can fire again
  if (!once) {
    state.allOfMet.clear();
    state.anyOfMet = false;
    state.fired = false;
  }
}

function executeConditionAction(
  context: GameplayRuntimeSystemContext,
  hookTarget: GameplayHookTarget,
  action: GameplayObject
) {
  const actionType = readString(action.type, "");

  if (actionType === "emit") {
    const eventName = readString(action.event, "");
    const targetId = readString(action.target, hookTarget.targetId);

    if (!eventName) {
      return;
    }

    context.emitEvent({
      event: eventName,
      payload: action.payload,
      sourceHookType: hookTarget.hook.type,
      sourceId: hookTarget.targetId,
      sourceKind: hookTarget.targetKind,
      targetId
    });
    return;
  }

  if (actionType === "set_flag") {
    const flag = readString(action.flag, "");

    if (!flag) {
      return;
    }

    context.setWorldState(flag, action.value ?? null);
    context.emitFromHookTarget(hookTarget, "flag.changed", {
      flag,
      value: action.value ?? null
    });
    return;
  }

  if (actionType === "enable" || actionType === "disable") {
    const targetId = readString(action.target, "");

    if (!targetId) {
      return;
    }

    context.getHookTargets()
      .filter((target) => target.targetId === targetId)
      .forEach((target) => {
        target.hook.enabled = actionType === "enable";
      });
    return;
  }

  if (actionType === "spawn") {
    const targetId = readString(action.target, "");

    if (targetId) {
      context.emitEvent({
        event: "spawn.requested",
        sourceHookType: hookTarget.hook.type,
        sourceId: hookTarget.targetId,
        sourceKind: hookTarget.targetKind,
        targetId
      });
    }

    return;
  }

  if (actionType === "destroy") {
    const targetId = readString(action.target, "");

    if (targetId) {
      context.emitEvent({
        event: "destroy.requested",
        sourceHookType: hookTarget.hook.type,
        sourceId: hookTarget.targetId,
        sourceKind: hookTarget.targetKind,
        targetId
      });
    }
  }
}

// ---------------------------------------------------------------------------
// DestructibleSystem
// ---------------------------------------------------------------------------

export function createDestructibleSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Handles destruction lifecycle when targets are killed or destroy-requested.",
    hookTypes: ["destructible"],
    id: "destructible",
    label: "DestructibleSystem",
    create(context) {
      const unsubscribe = context.eventBus.subscribe(
        { event: ["damage.killed", "destroy.requested"] },
        (event) => {
          if (!event.targetId) {
            return;
          }

          context.getHookTargetsByType("destructible")
            .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
            .forEach((target) => {
              context.emitFromHookTarget(target, "destroy.started");

              const mode = readString(target.hook.config.mode, "disable");

              if (mode === "disable") {
                disableAllHooks(context, target.targetId);
              } else if (mode === "spawn_prefab") {
                const prefabId = readString(target.hook.config.destroyedPrefabId, "");

                if (prefabId) {
                  context.emitEvent({
                    event: "spawn.requested",
                    payload: { prefabId },
                    sourceHookType: target.hook.type,
                    sourceId: target.targetId,
                    sourceKind: target.targetKind,
                    targetId: target.targetId
                  });
                }
              } else if (mode === "swap_mesh" || mode === "explode") {
                context.emitFromHookTarget(target, `destroy.${mode}`, {
                  prefabId: readString(target.hook.config.destroyedPrefabId, "")
                });
              }

              if (readBoolean(target.hook.config.disableOnDestroy, true)) {
                disableAllHooks(context, target.targetId);
              }

              context.emitFromHookTarget(target, "destroy.completed");
            });
        }
      );

      return {
        stop() {
          unsubscribe();
        }
      };
    }
  };
}

function disableAllHooks(context: GameplayRuntimeSystemContext, targetId: string) {
  context.getHookTargets()
    .filter((target) => target.targetId === targetId)
    .forEach((target) => {
      target.hook.enabled = false;
    });
}

// ---------------------------------------------------------------------------
// VfxEmitterSystem
// ---------------------------------------------------------------------------

export function createVfxEmitterSystemDefinition(): GameplayRuntimeSystemDefinition {
  return {
    description: "Routes gameplay events to VFX playback via vfx_emitter hooks.",
    hookTypes: ["vfx_emitter"],
    id: "vfx",
    label: "VfxEmitterSystem",
    create(context) {
      const unsubscribes: Array<() => void> = [];

      return {
        start() {
          context.getHookTargetsByType("vfx_emitter")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const eventMap = asObject(target.hook.config.eventMap);

              if (!eventMap) {
                return;
              }

              for (const [triggerEvent, vfxId] of Object.entries(eventMap)) {
                if (typeof vfxId !== "string" || !vfxId) {
                  continue;
                }

                const unsub = context.eventBus.subscribe(
                  { event: triggerEvent, targetId: target.targetId },
                  () => {
                    if (target.hook.enabled === false) {
                      return;
                    }

                    const worldTransform = context.getTargetWorldTransform(target.targetId);

                    context.emitFromHookTarget(target, "vfx.play", {
                      hookId: target.hook.id,
                      position: worldTransform
                        ? [worldTransform.position.x, worldTransform.position.y, worldTransform.position.z]
                        : null,
                      vfxId
                    });
                  }
                );

                unsubscribes.push(unsub);
              }
            });

          unsubscribes.push(
            context.eventBus.subscribe({ event: "vfx.stop_all" }, () => {
              context.getHookTargetsByType("vfx_emitter").forEach((vfxTarget) => {
                context.emitFromHookTarget(vfxTarget, "vfx.stop", {
                  hookId: vfxTarget.hook.id
                });
              });
            })
          );
        },
        stop() {
          unsubscribes.forEach((unsub) => unsub());
          unsubscribes.length = 0;
        }
      };
    }
  };
}
