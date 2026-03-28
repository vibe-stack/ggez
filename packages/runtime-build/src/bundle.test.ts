import { describe, expect, test } from "bun:test";
import { makeTransform, vec3 } from "@ggez/shared";
import { CURRENT_RUNTIME_SCENE_VERSION, type RuntimeScene } from "@ggez/runtime-format";
import { buildRuntimeWorldIndex, externalizeRuntimeAssets, packRuntimeBundle, unpackRuntimeBundle } from "./index";

const runtimeScene: RuntimeScene = {
  assets: [],
  entities: [],
  layers: [],
  materials: [
    {
      baseColorTexture:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII=",
      color: "#ffffff",
      emissiveColor: "#ff6600",
      emissiveIntensity: 0.75,
      id: "material:test",
      metallicFactor: 0,
      name: "Test",
      opacity: 0.42,
      roughnessFactor: 1,
      transparent: true
    }
  ],
  metadata: {
    exportedAt: "2026-03-17T10:00:00.000Z",
    format: "web-hammer-engine",
    version: CURRENT_RUNTIME_SCENE_VERSION
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
        bakedAt: "",
        enabled: false,
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
};

describe("runtime-build", () => {
  test("externalizes and repacks runtime bundles", async () => {
    const bundle = await externalizeRuntimeAssets(runtimeScene);
    const bytes = packRuntimeBundle(bundle);
    const unpacked = unpackRuntimeBundle(bytes);

    expect(unpacked.manifest.materials[0]?.baseColorTexture).toBe("assets/textures/material-test-color.png");
    expect(unpacked.manifest.materials[0]?.emissiveColor).toBe("#ff6600");
    expect(unpacked.manifest.materials[0]?.emissiveIntensity).toBe(0.75);
    expect(unpacked.manifest.materials[0]?.opacity).toBe(0.42);
    expect(unpacked.manifest.materials[0]?.transparent).toBe(true);
    expect(unpacked.files).toHaveLength(1);
  });

  test("builds world index documents", () => {
    const worldIndex = buildRuntimeWorldIndex([
      {
        bounds: [-10, 0, -10, 10, 10, 10],
        id: "hub",
        manifestUrl: "/world/chunks/hub/scene.runtime.json"
      }
    ]);

    expect(worldIndex.chunks[0]?.id).toBe("hub");
  });
});
