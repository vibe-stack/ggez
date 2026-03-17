import { describe, expect, test } from "bun:test";
import { vec3 } from "@web-hammer/shared";
import { createRapierColliderDescFromRuntimePhysics, createRuntimePhysicsDescriptors } from "./index";

describe("runtime-physics-rapier", () => {
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
    expect(createRapierColliderDescFromRuntimePhysics(descriptors[0]!)).toBeDefined();
  });
});
