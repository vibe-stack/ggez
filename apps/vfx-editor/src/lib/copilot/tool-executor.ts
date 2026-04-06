import { MODULE_DESCRIPTORS } from "@ggez/vfx-core";
import { getDefaultModuleConfig, type VfxEditorStore } from "@ggez/vfx-editor-core";
import type {
  DataInterfaceBinding,
  EmitterDocument,
  EffectGraphNode,
  ModuleInstance,
  RendererSlot,
  SourceBinding,
  VfxEffectDocument,
  VfxEventDefinition,
  VfxParameter
} from "@ggez/vfx-schema";
import { createStableId } from "@ggez/anim-utils";
import type { CopilotToolCall, CopilotToolResult } from "./types";

type Args = Record<string, unknown>;
type StageName = "spawn" | "initialize" | "update" | "death";

const TEXTURE_PRESETS = [
  { id: "circle-soft", description: "Soft radial sprite for generic particles and soft glows." },
  { id: "circle-hard", description: "Sharper circular sprite for denser sparks or stylized orbs." },
  { id: "ring", description: "Donut/ring sprite for portal rims, halos, and distortion shells." },
  { id: "spark", description: "Cross-shaped sparkle sprite for glints and vortex sparks." },
  { id: "smoke", description: "Layered soft puff sprite for smoke wisps and dust." },
  { id: "star", description: "Starburst sprite for hot magical highlights." },
  { id: "flame", description: "Teardrop flame sprite for fire licks and hot streaks." },
  { id: "beam", description: "Vertical beam slice for streaks, ribbons, and energy shafts." }
] as const;

const PARAMETER_TYPES = new Set<VfxParameter["type"]>(["bool", "color", "float", "float2", "float3", "int", "trigger"]);
const ATTRIBUTE_TYPES = new Set<EmitterDocument["attributes"][string]>(["bool", "float", "float2", "float3", "float4", "int", "uint"]);
const DATA_INTERFACE_KINDS = new Set<DataInterfaceBinding["kind"]>([
  "animationNotify",
  "bone",
  "collisionField",
  "depthBuffer",
  "meshSurface",
  "spline",
  "worldZone"
]);
const SOURCE_BINDING_KINDS = new Set<SourceBinding["kind"]>(["bone", "mesh", "socket", "spline", "world"]);
const SIMULATION_DOMAINS = new Set<EmitterDocument["simulationDomain"]>(["beam", "particle", "ribbon"]);
const GRAPH_NODE_KINDS = new Set<EffectGraphNode["kind"]>(["comment", "dataInterface", "emitter", "event", "output", "parameter", "scalability", "subgraph"]);

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data });
}

