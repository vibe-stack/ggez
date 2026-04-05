import { describe, expect, it } from "bun:test";
import { createRigDefinition } from "@ggez/anim-core";
import type { AnimationClipAsset } from "@ggez/anim-core";
import type { CompiledAnimatorGraph } from "@ggez/anim-schema";
import { createAnimatorInstance } from "./runtime/index";

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

const poseTenClip: AnimationClipAsset = {
  id: "pose-ten",
  name: "Pose Ten",
  duration: 1,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([10, 0, 0])
    }
  ]
};

const poseTwentyClip: AnimationClipAsset = {
  id: "pose-twenty",
  name: "Pose Twenty",
  duration: 1,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([20, 0, 0])
    }
  ]
};

const poseThousandClip: AnimationClipAsset = {
  id: "pose-thousand",
  name: "Pose Thousand",
  duration: 1,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([1000, 0, 0])
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

const longIdleClip: AnimationClipAsset = {
  id: "idle-long",
  name: "Idle Long",
  duration: 2,
  tracks: [
    {
      boneIndex: 0,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([0, 0, 0])
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

const orientationWarpRig = createRigDefinition({
  boneNames: ["root", "hips", "spine", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"],
  parentIndices: [-1, 0, 1, 1, 3, 4, 1, 6, 7],
  rootBoneIndex: 0,
  bindTranslations: [
    0, 0, 0,
    0, 1, 0,
    0, 0.5, 0,
    -0.35, -0.3, 0.2,
    0, -0.9, 0,
    0, -0.9, 0.25,
    0.35, -0.3, 0.2,
    0, -0.9, 0,
    0, -0.9, 0.25
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
    1, 1, 1
  ]
});

const orientationWarpClip: AnimationClipAsset = {
  id: "orientation-base",
  name: "Orientation Base",
  duration: 1,
  tracks: []
};

const strideWarpClip: AnimationClipAsset = {
  id: "stride-base",
  name: "Stride Base",
  duration: 1,
  tracks: [
    {
      boneIndex: 5,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([0, -0.9, 0.7])
    },
    {
      boneIndex: 8,
      translationTimes: new Float32Array([0]),
      translationValues: new Float32Array([0, -0.9, -0.1])
    }
  ]
};

function rotateVectorByQuaternion(
  x: number,
  y: number,
  z: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): [number, number, number] {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);

  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ];
}

function computeWorldTransforms(rigDefinition: typeof orientationWarpRig, pose: { translations: Float32Array; rotations: Float32Array }): {
  translations: Float32Array;
  rotations: Float32Array;
} {
  const worldTranslations = new Float32Array(rigDefinition.boneNames.length * 3);
  const worldRotations = new Float32Array(rigDefinition.boneNames.length * 4);

  for (let index = 0; index < rigDefinition.boneNames.length; index += 1) {
    const parentIndex = rigDefinition.parentIndices[index] ?? -1;
    const translationOffset = index * 3;
    const rotationOffset = index * 4;

    if (parentIndex < 0) {
      worldTranslations[translationOffset] = pose.translations[translationOffset]!;
      worldTranslations[translationOffset + 1] = pose.translations[translationOffset + 1]!;
      worldTranslations[translationOffset + 2] = pose.translations[translationOffset + 2]!;
      worldRotations[rotationOffset] = pose.rotations[rotationOffset]!;
      worldRotations[rotationOffset + 1] = pose.rotations[rotationOffset + 1]!;
      worldRotations[rotationOffset + 2] = pose.rotations[rotationOffset + 2]!;
      worldRotations[rotationOffset + 3] = pose.rotations[rotationOffset + 3]!;
      continue;
    }

    const parentTranslationOffset = parentIndex * 3;
    const parentRotationOffset = parentIndex * 4;
    const rotatedLocal = rotateVectorByQuaternion(
      pose.translations[translationOffset]!,
      pose.translations[translationOffset + 1]!,
      pose.translations[translationOffset + 2]!,
      worldRotations[parentRotationOffset]!,
      worldRotations[parentRotationOffset + 1]!,
      worldRotations[parentRotationOffset + 2]!,
      worldRotations[parentRotationOffset + 3]!
    );

    worldTranslations[translationOffset] = worldTranslations[parentTranslationOffset]! + rotatedLocal[0];
    worldTranslations[translationOffset + 1] = worldTranslations[parentTranslationOffset + 1]! + rotatedLocal[1];
    worldTranslations[translationOffset + 2] = worldTranslations[parentTranslationOffset + 2]! + rotatedLocal[2];

    const ax = worldRotations[parentRotationOffset]!;
    const ay = worldRotations[parentRotationOffset + 1]!;
    const az = worldRotations[parentRotationOffset + 2]!;
    const aw = worldRotations[parentRotationOffset + 3]!;
    const bx = pose.rotations[rotationOffset]!;
    const by = pose.rotations[rotationOffset + 1]!;
    const bz = pose.rotations[rotationOffset + 2]!;
    const bw = pose.rotations[rotationOffset + 3]!;
    worldRotations[rotationOffset] = aw * bx + ax * bw + ay * bz - az * by;
    worldRotations[rotationOffset + 1] = aw * by - ax * bz + ay * bw + az * bx;
    worldRotations[rotationOffset + 2] = aw * bz + ax * by - ay * bx + az * bw;
    worldRotations[rotationOffset + 3] = aw * bw - ax * bx - ay * by - az * bz;
  }

  return {
    translations: worldTranslations,
    rotations: worldRotations
  };
}

function computeWorldPosition(rigDefinition: typeof orientationWarpRig, pose: { translations: Float32Array; rotations: Float32Array }, boneIndex: number): [number, number, number] {
  const world = computeWorldTransforms(rigDefinition, pose);
  return [
    world.translations[boneIndex * 3]!,
    world.translations[boneIndex * 3 + 1]!,
    world.translations[boneIndex * 3 + 2]!
  ];
}

function computeWorldForwardYaw(rigDefinition: typeof orientationWarpRig, pose: { translations: Float32Array; rotations: Float32Array }, boneIndex: number): number {
  const world = computeWorldTransforms(rigDefinition, pose);
  const rotationOffset = boneIndex * 4;
  const forward = rotateVectorByQuaternion(
    0,
    0,
    1,
    world.rotations[rotationOffset]!,
    world.rotations[rotationOffset + 1]!,
    world.rotations[rotationOffset + 2]!,
    world.rotations[rotationOffset + 3]!
  );
  return Math.atan2(forward[0], forward[2]);
}

function distanceBetween(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

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

  it("smooths float parameters before evaluating blend weights", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Smoothed Blend Graph",
      parameters: [{ name: "speed", type: "float", defaultValue: 0, smoothingDuration: 0.2 }],
      clipSlots: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "pose-ten", name: "Pose Ten", duration: 1 }
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
      clips: [idleClip, poseTenClip]
    });

    animator.setFloat("speed", 1);

    const firstX = animator.update(0.1).pose.translations[0];
    const secondX = animator.update(0.1).pose.translations[0];

    expect(firstX).toBeCloseTo(3.9347, 3);
    expect(secondX).toBeCloseTo(6.3212, 3);
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
                  blendCurve: "linear",
                  syncNormalizedTime: false,
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

  it("keeps blend-tree playback in native child time by default", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Native-Time Blend Graph",
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

    expect(result.pose.translations[0]).toBeCloseTo(1);
  });

  it("can phase-sync blend-tree children explicitly with sync groups", () => {
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
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" },
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

  it("does not double-apply sync groups when a blend tree and its child clips share the same group", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Nested Sync Group Blend",
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
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" },
            {
              type: "blend1d",
              parameterIndex: 0,
              syncGroup: "locomotion",
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
      clips: [walkClip, fastRunClip]
    });

    animator.setFloat("speed", 0.5);
    const result = animator.update(0.75);

    expect(result.pose.translations[0]).toBeCloseTo(1);
    expect(result.rootMotion.translation[0]).toBeCloseTo(1.5);
  });

  it("keeps exact blend2d child matches at their native playback speed", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Exact 2D Blend Match",
      parameters: [
        { name: "moveX", type: "float", defaultValue: 0 },
        { name: "moveY", type: "float", defaultValue: 0 }
      ],
      clipSlots: [
        { id: "idle-long", name: "Idle Long", duration: 2 },
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
              type: "blend2d",
              xParameterIndex: 0,
              yParameterIndex: 1,
              children: [
                { nodeIndex: 0, x: 0, y: 0 },
                { nodeIndex: 1, x: 0, y: 2 }
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
      clips: [longIdleClip, fastRunClip]
    });

    animator.setFloat("moveX", 0);
    animator.setFloat("moveY", 2);
    const result = animator.update(0.25);

    expect(result.pose.translations[0]).toBeCloseTo(0.5);
  });

  it("uses the local blend2d triangle instead of averaging all distant samples", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Local 2D Triangle Blend",
      parameters: [
        { name: "moveX", type: "float", defaultValue: 0 },
        { name: "moveY", type: "float", defaultValue: 0 }
      ],
      clipSlots: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "pose-ten", name: "Pose Ten", duration: 1 },
        { id: "pose-twenty", name: "Pose Twenty", duration: 1 },
        { id: "pose-thousand", name: "Pose Thousand", duration: 1 }
      ],
      masks: [],
      graphs: [
        {
          name: "Locomotion",
          rootNodeIndex: 4,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 2, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 3, speed: 1, loop: true, inPlace: false },
            {
              type: "blend2d",
              xParameterIndex: 0,
              yParameterIndex: 1,
              children: [
                { nodeIndex: 0, x: 0, y: 0 },
                { nodeIndex: 1, x: 1, y: 0 },
                { nodeIndex: 2, x: 0, y: 1 },
                { nodeIndex: 3, x: 1, y: 1 }
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
      clips: [idleClip, poseTenClip, poseTwentyClip, poseThousandClip]
    });

    animator.setFloat("moveX", 0.2);
    animator.setFloat("moveY", 0.2);
    const result = animator.update(0.1);

    expect(result.pose.translations[0]).toBeCloseTo(6);
  });

  it("does not slow nested locomotion blends when parent branches have different durations", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Nested Locomotion Blend",
      parameters: [
        { name: "moveY", type: "float", defaultValue: 0 },
        { name: "locomotionSpeed", type: "float", defaultValue: 0 }
      ],
      clipSlots: [
        { id: "idle-long", name: "Idle Long", duration: 2 },
        { id: "walk", name: "Walk", duration: 1 },
        { id: "run-fast", name: "Run Fast", duration: 0.5 }
      ],
      masks: [],
      graphs: [
        {
          name: "Locomotion",
          rootNodeIndex: 4,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false },
            { type: "clip", clipIndex: 2, speed: 1, loop: true, inPlace: false },
            {
              type: "blend1d",
              parameterIndex: 0,
              children: [
                { nodeIndex: 0, threshold: 0 },
                { nodeIndex: 1, threshold: 1 }
              ]
            },
            {
              type: "blend1d",
              parameterIndex: 1,
              children: [
                { nodeIndex: 3, threshold: 0 },
                { nodeIndex: 2, threshold: 1 }
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
      clips: [longIdleClip, walkClip, fastRunClip]
    });

    animator.setFloat("moveY", 1);
    animator.setFloat("locomotionSpeed", 0.8);
    const result = animator.update(0.75);

    expect(result.pose.translations[0]).toBeCloseTo(0.7);
  });

  it("selects discrete child motions by integer parameter", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Selector Graph",
      parameters: [{ name: "weaponType", type: "int", defaultValue: 0 }],
      clipSlots: [
        { id: "pose-ten", name: "Pose Ten", duration: 1 },
        { id: "pose-twenty", name: "Pose Twenty", duration: 1 }
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
              type: "selector",
              parameterIndex: 0,
              children: [
                { nodeIndex: 0, value: 0 },
                { nodeIndex: 1, value: 2 }
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
      clips: [poseTenClip, poseTwentyClip]
    });

    animator.setInt("weaponType", 2);
    const result = animator.update(0.1);

    expect(result.pose.translations[0]).toBeCloseTo(20);
  });

  it("reduces foot drift when orientation warp leg stabilization is configured", () => {
    const makeGraph = (withLegs: boolean): CompiledAnimatorGraph => ({
      version: 1,
      name: withLegs ? "Orientation Warp With Legs" : "Orientation Warp Without Legs",
      parameters: [{ name: "headingOffset", type: "float", defaultValue: 0 }],
      clipSlots: [{ id: "orientation-base", name: "Orientation Base", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
              type: "orientationWarp",
              sourceNodeIndex: 0,
              parameterIndex: 0,
              maxAngle: Math.PI / 2,
              weight: 1,
              hipBoneIndex: 1,
              hipWeight: 0.45,
              spineBoneIndices: [2],
              legs: withLegs
                ? [
                    { upperBoneIndex: 3, lowerBoneIndex: 4, footBoneIndex: 5, weight: 1 },
                    { upperBoneIndex: 6, lowerBoneIndex: 7, footBoneIndex: 8, weight: 1 }
                  ]
                : []
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
    });

    const baseAnimator = createAnimatorInstance({
      rig: orientationWarpRig,
      graph: {
        version: 1,
        name: "Base Orientation Pose",
        parameters: [],
        clipSlots: [{ id: "orientation-base", name: "Orientation Base", duration: 1 }],
        masks: [],
        graphs: [
          {
            name: "Main",
            rootNodeIndex: 0,
            nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false }]
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
      },
      clips: [orientationWarpClip]
    });
    const baseResult = baseAnimator.update(0.1);
    const baseLeftFoot = computeWorldPosition(orientationWarpRig, baseResult.pose, 5);
    const baseRightFoot = computeWorldPosition(orientationWarpRig, baseResult.pose, 8);

    const warpedWithoutLegs = createAnimatorInstance({
      rig: orientationWarpRig,
      graph: makeGraph(false),
      clips: [orientationWarpClip]
    });
    warpedWithoutLegs.setFloat("headingOffset", Math.PI / 2);
    const withoutLegsResult = warpedWithoutLegs.update(0.1);

    const warpedWithLegs = createAnimatorInstance({
      rig: orientationWarpRig,
      graph: makeGraph(true),
      clips: [orientationWarpClip]
    });
    warpedWithLegs.setFloat("headingOffset", Math.PI / 2);
    const withLegsResult = warpedWithLegs.update(0.1);

    const withoutLeftFoot = computeWorldPosition(orientationWarpRig, withoutLegsResult.pose, 5);
    const withoutRightFoot = computeWorldPosition(orientationWarpRig, withoutLegsResult.pose, 8);
    const withLeftFoot = computeWorldPosition(orientationWarpRig, withLegsResult.pose, 5);
    const withRightFoot = computeWorldPosition(orientationWarpRig, withLegsResult.pose, 8);

    expect(Math.abs(withLegsResult.pose.rotations[5])).toBeGreaterThan(0.2);
    expect(distanceBetween(withLeftFoot, baseLeftFoot)).toBeLessThan(distanceBetween(withoutLeftFoot, baseLeftFoot));
    expect(distanceBetween(withRightFoot, baseRightFoot)).toBeLessThan(distanceBetween(withoutRightFoot, baseRightFoot));
  });

  it("rotates the lower body without twisting the torso when leg chains are configured", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Orientation Warp Lower Body",
      parameters: [{ name: "headingOffset", type: "float", defaultValue: 0 }],
      clipSlots: [{ id: "orientation-base", name: "Orientation Base", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
              type: "orientationWarp",
              sourceNodeIndex: 0,
              parameterIndex: 0,
              maxAngle: Math.PI / 2,
              weight: 1,
              hipBoneIndex: 1,
              hipWeight: 0.45,
              spineBoneIndices: [2],
              legs: [
                { upperBoneIndex: 3, lowerBoneIndex: 4, footBoneIndex: 5, weight: 1 },
                { upperBoneIndex: 6, lowerBoneIndex: 7, footBoneIndex: 8, weight: 1 }
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
      rig: orientationWarpRig,
      graph,
      clips: [orientationWarpClip]
    });
    animator.setFloat("headingOffset", Math.PI / 2);
    const result = animator.update(0.1);

    expect(Math.abs(computeWorldForwardYaw(orientationWarpRig, result.pose, 2))).toBeLessThan(0.1);
    expect(Math.abs(computeWorldForwardYaw(orientationWarpRig, result.pose, 3))).toBeGreaterThan(1.2);
    expect(Math.abs(computeWorldForwardYaw(orientationWarpRig, result.pose, 6))).toBeGreaterThan(1.2);
  });

  it("rotates root motion translation with the orientation warp angle", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Orientation Warp Root Motion",
      parameters: [{ name: "headingOffset", type: "float", defaultValue: 0 }],
      clipSlots: [{ id: "walk", name: "Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
              type: "orientationWarp",
              sourceNodeIndex: 0,
              parameterIndex: 0,
              maxAngle: Math.PI / 2,
              weight: 1,
              hipBoneIndex: undefined,
              hipWeight: 0,
              spineBoneIndices: [],
              legs: []
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
      clips: [walkClip]
    });

    animator.setFloat("headingOffset", Math.PI / 2);
    const result = animator.update(0.5);

    expect(result.rootMotion.translation[0]).toBeCloseTo(0, 5);
    expect(result.rootMotion.translation[2]).toBeCloseTo(-1, 5);
  });

  it("extends and compresses foot spacing in manual stride warp mode", () => {
    const baseGraph: CompiledAnimatorGraph = {
      version: 1,
      name: "Stride Warp Base",
      parameters: [],
      clipSlots: [{ id: "stride-base", name: "Stride Base", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false }]
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

    const warpedGraph: CompiledAnimatorGraph = {
      version: 1,
      name: "Stride Warp Manual",
      parameters: [],
      clipSlots: [{ id: "stride-base", name: "Stride Base", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
              type: "strideWarp",
              sourceNodeIndex: 0,
              evaluationMode: "manual",
              locomotionSpeedParameterIndex: undefined,
              strideDirection: { x: 0, y: 1 },
              manualStrideScale: 1.75,
              minLocomotionSpeedThreshold: 0,
              pelvisBoneIndex: 1,
              pelvisWeight: 0.2,
              clampResult: false,
              minStrideScale: 0.5,
              maxStrideScale: 2,
              interpResult: false,
              interpSpeedIncreasing: 6,
              interpSpeedDecreasing: 6,
              legs: [
                { upperBoneIndex: 3, lowerBoneIndex: 4, footBoneIndex: 5, weight: 1 },
                { upperBoneIndex: 6, lowerBoneIndex: 7, footBoneIndex: 8, weight: 1 }
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

    const baseAnimator = createAnimatorInstance({
      rig: orientationWarpRig,
      graph: baseGraph,
      clips: [strideWarpClip]
    });
    const warpedAnimator = createAnimatorInstance({
      rig: orientationWarpRig,
      graph: warpedGraph,
      clips: [strideWarpClip]
    });

    const baseResult = baseAnimator.update(0.1);
    const warpedResult = warpedAnimator.update(0.1);
    const baseLeftFoot = computeWorldPosition(orientationWarpRig, baseResult.pose, 5);
    const baseRightFoot = computeWorldPosition(orientationWarpRig, baseResult.pose, 8);
    const warpedLeftFoot = computeWorldPosition(orientationWarpRig, warpedResult.pose, 5);
    const warpedRightFoot = computeWorldPosition(orientationWarpRig, warpedResult.pose, 8);
    const baseStrideSpan = Math.abs(baseLeftFoot[2] - baseRightFoot[2]);
    const warpedStrideSpan = Math.abs(warpedLeftFoot[2] - warpedRightFoot[2]);

    expect(warpedLeftFoot[2]).toBeGreaterThan(baseLeftFoot[2]);
    expect(warpedStrideSpan).toBeGreaterThan(baseStrideSpan);
  });

  it("scales root motion translation in graph-driven stride warp mode", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Stride Warp Root Motion",
      parameters: [{ name: "locomotionSpeed", type: "float", defaultValue: 0 }],
      clipSlots: [{ id: "walk", name: "Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
              type: "strideWarp",
              sourceNodeIndex: 0,
              evaluationMode: "graph",
              locomotionSpeedParameterIndex: 0,
              strideDirection: { x: 0, y: 1 },
              manualStrideScale: 1,
              minLocomotionSpeedThreshold: 0,
              pelvisBoneIndex: undefined,
              pelvisWeight: 0,
              clampResult: false,
              minStrideScale: 0.5,
              maxStrideScale: 2,
              interpResult: false,
              interpSpeedIncreasing: 6,
              interpSpeedDecreasing: 6,
              legs: []
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
      clips: [walkClip]
    });

    animator.setFloat("locomotionSpeed", 4);
    const result = animator.update(0.5);

    expect(result.rootMotion.translation[0]).toBeCloseTo(2, 5);
    expect(result.rootMotion.translation[2]).toBeCloseTo(0, 5);
  });

  it("syncs node playback across layers with sync groups", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Node Sync Groups",
      parameters: [],
      clipSlots: [
        { id: "walk", name: "Walk", duration: 1 },
        { id: "run-fast", name: "Run Fast", duration: 0.5 }
      ],
      masks: [],
      graphs: [
        {
          name: "Base",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" }]
        },
        {
          name: "Upper",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" }]
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

    const result = animator.update(0.25);

    expect(result.pose.translations[0]).toBeCloseTo(0.25);
  });

  it("syncs state machine states across layers with sync groups", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "State Sync Groups",
      parameters: [],
      clipSlots: [
        { id: "walk", name: "Walk", duration: 1 },
        { id: "run-fast", name: "Run Fast", duration: 0.5 }
      ],
      masks: [],
      graphs: [
        {
          name: "Base",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false, syncGroup: "locomotion" }]
        },
        {
          name: "Upper",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 1, speed: 1, loop: true, inPlace: false },
            {
              type: "stateMachine",
              machineIndex: 0,
              entryStateIndex: 0,
              states: [{ name: "Run", motionNodeIndex: 0, speed: 1, cycleOffset: 0, syncGroup: "locomotion" }],
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

    const result = animator.update(0.25);

    expect(result.pose.translations[0]).toBeCloseTo(0.25);
  });

  it("supports easing curves for state machine crossfades", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Eased Transition",
      parameters: [{ name: "moving", type: "bool", defaultValue: false }],
      clipSlots: [
        { id: "idle", name: "Idle", duration: 1 },
        { id: "pose-ten", name: "Pose Ten", duration: 1 }
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
                { name: "Pose", motionNodeIndex: 1, speed: 1, cycleOffset: 0 }
              ],
              transitions: [
                {
                  fromStateIndex: 0,
                  toStateIndex: 1,
                  duration: 1,
                  blendCurve: "ease-in",
                  syncNormalizedTime: false,
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
      clips: [idleClip, poseTenClip]
    });

    animator.setBool("moving", true);
    const result = animator.update(0.25);

    expect(result.pose.translations[0]).toBeCloseTo(0.625);
  });

  it("can sync the next state by normalized phase when a transition begins", () => {
    const makeGraph = (syncNormalizedTime: boolean): CompiledAnimatorGraph => ({
      version: 1,
      name: syncNormalizedTime ? "Phase Synced Transition" : "Unsynced Transition",
      parameters: [{ name: "moving", type: "bool", defaultValue: false }],
      clipSlots: [
        { id: "walk", name: "Walk", duration: 1 },
        { id: "run-fast", name: "Run Fast", duration: 0.5 }
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
                { name: "Walk", motionNodeIndex: 0, speed: 1, cycleOffset: 0 },
                { name: "Run", motionNodeIndex: 1, speed: 1, cycleOffset: 0 }
              ],
              transitions: [
                {
                  fromStateIndex: 0,
                  toStateIndex: 1,
                  duration: 0.2,
                  blendCurve: "linear",
                  syncNormalizedTime,
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
    });

    const unsyncedAnimator = createAnimatorInstance({
      rig,
      graph: makeGraph(false),
      clips: [walkClip, fastRunClip]
    });
    unsyncedAnimator.update(0.25);
    unsyncedAnimator.setBool("moving", true);
    const unsyncedResult = unsyncedAnimator.update(0.1);

    const syncedAnimator = createAnimatorInstance({
      rig,
      graph: makeGraph(true),
      clips: [walkClip, fastRunClip]
    });
    syncedAnimator.update(0.25);
    syncedAnimator.setBool("moving", true);
    const syncedResult = syncedAnimator.update(0.1);

    expect(unsyncedResult.pose.translations[0]).toBeCloseTo(0.45);
    expect(syncedResult.pose.translations[0]).toBeCloseTo(0.625);
    expect(syncedResult.pose.translations[0]).toBeGreaterThan(unsyncedResult.pose.translations[0]);
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

  it("extracts legacy clip root motion from the inferred motion bone", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Legacy Mixamo Root Motion",
      parameters: [],
      clipSlots: [{ id: "legacy-mixamo-walk", name: "Legacy Mixamo Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Main",
          rootNodeIndex: 0,
          nodes: [{ type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false }]
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

    expect(result.rootMotion.translation[0]).toBeCloseTo(1);
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
                  blendCurve: "linear",
                  syncNormalizedTime: false,
                  hasExitTime: false,
                  interruptionSource: "next",
                  conditions: [{ parameterIndex: 0, operator: "==", value: true }]
                },
                {
                  fromStateIndex: 1,
                  toStateIndex: 0,
                  duration: 0.1,
                  blendCurve: "linear",
                  syncNormalizedTime: false,
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

  it("advances reused subgraph state machines only once per update", () => {
    const graph: CompiledAnimatorGraph = {
      version: 1,
      name: "Shared Subgraph Machine",
      parameters: [],
      clipSlots: [{ id: "walk", name: "Walk", duration: 1 }],
      masks: [],
      graphs: [
        {
          name: "Locomotion",
          rootNodeIndex: 1,
          nodes: [
            { type: "clip", clipIndex: 0, speed: 1, loop: true, inPlace: false },
            {
              type: "stateMachine",
              machineIndex: 0,
              entryStateIndex: 0,
              states: [{ name: "Walk", motionNodeIndex: 0, speed: 1, cycleOffset: 0 }],
              transitions: [],
              anyStateTransitions: []
            }
          ]
        },
        {
          name: "Overlay",
          rootNodeIndex: 0,
          nodes: [{ type: "subgraph", graphIndex: 0 }]
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
          name: "Overlay",
          graphIndex: 1,
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
      clips: [walkClip]
    });

    const result = animator.update(0.5);

    expect(result.pose.translations[0]).toBeCloseTo(1);
  });
});
