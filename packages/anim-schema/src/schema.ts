import { z } from "zod";

export const ANIMATION_DOCUMENT_VERSION = 1;
export const ANIMATION_GRAPH_VERSION = 1;
export const ANIMATION_ARTIFACT_VERSION = 1;
export const ANIMATION_ARTIFACT_FORMAT = "ggez.animation.artifact";
export const ANIMATION_BUNDLE_VERSION = 1;
export const ANIMATION_BUNDLE_FORMAT = "ggez.animation.bundle";

export const animationParameterTypeSchema = z.enum(["float", "int", "bool", "trigger"]);
export const animationBlendModeSchema = z.enum(["override", "additive"]);
export const rootMotionModeSchema = z.enum(["none", "full", "xz", "xz-yaw"]);
export const transitionOperatorSchema = z.enum([
  ">",
  ">=",
  "<",
  "<=",
  "==",
  "!=",
  "set"
]);
export const interruptionSourceSchema = z.enum(["none", "current", "next", "both"]);
export const transitionBlendCurveSchema = z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]);
export const strideWarpEvaluationModeSchema = z.enum(["graph", "manual"]);

export const vec2Schema = z.object({
  x: z.number(),
  y: z.number()
});

export const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const secondaryDynamicsChainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootBoneName: z.string().min(1),
  tipBoneName: z.string().min(1),
  damping: z.number().min(0).max(0.999).default(0.82),
  stiffness: z.number().min(0).max(1).default(0.2),
  gravityScale: z.number().min(0).max(4).default(0.35),
  inertia: vec3Schema.default({ x: 0.35, y: 0.15, z: 0.5 }),
  limitAngleRadians: z.number().min(0.05).max(Math.PI).default(Math.PI / 3),
  enabled: z.boolean().default(true)
});

export const secondaryDynamicsSphereColliderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  boneName: z.string().min(1),
  offset: vec3Schema.default({ x: 0, y: 0, z: 0 }),
  radius: z.number().positive().default(0.12),
  enabled: z.boolean().default(true)
});

export const secondaryDynamicsProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iterations: z.number().int().min(1).max(12).default(4),
  chains: z.array(secondaryDynamicsChainSchema).default([]),
  sphereColliders: z.array(secondaryDynamicsSphereColliderSchema).default([])
});

export const quatSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  w: z.number()
});

const vec3TupleSchema = z.tuple([z.number(), z.number(), z.number()]);
const quat4TupleSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const parameterDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: animationParameterTypeSchema,
  defaultValue: z.union([z.number(), z.boolean()]).optional(),
  smoothingDuration: z.number().nonnegative().optional()
});

export const clipReferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration: z.number().nonnegative(),
  source: z.string().optional()
});

export const maskWeightSchema = z.object({
  boneName: z.string().min(1),
  weight: z.number().min(0).max(1)
});

export const boneMaskDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootBoneName: z.string().optional(),
  includeChildren: z.boolean().default(true),
  weights: z.array(maskWeightSchema).default([])
});

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional()
});

const graphNodeBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: vec2Schema,
  size: vec2Schema.optional(),
  comment: z.string().optional(),
  collapsed: z.boolean().optional(),
  color: z.string().optional()
});

export const clipNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("clip"),
  clipId: z.string(),
  speed: z.number().default(1),
  loop: z.boolean().default(true),
  inPlace: z.boolean().default(false),
  syncGroup: z.string().min(1).optional()
});

export const blend1DChildSchema = z.object({
  nodeId: z.string().min(1),
  threshold: z.number(),
  label: z.string().optional()
});

export const blend1DNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("blend1d"),
  parameterId: z.string(),
  children: z.array(blend1DChildSchema).default([]),
  syncGroup: z.string().min(1).optional()
});

export const blend2DChildSchema = z.object({
  nodeId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  label: z.string().optional()
});

export const blend2DNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("blend2d"),
  xParameterId: z.string(),
  yParameterId: z.string(),
  children: z.array(blend2DChildSchema).default([]),
  syncGroup: z.string().min(1).optional()
});

export const selectorChildSchema = z.object({
  nodeId: z.string().min(1),
  value: z.number().int(),
  label: z.string().optional()
});

