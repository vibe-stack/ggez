import type { Entity, GameplayObject, GameplayValue, GeometryNode } from "@ggez/shared";
import type { RuntimeAudioEmitterDescriptor, AudioDistanceModel } from "./types";

/**
 * Extract audio emitter descriptors from entities and nodes that have `audio_emitter` hooks.
 * This is the audio equivalent of `getRuntimePhysicsDescriptors`.
 */
export function getRuntimeAudioDescriptors(scene: {
  entities?: Array<Pick<Entity, "hooks" | "id" | "transform">>;
  nodes?: Array<Pick<GeometryNode, "hooks" | "id" | "transform">>;
}): RuntimeAudioEmitterDescriptor[] {
  const descriptors: RuntimeAudioEmitterDescriptor[] = [];

  scene.entities?.forEach((entity) => {
    entity.hooks?.forEach((hook) => {
      if (hook.type !== "audio_emitter") {
        return;
      }

      const descriptor = resolveAudioDescriptor(hook.id, entity.id, hook.config, entity.transform.position);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    });
  });

  scene.nodes?.forEach((node) => {
    node.hooks?.forEach((hook) => {
      if (hook.type !== "audio_emitter") {
        return;
      }

      const descriptor = resolveAudioDescriptor(hook.id, node.id, hook.config, node.transform.position);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    });
  });

  return descriptors;
}

function resolveAudioDescriptor(
  hookId: string,
  targetId: string,
  config: GameplayObject,
  position?: { x: number; y: number; z: number }
): RuntimeAudioEmitterDescriptor | undefined {
  const clip = readString(config.clip, "");

  if (!clip) {
    return undefined;
  }

  return {
    autoPlay: readBoolean(config.autoPlay, false),
    clip,
    distanceModel: readDistanceModel(config.distanceModel),
    hookId,
    loop: readBoolean(config.loop, false),
    maxDistance: readNumber(config.maxDistance, 10000),
    pitch: readNumber(config.pitch, 1),
    position: position ? { x: position.x, y: position.y, z: position.z } : undefined,
    refDistance: readNumber(config.refDistance, 1),
    rolloffFactor: readNumber(config.rolloffFactor, 1),
    spatial: readBoolean(config.spatial, false),
    stopEvent: readOptionalString(config.stopEvent),
    targetId,
    triggerEvent: readOptionalString(config.triggerEvent),
    volume: readNumber(config.volume, 1)
  };
}

function readString(value: GameplayValue | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readOptionalString(value: GameplayValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: GameplayValue | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function readBoolean(value: GameplayValue | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readDistanceModel(value: GameplayValue | undefined): AudioDistanceModel {
  if (value === "linear" || value === "exponential" || value === "inverse") {
    return value;
  }

  return "inverse";
}
