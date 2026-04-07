import { BUILTIN_ATTRIBUTE_TYPES, collectDesignDiagnostics, estimateEmitterBudget, getModuleDescriptor, inferAttributeMap } from "@ggez/vfx-core";
import {
  parseVfxEffectDocument,
  type CompileDiagnostic,
  type CompiledAttributeLayout,
  type CompiledBudgetReport,
  type CompiledEmitter,
  type CompiledStagePlan,
  type CompiledVfxEffect,
  type ModuleInstance,
  type VfxEffectDocument
} from "@ggez/vfx-schema";

export type CompileVfxResult = {
  diagnostics: CompileDiagnostic[];
  effect?: CompiledVfxEffect;
};

function stableMaterialSignature(input: {
  blendMode: string;
  depthFade: boolean;
  distortion: boolean;
  facingMode: string;
  flipbook: boolean;
  lightingMode: string;
  softParticles: boolean;
  sortMode: string;
  template: string;
}) {
  return [
    input.template,
    input.blendMode,
    input.lightingMode,
    input.softParticles ? "soft" : "hard",
    input.depthFade ? "depth-fade" : "no-depth-fade",
    input.flipbook ? "flipbook" : "static",
    input.facingMode,
    input.distortion ? "distort" : "no-distort",
    input.sortMode
  ].join(":");
}

function collectModules(emitter: VfxEffectDocument["emitters"][number]) {
  const eventStages = emitter.eventHandlers.map((handler: VfxEffectDocument["emitters"][number]["eventHandlers"][number]) => ({
    kind: `event:${handler.eventId}`,
    modules: handler.modules
  }));

  return [
    { kind: "spawn", modules: emitter.spawnStage.modules },
    { kind: "initialize", modules: emitter.initializeStage.modules },
    { kind: "update", modules: emitter.updateStage.modules },
    { kind: "death", modules: emitter.deathStage.modules },
    ...eventStages
  ] as const;
}

function buildAttributeLayout(document: VfxEffectDocument, emitter: VfxEffectDocument["emitters"][number]): CompiledAttributeLayout {
  const attributeTypes = inferAttributeMap(document);
  Object.entries(emitter.attributes).forEach(([name, type]) => {
    attributeTypes.set(name, type);
  });

  const ordered = Array.from(attributeTypes.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, type], index) => ({
      name,
      type,
      offsetFloats: index * 4
    }));

  return {
    strideFloats: Math.max(4, ordered.length * 4),
    attributes: ordered
  };
}

function lowerStage(stage: { kind: string; modules: ModuleInstance[] }): CompiledStagePlan {
  return {
    kind: stage.kind,
    ops: stage.modules
      .filter((module) => module.enabled)
      .map((module) => {
        const descriptor = getModuleDescriptor(module.kind);
        return {
          moduleId: module.id,
          opcode: descriptor.kind,
          readAttributes: descriptor.reads,
          writeAttributes: descriptor.writes,
          constants: structuredClone(module.config)
        };
      })
  };
}

function mergeBudgetReports(reports: CompiledBudgetReport[]): CompiledBudgetReport {
  if (reports.length === 0) {
    return {
      maxParticles: 0,
      peakSpawnPerFrame: 0,
      estimatedUpdateCost: 0,
      estimatedMemoryBytes: 0,
      collisionCost: "none",
      ribbonCost: "none",
      sortCost: "none",
      pipelineRisk: "low",
      overdrawRisk: "low"
    };
  }

  const rank: Record<CompiledBudgetReport["collisionCost"], number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3
  };
  const riskRank: Record<CompiledBudgetReport["pipelineRisk"], number> = {
    low: 0,
    medium: 1,
    high: 2
  };

  const maxByRank = <T extends keyof typeof rank>(values: T[]) => values.reduce((current, candidate) => (rank[candidate] > rank[current] ? candidate : current), values[0]!);
  const maxRisk = <T extends keyof typeof riskRank>(values: T[]) => values.reduce((current, candidate) => (riskRank[candidate] > riskRank[current] ? candidate : current), values[0]!);

  return {
    maxParticles: reports.reduce((sum, report) => sum + report.maxParticles, 0),
    peakSpawnPerFrame: reports.reduce((sum, report) => sum + report.peakSpawnPerFrame, 0),
    estimatedUpdateCost: reports.reduce((sum, report) => sum + report.estimatedUpdateCost, 0),
    estimatedMemoryBytes: reports.reduce((sum, report) => sum + report.estimatedMemoryBytes, 0),
    collisionCost: maxByRank(reports.map((report) => report.collisionCost)),
    ribbonCost: maxByRank(reports.map((report) => report.ribbonCost)),
    sortCost: maxByRank(reports.map((report) => report.sortCost)),
    pipelineRisk: maxRisk(reports.map((report) => report.pipelineRisk)),
    overdrawRisk: maxRisk(reports.map((report) => report.overdrawRisk))
  };
}

