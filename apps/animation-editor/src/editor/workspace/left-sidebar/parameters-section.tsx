import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
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
          <div key={parameter.id} className="flex flex-row max-w-full gap-2 items-center">
            <Input value={parameter.name} onChange={(event) => props.store.updateParameter(parameter.id, { name: event.target.value })} className={`${editorInputClassName} `} />
            <ParameterTypeSelect value={parameter.type} onChange={(value) => props.store.updateParameter(parameter.id, { type: value })} />
            {/* {parameter.type === "float" ? (
              <DragInput
                value={parameter.smoothingDuration ?? 0}
                min={0}
                max={5}
                step={0.01}
                precision={2}
                onChange={(value) => props.store.updateParameter(parameter.id, { smoothingDuration: Math.max(0, value) })}
                className="w-full"
              />
            ) : (
              <div className="flex h-9 items-center rounded-xl bg-white/4 px-3 text-[11px] text-zinc-500">-</div>
            )} */}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => props.store.deleteParameter(parameter.id)}
              aria-label={`Delete parameter "${parameter.name}"`}
              className="text-zinc-500 hover:text-red-400"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </StudioSection>
  );
}
