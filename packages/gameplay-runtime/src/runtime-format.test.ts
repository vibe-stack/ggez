import { describe, expect, test } from "bun:test";
import { vec3 } from "@web-hammer/shared";
import { createGameplayRuntimeSceneFromRuntimeScene } from "./runtime-format";

describe("createGameplayRuntimeSceneFromRuntimeScene", () => {
  test("adapts runtime scenes without renderer dependencies", () => {
    const gameplayScene = createGameplayRuntimeSceneFromRuntimeScene({
      entities: [],
      nodes: [
        {
          data: {},
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: {
            position: vec3(0, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        }
      ]
    });

    expect(gameplayScene.nodes[0]?.id).toBe("node:group");
  });
});
