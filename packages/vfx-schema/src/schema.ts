import { z } from "zod";

export const VFX_DOCUMENT_VERSION = 1;
export const VFX_EFFECT_VERSION = 1;
export const VFX_ARTIFACT_VERSION = 1;
export const VFX_ARTIFACT_FORMAT = "ggez.vfx.artifact";
export const VFX_BUNDLE_VERSION = 1;
export const VFX_BUNDLE_FORMAT = "ggez.vfx.bundle";

export const vec2Schema = z.object({
  x: z.number(),
  y: z.number()
});

export const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const vfxParameterTypeSchema = z.enum([
  "bool",
  "color",
  "float",
  "float2",
  "float3",
  "int",
  "trigger"
]);

export const vfxValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  vec2Schema,
  vec3Schema,
  z.array(z.number())
]);

export const vfxAttributeTypeSchema = z.enum([
  "bool",
  "float",
  "float2",
  "float3",
  "float4",
  "int",
  "uint"
]);

export const emitterSimulationDomainSchema = z.enum(["beam", "particle", "ribbon"]);
export const emitterStageKindSchema = z.enum(["death", "initialize", "spawn", "update"]);
export const emitterEventStageKindSchema = z.enum(["collision", "event", "manual", "spawned"]);
export const rendererKindSchema = z.enum(["beam", "distortion", "mesh", "ribbon", "sprite"]);
export const rendererTemplateSchema = z.enum([
  "BeamMaterial",
  "DistortionMaterial",
  "MeshParticleMaterial",
  "RibbonTrailMaterial",
  "SpriteAdditiveMaterial",
  "SpriteSmokeMaterial"
]);
export const dataInterfaceKindSchema = z.enum([
  "animationNotify",
  "bone",
  "collisionField",
  "depthBuffer",
  "meshSurface",
  "spline",
  "worldZone"
]);
export const sourceBindingKindSchema = z.enum(["bone", "mesh", "socket", "spline", "world"]);
export const materialBlendModeSchema = z.enum(["additive", "alpha", "premultiplied"]);
export const materialLightingModeSchema = z.enum(["lit", "unlit"]);
export const sortModeSchema = z.enum(["age-desc", "back-to-front", "none"]);
export const cameraFacingModeSchema = z.enum(["camera-plane", "full", "none", "velocity-aligned"]);
export const scalabilityTierSchema = z.enum(["cinematic", "high", "low", "medium"]);
export const fallbackActionSchema = z.enum([
  "clamp-spawn",
  "disable-collision",
  "disable-ribbons",
  "drop-mesh-renderer",
  "reduce-capacity",
  "switch-renderer-template"
]);
export const moduleKindSchema = z.enum([
  "AlphaOverLife",
  "Attractor",
  "CollisionBounce",
  "CollisionQuery",
  "ColorOverLife",
  "CurlNoiseForce",
  "Drag",
  "GravityForce",
  "InheritVelocity",
  "KillByAge",
  "KillByDistance",
  "OrbitTarget",
  "RandomRange",
  "ReceiveEvent",
  "RibbonLink",
  "SendEvent",
  "SetAttribute",
  "SizeOverLife",
  "SpawnBurst",
  "SpawnCone",
  "SpawnFromBone",
  "SpawnFromMeshSurface",
  "SpawnFromSpline",
  "SpawnRate",
  "VelocityCone"
]);
export const compileDiagnosticSeveritySchema = z.enum(["error", "info", "warning"]);

export const vfxParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: vfxParameterTypeSchema,
  defaultValue: vfxValueSchema.optional(),
  exposed: z.boolean().default(true),
  description: z.string().optional()
});

export const vfxEventDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  payload: z.record(z.string(), vfxAttributeTypeSchema).default({}),
  description: z.string().optional()
});

export const moduleInstanceSchema = z.object({
  id: z.string().min(1),
  kind: moduleKindSchema,
  enabled: z.boolean().default(true),
  label: z.string().optional(),
  config: z.record(z.string(), z.unknown()).default({})
});

export const emitterEventHandlerSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  stage: emitterEventStageKindSchema.default("event"),
  modules: z.array(moduleInstanceSchema).default([])
});

