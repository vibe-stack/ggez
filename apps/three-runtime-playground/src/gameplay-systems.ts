import {
  createAudioSystemDefinition,
  createMoverSystemDefinition,
  createOpenableSystemDefinition,
  createPathMoverSystemDefinition,
  createScenePathResolver,
  createSequenceSystemDefinition,
  createTriggerSystemDefinition,
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

  return systems;
}
