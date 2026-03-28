import { describe, expect, test } from "bun:test";
import { createSeedSceneDocument } from "./scene-document";

describe("createSeedSceneDocument", () => {
  test("seeds only material and layer defaults", () => {
    const scene = createSeedSceneDocument();

    expect(scene.layers.size).toBeGreaterThan(0);
    expect(scene.materials.size).toBeGreaterThan(0);
    expect(scene.assets.size).toBe(0);
  });
});