function compileEmitter(document: VfxEffectDocument, emitter: VfxEffectDocument["emitters"][number]): CompiledEmitter {
  const attributeLayout = buildAttributeLayout(document, emitter);
  const stages = collectModules(emitter).map(lowerStage);
  const rendererKinds = emitter.renderers
    .filter((renderer: VfxEffectDocument["emitters"][number]["renderers"][number]) => renderer.enabled)
    .map((renderer: VfxEffectDocument["emitters"][number]["renderers"][number]) => renderer.kind);
  const sortingEnabled = emitter.renderers.some(
    (renderer: VfxEffectDocument["emitters"][number]["renderers"][number]) => renderer.material.sortMode !== "none"
  );
  const collisionEnabled = emitter.updateStage.modules.some(
    (module: ModuleInstance) => module.kind === "CollisionQuery" || module.kind === "CollisionBounce"
  );

  const budgets = estimateEmitterBudget({
    collisionEnabled,
    rendererKinds,
    capacity: emitter.maxParticleCount,
    moduleCount: stages.reduce((sum, stage) => sum + stage.ops.length, 0),
    sortingEnabled
  });

  return {
    id: emitter.id,
    name: emitter.name,
    simulationDomain: emitter.simulationDomain,
    capacity: emitter.maxParticleCount,
    attributeLayout,
    stages,
    renderers: emitter.renderers
      .filter((renderer: VfxEffectDocument["emitters"][number]["renderers"][number]) => renderer.enabled)
      .map((renderer: VfxEffectDocument["emitters"][number]["renderers"][number]) => ({
        rendererId: renderer.id,
        kind: renderer.kind,
        template: renderer.template,
        materialSignature: stableMaterialSignature({
          template: renderer.template,
          blendMode: renderer.material.blendMode,
          lightingMode: renderer.material.lightingMode,
          softParticles: renderer.material.softParticles,
          depthFade: renderer.material.depthFade,
          flipbook: renderer.material.flipbook,
          facingMode: renderer.material.facingMode,
          distortion: renderer.material.distortion,
          sortMode: renderer.material.sortMode
        }),
        sortMode: renderer.material.sortMode,
        estimatedOverdrawRisk: renderer.kind === "sprite" && emitter.maxParticleCount > 4096 ? "high" : "medium",
        textureBinding: renderer.parameterBindings._texture,
        flipbookSettings: renderer.flipbookSettings.enabled ? structuredClone(renderer.flipbookSettings) : undefined
      })),
    sourceBindings: emitter.sourceBindings.map((binding: VfxEffectDocument["emitters"][number]["sourceBindings"][number]) => ({
      id: binding.id,
      kind: binding.kind,
      sourceId: binding.sourceId,
      config: structuredClone(binding.config)
    })),
    dataInterfaces: emitter.dataInterfaces.map((binding: VfxEffectDocument["emitters"][number]["dataInterfaces"][number]) => ({
      id: binding.id,
      kind: binding.kind,
      config: structuredClone(binding.config)
    })),
    budgets
  };
}

export function compileVfxEffectDocument(input: unknown): CompileVfxResult {
  let document: VfxEffectDocument;

  try {
    document = parseVfxEffectDocument(input);
  } catch (error) {
    return {
      diagnostics: [
        {
          severity: "error",
          message: error instanceof Error ? error.message : "Failed to parse VFX effect document."
        }
      ]
    };
  }

  const diagnostics = collectDesignDiagnostics(document);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { diagnostics };
  }

  const compiledEmitters = document.emitters.map((emitter: VfxEffectDocument["emitters"][number]) => compileEmitter(document, emitter));
  const effect: CompiledVfxEffect = {
    version: 1,
    id: document.id,
    name: document.name,
    parameters: document.parameters.map((parameter: VfxEffectDocument["parameters"][number]) => ({
      id: parameter.id,
      name: parameter.name,
      type: parameter.type,
      defaultValue: parameter.defaultValue
    })),
    events: document.events.map((event: VfxEffectDocument["events"][number]) => ({
      id: event.id,
      name: event.name,
      payload: structuredClone(event.payload)
    })),
    emitters: compiledEmitters,
    dataInterfaces: document.dataInterfaces.map((binding: VfxEffectDocument["dataInterfaces"][number]) => ({
      id: binding.id,
      kind: binding.kind,
      config: structuredClone(binding.config)
    })),
    scalability: {
      ...structuredClone(document.scalability),
      derivedTierOrder: ["cinematic", "high", "medium", "low"]
    },
    budgets: mergeBudgetReports(compiledEmitters.map((emitter: CompiledEmitter) => emitter.budgets))
  };

  if (effect.budgets.maxParticles > document.budgets.maxParticles) {
    diagnostics.push({
      severity: "warning",
      message: "Compiled effect exceeds the authored total particle budget.",
      location: "budgets.maxParticles"
    });
  }

  return {
    diagnostics,
    effect
  };
}

export function compileVfxEffectDocumentOrThrow(input: unknown) {
  const result = compileVfxEffectDocument(input);

  if (!result.effect || result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
  }

  return result.effect;
}

export function buildDefaultEmitterAttributes() {
  return structuredClone(BUILTIN_ATTRIBUTE_TYPES);
}
