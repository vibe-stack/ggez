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
        loop: true
      };
    case "blend1d":
      return {
        ...base,
        kind,
        parameterId: "",
        children: []
      };
    case "blend2d":
      return {
        ...base,
        kind,
        xParameterId: "",
        yParameterId: "",
        children: []
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
            speed: 1,
            cycleOffset: 0,
          },
        ],
        transitions: [],
        anyStateTransitions: []
      };
    case "subgraph":
      return {
        ...base,
        kind,
        graphId: ""
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
      { id: createStableId("param"), name: "speed", type: "float", defaultValue: 0 },
      { id: createStableId("param"), name: "grounded", type: "bool", defaultValue: true }
    ],
    clips: [
      { id: "idle", name: "Idle", duration: 1 },
      { id: "walk", name: "Walk", duration: 1 },
      { id: "run", name: "Run", duration: 1 }
    ],
    masks: [
      {
        id: createStableId("mask"),
        name: "UpperBody",
        includeChildren: true,
        rootBoneName: "spine",
        weights: []
      }
    ],
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
            clipId: "idle",
            speed: 1,
            loop: true,
            position: { x: 64, y: 48 }
          },
          {
            id: walkNodeId,
            name: "Walk",
            kind: "clip",
            clipId: "walk",
            speed: 1,
            loop: true,
            position: { x: 64, y: 184 }
          },
          {
            id: runNodeId,
            name: "Run",
            kind: "clip",
            clipId: "run",
            speed: 1,
            loop: true,
            position: { x: 64, y: 320 }
          },
          {
            id: blendNodeId,
            name: "Locomotion Blend",
            kind: "blend1d",
            parameterId: "",
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
