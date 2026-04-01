import { describe, expect, it } from "bun:test";
import type { CompiledAnimatorGraph } from "@ggez/anim-schema";
import {
  createAnimationArtifact,
  createAnimationBundle,
  parseAnimationArtifactJson,
  parseAnimationBundleJson,
  serializeAnimationArtifact,
  serializeAnimationBundle
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
});
