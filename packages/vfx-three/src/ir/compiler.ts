import type { CompiledVfxEffect } from "@ggez/vfx-schema";
import type { GpuEmitterExecutionPlan, GpuRuntimePlan, RuntimeOpcode } from "./types";

const OPCODE_MAP: Record<string, RuntimeOpcode> = {
  AlphaOverLife: "alpha-over-life",
  Attractor: "attractor",
  CollisionBounce: "collision-bounce",
  CollisionQuery: "collision-query",
  ColorOverLife: "color-over-life",
  CurlNoiseForce: "curl-noise-force",
  Drag: "drag",
  GravityForce: "gravity-force",
  InheritVelocity: "inherit-velocity",
  KillByAge: "kill-by-age",
  KillByDistance: "kill-by-distance",
  OrbitTarget: "orbit-target",
  RandomRange: "random-range",
  ReceiveEvent: "receive-event",
  RibbonLink: "ribbon-link",
  SendEvent: "send-event",
  SetAttribute: "set-attribute",
  SizeOverLife: "size-over-life",
  SpawnBurst: "spawn-burst",
  SpawnCone: "spawn-cone",
  SpawnFromBone: "spawn-from-bone",
  SpawnFromMeshSurface: "spawn-from-mesh-surface",
  SpawnFromSpline: "spawn-from-spline",
  SpawnRate: "spawn-rate",
  VelocityCone: "velocity-cone"
};

const GPU_SUPPORTED_OPCODES = new Set<RuntimeOpcode>([
  "alpha-over-life",
  "color-over-life",
  "curl-noise-force",
  "drag",
  "gravity-force",
  "kill-by-age",
  "orbit-target",
  "send-event",
  "set-attribute",
  "size-over-life",
  "spawn-burst",
  "spawn-cone",
  "spawn-rate",
  "velocity-cone"
]);

function compileEmitterPlan(emitter: CompiledVfxEffect["emitters"][number]): GpuEmitterExecutionPlan {
  const unsupportedReasons = new Set<string>();
  const stages = emitter.stages.map((stage) => ({
    kind: stage.kind,
    instructions: stage.ops.map((op) => {
      const opcode = OPCODE_MAP[op.opcode] ?? "unknown";
      const supportedByGpu = GPU_SUPPORTED_OPCODES.has(opcode);
      if (!supportedByGpu) {
        unsupportedReasons.add(`${op.opcode} is not yet implemented in the WebGPU execution path.`);
      }
      return {
        moduleId: op.moduleId,
        opcode,
        sourceOpcode: op.opcode,
        constants: structuredClone(op.constants),
        readAttributes: [...op.readAttributes],
        writeAttributes: [...op.writeAttributes],
        supportedByGpu
      };
    })
  }));

  return {
    id: emitter.id,
    name: emitter.name,
    simulationDomain: emitter.simulationDomain,
    capacity: emitter.capacity,
    attributeLayout: structuredClone(emitter.attributeLayout),
    renderers: structuredClone(emitter.renderers),
    stages,
    budgets: structuredClone(emitter.budgets),
    gpuSupported: unsupportedReasons.size === 0,
    unsupportedReasons: Array.from(unsupportedReasons)
  };
}

export function compileCompiledEffectToGpuRuntimePlan(effect: CompiledVfxEffect): GpuRuntimePlan {
  return {
    effectId: effect.id,
    effectName: effect.name,
    version: effect.version,
    parameters: structuredClone(effect.parameters),
    events: structuredClone(effect.events),
    emitters: effect.emitters.map(compileEmitterPlan),
    budgets: structuredClone(effect.budgets)
  };
}
