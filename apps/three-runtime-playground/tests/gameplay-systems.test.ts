import { describe, expect, test } from "bun:test";
import { createGameplayRuntime } from "@web-hammer/gameplay-runtime";
import { createDefaultSceneSettings, makeTransform, vec3, type GeometryNode } from "@web-hammer/shared";
import { createPlaybackGameplaySystems, type PlaybackGameplaySystemsState } from "../src/gameplay-systems";

const enabledSystems: PlaybackGameplaySystemsState = {
  mover: false,
  openable: false,
  pathMover: true,
  sequence: false,
  trigger: false
};

describe("createPlaybackGameplaySystems", () => {
  test("uses the current scene path definitions when creating path movers", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            active: true,
            loop: false,
            pathId: "scene:path",
            speed: 1,
            stopAtEnd: true
          },
          id: "hook:path",
          type: "path_mover"
        }
      ],
      id: "node:platform",
      kind: "group",
      name: "Platform",
      transform: makeTransform(vec3(0, 0, 0))
    };
    const initialSettings = createDefaultSceneSettings();
    const updatedSettings = createDefaultSceneSettings();

    initialSettings.paths = [
      {
        id: "scene:path",
        loop: false,
        name: "Initial",
        points: [vec3(0, 0, 0), vec3(0, 0, 2)]
      }
    ];
    updatedSettings.paths = [
      {
        id: "scene:path",
        loop: false,
        name: "Updated",
        points: [vec3(0, 0, 0), vec3(0, 0, 6)]
      }
    ];

    const initialRuntime = createGameplayRuntime({
      scene: {
        entities: [],
        nodes: [node]
      },
      systems: createPlaybackGameplaySystems({ settings: initialSettings }, enabledSystems)
    });
    const updatedRuntime = createGameplayRuntime({
      scene: {
        entities: [],
        nodes: [node]
      },
      systems: createPlaybackGameplaySystems({ settings: updatedSettings }, enabledSystems)
    });

    initialRuntime.start();
    updatedRuntime.start();
    initialRuntime.update(0.5);
    updatedRuntime.update(0.5);

    expect(initialRuntime.getNodeWorldTransform(node.id)?.position.z).toBeCloseTo(1, 4);
    expect(updatedRuntime.getNodeWorldTransform(node.id)?.position.z).toBeCloseTo(3, 4);
  });
});
