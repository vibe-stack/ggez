import type { RefObject } from "react";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { AnimationPreviewPanel } from "../animation-preview-panel";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "../preview-assets";
import { NodeInspector } from "./node-inspector";
import { StudioSection, editorTextareaClassName, sectionHintClassName } from "./shared";

type EditorState = ReturnType<AnimationEditorStore["getState"]>;

export function RightSidebar(props: {
  store: AnimationEditorStore;
  state: EditorState;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  assetStatus: string;
  assetError: string | null;
  artifactJson: string;
  characterInputRef: RefObject<HTMLInputElement | null>;
  animationInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <aside className="h-full overflow-hidden border-l border-white/8 bg-black/30">
      <ScrollArea className="h-full">
        <div className="space-y-3 p-3">
          <AnimationPreviewPanel store={props.store} character={props.character} importedClips={props.importedClips} />

          <StudioSection title="Assets">
            <div className={sectionHintClassName}>Import the preview character first, then add optional external animation clips mapped onto that skeleton.</div>
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => props.characterInputRef.current?.click()}>
                Add Character File
              </Button>
              <Button variant="outline" onClick={() => props.animationInputRef.current?.click()}>
                Add Animation Files
              </Button>
            </div>
            <div className={props.assetError ? "text-[11px] leading-5 text-rose-300" : sectionHintClassName}>{props.assetError ?? props.assetStatus}</div>
            <div className="grid gap-1 border-t border-white/8 pt-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              <div>Character: <span className="text-zinc-300">{props.character ? props.character.fileName : "None"}</span></div>
              <div>Imported Clips: <span className="text-zinc-300">{props.importedClips.length}</span></div>
            </div>
          </StudioSection>

          <NodeInspector store={props.store} />

          <StudioSection title="Diagnostics">
            {props.state.diagnostics.length === 0 ? (
              <div className={sectionHintClassName}>No diagnostics yet. Compile to validate the document.</div>
            ) : (
              <div className="space-y-2">
                {props.state.diagnostics.map((diagnostic, index) => (
                  <div
                    key={`${diagnostic.message}-${index}`}
                    className={diagnostic.severity === "error" ? "border-l-2 border-rose-400/80 bg-rose-500/5 px-3 py-2 text-[12px] text-zinc-200" : "border-l-2 border-amber-300/80 bg-amber-400/5 px-3 py-2 text-[12px] text-zinc-200"}
                  >
                    <span className="mr-1 font-semibold uppercase tracking-[0.16em] text-zinc-400">{diagnostic.severity}</span>
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            )}
          </StudioSection>

          <StudioSection title="Artifact Preview">
            <Textarea value={props.artifactJson} readOnly className={`${editorTextareaClassName} min-h-60 font-mono text-[11px]`} />
          </StudioSection>
        </div>
      </ScrollArea>
    </aside>
  );
}