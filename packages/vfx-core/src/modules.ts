import type { CompileDiagnostic, CompiledBudgetReport, ModuleInstance, VfxEffectDocument } from "@ggez/vfx-schema";

export type ModuleDescriptor = {
  kind: ModuleInstance["kind"];
  stage: "death" | "event" | "initialize" | "spawn" | "update";
  reads: string[];
  writes: string[];
  summary: string;
};

export const BUILTIN_ATTRIBUTE_TYPES: Record<string, "bool" | "float" | "float2" | "float3" | "float4" | "int" | "uint"> = {
  age: "float",
  alive: "bool",
  alpha: "float",
  color: "float4",
  lifetime: "float",
  normal: "float3",
  position: "float3",
  ribbonId: "uint",
  ribbonU: "float",
  rotation: "float",
  seed: "uint",
  size: "float2",
  sortKey: "float",
  spriteFrame: "float",
  velocity: "float3"
};

export const MODULE_DESCRIPTORS: Record<ModuleInstance["kind"], ModuleDescriptor> = {
  AlphaOverLife: { kind: "AlphaOverLife", stage: "update", reads: ["age", "lifetime"], writes: ["alpha"], summary: "Curves alpha over normalized lifetime." },
  Attractor: { kind: "Attractor", stage: "update", reads: ["position", "velocity"], writes: ["velocity"], summary: "Pulls particles toward a target or field sample." },
  CollisionBounce: { kind: "CollisionBounce", stage: "update", reads: ["position", "velocity"], writes: ["position", "velocity"], summary: "Applies collision bounce response after a collision query." },
  CollisionQuery: { kind: "CollisionQuery", stage: "update", reads: ["position", "velocity"], writes: ["position"], summary: "Samples collision data against the selected collision interface." },
  ColorOverLife: { kind: "ColorOverLife", stage: "update", reads: ["age", "lifetime"], writes: ["color"], summary: "Curves color over normalized lifetime." },
  CurlNoiseForce: { kind: "CurlNoiseForce", stage: "update", reads: ["position", "velocity"], writes: ["velocity"], summary: "Applies curl noise force to the particle velocity." },
  Drag: { kind: "Drag", stage: "update", reads: ["velocity"], writes: ["velocity"], summary: "Damps velocity over time." },
  GravityForce: { kind: "GravityForce", stage: "update", reads: ["velocity"], writes: ["velocity"], summary: "Applies gravity or directional acceleration." },
  InheritVelocity: { kind: "InheritVelocity", stage: "initialize", reads: [], writes: ["velocity"], summary: "Seeds velocity from the spawn source binding." },
  KillByAge: { kind: "KillByAge", stage: "death", reads: ["age", "lifetime"], writes: ["alive"], summary: "Kills particles whose age exceeds lifetime." },
  KillByDistance: { kind: "KillByDistance", stage: "death", reads: ["position"], writes: ["alive"], summary: "Kills particles that exceed a configured distance limit." },
  OrbitTarget: { kind: "OrbitTarget", stage: "update", reads: ["position", "velocity"], writes: ["position", "velocity"], summary: "Orbits a target using tangential velocity." },
  RandomRange: { kind: "RandomRange", stage: "initialize", reads: ["seed"], writes: [], summary: "Produces a deterministic random sample for subsequent modules." },
  ReceiveEvent: { kind: "ReceiveEvent", stage: "event", reads: [], writes: [], summary: "Consumes an effect or gameplay event payload." },
  RibbonLink: { kind: "RibbonLink", stage: "update", reads: ["position", "ribbonId"], writes: ["ribbonU"], summary: "Builds ribbon continuity data from particle order." },
  SendEvent: { kind: "SendEvent", stage: "event", reads: [], writes: [], summary: "Emits an effect event when stage conditions are met." },
  SetAttribute: { kind: "SetAttribute", stage: "initialize", reads: [], writes: [], summary: "Writes explicit particle attributes from constants or parameters." },
  SizeOverLife: { kind: "SizeOverLife", stage: "update", reads: ["age", "lifetime"], writes: ["size"], summary: "Curves particle size over normalized lifetime." },
  SpawnBurst: { kind: "SpawnBurst", stage: "spawn", reads: [], writes: [], summary: "Emits an instantaneous burst of particles." },
  SpawnCone: { kind: "SpawnCone", stage: "spawn", reads: [], writes: ["position"], summary: "Generates spawn positions inside a cone volume." },
  SpawnFromBone: { kind: "SpawnFromBone", stage: "spawn", reads: [], writes: ["position"], summary: "Spawns particles from one or more skeletal bones." },
  SpawnFromMeshSurface: { kind: "SpawnFromMeshSurface", stage: "spawn", reads: [], writes: ["position", "normal"], summary: "Samples positions and normals from a mesh surface." },
  SpawnFromSpline: { kind: "SpawnFromSpline", stage: "spawn", reads: [], writes: ["position"], summary: "Samples a spline position and tangent for spawn." },
  SpawnRate: { kind: "SpawnRate", stage: "spawn", reads: [], writes: [], summary: "Continuously emits particles at a configured rate." },
  VelocityCone: { kind: "VelocityCone", stage: "initialize", reads: [], writes: ["velocity"], summary: "Seeds velocity from a cone distribution." }
};

