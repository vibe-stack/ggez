import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { VfxEditorStore } from "@ggez/vfx-editor-core";
import { MODULE_DESCRIPTORS } from "@ggez/vfx-core";
import { createVfxArtifact, serializeVfxArtifact } from "@ggez/vfx-exporter";
import type { ModuleInstance, RendererSlot } from "@ggez/vfx-schema";
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
  const state = useEditorStoreValue(props.store, () => props.store.getState(), ["document", "selection", "compile", "emitters"]);
  const selectedEmitter = state.document.emitters.find((entry) => entry.id === state.selection.selectedEmitterId) ?? state.document.emitters[0];
  const { previewRect, beginPreviewInteraction, updatePreviewBounds } = usePreviewPanelDrag(workspaceRef);

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
        <div className="flex shrink-0 border-b border-white/8">
          {(["stages", "renderer", "graph", "diagnostics"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`flex-1 px-1 py-2.5 text-[10px] uppercase tracking-[0.16em] transition ${
                inspectorTab === tab
                  ? "text-emerald-300 shadow-[inset_0_-1px_0_0] shadow-emerald-400"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
              onClick={() => setInspectorTab(tab)}
            >
              {tab}
            </button>
          ))}
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
                        <div className="flex items-center gap-2.5 px-3 py-2">
                          <div className={`h-3.5 w-0.5 shrink-0 rounded-full ${accent} opacity-70`} />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</span>
                          <span className="ml-auto text-[10px] text-zinc-700">{modules.length} module{modules.length !== 1 ? "s" : ""}</span>
                        </div>

                        {/* Module rows */}
                        {modules.length === 0 ? (
                          <div className="px-4 pb-2 text-[11px] italic text-zinc-700">Empty — no modules yet.</div>
                        ) : (
                          <div className="px-3 pb-1">
                            {modules.map((module) => (
                              <div
                                key={module.id}
                                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
                              >
                                <div className={`size-1.5 shrink-0 rounded-full ${accent} opacity-55`} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12px] font-medium text-zinc-200">{formatModuleKind(module.kind)}</div>
                                  <div className="truncate text-[10px] text-zinc-600">{MODULE_DESCRIPTORS[module.kind].summary}</div>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Remove module"
                                  className="flex size-5 shrink-0 items-center justify-center rounded text-zinc-700 opacity-0 transition hover:bg-rose-400/12 hover:text-rose-400 group-hover:opacity-100"
                                  onClick={() =>
                                    props.store.updateEmitter(selectedEmitter.id, (emitter) => {
                                      const stageKey =
                                        stage === "spawn" ? "spawnStage"
                                        : stage === "initialize" ? "initializeStage"
                                        : stage === "update" ? "updateStage"
                                        : "deathStage";
                                      return {
                                        ...emitter,
                                        [stageKey]: { modules: emitter[stageKey].modules.filter((m) => m.id !== module.id) }
                                      };
                                    })
                                  }
                                >
                                  ×
                                </button>
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
                                    props.store.addStageModule(selectedEmitter.id, stage, kind);
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
