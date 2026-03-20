import { describe, expect, test } from "bun:test";
import { vec3 } from "@ggez/shared";
import { GameplayGame, createTriggerSystemDefinition } from "@ggez/gameplay-runtime";
import { createAudioSystemDefinition } from "./audio-system";
import type { AudioEngine, AudioSourceHandle, PlayAudioRequest } from "./types";

function createMockAudioEngine(): AudioEngine & { played: PlayAudioRequest[]; stopped: string[] } {
  let handleCounter = 0;
  const activeHandles = new Set<string>();
  const played: PlayAudioRequest[] = [];
  const stopped: string[] = [];

  return {
    played,
    stopped,
    dispose() {
      activeHandles.clear();
    },
    isPlaying(handle) {
      return activeHandles.has(handle.id);
    },
    async play(request) {
      handleCounter += 1;
      const handle: AudioSourceHandle = { emitterId: request.src, id: `mock:${handleCounter}` };
      activeHandles.add(handle.id);
      played.push(request);
      return handle;
    },
    setListenerOrientation() {},
    setListenerPosition() {},
    setMasterVolume() {},
    setSourcePosition() {},
    stop(handle) {
      activeHandles.delete(handle.id);
      stopped.push(handle.id);
    },
    stopAll() {
      activeHandles.clear();
      stopped.push("*");
    }
  };
}

describe("AudioSystem", () => {
  test("autoplay emitters start playing on system start", () => {
    const engine = createMockAudioEngine();
    const game = new GameplayGame({
      scene: {
        entities: [],
        nodes: [
          {
            data: {} as never,
            hooks: [
              {
                config: { autoplay: true, loop: true, src: "/sounds/ambient.mp3", volume: 0.5 },
                enabled: true,
                id: "hook:audio:1",
                type: "audio_emitter"
              }
            ],
            id: "node:room",
            kind: "group",
            name: "Room",
            transform: { position: vec3(0, 0, 0), rotation: vec3(0, 0, 0), scale: vec3(1, 1, 1) }
          }
        ]
      },
      systems: [createAudioSystemDefinition({ audioEngine: engine })]
    });

    game.start();
    game.update(0.016);

    expect(engine.played.length).toBe(1);
    expect(engine.played[0].src).toBe("/sounds/ambient.mp3");
    expect(engine.played[0].loop).toBe(true);
    expect(engine.played[0].volume).toBe(0.5);

    game.dispose();
  });

  test("event-triggered emitter plays on matching event", () => {
    const engine = createMockAudioEngine();
    const game = new GameplayGame({
      scene: {
        entities: [],
        nodes: [
          {
            data: {} as never,
            hooks: [
              {
                config: {
                  radius: 5,
                  shape: "sphere",
                  size: [4, 4, 4]
                },
                enabled: true,
                id: "hook:trigger:1",
                type: "trigger_volume"
              },
              {
                config: {
                  src: "/sounds/door-open.mp3",
                  triggerEvent: "trigger.enter",
                  volume: 1
                },
                enabled: true,
                id: "hook:audio:1",
                type: "audio_emitter"
              }
            ],
            id: "node:door",
            kind: "group",
            name: "Door",
            transform: { position: vec3(0, 0, 0), rotation: vec3(0, 0, 0), scale: vec3(1, 1, 1) }
          }
        ]
      },
      systems: [
        createTriggerSystemDefinition(),
        createAudioSystemDefinition({ audioEngine: engine })
      ]
    });

    game.start();

    expect(engine.played.length).toBe(0);

    game.updateActor({ id: "player", position: vec3(0, 0, 0), radius: 0.5 });
    game.update(0.016);

    expect(engine.played.length).toBe(1);
    expect(engine.played[0].src).toBe("/sounds/door-open.mp3");

    game.dispose();
  });

  test("audio.stop_all stops all sounds", () => {
    const engine = createMockAudioEngine();
    const game = new GameplayGame({
      scene: {
        entities: [],
        nodes: [
          {
            data: {} as never,
            hooks: [
              {
                config: { autoplay: true, src: "/sounds/music.mp3" },
                enabled: true,
                id: "hook:audio:1",
                type: "audio_emitter"
              }
            ],
            id: "node:bg",
            kind: "group",
            name: "Background",
            transform: { position: vec3(0, 0, 0), rotation: vec3(0, 0, 0), scale: vec3(1, 1, 1) }
          }
        ]
      },
      systems: [createAudioSystemDefinition({ audioEngine: engine })]
    });

    game.start();
    game.update(0.016);

    expect(engine.played.length).toBe(1);

    game.emitEvent({ event: "audio.stop_all", sourceId: "system", sourceKind: "system" });
    game.update(0.016);

    expect(engine.stopped).toContain("*");

    game.dispose();
  });

  test("disabled hooks are ignored", () => {
    const engine = createMockAudioEngine();
    const game = new GameplayGame({
      scene: {
        entities: [],
        nodes: [
          {
            data: {} as never,
            hooks: [
              {
                config: { autoplay: true, src: "/sounds/test.mp3" },
                enabled: false,
                id: "hook:audio:1",
                type: "audio_emitter"
              }
            ],
            id: "node:test",
            kind: "group",
            name: "Test",
            transform: { position: vec3(0, 0, 0), rotation: vec3(0, 0, 0), scale: vec3(1, 1, 1) }
          }
        ]
      },
      systems: [createAudioSystemDefinition({ audioEngine: engine })]
    });

    game.start();
    game.update(0.016);

    expect(engine.played.length).toBe(0);

    game.dispose();
  });
});
