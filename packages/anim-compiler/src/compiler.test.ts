import { describe, expect, it } from "bun:test";
import { compileAnimationEditorDocument } from "./compiler";

describe("@ggez/anim-compiler", () => {
  it("compiles a valid editor document to a runtime graph", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Locomotion",
      entryGraphId: "graph-main",
      parameters: [
        { id: "speed", name: "speed", type: "float", defaultValue: 0 }
      ],
      clips: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "walk", name: "Walk", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            { id: "clip-walk", name: "Walk", kind: "clip", clipId: "walk", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 160 } },
            {
              id: "blend",
              name: "Blend",
              kind: "blend1d",
              parameterId: "speed",
              children: [
                { nodeId: "clip-idle", threshold: 0 },
                { nodeId: "clip-walk", threshold: 1 }
              ],
              position: { x: 320, y: 80 }
            },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "blend", position: { x: 560, y: 80 } }
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
    });

    expect(result.ok).toBe(true);
    expect(result.graph?.graphs[0]?.nodes[2]).toEqual({
      type: "blend1d",
      parameterIndex: 0,
      children: [
        { nodeIndex: 0, threshold: 0 },
        { nodeIndex: 1, threshold: 1 }
      ]
    });
  });

  it("reports diagnostics for missing references", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Broken",
      entryGraphId: "missing",
      parameters: [],
      clips: [],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "clip-idle", position: { x: 160, y: 0 } }
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
          rootMotionMode: "none",
          enabled: true
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes("missing clip"))).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Entry graph"))).toBe(true);
  });

  it("ignores disconnected invalid draft nodes during compilation", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Draft",
      entryGraphId: "graph-main",
      parameters: [
        { id: "speed", name: "speed", type: "float", defaultValue: 0 }
      ],
      clips: [
        { id: "idle", name: "Idle", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            { id: "blend-draft", name: "Draft Blend", kind: "blend1d", parameterId: "", children: [], position: { x: 240, y: 0 } },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "clip-idle", position: { x: 160, y: 0 } }
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
          rootMotionMode: "none",
          enabled: true
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.graph?.graphs[0]?.nodes).toHaveLength(1);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "warning" && diagnostic.message.includes("disconnected"))).toBe(true);
  });

  it("emits clip slots only for reachable referenced clips", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Referenced Clips",
      entryGraphId: "graph-main",
      parameters: [],
      clips: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "walk", name: "Walk", duration: 1 },
        { id: "unused", name: "Unused", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            { id: "clip-unused", name: "Unused", kind: "clip", clipId: "unused", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 120 } },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "clip-idle", position: { x: 160, y: 0 } }
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
          rootMotionMode: "none",
          enabled: true
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.graph?.clipSlots.map((clip) => clip.id)).toEqual(["idle"]);
  });

  it("compiles authored transition blend settings into the runtime graph", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Transition Blend Settings",
      entryGraphId: "graph-main",
      parameters: [{ id: "moving", name: "moving", type: "bool", defaultValue: false }],
      clips: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "walk", name: "Walk", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            { id: "clip-walk", name: "Walk", kind: "clip", clipId: "walk", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 160 } },
            {
              id: "machine",
              name: "Locomotion",
              kind: "stateMachine",
              entryStateId: "state-idle",
              states: [
                { id: "state-idle", name: "Idle", motionNodeId: "clip-idle", position: { x: 200, y: 0 }, speed: 1, cycleOffset: 0 },
                { id: "state-walk", name: "Walk", motionNodeId: "clip-walk", position: { x: 200, y: 160 }, speed: 1, cycleOffset: 0 }
              ],
              transitions: [
                {
                  id: "transition-idle-walk",
                  fromStateId: "state-idle",
                  toStateId: "state-walk",
                  duration: 0.3,
                  blendCurve: "ease-in-out",
                  syncNormalizedTime: true,
                  hasExitTime: false,
                  interruptionSource: "current",
                  conditions: [{ parameterId: "moving", operator: "==", value: true }]
                }
              ],
              anyStateTransitions: [],
              position: { x: 400, y: 80 }
            },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "machine", position: { x: 640, y: 80 } }
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
          rootMotionMode: "none",
          enabled: true
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.graph?.graphs[0]?.nodes[2]).toEqual({
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
          duration: 0.3,
          blendCurve: "ease-in-out",
          syncNormalizedTime: true,
          hasExitTime: false,
          exitTime: undefined,
          interruptionSource: "current",
          conditions: [{ parameterIndex: 0, operator: "==", value: true }]
        }
      ],
      anyStateTransitions: []
    });
  });

  it("compiles selector nodes and warns when int parameters use blend1d", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Selector Graph",
      entryGraphId: "graph-main",
      parameters: [{ id: "weapon-type", name: "weaponType", type: "int", defaultValue: 0 }],
      clips: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "rifle", name: "Rifle", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            { id: "clip-rifle", name: "Rifle", kind: "clip", clipId: "rifle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 160 } },
            {
              id: "selector",
              name: "Weapon Selector",
              kind: "selector",
              parameterId: "weapon-type",
              children: [
                { nodeId: "clip-idle", value: 0 },
                { nodeId: "legacy-blend", value: 2 }
              ],
              position: { x: 320, y: 0 }
            },
            {
              id: "legacy-blend",
              name: "Legacy Blend",
              kind: "blend1d",
              parameterId: "weapon-type",
              children: [
                { nodeId: "clip-idle", threshold: 0 },
                { nodeId: "clip-rifle", threshold: 2 }
              ],
              position: { x: 320, y: 160 }
            },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "selector", position: { x: 560, y: 0 } }
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
          rootMotionMode: "none",
          enabled: true
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.graph?.graphs[0]?.nodes[2]).toEqual({
      type: "selector",
      parameterIndex: 0,
      children: [
        { nodeIndex: 0, value: 0 },
        { nodeIndex: 3, value: 2 }
      ],
      syncGroup: undefined
    });
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "warning" && diagnostic.message.includes("Selector"))).toBe(true);
  });

  it("compiles orientation warp nodes into runtime bone indices", () => {
    const result = compileAnimationEditorDocument({
      version: 1,
      name: "Orientation Warp",
      entryGraphId: "graph-main",
      rig: {
        boneNames: ["root", "hips", "spine", "leftUpperLeg", "leftLowerLeg", "leftFoot"],
        parentIndices: [-1, 0, 1, 1, 3, 4],
        rootBoneIndex: 0,
        bindTranslations: [0, 0, 0, 0, 1, 0, 0, 0.5, 0, -0.35, -0.3, 0.2, 0, -0.9, 0, 0, -0.9, 0.25],
        bindRotations: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
        bindScales: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      },
      parameters: [{ id: "heading", name: "headingOffset", type: "float", defaultValue: 0 }],
      clips: [{ id: "idle", name: "Idle", duration: 1 }],
      masks: [],
      graphs: [
        {
          id: "graph-main",
          name: "Main",
          outputNodeId: "out",
          edges: [],
          nodes: [
            { id: "clip-idle", name: "Idle", kind: "clip", clipId: "idle", speed: 1, loop: true, inPlace: false, position: { x: 0, y: 0 } },
            {
              id: "warp",
              name: "Orientation Warp",
              kind: "orientationWarp",
              sourceNodeId: "clip-idle",
              angleParameterId: "heading",
              maxAngle: Math.PI / 2,
              weight: 1,
              hipBoneName: "hips",
              hipWeight: 0.4,
              spineBoneNames: ["spine"],
              legs: [{ upperBoneName: "leftUpperLeg", lowerBoneName: "leftLowerLeg", footBoneName: "leftFoot", weight: 1 }],
              position: { x: 320, y: 0 }
            },
            { id: "out", name: "Output", kind: "output", sourceNodeId: "warp", position: { x: 560, y: 0 } }
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
          rootMotionMode: "none",
          enabled: true
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.graph?.graphs[0]?.nodes[1]).toEqual({
      type: "orientationWarp",
      sourceNodeIndex: 0,
      parameterIndex: 0,
      maxAngle: Math.PI / 2,
      weight: 1,
      hipBoneIndex: 1,
      hipWeight: 0.4,
      spineBoneIndices: [2],
      legs: [{ upperBoneIndex: 3, lowerBoneIndex: 4, footBoneIndex: 5, weight: 1 }]
    });
  });
});
