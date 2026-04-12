import { Download, LogOut, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { DragInput } from "@/components/ui/drag-input";

type WorldDocument = {
  id: string;
  loaded: boolean;
  name: string;
  pinned: boolean;
  position: { x: number; y: number; z: number };
};

type WorldDocumentCardProps = {
  document: WorldDocument;
  isActive: boolean;
  onLoadDocument: (documentId: string) => void;
  onPinDocument: (documentId: string) => void;
  onSetActiveDocument: (documentId: string) => void;
  onSetDocumentPosition: (documentId: string, position: { x: number; y: number; z: number }) => void;
  onUnloadDocument: (documentId: string) => void;
  onUnpinDocument: (documentId: string) => void;
};

export function WorldDocumentCard({
  document,
  isActive,
  onLoadDocument,
  onPinDocument,
  onSetActiveDocument,
  onSetDocumentPosition,
  onUnloadDocument,
  onUnpinDocument
}: WorldDocumentCardProps) {
  const setAxis = (axis: "x" | "y" | "z", value: number) => {
    onSetDocumentPosition(document.id, { ...document.position, [axis]: value });
  };

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-xl px-2.5 py-2 transition-colors",
        isActive
          ? "bg-emerald-500/10"
          : "bg-white/3 hover:bg-white/6"
      )}
      onClick={() => onSetActiveDocument(document.id)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[12px] font-medium leading-tight",
              isActive ? "text-emerald-300" : "text-foreground/82"
            )}
          >
            {document.name}
          </div>
          <div className="mt-0.5 text-[10px] text-foreground/36">
            {document.loaded ? (
              <span className="text-emerald-400/60">loaded</span>
            ) : (
              <span>unloaded</span>
            )}
            {document.pinned ? " · pinned" : ""}
          </div>
        </div>

        <div
          className="flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              document.pinned
                ? "text-emerald-400 hover:bg-emerald-500/10"
                : "text-foreground/38 hover:bg-white/6 hover:text-foreground/70"
            )}
            onClick={() => (document.pinned ? onUnpinDocument(document.id) : onPinDocument(document.id))}
            title={document.pinned ? "Unpin" : "Pin"}
            type="button"
          >
            {document.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>

          <button
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              document.loaded
                ? "text-foreground/38 hover:bg-white/6 hover:text-foreground/70"
                : "text-foreground/38 hover:bg-white/6 hover:text-foreground/70"
            )}
            onClick={() => (document.loaded ? onUnloadDocument(document.id) : onLoadDocument(document.id))}
            title={document.loaded ? "Unload" : "Load"}
            type="button"
          >
            {document.loaded ? <LogOut className="size-3.5" /> : <Download className="size-3.5" />}
          </button>
        </div>
      </div>

      <div
        className="mt-2.5 grid grid-cols-3 gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {(["x", "y", "z"] as const).map((axis) => (
          <DragInput
            compact
            key={axis}
            label={axis.toUpperCase()}
            onChange={(value) => setAxis(axis, value)}
            onValueCommit={(value) => setAxis(axis, value)}
            precision={2}
            step={0.1}
            value={document.position[axis]}
          />
        ))}
      </div>
    </div>
  );
}
