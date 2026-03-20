import type { RuntimeAudioDescriptor, RuntimeScene } from "./types";

/** Extract audio descriptors from entities and nodes that have `audio_emitter` hooks. */
export function getRuntimeAudioDescriptors(
  scene: Pick<RuntimeScene, "entities" | "nodes">
): RuntimeAudioDescriptor[] {
  const descriptors: RuntimeAudioDescriptor[] = [];

  const processTarget = (targetId: string, hooks: RuntimeScene["entities"][number]["hooks"], transform?: { position: { x: number; y: number; z: number } }) => {
    hooks?.forEach((hook) => {
      if (hook.type !== "audio_emitter") {
        return;
      }

      const clip = typeof hook.config.clip === "string" ? hook.config.clip : "";

      if (!clip) {
        return;
      }

      const position = transform?.position;

      descriptors.push({
        autoPlay: hook.config.autoPlay === true,
        channel: typeof hook.config.channel === "string" ? hook.config.channel : "sfx",
        clip,
        distanceModel: typeof hook.config.distanceModel === "string" ? hook.config.distanceModel : "inverse",
        hookId: hook.id,
        loop: hook.config.loop === true,
        maxDistance: typeof hook.config.maxDistance === "number" ? hook.config.maxDistance : 10000,
        pitch: typeof hook.config.pitch === "number" ? hook.config.pitch : 1,
        position: position ? { x: position.x, y: position.y, z: position.z } : undefined,
        refDistance: typeof hook.config.refDistance === "number" ? hook.config.refDistance : 1,
        rolloffFactor: typeof hook.config.rolloffFactor === "number" ? hook.config.rolloffFactor : 1,
        spatial: hook.config.spatial === true,
        stopEvent: typeof hook.config.stopEvent === "string" && hook.config.stopEvent.length > 0 ? hook.config.stopEvent : undefined,
        targetId,
        triggerEvent: typeof hook.config.triggerEvent === "string" && hook.config.triggerEvent.length > 0 ? hook.config.triggerEvent : undefined,
        volume: typeof hook.config.volume === "number" ? hook.config.volume : 1
      });
    });
  };

  scene.entities.forEach((entity) => {
    processTarget(entity.id, entity.hooks, entity.transform);
  });

  scene.nodes.forEach((node) => {
    processTarget(node.id, node.hooks, node.transform);
  });

  return descriptors;
}
