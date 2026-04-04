import type { EditorGraphNode } from "@ggez/anim-schema";

export type Blend1DNode = Extract<EditorGraphNode, { kind: "blend1d" }>;
export type Blend2DNode = Extract<EditorGraphNode, { kind: "blend2d" }>;
export type SelectorNode = Extract<EditorGraphNode, { kind: "selector" }>;
export type OrientationWarpNode = Extract<EditorGraphNode, { kind: "orientationWarp" }>;
export type StrideWarpNode = Extract<EditorGraphNode, { kind: "strideWarp" }>;
export type StateMachineNode = Extract<EditorGraphNode, { kind: "stateMachine" }>;
export type StateMachineState = StateMachineNode["states"][number];
export type StateMachineTransition = StateMachineNode["transitions"][number];
