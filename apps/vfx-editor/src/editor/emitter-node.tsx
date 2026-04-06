import { useState } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Plus, Sparkles, X } from "lucide-react";
import type { ModuleInstance } from "@ggez/vfx-schema";

export type StageName = "spawn" | "initialize" | "update" | "death";

export type EmitterStageData = {
  name: StageName;
  label: string;
  accent: string;
  modules: Array<{
    id: string;
    label?: string;
    kind: ModuleInstance["kind"];
    enabled: boolean;
  }>;
  presets: ModuleInstance["kind"][];
};

export type EmitterNodeData = {
  kind: "emitter";
  name: string;
  subtitle: string;
  label: null;
  emitterName: string;
  emitterFingerprint: string;
  stages: EmitterStageData[];
  selectedModuleId: string | null;
  onAddModule(stage: StageName, kind: ModuleInstance["kind"]): void;
  onRemoveModule(stage: StageName, moduleId: string): void;
  onSelectModule(stage: StageName, moduleId: string): void;
};

export function formatModuleKind(kind: string): string {
  return kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function EmitterNode({ data, selected }: NodeProps) {
  const d = data as EmitterNodeData;
  const [openPicker, setOpenPicker] = useState<StageName | null>(null);

  return (
    <div
      className={`relative w-68 overflow-hidden rounded-2xl border bg-[#0d1110] shadow-2xl transition-colors ${
        selected ? "border-emerald-400/40 shadow-emerald-900/30" : "border-white/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-white/8 bg-emerald-950/60 px-3.5 py-2.5">
        <Sparkles className="size-3.5 shrink-0 text-emerald-300/60" />
        <span className="truncate text-[13px] font-semibold text-emerald-50 leading-tight">{d.emitterName}</span>
      </div>

      {/* Stages */}
      {d.stages.map((stage) => {
        const isPickerOpen = openPicker === stage.name;
        return (
          <div key={stage.name} className="border-b border-white/6 last:border-b-0">
            {/* Stage header */}
            <div className="flex items-center gap-2 px-3 py-1.5">
              <div className={`h-2.5 w-0.5 shrink-0 rounded-full ${stage.accent} opacity-55`} />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                {stage.label}
              </span>
              <div className="flex-1" />
              {isPickerOpen ? (
                <button
                  type="button"
                  className="flex size-5 items-center justify-center rounded text-zinc-500 transition-colors hover:text-zinc-200"
                  onClick={() => setOpenPicker(null)}
                >
                  <X className="size-3" />
                </button>
              ) : (
                <button
                  type="button"
                  className="flex size-5 items-center justify-center rounded text-zinc-700 transition-colors hover:text-emerald-400"
                  onClick={() => setOpenPicker(stage.name)}
                >
                  <Plus className="size-3" />
                </button>
              )}
            </div>

            {/* Module rows */}
            {stage.modules.map((module) => (
              <div
                key={module.id}
                role="button"
                tabIndex={0}
                className={`group flex cursor-pointer items-center gap-2 px-3.5 py-1 transition-colors hover:bg-white/4 ${
                  d.selectedModuleId === module.id ? "bg-emerald-400/8" : ""
                }`}
                onClick={() => d.onSelectModule(stage.name, module.id)}
                onKeyDown={(e) => e.key === "Enter" && d.onSelectModule(stage.name, module.id)}
              >
                <div className={`size-1.5 shrink-0 rounded-full ${stage.accent} opacity-45`} />
                <span
                  className={`min-w-0 flex-1 truncate text-[11.5px] leading-snug ${
                    module.enabled ? "text-zinc-300" : "text-zinc-600 line-through"
                  }`}
                >
                  {module.label ?? formatModuleKind(module.kind)}
                </span>
                <button
                  type="button"
                  aria-label="Remove module"
                  className="flex size-4 shrink-0 items-center justify-center rounded text-transparent transition-colors group-hover:text-zinc-700 hover:text-rose-400!"
                  onClick={(e) => {
                    e.stopPropagation();
                    d.onRemoveModule(stage.name, module.id);
                  }}
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}

            {stage.modules.length === 0 && !isPickerOpen && (
              <p className="px-3.5 pb-2 text-[10.5px] italic text-zinc-700">Empty stage</p>
            )}

            {/* Inline module picker */}
            {isPickerOpen && (
              <div className="mx-2 mb-2 overflow-hidden rounded-xl border border-emerald-500/18 bg-black/50">
                <div className="max-h-44 overflow-y-auto py-0.5">
                  {stage.presets.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-emerald-400/10"
                      onClick={() => {
                        d.onAddModule(stage.name, kind);
                        setOpenPicker(null);
                      }}
                    >
                      <Plus className="size-3 shrink-0 text-emerald-400/50" />
                      <span className="text-[11px] text-zinc-300">{formatModuleKind(kind)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="-left-2! size-3! rounded-full! border-2! border-zinc-700! bg-emerald-500/60!"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="-right-2! size-3! rounded-full! border-2! border-zinc-700! bg-emerald-500/60!"
      />
    </div>
  );
}
