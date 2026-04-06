import type { VfxExecutionBackend, VfxPlaybackRequest } from "@ggez/vfx-runtime";
import type { CompiledVfxEffect } from "@ggez/vfx-schema";
import { compileCompiledEffectToGpuRuntimePlan, type GpuRuntimePlan } from "./ir";

export type RendererMaterialSignature = string;

export type VfxRendererTemplateDefinition = {
  id: string;
  description: string;
  materialSignatureAxes: string[];
};

export type VfxPipelineCacheSnapshot = {
  materialSignatures: string[];
  preparedEffects: string[];
  preparedRuntimePlans: string[];
};

export const MVP_RENDERER_TEMPLATES: VfxRendererTemplateDefinition[] = [
  {
    id: "SpriteSmokeMaterial",
    description: "Shared sprite smoke shading with alpha blending, soft particles, and flipbook support.",
    materialSignatureAxes: ["blendMode", "softParticles", "depthFade", "flipbook", "facingMode"]
  },
  {
    id: "SpriteAdditiveMaterial",
    description: "Shared additive sprite shading for sparks, embers, and muzzle flashes.",
    materialSignatureAxes: ["blendMode", "flipbook", "facingMode", "sortMode"]
  },
  {
    id: "RibbonTrailMaterial",
    description: "Shared ribbon template for trails, tracer arcs, and slash streaks.",
    materialSignatureAxes: ["blendMode", "lightingMode", "depthFade"]
  },
  {
    id: "MeshParticleMaterial",
    description: "Shared mesh particle template with lit or unlit shading.",
    materialSignatureAxes: ["lightingMode", "blendMode", "sortMode"]
  },
  {
    id: "DistortionMaterial",
    description: "Shared distortion template for heat haze and shockwave refraction.",
    materialSignatureAxes: ["distortion", "depthFade", "sortMode"]
  },
  {
    id: "BeamMaterial",
    description: "Shared beam template for hitscan streaks and energy beams.",
    materialSignatureAxes: ["blendMode", "lightingMode", "sortMode"]
  }
];

export function createThreeWebGpuVfxBackend(): VfxExecutionBackend & {
  getCacheSnapshot(): VfxPipelineCacheSnapshot;
  getRuntimePlan(effectId: string): GpuRuntimePlan | undefined;
} {
  const preparedEffects = new Map<string, CompiledVfxEffect>();
  const runtimePlans = new Map<string, GpuRuntimePlan>();
  const materialSignatures = new Set<string>();
  const activeInstances = new Map<string, VfxPlaybackRequest>();

  return {
    prepareEffect(effect) {
      preparedEffects.set(effect.id, effect);
      runtimePlans.set(effect.id, compileCompiledEffectToGpuRuntimePlan(effect));
      effect.emitters.forEach((emitter: CompiledVfxEffect["emitters"][number]) => {
        emitter.renderers.forEach((renderer: CompiledVfxEffect["emitters"][number]["renderers"][number]) => {
          materialSignatures.add(renderer.materialSignature);
        });
      });
    },
    createInstance(effect, request) {
      preparedEffects.set(effect.id, effect);
      if (!runtimePlans.has(effect.id)) {
        runtimePlans.set(effect.id, compileCompiledEffectToGpuRuntimePlan(effect));
      }
      activeInstances.set(request.instanceId, request);
    },
    dispatchSimulation() {
      return;
    },
    render() {
      return;
    },
    getCacheSnapshot() {
      return {
        materialSignatures: Array.from(materialSignatures).sort(),
        preparedEffects: Array.from(preparedEffects.keys()).sort(),
        preparedRuntimePlans: Array.from(runtimePlans.keys()).sort()
      };
    },
    getRuntimePlan(effectId) {
      return runtimePlans.get(effectId);
    }
  };
}