export const selectorNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("selector"),
  parameterId: z.string(),
  children: z.array(selectorChildSchema).default([]),
  syncGroup: z.string().min(1).optional()
});

export const orientationWarpLegSchema = z.object({
  upperBoneName: z.string().min(1),
  lowerBoneName: z.string().min(1),
  footBoneName: z.string().min(1),
  weight: z.number().min(0).max(1).default(1)
});

export const strideWarpLegSchema = z.object({
  upperBoneName: z.string().min(1),
  lowerBoneName: z.string().min(1),
  footBoneName: z.string().min(1),
  weight: z.number().min(0).max(1).default(1)
});

export const orientationWarpNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("orientationWarp"),
  sourceNodeId: z.string().min(1).optional(),
  angleParameterId: z.string(),
  maxAngle: z.number().positive().default(Math.PI / 2),
  weight: z.number().min(0).max(1).default(1),
  hipBoneName: z.string().min(1).optional(),
  hipWeight: z.number().min(0).max(1).default(0.35),
  spineBoneNames: z.array(z.string().min(1)).default([]),
  legs: z.array(orientationWarpLegSchema).default([])
});

export const strideWarpNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("strideWarp"),
  sourceNodeId: z.string().min(1).optional(),
  evaluationMode: strideWarpEvaluationModeSchema.default("graph"),
  locomotionSpeedParameterId: z.string().min(1).optional(),
  strideDirection: vec2Schema.default({ x: 0, y: 1 }),
  manualStrideScale: z.number().positive().default(1),
  minLocomotionSpeedThreshold: z.number().nonnegative().default(0.01),
  pelvisBoneName: z.string().min(1).optional(),
  pelvisWeight: z.number().min(0).max(1).default(0.35),
  clampResult: z.boolean().default(false),
  minStrideScale: z.number().positive().default(0.5),
  maxStrideScale: z.number().positive().default(2),
  interpResult: z.boolean().default(false),
  interpSpeedIncreasing: z.number().nonnegative().default(6),
  interpSpeedDecreasing: z.number().nonnegative().default(6),
  legs: z.array(strideWarpLegSchema).default([])
});

export const secondaryDynamicsNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("secondaryDynamics"),
  sourceNodeId: z.string().min(1).optional(),
  profileId: z.string().min(1),
  weight: z.number().min(0).max(1).default(1),
  dampingScale: z.number().min(0).max(4).default(1),
  stiffnessScale: z.number().min(0).max(4).default(1),
  gravityScale: z.number().min(0).max(4).default(1),
  iterations: z.number().int().min(1).max(12).default(4)
});

export const transitionConditionSchema = z.object({
  parameterId: z.string().min(1),
  operator: transitionOperatorSchema,
  value: z.union([z.number(), z.boolean()]).optional()
});

export const stateMachineStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  motionNodeId: z.string(),
  position: vec2Schema.optional(),
  speed: z.number().default(1),
  cycleOffset: z.number().default(0),
  syncGroup: z.string().min(1).optional()
});

export const stateMachineTransitionSchema = z.object({
  id: z.string().min(1),
  fromStateId: z.string().optional(),
  toStateId: z.string(),
  duration: z.number().nonnegative().default(0.15),
  blendCurve: transitionBlendCurveSchema.default("linear"),
  syncNormalizedTime: z.boolean().default(false),
  hasExitTime: z.boolean().default(false),
  exitTime: z.number().min(0).max(1).optional(),
  interruptionSource: interruptionSourceSchema.default("none"),
  conditions: z.array(transitionConditionSchema).default([])
});

export const stateMachineNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("stateMachine"),
  entryStateId: z.string(),
  states: z.array(stateMachineStateSchema).default([]),
  transitions: z.array(stateMachineTransitionSchema).default([]),
  anyStateTransitions: z.array(stateMachineTransitionSchema).default([])
});

export const subgraphNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("subgraph"),
  graphId: z.string(),
  syncGroup: z.string().min(1).optional()
});

export const outputNodeSchema = graphNodeBaseSchema.extend({
  kind: z.literal("output"),
  sourceNodeId: z.string().optional()
});

