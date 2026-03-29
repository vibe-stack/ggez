import { Bot, Cable, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarShortcut,
  MenubarTrigger
} from "@/components/ui/menubar";
import { TridentIcon } from "@/components/editor-shell/icons";
import type { ViewportQuality } from "@/state/ui-store";

type EditorMenuBarProps = {
  canRedo: boolean;
  canUndo: boolean;
  copilotOpen: boolean;
  gameConnectionControl?: ReactNode;
  logicViewerOpen: boolean;
  onClearSelection: () => void;
  onCreateBrush: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onExportEngine: () => void;
  onExportGltf: () => void;
  onFocusSelection: () => void;
  onLoadWhmap: () => void;
  onNewFile: () => void;
  onRedo: () => void;
  onSaveWhmap: () => void;
  onToggleCopilot: () => void;
  onToggleLogicViewer: () => void;
  onToggleViewportQuality: () => void;
  onUndo: () => void;
  viewportQuality: ViewportQuality;
};

export function EditorMenuBar({
  canRedo,
  canUndo,
  copilotOpen,
  gameConnectionControl,
  logicViewerOpen,
  onClearSelection,
  onCreateBrush,
  onDeleteSelection,
  onDuplicateSelection,
  onGroupSelection,
  onExportEngine,
  onExportGltf,
  onFocusSelection,
  onLoadWhmap,
  onNewFile,
  onRedo,
  onSaveWhmap,
  onToggleCopilot,
  onToggleLogicViewer,
  onToggleViewportQuality,
  viewportQuality,
  onUndo
}: EditorMenuBarProps) {
  return (
    <div className="flex h-9 items-center justify-between gap-3 px-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex items-center gap-2 px-2 text-[11px] font-medium tracking-[0.22em] text-foreground/92 uppercase">
          <TridentIcon className="size-3.5 text-emerald-400" />
          <span>Trident</span>
        </div>

        <Menubar className="h-7 rounded-xl bg-transparent p-0 text-[11px] shadow-none">
          <MenubarMenu>
            <MenubarTrigger className="h-7 rounded-lg px-2.5 text-[11px] text-foreground/70 hover:bg-white/5 hover:text-foreground">
              File
            </MenubarTrigger>
            <MenubarContent className="min-w-44 rounded-xl bg-popover/96 p-1.5 shadow-[0_18px_48px_rgba(4,12,10,0.46)] backdrop-blur-xl">
              <MenubarItem className="rounded-lg text-xs" onClick={onNewFile}>
                New File
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onCreateBrush}>
                New Brush
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onSaveWhmap}>
                Save `.whmap`
                <MenubarShortcut>Cmd+S</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onLoadWhmap}>
                Load `.whmap`
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onExportGltf}>
                Export glTF
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onExportEngine}>
                Export Runtime Bundle
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="h-7 rounded-lg px-2.5 text-[11px] text-foreground/70 hover:bg-white/5 hover:text-foreground">
              Edit
            </MenubarTrigger>
            <MenubarContent className="min-w-44 rounded-xl bg-popover/96 p-1.5 shadow-[0_18px_48px_rgba(4,12,10,0.46)] backdrop-blur-xl">
              <MenubarItem className="rounded-lg text-xs" disabled={!canUndo} onClick={onUndo}>
                Undo
                <MenubarShortcut>Cmd+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" disabled={!canRedo} onClick={onRedo}>
                Redo
                <MenubarShortcut>Cmd+Shift+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onDuplicateSelection}>
                Duplicate
                <MenubarShortcut>Cmd+D</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onGroupSelection}>
                Group Selection
                <MenubarShortcut>Cmd+G</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onDeleteSelection}>
                Delete
                <MenubarShortcut>Del</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onClearSelection}>
                Clear Selection
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="h-7 rounded-lg px-2.5 text-[11px] text-foreground/70 hover:bg-white/5 hover:text-foreground">
              Render
            </MenubarTrigger>
            <MenubarContent className="min-w-44 rounded-xl bg-popover/96 p-1.5 shadow-[0_18px_48px_rgba(4,12,10,0.46)] backdrop-blur-xl">
              <MenubarItem className="rounded-lg text-xs" onClick={onFocusSelection}>
                Focus Selection
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="h-7 rounded-lg px-2.5 text-[11px] text-foreground/70 hover:bg-white/5 hover:text-foreground">
              View
            </MenubarTrigger>
            <MenubarContent className="min-w-48 rounded-xl bg-popover/96 p-1.5 shadow-[0_18px_48px_rgba(4,12,10,0.46)] backdrop-blur-xl">
              <MenubarItem className="rounded-lg text-xs" onClick={onToggleLogicViewer}>
                {logicViewerOpen ? "Hide" : "Show"} Logic Graph
                <MenubarShortcut>Cmd+Shift+L</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs" onClick={onToggleCopilot}>
                {copilotOpen ? "Hide" : "Show"} AI Vibe
                <MenubarShortcut>Cmd+L</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="h-7 rounded-lg px-2.5 text-[11px] text-foreground/70 hover:bg-white/5 hover:text-foreground">
              Help
            </MenubarTrigger>
            <MenubarContent className="min-w-52 rounded-xl bg-popover/96 p-1.5 shadow-[0_18px_48px_rgba(4,12,10,0.46)] backdrop-blur-xl">
              <MenubarItem className="rounded-lg text-xs">
                Click to select
                <MenubarShortcut>Mouse 1</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs">
                Focus object
                <MenubarShortcut>Double click</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="rounded-lg text-xs">
                Marquee select
                <MenubarShortcut>Shift drag</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-2">
        {gameConnectionControl}
        <Button
          aria-label={`Canvas DPR ${viewportQuality.toFixed(2)}x`}
          className="text-[11px] text-foreground/65 hover:text-foreground flex flex-row gap-1 px-2"
          onClick={onToggleViewportQuality}
          size="icon-xs"
          title={`Canvas DPR ${viewportQuality.toFixed(2)}x`}
          variant="ghost"
        >
          <Gauge className="size-3.5" />
          {viewportQuality.toFixed(2)}
        </Button>
        <Button
          aria-label="Logic Graph"
          className={`size-7 rounded-lg ${logicViewerOpen ? "text-emerald-400 hover:text-emerald-300" : "text-foreground/65 hover:text-foreground"}`}
          onClick={onToggleLogicViewer}
          title="Logic Graph (Cmd+Shift+L)"
          size="icon-sm"
          variant="ghost"
        >
          <Cable className="size-3.5" />
        </Button>
        <Button
          aria-label="AI Vibe"
          className={`size-7 rounded-lg ${copilotOpen ? "text-emerald-400 hover:text-emerald-300" : "text-foreground/65 hover:text-foreground"}`}
          onClick={onToggleCopilot}
          title="AI Vibe (Cmd+L)"
          size="icon-sm"
          variant="ghost"
        >
          <Bot className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
