import { describe, expect, it } from "bun:test";
import { createRigDefinition } from "@ggez/anim-core";
import type { AnimationClipAsset } from "@ggez/anim-core";
import type { CompiledAnimatorGraph } from "@ggez/anim-schema";
import { createAnimatorInstance } from "./runtime";

const rig = createRigDefinition({
  boneNames: ["root"],
  parentIndices: [-1],
  rootBoneIndex: 0,
  bindTranslations: [0, 0, 0],
  bindRotations: [0, 0, 0, 1],
  bindScales: [1, 1, 1]
});

const idleClip: AnimationClipAsset = {
  id: "idle",
  name: "Idle",
  duration: 1,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([0, 0, 0])
    }
  ]
};

const walkClip: AnimationClipAsset = {
  id: "walk",
  name: "Walk",
  duration: 1,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0, 1]),
      translationValues: new Float32Array([0, 0, 0, 2, 0, 0])
    }
  ]
};

const fastRunClip: AnimationClipAsset = {
  id: "run-fast",
  name: "Run Fast",
  duration: 0.5,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0, 0.5]),
      translationValues: new Float32Array([0, 0, 0, 1, 0, 0])
    }
  ]
};

const twoBoneRig = createRigDefinition({
  boneNames: ["root", "mixamorigHips"],
  parentIndices: [-1, 0],
  rootBoneIndex: 0,
  bindTranslations: [0, 0, 0, 0, 1, 0],
  bindRotations: [0, 0, 0, 1, 0, 0, 0, 1],
  bindScales: [1, 1, 1, 1, 1, 1]
});

const hipsMotionClip: AnimationClipAsset = {
  id: "hips-walk",
  name: "Hips Walk",
  duration: 1,
  rootBoneIndex: 1,
  tracks: [
    {
      boneIndex: 1,
      translationTimes: new Float32Array([0, 1]),
      translationValues: new Float32Array([0, 1, 0, 2, 1, 0])
    }
  ]
};

const legacyMixamoClip: AnimationClipAsset = {
  id: "legacy-mixamo-walk",
  name: "Legacy Mixamo Walk",
  duration: 1,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0, 1]),
      translationValues: new Float32Array([0, 0, 0, 1, 0, 0])
    },
    {
      boneIndex: 1,
      translationTimes: new Float32Array([0, 1]),
      translationValues: new Float32Array([0, 1, 0, 2, 1, 0])
    }
  ]
};

const maskedLayerRig = createRigDefinition({
  boneNames: ["root", "spine", "arm"],
  parentIndices: [-1, 0, 1],
  rootBoneIndex: 0,
  bindTranslations: [0, 0, 0, 0, 1, 0, 0, 2, 0],
  bindRotations: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  bindScales: [1, 1, 1, 1, 1, 1, 1, 1, 1]
});

const locomotionUpperBodyClip: AnimationClipAsset = {
  id: "locomotion-upper",
  name: "Locomotion Upper",
  duration: 1,
  tracks: [
    {
      boneIndex: 1,
      translationTimes: new Float32Array([0, 1]),
      translationValues: new Float32Array([0, 1, 0, 1, 1, 0])
    }
  ]
};

const weaponAimSparseClip: AnimationClipAsset = {
  id: "weapon-aim",
  name: "Weapon Aim",
  duration: 1,
  tracks: [
    {
      boneIndex: 2,
      translationTimes: new Float32Array([0, 1]),
      translationValues: new Float32Array([0, 2, 0, 0, 3, 0])
    }
  ]
};

