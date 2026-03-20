import {
  createAiSystemDefinition,
  createAudioSystemDefinition,
  createConditionListenerSystemDefinition,
  createDamageSystemDefinition,
  createDestructibleSystemDefinition,
  createFlagSystemDefinition,
  createHealthSystemDefinition,
  createInteractionSystemDefinition,
  createLockSystemDefinition,
  createMoverSystemDefinition,
  createOpenableSystemDefinition,
  createPathMoverSystemDefinition,
  createPickupSystemDefinition,
  createScenePathResolver,
  createSequenceSystemDefinition,
  createSpawnerSystemDefinition,
  createTriggerSystemDefinition,
  createVfxEmitterSystemDefinition,
  type GameplayRuntimeSystemDefinition
} from "@ggez/gameplay-runtime";
import type { WebHammerEngineScene } from "@ggez/three-runtime";

export type PlaybackGameplaySystemsState = {
  audio: boolean;
  mover: boolean;
  openable: boolean;
  pathMover: boolean;
  sequence: boolean;
  trigger: boolean;
};

export function createPlaybackGameplaySystems(
  scene: Pick<WebHammerEngineScene, "settings">,
  enabledSystems: PlaybackGameplaySystemsState
): GameplayRuntimeSystemDefinition[] {
  const systems: GameplayRuntimeSystemDefinition[] = [];

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
    systems.push(createAudioSystemDefinition());
  }

  // Always-on systems (no toggle — they activate based on hook presence)
  systems.push(createInteractionSystemDefinition());
  systems.push(createLockSystemDefinition());
  systems.push(createPickupSystemDefinition());
  systems.push(createHealthSystemDefinition());
  systems.push(createDamageSystemDefinition());
  systems.push(createSpawnerSystemDefinition());
  systems.push(createAiSystemDefinition());
  systems.push(createFlagSystemDefinition());
  systems.push(createConditionListenerSystemDefinition());
  systems.push(createDestructibleSystemDefinition());
  systems.push(createVfxEmitterSystemDefinition());

  return systems;
}
