import type { CompiledVfxEffect } from "@ggez/vfx-schema";

export type VfxPlaybackRequest = {
  effectId: string;
  instanceId: string;
  position?: [number, number, number];
  parameters?: Record<string, unknown>;
};

export type VfxExecutionBackend = {
  prepareEffect(effect: CompiledVfxEffect): void;
  createInstance(effect: CompiledVfxEffect, request: VfxPlaybackRequest): void;
  dispatchSimulation(deltaSeconds: number): void;
  render(): void;
};

export type VfxSystemRuntime = {
  readonly compiledEffects: ReadonlyMap<string, CompiledVfxEffect>;
  readonly activeInstances: ReadonlyMap<string, VfxPlaybackRequest>;
  play(request: VfxPlaybackRequest): void;
  stop(instanceId: string): void;
  update(deltaSeconds: number): void;
};

export function createVfxSystemRuntime(input: {
  effects?: CompiledVfxEffect[];
  backend: VfxExecutionBackend;
}): VfxSystemRuntime {
  const compiledEffects = new Map((input.effects ?? []).map((effect) => [effect.id, effect]));
  const activeInstances = new Map<string, VfxPlaybackRequest>();

  compiledEffects.forEach((effect) => {
    input.backend.prepareEffect(effect);
  });

  return {
    compiledEffects,
    activeInstances,
    play(request) {
      const effect = compiledEffects.get(request.effectId);
      if (!effect) {
        throw new Error(`Unknown VFX effect "${request.effectId}".`);
      }

      activeInstances.set(request.instanceId, request);
      input.backend.createInstance(effect, request);
    },
    stop(instanceId) {
      activeInstances.delete(instanceId);
    },
    update(deltaSeconds) {
      input.backend.dispatchSimulation(deltaSeconds);
      input.backend.render();
    }
  };
}