export const rendererMaterialSettingsSchema = z.object({
  blendMode: materialBlendModeSchema.default("additive"),
  lightingMode: materialLightingModeSchema.default("unlit"),
  softParticles: z.boolean().default(false),
  depthFade: z.boolean().default(false),
  flipbook: z.boolean().default(false),
  distortion: z.boolean().default(false),
  emissive: z.boolean().default(true),
  facingMode: cameraFacingModeSchema.default("full"),
  sortMode: sortModeSchema.default("none")
});

export const rendererFlipbookPlaybackModeSchema = z.enum(["particle-age", "scene-time"]);

export const rendererFlipbookSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  rows: z.number().int().positive().default(1),
  cols: z.number().int().positive().default(1),
  fps: z.number().positive().default(12),
  looping: z.boolean().default(true),
  playbackMode: rendererFlipbookPlaybackModeSchema.default("particle-age")
});

export const rendererSlotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: rendererKindSchema,
  template: rendererTemplateSchema,
  enabled: z.boolean().default(true),
  material: rendererMaterialSettingsSchema.default({}),
  flipbookSettings: rendererFlipbookSettingsSchema.default({}),
  parameterBindings: z.record(z.string(), z.string()).default({})
});

export const dataInterfaceBindingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: dataInterfaceKindSchema,
  config: z.record(z.string(), z.unknown()).default({})
});

export const sourceBindingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: sourceBindingKindSchema,
  sourceId: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({})
});

export const emitterStageSchema = z.object({
  modules: z.array(moduleInstanceSchema).default([])
});

export const emitterDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  simulationDomain: emitterSimulationDomainSchema.default("particle"),
  maxParticleCount: z.number().int().positive().default(4096),
  fixedBounds: z
    .object({
      min: vec3Schema,
      max: vec3Schema
    })
    .optional(),
  attributes: z.record(z.string(), vfxAttributeTypeSchema).default({}),
  spawnStage: emitterStageSchema.default({}),
  initializeStage: emitterStageSchema.default({}),
  updateStage: emitterStageSchema.default({}),
  deathStage: emitterStageSchema.default({}),
  eventHandlers: z.array(emitterEventHandlerSchema).default([]),
  renderers: z.array(rendererSlotSchema).default([]),
  sourceBindings: z.array(sourceBindingSchema).default([]),
  dataInterfaces: z.array(dataInterfaceBindingSchema).default([])
});

export const effectGraphNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("comment"),
    name: z.string().min(1),
    position: vec2Schema,
    color: z.string().optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("dataInterface"),
    name: z.string().min(1),
    position: vec2Schema,
    bindingId: z.string().min(1).optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("emitter"),
    name: z.string().min(1),
    position: vec2Schema,
    emitterId: z.string().min(1)
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("event"),
    name: z.string().min(1),
    position: vec2Schema,
    eventId: z.string().min(1).optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("output"),
    name: z.string().min(1),
    position: vec2Schema
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("parameter"),
    name: z.string().min(1),
    position: vec2Schema,
    parameterId: z.string().min(1).optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("scalability"),
    name: z.string().min(1),
    position: vec2Schema
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("subgraph"),
    name: z.string().min(1),
    position: vec2Schema,
    subgraphId: z.string().min(1).optional()
  })
]);

export const effectGraphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label: z.string().optional()
});

export const effectGraphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.array(effectGraphNodeSchema).default([]),
  edges: z.array(effectGraphEdgeSchema).default([])
});

export const previewSettingsSchema = z.object({
  loop: z.boolean().default(true),
  durationSeconds: z.number().positive().default(4),
  attachMode: z.enum(["character", "isolated", "world"]).default("isolated"),
  playbackRate: z.number().positive().default(1),
  backgroundColor: z.string().default("#080e0c")
});

export const fallbackRuleSchema = z.object({
  id: z.string().min(1),
  tier: scalabilityTierSchema,
  action: fallbackActionSchema,
  value: z.union([z.number(), z.string()]).optional()
});

export const scalabilityPolicySchema = z.object({
  tier: scalabilityTierSchema.default("high"),
  maxActiveInstances: z.number().int().positive().default(16),
  preferredTierByDeviceClass: z.record(z.string(), scalabilityTierSchema).default({}),
  fallbacks: z.array(fallbackRuleSchema).default([])
});

