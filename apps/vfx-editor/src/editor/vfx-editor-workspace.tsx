import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createBlankVfxEffectDocument, createCampfireVfxEffectDocument, getDefaultModuleConfig, type VfxEditorStore } from "@ggez/vfx-editor-core";
import { BUILTIN_ATTRIBUTE_TYPES, MODULE_DESCRIPTORS } from "@ggez/vfx-core";
import { createVfxArtifact, serializeVfxArtifact, createVfxRuntimeBundleZip } from "@ggez/vfx-exporter";
import type { EffectGraphNode, EmitterDocument, ModuleInstance, RendererFlipbookSettings, RendererSlot, VfxEventDefinition, VfxParameter } from "@ggez/vfx-schema";
import { createThreeWebGpuVfxBackend, MVP_RENDERER_TEMPLATES } from "@ggez/vfx-three";
import { ArrowDownRight, Bot, Cable, Check, ChevronDown, ChevronRight, Flame, GripHorizontal, ImageIcon, Orbit, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { GraphCanvas } from "./graph-canvas";
import { CopilotPanel } from "./copilot/CopilotPanel";
import { useCopilot } from "./hooks/use-copilot";
import { useCopilotPanelDrag } from "./hooks/use-copilot-panel-drag";
import { usePreviewPanelDrag } from "./hooks/use-preview-panel-drag";
import { useEditorStoreValue } from "./use-editor-store-value";
import { ThreePreviewPanel } from "./three-preview-panel";
import { DragInput } from "@/components/ui/drag-input";
import type { StageName } from "./emitter-node";
import { formatModuleKind } from "./emitter-node";

const backend = createThreeWebGpuVfxBackend();

const STAGE_PRESETS: Record<StageName, ModuleInstance["kind"][]> = {
  spawn: ["SpawnBurst", "SpawnRate", "SpawnCone", "SpawnFromBone", "SpawnFromMeshSurface", "SpawnFromSpline"],
  initialize: ["SetAttribute", "VelocityCone", "InheritVelocity", "RandomRange"],
  update: ["Drag", "GravityForce", "CurlNoiseForce", "ColorOverLife", "SizeOverLife", "AlphaOverLife", "CollisionQuery", "CollisionBounce", "RibbonLink", "OrbitTarget"],
  death: ["KillByAge", "KillByDistance", "SendEvent"]
};

const STAGE_ACCENTS: Record<StageName, string> = {
  spawn: "bg-sky-400",
  initialize: "bg-emerald-400",
  update: "bg-violet-400",
  death: "bg-rose-400"
};

const CURVE_PRESETS = ["flash-hot", "flash-expand", "flash-fade", "linear", "ease-in", "ease-out", "smoke-soft", "spark-decay"];

// ── Default texture library ────────────────────────────────────────────────

type TextureAsset = { id: string; label: string; gradient: string };

const DEFAULT_TEXTURES: TextureAsset[] = [
  { id: "circle-soft",   label: "Circle – soft",    gradient: "radial-gradient(circle, #fff 0%, rgba(255,255,255,0.5) 35%, transparent 70%)" },
  { id: "circle-hard",   label: "Circle – sharp",   gradient: "radial-gradient(circle, #fff 0%, #fff 42%, transparent 44%)" },
  { id: "ring",          label: "Ring",             gradient: "radial-gradient(circle, transparent 38%, rgba(255,255,255,0.9) 42%, rgba(255,255,255,0.9) 48%, transparent 50%)" },
  { id: "spark",         label: "Spark",            gradient: "radial-gradient(ellipse 20% 100%, #fff 0%, transparent 100%)" },
  { id: "smoke",         label: "Smoke puff",       gradient: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.25) 30%, rgba(255,255,255,0.08) 60%, transparent 80%)" },
  { id: "star",          label: "Star burst",       gradient: "radial-gradient(circle, rgba(255,230,80,1) 0%, rgba(255,180,20,0.7) 20%, transparent 60%)" },
  { id: "flame",         label: "Flame lick",       gradient: "radial-gradient(ellipse 60% 100% at 50% 100%, rgba(255,120,20,1) 0%, rgba(255,60,0,0.6) 50%, transparent 80%)" },
  { id: "beam",          label: "Beam line",        gradient: "linear-gradient(to bottom, transparent, #fff 30%, #fff 70%, transparent)" },
];

const FLIPBOOK_PLAYBACK_OPTIONS: Array<{ value: RendererFlipbookSettings["playbackMode"]; label: string }> = [
  { value: "particle-age", label: "Particle age" },
  { value: "scene-time", label: "Scene time" }
];

const DOCUMENT_TEMPLATES: Array<{ id: DocumentTemplateId; label: string; create: () => ReturnType<typeof createBlankVfxEffectDocument> }> = [
  { id: "blank", label: "Blank", create: createBlankVfxEffectDocument },
  { id: "campfire", label: "Campfire", create: createCampfireVfxEffectDocument }
];

const BUILTIN_TEXTURE_IDS = new Set(DEFAULT_TEXTURES.map((texture) => texture.id));

type StageKey = "deathStage" | "initializeStage" | "spawnStage" | "updateStage";
type DocumentTemplateId = "blank" | "campfire";

function getStageKey(stage: StageName): StageKey {
  return stage === "spawn" ? "spawnStage" : stage === "initialize" ? "initializeStage" : stage === "update" ? "updateStage" : "deathStage";
}

function parseLooseValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && `${numeric}` === trimmed) return numeric;
  return trimmed;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function createDefaultFlipbookSettings(templateId: RendererSlot["template"], textureId?: string): RendererFlipbookSettings {
  const useSmokeAtlas = templateId === "SpriteSmokeMaterial" || textureId === "smoke";
  return {
    enabled: useSmokeAtlas,
    rows: useSmokeAtlas ? 2 : 1,
    cols: useSmokeAtlas ? 2 : 1,
    fps: useSmokeAtlas ? 5 : 12,
    looping: true,
    playbackMode: "particle-age"
  };
}

// ── Shared field components ────────────────────────────────────────────────

/** A single property row: label on left, control on right. Figma-style. */
function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/4 px-3 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[11px] text-zinc-500">{label}</span>
      <div className="w-32 min-w-0">{children}</div>
    </div>
  );
}

const SELECT_CLASS =
  "h-7 w-full min-w-0 rounded-xl bg-white/5 px-2 text-[11px] text-zinc-200 outline-none transition hover:bg-white/8 focus:bg-white/8";
const TEXT_INPUT_CLASS =
  "h-7 w-full min-w-0 rounded-xl bg-white/5 px-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 transition focus:bg-white/8";
const TEXTAREA_CLASS =
  "min-h-24 w-full resize-y rounded-xl border border-white/8 bg-black/20 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-emerald-300/25";

// ── Module config editor ───────────────────────────────────────────────────

