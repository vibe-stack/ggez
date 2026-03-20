import { vec3, readGameplayBoolean, readGameplayNumber, readGameplayString, readGameplayVec3, type GameplayValue, type Vec3 } from "@ggez/shared";
import type { ParticleEmitterState, ResolvedEmitterConfig } from "./types";
import { createEmitterState, updateEmitter } from "./particle-pool";

export type ParticleSystemHost = {
  createEmitter: (emitterId: string, config: ResolvedEmitterConfig) => void;
  destroyEmitter: (emitterId: string) => void;
  updateEmitter: (emitterId: string, state: ParticleEmitterState) => void;
};

export type ParticleSystemApi = {
  dispose: () => void;
  getEmitterStates: () => ReadonlyMap<string, ParticleEmitterState>;
  handleEvent: (eventName: string, targetId?: string) => void;
  start: (hooks: ParticleHookInput[]) => void;
  stop: () => void;
  update: (deltaSeconds: number, getWorldPosition: (targetId: string) => Vec3 | undefined) => void;
};

export type ParticleHookInput = {
  config: Record<string, GameplayValue>;
  enabled: boolean;
  hookId: string;
  targetId: string;
};

export function createParticleSystem(host?: ParticleSystemHost): ParticleSystemApi {
  const emitters = new Map<string, ParticleEmitterState>();
  const targetIdByHookId = new Map<string, string>();
  let eventSubscribers: Array<{ action: "start" | "stop"; event: string; hookId: string }> = [];

  function resolveConfig(config: Record<string, GameplayValue>): ResolvedEmitterConfig {
    return {
      billboard: readGameplayBoolean(config.billboard, true),
      blending: readGameplayString(config.blending, "additive") === "normal" ? "normal" : "additive",
      burst: readGameplayNumber(config.burst, 0),
      direction: readGameplayVec3(config.direction, vec3(0, 1, 0)),
      emissionRate: readGameplayNumber(config.emissionRate, 10),
      endColor: parseColor(readGameplayString(config.endColor, "#ffffff")),
      endOpacity: readGameplayNumber(config.endOpacity, 0),
      endSize: readGameplayNumber(config.endSize, 0),
      gravity: readGameplayVec3(config.gravity, vec3(0, -9.8, 0)),
      lifetime: readGameplayNumber(config.lifetime, 2),
      lifetimeVariance: readGameplayNumber(config.lifetimeVariance, 0.5),
      maxParticles: readGameplayNumber(config.maxParticles, 100),
      speed: readGameplayNumber(config.speed, 5),
      speedVariance: readGameplayNumber(config.speedVariance, 1),
      spread: readGameplayNumber(config.spread, 0.5),
      startColor: parseColor(readGameplayString(config.startColor, "#ffffff")),
      startOpacity: readGameplayNumber(config.startOpacity, 1),
      startSize: readGameplayNumber(config.startSize, 0.1),
      texture: readGameplayString(config.texture, "")
    };
  }

  return {
    dispose() {
      emitters.forEach((_state, id) => host?.destroyEmitter(id));
      emitters.clear();
      targetIdByHookId.clear();
      eventSubscribers = [];
    },

    getEmitterStates() {
      return emitters;
    },

    handleEvent(eventName: string, targetId?: string) {
      for (const sub of eventSubscribers) {
        if (sub.event !== eventName) {
          continue;
        }

        const state = emitters.get(sub.hookId);

        if (!state) {
          continue;
        }

        if (targetId) {
          const emitterTargetId = targetIdByHookId.get(sub.hookId);

          if (emitterTargetId && emitterTargetId !== targetId) {
            continue;
          }
        }

        if (sub.action === "start") {
          state.active = true;
          state.timeSinceEmission = 0;
        } else {
          state.active = false;
        }
      }
    },

    start(hooks: ParticleHookInput[]) {
      eventSubscribers = [];
      targetIdByHookId.clear();

      hooks.filter((h) => h.enabled).forEach((hook) => {
        const config = resolveConfig(hook.config);
        const autoplay = readGameplayBoolean(hook.config.autoplay, true);
        const triggerEvent = readGameplayString(hook.config.triggerEvent, "");
        const stopEvent = readGameplayString(hook.config.stopEvent, "");

        if (triggerEvent) {
          eventSubscribers.push({ action: "start", event: triggerEvent, hookId: hook.hookId });
        }

        if (stopEvent) {
          eventSubscribers.push({ action: "stop", event: stopEvent, hookId: hook.hookId });
        }

        targetIdByHookId.set(hook.hookId, hook.targetId);
        const state = createEmitterState(hook.hookId, config, vec3(0, 0, 0));
        state.active = autoplay;
        emitters.set(hook.hookId, state);
        host?.createEmitter(hook.hookId, config);
      });
    },

    stop() {
      emitters.forEach((_state, id) => host?.destroyEmitter(id));
      emitters.clear();
      targetIdByHookId.clear();
      eventSubscribers = [];
    },

    update(deltaSeconds, getWorldPosition) {
      emitters.forEach((state, id) => {
        const resolvedTargetId = targetIdByHookId.get(state.emitterId);
        const position = resolvedTargetId ? getWorldPosition(resolvedTargetId) : getWorldPosition(state.emitterId);

        if (position) {
          state.origin = position;
        }

        updateEmitter(state, deltaSeconds);
        host?.updateEmitter(id, state);
      });
    }
  };
}

function parseColor(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");

  if (cleaned.length < 6) {
    return [1, 1, 1];
  }

  return [
    parseInt(cleaned.substring(0, 2), 16) / 255,
    parseInt(cleaned.substring(2, 4), 16) / 255,
    parseInt(cleaned.substring(4, 6), 16) / 255
  ];
}
