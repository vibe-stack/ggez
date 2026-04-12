import type { ComponentProps } from "react";
import { SceneEditor } from "@/components/SceneEditor";

type SceneEditorProps = ComponentProps<typeof SceneEditor>;

type WorldEditorShellProps = SceneEditorProps & {
  onCreateDocument: () => void;
  onLoadDocument: (documentId: string) => void;
  onPinDocument: (documentId: string) => void;
  onSetActiveDocument: (documentId: string) => void;
  onSetWorldMode: (mode: "scene" | "world") => void;
  onUnloadDocument: (documentId: string) => void;
  onUnpinDocument: (documentId: string) => void;
  partitions: Array<{
    documentIds: string[];
    id: string;
    name: string;
  }>;
  selectionHandles: string[];
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
  onSetWorldMode,
  onUnloadDocument,
  onUnpinDocument,
  partitions,
  selectionHandles,
  workingSet,
  worldDocuments,
  worldValidationIssues,
  ...sceneProps
}: WorldEditorShellProps) {
  return (
    <div className="relative h-full w-full">
      <SceneEditor {...sceneProps} />
      <div className="pointer-events-none absolute left-4 bottom-4 z-50 flex max-w-sm flex-col gap-3">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-semibold uppercase tracking-[0.2em] text-white/70">World Mode</span>
            <div className="flex gap-1">
              <button
                className={`rounded-md px-2 py-1 ${workingSet.mode === "world" ? "bg-white text-black" : "bg-white/10 text-white"}`}
                onClick={() => onSetWorldMode("world")}
                type="button"
              >
                World
              </button>
              <button
                className={`rounded-md px-2 py-1 ${workingSet.mode === "scene" ? "bg-white text-black" : "bg-white/10 text-white"}`}
                onClick={() => onSetWorldMode("scene")}
                type="button"
              >
                Scene
              </button>
            </div>
          </div>
          <div className="space-y-1 text-white/80">
            <div>Active: {workingSet.activeDocumentId ?? "None"}</div>
            <div>Loaded: {workingSet.loadedDocumentIds.length}</div>
            <div>Pinned: {workingSet.pinnedDocumentIds.length}</div>
            <div>Partitions: {partitions.length}</div>
            <div>Selection: {selectionHandles.length}</div>
          </div>
        </div>

        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-semibold uppercase tracking-[0.2em] text-white/70">Documents</div>
            <button className="rounded-md bg-white/10 px-2 py-1" onClick={onCreateDocument} type="button">
              New
            </button>
          </div>
          <div className="space-y-2">
            {worldDocuments.map((document) => (
              <div
                className={`rounded-lg border px-2 py-2 ${
                  document.id === workingSet.activeDocumentId
                    ? "border-white/50 bg-white/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
                key={document.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="text-left text-sm font-medium"
                    onClick={() => onSetActiveDocument(document.id)}
                    type="button"
                  >
                    {document.name}
                  </button>
                  <div className="flex gap-1">
                    {document.loaded ? (
                      <button
                        className="rounded-md bg-white/10 px-2 py-1"
                        onClick={() => onUnloadDocument(document.id)}
                        type="button"
                      >
                        Unload
                      </button>
                    ) : (
                      <button
                        className="rounded-md bg-white/10 px-2 py-1"
                        onClick={() => onLoadDocument(document.id)}
                        type="button"
                      >
                        Load
                      </button>
                    )}
                    <button
                      className="rounded-md bg-white/10 px-2 py-1"
                      onClick={() => (document.pinned ? onUnpinDocument(document.id) : onPinDocument(document.id))}
                      type="button"
                    >
                      {document.pinned ? "Unpin" : "Pin"}
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-white/60">
                  {document.id} · {document.loaded ? "loaded" : "unloaded"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur">
          <div className="mb-2 font-semibold uppercase tracking-[0.2em] text-white/70">Partitions</div>
          <div className="space-y-1 text-white/80">
            {partitions.map((partition) => (
              <div key={partition.id}>
                {partition.name} · {partition.documentIds.join(", ") || "no members"}
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur">
          <div className="mb-2 font-semibold uppercase tracking-[0.2em] text-white/70">Debug Overlay</div>
          <div className="space-y-1 text-white/80">
            <div>Ownership: document-scoped + shared resources</div>
            <div>Loaded set: {workingSet.loadedDocumentIds.join(", ") || "none"}</div>
            <div>Selection: {selectionHandles.join(", ") || "none"}</div>
          </div>
          {worldValidationIssues.length > 0 ? (
            <div className="mt-3 space-y-1 border-t border-white/10 pt-2 text-[11px] text-amber-200">
              {worldValidationIssues.map((issue, index) => (
                <div key={`${issue.code}:${index}`}>
                  {issue.severity}: {issue.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
