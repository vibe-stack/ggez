import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Film, GripHorizontal, Pause, Play, SlidersHorizontal, Workflow } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DragInput } from "@/components/ui/drag-input";
import type { ImportedPreviewClip } from "./preview-assets";
import { useEditorStoreValue } from "./use-editor-store-value";
import { PropertyField, editorSelectClassName } from "./workspace/shared";
import type { CharacterPlaybackState } from "./hooks/use-character-playback";

type CharacterPlaybackPanelProps = {
  store: AnimationEditorStore;
  importedClips: ImportedPreviewClip[];
  playback: CharacterPlaybackState;
  onHeaderPointerDown: (event: ReactPointerEvent) => void;
};

export function CharacterPlaybackPanel({
  store,
  importedClips,
  playback,
  onHeaderPointerDown,
}: CharacterPlaybackPanelProps) {
  const document = useEditorStoreValue(store, () => store.getState().document, ["document"]);
  const {
    mode,
    setMode,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    activeSelectedClipId,
    setSelectedClipId,
    resolvedParameterValues,
    setParameterValues,
    pendingTriggersRef,
  } = playback;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#091012]/84 shadow-[0_28px_96px_rgba(0,0,0,0.5)] ring-1 ring-white/8 backdrop-blur-2xl">
      {/* Drag header */}
      <div
        className="flex h-11 shrink-0 cursor-move items-center justify-between px-4 text-[12px] font-medium text-zinc-400"
        onPointerDown={onHeaderPointerDown}
      >
        <span>Playback</span>
        <GripHorizontal className="size-4 text-zinc-600" />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {/* Mode toggle */}
        <div className="rounded-2xl bg-white/4 p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setMode("graph")}
              className={
                mode === "graph"
                  ? "flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-[12px] font-medium text-zinc-50"
                  : "flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] text-zinc-300 transition hover:bg-white/6"
              }
            >
              <Workflow className="size-3.5" />
              Graph
            </button>
            <button
              type="button"
              onClick={() => setMode("clip")}
              className={
                mode === "clip"
                  ? "flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-[12px] font-medium text-zinc-50"
                  : "flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] text-zinc-300 transition hover:bg-white/6"
              }
            >
              <Film className="size-3.5" />
              Clip
            </button>
          </div>
        </div>

        {/* Play/pause + speed */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
          <Button
            variant="secondary"
            size="icon-sm"
            className="h-9 w-9 rounded-xl bg-white/7 text-zinc-200 hover:bg-white/12"
            onClick={() => setIsPlaying((v) => !v)}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <PropertyField label="Speed">
            <DragInput
              value={playbackSpeed}
              min={0.1}
              max={4}
              step={0.05}
              precision={2}
              onChange={setPlaybackSpeed}
              className="w-full"
            />
          </PropertyField>
        </div>

        {/* Clip selector or mode info */}
        {mode === "clip" ? (
          <PropertyField label="Clip">
            <select
              value={activeSelectedClipId}
              onChange={(event) => setSelectedClipId(event.target.value)}
              className={editorSelectClassName}
            >
              {importedClips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.name}
                </option>
              ))}
            </select>
          </PropertyField>
        ) : (
          <PropertyField label="Mode">
            <div className="flex h-9 items-center rounded-xl bg-white/7 px-3 text-[12px] text-zinc-400">
              Runtime graph playback
            </div>
          </PropertyField>
        )}

        {/* Parameters */}
        {mode === "graph" && document.parameters.length > 0 ? (
          <div className="space-y-2 rounded-[22px] bg-white/4 p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
              <SlidersHorizontal className="size-3.5" />
              Parameters
            </div>
            <div className="grid gap-2">
              {document.parameters.map((parameter) => (
                <PropertyField key={parameter.id} label={parameter.name}>
                  {parameter.type === "trigger" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 w-full justify-start rounded-xl bg-amber-400/10 px-3 text-[12px] text-amber-100 hover:bg-amber-400/16"
                      onClick={() => {
                        pendingTriggersRef.current.add(parameter.name);
                      }}
                    >
                      Fire Trigger
                    </Button>
                  ) : parameter.type === "bool" ? (
                    <label className="flex h-9 items-center gap-2 rounded-xl bg-white/7 px-3 text-[12px] text-zinc-200">
                      <Checkbox
                        checked={Boolean(resolvedParameterValues[parameter.name])}
                        onCheckedChange={(checked) =>
                          setParameterValues((current) => ({
                            ...current,
                            [parameter.name]: Boolean(checked),
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  ) : (
                    <DragInput
                      value={Number(resolvedParameterValues[parameter.name] ?? 0)}
                      step={parameter.type === "int" ? 1 : 0.05}
                      precision={parameter.type === "int" ? 0 : 2}
                      onChange={(value) =>
                        setParameterValues((current) => ({
                          ...current,
                          [parameter.name]: value,
                        }))
                      }
                      className="w-full"
                    />
                  )}
                </PropertyField>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
