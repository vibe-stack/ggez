import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import {
  FullRenderIcon,
  PreviewRenderIcon,
  SolidRenderIcon,
  WireframeRenderIcon
} from "@/components/editor-shell/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ViewportRenderMode } from "@/viewport/viewports";

const renderModeOptions: Array<{
  icon: typeof WireframeRenderIcon;
  id: ViewportRenderMode;
  label: string;
}> = [
  { icon: WireframeRenderIcon, id: "wireframe", label: "All Wireframe" },
  { icon: SolidRenderIcon, id: "solid", label: "Solid" },
  { icon: PreviewRenderIcon, id: "preview", label: "Preview" },
  { icon: FullRenderIcon, id: "full", label: "Full" }
];

export function RenderModeControl({
  currentRenderMode,
  onSetRenderMode
}: {
  currentRenderMode: ViewportRenderMode;
  onSetRenderMode: (renderMode: ViewportRenderMode) => void;
}) {
  return (
    <FloatingPanel className="flex h-11 items-center gap-1.5 p-2">
      {renderModeOptions.map((option) => {
        const Icon = option.icon;
        const active = option.id === currentRenderMode;

        return (
          <Tooltip key={option.id}>
            <TooltipTrigger
              render={
                <Button
                  aria-label={option.label}
                  className={cn(
                    "size-7 rounded-xl text-foreground/58 transition-colors hover:text-foreground",
                    active &&
                      "bg-emerald-500/18 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
                  )}
                  onClick={() => onSetRenderMode(option.id)}
                  size="icon-sm"
                  title={option.label}
                  variant="ghost"
                />
              }
            >
              <Icon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{option.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </FloatingPanel>
  );
}