export function getModuleDescriptor(kind: ModuleInstance["kind"]): ModuleDescriptor {
  return MODULE_DESCRIPTORS[kind];
}

export function inferAttributeMap(document: VfxEffectDocument) {
  const result = new Map<string, (typeof BUILTIN_ATTRIBUTE_TYPES)[keyof typeof BUILTIN_ATTRIBUTE_TYPES]>();

  Object.entries(BUILTIN_ATTRIBUTE_TYPES).forEach(([name, type]) => {
    result.set(name, type);
  });

  document.emitters.forEach((emitter: VfxEffectDocument["emitters"][number]) => {
    Object.entries(emitter.attributes).forEach(([name, type]) => {
      result.set(name, type);
    });
  });

  return result;
}

export function estimateEmitterBudget(input: {
  collisionEnabled: boolean;
  rendererKinds: string[];
  capacity: number;
  moduleCount: number;
  sortingEnabled: boolean;
}): CompiledBudgetReport {
  const estimatedUpdateCost = input.capacity * Math.max(1, input.moduleCount);
  const ribbonEnabled = input.rendererKinds.includes("ribbon");
  const overdrawRisk =
    input.rendererKinds.includes("sprite") && input.capacity > 4096
      ? "high"
      : input.rendererKinds.includes("sprite")
        ? "medium"
        : "low";

  return {
    maxParticles: input.capacity,
    peakSpawnPerFrame: Math.max(32, Math.round(input.capacity * 0.12)),
    estimatedUpdateCost,
    estimatedMemoryBytes: input.capacity * 96,
    collisionCost: input.collisionEnabled ? (input.capacity > 4096 ? "high" : "medium") : "none",
    ribbonCost: ribbonEnabled ? (input.capacity > 2048 ? "high" : "medium") : "none",
    sortCost: input.sortingEnabled ? (input.capacity > 4096 ? "high" : "medium") : "none",
    pipelineRisk: input.rendererKinds.length > 2 ? "medium" : "low",
    overdrawRisk
  };
}

export function collectDesignDiagnostics(document: VfxEffectDocument): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];

  document.emitters.forEach((emitter: VfxEffectDocument["emitters"][number]) => {
    if (emitter.maxParticleCount > document.budgets.maxParticles) {
      diagnostics.push({
        severity: "warning",
        message: `Emitter "${emitter.name}" capacity exceeds the effect particle budget.`,
        location: `emitters.${emitter.id}.maxParticleCount`
      });
    }

    if (emitter.renderers.length === 0) {
      diagnostics.push({
        severity: "warning",
        message: `Emitter "${emitter.name}" has no renderer assignment.`,
        location: `emitters.${emitter.id}.renderers`
      });
    }
  });

  if (document.emitters.length === 0) {
    diagnostics.push({
      severity: "error",
      message: "An effect must declare at least one emitter.",
      location: "emitters"
    });
  }

  return diagnostics;
}
