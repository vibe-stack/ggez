import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ParameterTypeSelect } from "../inspector/parameter-type-select";
import { StudioSection, editorInputClassName } from "../shared";
import type { EditorState } from "./types";

export function ParametersSection(props: { store: AnimationEditorStore; state: EditorState }) {
  return (
    <StudioSection
      title="Parameters"
      variant="soft"
      action={
        <Button variant="ghost" size="icon-xs" onClick={() => props.store.addParameter()} aria-label="Add parameter">
          <Plus />
        </Button>
      }
    >
      <div className="space-y-2">
        {props.state.document.parameters.map((parameter) => (
          <div key={parameter.id} className="grid grid-cols-[minmax(0,1fr)_118px_28px] gap-2 items-center">
            <Input value={parameter.name} onChange={(event) => props.store.updateParameter(parameter.id, { name: event.target.value })} className={editorInputClassName} />
            <ParameterTypeSelect value={parameter.type} onChange={(value) => props.store.updateParameter(parameter.id, { type: value })} />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => props.store.deleteParameter(parameter.id)}
              aria-label={`Delete parameter "${parameter.name}"`}
              className="text-zinc-500 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </StudioSection>
  );
}
