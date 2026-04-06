import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { getDefaultModuleConfig, type VfxEditorStore } from "@ggez/vfx-editor-core";
import { BUILTIN_ATTRIBUTE_TYPES, MODULE_DESCRIPTORS } from "@ggez/vfx-core";
import { createVfxArtifact, serializeVfxArtifact } from "@ggez/vfx-exporter";
import type { EmitterDocument, ModuleInstance, RendererSlot } from "@ggez/vfx-schema";
import { createThreeWebGpuVfxBackend, MVP_RENDERER_TEMPLATES } from "@ggez/vfx-three";
import { ArrowDownRight, Check, Flame, GripHorizontal, Plus, Sparkles, Trash2 } from "lucide-react";
import { GraphCanvas } from "./graph-canvas";
import { usePreviewPanelDrag } from "./hooks/use-preview-panel-drag";
import { useEditorStoreValue } from "./use-editor-store-value";
import { ThreePreviewPanel } from "./three-preview-panel";

const backend = createThreeWebGpuVfxBackend();

const STAGE_PRESETS: Record<"death" | "initialize" | "spawn" | "update", ModuleInstance["kind"][]> = {
  spawn: ["SpawnBurst", "SpawnRate", "SpawnCone", "SpawnFromBone", "SpawnFromMeshSurface", "SpawnFromSpline"],
  initialize: ["SetAttribute", "VelocityCone", "InheritVelocity", "RandomRange"],
  update: ["Drag", "GravityForce", "CurlNoiseForce", "ColorOverLife", "SizeOverLife", "AlphaOverLife", "CollisionQuery", "CollisionBounce", "RibbonLink", "OrbitTarget"],
  death: ["KillByAge", "KillByDistance", "SendEvent"]
};

const STAGE_EXPLANATIONS: Record<keyof typeof STAGE_PRESETS, string> = {
  spawn: "Decides when and where particles are created.",
  initialize: "Sets initial particle attributes right after spawn.",
  update: "Runs every frame to move, color, size, and otherwise evolve particles.",
  death: "Stops particles or emits events when their lifetime or conditions end."
};

const INSPECTOR_TABS = [
  { id: "stages" as const, label: "Stages" },
  { id: "renderer" as const, label: "Renderer" },
  { id: "graph" as const, label: "Graph" },
  { id: "diagnostics" as const, label: "Diagnostics" }
];

const CURVE_PRESETS = ["flash-hot", "flash-expand", "flash-fade", "linear", "ease-in", "ease-out", "smoke-soft", "spark-decay"];

const INPUT_CLASS_NAME =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/35";
const TEXTAREA_CLASS_NAME = `${INPUT_CLASS_NAME} min-h-28 resize-y font-mono text-[11px] leading-relaxed`;

type StageName = keyof typeof STAGE_PRESETS;
type StageKey = "deathStage" | "initializeStage" | "spawnStage" | "updateStage";

function getStageKey(stage: StageName): StageKey {
  return stage === "spawn"
    ? "spawnStage"
    : stage === "initialize"
      ? "initializeStage"
      : stage === "update"
        ? "updateStage"
        : "deathStage";
}

function parseLooseValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && `${numeric}` === trimmed) {
    return numeric;
  }

  return trimmed;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function LabeledField(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{props.label}</div>
      {props.children}
      {props.hint ? <div className="mt-1 text-[10px] leading-snug text-zinc-600">{props.hint}</div> : null}
    </label>
  );
}

function ModuleJsonEditor(props: {
  config: ModuleInstance["config"];
  onApply(nextConfig: ModuleInstance["config"]): void;
}) {
  const [draft, setDraft] = useState(() => prettyJson(props.config));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(prettyJson(props.config));
    setError(null);
  }, [props.config]);

  function applyDraft() {
    try {
      const nextConfig = draft.trim().length === 0 ? {} : JSON.parse(draft);
      if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
        throw new Error("Config must be a JSON object.");
      }
      props.onApply(nextConfig as ModuleInstance["config"]);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Invalid JSON config.");
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Advanced Config</div>
        <button
          type="button"
          className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-emerald-300/30 hover:text-emerald-200"
          onClick={applyDraft}
        >
          Apply JSON
        </button>
      </div>
      <textarea
        className={TEXTAREA_CLASS_NAME}
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={applyDraft}
      />
      {error ? <div className="mt-2 text-[10px] text-rose-300">{error}</div> : null}
    </div>
  );
}