export const graphNodeSchema = z.discriminatedUnion("kind", [
  clipNodeSchema,
  blend1DNodeSchema,
  blend2DNodeSchema,
  selectorNodeSchema,
  orientationWarpNodeSchema,
  strideWarpNodeSchema,
  secondaryDynamicsNodeSchema,
  stateMachineNodeSchema,
  subgraphNodeSchema,
  outputNodeSchema
]);

export const editorGraphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  outputNodeId: z.string().min(1),
  nodes: z.array(graphNodeSchema).default([]),
  edges: z.array(graphEdgeSchema).default([])
});

export const editorLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  graphId: z.string().min(1),
  weight: z.number().min(0).max(1).default(1),
  blendMode: animationBlendModeSchema.default("override"),
  maskId: z.string().min(1).optional(),
  rootMotionMode: rootMotionModeSchema.default("none"),
  enabled: z.boolean().default(true)
});

export const serializableRigSchema = z.object({
  boneNames: z.array(z.string().min(1)),
  parentIndices: z.array(z.number().int()),
  rootBoneIndex: z.number().int().nonnegative(),
  bindTranslations: z.array(z.number()),
  bindRotations: z.array(z.number()),
  bindScales: z.array(z.number())
});

export const clipTrackSchema = z.object({
  boneIndex: z.number().int().nonnegative(),
  translationTimes: z.array(z.number()).optional(),
  translationValues: z.array(z.number()).optional(),
  rotationTimes: z.array(z.number()).optional(),
  rotationValues: z.array(z.number()).optional(),
  scaleTimes: z.array(z.number()).optional(),
  scaleValues: z.array(z.number()).optional()
});

export const serializableClipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration: z.number().nonnegative(),
  rootBoneIndex: z.number().int().nonnegative().optional(),
  tracks: z.array(clipTrackSchema)
});

export const animationEditorDocumentSchema = z.object({
  version: z.literal(ANIMATION_DOCUMENT_VERSION),
  name: z.string().min(1),
  entryGraphId: z.string().min(1),
  rig: serializableRigSchema.optional(),
  parameters: z.array(parameterDefinitionSchema).default([]),
  clips: z.array(clipReferenceSchema).default([]),
  masks: z.array(boneMaskDefinitionSchema).default([]),
  dynamicsProfiles: z.array(secondaryDynamicsProfileSchema).default([]),
  graphs: z.array(editorGraphSchema).min(1),
  layers: z.array(editorLayerSchema).min(1),
  metadata: z
    .object({
      createdAt: z.string().optional(),
      updatedAt: z.string().optional()
    })
    .optional()
});

export const compiledConditionSchema = z.object({
  parameterIndex: z.number().int().nonnegative(),
  operator: transitionOperatorSchema,
  value: z.union([z.number(), z.boolean()]).optional()
});

export const compiledTransitionSchema = z.object({
  fromStateIndex: z.number().int().min(-1),
  toStateIndex: z.number().int().nonnegative(),
  duration: z.number().nonnegative(),
  blendCurve: transitionBlendCurveSchema.default("linear"),
  syncNormalizedTime: z.boolean().default(false),
  hasExitTime: z.boolean(),
  exitTime: z.number().min(0).max(1).optional(),
  interruptionSource: interruptionSourceSchema,
  conditions: z.array(compiledConditionSchema)
});

export const compiledStateSchema = z.object({
  name: z.string().min(1),
  motionNodeIndex: z.number().int().min(-1),
  speed: z.number(),
  cycleOffset: z.number(),
  syncGroup: z.string().min(1).optional()
});

export const compiledClipNodeSchema = z.object({
  type: z.literal("clip"),
  clipIndex: z.number().int().nonnegative(),
  speed: z.number(),
  loop: z.boolean(),
  inPlace: z.boolean().default(false),
  syncGroup: z.string().min(1).optional()
});

export const compiledBlend1DNodeSchema = z.object({
  type: z.literal("blend1d"),
  parameterIndex: z.number().int().nonnegative(),
  children: z
    .array(
      z.object({
        nodeIndex: z.number().int().nonnegative(),
        threshold: z.number()
      })
    )
    .min(1),
  syncGroup: z.string().min(1).optional()
});

