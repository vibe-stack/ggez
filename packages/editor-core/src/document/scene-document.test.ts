import { describe, expect, test } from "bun:test";
import { createSceneDocumentSnapshot, createSeedSceneDocument } from "./scene-document";

describe("createSeedSceneDocument", () => {
  test("seeds only material and layer defaults", () => {
    const scene = createSeedSceneDocument();

    expect(scene.layers.size).toBeGreaterThan(0);
    expect(scene.materials.size).toBeGreaterThan(0);
    expect(scene.assets.size).toBe(0);
  });

  test("normalizes material texture data urls into texture library references", () => {
    const scene = createSeedSceneDocument();
    scene.setMaterial({
      color: "#ffffff",
      colorTexture: "data:image/png;base64,AAAA",
      id: "material:test",
      name: "Test"
    });

    const snapshot = createSceneDocumentSnapshot(scene);

    expect(snapshot.textures).toHaveLength(1);
    expect(snapshot.textures[0]?.dataUrl).toBe("data:image/png;base64,AAAA");
    expect(snapshot.materials.find((material) => material.id === "material:test")?.colorTexture).toBe("texture:material:test:colorTexture");
    expect(scene.materials.get("material:test")?.colorTexture).toBe("texture:material:test:colorTexture");
  });
});
