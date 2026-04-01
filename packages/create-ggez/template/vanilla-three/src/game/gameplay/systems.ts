import {
  createMoverSystemDefinition,
  createOpenableSystemDefinition,
  createPathMoverSystemDefinition,
  createScenePathResolver,
  createSequenceSystemDefinition,
  createTriggerSystemDefinition,
  type GameplayRuntimeSystemRegistration
} from "@ggez/gameplay-runtime";
import type { SceneSettings } from "@ggez/shared";

/**
 * Returns the default set of gameplay systems used by every scene.
 * Scene definitions can override individual systems by including an entry
 * with the same id via mergeGameplaySystems().
 */
export function createDefaultGameplaySystems(
  sceneSettings: Pick<SceneSettings, "paths">
): GameplayRuntimeSystemRegistration[] {
  return [
    createTriggerSystemDefinition(),
    createSequenceSystemDefinition(),
    createOpenableSystemDefinition(),
    createMoverSystemDefinition(),
    createPathMoverSystemDefinition(createScenePathResolver(sceneSettings.paths ?? []))
  ];
}

/**
 * Merges base systems with scene-specific overrides.
 * If both sets contain a system with the same id, the scene system wins.
 */
export function mergeGameplaySystems(
  baseSystems: GameplayRuntimeSystemRegistration[],
  sceneSystems: GameplayRuntimeSystemRegistration[]
): GameplayRuntimeSystemRegistration[] {
  const merged = new Map<string, GameplayRuntimeSystemRegistration>();

  baseSystems.forEach((s) => merged.set(s.id, s));
  sceneSystems.forEach((s) => merged.set(s.id, s));

  return Array.from(merged.values());
}