export const compiledBlend2DNodeSchema = z.object({
  type: z.literal("blend2d"),
  xParameterIndex: z.number().int().nonnegative(),
  yParameterIndex: z.number().int().nonnegative(),
  children: z
    .array(
      z.object({
        nodeIndex: z.number().int().nonnegative(),
        x: z.number(),
        y: z.number()
      })
    )
    .min(1),
  syncGroup: z.string().min(1).optional()
});

export const compiledSelectorNodeSchema = z.object({
  type: z.literal("selector"),
  parameterIndex: z.number().int().nonnegative(),
  children: z
    .array(
      z.object({
        nodeIndex: z.number().int().nonnegative(),
        value: z.number().int()
      })
  )
    .min(1),
  syncGroup: z.string().min(1).optional()
});

export const compiledOrientationWarpLegSchema = z.object({
  upperBoneIndex: z.number().int().nonnegative(),
  lowerBoneIndex: z.number().int().nonnegative(),
  footBoneIndex: z.number().int().nonnegative(),
  weight: z.number().min(0).max(1)
});

export const compiledOrientationWarpNodeSchema = z.object({
  type: z.literal("orientationWarp"),
  sourceNodeIndex: z.number().int().nonnegative(),
  parameterIndex: z.number().int().nonnegative(),
  maxAngle: z.number().positive(),
  weight: z.number().min(0).max(1),
  hipBoneIndex: z.number().int().nonnegative().optional(),
  hipWeight: z.number().min(0).max(1),
  spineBoneIndices: z.array(z.number().int().nonnegative()),
  legs: z.array(compiledOrientationWarpLegSchema)
});

export const compiledStrideWarpLegSchema = z.object({
  upperBoneIndex: z.number().int().nonnegative(),
  lowerBoneIndex: z.number().int().nonnegative(),
  footBoneIndex: z.number().int().nonnegative(),
  weight: z.number().min(0).max(1)
});

export const compiledStrideWarpNodeSchema = z.object({
  type: z.literal("strideWarp"),
  sourceNodeIndex: z.number().int().nonnegative(),
  evaluationMode: strideWarpEvaluationModeSchema,
  locomotionSpeedParameterIndex: z.number().int().nonnegative().optional(),
  strideDirection: vec2Schema,
  manualStrideScale: z.number().positive(),
  minLocomotionSpeedThreshold: z.number().nonnegative(),
  pelvisBoneIndex: z.number().int().nonnegative().optional(),
  pelvisWeight: z.number().min(0).max(1),
  clampResult: z.boolean(),
  minStrideScale: z.number().positive(),
  maxStrideScale: z.number().positive(),
  interpResult: z.boolean(),
  interpSpeedIncreasing: z.number().nonnegative(),
  interpSpeedDecreasing: z.number().nonnegative(),
  legs: z.array(compiledStrideWarpLegSchema)
});

export const compiledSecondaryDynamicsChainSchema = z.object({
  name: z.string().min(1),
  boneIndices: z.array(z.number().int().nonnegative()).min(2),
  restLengths: z.array(z.number().positive()).min(1),
  damping: z.number().min(0).max(0.999),
  stiffness: z.number().min(0).max(1),
  gravityScale: z.number().min(0),
  inertia: vec3Schema,
  limitAngleRadians: z.number().min(0.05).max(Math.PI),
  enabled: z.boolean()
});

export const compiledSecondaryDynamicsSphereColliderSchema = z.object({
  name: z.string().min(1),
  boneIndex: z.number().int().nonnegative(),
  offset: vec3Schema,
  radius: z.number().positive(),
  enabled: z.boolean()
});

export const compiledSecondaryDynamicsProfileSchema = z.object({
  name: z.string().min(1),
  iterations: z.number().int().min(1).max(12),
  chains: z.array(compiledSecondaryDynamicsChainSchema),
  sphereColliders: z.array(compiledSecondaryDynamicsSphereColliderSchema)
});

export const compiledSecondaryDynamicsNodeSchema = z.object({
  type: z.literal("secondaryDynamics"),
  sourceNodeIndex: z.number().int().nonnegative(),
  profileIndex: z.number().int().nonnegative(),
  weight: z.number().min(0).max(1),
  dampingScale: z.number().min(0),
  stiffnessScale: z.number().min(0),
  gravityScale: z.number().min(0),
  iterations: z.number().int().min(1).max(12)
});

