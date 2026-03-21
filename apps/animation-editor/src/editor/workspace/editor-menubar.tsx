import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";

export function EditorMenubar(props: {
  store: AnimationEditorStore;
  graphName: string;
  diagnosticsCount: number;
  clipCount: number;
  onCompile: () => void;
  onImportCharacter: () => void;
  onImportAnimations: () => void;
  onAddNode: (kind: "clip" | "blend1d" | "blend2d" | "stateMachine" | "subgraph") => void;
}) {
  const { store } = props;

  return (
    <header className="flex h-9 items-center gap-2 border-b border-white/8 bg-black/60 px-2 backdrop-blur-md">
      <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Anim Graph</div>

      <Menubar className="h-7 border-transparent bg-transparent px-1 py-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="bg-transparent px-2 text-zinc-300 hover:bg-transparent hover:text-zinc-100 aria-expanded:bg-transparent aria-expanded:text-zinc-100">
            File
          </MenubarTrigger>
          <MenubarContent className="border border-white/10 bg-[#161a1f] shadow-2xl shadow-black/45">
            <MenubarItem onClick={props.onCompile}>
              Compile
              <MenubarShortcut>Cmd+B</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={props.onImportCharacter}>Import Character</MenubarItem>
            <MenubarItem onClick={props.onImportAnimations}>Import Animations</MenubarItem>
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

      <div className="ml-auto flex items-center gap-4 px-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        <span>{props.graphName}</span>
        <span>{props.clipCount} clips</span>
        <span>{props.diagnosticsCount} diagnostics</span>
      </div>
    </header>
  );
}