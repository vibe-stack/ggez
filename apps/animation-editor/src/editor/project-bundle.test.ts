import { strFromU8, unzipSync } from "fflate";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import {
  createProjectBundleArchive,
  parseProjectBundleFile,
} from "./project-bundle";

declare const describe: (name: string, body: () => void) => void;
declare const it: (name: string, body: () => Promise<void> | void) => void;
declare const expect: (value: unknown) => {
  toEqual(expected: unknown): void;
};

function createDocument(): AnimationEditorDocument {
  return {
    version: 1,
    name: "Locomotion",
    entryGraphId: "graph-main",
    parameters: [],
    clips: [],
    masks: [],
    dynamicsProfiles: [],
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

function toBase64(bytes: Uint8Array): string {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

async function readFileBytes(file: File): Promise<number[]> {
  return Array.from(new Uint8Array(await file.arrayBuffer()));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("project bundle", () => {
  it("stores character and equipment GLBs as linked files in the saved archive", async () => {
    const characterBytes = new Uint8Array([1, 2, 3, 4]);
    const equipmentBytes = new Uint8Array([5, 6, 7, 8]);
    const archiveBytes = await createProjectBundleArchive({
      document: createDocument(),
      characterFile: new File([characterBytes], "hero.glb", { type: "model/gltf-binary" }),
      clips: [
        {
          id: "idle",
          name: "Idle",
          duration: 1,
          tracks: []
        }
      ],
      equipmentBundle: {
        sockets: [{ id: "hand", name: "Hand", boneName: "Hand.R" }],
        items: [
          {
            id: "sword",
            name: "Sword",
            socketId: "hand",
            enabled: true,
            transform: {
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1]
            }
          }
        ]
      },
      equipmentFiles: [
        {
          id: "sword",
          file: new File([equipmentBytes], "sword.glb", { type: "model/gltf-binary" })
        }
      ]
    });

    const archive = unzipSync(archiveBytes);
    const manifest = JSON.parse(strFromU8(archive["project.ggezanimproj.json"]!)) as {
      assets: {
        characterFile?: { path: string; dataBase64?: string };
        equipmentFiles?: Array<{ path: string; dataBase64?: string }>;
      };
    };

    expect(Boolean(manifest.assets.characterFile?.path)).toEqual(true);
    expect("dataBase64" in (manifest.assets.characterFile ?? {})).toEqual(false);
    expect(Boolean(manifest.assets.equipmentFiles?.[0]?.path)).toEqual(true);
    expect("dataBase64" in (manifest.assets.equipmentFiles?.[0] ?? {})).toEqual(false);
    expect(Array.from(archive[manifest.assets.characterFile!.path]!)).toEqual(Array.from(characterBytes));
    expect(Array.from(archive[manifest.assets.equipmentFiles![0]!.path]!)).toEqual(Array.from(equipmentBytes));

    const restored = await parseProjectBundleFile(new File([toArrayBuffer(archiveBytes)], "locomotion.ggezanimproj.zip", { type: "application/zip" }));

    expect(restored.characterFile?.name).toEqual("hero.glb");
    expect(restored.equipmentFiles.map((file) => file.id)).toEqual(["sword"]);
    expect(restored.clips.map((clip) => clip.id)).toEqual(["idle"]);
    expect(restored.characterFile ? await readFileBytes(restored.characterFile) : []).toEqual(Array.from(characterBytes));
    expect(await readFileBytes(restored.equipmentFiles[0]!.file)).toEqual(Array.from(equipmentBytes));
  });

  it("still imports legacy embedded-json bundles", async () => {
    const characterBytes = new Uint8Array([9, 10, 11]);
    const legacyJson = JSON.stringify({
      format: "ggez.animation.editor.project",
      version: 1,
      document: createDocument(),
      assets: {
        characterFile: {
          name: "legacy-character.glb",
          type: "model/gltf-binary",
          dataBase64: toBase64(characterBytes)
        },
        clips: [
          {
            id: "walk",
            name: "Walk",
            duration: 1.5,
            tracks: []
          }
        ]
      },
      extension: {
        equipment: {
          sockets: [],
          items: []
        }
      }
    });

    const restored = await parseProjectBundleFile(new File([legacyJson], "legacy.ggezanimproj.json", { type: "application/json" }));

    expect(restored.document.name).toEqual("Locomotion");
    expect(restored.clips.map((clip) => clip.id)).toEqual(["walk"]);
    expect(restored.characterFile?.name).toEqual("legacy-character.glb");
    expect(restored.characterFile ? await readFileBytes(restored.characterFile) : []).toEqual(Array.from(characterBytes));
  });
});