function fail(error: string): string {
  return JSON.stringify({ success: false, error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(args: Args, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function num(args: Args, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(args: Args, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function stringRecord(args: Args, key: string): Record<string, string> | undefined {
  const value = args[key];
  if (!isRecord(value)) {
    return undefined;
  }

  const next: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") {
      next[entryKey] = entryValue;
    }
  }
  return next;
}

function attributeTypeRecord(
  args: Args,
  key: string
): Record<string, EmitterDocument["attributes"][string]> | undefined {
  const value = args[key];
  if (!isRecord(value)) {
    return undefined;
  }

  const next: Record<string, EmitterDocument["attributes"][string]> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string" && ATTRIBUTE_TYPES.has(entryValue as EmitterDocument["attributes"][string])) {
      next[entryKey] = entryValue as EmitterDocument["attributes"][string];
    }
  }
  return next;
}

function strArray(args: Args, key: string): string[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function pointArg(args: Args, key: string, fallback: { x: number; y: number }) {
  const value = args[key];
  if (isRecord(value)) {
    return {
      x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : fallback.x,
      y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : fallback.y
    };
  }
  return fallback;
}

function vec3Value(value: unknown): { x: number; y: number; z: number } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const x = typeof value.x === "number" && Number.isFinite(value.x) ? value.x : undefined;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? value.y : undefined;
  const z = typeof value.z === "number" && Number.isFinite(value.z) ? value.z : undefined;
  if (x === undefined || y === undefined || z === undefined) {
    return undefined;
  }

  return { x, y, z };
}

function fixedBoundsArg(args: Args): EmitterDocument["fixedBounds"] | undefined {
  const value = args.fixedBounds;
  if (!isRecord(value)) {
    return undefined;
  }

  const min = vec3Value(value.min);
  const max = vec3Value(value.max);
  if (!min || !max) {
    return undefined;
  }

  return { min, max };
}

function objectArg(args: Args, key: string): Record<string, unknown> | undefined {
  const value = args[key];
  return isRecord(value) ? value : undefined;
}

function requireString(args: Args, key: string): string {
  const value = str(args, key);
  if (!value) {
    throw new Error(`Missing required string argument \"${key}\".`);
  }
  return value;
}

function parseStage(value: unknown): StageName {
  if (value === "spawn" || value === "initialize" || value === "update" || value === "death") {
    return value;
  }
  throw new Error("stage must be one of spawn, initialize, update, or death.");
}

function stageKey(stage: StageName): "spawnStage" | "initializeStage" | "updateStage" | "deathStage" {
  return stage === "spawn" ? "spawnStage" : stage === "initialize" ? "initializeStage" : stage === "update" ? "updateStage" : "deathStage";
}

function inferNodeBindingId(node: EffectGraphNode): string | undefined {
  switch (node.kind) {
    case "dataInterface":
      return node.bindingId;
    case "emitter":
      return node.emitterId;
    case "event":
      return node.eventId;
    case "parameter":
      return node.parameterId;
    case "subgraph":
      return node.subgraphId;
    default:
      return undefined;
  }
}

function summarizeNode(node: EffectGraphNode) {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    position: node.position,
    color: "color" in node ? node.color : undefined,
    bindingId: inferNodeBindingId(node)
  };
}

function summarizeModule(module: ModuleInstance) {
  return {
    id: module.id,
    kind: module.kind,
    enabled: module.enabled,
    label: module.label,
    config: module.config,
    summary: MODULE_DESCRIPTORS[module.kind].summary
  };
}

function summarizeEmitter(emitter: EmitterDocument) {
  return {
    id: emitter.id,
    name: emitter.name,
    simulationDomain: emitter.simulationDomain,
    maxParticleCount: emitter.maxParticleCount,
    attributes: emitter.attributes,
    fixedBounds: emitter.fixedBounds,
    stageCounts: {
      spawn: emitter.spawnStage.modules.length,
      initialize: emitter.initializeStage.modules.length,
      update: emitter.updateStage.modules.length,
      death: emitter.deathStage.modules.length
    },
    rendererCount: emitter.renderers.length,
    sourceBindingCount: emitter.sourceBindings.length,
    dataInterfaceCount: emitter.dataInterfaces.length,
    eventHandlerCount: emitter.eventHandlers.length
  };
}

function defaultParameterValue(type: VfxParameter["type"]): VfxParameter["defaultValue"] {
  switch (type) {
    case "bool":
      return false;
    case "color":
      return "#ffffff";
    case "float":
    case "int":
      return 0;
    case "float2":
      return [0, 0];
    case "float3":
      return [0, 0, 0];
    case "trigger":
      return undefined;
  }
}

function getSelectedEmitter(store: VfxEditorStore) {
  const state = store.getState();
  return state.document.emitters.find((entry) => entry.id === state.selection.selectedEmitterId) ?? state.document.emitters[0];
}

function getEmitterOrThrow(store: VfxEditorStore, emitterId?: string): EmitterDocument {
  const state = store.getState();
  const resolvedId = emitterId || state.selection.selectedEmitterId || state.document.emitters[0]?.id;
  const emitter = state.document.emitters.find((entry) => entry.id === resolvedId);
  if (!emitter) {
    throw new Error(resolvedId ? `Unknown emitter \"${resolvedId}\".` : "No emitter is available.");
  }
  return emitter;
}

function updateDocument(store: VfxEditorStore, updater: (document: VfxEffectDocument) => VfxEffectDocument) {
  const current = store.getState().document;
  store.setDocument(updater(current));
}

function updateEmitterWithDocument(
  store: VfxEditorStore,
  emitterId: string,
  updater: (document: VfxEffectDocument, emitter: EmitterDocument) => VfxEffectDocument
) {
  const state = store.getState();
  const emitter = state.document.emitters.find((entry) => entry.id === emitterId);
  if (!emitter) {
    throw new Error(`Unknown emitter \"${emitterId}\".`);
  }
  store.setDocument(updater(state.document, emitter));
}

function rendererKindFromTemplate(template: RendererSlot["template"]): RendererSlot["kind"] {
  return template === "RibbonTrailMaterial"
    ? "ribbon"
    : template === "MeshParticleMaterial"
      ? "mesh"
      : template === "DistortionMaterial"
        ? "distortion"
        : template === "BeamMaterial"
          ? "beam"
          : "sprite";
}

function createRendererFromTemplate(template: RendererSlot["template"], index: number): RendererSlot {
  const kind = rendererKindFromTemplate(template);

  return {
    id: createStableId("renderer"),
    name: `${template.replace("Material", "")} ${index + 1}`,
    kind,
    template,
    enabled: true,
    material: {
      blendMode: template === "SpriteSmokeMaterial" ? "alpha" : "additive",
      lightingMode: template === "MeshParticleMaterial" ? "lit" : "unlit",
      softParticles: template === "SpriteSmokeMaterial" || template === "DistortionMaterial",
      depthFade: template === "SpriteSmokeMaterial" || template === "RibbonTrailMaterial" || template === "DistortionMaterial",
      flipbook: template === "SpriteSmokeMaterial" || template === "SpriteAdditiveMaterial",
      distortion: template === "DistortionMaterial",
      emissive: template !== "MeshParticleMaterial",
      facingMode: kind === "beam" ? "none" : kind === "ribbon" ? "velocity-aligned" : "full",
      sortMode: kind === "mesh" ? "back-to-front" : "none"
    },
    parameterBindings: {}
  };
}

function parseParameterType(value: unknown): VfxParameter["type"] {
  if (typeof value === "string" && PARAMETER_TYPES.has(value as VfxParameter["type"])) {
    return value as VfxParameter["type"];
  }
  throw new Error("Invalid parameter type.");
}

function parseSimulationDomain(value: unknown): EmitterDocument["simulationDomain"] {
  if (typeof value === "string" && SIMULATION_DOMAINS.has(value as EmitterDocument["simulationDomain"])) {
    return value as EmitterDocument["simulationDomain"];
  }
  throw new Error("Invalid simulation domain.");
}

function parseDataInterfaceKind(value: unknown): DataInterfaceBinding["kind"] {
  if (typeof value === "string" && DATA_INTERFACE_KINDS.has(value as DataInterfaceBinding["kind"])) {
    return value as DataInterfaceBinding["kind"];
  }
  throw new Error("Invalid data interface kind.");
}

function parseSourceBindingKind(value: unknown): SourceBinding["kind"] {
  if (typeof value === "string" && SOURCE_BINDING_KINDS.has(value as SourceBinding["kind"])) {
    return value as SourceBinding["kind"];
  }
  throw new Error("Invalid source binding kind.");
}

function parseTemplate(value: unknown): RendererSlot["template"] {
  if (
    value === "BeamMaterial" ||
    value === "DistortionMaterial" ||
    value === "MeshParticleMaterial" ||
    value === "RibbonTrailMaterial" ||
    value === "SpriteAdditiveMaterial" ||
    value === "SpriteSmokeMaterial"
  ) {
    return value;
  }
  throw new Error("Invalid renderer template.");
}

function parseGraphNodeKind(value: unknown): EffectGraphNode["kind"] {
  if (typeof value === "string" && GRAPH_NODE_KINDS.has(value as EffectGraphNode["kind"])) {
    return value as EffectGraphNode["kind"];
  }
  throw new Error("Invalid graph node kind.");
}

function deleteNodes(store: VfxEditorStore, nodeIds: string[]) {
  const removedNodeIds = new Set(nodeIds);
  const state = store.getState();
  const nextDocument: VfxEffectDocument = {
    ...state.document,
    graph: {
      ...state.document.graph,
      nodes: state.document.graph.nodes.filter((node) => !removedNodeIds.has(node.id)),
      edges: state.document.graph.edges.filter((edge) => !removedNodeIds.has(edge.sourceNodeId) && !removedNodeIds.has(edge.targetNodeId))
    }
  };
  store.setDocument(nextDocument);
  store.selectGraphNodes([]);

  const selectedEmitterId = state.selection.selectedEmitterId;
  const selectedEmitterRemoved = state.document.graph.nodes.some(
    (node) => removedNodeIds.has(node.id) && node.kind === "emitter" && node.emitterId === selectedEmitterId
  );
  if (selectedEmitterRemoved) {
    store.selectEmitter(nextDocument.emitters[0]?.id);
  }
}

function buildDocumentSummary(store: VfxEditorStore) {
  const state = store.getState();
  const selectedEmitter = state.document.emitters.find((entry) => entry.id === state.selection.selectedEmitterId);
  return {
    name: state.document.name,
    id: state.document.id,
    emitters: state.document.emitters.length,
    parameters: state.document.parameters.length,
    events: state.document.events.length,
    dataInterfaces: state.document.dataInterfaces.length,
    subgraphs: state.document.subgraphs.length,
    graphNodes: state.document.graph.nodes.length,
    graphEdges: state.document.graph.edges.length,
    selectedEmitterId: state.selection.selectedEmitterId,
    selectedEmitterName: selectedEmitter?.name,
    selectedGraphNodeIds: state.selection.graphNodeIds,
    preview: state.document.preview,
    budgets: state.document.budgets,
    diagnostics: state.diagnostics,
    compileResult: state.compileResult
      ? {
          emitterCount: state.compileResult.emitters.length,
          pipelineRisk: state.compileResult.budgets.pipelineRisk,
          overdrawRisk: state.compileResult.budgets.overdrawRisk,
          sortCost: state.compileResult.budgets.sortCost,
          ribbonCost: state.compileResult.budgets.ribbonCost,
          collisionCost: state.compileResult.budgets.collisionCost
        }
      : undefined
  };
}

export function executeTool(store: VfxEditorStore, toolCall: CopilotToolCall): CopilotToolResult {
  try {
    const result = runTool(store, toolCall.name, toolCall.args);
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result
    };
  } catch (error) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: fail(error instanceof Error ? error.message : "Unknown tool error")
    };
  }
}