export const compiledStateMachineNodeSchema = z.object({
  type: z.literal("stateMachine"),
  machineIndex: z.number().int().nonnegative(),
  entryStateIndex: z.number().int().nonnegative(),
  states: z.array(compiledStateSchema).min(1),
  transitions: z.array(compiledTransitionSchema),
  anyStateTransitions: z.array(compiledTransitionSchema)
});

export const compiledSubgraphNodeSchema = z.object({
  type: z.literal("subgraph"),
  graphIndex: z.number().int().nonnegative(),
  syncGroup: z.string().min(1).optional()
});

export const compiledGraphNodeSchema = z.discriminatedUnion("type", [
  compiledClipNodeSchema,
  compiledBlend1DNodeSchema,
  compiledBlend2DNodeSchema,
  compiledSelectorNodeSchema,
  compiledOrientationWarpNodeSchema,
  compiledStrideWarpNodeSchema,
  compiledSecondaryDynamicsNodeSchema,
  compiledStateMachineNodeSchema,
  compiledSubgraphNodeSchema
]);

export const compiledMotionGraphSchema = z.object({
  name: z.string().min(1),
  rootNodeIndex: z.number().int().nonnegative(),
  nodes: z.array(compiledGraphNodeSchema)
});

export const compiledBoneMaskSchema = z.object({
  name: z.string().min(1),
  weights: z.array(z.number().min(0).max(1))
});

export const compiledLayerSchema = z.object({
  name: z.string().min(1),
  graphIndex: z.number().int().nonnegative(),
  weight: z.number().min(0).max(1),
  blendMode: animationBlendModeSchema,
  maskIndex: z.number().int().nonnegative().optional(),
  rootMotionMode: rootMotionModeSchema,
  enabled: z.boolean()
});

export const compiledClipSlotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration: z.number().nonnegative()
});

export const compiledParameterSchema = z.object({
  name: z.string().min(1),
  type: animationParameterTypeSchema,
  defaultValue: z.union([z.number(), z.boolean()]).optional(),
  smoothingDuration: z.number().nonnegative().optional()
});

export const compiledAnimatorGraphSchema = z.object({
  version: z.literal(ANIMATION_GRAPH_VERSION),
  name: z.string().min(1),
  rig: serializableRigSchema.optional(),
  parameters: z.array(compiledParameterSchema),
  clipSlots: z.array(compiledClipSlotSchema),
  masks: z.array(compiledBoneMaskSchema),
  dynamicsProfiles: z.array(compiledSecondaryDynamicsProfileSchema),
  graphs: z.array(compiledMotionGraphSchema).min(1),
  layers: z.array(compiledLayerSchema).min(1),
  entryGraphIndex: z.number().int().nonnegative()
});

export const animationArtifactSchema = z.object({
  format: z.literal(ANIMATION_ARTIFACT_FORMAT),
  version: z.literal(ANIMATION_ARTIFACT_VERSION),
  graph: compiledAnimatorGraphSchema,
  rig: serializableRigSchema.optional(),
  clips: z.array(serializableClipSchema).default([])
});

export const animationBundleClipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration: z.number().nonnegative(),
  source: z.string().optional(),
  asset: z.string().min(1).optional()
});

export const animationBundleEquipmentTransformSchema = z.object({
  position: vec3TupleSchema,
  rotation: quat4TupleSchema,
  scale: vec3TupleSchema
});

export const animationBundleEquipmentSocketSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  boneName: z.string().min(1)
});

export const animationBundleEquipmentItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  socketId: z.string().min(1).nullable(),
  enabled: z.boolean(),
  transform: animationBundleEquipmentTransformSchema,
  asset: z.string().min(1).optional()
});

export const animationBundleEquipmentSchema = z.object({
  sockets: z.array(animationBundleEquipmentSocketSchema).default([]),
  items: z.array(animationBundleEquipmentItemSchema).default([])
});

export const animationBundleSchema = z.object({
  format: z.literal(ANIMATION_BUNDLE_FORMAT),
  version: z.literal(ANIMATION_BUNDLE_VERSION),
  name: z.string().min(1),
  artifact: z.string().min(1),
  characterAsset: z.string().min(1).optional(),
  clipData: z.string().min(1).optional(),
  clips: z.array(animationBundleClipSchema).default([]),
  clipAssets: z.record(z.string().min(1)).default({}),
  equipment: animationBundleEquipmentSchema.optional()
});

