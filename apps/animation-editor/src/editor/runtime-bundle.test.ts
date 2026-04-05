import { strFromU8, unzipSync } from "fflate";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import { parseAnimationArtifactJson, parseClipDataBinary } from "@ggez/anim-exporter";
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

function createAdvancedRuntimeDocument(): AnimationEditorDocument {
  return {
    version: 1,
    name: "Advanced Runtime Nodes",
    entryGraphId: "graph-main",
    parameters: [
      { id: "param-speed", name: "locomotionSpeed", type: "float", defaultValue: 2 },
      { id: "param-yaw", name: "yawOffset", type: "float", defaultValue: 0 }
    ],
    clips: [
      { id: "idle", name: "Idle", duration: 1, source: "hero.glb" }
    ],
    masks: [],
    dynamicsProfiles: [
      {
        id: "profile-secondary",
        name: "Secondary",
        iterations: 4,
        chains: [
          {
            id: "chain-spine",
            name: "Spine Chain",
            rootBoneName: "spine",
            tipBoneName: "head",
            damping: 0.82,
            stiffness: 0.2,
            gravityScale: 0.35,
            inertia: { x: 0.35, y: 0.15, z: 0.5 },
            limitAngleRadians: Math.PI / 3,
            enabled: true
          }
        ],
        sphereColliders: [
          {
            id: "collider-hips",
            name: "Hips Collider",
            boneName: "hips",
            offset: { x: 0, y: 0, z: 0 },
            radius: 0.2,
            enabled: true
          }
        ]
      }
    ],
    rig: {
      boneNames: [
        "root",
        "hips",
        "spine",
        "head",
        "leftUpperLeg",
        "leftLowerLeg",
        "leftFoot",
        "rightUpperLeg",
        "rightLowerLeg",
        "rightFoot"
      ],
      parentIndices: [-1, 0, 1, 2, 1, 4, 5, 1, 7, 8],
      rootBoneIndex: 0,
      bindTranslations: [
        0, 0, 0,
        0, 1, 0,
        0, 0.5, 0,
        0, 0.5, 0,
        -0.3, -0.4, 0.1,
        0, -0.7, 0,
        0, -0.7, 0.15,
        0.3, -0.4, 0.1,
        0, -0.7, 0,
        0, -0.7, 0.15
      ],
      bindRotations: [
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1,
        0, 0, 0, 1
      ],
      bindScales: [
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        1, 1, 1
      ]
    },
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
            id: "node-orientation",
            name: "Orientation Warp",
            kind: "orientationWarp",
            sourceNodeId: "clip-idle",
            angleParameterId: "param-yaw",
            maxAngle: Math.PI / 2,
            weight: 1,
            hipBoneName: "hips",
            hipWeight: 0.35,
            spineBoneNames: ["spine"],
            legs: [
              { upperBoneName: "leftUpperLeg", lowerBoneName: "leftLowerLeg", footBoneName: "leftFoot", weight: 1 },
              { upperBoneName: "rightUpperLeg", lowerBoneName: "rightLowerLeg", footBoneName: "rightFoot", weight: 1 }
            ],
            position: { x: 180, y: 0 }
          },
          {
            id: "node-stride",
            name: "Stride Warp",
            kind: "strideWarp",
            sourceNodeId: "node-orientation",
            evaluationMode: "graph",
            locomotionSpeedParameterId: "param-speed",
            strideDirection: { x: 0, y: 1 },
            manualStrideScale: 1,
            minLocomotionSpeedThreshold: 0.01,
            pelvisBoneName: "hips",
            pelvisWeight: 0.2,
            clampResult: false,
            minStrideScale: 0.5,
            maxStrideScale: 2,
            interpResult: false,
            interpSpeedIncreasing: 6,
            interpSpeedDecreasing: 6,
            legs: [
              { upperBoneName: "leftUpperLeg", lowerBoneName: "leftLowerLeg", footBoneName: "leftFoot", weight: 1 },
              { upperBoneName: "rightUpperLeg", lowerBoneName: "rightLowerLeg", footBoneName: "rightFoot", weight: 1 }
            ],
            position: { x: 360, y: 0 }
          },
          {
            id: "node-secondary",
            name: "Secondary Dynamics",
            kind: "secondaryDynamics",
            sourceNodeId: "node-stride",
            profileId: "profile-secondary",
            weight: 1,
            dampingScale: 1,
            stiffnessScale: 1,
            gravityScale: 1,
            iterations: 4,
            position: { x: 540, y: 0 }
          },
          {
            id: "out",
            name: "Output",
            kind: "output",
            sourceNodeId: "node-secondary",
            position: { x: 720, y: 0 }
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

describe("runtime bundle export", () => {
  it("includes exported equipment manifests and GLBs in runtime bundles", async () => {
    const equipmentBytes = new Uint8Array([5, 6, 7, 8]);
    const result = await createRuntimeBundleSyncResult({
      characterFile: null,
      equipmentBundle: {
        sockets: [{ id: "hand", name: "Hand", boneName: "Hand.R" }],
        items: [
          {
            id: "sword",
            name: "Sword",
            socketId: "hand",
            enabled: true,
            transform: {
              position: [1, 2, 3],
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
      ],
      folderName: "player-locomotion",
      importedClips: [createImportedClip()],
      sourceDocument: createDocument(),
      title: "Player Locomotion"
    });

    const manifestFile = result.files.find((file) => file.path === "animation.bundle.json");
    const equipmentFile = result.files.find((file) => file.path === "assets/equipment-sword-sword.glb");
    const manifest = JSON.parse(new TextDecoder().decode(Uint8Array.from(manifestFile?.bytes ?? []))) as {
      clipData?: string;
      equipment?: {
        sockets: Array<{ boneName: string }>;
        items: Array<{ asset?: string; socketId: string | null; transform: { position: [number, number, number] } }>;
      };
    };

    expect(manifest.equipment?.sockets[0]?.boneName).toEqual("Hand.R");
    expect(manifest.equipment?.items[0]?.socketId).toEqual("hand");
    expect(manifest.equipment?.items[0]?.asset).toEqual("./assets/equipment-sword-sword.glb");
    expect(manifest.equipment?.items[0]?.transform.position).toEqual([1, 2, 3]);
    expect(manifest.clipData).toEqual("./assets/graph.animation.clips.bin");
    expect(equipmentFile?.mimeType).toEqual("model/gltf-binary");
    expect(equipmentFile?.bytes).toEqual(Array.from(equipmentBytes));
  });

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
      equipmentBundle: {
        sockets: [],
        items: []
      },
      importedClips: [createImportedClip()],
      sourceDocument: createDocument()
    });

    const archive = unzipSync(result.bytes);
    const indexText = strFromU8(archive["animations/player-locomotion/index.ts"]!);

    expect(indexText).toContain('manifestLoader: () => import("./animation.bundle.json")');
    expect(indexText).toContain('artifactLoader: () => import("./graph.animation.json?raw")');
  });

  it("keeps graph artifacts slim and moves embedded clip samples into binary clip data", async () => {
    const result = await createRuntimeBundleSyncResult({
      characterFile: null,
      folderName: "player-locomotion",
      importedClips: [createImportedClip()],
      sourceDocument: createDocument(),
      title: "Player Locomotion"
    });

    const artifactFile = result.files.find((file) => file.path === "graph.animation.json");
    const clipDataFile = result.files.find((file) => file.path === "assets/graph.animation.clips.bin");
    const artifact = parseAnimationArtifactJson(new TextDecoder().decode(Uint8Array.from(artifactFile?.bytes ?? [])));
    const clips = parseClipDataBinary(Uint8Array.from(clipDataFile?.bytes ?? []));

    expect(artifact.clips).toEqual([]);
    expect(clips).toEqual([
      {
        id: "idle",
        name: "Idle",
        duration: 1,
        rootBoneIndex: undefined,
        tracks: []
      }
    ]);
  });

  it("preserves advanced runtime nodes and compiled dynamics data in exported graph artifacts", async () => {
    const result = await createRuntimeBundleSyncResult({
      characterFile: null,
      folderName: "advanced-runtime-nodes",
      importedClips: [createImportedClip()],
      sourceDocument: createAdvancedRuntimeDocument(),
      title: "Advanced Runtime Nodes"
    });

    const artifactFile = result.files.find((file) => file.path === "graph.animation.json");
    const clipDataFile = result.files.find((file) => file.path === "assets/graph.animation.clips.bin");
    const artifact = parseAnimationArtifactJson(new TextDecoder().decode(Uint8Array.from(artifactFile?.bytes ?? [])));
    const clips = parseClipDataBinary(Uint8Array.from(clipDataFile?.bytes ?? []));
    const compiledNodes = artifact.graph.graphs[0]?.nodes ?? [];

    expect(artifact.rig?.boneNames).toEqual([
      "root",
      "hips",
      "spine",
      "head",
      "leftUpperLeg",
      "leftLowerLeg",
      "leftFoot",
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot"
    ]);
    expect(artifact.graph.dynamicsProfiles).toEqual([
      {
        name: "Secondary",
        iterations: 4,
        chains: [
          {
            name: "Spine Chain",
            boneIndices: [2, 3],
            restLengths: [0.0001],
            damping: 0.82,
            stiffness: 0.2,
            gravityScale: 0.35,
            inertia: { x: 0.35, y: 0.15, z: 0.5 },
            limitAngleRadians: Math.PI / 3,
            enabled: true
          }
        ],
        sphereColliders: [
          {
            name: "Hips Collider",
            boneIndex: 1,
            offset: { x: 0, y: 0, z: 0 },
            radius: 0.2,
            enabled: true
          }
        ]
      }
    ]);
    expect(compiledNodes.map((node) => node.type)).toEqual([
      "clip",
      "orientationWarp",
      "strideWarp",
      "secondaryDynamics"
    ]);
    expect(compiledNodes[1]).toEqual({
      type: "orientationWarp",
      sourceNodeIndex: 0,
      parameterIndex: 1,
      maxAngle: Math.PI / 2,
      weight: 1,
      hipBoneIndex: 1,
      hipWeight: 0.35,
      spineBoneIndices: [2],
      legs: [
        { upperBoneIndex: 4, lowerBoneIndex: 5, footBoneIndex: 6, weight: 1 },
        { upperBoneIndex: 7, lowerBoneIndex: 8, footBoneIndex: 9, weight: 1 }
      ]
    });
    expect(compiledNodes[2]).toEqual({
      type: "strideWarp",
      sourceNodeIndex: 1,
      evaluationMode: "graph",
      locomotionSpeedParameterIndex: 0,
      strideDirection: { x: 0, y: 1 },
      manualStrideScale: 1,
      minLocomotionSpeedThreshold: 0.01,
      pelvisBoneIndex: 1,
      pelvisWeight: 0.2,
      clampResult: false,
      minStrideScale: 0.5,
      maxStrideScale: 2,
      interpResult: false,
      interpSpeedIncreasing: 6,
      interpSpeedDecreasing: 6,
      legs: [
        { upperBoneIndex: 4, lowerBoneIndex: 5, footBoneIndex: 6, weight: 1 },
        { upperBoneIndex: 7, lowerBoneIndex: 8, footBoneIndex: 9, weight: 1 }
      ]
    });
    expect(compiledNodes[3]).toEqual({
      type: "secondaryDynamics",
      sourceNodeIndex: 2,
      profileIndex: 0,
      weight: 1,
      dampingScale: 1,
      stiffnessScale: 1,
      gravityScale: 1,
      iterations: 4
    });
    expect(artifact.clips).toEqual([]);
    expect(clips[0]).toEqual({
      id: "idle",
      name: "Idle",
      duration: 1,
      rootBoneIndex: undefined,
      tracks: []
    });
  });
});