function runTool(store: VfxEditorStore, name: string, args: Args): string {
  switch (name) {
    case "get_document_summary": {
      return ok({ summary: buildDocumentSummary(store) });
    }

    case "list_module_catalog": {
      return ok({
        modules: Object.values(MODULE_DESCRIPTORS).map((descriptor) => ({
          kind: descriptor.kind,
          stage: descriptor.stage,
          reads: descriptor.reads,
          writes: descriptor.writes,
          summary: descriptor.summary,
          defaultConfig: getDefaultModuleConfig(descriptor.kind)
        }))
      });
    }

    case "list_texture_presets": {
      return ok({ presets: TEXTURE_PRESETS });
    }

    case "list_graph_nodes": {
      const { document } = store.getState();
      return ok({
        graph: {
          id: document.graph.id,
          name: document.graph.name,
          nodes: document.graph.nodes.map(summarizeNode),
          edges: document.graph.edges.map((edge) => ({
            id: edge.id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            label: edge.label
          }))
        }
      });
    }

    case "list_emitters": {
      return ok({ emitters: store.getState().document.emitters.map(summarizeEmitter) });
    }

    case "get_emitter_details": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      return ok({
        emitter: {
          ...summarizeEmitter(emitter),
          stages: {
            spawn: emitter.spawnStage.modules.map(summarizeModule),
            initialize: emitter.initializeStage.modules.map(summarizeModule),
            update: emitter.updateStage.modules.map(summarizeModule),
            death: emitter.deathStage.modules.map(summarizeModule)
          },
          renderers: emitter.renderers,
          sourceBindings: emitter.sourceBindings,
          dataInterfaces: emitter.dataInterfaces,
          eventHandlers: emitter.eventHandlers
        }
      });
    }

    case "list_parameters": {
      return ok({ parameters: store.getState().document.parameters });
    }

    case "list_events": {
      return ok({ events: store.getState().document.events });
    }

    case "list_data_interfaces": {
      return ok({ dataInterfaces: store.getState().document.dataInterfaces });
    }

    case "create_emitter": {
      const position = pointArg(args, "position", { x: 720, y: 160 });
      const { emitterId, nodeId } = store.addEmitterWithGraphNode({
        name: str(args, "name", `Emitter ${store.getState().document.emitters.length + 1}`),
        position
      });

      const simulationDomain = args.simulationDomain ? parseSimulationDomain(args.simulationDomain) : undefined;
      const maxParticleCount = num(args, "maxParticleCount");
      const rendererTemplate = args.rendererTemplate ? parseTemplate(args.rendererTemplate) : undefined;
      const connectToOutput = bool(args, "connectToOutput") ?? true;

      if (simulationDomain || maxParticleCount !== undefined || rendererTemplate) {
        store.updateEmitter(emitterId, (emitter) => {
          const nextEmitter: EmitterDocument = {
            ...emitter,
            simulationDomain: simulationDomain ?? emitter.simulationDomain,
            maxParticleCount: maxParticleCount ?? emitter.maxParticleCount
          };

          if (!rendererTemplate) {
            return nextEmitter;
          }

          return {
            ...nextEmitter,
            renderers: [...nextEmitter.renderers, createRendererFromTemplate(rendererTemplate, nextEmitter.renderers.length)]
          };
        });
      }

      if (connectToOutput) {
        const outputNode = store.getState().document.graph.nodes.find((entry) => entry.kind === "output");
        if (outputNode) {
          store.connectGraphNodes(nodeId, outputNode.id);
        }
      }

      return ok({ emitterId, nodeId, emitter: summarizeEmitter(getEmitterOrThrow(store, emitterId)) });
    }

    case "update_emitter": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      const nextName = str(args, "name") || emitter.name;
      const nextDomain = args.simulationDomain ? parseSimulationDomain(args.simulationDomain) : emitter.simulationDomain;
      const nextMaxParticleCount = num(args, "maxParticleCount") ?? emitter.maxParticleCount;
      const nextAttributes = attributeTypeRecord(args, "attributes");
      const replaceAttributes = bool(args, "replaceAttributes") ?? false;
      const nextFixedBounds = bool(args, "clearFixedBounds") ? undefined : fixedBoundsArg(args) ?? emitter.fixedBounds;

      updateEmitterWithDocument(store, emitter.id, (document) => ({
        ...document,
        emitters: document.emitters.map((entry) =>
          entry.id === emitter.id
            ? {
                ...entry,
                name: nextName,
                simulationDomain: nextDomain,
                maxParticleCount: nextMaxParticleCount,
                fixedBounds: nextFixedBounds,
                attributes: nextAttributes
                  ? replaceAttributes
                    ? nextAttributes
                    : { ...entry.attributes, ...nextAttributes }
                  : entry.attributes
              }
            : entry
        ),
        graph: {
          ...document.graph,
          nodes: document.graph.nodes.map((node) =>
            node.kind === "emitter" && node.emitterId === emitter.id
              ? {
                  ...node,
                  name: nextName
                }
              : node
          )
        }
      }));

      return ok({ emitter: summarizeEmitter(getEmitterOrThrow(store, emitter.id)) });
    }

    case "delete_emitter": {
      const emitterId = requireString(args, "emitterId");
      const state = store.getState();
      const exists = state.document.emitters.some((entry) => entry.id === emitterId);
      if (!exists) {
        throw new Error(`Unknown emitter \"${emitterId}\".`);
      }

      const removedNodeIds = new Set(
        state.document.graph.nodes.filter((node) => node.kind === "emitter" && node.emitterId === emitterId).map((node) => node.id)
      );
      const nextDocument: VfxEffectDocument = {
        ...state.document,
        emitters: state.document.emitters.filter((entry) => entry.id !== emitterId),
        graph: {
          ...state.document.graph,
          nodes: state.document.graph.nodes.filter((node) => !(node.kind === "emitter" && node.emitterId === emitterId)),
          edges: state.document.graph.edges.filter((edge) => !removedNodeIds.has(edge.sourceNodeId) && !removedNodeIds.has(edge.targetNodeId))
        }
      };
      store.setDocument(nextDocument);
      store.selectGraphNodes([]);
      store.selectEmitter(nextDocument.emitters[0]?.id);
      return ok({ deletedEmitterId: emitterId, remainingEmitters: nextDocument.emitters.length });
    }

    case "add_stage_module": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      const stage = parseStage(args.stage);
      const kind = requireString(args, "kind") as ModuleInstance["kind"];
      const moduleId = store.addStageModule(emitter.id, stage, kind);

      const label = str(args, "label") || undefined;
      const config = objectArg(args, "config");
      if (label || config) {
        store.updateEmitter(emitter.id, (entry) => ({
          ...entry,
          [stageKey(stage)]: {
            ...entry[stageKey(stage)],
            modules: entry[stageKey(stage)].modules.map((module) =>
              module.id === moduleId
                ? {
                    ...module,
                    label,
                    config: config ? { ...module.config, ...config } : module.config
                  }
                : module
            )
          }
        }));
      }

      const nextEmitter = getEmitterOrThrow(store, emitter.id);
      const nextModule = nextEmitter[stageKey(stage)].modules.find((module) => module.id === moduleId);
      return ok({ emitterId: emitter.id, module: nextModule ? summarizeModule(nextModule) : null, stage });
    }

    case "update_stage_module": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      const stage = parseStage(args.stage);
      const moduleId = requireString(args, "moduleId");
      const nextKind = str(args, "kind") || undefined;
      const nextLabel = "label" in args ? str(args, "label") || undefined : undefined;
      const nextEnabled = bool(args, "enabled");
      const nextConfig = objectArg(args, "config");
      const replaceConfig = bool(args, "replaceConfig") ?? false;

      store.updateEmitter(emitter.id, (entry) => ({
        ...entry,
        [stageKey(stage)]: {
          ...entry[stageKey(stage)],
          modules: entry[stageKey(stage)].modules.map((module) => {
            if (module.id !== moduleId) {
              return module;
            }

            const kind = nextKind ? (nextKind as ModuleInstance["kind"]) : module.kind;
            const baseConfig = nextKind && nextKind !== module.kind ? getDefaultModuleConfig(kind) : module.config;
            return {
              ...module,
              kind,
              label: nextLabel !== undefined ? nextLabel : module.label,
              enabled: nextEnabled ?? module.enabled,
              config: nextConfig
                ? replaceConfig
                  ? nextConfig
                  : { ...baseConfig, ...nextConfig }
                : baseConfig
            };
          })
        }
      }));

      const nextEmitter = getEmitterOrThrow(store, emitter.id);
      const nextModule = nextEmitter[stageKey(stage)].modules.find((module) => module.id === moduleId);
      if (!nextModule) {
        throw new Error(`Unknown module \"${moduleId}\" in ${stage} stage.`);
      }

      return ok({ emitterId: emitter.id, stage, module: summarizeModule(nextModule) });
    }

    case "remove_stage_module": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      const stage = parseStage(args.stage);
      const moduleId = requireString(args, "moduleId");
      store.updateEmitter(emitter.id, (entry) => ({
        ...entry,
        [stageKey(stage)]: {
          ...entry[stageKey(stage)],
          modules: entry[stageKey(stage)].modules.filter((module) => module.id !== moduleId)
        }
      }));
      return ok({ emitterId: emitter.id, stage, removedModuleId: moduleId });
    }

    case "upsert_parameter": {
      const state = store.getState();
      const parameterId = str(args, "parameterId") || createStableId("param");
      const existing = state.document.parameters.find((entry) => entry.id === parameterId);
      const type = args.type ? parseParameterType(args.type) : existing?.type;
      if (!type) {
        throw new Error("Parameter type is required when creating a new parameter.");
      }

      const parameter: VfxParameter = {
        id: parameterId,
        name: str(args, "name", existing?.name ?? parameterId),
        type,
        defaultValue: "defaultValue" in args ? args.defaultValue as VfxParameter["defaultValue"] : existing?.defaultValue ?? defaultParameterValue(type),
        exposed: bool(args, "exposed") ?? existing?.exposed ?? true,
        description: "description" in args ? str(args, "description") || undefined : existing?.description
      };

      updateDocument(store, (document) => ({
        ...document,
        parameters: existing
          ? document.parameters.map((entry) => (entry.id === parameterId ? parameter : entry))
          : [...document.parameters, parameter],
        graph: {
          ...document.graph,
          nodes: document.graph.nodes.map((node) =>
            node.kind === "parameter" && node.parameterId === parameterId
              ? {
                  ...node,
                  name: parameter.name
                }
              : node
          )
        }
      }));

      let nodeId: string | undefined;
      if (bool(args, "createGraphNode") && !store.getState().document.graph.nodes.some((node) => node.kind === "parameter" && node.parameterId === parameterId)) {
        nodeId = store.addGraphNodeWithSelection("parameter", pointArg(args, "position", { x: 140, y: 80 }), {
          bindingId: parameterId,
          name: parameter.name
        });
      }

      return ok({ parameter, nodeId });
    }

    case "upsert_event": {
      const state = store.getState();
      const eventId = str(args, "eventId") || createStableId("event");
      const existing = state.document.events.find((entry) => entry.id === eventId);
      const payload = attributeTypeRecord(args, "payload");
      const event: VfxEventDefinition = {
        id: eventId,
        name: str(args, "name", existing?.name ?? eventId),
        payload: payload ?? existing?.payload ?? {},
        description: "description" in args ? str(args, "description") || undefined : existing?.description
      };

      updateDocument(store, (document) => ({
        ...document,
        events: existing
          ? document.events.map((entry) => (entry.id === eventId ? event : entry))
          : [...document.events, event],
        graph: {
          ...document.graph,
          nodes: document.graph.nodes.map((node) =>
            node.kind === "event" && node.eventId === eventId
              ? {
                  ...node,
                  name: event.name
                }
              : node
          )
        }
      }));

      let nodeId: string | undefined;
      if (bool(args, "createGraphNode") && !store.getState().document.graph.nodes.some((node) => node.kind === "event" && node.eventId === eventId)) {
        nodeId = store.addGraphNodeWithSelection("event", pointArg(args, "position", { x: 140, y: 220 }), {
          bindingId: eventId,
          name: event.name
        });
      }

      return ok({ event, nodeId });
    }

    case "upsert_data_interface": {
      const scope = str(args, "scope", "document");
      const bindingId = str(args, "bindingId") || createStableId("data-interface");
      const name = requireString(args, "name");
      const kind = parseDataInterfaceKind(args.kind);
      const config = objectArg(args, "config") ?? {};
      const binding: DataInterfaceBinding = { id: bindingId, name, kind, config };

      if (scope === "emitter") {
        const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
        store.updateEmitter(emitter.id, (entry) => ({
          ...entry,
          dataInterfaces: entry.dataInterfaces.some((item) => item.id === bindingId)
            ? entry.dataInterfaces.map((item) => (item.id === bindingId ? binding : item))
            : [...entry.dataInterfaces, binding]
        }));
        return ok({ scope, emitterId: emitter.id, dataInterface: binding });
      }

      updateDocument(store, (document) => ({
        ...document,
        dataInterfaces: document.dataInterfaces.some((item) => item.id === bindingId)
          ? document.dataInterfaces.map((item) => (item.id === bindingId ? binding : item))
          : [...document.dataInterfaces, binding],
        graph: {
          ...document.graph,
          nodes: document.graph.nodes.map((node) =>
            node.kind === "dataInterface" && node.bindingId === bindingId
              ? {
                  ...node,
                  name
                }
              : node
          )
        }
      }));

      let nodeId: string | undefined;
      if (bool(args, "createGraphNode") && !store.getState().document.graph.nodes.some((node) => node.kind === "dataInterface" && node.bindingId === bindingId)) {
        nodeId = store.addGraphNodeWithSelection("dataInterface", pointArg(args, "position", { x: 140, y: 340 }), {
          bindingId,
          name
        });
      }

      return ok({ scope: "document", dataInterface: binding, nodeId });
    }

    case "upsert_source_binding": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      const bindingId = str(args, "bindingId") || createStableId("source");
      const binding: SourceBinding = {
        id: bindingId,
        name: requireString(args, "name"),
        kind: parseSourceBindingKind(args.kind),
        sourceId: requireString(args, "sourceId"),
        config: objectArg(args, "config") ?? {}
      };
      store.updateEmitter(emitter.id, (entry) => ({
        ...entry,
        sourceBindings: entry.sourceBindings.some((item) => item.id === bindingId)
          ? entry.sourceBindings.map((item) => (item.id === bindingId ? binding : item))
          : [...entry.sourceBindings, binding]
      }));
      return ok({ emitterId: emitter.id, sourceBinding: binding });
    }

    case "upsert_renderer": {
      const emitter = getEmitterOrThrow(store, str(args, "emitterId") || undefined);
      const rendererId = str(args, "rendererId");
      const template = args.template ? parseTemplate(args.template) : undefined;
      if (!template && !rendererId) {
        throw new Error("Renderer template is required when creating a renderer.");
      }

      store.updateEmitter(emitter.id, (entry) => {
        const existing = rendererId ? entry.renderers.find((item) => item.id === rendererId) : undefined;
        const base = existing
          ? existing
          : createRendererFromTemplate(template ?? "SpriteAdditiveMaterial", entry.renderers.length);
        const templateBase = template ? createRendererFromTemplate(template, entry.renderers.length) : base;
        const materialPatch = objectArg(args, "material");
        const parameterBindings = stringRecord(args, "parameterBindings");
        const nextRenderer: RendererSlot = {
          ...base,
          id: rendererId || base.id,
          name: str(args, "name", base.name),
          template: template ?? base.template,
          kind: (str(args, "kind") as RendererSlot["kind"]) || (template ? templateBase.kind : base.kind),
          enabled: bool(args, "enabled") ?? base.enabled,
          material: {
            ...(template ? templateBase.material : base.material),
            ...(materialPatch ?? {})
          },
          parameterBindings: parameterBindings
            ? (bool(args, "replaceParameterBindings") ? parameterBindings : { ...base.parameterBindings, ...parameterBindings })
            : base.parameterBindings
        };

        return {
          ...entry,
          renderers: existing
            ? entry.renderers.map((item) => (item.id === existing.id ? nextRenderer : item))
            : [...entry.renderers, nextRenderer]
        };
      });

      const nextEmitter = getEmitterOrThrow(store, emitter.id);
      const nextRenderer = nextEmitter.renderers.find((item) => item.id === (rendererId || nextEmitter.renderers.at(-1)?.id));
      return ok({ emitterId: emitter.id, renderer: nextRenderer });
    }

    case "upsert_graph_node": {
      const nodeId = str(args, "nodeId");
      const position = pointArg(args, "position", { x: 420, y: 220 });
      const select = bool(args, "select") ?? true;
      if (!nodeId) {
        const kind = parseGraphNodeKind(args.kind);
        const bindingId = str(args, "bindingId") || undefined;
        const name = str(args, "name", kind === "comment" ? "Comment" : kind === "output" ? "Effect Output" : "Node");
        const createdNodeId = select
          ? store.addGraphNodeWithSelection(kind, position, { bindingId, name })
          : store.addGraphNode(kind, position, { bindingId, name });
        if (kind === "emitter") {
          const emitterId = bindingId || getSelectedEmitter(store)?.id;
          if (emitterId) {
            store.selectEmitter(emitterId);
          }
        }
        return ok({ node: summarizeNode(store.getState().document.graph.nodes.find((entry) => entry.id === createdNodeId)!) });
      }

      updateDocument(store, (document) => ({
        ...document,
        graph: {
          ...document.graph,
          nodes: document.graph.nodes.map((node) => {
            if (node.id !== nodeId) {
              return node;
            }

            const nextName = str(args, "name", node.name);
            const nextColor = "color" in args ? str(args, "color") || undefined : ("color" in node ? node.color : undefined);
            const bindingId = str(args, "bindingId") || undefined;

            switch (node.kind) {
              case "comment":
                return {
                  ...node,
                  name: nextName,
                  position,
                  color: nextColor
                };
              case "dataInterface":
                return { ...node, name: nextName, position, bindingId: bindingId ?? node.bindingId };
              case "emitter":
                return { ...node, name: nextName, position, emitterId: bindingId ?? node.emitterId };
              case "event":
                return { ...node, name: nextName, position, eventId: bindingId ?? node.eventId };
              case "parameter":
                return { ...node, name: nextName, position, parameterId: bindingId ?? node.parameterId };
              case "subgraph":
                return { ...node, name: nextName, position, subgraphId: bindingId ?? node.subgraphId };
              default:
                return { ...node, name: nextName, position };
            }
          })
        }
      }));

      if (select) {
        store.selectGraphNodes([nodeId]);
      }

      const nextNode = store.getState().document.graph.nodes.find((entry) => entry.id === nodeId);
      if (!nextNode) {
        throw new Error(`Unknown graph node \"${nodeId}\".`);
      }
      if (nextNode.kind === "emitter") {
        store.selectEmitter(nextNode.emitterId);
      }
      return ok({ node: summarizeNode(nextNode) });
    }

    case "connect_graph_nodes": {
      const sourceNodeId = requireString(args, "sourceNodeId");
      const targetNodeId = requireString(args, "targetNodeId");
      const edgeId = store.connectGraphNodes(sourceNodeId, targetNodeId);
      return ok({ edgeId, sourceNodeId, targetNodeId });
    }

    case "delete_graph_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      if (nodeIds.length === 0) {
        throw new Error("nodeIds must contain at least one id.");
      }
      deleteNodes(store, nodeIds);
      return ok({ deletedNodeIds: nodeIds });
    }

    case "delete_graph_edges": {
      const edgeIds = strArray(args, "edgeIds");
      store.deleteGraphEdges(edgeIds);
      return ok({ deletedEdgeIds: edgeIds });
    }

    case "update_preview_settings": {
      const patch: Partial<VfxEffectDocument["preview"]> = {};
      if ("loop" in args) {
        patch.loop = bool(args, "loop") ?? false;
      }
      if ("durationSeconds" in args) {
        patch.durationSeconds = num(args, "durationSeconds") ?? store.getState().document.preview.durationSeconds;
      }
      if ("attachMode" in args) {
        const attachMode = str(args, "attachMode");
        if (attachMode === "character" || attachMode === "isolated" || attachMode === "world") {
          patch.attachMode = attachMode;
        }
      }
      if ("playbackRate" in args) {
        patch.playbackRate = num(args, "playbackRate") ?? store.getState().document.preview.playbackRate;
      }
      store.updatePreviewSettings(patch);
      return ok({ preview: store.getState().document.preview });
    }

    case "compile_document": {
      const result = store.compile();
      return ok({
        diagnostics: result.diagnostics,
        compiled: !!result.effect,
        budgets: result.effect?.budgets,
        emitterCount: result.effect?.emitters.length ?? 0
      });
    }

    default:
      throw new Error(`Unknown tool \"${name}\".`);
  }
}