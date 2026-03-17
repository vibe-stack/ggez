import { describe, expect, test } from "bun:test";
import { vec3 } from "@web-hammer/shared";
import { createRuntimeWorldManager, distanceToChunkBounds } from "./index";

describe("runtime-streaming", () => {
  test("computes distance to chunk bounds", () => {
    expect(distanceToChunkBounds([0, 0, 0, 10, 10, 10], vec3(5, 5, 5))).toBe(0);
    expect(distanceToChunkBounds([0, 0, 0, 10, 10, 10], vec3(15, 5, 5))).toBe(5);
  });

  test("loads and unloads chunks from focus updates", async () => {
    const loaded: string[] = [];
    const unloaded: string[] = [];
    const manager = createRuntimeWorldManager({
      async loadChunk(chunk) {
        loaded.push(chunk.id);
        return chunk.id;
      },
      async unloadChunk(chunk) {
        unloaded.push(chunk.id);
      },
      worldIndex: {
        chunks: [
          {
            bounds: [0, 0, 0, 10, 10, 10],
            id: "hub",
            loadDistance: 5,
            unloadDistance: 8
          }
        ],
        version: 1
      }
    });

    await manager.updateStreamingFocus(vec3(6, 5, 6));
    expect(loaded).toEqual(["hub"]);
    await manager.updateStreamingFocus(vec3(30, 5, 30));
    expect(unloaded).toEqual(["hub"]);
  });
});
