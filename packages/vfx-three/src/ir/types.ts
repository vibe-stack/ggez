import type {
  CompiledAttributeLayout,
  CompiledBudgetReport,
  CompiledEmitter,
  CompiledEvent,
  CompiledParameter,
  CompiledRendererBinding,
  CompiledVfxEffect
} from "@ggez/vfx-schema";

export type RuntimeOpcode =
  | "alpha-over-life"
  | "attractor"
  | "collision-bounce"
  | "collision-query"
  | "color-over-life"
  | "curl-noise-force"
  | "drag"
  | "gravity-force"
  | "inherit-velocity"
  | "kill-by-age"
  | "kill-by-distance"
  | "orbit-target"
  | "random-range"
  | "receive-event"
  | "ribbon-link"
  | "send-event"
  | "set-attribute"
  | "size-over-life"
  | "spawn-burst"
  | "spawn-cone"
  | "spawn-from-bone"
  | "spawn-from-mesh-surface"
  | "spawn-from-spline"
  | "spawn-rate"
  | "velocity-cone"
  | "unknown";

export type RuntimeStagePlan = {
  kind: string;
  instructions: Array<{
    moduleId: string;
    opcode: RuntimeOpcode;
    sourceOpcode: string;
    constants: Record<string, unknown>;
    readAttributes: string[];
    writeAttributes: string[];
    supportedByGpu: boolean;
  }>;
};

export type GpuEmitterExecutionPlan = {
  id: string;
  name: string;
  simulationDomain: CompiledEmitter["simulationDomain"];
  capacity: number;
  attributeLayout: CompiledAttributeLayout;
  renderers: CompiledRendererBinding[];
  stages: RuntimeStagePlan[];
  budgets: CompiledBudgetReport;
  gpuSupported: boolean;
  unsupportedReasons: string[];
};

export type GpuRuntimePlan = {
  effectId: string;
  effectName: string;
  version: CompiledVfxEffect["version"];
  parameters: CompiledParameter[];
  events: CompiledEvent[];
  emitters: GpuEmitterExecutionPlan[];
  budgets: CompiledBudgetReport;
};