describe("@ggez/anim-runtime", () => {
  it("evaluates 1d blends and root motion", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Blend Graph",
      parameters: [{ name: "speed", type: "float", defaultValue: 0 }],
      clipSlots: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "walk", name: "Walk", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          name: "Locomotion",
          rootNodeIndex: 2,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false },
            {
              type: "blend1d",
              parameterIndex: 0,
              children: [
                { nodeIndex: 0, threshold: 0 },
                { nodeIndex: 1, threshold: 1 }
              ]
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

    const animator = createAnimatorInstance({
      rig,
      graph,
      clips: [idleClip, walkClip]
    });

    animator.setFloat("speed", 1);
    const result = animator.update(0.5);

    expect(result.pose.translations[0]).toBeCloseTo(1);
    expect(result.rootMotion.translation[0]).toBeCloseTo(1);
  });

  it("evaluates state machine transitions on bool conditions", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "State Machine",
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
                  duration: 0.1,
                  hasExitTime: false,
                  interruptionSource: "none",
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

    const animator = createAnimatorInstance({
      rig,
      graph,
      clips: [idleClip, walkClip]
    });

    animator.setBool("moving", true);
    animator.update(0.2);

    expect(animator.outputPose.translations[0]).toBeGreaterThan(0);
  });

  it("syncs blend-tree child clips by normalized phase instead of raw seconds", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Synced Blend Graph",
      parameters: [{ name: "speed", type: "float", defaultValue: 0.5 }],
      clipSlots: [
        { id: "walk", name: "Walk", duration: 1 },
        { id: "run-fast", name: "Run Fast", duration: 0.5 }
      ],
      masks: [],
      graphs: [
        {
          name: "Locomotion",
          rootNodeIndex: 2,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false },
            {
              type: "blend1d",
              parameterIndex: 0,
              children: [
                { nodeIndex: 0, threshold: 0 },
                { nodeIndex: 1, threshold: 1 }
              ]
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

    const animator = createAnimatorInstance({
      rig,
      graph,
      clips: [walkClip, fastRunClip]
    });

    animator.setFloat("speed", 0.5);
    const result = animator.update(0.75);

    expect(result.pose.translations[0]).toBeCloseTo(1.125);
  });

  it("can evaluate clips in place by ignoring root translation", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "In Place Clip",
      parameters: [],
      clipSlots: [{ id: "walk", name: "Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: true }]
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

    const animator = createAnimatorInstance({
      rig,
      graph,
      clips: [walkClip]
    });

    const result = animator.update(0.5);

    expect(result.pose.translations[0]).toBeCloseTo(0);
    expect(result.rootMotion.translation[0]).toBeCloseTo(0);
  });

  it("can evaluate clips in place using a clip-specific motion root bone", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "In Place Hips Clip",
      parameters: [],
      clipSlots: [{ id: "hips-walk", name: "Hips Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: true }]
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

    const animator = createAnimatorInstance({
      rig: twoBoneRig,
      graph,
      clips: [hipsMotionClip]
    });

    const result = animator.update(0.5);

    expect(result.pose.translations[0]).toBeCloseTo(0);
    expect(result.pose.translations[3]).toBeCloseTo(0);
    expect(result.pose.translations[4]).toBeCloseTo(1);
    expect(result.pose.translations[5]).toBeCloseTo(0);
    expect(result.rootMotion.translation[0]).toBeCloseTo(0);
    expect(result.rootMotion.translation[1]).toBeCloseTo(0);
    expect(result.rootMotion.translation[2]).toBeCloseTo(0);
  });

  it("can evaluate legacy clips in place without imported root-bone metadata", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Legacy Mixamo In Place",
      parameters: [],
      clipSlots: [{ id: "legacy-mixamo-walk", name: "Legacy Mixamo Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: true }]
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

    const animator = createAnimatorInstance({
      rig: twoBoneRig,
      graph,
      clips: [legacyMixamoClip]
    });

    const result = animator.update(0.5);

    expect(result.pose.translations[0]).toBeCloseTo(0);
    expect(result.pose.translations[1]).toBeCloseTo(0);
    expect(result.pose.translations[2]).toBeCloseTo(0);
    expect(result.pose.translations[3]).toBeCloseTo(0);
    expect(result.pose.translations[4]).toBeCloseTo(1);
    expect(result.pose.translations[5]).toBeCloseTo(0);
    expect(result.rootMotion.translation[0]).toBeCloseTo(0);
    expect(result.rootMotion.translation[1]).toBeCloseTo(0);
    expect(result.rootMotion.translation[2]).toBeCloseTo(0);
  });

  it("supports interrupting an active transition from the next state", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Interruption Graph",
      parameters: [{ name: "armed", type: "bool", defaultValue: false }],
      clipSlots: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "walk", name: "Walk", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          name: "UpperBody",
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
                { name: "Aim", motionNodeIndex: 1, speed: 1, cycleOffset: 0 }
              ],
              transitions: [
                {
                  fromStateIndex: 0,
                  toStateIndex: 1,
                  duration: 1,
                  hasExitTime: false,
                  interruptionSource: "next",
                  conditions: [{ parameterIndex: 0, operator: "==", value: true }]
                },
                {
                  fromStateIndex: 1,
                  toStateIndex: 0,
                  duration: 0.1,
                  hasExitTime: false,
                  interruptionSource: "none",
                  conditions: [{ parameterIndex: 0, operator: "==", value: false }]
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

    const animator = createAnimatorInstance({
      rig,
      graph,
      clips: [idleClip, walkClip]
    });

    animator.setBool("armed", true);
    animator.update(0.25);
    expect(animator.outputPose.translations[0]).toBeGreaterThan(0);

    animator.setBool("armed", false);
    animator.update(0.1);
    expect(animator.outputPose.translations[0]).toBeCloseTo(0);
  });

  it("preserves lower-layer motion for untracked bones in masked override layers", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Masked Override Sparse Clip",
      parameters: [],
      clipSlots: [
        { id: "locomotion-upper", name: "Locomotion Upper", duration: 1 },
        { id: "weapon-aim", name: "Weapon Aim", duration: 1 }
      ],
      masks: [
        { name: "Upper Body", weights: [0, 1, 1] }
      ],
      graphs: [
        {
          name: "Base",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false }]
        },
        {
          name: "Upper",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false }]
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
        },
        {
          name: "Upper",
          graphIndex: 1,
          weight: 1,
          blendMode: "override",
          maskIndex: 0,
          rootMotionMode: "none",
          enabled: true
        }
      ],
      entryGraphIndex: 0
    };

    const animator = createAnimatorInstance({
      rig: maskedLayerRig,
      graph,
      clips: [locomotionUpperBodyClip, weaponAimSparseClip]
    });

    const result = animator.update(0.5);

    expect(result.pose.translations[3]).toBeCloseTo(0.5);
    expect(result.pose.translations[4]).toBeCloseTo(1);
    expect(result.pose.translations[5]).toBeCloseTo(0);
    expect(result.pose.translations[6]).toBeCloseTo(0);
    expect(result.pose.translations[7]).toBeCloseTo(2.5);
    expect(result.pose.translations[8]).toBeCloseTo(0);
  });

  it("allows an upper-body state machine state to passthrough the lower layer", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Upper Body Passthrough",
      parameters: [],
      clipSlots: [{ id: "locomotion-upper", name: "Locomotion Upper", duration: 1 }],
      masks: [{ name: "Upper Body", weights: [0, 1, 1] }],
      graphs: [
        {
          name: "Base",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false }]
        },
        {
          name: "Upper",
          rootNodeIndex: 0,
          nodes: [
            {
              type: "stateMachine",
              machineIndex: 0,
              entryStateIndex: 0,
              states: [{ name: "Unarmed", motionNodeIndex: -1, speed: 1, cycleOffset: 0 }],
              transitions: [],
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
        },
        {
          name: "Upper",
          graphIndex: 1,
          weight: 1,
          blendMode: "override",
          maskIndex: 0,
          rootMotionMode: "none",
          enabled: true
        }
      ],
      entryGraphIndex: 0
    };

    const animator = createAnimatorInstance({
      rig: maskedLayerRig,
      graph,
      clips: [locomotionUpperBodyClip]
    });

    const result = animator.update(0.5);

    expect(result.pose.translations[3]).toBeCloseTo(0.5);
    expect(result.pose.translations[4]).toBeCloseTo(1);
    expect(result.pose.translations[5]).toBeCloseTo(0);
    expect(result.pose.translations[6]).toBeCloseTo(0);
    expect(result.pose.translations[7]).toBeCloseTo(2);
    expect(result.pose.translations[8]).toBeCloseTo(0);
  });
});
