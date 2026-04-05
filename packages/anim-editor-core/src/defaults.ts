import type { AnimationEditorDocument, EditorGraphNode } from "@ggez/anim-schema";
import { ANIMATION_DOCUMENT_VERSION } from "@ggez/anim-schema";
import { createStableId } from "@ggez/anim-utils";

export function createDefaultNode(kind: EditorGraphNode["kind"], name?: string): EditorGraphNode {
  const id = createStableId(kind);
  const base = {
    id,
    name: name ?? kind,
    position: { x: 80, y: 80 }
  };

  switch (kind) {
    case "clip":
      return {
        ...base,
        kind,
        clipId: "",
        speed: 1,
        loop: true,
        inPlace: false,
        syncGroup: undefined
      };
    case "blend1d":
      return {
        ...base,
        kind,
        parameterId: "",
        children: [],
        syncGroup: undefined
      };
    case "blend2d":
      return {
        ...base,
        kind,
        xParameterId: "",
        yParameterId: "",
        children: [],
        syncGroup: undefined
      };
    case "selector":
      return {
        ...base,
        kind,
        parameterId: "",
        children: [],
        syncGroup: undefined
      };
    case "orientationWarp":
      return {
        ...base,
        kind,
        sourceNodeId: undefined,
        angleParameterId: "",
        maxAngle: Math.PI / 2,
        weight: 1,
        hipBoneName: undefined,
        hipWeight: 0.35,
        spineBoneNames: [],
        legs: []
      };
    case "strideWarp":
      return {
        ...base,
        kind,
        sourceNodeId: undefined,
        evaluationMode: "graph",
        locomotionSpeedParameterId: "",
        strideDirection: { x: 0, y: 1 },
        manualStrideScale: 1,
        minLocomotionSpeedThreshold: 0.01,
        pelvisBoneName: undefined,
        pelvisWeight: 0.35,
        clampResult: false,
        minStrideScale: 0.5,
        maxStrideScale: 2,
        interpResult: false,
        interpSpeedIncreasing: 6,
        interpSpeedDecreasing: 6,
        legs: []
      };
    case "secondaryDynamics":
      return {
        ...base,
        kind,
        sourceNodeId: undefined,
        profileId: "",
        weight: 1,
        dampingScale: 1,
        stiffnessScale: 1,
        gravityScale: 1,
        iterations: 4
      };
    case "stateMachine":
      const initialStateId = createStableId("state");
      return {
        ...base,
        kind,
        entryStateId: initialStateId,
        states: [
          {
            id: initialStateId,
            name: "State 1",
            motionNodeId: "unassigned-motion",
            position: { x: 220, y: 160 },
            speed: 1,
            cycleOffset: 0,
            syncGroup: undefined,
          },
        ],
        transitions: [],
        anyStateTransitions: []
      };
    case "subgraph":
      return {
        ...base,
        kind,
        graphId: "",
        syncGroup: undefined
      };
    case "output":
      return {
        ...base,
        kind,
        sourceNodeId: undefined
      };
  }
}

export function createDefaultAnimationEditorDocument(): AnimationEditorDocument {
  const graphId = createStableId("graph");
  const speedParameterId = createStableId("param");
  const idleNodeId = createStableId("clip");
  const walkNodeId = createStableId("clip");
  const runNodeId = createStableId("clip");
  const blendNodeId = createStableId("blend1d");
  const outputNodeId = createStableId("output");

  return {
    version: ANIMATION_DOCUMENT_VERSION,
    name: "Animation Graph",
    entryGraphId: graphId,
    parameters: [
      { id: speedParameterId, name: "speed", type: "float", defaultValue: 0 },
    ],
    clips: [],
    masks: [],
    dynamicsProfiles: [],
    graphs: [
      {
        id: graphId,
        name: "Locomotion",
        outputNodeId,
        edges: [
          {
            id: createStableId("edge"),
            sourceNodeId: blendNodeId,
            targetNodeId: outputNodeId
          }
        ],
        nodes: [
          {
            id: idleNodeId,
            name: "Idle",
            kind: "clip",
            clipId: "",
            speed: 1,
            loop: true,
            inPlace: false,
            position: { x: 64, y: 48 }
          },
          {
            id: walkNodeId,
            name: "Walk",
            kind: "clip",
            clipId: "",
            speed: 1,
            loop: true,
            inPlace: false,
            position: { x: 64, y: 184 }
          },
          {
            id: runNodeId,
            name: "Run",
            kind: "clip",
            clipId: "",
            speed: 1,
            loop: true,
            inPlace: false,
            position: { x: 64, y: 320 }
          },
          {
            id: blendNodeId,
            name: "Locomotion Blend",
            kind: "blend1d",
            parameterId: speedParameterId,
            children: [
              { nodeId: idleNodeId, threshold: 0, label: "Idle" },
              { nodeId: walkNodeId, threshold: 0.5, label: "Walk" },
              { nodeId: runNodeId, threshold: 1, label: "Run" }
            ],
            position: { x: 360, y: 176 }
          },
          {
            id: outputNodeId,
            name: "Output",
            kind: "output",
            sourceNodeId: blendNodeId,
            position: { x: 640, y: 176 }
          }
        ]
      }
    ],
    layers: [
      {
        id: createStableId("layer"),
        name: "Base",
        graphId,
        weight: 1,
        blendMode: "override",
        rootMotionMode: "full",
        enabled: true
      }
    ]
  };
}
