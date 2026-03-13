import { describe, expect, test } from "bun:test";
import { exportEngineBundle } from "./export-tasks";
import { makeTransform, vec3, type SceneSettings } from "@web-hammer/shared";
import type { SceneDocumentSnapshot } from "@web-hammer/editor-core";

const settings: SceneSettings = {
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
    ambientIntensity: 0.5,
    fogColor: "#000000",
    fogFar: 50,
    fogNear: 10,
    gravity: vec3(0, -9.81, 0),
    physicsEnabled: true
  }
};

describe("exportEngineBundle", () => {
  test("preserves parent ids for grouped runtime exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [
        {
          hooks: [
            {
              config: {
                mode: "slide"
              },
              enabled: true,
              id: "hook:openable:test",
              type: "openable"
            }
          ],
          id: "entity:spawn",
          name: "Spawn",
          parentId: "node:group",
          properties: {},
          transform: makeTransform(vec3(0, 0, 2)),
          type: "player-spawn"
        }
      ],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: makeTransform(vec3(4, 0, 1))
        },
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          id: "node:cube",
          kind: "primitive",
          name: "Cube",
          parentId: "node:group",
          transform: makeTransform(vec3(1, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const group = bundle.manifest.nodes.find((node) => node.id === "node:group");
    const cube = bundle.manifest.nodes.find((node) => node.id === "node:cube");

    expect(bundle.manifest.metadata.version).toBe(4);
    expect(group?.kind).toBe("group");
    expect(cube?.parentId).toBe("node:group");
    expect(bundle.manifest.entities[0]?.parentId).toBe("node:group");
    expect(bundle.manifest.entities[0]?.hooks?.[0]?.type).toBe("openable");
  });

  test("preserves custom gameplay events in exported settings", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [],
      settings: {
        ...settings,
        events: [
          {
            category: "Mission",
            custom: true,
            description: "Raised when the mission objective is updated.",
            id: "event:mission:updated",
            name: "mission.updated",
            scope: "mission"
          }
        ]
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);

    expect(bundle.manifest.settings.events?.[0]?.name).toBe("mission.updated");
  });

  test("preserves node hooks in exported manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          hooks: [
            {
              config: {
                shape: "box",
                size: vec3(3, 1, 3)
              },
              enabled: true,
              id: "hook:trigger:platform",
              type: "trigger_volume"
            },
            {
              actions: [
                {
                  event: "path.start",
                  target: "node:platform",
                  type: "emit"
                }
              ],
              enabled: true,
              id: "hook:sequence:platform",
              trigger: {
                event: "trigger.enter",
                fromEntity: "node:platform"
              },
              type: "sequence"
            },
            {
              config: {
                active: false,
                pathId: "sample:platform-route",
                speed: 1.5
              },
              enabled: true,
              id: "hook:path:platform",
              type: "path_mover"
            }
          ],
          id: "node:platform",
          kind: "group",
          name: "Platform",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const platform = bundle.manifest.nodes.find((node) => node.id === "node:platform");

    expect(platform?.hooks).toHaveLength(3);
    expect(platform?.hooks?.map((hook) => hook.type)).toEqual(["trigger_volume", "sequence", "path_mover"]);
  });
});
