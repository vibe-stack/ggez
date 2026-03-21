import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ParameterTypeSelect } from "./node-inspector";
import { StudioSection, editorInputClassName, editorSelectClassName } from "./shared";

type EditorState = ReturnType<AnimationEditorStore["getState"]>;

export function LeftSidebar(props: { store: AnimationEditorStore; state: EditorState }) {
  const { state, store } = props;

  return (
    <aside className="h-full overflow-hidden border-r border-white/8 bg-black/30">
      <ScrollArea className="h-full">
        <div className="space-y-3 p-3">
          <StudioSection
            title="Graphs"
            action={
              <Button variant="ghost" size="xs" onClick={() => store.addGraph()}>
                Add
              </Button>
            }
          >
            <div className="space-y-1.5">
              {state.document.graphs.map((entry) => {
                const selected = entry.id === state.selection.graphId;

                return (
                  <button
                    key={entry.id}
                    onClick={() => store.selectGraph(entry.id)}
                    className={selected ? "w-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-[12px] font-medium text-zinc-100" : "w-full border border-white/8 bg-white/[0.02] px-3 py-2 text-left text-[12px] text-zinc-300 transition hover:border-white/15 hover:bg-white/[0.04]"}
                  >
                    {entry.name}
                  </button>
                );
              })}
            </div>
          </StudioSection>

          <StudioSection
            title="Parameters"
            action={
              <Button variant="ghost" size="xs" onClick={() => store.addParameter()}>
                Add
              </Button>
            }
          >
            <div className="space-y-2">
              {state.document.parameters.map((parameter) => (
                <div key={parameter.id} className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                  <Input value={parameter.name} onChange={(event) => store.updateParameter(parameter.id, { name: event.target.value })} className={editorInputClassName} />
                  <ParameterTypeSelect value={parameter.type} onChange={(value) => store.updateParameter(parameter.id, { type: value })} />
                </div>
              ))}
            </div>
          </StudioSection>

          <StudioSection
            title="Layers"
            action={
              <Button variant="ghost" size="xs" onClick={() => store.addLayer()}>
                Add
              </Button>
            }
          >
            <div className="space-y-2.5">
              {state.document.layers.map((layer) => (
                <div key={layer.id} className="space-y-2">
                  <Input value={layer.name} onChange={(event) => store.updateLayer(layer.id, { name: event.target.value })} className={editorInputClassName} />
                  <select value={layer.graphId} onChange={(event) => store.updateLayer(layer.id, { graphId: event.target.value })} className={editorSelectClassName}>
                    {state.document.graphs.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </StudioSection>

          <StudioSection
            title="Masks"
            action={
              <Button variant="ghost" size="xs" onClick={() => store.addMask()}>
                Add
              </Button>
            }
          >
            <div className="space-y-2.5">
              {state.document.masks.map((mask) => (
                <div key={mask.id} className="space-y-2">
                  <Input value={mask.name} onChange={(event) => store.updateMask(mask.id, { name: event.target.value })} className={editorInputClassName} />
                  <Input
                    value={mask.rootBoneName ?? ""}
                    onChange={(event) => store.updateMask(mask.id, { rootBoneName: event.target.value || undefined })}
                    placeholder="Root bone"
                    className={editorInputClassName}
                  />
                </div>
              ))}
            </div>
          </StudioSection>
        </div>
      </ScrollArea>
    </aside>
  );
}