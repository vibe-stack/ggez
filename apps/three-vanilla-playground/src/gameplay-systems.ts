import {
  createMoverSystemDefinition,
  createOpenableSystemDefinition,
  createPathMoverSystemDefinition,
  createScenePathResolver,
  createSequenceSystemDefinition,
  createTriggerSystemDefinition,
  type GameplayRuntimeSystemDefinition
} from "@ggez/gameplay-runtime";
import { createAudioSystemDefinition, createAudioEngine, type AudioEngine } from "@ggez/runtime-audio";
import { createParticleSystem, createThreeParticleHost, type ParticleSystemApi, type ThreeParticleHost } from "@ggez/runtime-particles";
import type { WebHammerEngineScene } from "@ggez/three-runtime";
import type { EnabledSystemsState } from "./types";

export type PlaybackGameplaySystemsState = EnabledSystemsState;

export type PlaybackSystemsBundle = {
  audioEngine?: AudioEngine;
  particleHost?: ThreeParticleHost;
  particleSystem?: ParticleSystemApi;
  systems: GameplayRuntimeSystemDefinition[];
};

export function createPlaybackGameplaySystems(
  scene: Pick<WebHammerEngineScene, "nodes" | "settings">,
  enabledSystems: EnabledSystemsState
): PlaybackSystemsBundle {
  const systems: GameplayRuntimeSystemDefinition[] = [];
  let audioEngine: AudioEngine | undefined;
  let particleSystem: ParticleSystemApi | undefined;

  if (enabledSystems.trigger) {
    systems.push(createTriggerSystemDefinition());
  }

  if (enabledSystems.sequence) {
    systems.push(createSequenceSystemDefinition());
  }

  if (enabledSystems.openable) {
    systems.push(createOpenableSystemDefinition());
  }

  if (enabledSystems.mover) {
    systems.push(createMoverSystemDefinition());
  }

  if (enabledSystems.pathMover) {
    systems.push(createPathMoverSystemDefinition(createScenePathResolver(scene.settings.paths ?? [])));
  }

  if (enabledSystems.audio) {
    audioEngine = createAudioEngine({ maxConcurrentSources: 16 });
    systems.push(createAudioSystemDefinition({ audioEngine }));
  }

  if (enabledSystems.particle) {
    particleSystem = createParticleSystem();
  }

  return { audioEngine, particleSystem, systems };
}
