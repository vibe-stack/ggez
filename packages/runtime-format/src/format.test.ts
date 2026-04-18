import { describe, expect, test } from "bun:test";
import { makeTransform, vec3 } from "@ggez/shared";
import runtimeSceneV4 from "./__fixtures__/runtime-scene.v4.json";
import {
  CURRENT_RUNTIME_SCENE_VERSION,
  CURRENT_RUNTIME_WORLD_INDEX_VERSION,
  isRuntimeScene,
  parseRuntimeScene,
  parseRuntimeWorldIndex,
  validateRuntimeScene,
  type RuntimeScene
} from "./index";

function createScene(version = CURRENT_RUNTIME_SCENE_VERSION): RuntimeScene {
  return {
    assets: [],
    entities: [],
    layers: [],
    materials: [],
    metadata: {
      exportedAt: "2026-03-17T10:00:00.000Z",
      format: "web-hammer-engine",
      version
    },
    nodes: [
      {
        data: {},
        id: "node:test",
        kind: "group",
        name: "Test",
        transform: makeTransform(vec3(0, 0, 0))
      }
    ],
    settings: {
      player: {
        cameraMode: "fps",
        canCrouch: true,
        canInteract: true,
        canJump: true,
        canRun: true,
        crouchHeight: 1.2,
        height: 1.8,
        interactKey: "KeyE",
        jumpHeight: 1,
        movementSpeed: 4,
        runningSpeed: 6
      },
      world: {
        ambientColor: "#ffffff",
        ambientIntensity: 0,
        fogColor: "#000000",
        fogFar: 0,
        fogNear: 0,
        gravity: vec3(0, -9.81, 0),
        lod: {
          enabled: true,
          levels: [
            { distance: 24, id: "mid", label: "Mid" },
            { distance: 64, id: "low", label: "Low" }
          ]
        },
        physicsEnabled: true,
        skybox: {
          affectsLighting: false,
          blur: 0,
          enabled: false,
          format: "image",
          intensity: 1,
          lightingIntensity: 1,
          name: "",
          source: ""
        }
      }
    }
  };
}

describe("runtime-format", () => {
  test("parses and migrates older runtime scenes", () => {
    const parsed = parseRuntimeScene(JSON.stringify(createScene(4)));

    expect(parsed.metadata.version).toBe(CURRENT_RUNTIME_SCENE_VERSION);
    expect(isRuntimeScene(parsed)).toBe(true);
  });

  test("migrates file fixtures from older runtime scene versions", () => {
    const parsed = parseRuntimeScene(JSON.stringify(runtimeSceneV4));

    expect(parsed.metadata.version).toBe(CURRENT_RUNTIME_SCENE_VERSION);
    expect(parsed.nodes[0]?.id).toBe("node:test");
  });

  test("normalizes runtime scene settings during parse", () => {
    const parsed = parseRuntimeScene(
      JSON.stringify({
        ...createScene(),
        settings: {
          player: {
            cameraMode: "fps",
            canCrouch: true,
            canJump: true,
            canRun: true,
            crouchHeight: 1.2,
            height: 1.8,
            jumpHeight: 1,
            movementSpeed: 4,
            runningSpeed: 6
          },
          world: {
            ambientColor: "#ffffff",
            ambientIntensity: 0,
            fogColor: "#000000",
            fogFar: 0,
            fogNear: 0,
            gravity: vec3(0, -9.81, 0),
            lod: {
              enabled: true,
              lowDetailRatio: 0.2,
              midDetailRatio: 0.5
            },
            physicsEnabled: true,
            skybox: {
              affectsLighting: false,
              blur: 0,
              enabled: false,
              format: "image",
              intensity: 1,
              lightingIntensity: 1,
              name: "",
              source: ""
            }
          }
        }
      })
    );

    expect(parsed.settings.events).toEqual([]);
    expect(parsed.settings.paths).toEqual([]);
    expect(parsed.settings.player.canInteract).toBe(true);
    expect(parsed.settings.player.interactKey).toBe("KeyE");
    expect(parsed.settings.world.toneMapping).toBe("aces");
    expect(parsed.settings.world.lod.enabled).toBe(true);
    expect(parsed.settings.world.lod.levels.map((level) => level.id)).toEqual(["mid", "low"]);
  });

  test("validates missing runtime scene structure", () => {
    const result = validateRuntimeScene({
      metadata: {
        format: "web-hammer-engine",
        version: 6
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("parses world index contracts", () => {
    const worldIndex = parseRuntimeWorldIndex(
      JSON.stringify({
        chunks: [
          {
            bounds: [-1, 0, -1, 1, 2, 1],
            id: "hub",
            manifestUrl: "/world/chunks/hub/scene.runtime.json"
          }
        ],
        version: CURRENT_RUNTIME_WORLD_INDEX_VERSION
      })
    );

    expect(worldIndex.chunks[0]?.id).toBe("hub");
  });
});