function ModuleConfigEditor(props: {
  attributeOptions: string[];
  module: ModuleInstance;
  onUpdate(nextModule: ModuleInstance): void;
}) {
  const moduleLabel = props.module.label ?? "";
  const config = {
    ...getDefaultModuleConfig(props.module.kind),
    ...props.module.config
  };

  function updateConfig(patch: Record<string, unknown>) {
    props.onUpdate({
      ...props.module,
      config: {
        ...props.module.config,
        ...patch
      }
    });
  }

  function updateNumber(key: string, fallback = 0) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      updateConfig({ [key]: value === "" ? fallback : Number(value) });
    };
  }

  function updateString(key: string) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      updateConfig({ [key]: event.target.value });
    };
  }

  function updateLooseValue(key: string) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      updateConfig({ [key]: parseLooseValue(event.target.value) });
    };
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-black/18 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <LabeledField label="Label" hint="Optional display label for this module.">
          <input
            className={INPUT_CLASS_NAME}
            value={moduleLabel}
            placeholder={formatModuleKind(props.module.kind)}
            onChange={(event) =>
              props.onUpdate({
                ...props.module,
                label: event.target.value.trim().length > 0 ? event.target.value : undefined
              })
            }
          />
        </LabeledField>
        <LabeledField label="Enabled" hint="Disabled modules are skipped during compile and preview.">
          <button
            type="button"
            className={`mt-1 inline-flex h-8.5 items-center justify-center rounded-lg border px-3 text-[12px] transition ${
              props.module.enabled
                ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-200"
                : "border-white/10 bg-black/20 text-zinc-500"
            }`}
            onClick={() => props.onUpdate({ ...props.module, enabled: !props.module.enabled })}
          >
            {props.module.enabled ? "Enabled" : "Disabled"}
          </button>
        </LabeledField>
      </div>

      {props.module.kind === "SpawnRate" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Rate / sec" hint="Continuous particles emitted each second.">
            <input className={INPUT_CLASS_NAME} type="number" step="1" min="0" value={String(config.rate ?? 24)} onChange={updateNumber("rate", 0)} />
          </LabeledField>
          <LabeledField label="Max Alive" hint="Optional soft cap for this spawner.">
            <input className={INPUT_CLASS_NAME} type="number" step="1" min="0" value={String(config.maxAlive ?? "")} onChange={updateNumber("maxAlive", 0)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "SpawnBurst" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Count" hint="How many particles this burst emits.">
            <input className={INPUT_CLASS_NAME} type="number" step="1" min="0" value={String(config.count ?? 24)} onChange={updateNumber("count", 0)} />
          </LabeledField>
          <LabeledField label="Every Event" hint="Optional event id that retriggers this burst.">
            <input className={INPUT_CLASS_NAME} value={String(config.everyEvent ?? "")} placeholder="event:fire" onChange={updateString("everyEvent")} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "SpawnCone" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Angle Degrees" hint="Spread angle of the spawn volume.">
            <input className={INPUT_CLASS_NAME} type="number" step="1" min="0" value={String(config.angleDegrees ?? 16)} onChange={updateNumber("angleDegrees", 0)} />
          </LabeledField>
          <LabeledField label="Radius" hint="Radius of the cone base / spawn footprint.">
            <input className={INPUT_CLASS_NAME} type="number" step="0.01" min="0" value={String(config.radius ?? 0.1)} onChange={updateNumber("radius", 0)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "SetAttribute" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Attribute" hint="Particle attribute this module writes.">
            <select className={INPUT_CLASS_NAME} value={String(config.attribute ?? "lifetime")} onChange={updateString("attribute")}>
              {[...new Set([...(props.attributeOptions.length > 0 ? props.attributeOptions : ["lifetime"]), String(config.attribute ?? "")].filter(Boolean))].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Value" hint="Loose scalar parsing: numbers, booleans, null, or text.">
            <input className={INPUT_CLASS_NAME} value={String(config.value ?? "")} placeholder="0.42" onChange={updateLooseValue("value")} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "VelocityCone" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <LabeledField label="Speed Min">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.speedMin ?? 8)} onChange={updateNumber("speedMin", 0)} />
          </LabeledField>
          <LabeledField label="Speed Max">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.speedMax ?? 22)} onChange={updateNumber("speedMax", 0)} />
          </LabeledField>
          <LabeledField label="Angle Degrees">
            <input className={INPUT_CLASS_NAME} type="number" step="1" min="0" value={String(config.angleDegrees ?? 16)} onChange={updateNumber("angleDegrees", 0)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "InheritVelocity" && (
        <LabeledField label="Scale" hint="Multiplier for inherited source velocity.">
          <input className={INPUT_CLASS_NAME} type="number" step="0.05" value={String(config.scale ?? 1)} onChange={updateNumber("scale", 0)} />
        </LabeledField>
      )}

      {props.module.kind === "RandomRange" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <LabeledField label="Min">
            <input className={INPUT_CLASS_NAME} type="number" step="0.01" value={String(config.min ?? 0)} onChange={updateNumber("min", 0)} />
          </LabeledField>
          <LabeledField label="Max">
            <input className={INPUT_CLASS_NAME} type="number" step="0.01" value={String(config.max ?? 1)} onChange={updateNumber("max", 0)} />
          </LabeledField>
          <LabeledField label="Output Key" hint="Where downstream modules should read this sample.">
            <input className={INPUT_CLASS_NAME} value={String(config.output ?? "sample")} onChange={updateString("output")} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "Drag" && (
        <LabeledField label="Coefficient" hint="Higher values damp velocity faster.">
          <input className={INPUT_CLASS_NAME} type="number" step="0.1" min="0" value={String(config.coefficient ?? 2.8)} onChange={updateNumber("coefficient", 0)} />
        </LabeledField>
      )}

      {props.module.kind === "GravityForce" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <LabeledField label="Accel X">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.accelerationX ?? 0)} onChange={updateNumber("accelerationX", 0)} />
          </LabeledField>
          <LabeledField label="Accel Y">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.accelerationY ?? 120)} onChange={updateNumber("accelerationY", 0)} />
          </LabeledField>
          <LabeledField label="Accel Z">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.accelerationZ ?? 0)} onChange={updateNumber("accelerationZ", 0)} />
          </LabeledField>
        </div>
      )}

      {(props.module.kind === "ColorOverLife" || props.module.kind === "SizeOverLife" || props.module.kind === "AlphaOverLife") && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Curve" hint="Named authored curve or preset id.">
            <select className={INPUT_CLASS_NAME} value={String(config.curve ?? CURVE_PRESETS[0])} onChange={updateString("curve")}>
              {[...new Set([String(config.curve ?? CURVE_PRESETS[0]), ...CURVE_PRESETS])].map((curve) => (
                <option key={curve} value={curve}>
                  {curve}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Bias" hint="Optional multiplier / blend scalar.">
            <input className={INPUT_CLASS_NAME} type="number" step="0.05" value={String(config.bias ?? 1)} onChange={updateNumber("bias", 1)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "KillByDistance" && (
        <LabeledField label="Max Distance" hint="Particles beyond this distance are killed.">
          <input className={INPUT_CLASS_NAME} type="number" step="0.1" min="0" value={String(config.maxDistance ?? 10)} onChange={updateNumber("maxDistance", 0)} />
        </LabeledField>
      )}

      {props.module.kind === "SendEvent" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Event Id">
            <input className={INPUT_CLASS_NAME} value={String(config.eventId ?? "")} placeholder="event:impact" onChange={updateString("eventId")} />
          </LabeledField>
          <LabeledField label="When" hint="Optional authored condition label.">
            <input className={INPUT_CLASS_NAME} value={String(config.when ?? "")} placeholder="on-death" onChange={updateString("when")} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "CollisionBounce" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Restitution">
            <input className={INPUT_CLASS_NAME} type="number" step="0.05" min="0" value={String(config.restitution ?? 0.6)} onChange={updateNumber("restitution", 0)} />
          </LabeledField>
          <LabeledField label="Friction">
            <input className={INPUT_CLASS_NAME} type="number" step="0.05" min="0" value={String(config.friction ?? 0.1)} onChange={updateNumber("friction", 0)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "CollisionQuery" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Interface Id">
            <input className={INPUT_CLASS_NAME} value={String(config.interfaceId ?? "")} placeholder="interface:collision" onChange={updateString("interfaceId")} />
          </LabeledField>
          <LabeledField label="Radius">
            <input className={INPUT_CLASS_NAME} type="number" step="0.01" min="0" value={String(config.radius ?? 0.1)} onChange={updateNumber("radius", 0)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "CurlNoiseForce" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Strength">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.strength ?? 1)} onChange={updateNumber("strength", 0)} />
          </LabeledField>
          <LabeledField label="Frequency">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.frequency ?? 1)} onChange={updateNumber("frequency", 0)} />
          </LabeledField>
        </div>
      )}

      {props.module.kind === "OrbitTarget" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledField label="Radius">
            <input className={INPUT_CLASS_NAME} type="number" step="0.01" min="0" value={String(config.radius ?? 1)} onChange={updateNumber("radius", 0)} />
          </LabeledField>
          <LabeledField label="Angular Speed">
            <input className={INPUT_CLASS_NAME} type="number" step="0.1" value={String(config.angularSpeed ?? 1)} onChange={updateNumber("angularSpeed", 0)} />
          </LabeledField>
        </div>
      )}

      <ModuleJsonEditor
        config={props.module.config}
        onApply={(nextConfig) => props.onUpdate({ ...props.module, config: nextConfig })}
      />
    </div>
  );
}

