import { memo } from "react";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { cn } from "@/lib/utils";
import { PropertyField } from "./workspace/shared";

function ClipKeyframeInspectorInner(props: {
  selectedFrame: {
    boneName: string;
    label: string;
    chipClassName: string;
    componentLabel: string;
    channel: "translation" | "rotation" | "scale";
    time: number;
    value: number;
  } | null;
  maxTime: number;
  onDelete: () => void;
  onTimeChange: (value: number) => void;
  onValueChange: (value: number) => void;
}) {
  return (
    <div className="h-[112px] border-b border-white/8 px-3 py-3">
      {props.selectedFrame ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="rounded-full bg-white/6 px-2.5 py-1 text-zinc-200">{props.selectedFrame.boneName}</span>
            <span className={cn("rounded-full px-2.5 py-1 ring-1", props.selectedFrame.chipClassName)}>{props.selectedFrame.label}</span>
            <span className="rounded-full border border-white/8 px-2.5 py-1 text-zinc-300">{props.selectedFrame.componentLabel}</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-[140px_minmax(0,1fr)_auto]">
            <PropertyField label="Key Time">
              <DragInput
                value={props.selectedFrame.time}
                min={0}
                max={props.maxTime}
                step={0.01}
                precision={3}
                onChange={props.onTimeChange}
                className="w-full"
              />
            </PropertyField>
            <PropertyField label={props.selectedFrame.componentLabel}>
              <DragInput
                value={props.selectedFrame.value}
                step={props.selectedFrame.channel === "rotation" ? 0.01 : 0.05}
                precision={3}
                onChange={props.onValueChange}
                className="w-full"
              />
            </PropertyField>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-[12px] text-zinc-300" onClick={props.onDelete}>
                Delete Key
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center text-[12px] leading-6 text-zinc-500">
          Select a keyframe to edit its time and channel values.
        </div>
      )}
    </div>
  );
}

export const ClipKeyframeInspector = memo(ClipKeyframeInspectorInner);