export const budgetPolicySchema = z.object({
  maxParticles: z.number().int().positive().default(16384),
  maxSpawnPerFrame: z.number().int().positive().default(1024),
  allowSorting: z.boolean().default(true),
  allowRibbons: z.boolean().default(true),
  allowCollision: z.boolean().default(true)
});

export const vfxEffectDocumentSchema = z.object({
  version: z.literal(VFX_DOCUMENT_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  graph: effectGraphSchema,
  parameters: z.array(vfxParameterSchema).default([]),
  events: z.array(vfxEventDefinitionSchema).default([]),
  emitters: z.array(emitterDocumentSchema).default([]),
  dataInterfaces: z.array(dataInterfaceBindingSchema).default([]),
  subgraphs: z.array(effectGraphSchema).default([]),
  scalability: scalabilityPolicySchema.default({}),
  budgets: budgetPolicySchema.default({}),
  preview: previewSettingsSchema.default({}),
  metadata: z
    .object({
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      tags: z.array(z.string()).default([])
    })
    .optional()
});

export const compileDiagnosticSchema = z.object({
  severity: compileDiagnosticSeveritySchema,
  message: z.string().min(1),
  location: z.string().optional()
});

export const compiledAttributeLayoutSchema = z.object({
  strideFloats: z.number().int().positive(),
  attributes: z.array(
    z.object({
      name: z.string().min(1),
      type: vfxAttributeTypeSchema,
      offsetFloats: z.number().int().nonnegative()
    })
  )
});

export const moduleOpPlanSchema = z.object({
  moduleId: z.string().min(1),
  opcode: z.string().min(1),
  readAttributes: z.array(z.string()).default([]),
  writeAttributes: z.array(z.string()).default([]),
  constants: z.record(z.string(), z.unknown()).default({})
});

export const compiledStagePlanSchema = z.object({
  kind: z.union([emitterStageKindSchema, z.string().regex(/^event:/)]),
  ops: z.array(moduleOpPlanSchema).default([])
});

export const compiledRendererBindingSchema = z.object({
  rendererId: z.string().min(1),
  kind: rendererKindSchema,
  template: rendererTemplateSchema,
  materialSignature: z.string().min(1),
  sortMode: sortModeSchema,
  estimatedOverdrawRisk: z.enum(["high", "low", "medium"]),
  textureBinding: z.string().optional(),
  flipbookSettings: rendererFlipbookSettingsSchema.optional()
});

export const compiledSourceBindingSchema = z.object({
  id: z.string().min(1),
  kind: sourceBindingKindSchema,
  sourceId: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({})
});

export const compiledDataInterfaceRefSchema = z.object({
  id: z.string().min(1),
  kind: dataInterfaceKindSchema,
  config: z.record(z.string(), z.unknown()).default({})
});

export const compiledBudgetReportSchema = z.object({
  maxParticles: z.number().int().positive(),
  peakSpawnPerFrame: z.number().int().nonnegative(),
  estimatedUpdateCost: z.number().nonnegative(),
  estimatedMemoryBytes: z.number().nonnegative(),
  collisionCost: z.enum(["high", "low", "medium", "none"]),
  ribbonCost: z.enum(["high", "low", "medium", "none"]),
  sortCost: z.enum(["high", "low", "medium", "none"]),
  pipelineRisk: z.enum(["high", "low", "medium"]),
  overdrawRisk: z.enum(["high", "low", "medium"])
});

export const compiledEmitterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  simulationDomain: emitterSimulationDomainSchema,
  capacity: z.number().int().positive(),
  attributeLayout: compiledAttributeLayoutSchema,
  stages: z.array(compiledStagePlanSchema).default([]),
  renderers: z.array(compiledRendererBindingSchema).default([]),
  sourceBindings: z.array(compiledSourceBindingSchema).default([]),
  dataInterfaces: z.array(compiledDataInterfaceRefSchema).default([]),
  budgets: compiledBudgetReportSchema
});

export const compiledParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: vfxParameterTypeSchema,
  defaultValue: vfxValueSchema.optional()
});

export const compiledEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  payload: z.record(z.string(), vfxAttributeTypeSchema).default({})
});

export const compiledScalabilityPolicySchema = scalabilityPolicySchema.extend({
  derivedTierOrder: z.array(scalabilityTierSchema).default(["cinematic", "high", "medium", "low"])
});

