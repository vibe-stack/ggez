import { describe, expect, it } from "bun:test";
import type { CompiledAnimatorGraph } from "@ggez/anim-schema";
import {
  createAnimationArtifact,
  createAnimationBundle,
  parseAnimationArtifactJson,
  parseAnimationBundleJson,
  parseClipDataBinary,
  serializeAnimationArtifact,
  serializeAnimationBundle,
  serializeClipDataBinary
} from "./exporter";

describe("@ggez/anim-exporter", () => {
  it("preserves transition blend settings in serialized artifacts", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Transition Artifact",
      parameters: [{ name: "moving", type: "bool", defaultValue: false }],
      clipSlots: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "walk", name: "Walk", duration: 1 }
      ],
      masks: [],
      dynamicsProfiles: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 2,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false },
            {
              type: "stateMachine",
              machineIndex: 0,
              entryStateIndex: 0,
              states: [
                { name: "Idle", motionNodeIndex: 0, speed: 1, cycleOffset: 0 },
                { name: "Walk", motionNodeIndex: 1, speed: 1, cycleOffset: 0 }
              ],
              transitions: [
                {
                  fromStateIndex: 0,
                  toStateIndex: 1,
                  duration: 0.25,
                  blendCurve: "ease-out",
                  syncNormalizedTime: true,
                  hasExitTime: false,
                  interruptionSource: "current",
                  conditions: [{ parameterIndex: 0, operator: "==", value: true }]
                }
              ],
              anyStateTransitions: []
            }
          ]
        }
      ],
      layers: [
        {
          name: "Base",
          graphIndex: 0,
          weight: 1,
          blendMode: "override",
          rootMotionMode: "none",
          enabled: true
        }
      ],
      entryGraphIndex: 0
    };

    const artifact = createAnimationArtifact({ graph });
    const parsed = parseAnimationArtifactJson(serializeAnimationArtifact(artifact));
    const transition = parsed.graph.graphs[0]?.nodes[2]?.type === "stateMachine"
      ? parsed.graph.graphs[0].nodes[2].transitions[0]
      : undefined;

    expect(transition).toMatchObject({
      duration: 0.25,
      blendCurve: "ease-out",
      syncNormalizedTime: true,
      interruptionSource: "current"
    });
  });

  it("preserves optional equipment metadata in serialized bundles", () => {
    const bundle = createAnimationBundle({
      name: "Equipment Bundle",
      clipDataPath: "./assets/graph.animation.clips.bin",
      equipment: {
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
            },
            asset: "./assets/sword.glb"
          }
        ]
      }
    });

    const parsed = parseAnimationBundleJson(serializeAnimationBundle(bundle));

    expect(parsed.clipData).toEqual("./assets/graph.animation.clips.bin");
    expect(parsed.equipment).toEqual({
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
          },
          asset: "./assets/sword.glb"
        }
      ]
    });
  });

  it("round-trips advanced runtime graph nodes and compiled dynamics profiles", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Advanced Runtime Artifact",
      rig: {
        boneNames: ["root", "hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"],
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
      parameters: [
        { name: "locomotionSpeed", type: "float", defaultValue: 2 },
        { name: "yawOffset", type: "float", defaultValue: 0 }
      ],
      clipSlots: [{ id: "idle", name: "Idle", duration: 1 }],
      masks: [],
      dynamicsProfiles: [
        {
          name: "Secondary",
          iterations: 4,
          chains: [
            {
              name: "Spine Chain",
              boneIndices: [2, 3],
              restLengths: [0.5],
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
      ],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 3,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
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
            },
            {
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
            },
            {
              type: "secondaryDynamics",
              sourceNodeIndex: 2,
              profileIndex: 0,
              weight: 1,
              dampingScale: 1,
              stiffnessScale: 1,
              gravityScale: 1,
              iterations: 4
            }
          ]
        }
      ],
      layers: [
        {
          name: "Base",
          graphIndex: 0,
          weight: 1,
          blendMode: "override",
          rootMotionMode: "full",
          enabled: true
        }
      ],
      entryGraphIndex: 0
    };

    const parsed = parseAnimationArtifactJson(serializeAnimationArtifact(createAnimationArtifact({ graph })));

    expect(parsed.graph.rig?.boneNames).toEqual(graph.rig?.boneNames);
    expect(parsed.graph.dynamicsProfiles).toEqual(graph.dynamicsProfiles);
    expect(parsed.graph.graphs[0]?.nodes).toEqual(graph.graphs[0]?.nodes);
  });

  it("round-trips clip samples through the binary clip data format", () => {
    const clips = [
      {
        id: "walk",
        name: "Walk",
        duration: 1,
        rootBoneIndex: 1,
        tracks: [
          {
            boneIndex: 1,
            translationTimes: new Float32Array([0, 1]),
            translationValues: new Float32Array([0, 1, 0, 2, 1, 0]),
            rotationTimes: new Float32Array([0]),
            rotationValues: new Float32Array([0, 0, 0, 1])
          }
        ]
      }
    ];

    const parsed = parseClipDataBinary(serializeClipDataBinary(clips));

    expect(parsed).toEqual(clips);
  });
});
