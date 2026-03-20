import { readGameplayBoolean, readGameplayNumber, readGameplayString } from "@ggez/shared";
import type {
  GameplayEvent,
  GameplayHookTarget,
  GameplayRuntimeSystemContext,
  GameplayRuntimeSystemDefinition
} from "@ggez/gameplay-runtime";
import type { AudioEmitterState, AudioEngine } from "./types";

export type AudioSystemOptions = {
  audioEngine: AudioEngine;
};

export function createAudioSystemDefinition(options: AudioSystemOptions): GameplayRuntimeSystemDefinition {
  return {
    description: "Routes gameplay events to spatial audio playback via audio_emitter hooks.",
    hookTypes: ["audio_emitter"],
    id: "audio",
    label: "AudioSystem",
    create(context: GameplayRuntimeSystemContext) {
      const { audioEngine } = options;
      const emitterStates = new Map<string, AudioEmitterState>();
      const unsubscribers: Array<() => void> = [];

      function resolveEmitterConfig(hook: GameplayHookTarget["hook"]) {
        return {
          autoplay: readGameplayBoolean(hook.config.autoplay, false),
          loop: readGameplayBoolean(hook.config.loop, false),
          maxDistance: readGameplayNumber(hook.config.maxDistance, 50),
          refDistance: readGameplayNumber(hook.config.refDistance, 1),
          rolloffFactor: readGameplayNumber(hook.config.rolloffFactor, 1),
          spatial: readGameplayBoolean(hook.config.spatial, true),
          src: readGameplayString(hook.config.src, ""),
          stopEvent: readGameplayString(hook.config.stopEvent, ""),
          triggerEvent: readGameplayString(hook.config.triggerEvent, ""),
          volume: readGameplayNumber(hook.config.volume, 1)
        };
      }

      function playEmitter(target: GameplayHookTarget) {
        const config = resolveEmitterConfig(target.hook);

        if (!config.src) {
          return;
        }

        const state = emitterStates.get(target.hook.id);

        if (state?.active && state.currentHandle) {
          audioEngine.stop(state.currentHandle);
        }

        const worldTransform = context.getTargetWorldTransform(target.targetId);

        audioEngine.play({
          loop: config.loop,
          spatial: config.spatial ? {
            maxDistance: config.maxDistance,
            position: worldTransform?.position,
            refDistance: config.refDistance,
            rolloffFactor: config.rolloffFactor
          } : undefined,
          src: config.src,
          volume: config.volume
        }).then((handle) => {
          const emitterState: AudioEmitterState = {
            active: true,
            currentHandle: handle,
            hookId: target.hook.id,
            targetId: target.targetId
          };

          emitterStates.set(target.hook.id, emitterState);
          context.emitFromHookTarget(target, "audio.started", { src: config.src });
        }).catch((error) => {
          console.warn("[AudioSystem] play failed:", error);
        });
      }

      function stopEmitter(target: GameplayHookTarget) {
        const state = emitterStates.get(target.hook.id);

        if (state?.currentHandle) {
          audioEngine.stop(state.currentHandle);
          state.active = false;
          state.currentHandle = undefined;
          context.emitFromHookTarget(target, "audio.stopped");
        }
      }

      return {
        start() {
          unsubscribers.push(context.eventBus.subscribe((event: GameplayEvent) => {
            if (event.event === "audio.play" && event.targetId) {
              context.getHookTargetsByType("audio_emitter")
                .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
                .forEach((target) => playEmitter(target));
              return;
            }

            if (event.event === "audio.stop" && event.targetId) {
              context.getHookTargetsByType("audio_emitter")
                .filter((target) => target.targetId === event.targetId && target.hook.enabled !== false)
                .forEach((target) => stopEmitter(target));
              return;
            }

            if (event.event === "audio.stop_all") {
              audioEngine.stopAll();
              emitterStates.forEach((state) => {
                state.active = false;
                state.currentHandle = undefined;
              });
              return;
            }

            context.getHookTargetsByType("audio_emitter")
              .filter((target) => target.hook.enabled !== false)
              .forEach((target) => {
                const config = resolveEmitterConfig(target.hook);

                if (config.triggerEvent && event.event === config.triggerEvent) {
                  if (!event.targetId || event.targetId === target.targetId) {
                    playEmitter(target);
                  }
                }

                if (config.stopEvent && event.event === config.stopEvent) {
                  if (!event.targetId || event.targetId === target.targetId) {
                    stopEmitter(target);
                  }
                }
              });
          }));

          context.getHookTargetsByType("audio_emitter")
            .filter((target) => target.hook.enabled !== false)
            .forEach((target) => {
              const config = resolveEmitterConfig(target.hook);

              emitterStates.set(target.hook.id, {
                active: false,
                hookId: target.hook.id,
                targetId: target.targetId
              });

              if (config.autoplay && config.src) {
                playEmitter(target);
              }
            });
        },

        stop() {
          unsubscribers.forEach((unsub) => unsub());
          unsubscribers.length = 0;
          audioEngine.stopAll();
          emitterStates.clear();
        },

        update() {
          const actors = context.getActors();
          const primaryActor = actors[0];

          if (primaryActor) {
            audioEngine.setListenerPosition(primaryActor.position);
          }

          const hookTargets = context.getHookTargetsByType("audio_emitter");

          emitterStates.forEach((state) => {
            if (!state.active || !state.currentHandle) {
              return;
            }

            if (!audioEngine.isPlaying(state.currentHandle)) {
              const target = hookTargets.find((t) => t.hook.id === state.hookId);

              if (target) {
                context.emitFromHookTarget(target, "audio.ended");
              }

              state.active = false;
              state.currentHandle = undefined;
              return;
            }

            const worldTransform = context.getTargetWorldTransform(state.targetId);

            if (worldTransform) {
              audioEngine.setSourcePosition(state.currentHandle, worldTransform.position);
            }
          });
        }
      };
    }
  };
}
