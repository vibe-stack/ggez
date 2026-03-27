import { describe, expect, test } from "bun:test";
import { vec3 } from "@ggez/shared";
import {
  CRASHCAT_BROADPHASE_LAYER_MOVING,
  CRASHCAT_BROADPHASE_LAYER_STATIC,
  CRASHCAT_OBJECT_LAYER_MOVING,
  CRASHCAT_OBJECT_LAYER_STATIC,
  createCrashcatPhysicsWorld,
  createCrashcatShapeFromRuntimePhysics,
  createRuntimePhysicsDescriptors
} from "./index";

describe("runtime-physics-crashcat", () => {
  test("creates default world layers for moving and static bodies", () => {
    const world = createCrashcatPhysicsWorld({
      world: {
        gravity: vec3(0, -9.81, 0)
      }
    } as never);

    expect(world.settings.layers.broadphaseLayers).toBe(2);
    expect(world.settings.layers.objectLayers).toBe(2);
    expect(world.settings.layers.objectLayerToBroadphaseLayer[CRASHCAT_OBJECT_LAYER_MOVING]).toBe(CRASHCAT_BROADPHASE_LAYER_MOVING);
    expect(world.settings.layers.objectLayerToBroadphaseLayer[CRASHCAT_OBJECT_LAYER_STATIC]).toBe(CRASHCAT_BROADPHASE_LAYER_STATIC);
  });

  test("creates runtime physics descriptors from a runtime scene", () => {
    const descriptors = createRuntimePhysicsDescriptors({
      nodes: [
        {
          data: {
            physics: {
              angularDamping: 0,
              bodyType: "dynamic",
              canSleep: true,
              ccd: false,
              colliderShape: "cuboid",
              contactSkin: 0,
              enabled: true,
              friction: 0.5,
              gravityScale: 1,
              linearDamping: 0,
              lockRotations: false,
              lockTranslations: false,
              restitution: 0,
              sensor: false
            },
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          geometry: { primitives: [] },
          id: "node:cube",
          kind: "primitive",
          name: "Cube",
          transform: {
            position: vec3(0, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        }
      ]
    });

    expect(descriptors).toHaveLength(1);
    expect(createCrashcatShapeFromRuntimePhysics(descriptors[0]!)).toBeDefined();
  });
});