export type AnimationParameterType = z.infer<typeof animationParameterTypeSchema>;
export type AnimationBlendMode = z.infer<typeof animationBlendModeSchema>;
export type RootMotionMode = z.infer<typeof rootMotionModeSchema>;
export type TransitionOperator = z.infer<typeof transitionOperatorSchema>;
export type InterruptionSource = z.infer<typeof interruptionSourceSchema>;
export type TransitionBlendCurve = z.infer<typeof transitionBlendCurveSchema>;

export type ParameterDefinition = z.infer<typeof parameterDefinitionSchema>;
export type ClipReference = z.infer<typeof clipReferenceSchema>;
export type BoneMaskDefinition = z.infer<typeof boneMaskDefinitionSchema>;
export type SecondaryDynamicsChain = z.infer<typeof secondaryDynamicsChainSchema>;
export type SecondaryDynamicsSphereCollider = z.infer<typeof secondaryDynamicsSphereColliderSchema>;
export type SecondaryDynamicsProfile = z.infer<typeof secondaryDynamicsProfileSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type EditorGraphNode = z.infer<typeof graphNodeSchema>;
export type EditorGraph = z.infer<typeof editorGraphSchema>;
export type EditorLayer = z.infer<typeof editorLayerSchema>;
export type SerializableRig = z.infer<typeof serializableRigSchema>;
export type SerializableClip = z.infer<typeof serializableClipSchema>;
export type AnimationEditorDocument = z.infer<typeof animationEditorDocumentSchema>;
export type CompiledCondition = z.infer<typeof compiledConditionSchema>;
export type CompiledTransition = z.infer<typeof compiledTransitionSchema>;
export type CompiledState = z.infer<typeof compiledStateSchema>;
export type CompiledSecondaryDynamicsChain = z.infer<typeof compiledSecondaryDynamicsChainSchema>;
export type CompiledSecondaryDynamicsSphereCollider = z.infer<typeof compiledSecondaryDynamicsSphereColliderSchema>;
export type CompiledSecondaryDynamicsProfile = z.infer<typeof compiledSecondaryDynamicsProfileSchema>;
export type CompiledSecondaryDynamicsNode = z.infer<typeof compiledSecondaryDynamicsNodeSchema>;
export type CompiledGraphNode = z.infer<typeof compiledGraphNodeSchema>;
export type CompiledMotionGraph = z.infer<typeof compiledMotionGraphSchema>;
export type CompiledBoneMask = z.infer<typeof compiledBoneMaskSchema>;
export type CompiledLayer = z.infer<typeof compiledLayerSchema>;
export type CompiledClipSlot = z.infer<typeof compiledClipSlotSchema>;
export type CompiledParameter = z.infer<typeof compiledParameterSchema>;
export type CompiledAnimatorGraph = z.infer<typeof compiledAnimatorGraphSchema>;
export type AnimationArtifact = z.infer<typeof animationArtifactSchema>;
export type AnimationBundleClip = z.infer<typeof animationBundleClipSchema>;
export type AnimationBundleEquipmentTransform = z.infer<typeof animationBundleEquipmentTransformSchema>;
export type AnimationBundleEquipmentSocket = z.infer<typeof animationBundleEquipmentSocketSchema>;
export type AnimationBundleEquipmentItem = z.infer<typeof animationBundleEquipmentItemSchema>;
export type AnimationBundleEquipment = z.infer<typeof animationBundleEquipmentSchema>;
export type AnimationBundle = z.infer<typeof animationBundleSchema>;

export function parseAnimationEditorDocument(input: unknown): AnimationEditorDocument {
  return animationEditorDocumentSchema.parse(input);
}

export function parseCompiledAnimatorGraph(input: unknown): CompiledAnimatorGraph {
  return compiledAnimatorGraphSchema.parse(input);
}

export function parseAnimationArtifact(input: unknown): AnimationArtifact {
  return animationArtifactSchema.parse(input);
}

export function parseAnimationBundle(input: unknown): AnimationBundle {
  return animationBundleSchema.parse(input);
}
