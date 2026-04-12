import { memo } from "react";
import type { GridSnapValue } from "@ggez/render-pipeline";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { Grid3X3 } from "@/components/editor-shell/icons";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatSnapValue } from "@/viewport/utils/snap";

function SnapControlInner({
  currentSnapSize,
  gridSnapValues,
  onSetSnapEnabled,
  onSetSnapSize,
  snapEnabled
}: {
  currentSnapSize: GridSnapValue;
  gridSnapValues: readonly GridSnapValue[];
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  snapEnabled: boolean;
}) {
  return (
    <FloatingPanel className="flex h-11 items-center gap-2.5 px-3 text-[11px] text-foreground/72">
      <Grid3X3 className="size-3.5 text-emerald-300" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-pressed={snapEnabled}
              className={cn(
                "h-7 min-w-11 rounded-xl px-2 text-[10px] font-semibold tracking-[0.14em] uppercase",
                snapEnabled
                  ? "bg-emerald-500/18 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
                  : "text-foreground/48"
              )}
              onClick={() => onSetSnapEnabled(!snapEnabled)}
              size="sm"
              variant="ghost"
            >
              {snapEnabled ? "On" : "Off"}
            </Button>
          }
        />
        <TooltipContent>
          <TooltipLabel label="Toggle snapping" />
        </TooltipContent>
      </Tooltip>
      <div className="h-5 w-px bg-white/8" />
      <Popover>
        <PopoverTrigger
          render={
            <Button className="h-7 rounded-xl px-2.5 text-[11px] font-medium" size="sm" variant="ghost">
              {formatSnapValue(currentSnapSize)}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-56 rounded-2xl bg-popover/96 p-2 shadow-[0_18px_48px_rgba(4,12,10,0.46)] backdrop-blur-xl">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-medium tracking-[0.18em] text-foreground/45 uppercase">Grid Snap</span>
              <Button
                aria-pressed={snapEnabled}
                className={cn(
                  "h-6 min-w-10 rounded-lg px-2 text-[10px] font-semibold tracking-[0.14em] uppercase",
                  snapEnabled
                    ? "bg-emerald-500/18 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
                    : "text-foreground/48"
                )}
                onClick={() => onSetSnapEnabled(!snapEnabled)}
                size="xs"
                variant="ghost"
              >
                {snapEnabled ? "On" : "Off"}
              </Button>
            </div>
            <DragInput
              className="w-full"
              min={0.05}
              onChange={onSetSnapSize}
              onValueCommit={onSetSnapSize}
              precision={2}
              step={0.05}
              value={currentSnapSize}
            />
            <div className="grid grid-cols-4 gap-1">
              {gridSnapValues.map((snapValue) => (
                <Button
                  className={cn(
                    "h-6 rounded-lg px-0 text-[10px] font-medium",
                    snapValue === currentSnapSize && "bg-emerald-500/18 text-emerald-200"
                  )}
                  key={snapValue}
                  onClick={() => onSetSnapSize(snapValue)}
                  size="xs"
                  variant="ghost"
                >
                  {formatSnapValue(snapValue)}
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </FloatingPanel>
  );
}

export const SnapControl = memo(SnapControlInner, areSnapControlPropsEqual);

function areSnapControlPropsEqual(
  previous: {
    currentSnapSize: GridSnapValue;
    gridSnapValues: readonly GridSnapValue[];
    onSetSnapEnabled: (enabled: boolean) => void;
    onSetSnapSize: (snapSize: GridSnapValue) => void;
    snapEnabled: boolean;
  },
  next: {
    currentSnapSize: GridSnapValue;
    gridSnapValues: readonly GridSnapValue[];
    onSetSnapEnabled: (enabled: boolean) => void;
    onSetSnapSize: (snapSize: GridSnapValue) => void;
    snapEnabled: boolean;
  }
) {
  return (
    previous.currentSnapSize === next.currentSnapSize &&
    previous.gridSnapValues === next.gridSnapValues &&
    previous.snapEnabled === next.snapEnabled
  );
}

function TooltipLabel({ label }: { label: string }) {
  return <div className="text-[11px] font-medium text-foreground">{label}</div>;
}
