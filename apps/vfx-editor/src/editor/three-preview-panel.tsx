import type { CompiledVfxEffect, VfxEffectDocument } from "@ggez/vfx-schema";
import {
  createPreviewThreeScene,
  createThreeWebGpuPreviewController,
  summarizeThreeWebGpuPreview,
  type PreviewThreeScene,
  type ThreeWebGpuPreviewController,
  type ThreeWebGpuPreviewState
} from "@ggez/vfx-three";
import { Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { WebGPURenderer } from "three/webgpu";

export function ThreePreviewPanel(props: {
  document: VfxEffectDocument;
  compileResult?: CompiledVfxEffect;
  selectedEmitterId?: string;
  onUpdatePreviewSettings(preview: Partial<VfxEffectDocument["preview"]>): void;
}) {
  const { document, compileResult, selectedEmitterId, onUpdatePreviewSettings } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ThreeWebGpuPreviewController | null>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const previewSceneRef = useRef<PreviewThreeScene | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soloSelected, setSoloSelected] = useState(false);
  const [particleCount, setParticleCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [fireVersion, setFireVersion] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [payloadValues, setPayloadValues] = useState<Record<string, string>>({});
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const previewState = useMemo<ThreeWebGpuPreviewState>(
    () => ({
      document,
      compileResult,
      selectedEmitterId,
      soloSelected,
      isPlaying,
      selectedEventId,
      resetVersion,
      fireVersion
    }),
    [document, compileResult, selectedEmitterId, soloSelected, isPlaying, selectedEventId, resetVersion, fireVersion]
  );

  const summary = useMemo(() => summarizeThreeWebGpuPreview(previewState), [previewState]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let cancelled = false;
    const renderer = new WebGPURenderer({ antialias: true, alpha: false });
    rendererRef.current = renderer;

    renderer
      .init()
      .then(() => {
        if (cancelled) {
          renderer.dispose();
          return;
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(document.preview.backgroundColor, 1);
        renderer.domElement.style.backgroundColor = document.preview.backgroundColor;
        mount.appendChild(renderer.domElement);

        const previewScene = createPreviewThreeScene({ mount, renderer });
        previewSceneRef.current = previewScene;
        previewScene.resize();
        const resizeObserver = new ResizeObserver(() => previewScene.resize());
        resizeObserverRef.current = resizeObserver;
        resizeObserver.observe(mount);

        return createThreeWebGpuPreviewController({
          renderer,
          scene: previewScene.scene,
          camera: previewScene.camera,
          onParticleCountChange: (count: number) => setParticleCount(count),
          onBeforeRender: () => previewScene.controls.update()
        }).then((controller) => {
          if (cancelled) {
            resizeObserver.disconnect();
            return undefined;
          }
          return { controller, resizeObserver };
        });
      })
      .then((result) => {
        if (!result) {
          return;
        }
        const { controller, resizeObserver } = result;

        if (cancelled) {
          controller.dispose();
          resizeObserver.disconnect();
          previewSceneRef.current?.dispose();
          previewSceneRef.current = null;
          renderer.dispose();
          return;
        }

        controllerRef.current = controller;
        setRuntimeError(null);
        controller.update(previewState);
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeError(error instanceof Error ? error.message : "Failed to initialize the WebGPU preview runtime.");
        }
      });

    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      previewSceneRef.current?.dispose();
      previewSceneRef.current = null;
      rendererRef.current = null;
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
    // Mount once; subsequent sync happens via update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.update(previewState);
  }, [previewState]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    renderer.setClearColor(document.preview.backgroundColor, 1);
    renderer.domElement.style.backgroundColor = document.preview.backgroundColor;
  }, [document.preview.backgroundColor]);

  const events = document.events;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const payloadKeys = selectedEvent ? Object.keys(selectedEvent.payload) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/8 px-3 py-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-400/8 px-2.5 py-1 text-[11px] text-emerald-100 transition hover:border-emerald-300/35"
          onClick={() => setIsPlaying((current) => !current)}
        >
          {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>

        <div className="flex items-center gap-1">
          <select
            className="h-6.5 rounded-lg border border-white/10 bg-black/30 px-1.5 text-[11px] text-zinc-300 outline-none transition hover:border-white/20 focus:border-white/20"
            value={selectedEventId}
            onChange={(event) => {
              setSelectedEventId(event.target.value);
              setPayloadValues({});
            }}
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={selectedEventId ? `Fire "${selectedEvent?.name ?? selectedEventId}"` : "Fire all burst emitters"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-emerald-300/30 hover:text-emerald-200"
            onClick={() => setFireVersion((current) => current + 1)}
          >
            <Zap className="size-3" />
            <span>Fire</span>
          </button>
        </div>

        <button
          type="button"
          title="Reset simulation"
          className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2 py-1 text-[11px] text-zinc-600 transition hover:border-white/16 hover:text-zinc-400"
          onClick={() => setResetVersion((current) => current + 1)}
        >
          <RotateCcw className="size-3" />
        </button>

        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            className="accent-emerald-400"
            checked={soloSelected}
            onChange={(event) => setSoloSelected(event.target.checked)}
          />
          <span>Solo</span>
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            className="accent-emerald-400"
            checked={document.preview.loop}
            onChange={(event) => onUpdatePreviewSettings({ loop: event.target.checked })}
          />
          <span>Loop</span>
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <span>Dur</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="h-6.5 w-14 rounded-lg border border-white/10 bg-black/30 px-1.5 text-[11px] text-zinc-300 outline-none transition hover:border-white/20 focus:border-white/20"
            value={document.preview.durationSeconds}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) {
                onUpdatePreviewSettings({ durationSeconds: value });
              }
            }}
          />
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <span>Rate</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="h-6.5 w-14 rounded-lg border border-white/10 bg-black/30 px-1.5 text-[11px] text-zinc-300 outline-none transition hover:border-white/20 focus:border-white/20"
            value={document.preview.playbackRate}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) {
                onUpdatePreviewSettings({ playbackRate: value });
              }
            }}
          />
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <span>Bg</span>
          <input
            type="color"
            className="h-6.5 w-8 rounded border border-white/10 bg-black/30 p-0.5 outline-none transition hover:border-white/20 focus:border-white/20"
            value={document.preview.backgroundColor}
            onChange={(event) => onUpdatePreviewSettings({ backgroundColor: event.target.value })}
          />
        </label>

        <span className="ml-auto text-[11px] text-zinc-600">{particleCount}</span>
      </div>

      {payloadKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/6 bg-black/15 px-3 py-2">
          <span className="shrink-0 text-[10px] text-zinc-600">Payload</span>
          {payloadKeys.map((key) => (
            <label key={key} className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">{key}</span>
              <span className="text-[10px] text-zinc-700">{selectedEvent?.payload[key]}</span>
              <input
                type="text"
                className="h-6 w-20 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-zinc-200 outline-none focus:border-white/20"
                placeholder="0"
                value={payloadValues[key] ?? ""}
                onChange={(event) => setPayloadValues((previous) => ({ ...previous, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      <div
        className={`shrink-0 border-b px-3 py-1.5 text-[10px] leading-snug ${
          summary.hasOutput && !summary.allShown
            ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300/60"
            : summary.hasOutput
              ? "border-emerald-400/10 bg-emerald-400/4 text-emerald-300/45"
              : "border-amber-500/12 bg-amber-500/5 text-amber-300/55"
        }`}
      >
        {summary.hasOutput
          ? summary.allShown
            ? `Graph: all ${summary.totalCount} emitter${summary.totalCount === 1 ? "" : "s"} connected to output`
            : `Graph: ${summary.activeCount} of ${summary.totalCount} emitter${summary.totalCount === 1 ? "" : "s"} connected to output`
          : "Graph: no output node — showing all emitters. Connect emitters → output to filter."}
        {` · renderable in preview: ${summary.renderableCount}`}
      </div>

      <div
        ref={mountRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl"
        style={{ backgroundColor: document.preview.backgroundColor }}
      >
        {runtimeError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-rose-300/80">
            {runtimeError}
          </div>
        )}
        {!runtimeError && summary.renderableCount === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-600">
            {summary.hasOutput && summary.activeCount === 0
              ? "No emitters connected to the output node."
              : summary.activeCount > 0
                ? "Connected emitters need at least one enabled renderer to appear in preview."
                : "Add an emitter with a renderer to preview."}
          </div>
        )}
      </div>
    </div>
  );
}
