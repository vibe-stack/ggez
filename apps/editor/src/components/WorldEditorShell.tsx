import { AlertTriangle, CircleAlert, Globe, Plus, ScanEye } from "lucide-react";
import { type ComponentProps } from "react";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { WorldDocumentCard } from "@/components/editor-shell/WorldDocumentCard";
import { SceneEditor } from "@/components/SceneEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SceneEditorProps = ComponentProps<typeof SceneEditor>;

type WorldEditorShellProps = SceneEditorProps & {
  onCreateDocument: () => void;
  onLoadDocument: (documentId: string) => void;
  onPinDocument: (documentId: string) => void;
  onSetActiveDocument: (documentId: string) => void;
  onSetDocumentPosition: (documentId: string, position: { x: number; y: number; z: number }) => void;
  onSetWorldMode: (mode: "scene" | "world") => void;
  onUnloadDocument: (documentId: string) => void;
  onUnpinDocument: (documentId: string) => void;
  workingSet: {
    activeDocumentId?: string;
    loadedDocumentIds: string[];
    mode: "scene" | "world";
    pinnedDocumentIds: string[];
  };
  worldDocuments: Array<{
    id: string;
    loaded: boolean;
    name: string;
    pinned: boolean;
    position: {
      x: number;
      y: number;
      z: number;
    };
  }>;
  worldValidationIssues: Array<{
    code: string;
    message: string;
    severity: "error" | "warning";
  }>;
};

export function WorldEditorShell({
  onCreateDocument,
  onLoadDocument,
  onPinDocument,
  onSetActiveDocument,
  onSetDocumentPosition,
  onSetWorldMode,
  onUnloadDocument,
  onUnpinDocument,
  workingSet,
  worldDocuments,
  worldValidationIssues,
  ...sceneProps
}: WorldEditorShellProps) {
  return (
    <div className="relative h-full w-full">
      <SceneEditor {...sceneProps} workingSet={workingSet} />

      <div className="pointer-events-none absolute left-4 top-12 z-20 flex w-68 flex-col">
        <FloatingPanel className="flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
            <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
              World Documents
            </div>
            <div className="flex items-center gap-1">
              {/* Mode toggle */}
              <div className="mr-1 flex rounded-lg bg-white/5 p-0.5">
                <button
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    workingSet.mode === "world"
                      ? "bg-emerald-500/14 text-emerald-300"
                      : "text-foreground/38 hover:text-foreground/60"
                  )}
                  onClick={() => onSetWorldMode("world")}
                  title="World mode"
                  type="button"
                >
                  <Globe className="size-3.5" />
                </button>
                <button
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    workingSet.mode === "scene"
                      ? "bg-emerald-500/14 text-emerald-300"
                      : "text-foreground/38 hover:text-foreground/60"
                  )}
                  onClick={() => onSetWorldMode("scene")}
                  title="Scene mode"
                  type="button"
                >
                  <ScanEye className="size-3.5" />
                </button>
              </div>

              <button
                className="pointer-events-auto rounded-lg p-1.5 text-foreground/38 transition-colors hover:bg-white/6 hover:text-foreground/70"
                onClick={onCreateDocument}
                title="New document"
                type="button"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Document list */}
          <ScrollArea className="max-h-[clamp(12rem,40vh,28rem)]">
            <div className="space-y-0.5 px-2 pb-2">
              {worldDocuments.length === 0 ? (
                <div className="px-1.5 py-4 text-center text-[11px] text-foreground/30">
                  No documents yet
                </div>
              ) : (
                worldDocuments.map((document) => (
                  <WorldDocumentCard
                    document={document}
                    isActive={document.id === workingSet.activeDocumentId}
                    key={document.id}
                    onLoadDocument={onLoadDocument}
                    onPinDocument={onPinDocument}
                    onSetActiveDocument={onSetActiveDocument}
                    onSetDocumentPosition={onSetDocumentPosition}
                    onUnloadDocument={onUnloadDocument}
                    onUnpinDocument={onUnpinDocument}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Validation issues */}
          {worldValidationIssues.length > 0 && (
            <div className="border-t border-white/5 px-3.5 py-2.5">
              <div className="space-y-1.5">
                {worldValidationIssues.map((issue, index) => (
                  <div className="flex items-start gap-2 text-[11px]" key={`${issue.code}:${index}`}>
                    {issue.severity === "error" ? (
                      <CircleAlert className="mt-0.5 size-3 shrink-0 text-red-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                    )}
                    <span className={issue.severity === "error" ? "text-red-300/80" : "text-amber-300/80"}>
                      {issue.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </FloatingPanel>
      </div>
    </div>
  );
}