function formatModuleKind(kind: ModuleInstance["kind"]) {
  return kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function createRendererFromTemplate(templateId: string, index: number): RendererSlot {
  const kind =
    templateId === "RibbonTrailMaterial"
      ? "ribbon"
      : templateId === "MeshParticleMaterial"
        ? "mesh"
        : templateId === "DistortionMaterial"
          ? "distortion"
          : templateId === "BeamMaterial"
            ? "beam"
            : "sprite";

  return {
    id: `renderer:${index + 1}:${templateId.toLowerCase()}`,
    name: `${templateId.replace("Material", "")} ${index + 1}`,
    kind,
    template: templateId as RendererSlot["template"],
    enabled: true,
    material: {
      blendMode: templateId === "SpriteSmokeMaterial" ? "alpha" : "additive",
      lightingMode: templateId === "MeshParticleMaterial" ? "lit" : "unlit",
      softParticles: templateId === "SpriteSmokeMaterial" || templateId === "DistortionMaterial",
      depthFade: templateId === "SpriteSmokeMaterial" || templateId === "RibbonTrailMaterial" || templateId === "DistortionMaterial",
      flipbook: templateId === "SpriteSmokeMaterial" || templateId === "SpriteAdditiveMaterial",
      distortion: templateId === "DistortionMaterial",
      emissive: templateId !== "MeshParticleMaterial",
      facingMode: kind === "beam" ? "none" : kind === "ribbon" ? "velocity-aligned" : "full",
      sortMode: kind === "mesh" ? "back-to-front" : "none"
    },
    parameterBindings: {}
  };
}

type InspectorTab = "stages" | "renderer" | "graph" | "diagnostics";

export function VfxEditorWorkspace(props: { store: VfxEditorStore }) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("stages");
  const [openStagePicker, setOpenStagePicker] = useState<"death" | "initialize" | "spawn" | "update" | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const state = useEditorStoreValue(props.store, () => props.store.getState(), ["document", "selection", "compile", "emitters"]);
  const selectedEmitter = state.document.emitters.find((entry) => entry.id === state.selection.selectedEmitterId) ?? state.document.emitters[0];
  const { previewRect, beginPreviewInteraction, updatePreviewBounds } = usePreviewPanelDrag(workspaceRef);
  const attributeOptions = selectedEmitter
    ? [...new Set([...Object.keys(BUILTIN_ATTRIBUTE_TYPES), ...Object.keys(selectedEmitter.attributes)])].sort((left, right) => left.localeCompare(right))
    : Object.keys(BUILTIN_ATTRIBUTE_TYPES);

  useEffect(() => {
    if (state.compileResult) {
      backend.prepareEffect(state.compileResult);
    }
  }, [state.compileResult]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePreviewBounds();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updatePreviewBounds]);

  useEffect(() => {
    setExpandedModuleId(null);
    setOpenStagePicker(null);
  }, [selectedEmitter?.id]);

  const artifactPreview = state.compileResult ? serializeVfxArtifact(createVfxArtifact({ effect: state.compileResult })) : "";
  const cacheSnapshot = backend.getCacheSnapshot();

  function handleAddEmitter() {
    const nextIndex = state.document.emitters.length + 1;
    const name = `Emitter ${nextIndex}`;
    props.store.addEmitterWithGraphNode({
      name,
      position: { x: 720 + state.document.emitters.length * 40, y: 120 + state.document.emitters.length * 34 }
    });
    setSelectedEdgeIds([]);
  }

  function handleAddGraphNode(kind: "dataInterface" | "emitter" | "event" | "output" | "parameter" | "scalability") {
    const positions = {
      emitter: { x: 700, y: 160 },
      event: { x: 140, y: 220 },
      parameter: { x: 140, y: 80 },
      dataInterface: { x: 140, y: 340 },
      scalability: { x: 520, y: 80 },
      output: { x: 840, y: 260 }
    } as const;

    const name =
      kind === "emitter"
        ? selectedEmitter?.name ?? "Emitter Node"
        : kind === "event"
          ? "Event"
          : kind === "parameter"
            ? "Parameter"
            : kind === "dataInterface"
              ? "Data Interface"
              : kind === "scalability"
                ? "Scalability"
                : "Output";
    const bindingId =
      kind === "emitter"
        ? selectedEmitter?.id
        : kind === "event"
          ? state.document.events[0]?.id
          : kind === "parameter"
            ? state.document.parameters[0]?.id
            : kind === "dataInterface"
              ? state.document.dataInterfaces[0]?.id
              : undefined;

    props.store.addGraphNodeWithSelection(kind, positions[kind], {
      bindingId,
      name
    });
    setSelectedEdgeIds([]);
  }

  function handleApplyTemplate(templateId: string) {
    if (!selectedEmitter) {
      return;
    }

    props.store.updateEmitter(selectedEmitter.id, (emitter) => {
      const nextRenderer = createRendererFromTemplate(templateId, emitter.renderers.length);

      if (emitter.renderers.length === 0) {
        return {
          ...emitter,
          renderers: [nextRenderer]
        };
      }

      return {
        ...emitter,
        renderers: emitter.renderers.map((renderer, index) =>
          index === 0
            ? {
                ...renderer,
                name: nextRenderer.name,
                kind: nextRenderer.kind,
                template: nextRenderer.template,
                material: nextRenderer.material
              }
            : renderer
        )
      };
    });
  }

  function handleAddRenderer(templateId: string) {
    if (!selectedEmitter) {
      return;
    }

    props.store.updateEmitter(selectedEmitter.id, (emitter) => ({
      ...emitter,
      renderers: [...emitter.renderers, createRendererFromTemplate(templateId, emitter.renderers.length)]
    }));
  }

  function handleCycleBlendMode(rendererId: string) {
    if (!selectedEmitter) {
      return;
    }

    const blendOrder: RendererSlot["material"]["blendMode"][] = ["additive", "alpha", "premultiplied"];
    props.store.updateEmitter(selectedEmitter.id, (emitter) => ({
      ...emitter,
      renderers: emitter.renderers.map((renderer) => {
        if (renderer.id !== rendererId) {
          return renderer;
        }

        const currentIndex = blendOrder.indexOf(renderer.material.blendMode);
        const nextBlendMode = blendOrder[(currentIndex + 1) % blendOrder.length]!;
        return {
          ...renderer,
          material: {
            ...renderer.material,
            blendMode: nextBlendMode
          }
        };
      })
    }));
  }

  function handleDeleteSelection() {
    if (selectedEdgeIds.length > 0) {
      props.store.deleteGraphEdges(selectedEdgeIds);
      setSelectedEdgeIds([]);
      return;
    }

    props.store.deleteSelectedGraphNodes();
  }

  function updateStageModules(
    emitterId: string,
    stage: StageName,
    updater: (modules: ModuleInstance[]) => ModuleInstance[]
  ) {
    const stageKey = getStageKey(stage);
    props.store.updateEmitter(emitterId, (emitter: EmitterDocument) => {
      const currentStage = emitter[stageKey];
      return {
        ...emitter,
        [stageKey]: {
          ...currentStage,
          modules: updater(currentStage.modules)
        }
      } as EmitterDocument;
    });
  }

  function handleUpdateStageModule(stage: StageName, moduleId: string, nextModule: ModuleInstance) {
    if (!selectedEmitter) {
      return;
    }

    updateStageModules(selectedEmitter.id, stage, (modules) =>
      modules.map((module) => (module.id === moduleId ? nextModule : module))
    );
  }

  function handleRemoveStageModule(stage: StageName, moduleId: string) {
    if (!selectedEmitter) {
      return;
    }

    updateStageModules(selectedEmitter.id, stage, (modules) => modules.filter((module) => module.id !== moduleId));

    if (expandedModuleId === moduleId) {
      setExpandedModuleId(null);
    }
  }

  const hasSelection = selectedEdgeIds.length > 0 || state.selection.graphNodeIds.length > 0;

  return (
    <div ref={workspaceRef} className="relative h-full min-h-0">
      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <div className="absolute inset-x-0 top-0 z-10 flex h-11 items-center gap-2 border-b border-white/8 bg-black/25 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-emerald-200/45">
          <Sparkles className="size-3.5" />
          <span>VFX Editor</span>
        </div>
        <div className="mx-3 h-4 w-px bg-white/10" />
        <button
          type="button"
          className="rounded-full border border-emerald-300/24 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-50 transition hover:border-emerald-300/40 hover:bg-emerald-400/16"
          onClick={() => props.store.compile()}
        >
          Compile
        </button>
        {hasSelection && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-rose-400/30 hover:text-rose-300"
            onClick={handleDeleteSelection}
          >
            <Trash2 className="size-3" />
            <span>
              {selectedEdgeIds.length > 0
                ? `Delete ${selectedEdgeIds.length} edge${selectedEdgeIds.length === 1 ? "" : "s"}`
                : `Delete ${state.selection.graphNodeIds.length} node${state.selection.graphNodeIds.length === 1 ? "" : "s"}`}
            </span>
          </button>
        )}
      </div>

      {/* ── Graph canvas – full width ────────────────────────────────────── */}
      <div className="h-full pt-11 pb-7">
        <GraphCanvas
          graph={state.document.graph}
          selectedNodeIds={state.selection.graphNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          onEdgeSelectionChange={(edgeIds) => setSelectedEdgeIds(edgeIds)}
          onSelectionChange={(nodeIds) => {
            props.store.selectGraphNodes(nodeIds);
            // Sync emitter selection when a graph emitter node is clicked
            const emitterNode = nodeIds
              .map((id) => state.document.graph.nodes.find((n) => n.id === id && n.kind === "emitter"))
              .find(Boolean);
            if (emitterNode?.kind === "emitter") {
              props.store.selectEmitter(emitterNode.emitterId);
            }
          }}
          onConnect={(connection) => {
            if (!connection.source || !connection.target) {
              return;
            }
            props.store.connectGraphNodes(connection.source, connection.target);
          }}
          onNodeDragStop={(nodeId, position) => {
            props.store.moveGraphNodes({ [nodeId]: position });
          }}
          onDeleteNodes={() => props.store.deleteSelectedGraphNodes()}
          onDeleteEdges={(edgeIds) => props.store.deleteGraphEdges(edgeIds)}
        />
      </div>

      {/* ── Left floating sidebar – Emitters list ────────────────────────── */}
      <aside className="pointer-events-auto absolute left-4 top-12 z-20 flex w-55 max-h-[calc(100%-44px-36px-8px)] flex-col overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/10 backdrop-blur-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-3 py-2.5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/45">Emitters</div>
            <div className="mt-0.5 truncate text-sm font-semibold leading-tight text-emerald-50">{state.document.name}</div>
          </div>
          <button
            type="button"
            title="Add emitter"
            className="flex size-6 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-emerald-400/12 hover:text-emerald-300"
            onClick={handleAddEmitter}
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {state.document.emitters.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-zinc-600">
              No emitters.{" "}
              <button type="button" className="text-emerald-400 hover:text-emerald-300 transition" onClick={handleAddEmitter}>
                Add one
              </button>
            </div>
          ) : (
            state.document.emitters.map((emitter) => (
              <button
                key={emitter.id}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left transition ${
                  emitter.id === selectedEmitter?.id ? "bg-emerald-400/12 text-emerald-50" : "text-zinc-300 hover:bg-white/6"
                }`}
                onClick={() => props.store.selectEmitter(emitter.id)}
              >
                <div className="text-sm font-medium leading-tight">{emitter.name}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {emitter.simulationDomain} · {emitter.maxParticleCount} max · {emitter.renderers.length}r
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right floating sidebar – Inspector ───────────────────────────── */}
      <aside className="pointer-events-auto absolute right-4 top-12 z-20 flex w-75 max-h-[calc(100%-44px-36px-8px)] flex-col overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/10 backdrop-blur-xl">
        {/* Tab bar */}
        <div className="shrink-0 overflow-x-auto border-b border-white/8">
          <div className="flex min-w-max gap-1 px-2 py-1.5">
          {INSPECTOR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition ${
                inspectorTab === tab.id
                  ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20"
                  : "text-zinc-600 hover:bg-white/4 hover:text-zinc-400"
              }`}
              onClick={() => setInspectorTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Stages tab */}
          {inspectorTab === "stages" && (
            <div className="pb-3">
              {!selectedEmitter ? (
                <div className="py-6 text-center text-[12px] text-zinc-600 px-3">Select an emitter to inspect its stages.</div>
              ) : (
                <>
                  {/* Emitter name header */}
                  <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
                    <Flame className="size-3.5 text-emerald-300/60" />
                    <span className="text-[12px] font-medium text-zinc-200">{selectedEmitter.name}</span>
                    <span className="text-[11px] text-zinc-600">— {selectedEmitter.simulationDomain}</span>
                  </div>

                  {/* Stage pipeline */}
                  {(
                    [
                      { stage: "spawn" as const, modules: selectedEmitter.spawnStage.modules, accent: "bg-sky-400", label: "Spawn" },
                      { stage: "initialize" as const, modules: selectedEmitter.initializeStage.modules, accent: "bg-emerald-400", label: "Initialize" },
                      { stage: "update" as const, modules: selectedEmitter.updateStage.modules, accent: "bg-violet-400", label: "Update" },
                      { stage: "death" as const, modules: selectedEmitter.deathStage.modules, accent: "bg-rose-400", label: "Death" },
                    ]
                  ).map(({ stage, modules, accent, label }) => {
                    const isPickerOpen = openStagePicker === stage;
                    return (
                      <div key={stage} className="border-b border-white/6 last:border-0">
                        {/* Stage header */}
                        <div className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-3.5 w-0.5 shrink-0 rounded-full ${accent} opacity-70`} />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</span>
                            <span className="ml-auto text-[10px] text-zinc-700">{modules.length} module{modules.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="pl-3.5 pt-1 text-[11px] leading-snug text-zinc-600">{STAGE_EXPLANATIONS[stage]}</div>
                        </div>

                        {/* Module rows */}
                        {modules.length === 0 ? (
                          <div className="px-4 pb-2 text-[11px] italic text-zinc-700">Empty — no modules yet.</div>
                        ) : (
                          <div className="space-y-2 px-3 pb-2">
                            {modules.map((module) => (
                              <div key={module.id} className="rounded-xl border border-white/8 bg-black/15">
                                <div className="group flex items-start gap-2 px-2.5 py-2">
                                  <button
                                    type="button"
                                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                                    onClick={() => setExpandedModuleId((current) => (current === module.id ? null : module.id))}
                                  >
                                    <div className={`mt-1 size-1.5 shrink-0 rounded-full ${accent} opacity-55`} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <div className="text-[12px] font-medium text-zinc-200">{module.label ?? formatModuleKind(module.kind)}</div>
                                        {!module.enabled ? (
                                          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                                            disabled
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-0.5 text-[10px] leading-snug text-zinc-600">{MODULE_DESCRIPTORS[module.kind].summary}</div>
                                    </div>
                                  </button>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      className="rounded-md border border-white/8 px-1.5 py-0.5 text-[10px] text-zinc-500 transition hover:border-white/12 hover:text-zinc-300"
                                      onClick={() => setExpandedModuleId((current) => (current === module.id ? null : module.id))}
                                    >
                                      {expandedModuleId === module.id ? "Hide" : "Edit"}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Remove module"
                                      className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-700 transition hover:bg-rose-400/12 hover:text-rose-400"
                                      onClick={() => handleRemoveStageModule(stage, module.id)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                                {expandedModuleId === module.id ? (
                                  <div className="px-2.5 pb-2.5">
                                    <ModuleConfigEditor
                                      attributeOptions={attributeOptions}
                                      module={module}
                                      onUpdate={(nextModule) => handleUpdateStageModule(stage, module.id, nextModule)}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add module button / inline picker */}
                        {isPickerOpen ? (
                          <div className="mx-3 mb-2 overflow-hidden rounded-lg border border-emerald-400/20 bg-white/3">
                            <div className="flex items-center justify-between border-b border-white/6 px-2.5 py-1.5">
                              <span className="text-[10px] text-zinc-500">Add {label} module</span>
                              <button
                                type="button"
                                className="text-[11px] text-zinc-600 hover:text-zinc-400"
                                onClick={() => setOpenStagePicker(null)}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="max-h-44 overflow-y-auto py-0.5">
                              {STAGE_PRESETS[stage].map((kind) => (
                                <button
                                  key={kind}
                                  type="button"
                                  className="flex w-full items-start gap-2.5 px-2.5 py-1.5 text-left transition hover:bg-emerald-400/8"
                                  onClick={() => {
                                    const moduleId = props.store.addStageModule(selectedEmitter.id, stage, kind);
                                    setExpandedModuleId(moduleId);
                                    setOpenStagePicker(null);
                                  }}
                                >
                                  <Plus className="mt-0.5 size-3 shrink-0 text-emerald-400/60" />
                                  <div>
                                    <div className="text-[12px] font-medium text-zinc-200">{formatModuleKind(kind)}</div>
                                    <div className="text-[10px] leading-snug text-zinc-600">{MODULE_DESCRIPTORS[kind].summary}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-[11px] text-zinc-600 transition hover:border-emerald-400/30 hover:text-emerald-300"
                            onClick={() => setOpenStagePicker(stage)}
                          >
                            <Plus className="size-3" />
                            <span>Add {label} module…</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Renderer tab */}
          {inspectorTab === "renderer" && (
            <div className="space-y-3 p-3">
              {!selectedEmitter && (
                <div className="py-6 text-center text-[12px] text-zinc-600">Select an emitter first.</div>
              )}
              {selectedEmitter && selectedEmitter.renderers.length > 0 && (
                <div className="space-y-1.5 border-b border-white/8 pb-3">
                  <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Active</div>
                  {selectedEmitter.renderers.map((renderer) => (
                    <div key={renderer.id} className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2">
                      <div>
                        <div className="text-[12px] font-medium text-emerald-50">{renderer.name}</div>
                        <div className="text-[11px] text-zinc-500">{renderer.kind}</div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-white/20"
                        onClick={() => handleCycleBlendMode(renderer.id)}
                      >
                        {renderer.material.blendMode}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {selectedEmitter && (
                <div>
                  <div className="px-1 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Templates</div>
                  <div className="space-y-1">
                    {MVP_RENDERER_TEMPLATES.map((template) => {
                      const isActive = selectedEmitter.renderers.some((r) => r.template === template.id);
                      return (
                        <div
                          key={template.id}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2 transition ${
                            isActive ? "border-emerald-300/30 bg-emerald-400/6" : "border-white/8 hover:border-white/12"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {isActive && <Check className="size-3 shrink-0 text-emerald-400" />}
                              <div className="truncate text-[12px] font-medium text-emerald-50">{template.id}</div>
                            </div>
                            <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{template.description}</div>
                          </div>
                          <div className="ml-2 flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-emerald-300/30 hover:text-emerald-200"
                              onClick={() => handleApplyTemplate(template.id)}
                            >
                              Set
                            </button>
                            <button
                              type="button"
                              title="Add as extra renderer slot"
                              className="flex size-5.5 items-center justify-center rounded-md border border-white/10 text-zinc-500 transition hover:border-emerald-300/30 hover:text-emerald-200"
                              onClick={() => handleAddRenderer(template.id)}
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Graph tab */}
          {inspectorTab === "graph" && (
            <div className="space-y-3 p-3">
              <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Add Graph Nodes</div>
              <div className="space-y-1">
                {(
                  [
                    ["emitter", "Emitter Node", "Represents an emitter asset"],
                    ["event", "Event Node", "Triggers on particle events"],
                    ["parameter", "Parameter Node", "Exposes a named parameter"],
                    ["dataInterface", "Data Interface Node", "Binds external data sources"],
                    ["scalability", "Scalability Node", "LOD, budgets, fallbacks"],
                    ["output", "Output Node", "Final compiled effect output"]
                  ] as const
                ).map(([kind, label, description]) => (
                  <button
                    key={kind}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-white/8 px-3 py-2 text-left transition hover:border-white/16 hover:bg-white/4"
                    onClick={() => handleAddGraphNode(kind)}
                  >
                    <Plus className="size-3.5 shrink-0 text-emerald-300/55" />
                    <div>
                      <div className="text-[12px] font-medium text-zinc-200">{label}</div>
                      <div className="text-[11px] leading-tight text-zinc-600">{description}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-white/6 px-3 py-2 text-[11px] text-zinc-600">
                {state.selection.graphNodeIds.length} node(s) · {selectedEdgeIds.length} edge(s) selected
              </div>
            </div>
          )}

          {/* Diagnostics tab */}
          {inspectorTab === "diagnostics" && (
            <div className="space-y-3 p-3">
              <div>
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Compile Diagnostics</div>
                <div className="space-y-1.5">
                  {state.diagnostics.length === 0 ? (
                    <div className="rounded-xl border border-emerald-400/18 bg-emerald-400/6 px-3 py-2 text-[12px] text-emerald-300">
                      No diagnostics.
                    </div>
                  ) : (
                    state.diagnostics.map((diagnostic, index) => (
                      <div
                        key={`${diagnostic.message}-${index}`}
                        className={`rounded-xl border px-3 py-2 text-[12px] ${
                          diagnostic.severity === "error"
                            ? "border-rose-400/24 bg-rose-400/8 text-rose-200"
                            : diagnostic.severity === "warning"
                              ? "border-amber-400/24 bg-amber-400/8 text-amber-100"
                              : "border-sky-400/24 bg-sky-400/8 text-sky-100"
                        }`}
                      >
                        <div className="font-medium">{diagnostic.severity.toUpperCase()}</div>
                        <div className="mt-0.5">{diagnostic.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Pipeline Cache</div>
                <div className="space-y-1 rounded-xl border border-white/8 px-3 py-2 text-[12px] text-zinc-400">
                  <div className="flex justify-between">
                    <span>Prepared effects</span>
                    <span className="text-zinc-300">{cacheSnapshot.preparedEffects.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Material signatures</span>
                    <span className="text-zinc-300">{cacheSnapshot.materialSignatures.length}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Artifact Payload</div>
                <pre className="max-h-50 overflow-auto rounded-xl border border-white/8 bg-[#09090d] p-3 text-[11px] leading-5 text-zinc-500">
                  {artifactPreview || "Compile to inspect."}
                </pre>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Floating preview panel ────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-30">
        <div
          className="pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden rounded-3xl bg-[#0b0f0e]/88 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/8 backdrop-blur-2xl"
          style={{
            left: `${previewRect.x}px`,
            top: `${previewRect.y}px`,
            width: `${previewRect.width}px`,
            height: `${previewRect.height}px`
          }}
        >
          <div
            className="flex h-9 shrink-0 cursor-move items-center justify-between px-4 pb-3 text-[11px] font-medium text-zinc-500"
            onPointerDown={(event: ReactPointerEvent) => beginPreviewInteraction("move", event)}
          >
            <span>Preview</span>
            <GripHorizontal className="size-3.5 text-zinc-600" />
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <ThreePreviewPanel
              document={state.document}
              compileResult={state.compileResult}
              selectedEmitterId={selectedEmitter?.id}
            />
          </div>
          <button
            type="button"
            className="absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-full text-zinc-600 transition hover:bg-white/8 hover:text-zinc-400"
            onPointerDown={(event: ReactPointerEvent) => beginPreviewInteraction("resize", event)}
            aria-label="Resize preview panel"
          >
            <ArrowDownRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Bottom status bar ─────────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex h-7 items-center gap-5 border-t border-white/6 bg-black/85 px-4 text-[11px] text-zinc-600">
        <span>{state.document.emitters.length} Emitters</span>
        <span>{state.document.events.length} Events</span>
        <span>{state.compileResult?.budgets.maxParticles ?? state.document.budgets.maxParticles} Particles</span>
        {state.compileResult && (
          <span className="ml-auto flex items-center gap-5">
            <span>
              Risk:{" "}
              <span
                className={
                  state.compileResult.budgets.pipelineRisk === "high"
                    ? "text-rose-400"
                    : state.compileResult.budgets.pipelineRisk === "medium"
                      ? "text-amber-400"
                      : "text-zinc-500"
                }
              >
                {state.compileResult.budgets.pipelineRisk}
              </span>
            </span>
            <span>Overdraw: {state.compileResult.budgets.overdrawRisk}</span>
            <span>Sort: {state.compileResult.budgets.sortCost}</span>
            <span>Ribbon: {state.compileResult.budgets.ribbonCost}</span>
            <span>Collision: {state.compileResult.budgets.collisionCost}</span>
          </span>
        )}
      </div>
    </div>
  );
}