function ModuleJsonEditor(props: {
  config: ModuleInstance["config"];
  onApply(nextConfig: ModuleInstance["config"]): void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => prettyJson(props.config));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(prettyJson(props.config));
    setError(null);
  }, [props.config]);

  function applyDraft() {
    try {
      const nextConfig = draft.trim().length === 0 ? {} : JSON.parse(draft);
      if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) throw new Error("Config must be a JSON object.");
      props.onApply(nextConfig as ModuleInstance["config"]);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Invalid JSON config.");
    }
  }

  return (
    <div className="border-t border-white/6">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[10px] text-zinc-600 transition hover:text-zinc-400"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>Advanced JSON config</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="mb-1.5 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500 transition hover:border-emerald-300/25 hover:text-emerald-300"
              onClick={applyDraft}
            >
              Apply
            </button>
          </div>
          <textarea
            className={TEXTAREA_CLASS}
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={applyDraft}
          />
          {error ? <p className="mt-1 text-[10px] text-rose-400">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function ModuleConfigFields(props: {
  attributeOptions: string[];
  attributeTypeMap: Record<string, string>;
  module: ModuleInstance;
  onUpdate(nextModule: ModuleInstance): void;
}) {
  const config = { ...getDefaultModuleConfig(props.module.kind), ...props.module.config };

  function num(key: string, fallback = 0) {
    return (v: number) => props.onUpdate({ ...props.module, config: { ...props.module.config, [key]: v } });
  }

  function str(key: string) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      props.onUpdate({ ...props.module, config: { ...props.module.config, [key]: e.target.value } });
  }

  function loose(key: string) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      props.onUpdate({ ...props.module, config: { ...props.module.config, [key]: parseLooseValue(e.target.value) } });
  }

  const { kind } = props.module;
  const selectedAttribute = typeof config.attribute === "string" ? config.attribute : "";
  const selectedAttributeType = props.attributeTypeMap[selectedAttribute];
  const isScalarNumericAttribute =
    selectedAttributeType === "float" || selectedAttributeType === "int" || selectedAttributeType === "uint";
  const currentValue = config.value;
  const isNumericValue = typeof currentValue === "number" && Number.isFinite(currentValue);

  return (
    <>
      {/* Label + enabled row */}
      <PropRow label="Label">
        <input
          className={TEXT_INPUT_CLASS}
          value={props.module.label ?? ""}
          placeholder={formatModuleKind(kind)}
          onChange={(e) =>
            props.onUpdate({ ...props.module, label: e.target.value.trim().length > 0 ? e.target.value : undefined })
          }
        />
      </PropRow>
      <PropRow label="Enabled">
        <button
          type="button"
          className={`h-7 w-full rounded-xl border px-2 text-[11px] transition ${
            props.module.enabled
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-white/10 bg-white/4 text-zinc-500"
          }`}
          onClick={() => props.onUpdate({ ...props.module, enabled: !props.module.enabled })}
        >
          {props.module.enabled ? "Enabled" : "Disabled"}
        </button>
      </PropRow>

      {/* Per-kind fields */}
      {kind === "SpawnRate" && (
        <>
          <PropRow label="Rate / sec"><DragInput value={Number(config.rate ?? 24)} onChange={num("rate")} step={1} min={0} precision={0} /></PropRow>
          <PropRow label="Max alive"><DragInput value={Number(config.maxAlive ?? 0)} onChange={num("maxAlive")} step={1} min={0} precision={0} /></PropRow>
        </>
      )}

      {kind === "SpawnBurst" && (
        <>
          <PropRow label="Count"><DragInput value={Number(config.count ?? 24)} onChange={num("count")} step={1} min={0} precision={0} /></PropRow>
          <PropRow label="Every event">
            <input className={TEXT_INPUT_CLASS} value={String(config.everyEvent ?? "")} placeholder="event:fire" onChange={str("everyEvent")} />
          </PropRow>
        </>
      )}

      {kind === "SpawnCone" && (
        <>
          <PropRow label="Angle (degrees)"><DragInput value={Number(config.angleDegrees ?? 16)} onChange={num("angleDegrees")} step={1} min={0} precision={1} /></PropRow>
          <PropRow label="Radius"><DragInput value={Number(config.radius ?? 0.1)} onChange={num("radius")} step={0.01} min={0} precision={3} /></PropRow>
          <PropRow label="Offset X"><DragInput value={Number(config.offsetX ?? 0)} onChange={num("offsetX")} step={0.01} precision={3} /></PropRow>
          <PropRow label="Offset Y"><DragInput value={Number(config.offsetY ?? 0)} onChange={num("offsetY")} step={0.01} precision={3} /></PropRow>
          <PropRow label="Offset Z"><DragInput value={Number(config.offsetZ ?? 0)} onChange={num("offsetZ")} step={0.01} precision={3} /></PropRow>
          <PropRow label="Random X"><DragInput value={Number(config.randomX ?? 0)} onChange={num("randomX")} step={0.01} min={0} precision={3} /></PropRow>
          <PropRow label="Random Y"><DragInput value={Number(config.randomY ?? 0)} onChange={num("randomY")} step={0.01} min={0} precision={3} /></PropRow>
          <PropRow label="Random Z"><DragInput value={Number(config.randomZ ?? 0)} onChange={num("randomZ")} step={0.01} min={0} precision={3} /></PropRow>
        </>
      )}

      {kind === "SetAttribute" && (
        <>
          <PropRow label="Attribute">
            <select className={SELECT_CLASS} value={String(config.attribute ?? "lifetime")} onChange={str("attribute")}>
              {[...new Set([...(props.attributeOptions.length > 0 ? props.attributeOptions : ["lifetime"]), String(config.attribute ?? "")].filter(Boolean))].map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </PropRow>
          <PropRow label="Value">
            {isScalarNumericAttribute || isNumericValue ? (
              <DragInput
                value={typeof currentValue === "number" ? currentValue : 0}
                onChange={(value) =>
                  props.onUpdate({
                    ...props.module,
                    config: {
                      ...props.module.config,
                      value: selectedAttributeType === "int" || selectedAttributeType === "uint" ? Math.round(value) : value
                    }
                  })
                }
                step={selectedAttributeType === "int" || selectedAttributeType === "uint" ? 1 : 0.01}
                precision={selectedAttributeType === "int" || selectedAttributeType === "uint" ? 0 : 3}
                min={selectedAttributeType === "uint" ? 0 : undefined}
              />
            ) : (
              <input className={TEXT_INPUT_CLASS} value={String(config.value ?? "")} placeholder="0.42" onChange={loose("value")} />
            )}
          </PropRow>
        </>
      )}

      {kind === "VelocityCone" && (
        <>
          <PropRow label="Speed min"><DragInput value={Number(config.speedMin ?? 8)} onChange={num("speedMin")} step={0.1} precision={2} /></PropRow>
          <PropRow label="Speed max"><DragInput value={Number(config.speedMax ?? 22)} onChange={num("speedMax")} step={0.1} precision={2} /></PropRow>
          <PropRow label="Angle (degrees)"><DragInput value={Number(config.angleDegrees ?? 16)} onChange={num("angleDegrees")} step={1} min={0} precision={1} /></PropRow>
        </>
      )}

      {kind === "InheritVelocity" && (
        <PropRow label="Scale"><DragInput value={Number(config.scale ?? 1)} onChange={num("scale")} step={0.05} precision={2} /></PropRow>
      )}

      {kind === "RandomRange" && (
        <>
          <PropRow label="Min"><DragInput value={Number(config.min ?? 0)} onChange={num("min")} step={0.01} precision={3} /></PropRow>
          <PropRow label="Max"><DragInput value={Number(config.max ?? 1)} onChange={num("max")} step={0.01} precision={3} /></PropRow>
          <PropRow label="Output key">
            <input className={TEXT_INPUT_CLASS} value={String(config.output ?? "sample")} onChange={str("output")} />
          </PropRow>
        </>
      )}

      {kind === "Drag" && (
        <PropRow label="Coefficient"><DragInput value={Number(config.coefficient ?? 2.8)} onChange={num("coefficient")} step={0.1} min={0} precision={2} /></PropRow>
      )}

      {kind === "GravityForce" && (
        <>
          <PropRow label="Accel X"><DragInput value={Number(config.accelerationX ?? 0)} onChange={num("accelerationX")} step={0.1} precision={2} /></PropRow>
          <PropRow label="Accel Y"><DragInput value={Number(config.accelerationY ?? 120)} onChange={num("accelerationY")} step={0.1} precision={2} /></PropRow>
          <PropRow label="Accel Z"><DragInput value={Number(config.accelerationZ ?? 0)} onChange={num("accelerationZ")} step={0.1} precision={2} /></PropRow>
        </>
      )}

      {(kind === "ColorOverLife" || kind === "SizeOverLife" || kind === "AlphaOverLife") && (
        <>
          <PropRow label="Curve">
            <select className={SELECT_CLASS} value={String(config.curve ?? CURVE_PRESETS[0])} onChange={str("curve")}>
              {[...new Set([String(config.curve ?? CURVE_PRESETS[0]), ...CURVE_PRESETS])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </PropRow>
          <PropRow label={kind === "SizeOverLife" ? "End scale" : "Bias"}>
            <DragInput value={Number(config.bias ?? 1)} onChange={num("bias", 1)} step={0.05} min={0.01} precision={2} />
          </PropRow>
        </>
      )}

      {kind === "KillByDistance" && (
        <PropRow label="Max distance"><DragInput value={Number(config.maxDistance ?? 10)} onChange={num("maxDistance")} step={0.1} min={0} precision={2} /></PropRow>
      )}

      {kind === "SendEvent" && (
        <>
          <PropRow label="Event ID">
            <input className={TEXT_INPUT_CLASS} value={String(config.eventId ?? "")} placeholder="event:impact" onChange={str("eventId")} />
          </PropRow>
          <PropRow label="When">
            <input className={TEXT_INPUT_CLASS} value={String(config.when ?? "")} placeholder="on-death" onChange={str("when")} />
          </PropRow>
        </>
      )}

      {kind === "CollisionBounce" && (
        <>
          <PropRow label="Restitution"><DragInput value={Number(config.restitution ?? 0.6)} onChange={num("restitution")} step={0.05} min={0} precision={2} /></PropRow>
          <PropRow label="Friction"><DragInput value={Number(config.friction ?? 0.1)} onChange={num("friction")} step={0.05} min={0} precision={2} /></PropRow>
        </>
      )}

      {kind === "CollisionQuery" && (
        <>
          <PropRow label="Interface ID">
            <input className={TEXT_INPUT_CLASS} value={String(config.interfaceId ?? "")} placeholder="interface:collision" onChange={str("interfaceId")} />
          </PropRow>
          <PropRow label="Radius"><DragInput value={Number(config.radius ?? 0.1)} onChange={num("radius")} step={0.01} min={0} precision={3} /></PropRow>
        </>
      )}

      {kind === "CurlNoiseForce" && (
        <>
          <PropRow label="Strength"><DragInput value={Number(config.strength ?? 1)} onChange={num("strength")} step={0.1} precision={2} /></PropRow>
          <PropRow label="Frequency"><DragInput value={Number(config.frequency ?? 1)} onChange={num("frequency")} step={0.1} precision={2} /></PropRow>
        </>
      )}

      {kind === "OrbitTarget" && (
        <>
          <PropRow label="Radius"><DragInput value={Number(config.radius ?? 1)} onChange={num("radius")} step={0.01} min={0} precision={2} /></PropRow>
          <PropRow label="Angular speed"><DragInput value={Number(config.angularSpeed ?? 1)} onChange={num("angularSpeed")} step={0.1} precision={2} /></PropRow>
        </>
      )}
    </>
  );
}

// ── Inspector tab: flat module list with inline configs ────────────────────

const INSPECTOR_STAGE_DEFS: Array<{
  stage: StageName;
  docKey: keyof Pick<EmitterDocument, "spawnStage" | "initializeStage" | "updateStage" | "deathStage">;
  label: string;
}> = [
  { stage: "spawn", docKey: "spawnStage", label: "Spawn" },
  { stage: "initialize", docKey: "initializeStage", label: "Initialize" },
  { stage: "update", docKey: "updateStage", label: "Update" },
  { stage: "death", docKey: "deathStage", label: "Death" }
];

// ── Asset browser (texture picker) ────────────────────────────────────────

function TexturePicker(props: {
  selectedId: string | undefined;
  onSelect(textureId: string): void;
  onUpload(url: string, label: string): void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadedTextures, setUploadedTextures] = useState<TextureAsset[]>([]);
  const allTextures = [...DEFAULT_TEXTURES, ...uploadedTextures];

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const label = file.name.replace(/\.[^.]+$/, "");
    const id = url;
    const asset: TextureAsset = { id, label, gradient: `url(${url})` };
    setUploadedTextures((prev) => [...prev, asset]);
    props.onSelect(id);
    props.onUpload(url, label);
    e.target.value = "";
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-600">Particle texture</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-2.5" />
          <span>Upload</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {allTextures.map((tex) => (
          <button
            key={tex.id}
            type="button"
            title={tex.label}
            className={`group flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
              props.selectedId === tex.id
                ? "border-emerald-300/40 bg-emerald-400/8"
                : "border-white/8 hover:border-white/16"
            }`}
            onClick={() => props.onSelect(tex.id)}
          >
            <div
              className="h-9 w-full rounded-md bg-zinc-900"
              style={{ background: tex.gradient }}
            />
            <span className="w-full truncate text-center text-[9px] leading-tight text-zinc-600 group-hover:text-zinc-400">
              {tex.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RendererSection(props: {
  emitter: EmitterDocument;
  onApplyTemplate(templateId: string): void;
  onAddRenderer(templateId: string): void;
  onCycleBlendMode(rendererId: string): void;
  onSetRendererTexture(rendererId: string, textureUrl: string): void;
  onUpdateRendererFlipbook(rendererId: string, patch: Partial<RendererFlipbookSettings>): void;
}) {
  const [open, setOpen] = useState(true);
  const [activeRendererId, setActiveRendererId] = useState<string | null>(
    props.emitter.renderers[0]?.id ?? null
  );
  const { emitter } = props;

  const activeRenderer = emitter.renderers.find((r) => r.id === activeRendererId) ?? emitter.renderers[0];
  const activeTextureId = activeRenderer?.parameterBindings["_texture"] ?? undefined;
  const activeFlipbook = activeRenderer?.flipbookSettings ?? createDefaultFlipbookSettings(activeRenderer?.template ?? "SpriteAdditiveMaterial", activeTextureId);

  return (
    <div className="border-t border-white/6">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3 text-zinc-600" /> : <ChevronRight className="size-3 text-zinc-600" />}
        <span className="text-[11px] font-medium text-zinc-500">Renderer</span>
        <span className="ml-auto text-[10px] text-zinc-700">{emitter.renderers.length} slot{emitter.renderers.length !== 1 ? "s" : ""}</span>
      </button>
      {open && (
        <div className="space-y-4 px-3 pb-4">
          {/* Material template picker */}
          <div>
            <p className="mb-1.5 text-[10px] text-zinc-600">Material template</p>
            <div className="space-y-1">
              {MVP_RENDERER_TEMPLATES.map((template) => {
                const isActive = emitter.renderers.some((r) => r.template === template.id);
                return (
                  <div
                    key={template.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                      isActive ? "border-emerald-300/30 bg-emerald-400/6" : "border-white/8"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isActive && <Check className="size-3 shrink-0 text-emerald-400" />}
                        <span className="truncate text-[11.5px] font-medium text-zinc-200">{template.id.replace("Material", "")}</span>
                      </div>
                      <p className="text-[10px] leading-snug text-zinc-600">{template.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="Use this as the active renderer template"
                        className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500 transition hover:border-emerald-300/30 hover:text-emerald-200"
                        onClick={() => props.onApplyTemplate(template.id)}
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        title="Add as an extra renderer layer"
                        className="flex size-5.5 items-center justify-center rounded-md border border-white/10 text-zinc-600 transition hover:border-emerald-300/30 hover:text-emerald-200"
                        onClick={() => props.onAddRenderer(template.id)}
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active renderer slots + settings */}
          {emitter.renderers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-600">Active slots</p>
              <div className="flex gap-1.5 flex-wrap">
                {emitter.renderers.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                      activeRendererId === r.id || (!activeRendererId && emitter.renderers[0]?.id === r.id)
                        ? "border-emerald-300/30 bg-emerald-400/8 text-emerald-200"
                        : "border-white/8 text-zinc-400 hover:border-white/16"
                    }`}
                    onClick={() => setActiveRendererId(r.id)}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
              {activeRenderer && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600">Blend</span>
                  <button
                    type="button"
                    className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-white/20"
                    onClick={() => props.onCycleBlendMode(activeRenderer.id)}
                  >
                    {activeRenderer.material.blendMode}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Texture picker */}
          <TexturePicker
            selectedId={activeTextureId}
            onSelect={(id) => {
              const renderer = activeRenderer ?? emitter.renderers[0];
              if (renderer) props.onSetRendererTexture(renderer.id, id);
            }}
            onUpload={(url) => {
              const renderer = activeRenderer ?? emitter.renderers[0];
              if (renderer) props.onSetRendererTexture(renderer.id, url);
            }}
          />

          {activeRenderer && (
            <div className="space-y-2 rounded-xl border border-white/8 bg-black/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Flipbook</span>
                <button
                  type="button"
                  className={`rounded-md border px-2 py-0.5 text-[10px] transition ${
                    activeFlipbook.enabled
                      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                  }`}
                  onClick={() => props.onUpdateRendererFlipbook(activeRenderer.id, { enabled: !activeFlipbook.enabled })}
                >
                  {activeFlipbook.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-[10px] text-zinc-600">Rows</div>
                  <DragInput
                    value={activeFlipbook.rows}
                    onChange={(value) => props.onUpdateRendererFlipbook(activeRenderer.id, { rows: Math.max(1, Math.round(value)) })}
                    step={1}
                    min={1}
                    precision={0}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] text-zinc-600">Cols</div>
                  <DragInput
                    value={activeFlipbook.cols}
                    onChange={(value) => props.onUpdateRendererFlipbook(activeRenderer.id, { cols: Math.max(1, Math.round(value)) })}
                    step={1}
                    min={1}
                    precision={0}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] text-zinc-600">FPS</div>
                  <DragInput
                    value={activeFlipbook.fps}
                    onChange={(value) => props.onUpdateRendererFlipbook(activeRenderer.id, { fps: Math.max(0.1, value) })}
                    step={0.5}
                    min={0.1}
                    precision={2}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] text-zinc-600">Playback</div>
                  <select
                    className={SELECT_CLASS}
                    value={activeFlipbook.playbackMode}
                    onChange={(event) =>
                      props.onUpdateRendererFlipbook(activeRenderer.id, {
                        playbackMode: event.target.value as RendererFlipbookSettings["playbackMode"]
                      })
                    }
                  >
                    {FLIPBOOK_PLAYBACK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-[10px] text-zinc-500">
                <input
                  type="checkbox"
                  className="accent-emerald-400"
                  checked={activeFlipbook.looping}
                  onChange={(event) => props.onUpdateRendererFlipbook(activeRenderer.id, { looping: event.target.checked })}
                />
                <span>Loop animation</span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Event & Parameter node editors ────────────────────────────────────────

const ATTRIBUTE_TYPE_OPTIONS = ["bool", "float", "float2", "float3", "float4", "int", "uint"] as const;
const PARAMETER_TYPE_OPTIONS = ["bool", "color", "float", "float2", "float3", "int", "trigger"] as const;

function EventNodePanel(props: {
  event: VfxEventDefinition;
  onUpdate(next: VfxEventDefinition): void;
}) {
  const { event } = props;
  const payloadKeys = Object.keys(event.payload);

  function addPayloadKey() {
    const key = `field${payloadKeys.length + 1}`;
    props.onUpdate({ ...event, payload: { ...event.payload, [key]: "float" } });
  }

  function removePayloadKey(key: string) {
    const next = { ...event.payload };
    delete next[key];
    props.onUpdate({ ...event, payload: next });
  }

  function renamePayloadKey(oldKey: string, newKey: string) {
    if (!newKey.trim() || newKey === oldKey) return;
    const next: VfxEventDefinition["payload"] = {};
    for (const k of Object.keys(event.payload)) {
      next[k === oldKey ? newKey.trim() : k] = event.payload[k]!;
    }
    props.onUpdate({ ...event, payload: next });
  }

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
        <Orbit className="size-3.5 shrink-0 text-sky-400/60" />
        <span className="text-[12.5px] font-semibold text-zinc-200">Event</span>
        <span className="ml-1 font-mono text-[10px] text-zinc-600">{event.id}</span>
      </div>
      <div className="space-y-0 pt-1">
        <PropRow label="Name">
          <input
            className={TEXT_INPUT_CLASS}
            value={event.name}
            onChange={(e) => props.onUpdate({ ...event, name: e.target.value })}
          />
        </PropRow>
        <PropRow label="Description">
          <input
            className={TEXT_INPUT_CLASS}
            value={event.description ?? ""}
            placeholder="Optional description"
            onChange={(e) => props.onUpdate({ ...event, description: e.target.value || undefined })}
          />
        </PropRow>
      </div>

      {/* Payload fields */}
      <div className="mt-3 border-t border-white/6 px-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">Payload fields</span>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500 transition hover:border-emerald-300/25 hover:text-emerald-300"
            onClick={addPayloadKey}
          >
            <Plus className="size-3" /> Add field
          </button>
        </div>
        {payloadKeys.length === 0 && (
          <p className="text-[11px] text-zinc-700">No payload fields. Events can carry data fields to emitters.</p>
        )}
        <div className="space-y-1">
          {payloadKeys.map((key) => (
            <div key={key} className="flex items-center gap-1.5">
              <input
                className="h-7 min-w-0 flex-1 rounded-lg bg-white/5 px-2 text-[11px] text-zinc-200 outline-none focus:bg-white/8"
                defaultValue={key}
                onBlur={(e) => renamePayloadKey(key, e.target.value)}
              />
              <select
                className="h-7 rounded-lg bg-white/5 px-1 text-[11px] text-zinc-200 outline-none"
                value={event.payload[key]}
                onChange={(e) =>
                  props.onUpdate({ ...event, payload: { ...event.payload, [key]: e.target.value as typeof ATTRIBUTE_TYPE_OPTIONS[number] } })
                }
              >
                {ATTRIBUTE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-zinc-600 hover:text-rose-400"
                onClick={() => removePayloadKey(key)}
              >×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParameterNodePanel(props: {
  parameter: VfxParameter;
  onUpdate(next: VfxParameter): void;
  onFireInPreview(): void;
}) {
  const { parameter } = props;

  function renderValueInput() {
    const value = parameter.defaultValue;
    if (parameter.type === "bool") {
      return (
        <PropRow label="Default">
          <button
            type="button"
            className={`h-7 w-full rounded-xl border px-2 text-[11px] transition ${
              value ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/4 text-zinc-500"
            }`}
            onClick={() => props.onUpdate({ ...parameter, defaultValue: !value })}
          >
            {value ? "true" : "false"}
          </button>
        </PropRow>
      );
    }
    if (parameter.type === "color") {
      return (
        <PropRow label="Default color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-7 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5"
              value={typeof value === "string" ? value : "#34d399"}
              onChange={(e) => props.onUpdate({ ...parameter, defaultValue: e.target.value })}
            />
            <span className="font-mono text-[11px] text-zinc-400">{typeof value === "string" ? value : "#34d399"}</span>
          </div>
        </PropRow>
      );
    }
    if (parameter.type === "trigger") {
      return (
        <div className="px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/24 bg-emerald-400/10 py-2 text-[12px] text-emerald-200 transition hover:bg-emerald-400/18"
            onClick={props.onFireInPreview}
          >
            Fire in preview
          </button>
        </div>
      );
    }
    if (parameter.type === "float" || parameter.type === "int") {
      return (
        <PropRow label="Default">
          <DragInput
            value={typeof value === "number" ? value : 0}
            onChange={(v) => props.onUpdate({ ...parameter, defaultValue: parameter.type === "int" ? Math.round(v) : v })}
            step={parameter.type === "int" ? 1 : 0.01}
            precision={parameter.type === "int" ? 0 : 3}
          />
        </PropRow>
      );
    }
    return (
      <PropRow label="Default">
        <input
          className={TEXT_INPUT_CLASS}
          value={typeof value === "string" ? value : JSON.stringify(value ?? "")}
          placeholder="value"
          onChange={(e) => props.onUpdate({ ...parameter, defaultValue: parseLooseValue(e.target.value) as VfxParameter["defaultValue"] })}
        />
      </PropRow>
    );
  }

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
        <Cable className="size-3.5 shrink-0 text-violet-400/60" />
        <span className="text-[12.5px] font-semibold text-zinc-200">Parameter</span>
        <span className="ml-1 font-mono text-[10px] text-zinc-600">{parameter.id}</span>
      </div>
      <div className="space-y-0 pt-1">
        <PropRow label="Name">
          <input
            className={TEXT_INPUT_CLASS}
            value={parameter.name}
            onChange={(e) => props.onUpdate({ ...parameter, name: e.target.value })}
          />
        </PropRow>
        <PropRow label="Type">
          <select
            className={SELECT_CLASS}
            value={parameter.type}
            onChange={(e) => props.onUpdate({ ...parameter, type: e.target.value as VfxParameter["type"], defaultValue: undefined })}
          >
            {PARAMETER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </PropRow>
        {renderValueInput()}
        <PropRow label="Description">
          <input
            className={TEXT_INPUT_CLASS}
            value={parameter.description ?? ""}
            placeholder="Optional description"
            onChange={(e) => props.onUpdate({ ...parameter, description: e.target.value || undefined })}
          />
        </PropRow>
        <PropRow label="Exposed">
          <button
            type="button"
            className={`h-7 w-full rounded-xl border px-2 text-[11px] transition ${
              parameter.exposed
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/4 text-zinc-500"
            }`}
            onClick={() => props.onUpdate({ ...parameter, exposed: !parameter.exposed })}
          >
            {parameter.exposed ? "Exposed" : "Internal"}
          </button>
        </PropRow>
      </div>
    </div>
  );
}

function InspectorPanel(props: {
  selectedGraphNode: EffectGraphNode | null;
  emitter: EmitterDocument | null;
  attributeOptions: string[];
  attributeTypeMap: Record<string, string>;
  selectedModuleId: string | null;
  onUpdateStageModule(stage: StageName, moduleId: string, next: ModuleInstance): void;
  onRemoveStageModule(stage: StageName, moduleId: string): void;
  onApplyTemplate(templateId: string): void;
  onAddRenderer(templateId: string): void;
  onCycleBlendMode(rendererId: string): void;
  onSetRendererTexture(rendererId: string, textureUrl: string): void;
  onUpdateRendererFlipbook(rendererId: string, patch: Partial<RendererFlipbookSettings>): void;
  onUpdateEvent(event: VfxEventDefinition): void;
  onUpdateParameter(parameter: VfxParameter): void;
  onFireParameterInPreview(parameterId: string): void;
  events: VfxEventDefinition[];
  parameters: VfxParameter[];
}) {
  const { selectedGraphNode } = props;

  // Event node selected → show event editor
  if (selectedGraphNode?.kind === "event") {
    const eventId = selectedGraphNode.eventId;
    const event = props.events.find((e) => e.id === eventId);
    if (!event) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Orbit className="mb-3 size-7 text-zinc-700" />
          <p className="text-[12px] text-zinc-600">Event &ldquo;{eventId}&rdquo; not found in document.</p>
        </div>
      );
    }
    return <EventNodePanel event={event} onUpdate={props.onUpdateEvent} />;
  }

  // Parameter node selected → show parameter editor
  if (selectedGraphNode?.kind === "parameter") {
    const parameterId = selectedGraphNode.parameterId;
    const parameter = props.parameters.find((p) => p.id === parameterId);
    if (!parameter) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Cable className="mb-3 size-7 text-zinc-700" />
          <p className="text-[12px] text-zinc-600">Parameter &ldquo;{parameterId}&rdquo; not found.</p>
        </div>
      );
    }
    return (
      <ParameterNodePanel
        parameter={parameter}
        onUpdate={props.onUpdateParameter}
        onFireInPreview={() => props.onFireParameterInPreview(parameter.id)}
      />
    );
  }

  // No emitter → empty state
  if (!props.emitter) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Flame className="mb-3 size-7 text-zinc-700" />
        <p className="text-[12px] text-zinc-600">Select a node to inspect it.</p>
      </div>
    );
  }

  const { emitter } = props;

  return (
    <div className="pb-4">
      {/* Emitter header */}
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
        <Flame className="size-3.5 shrink-0 text-emerald-400/60" />
        <span className="text-[12.5px] font-semibold text-zinc-200">{emitter.name}</span>
        <span className="ml-1 text-[11px] text-zinc-600">{emitter.simulationDomain}</span>
      </div>

      {INSPECTOR_STAGE_DEFS.map(({ stage, docKey, label }) => {
        const modules = emitter[docKey].modules;
        if (modules.length === 0) return null;

        return (
          <div key={stage}>
            {/* Stage separator */}
            <div className="flex items-center gap-2 px-3 py-2">
              <div className={`h-2 w-0.5 rounded-full ${STAGE_ACCENTS[stage]} opacity-60`} />
              <span className="text-[10.5px] font-medium text-zinc-600">{label}</span>
            </div>

            {modules.map((module) => (
              <div key={module.id} className="mb-2 mx-3 overflow-hidden rounded-xl border border-white/7 bg-black/15">
                {/* Module header */}
                <div className={`border-b border-white/6 px-3 py-2 ${props.selectedModuleId === module.id ? "bg-emerald-400/6" : ""}`}>
                  <div className="flex items-center gap-2">
                    <div className={`size-1.5 shrink-0 rounded-full ${STAGE_ACCENTS[stage]} opacity-50`} />
                    <span className="flex-1 text-[12px] font-medium text-zinc-200">
                      {module.label ?? formatModuleKind(module.kind)}
                    </span>
                    <button
                      type="button"
                      className="flex size-5 items-center justify-center rounded text-zinc-600 transition hover:text-rose-400"
                      onClick={() => props.onRemoveStageModule(stage, module.id)}
                      aria-label="Remove module"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-0.5 pl-3.5 text-[10.5px] leading-snug text-zinc-600">{MODULE_DESCRIPTORS[module.kind].summary}</p>
                </div>

                {/* Module config fields */}
                <ModuleConfigFields
                  attributeOptions={props.attributeOptions}
                  attributeTypeMap={props.attributeTypeMap}
                  module={module}
                  onUpdate={(next) => props.onUpdateStageModule(stage, module.id, next)}
                />

                {/* JSON editor */}
                <ModuleJsonEditor
                  config={module.config}
                  onApply={(nextConfig) =>
                    props.onUpdateStageModule(stage, module.id, { ...module, config: nextConfig })
                  }
                />
              </div>
            ))}
          </div>
        );
      })}

      {/* Empty state */}
      {INSPECTOR_STAGE_DEFS.every(({ docKey }) => emitter[docKey].modules.length === 0) && (
        <p className="px-3 py-6 text-center text-[12px] text-zinc-600">
          No modules yet. Add them via the node in the canvas.
        </p>
      )}

      {/* Renderer section */}
      <RendererSection
        emitter={emitter}
        onApplyTemplate={props.onApplyTemplate}
        onAddRenderer={props.onAddRenderer}
        onCycleBlendMode={props.onCycleBlendMode}
        onSetRendererTexture={props.onSetRendererTexture}
        onUpdateRendererFlipbook={props.onUpdateRendererFlipbook}
      />
    </div>
  );
}

// ── Renderer helpers ───────────────────────────────────────────────────────

function createRendererFromTemplate(templateId: string, index: number): RendererSlot {
  const kind =
    templateId === "RibbonTrailMaterial" ? "ribbon"
    : templateId === "MeshParticleMaterial" ? "mesh"
    : templateId === "DistortionMaterial" ? "distortion"
    : templateId === "BeamMaterial" ? "beam"
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
    flipbookSettings: createDefaultFlipbookSettings(templateId as RendererSlot["template"]),
    parameterBindings: {}
  };
}

type InspectorTab = "inspector" | "graph" | "diagnostics";

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "inspector", label: "Inspector" },
  { id: "graph", label: "Graph" },
  { id: "diagnostics", label: "Diagnostics" }
];

export function VfxEditorWorkspace(props: { store: VfxEditorStore }) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const copilotPanelRef = useRef<HTMLDivElement | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspector");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<DocumentTemplateId>("blank");
  const state = useEditorStoreValue(props.store, () => props.store.getState(), ["document", "selection", "compile", "emitters"]);
  const selectedEmitter = state.document.emitters.find((e) => e.id === state.selection.selectedEmitterId) ?? state.document.emitters[0];
  const { previewRect, beginPreviewInteraction, updatePreviewBounds } = usePreviewPanelDrag(workspaceRef);
  const { copilotPosition, beginCopilotDrag, updateCopilotBounds } = useCopilotPanelDrag(workspaceRef, copilotPanelRef, copilotOpen);
  const copilot = useCopilot(props.store);
  const attributeTypeMap = useMemo(
    () => ({
      ...BUILTIN_ATTRIBUTE_TYPES,
      ...(selectedEmitter?.attributes ?? {})
    }),
    [selectedEmitter?.attributes]
  );
  const attributeOptions = selectedEmitter
    ? [...new Set([...Object.keys(BUILTIN_ATTRIBUTE_TYPES), ...Object.keys(selectedEmitter.attributes)])].sort((a, b) => a.localeCompare(b))
    : Object.keys(BUILTIN_ATTRIBUTE_TYPES);

  // Build emitterDocuments map for graph canvas
  const emitterDocuments = useMemo(() => {
    const map = new Map<string, EmitterDocument>();
    for (const emitter of state.document.emitters) {
      map.set(emitter.id, emitter);
    }
    return map;
  }, [state.document.emitters]);

  useEffect(() => {
    if (state.compileResult) backend.prepareEffect(state.compileResult);
  }, [state.compileResult]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const ro = new ResizeObserver(() => {
      updatePreviewBounds();
      if (copilotOpen) {
        updateCopilotBounds();
      }
    });
    ro.observe(element);
    if (copilotOpen && copilotPanelRef.current) {
      ro.observe(copilotPanelRef.current);
    }
    return () => ro.disconnect();
  }, [copilotOpen, updateCopilotBounds, updatePreviewBounds]);

  useEffect(() => {
    setSelectedModuleId(null);
  }, [selectedEmitter?.id]);

  const artifactPreview = state.compileResult ? serializeVfxArtifact(createVfxArtifact({ effect: state.compileResult })) : "";
  const cacheSnapshot = backend.getCacheSnapshot();

  const handleExportBundle = useCallback(async () => {
    if (!state.compileResult) {
      return;
    }

    const artifact = createVfxArtifact({ effect: state.compileResult });
    const textureBindings = Array.from(
      new Set(
        state.compileResult.emitters
          .flatMap((emitter) => emitter.renderers)
          .map((renderer) => renderer.textureBinding)
          .filter((binding): binding is string => typeof binding === "string" && !BUILTIN_TEXTURE_IDS.has(binding))
      )
    );

    const assets = await Promise.all(
      textureBindings.map(async (binding, index) => {
        const response = await fetch(binding);
        if (!response.ok) {
          throw new Error(`Failed to fetch texture asset for bundle export: ${binding}`);
        }

        const contentType = response.headers.get("content-type") ?? "image/png";
        const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";

        return {
          id: binding,
          path: `texture-${index + 1}.${extension}`,
          type: "texture" as const,
          data: new Uint8Array(await response.arrayBuffer())
        };
      })
    );

    const effectName = state.compileResult.name.trim() || state.document.emitters[0]?.name || "effect";
    const zipBytes = createVfxRuntimeBundleZip({
      name: effectName,
      artifact,
      assets,
      document: state.document
    });
    const normalizedZipBytes = new Uint8Array(zipBytes.byteLength);
    normalizedZipBytes.set(zipBytes);
    const blob = new Blob([normalizedZipBytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${effectName.replace(/\s+/g, "-").toLowerCase()}.vfxbundle`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [state.compileResult, state.document.emitters]);

  // Resolve the first selected graph node for context-aware inspector
  const selectedGraphNode = useMemo<EffectGraphNode | null>(() => {
    const id = state.selection.graphNodeIds[0];
    return id ? (state.document.graph.nodes.find((n) => n.id === id) ?? null) : null;
  }, [state.selection.graphNodeIds, state.document.graph.nodes]);

  function updateDocument(updater: (doc: typeof state.document) => typeof state.document) {
    props.store.setDocument(updater(state.document));
  }

  function handleUpdateEvent(next: VfxEventDefinition) {
    updateDocument((doc) => ({ ...doc, events: doc.events.map((e) => (e.id === next.id ? next : e)) }));
  }

  function handleUpdateParameter(next: VfxParameter) {
    updateDocument((doc) => ({ ...doc, parameters: doc.parameters.map((p) => (p.id === next.id ? next : p)) }));
  }

  function handleFireParameterInPreview(_parameterId: string) {
    // Trigger a burst to simulate a trigger parameter firing in the preview
    // The preview panel already handles this via its own burst version
  }

  function handleLoadTemplate(templateId: DocumentTemplateId) {
    const template = DOCUMENT_TEMPLATES.find((entry) => entry.id === templateId);
    if (!template) return;
    props.store.setDocument(template.create());
    props.store.selectGraphNodes([]);
    props.store.selectEmitter(undefined);
    setSelectedEdgeIds([]);
    setSelectedModuleId(null);
    setInspectorTab("inspector");
  }

  function handleAddEmitter() {
    props.store.addEmitterWithGraphNode({
      name: `Emitter ${state.document.emitters.length + 1}`,
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

    if (kind === "event") {
      // Create a brand-new event definition in the document, then wire a node to it
      const eventId = `event:${Date.now()}`;
      const eventName = `Event ${state.document.events.length + 1}`;
      const newEvent: VfxEventDefinition = { id: eventId, name: eventName, payload: {} };
      props.store.setDocument({ ...state.document, events: [...state.document.events, newEvent] });
      props.store.addGraphNodeWithSelection("event", positions.event, { bindingId: eventId, name: eventName });
      setSelectedEdgeIds([]);
      return;
    }

    if (kind === "parameter") {
      // Create a brand-new parameter definition, then wire a node to it
      const parameterId = `param:${Date.now()}`;
      const paramName = `Parameter ${state.document.parameters.length + 1}`;
      const newParam: VfxParameter = { id: parameterId, name: paramName, type: "float", defaultValue: 0, exposed: true };
      props.store.setDocument({ ...state.document, parameters: [...state.document.parameters, newParam] });
      props.store.addGraphNodeWithSelection("parameter", positions.parameter, { bindingId: parameterId, name: paramName });
      setSelectedEdgeIds([]);
      return;
    }

    const name =
      kind === "emitter" ? (selectedEmitter?.name ?? "Emitter Node")
      : kind === "dataInterface" ? "Data Interface"
      : kind === "scalability" ? "Scalability"
      : "Output";
    const bindingId =
      kind === "emitter" ? selectedEmitter?.id
      : kind === "dataInterface" ? state.document.dataInterfaces[0]?.id
      : undefined;
    props.store.addGraphNodeWithSelection(kind, positions[kind], { bindingId, name });
    setSelectedEdgeIds([]);
  }

  function handleApplyTemplate(templateId: string) {
    if (!selectedEmitter) return;
    props.store.updateEmitter(selectedEmitter.id, (emitter) => {
      const nextRenderer = createRendererFromTemplate(templateId, emitter.renderers.length);
      if (emitter.renderers.length === 0) return { ...emitter, renderers: [nextRenderer] };
      return {
        ...emitter,
        renderers: emitter.renderers.map((r, i) =>
          i === 0
            ? {
                ...r,
                name: nextRenderer.name,
                kind: nextRenderer.kind,
                template: nextRenderer.template,
                material: nextRenderer.material,
                flipbookSettings: nextRenderer.flipbookSettings
              }
            : r
        )
      };
    });
  }

  function handleAddRenderer(templateId: string) {
    if (!selectedEmitter) return;
    props.store.updateEmitter(selectedEmitter.id, (emitter) => ({
      ...emitter,
      renderers: [...emitter.renderers, createRendererFromTemplate(templateId, emitter.renderers.length)]
    }));
  }

  function handleCycleBlendMode(rendererId: string) {
    if (!selectedEmitter) return;
    const blendOrder: RendererSlot["material"]["blendMode"][] = ["additive", "alpha", "premultiplied"];
    props.store.updateEmitter(selectedEmitter.id, (emitter) => ({
      ...emitter,
      renderers: emitter.renderers.map((r) => {
        if (r.id !== rendererId) return r;
        const idx = blendOrder.indexOf(r.material.blendMode);
        return { ...r, material: { ...r.material, blendMode: blendOrder[(idx + 1) % blendOrder.length]! } };
      })
    }));
  }

  function handleSetRendererTexture(rendererId: string, textureId: string) {
    if (!selectedEmitter) return;
    props.store.updateEmitter(selectedEmitter.id, (emitter) => ({
      ...emitter,
      renderers: emitter.renderers.map((r) => {
        if (r.id !== rendererId) {
          return r;
        }

        const shouldPromoteSmokeAtlas = textureId === "smoke" && r.flipbookSettings.rows === 1 && r.flipbookSettings.cols === 1;
        return {
          ...r,
          flipbookSettings: shouldPromoteSmokeAtlas ? createDefaultFlipbookSettings(r.template, textureId) : r.flipbookSettings,
          parameterBindings: { ...r.parameterBindings, "_texture": textureId }
        };
      })
    }));
  }

  function handleUpdateRendererFlipbook(rendererId: string, patch: Partial<RendererFlipbookSettings>) {
    if (!selectedEmitter) return;
    props.store.updateEmitter(selectedEmitter.id, (emitter) => ({
      ...emitter,
      renderers: emitter.renderers.map((renderer) => {
        if (renderer.id !== rendererId) {
          return renderer;
        }

        const flipbookSettings = {
          ...createDefaultFlipbookSettings(renderer.template, renderer.parameterBindings._texture),
          ...renderer.flipbookSettings,
          ...patch
        };

        return {
          ...renderer,
          flipbookSettings,
          material: {
            ...renderer.material,
            flipbook: flipbookSettings.enabled
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

  function updateStageModules(emitterId: string, stage: StageName, updater: (modules: ModuleInstance[]) => ModuleInstance[]) {
    const stageKey = getStageKey(stage);
    props.store.updateEmitter(emitterId, (emitter: EmitterDocument) => {
      const currentStage = emitter[stageKey];
      return { ...emitter, [stageKey]: { ...currentStage, modules: updater(currentStage.modules) } } as EmitterDocument;
    });
  }

  function handleUpdateStageModule(stage: StageName, moduleId: string, next: ModuleInstance) {
    if (!selectedEmitter) return;
    updateStageModules(selectedEmitter.id, stage, (modules) => modules.map((m) => (m.id === moduleId ? next : m)));
  }

  function handleRemoveStageModule(stage: StageName, moduleId: string) {
    if (!selectedEmitter) return;
    updateStageModules(selectedEmitter.id, stage, (modules) => modules.filter((m) => m.id !== moduleId));
    if (selectedModuleId === moduleId) setSelectedModuleId(null);
  }

  // Graph canvas callbacks
  function handleAddStageModule(emitterId: string, stage: StageName, kind: ModuleInstance["kind"]) {
    const moduleId = props.store.addStageModule(emitterId, stage, kind);
    setSelectedModuleId(moduleId);
    // Switch to inspector tab to show the new module's config
    setInspectorTab("inspector");
    // Select the emitter if needed
    const emitter = state.document.emitters.find((e) => e.id === emitterId);
    if (emitter && emitter.id !== selectedEmitter?.id) {
      props.store.selectEmitter(emitterId);
    }
  }

  function handleRemoveStageModuleFromNode(emitterId: string, stage: StageName, moduleId: string) {
    updateStageModules(emitterId, stage, (modules) => modules.filter((m) => m.id !== moduleId));
    if (selectedModuleId === moduleId) setSelectedModuleId(null);
  }

  function handleSelectModule(emitterId: string, stage: StageName, moduleId: string) {
    setSelectedModuleId(moduleId);
    setInspectorTab("inspector");
    const emitter = state.document.emitters.find((e) => e.id === emitterId);
    if (emitter && emitter.id !== selectedEmitter?.id) {
      props.store.selectEmitter(emitterId);
    }
  }

  const hasSelection = selectedEdgeIds.length > 0 || state.selection.graphNodeIds.length > 0;

  return (
    <div ref={workspaceRef} className="relative h-full min-h-0">
      {/* ── Top toolbar ─────────────────────────────────────────── */}
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
        <button
          type="button"
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-300/25 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!state.compileResult}
          onClick={() => {
            void handleExportBundle();
          }}
        >
          Export Bundle
        </button>
        <div className="ml-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Template</span>
          <select
            className="h-8 rounded-full border border-white/10 bg-white/4 px-3 text-xs text-zinc-200 outline-none transition hover:border-white/20"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value as DocumentTemplateId)}
          >
            {DOCUMENT_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-300/25 hover:text-emerald-100"
            onClick={() => handleLoadTemplate(selectedTemplateId)}
          >
            Load
          </button>
        </div>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            copilotOpen
              ? "border-emerald-300/45 bg-emerald-400/16 text-emerald-100"
              : "border-white/10 bg-white/3 text-zinc-300 hover:border-emerald-300/25 hover:text-emerald-100"
          }`}
          onClick={() => setCopilotOpen((current) => !current)}
        >
          <Bot className="size-3.5" />
          Codex
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

      {/* ── Graph canvas ────────────────────────────────────────── */}
      <div className="h-full pt-11 pb-7">
        <GraphCanvas
          graph={state.document.graph}
          selectedNodeIds={state.selection.graphNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          emitterDocuments={emitterDocuments}
          selectedModuleId={selectedModuleId}
          stagePresets={STAGE_PRESETS}
          onEdgeSelectionChange={setSelectedEdgeIds}
          onSelectionChange={(nodeIds) => {
            props.store.selectGraphNodes(nodeIds);
            const emitterNode = nodeIds
              .map((id) => state.document.graph.nodes.find((n) => n.id === id && n.kind === "emitter"))
              .find(Boolean);
            if (emitterNode?.kind === "emitter") props.store.selectEmitter(emitterNode.emitterId);
          }}
          onConnect={(connection) => {
            if (!connection.source || !connection.target) return;
            props.store.connectGraphNodes(connection.source, connection.target);
          }}
          onNodeDragStop={(nodeId, position) => props.store.moveGraphNodes({ [nodeId]: position })}
          onDeleteNodes={() => props.store.deleteSelectedGraphNodes()}
          onDeleteEdges={(edgeIds) => props.store.deleteGraphEdges(edgeIds)}
          onAddStageModule={handleAddStageModule}
          onRemoveStageModule={handleRemoveStageModuleFromNode}
          onSelectModule={handleSelectModule}
        />
      </div>

      {/* ── Left sidebar – Emitters ──────────────────────────────── */}
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
              <button type="button" className="text-emerald-400 transition hover:text-emerald-300" onClick={handleAddEmitter}>
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

      {/* ── Right sidebar – Inspector ────────────────────────────── */}
      <aside className="pointer-events-auto absolute right-4 top-12 z-20 flex w-md max-h-[calc(100%-44px-36px-8px)] flex-col overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/10 backdrop-blur-xl">
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

        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* Inspector tab */}
          {inspectorTab === "inspector" && (
            <InspectorPanel
              selectedGraphNode={selectedGraphNode}
              emitter={selectedEmitter ?? null}
              attributeOptions={attributeOptions}
              attributeTypeMap={attributeTypeMap}
              selectedModuleId={selectedModuleId}
              onUpdateStageModule={handleUpdateStageModule}
              onRemoveStageModule={handleRemoveStageModule}
              onApplyTemplate={handleApplyTemplate}
              onAddRenderer={handleAddRenderer}
              onCycleBlendMode={handleCycleBlendMode}
              onSetRendererTexture={handleSetRendererTexture}
              onUpdateRendererFlipbook={handleUpdateRendererFlipbook}
              onUpdateEvent={handleUpdateEvent}
              onUpdateParameter={handleUpdateParameter}
              onFireParameterInPreview={handleFireParameterInPreview}
              events={state.document.events}
              parameters={state.document.parameters}
            />
          )}

          {/* Graph tab */}
          {inspectorTab === "graph" && (
            <div className="space-y-3 p-3">
              <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Add graph nodes</div>
              <div className="space-y-1">
                {(
                  [
                    ["emitter", "Emitter node", "Represents an emitter asset"],
                    ["event", "Event node", "Triggers on particle events"],
                    ["parameter", "Parameter node", "Exposes a named parameter"],
                    ["dataInterface", "Data interface node", "Binds external data sources"],
                    ["scalability", "Scalability node", "LOD, budgets, fallbacks"],
                    ["output", "Output node", "Final compiled effect output"]
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
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Compile diagnostics</div>
                <div className="space-y-1.5">
                  {state.diagnostics.length === 0 ? (
                    <div className="rounded-xl border border-emerald-400/18 bg-emerald-400/6 px-3 py-2 text-[12px] text-emerald-300">
                      No diagnostics.
                    </div>
                  ) : (
                    state.diagnostics.map((d, i) => (
                      <div
                        key={`${d.message}-${i}`}
                        className={`rounded-xl border px-3 py-2 text-[12px] ${
                          d.severity === "error"
                            ? "border-rose-400/24 bg-rose-400/8 text-rose-200"
                            : d.severity === "warning"
                              ? "border-amber-400/24 bg-amber-400/8 text-amber-100"
                              : "border-sky-400/24 bg-sky-400/8 text-sky-100"
                        }`}
                      >
                        <div className="font-medium capitalize">{d.severity}</div>
                        <div className="mt-0.5">{d.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Pipeline cache</div>
                <div className="space-y-1 rounded-xl border border-white/8 px-3 py-2 text-[12px] text-zinc-400">
                  <div className="flex justify-between"><span>Prepared effects</span><span className="text-zinc-300">{cacheSnapshot.preparedEffects.length}</span></div>
                  <div className="flex justify-between"><span>Material signatures</span><span className="text-zinc-300">{cacheSnapshot.materialSignatures.length}</span></div>
                </div>
              </div>
              <div>
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Artifact payload</div>
                <pre className="max-h-50 overflow-auto rounded-xl border border-white/8 bg-[#09090d] p-3 text-[11px] leading-5 text-zinc-500">
                  {artifactPreview || "Compile to inspect."}
                </pre>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Floating preview panel ───────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-30">
        <div
          className="pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden rounded-3xl bg-[#0b0f0e]/88 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/8 backdrop-blur-2xl"
          style={{ left: `${previewRect.x}px`, top: `${previewRect.y}px`, width: `${previewRect.width}px`, height: `${previewRect.height}px` }}
        >
          <div
            className="flex h-9 shrink-0 cursor-move items-center justify-between px-4 pb-3 text-[11px] font-medium text-zinc-500"
            onPointerDown={(e: ReactPointerEvent) => beginPreviewInteraction("move", e)}
          >
            <span>Preview</span>
            <GripHorizontal className="size-3.5 text-zinc-600" />
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <ThreePreviewPanel
              document={state.document}
              compileResult={state.compileResult}
              selectedEmitterId={selectedEmitter?.id}
              onUpdatePreviewSettings={(preview) => props.store.updatePreviewSettings(preview)}
            />
          </div>
          <button
            type="button"
            className="absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-full text-zinc-600 transition hover:bg-white/8 hover:text-zinc-400"
            onPointerDown={(e: ReactPointerEvent) => beginPreviewInteraction("resize", e)}
            aria-label="Resize preview panel"
          >
            <ArrowDownRight className="size-3.5" />
          </button>
        </div>
      </div>

      {copilotOpen ? (
        <div
          ref={copilotPanelRef}
          className="pointer-events-auto absolute z-40 h-[min(74vh,760px)] w-[380px] max-w-[calc(100vw-2rem)]"
          style={
            copilotPosition
              ? { left: `${copilotPosition.x}px`, top: `${copilotPosition.y}px` }
              : { right: "1rem", top: "3.5rem" }
          }
        >
          <CopilotPanel
            onClose={() => setCopilotOpen(false)}
            onSendMessage={(prompt) => void copilot.sendMessage(prompt)}
            onAbort={copilot.abort}
            onClearHistory={copilot.clearHistory}
            onSettingsChanged={copilot.refreshConfigured}
            session={copilot.session}
            isConfigured={copilot.isConfigured}
            onHeaderPointerDown={beginCopilotDrag}
          />
        </div>
      ) : null}

      {/* ── Bottom status bar ───────────────────────────────────── */}
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
                  state.compileResult.budgets.pipelineRisk === "high" ? "text-rose-400"
                  : state.compileResult.budgets.pipelineRisk === "medium" ? "text-amber-400"
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
