import { strFromU8, unzipSync } from "fflate";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import type { ImportedPreviewClip } from "./preview-assets";
import { createRuntimeBundleSyncResult, createRuntimeBundleZip } from "./runtime-bundle";

declare const describe: (name: string, body: () => void) => void;
declare const it: (name: string, body: () => Promise<void> | void) => void;
declare const expect: (value: unknown) => {
  toContain(expected: unknown): void;
  toEqual(expected: unknown): void;
};

function createDocument(): AnimationEditorDocument {
  return {
    version: 1,
    name: "Player Locomotion",
    entryGraphId: "graph-main",
    parameters: [],
    clips: [
      { id: "idle", name: "Idle", duration: 1, source: "hero.glb" }
    ],
    masks: [],
    graphs: [
      {
        id: "graph-main",
        name: "Main",
        outputNodeId: "out",
        edges: [],
        nodes: [
          {
            id: "clip-idle",
            name: "Idle",
            kind: "clip",
            clipId: "idle",
            speed: 1,
            loop: true,
            inPlace: false,
            position: { x: 0, y: 0 }
          },
          {
            id: "out",
            name: "Output",
            kind: "output",
            sourceNodeId: "clip-idle",
            position: { x: 160, y: 0 }
          }
        ]
      }
    ],
    layers: [
      {
        id: "layer-base",
        name: "Base",
        graphId: "graph-main",
        weight: 1,
        blendMode: "override",
        rootMotionMode: "full",
        enabled: true
      }
    ]
  };
}

function createImportedClip(): ImportedPreviewClip {
  return {
    id: "idle",
    name: "Idle",
    duration: 1,
    source: "hero.glb",
    asset: {
      id: "idle",
      name: "Idle",
      duration: 1,
      tracks: []
    },
    reference: {
      id: "idle",
      name: "Idle",
      duration: 1,
      source: "hero.glb"
    }
  };
}

describe("runtime bundle export", () => {
  it("writes an index.ts entry module for sync/export bundles", async () => {
    const result = await createRuntimeBundleSyncResult({
      characterFile: null,
      folderName: "player-locomotion",
      importedClips: [createImportedClip()],
      sourceDocument: createDocument(),
      title: "Player Locomotion"
    });

    const indexFile = result.files.find((file) => file.path === "index.ts");

    expect(Boolean(indexFile)).toEqual(true);
    expect(indexFile?.mimeType).toEqual("text/plain");

    const indexText = new TextDecoder().decode(Uint8Array.from(indexFile?.bytes ?? []));
    expect(indexText).toContain("createColocatedRuntimeAnimationSource");
    expect(indexText).toContain('id: "player-locomotion"');
    expect(indexText).toContain('title: "Player Locomotion"');
  });

  it("packs the generated index.ts into the runtime zip", async () => {
    const result = await createRuntimeBundleZip({
      characterFile: null,
      importedClips: [createImportedClip()],
      sourceDocument: createDocument()
    });

    const archive = unzipSync(result.bytes);
    const indexText = strFromU8(archive["animations/player-locomotion/index.ts"]!);

    expect(indexText).toContain('manifestLoader: () => import("./animation.bundle.json")');
    expect(indexText).toContain('artifactLoader: () => import("./graph.animation.json?raw")');
  });
});
