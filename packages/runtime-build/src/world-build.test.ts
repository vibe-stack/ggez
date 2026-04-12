import { describe, expect, test } from "bun:test";
import { createSeedSceneDocument } from "@ggez/editor-core";
import { createSceneDocumentSnapshot } from "@ggez/editor-core";
import { makeTransform, vec3 } from "@ggez/shared";
import { buildRuntimeWorldBundleFromWorld } from "./world-build";
import { createWorldBundleFromLegacyScene } from "@ggez/editor-core";

describe("world export pipeline", () => {
  test("builds chunked runtime output and world index", async () => {
    const scene = createSeedSceneDocument();
    scene.addNode({
      data: {},
      id: "node:runtime",
      kind: "group",
      name: "Runtime Root",
      transform: makeTransform(vec3(3, 0, 4))
    });

    const bundle = createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(scene));
    const runtimeWorld = await buildRuntimeWorldBundleFromWorld(bundle);

    expect(runtimeWorld.index.chunks).toHaveLength(1);
    expect(runtimeWorld.index.chunks[0]?.manifestUrl).toContain("chunks/partition:main/scene.runtime.json");
    expect(runtimeWorld.files.some((file) => file.path === "chunks/partition:main/scene.runtime.json")).toBeTrue();
  });
});