export const compiledVfxEffectSchema = z.object({
  version: z.literal(VFX_EFFECT_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  parameters: z.array(compiledParameterSchema).default([]),
  events: z.array(compiledEventSchema).default([]),
  emitters: z.array(compiledEmitterSchema).default([]),
  dataInterfaces: z.array(compiledDataInterfaceRefSchema).default([]),
  scalability: compiledScalabilityPolicySchema,
  budgets: compiledBudgetReportSchema
});

export const vfxArtifactSchema = z.object({
  format: z.literal(VFX_ARTIFACT_FORMAT),
  version: z.literal(VFX_ARTIFACT_VERSION),
  effect: compiledVfxEffectSchema
});

export const vfxBundleAssetSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(["atlas", "curve", "mesh", "preview-scene", "texture"])
});

export const vfxBundleSchema = z.object({
  format: z.literal(VFX_BUNDLE_FORMAT),
  version: z.literal(VFX_BUNDLE_VERSION),
  name: z.string().min(1),
  artifact: z.string().min(1),
  assets: z.array(vfxBundleAssetSchema).default([])
});

export type VfxParameter = z.infer<typeof vfxParameterSchema>;
export type VfxEventDefinition = z.infer<typeof vfxEventDefinitionSchema>;
export type ModuleInstance = z.infer<typeof moduleInstanceSchema>;
export type EmitterDocument = z.infer<typeof emitterDocumentSchema>;
export type RendererSlot = z.infer<typeof rendererSlotSchema>;
export type RendererFlipbookSettings = z.infer<typeof rendererFlipbookSettingsSchema>;
export type DataInterfaceBinding = z.infer<typeof dataInterfaceBindingSchema>;
export type SourceBinding = z.infer<typeof sourceBindingSchema>;
export type EffectGraphNode = z.infer<typeof effectGraphNodeSchema>;
export type EffectGraphEdge = z.infer<typeof effectGraphEdgeSchema>;
export type EffectGraph = z.infer<typeof effectGraphSchema>;
export type ScalabilityPolicy = z.infer<typeof scalabilityPolicySchema>;
export type BudgetPolicy = z.infer<typeof budgetPolicySchema>;
export type VfxEffectDocument = z.infer<typeof vfxEffectDocumentSchema>;
export type CompileDiagnostic = z.infer<typeof compileDiagnosticSchema>;
export type CompiledAttributeLayout = z.infer<typeof compiledAttributeLayoutSchema>;
export type ModuleOpPlan = z.infer<typeof moduleOpPlanSchema>;
export type CompiledStagePlan = z.infer<typeof compiledStagePlanSchema>;
export type CompiledRendererBinding = z.infer<typeof compiledRendererBindingSchema>;
export type CompiledSourceBinding = z.infer<typeof compiledSourceBindingSchema>;
export type CompiledDataInterfaceRef = z.infer<typeof compiledDataInterfaceRefSchema>;
export type CompiledBudgetReport = z.infer<typeof compiledBudgetReportSchema>;
export type CompiledEmitter = z.infer<typeof compiledEmitterSchema>;
export type CompiledParameter = z.infer<typeof compiledParameterSchema>;
export type CompiledEvent = z.infer<typeof compiledEventSchema>;
export type CompiledScalabilityPolicy = z.infer<typeof compiledScalabilityPolicySchema>;
export type CompiledVfxEffect = z.infer<typeof compiledVfxEffectSchema>;
export type VfxArtifact = z.infer<typeof vfxArtifactSchema>;
export type VfxBundleAsset = z.infer<typeof vfxBundleAssetSchema>;
export type VfxBundle = z.infer<typeof vfxBundleSchema>;

export function parseVfxEffectDocument(input: unknown): VfxEffectDocument {
  return vfxEffectDocumentSchema.parse(input);
}

export function parseCompiledVfxEffect(input: unknown): CompiledVfxEffect {
  return compiledVfxEffectSchema.parse(input);
}

export function parseVfxArtifact(input: unknown): VfxArtifact {
  return vfxArtifactSchema.parse(input);
}

export function parseVfxBundle(input: unknown): VfxBundle {
  return vfxBundleSchema.parse(input);
}
