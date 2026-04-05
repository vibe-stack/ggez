import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { ReactNode } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";

export type EditorView = "clip" | "graph" | "character";

export function EditorMenubar(props: {
  store: AnimationEditorStore;
  editorView: EditorView;
  gameConnectionControl?: ReactNode;
  onCompile: () => void;
  onChangeEditorView: (view: EditorView) => void;
  onExportRuntimeBundle: () => void;
  onNewFile: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onImportCharacter: () => void;
  onImportAnimations: () => void;
  onAddNode: (kind: "clip" | "blend1d" | "blend2d" | "selector" | "orientationWarp" | "strideWarp" | "secondaryDynamics" | "stateMachine" | "subgraph") => void;
  onToggleCopilot: () => void;
  copilotOpen: boolean;
}) {
  const { store } = props;

  return (
    <header className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/8 bg-black/55 px-3 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Anim Graph</div>

        <Menubar className="h-7 border-transparent bg-transparent px-1 py-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger className="bg-transparent px-2 text-zinc-300 hover:bg-transparent hover:text-zinc-100 aria-expanded:bg-transparent aria-expanded:text-zinc-100">
              File
            </MenubarTrigger>
            <MenubarContent className="border border-white/10 bg-[#161a1f] shadow-2xl shadow-black/45">
              <MenubarItem onClick={props.onNewFile}>New File</MenubarItem>
              <MenubarItem onClick={props.onSaveProject}>
                Save Project
                <MenubarShortcut>Cmd+S</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={props.onExportRuntimeBundle}>Export Runtime Bundle</MenubarItem>
              <MenubarItem onClick={props.onLoadProject}>
                Load Project
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={props.onCompile}>
                Compile
                <MenubarShortcut>Cmd+B</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="bg-transparent px-2 text-zinc-300 hover:bg-transparent hover:text-zinc-100 aria-expanded:bg-transparent aria-expanded:text-zinc-100">
              Edit
            </MenubarTrigger>
            <MenubarContent className="border border-white/10 bg-[#161a1f] shadow-2xl shadow-black/45">
              <MenubarItem onClick={() => store.undo()}>
                Undo
                <MenubarShortcut>Cmd+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => store.redo()}>
                Redo
                <MenubarShortcut>Shift+Cmd+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => store.copySelection()}>
                Copy
                <MenubarShortcut>Cmd+C</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => store.pasteSelection()}>
                Paste
                <MenubarShortcut>Cmd+V</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => store.duplicateSelection()}>
                Duplicate
                <MenubarShortcut>Cmd+D</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => store.deleteSelectedNodes()}>
                Delete
                <MenubarShortcut>Del</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="bg-transparent px-2 text-zinc-300 hover:bg-transparent hover:text-zinc-100 aria-expanded:bg-transparent aria-expanded:text-zinc-100">
              Add
            </MenubarTrigger>
            <MenubarContent className="border border-white/10 bg-[#161a1f] shadow-2xl shadow-black/45">
              <MenubarItem onClick={() => props.onAddNode("clip")}>Clip Node</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("blend1d")}>Blend 1D</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("blend2d")}>Blend 2D</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("selector")}>Selector</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("orientationWarp")}>Orientation Warp</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("strideWarp")}>Stride Warp</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("secondaryDynamics")}>Secondary Dynamics</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("stateMachine")}>State Machine</MenubarItem>
              <MenubarItem onClick={() => props.onAddNode("subgraph")}>Subgraph</MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => store.addGraph()}>Graph</MenubarItem>
              <MenubarItem onClick={() => store.addParameter()}>Parameter</MenubarItem>
              <MenubarItem onClick={() => store.addLayer()}>Layer</MenubarItem>
              <MenubarItem onClick={() => store.addMask()}>Mask</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      <ButtonGroup className="rounded-xl bg-white/4 p-1">
        <Button
          type="button"
          variant={props.editorView === "clip" ? "secondary" : "ghost"}
          size="sm"
          className={props.editorView === "clip" ? "h-8 bg-white/10 px-3 text-[12px] text-zinc-50 hover:bg-white/12" : "h-8 px-3 text-[12px] text-zinc-300"}
          onClick={() => props.onChangeEditorView("clip")}
        >
          Clip Editor
        </Button>
        <Button
          type="button"
          variant={props.editorView === "graph" ? "secondary" : "ghost"}
          size="sm"
          className={props.editorView === "graph" ? "h-8 bg-white/10 px-3 text-[12px] text-zinc-50 hover:bg-white/12" : "h-8 px-3 text-[12px] text-zinc-300"}
          onClick={() => props.onChangeEditorView("graph")}
        >
          Graph Editor
        </Button>
        <Button
          type="button"
          variant={props.editorView === "character" ? "secondary" : "ghost"}
          size="sm"
          className={props.editorView === "character" ? "h-8 bg-white/10 px-3 text-[12px] text-zinc-50 hover:bg-white/12" : "h-8 px-3 text-[12px] text-zinc-300"}
          onClick={() => props.onChangeEditorView("character")}
        >
          Character
        </Button>
      </ButtonGroup>

      <div className="flex items-center justify-end gap-1.5">
        {props.gameConnectionControl}
        <Button variant="ghost" size="xs" className={`h-7 gap-1.5 px-2 text-[11px] ${props.copilotOpen ? "text-emerald-300" : "text-zinc-300"}`} onClick={props.onToggleCopilot}>
          <Bot className="size-3.5" />
          Codex
        </Button>
        <Button variant="ghost" size="xs" className="h-7 px-2 text-[11px] text-zinc-300" onClick={props.onImportCharacter}>
          Character
        </Button>
        <Button variant="ghost" size="xs" className="h-7 px-2 text-[11px] text-zinc-300" onClick={props.onImportAnimations}>
          Animations
        </Button>
      </div>
    </header>
  );
}
