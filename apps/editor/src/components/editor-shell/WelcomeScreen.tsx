import { FolderOpen, Plus, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { uiStore } from "@/state/ui-store";

type WelcomeScreenProps = {
  onCreateProject: () => Promise<void>;
  onOpenProject: () => Promise<void>;
};

export function WelcomeScreen({ onOpenProject, onCreateProject }: WelcomeScreenProps) {
  const [busy, setBusy] = useState<"open" | "create" | null>(null);

  const handleOpen = async () => {
    console.log("[WelcomeScreen] handleOpen triggered");
    setBusy("open");
    try {
      await onOpenProject();
      console.log("[WelcomeScreen] handleOpen success");
    } catch (err) {
      console.error("[WelcomeScreen] handleOpen error:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    console.log("[WelcomeScreen] handleCreate triggered");
    setBusy("create");
    try {
      await onCreateProject();
      console.log("[WelcomeScreen] handleCreate success");
    } catch (err) {
      console.error("[WelcomeScreen] handleCreate error:", err);
    } finally {
      setBusy(null);
    }
  };

  // Keyboard shortcuts for project management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          void handleOpen();
        } else if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void handleCreate();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenProject, onCreateProject]);

  return (
    <div className="flex h-screen flex-col bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_40%),linear-gradient(180deg,#08100d_0%,#050807_100%)] text-foreground">
      <header className="shrink-0 bg-black/18 backdrop-blur-xl relative z-20">
        <EditorMenuBar
          canRedo={false}
          canUndo={false}
          copilotOpen={false}
          isElectron={true}
          logicViewerOpen={false}
          onClearSelection={() => {}}
          onCreateBrush={() => {}}
          onCreateProject={handleCreate}
          onDeleteSelection={() => {}}
          onDuplicateSelection={() => {}}
          onGroupSelection={() => {}}
          onExportEngine={() => {}}
          onExportGltf={() => {}}
          onFocusSelection={() => {}}
          onLoadWhmap={() => {}}
          onOpenProject={handleOpen}
          onRedo={() => {}}
          onSaveWhmap={() => {}}
          onToggleCopilot={() => {}}
          onToggleLogicViewer={() => {}}
          onToggleViewportQuality={() => {}}
          onUndo={() => {}}
          viewportQuality={uiStore.viewportQuality}
        />
      </header>

      <div className="relative flex-1 flex flex-col items-center justify-center">
        {/* Glow orb */}
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 border border-emerald-400/20 shadow-[0_0_32px_rgba(16,185,129,0.15)]">
              <Sparkles className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white/90 to-white/60 bg-clip-text text-transparent">
              Trident Editor
            </h1>
          </div>
          <p className="text-sm text-foreground/40 tracking-wide">
            Level editor for GGEZ game engine
          </p>
        </div>

        {/* Action Cards */}
        <div className="flex gap-4">
          <button
            className="group relative flex w-64 flex-col items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-8 py-8 text-center transition-all duration-300 hover:border-emerald-400/25 hover:bg-white/[0.05] hover:shadow-[0_0_40px_rgba(16,185,129,0.08)] disabled:opacity-50 disabled:pointer-events-none"
            disabled={busy !== null}
            onClick={handleOpen}
            type="button"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/15 to-emerald-600/5 border border-emerald-400/15 transition-all duration-300 group-hover:from-emerald-400/25 group-hover:to-emerald-600/10 group-hover:border-emerald-400/25 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <FolderOpen className="h-6 w-6 text-emerald-400/80 transition-colors group-hover:text-emerald-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground/80 group-hover:text-foreground/95 transition-colors">
                {busy === "open" ? "Opening..." : "Open Project"}
              </div>
              <div className="mt-1 text-[11px] text-foreground/35 leading-relaxed">
                Select an existing GGEZ project folder
              </div>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-emerald-400/0 to-emerald-400/0 transition-all duration-300 group-hover:from-emerald-400/[0.02] group-hover:to-transparent" />
          </button>

          <button
            className="group relative flex w-64 flex-col items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-8 py-8 text-center transition-all duration-300 hover:border-cyan-400/25 hover:bg-white/[0.05] hover:shadow-[0_0_40px_rgba(34,211,238,0.08)] disabled:opacity-50 disabled:pointer-events-none"
            disabled={busy !== null}
            onClick={handleCreate}
            type="button"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/15 to-cyan-600/5 border border-cyan-400/15 transition-all duration-300 group-hover:from-cyan-400/25 group-hover:to-cyan-600/10 group-hover:border-cyan-400/25 group-hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <Plus className="h-6 w-6 text-cyan-400/80 transition-colors group-hover:text-cyan-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground/80 group-hover:text-foreground/95 transition-colors">
                {busy === "create" ? "Creating..." : "New Project"}
              </div>
              <div className="mt-1 text-[11px] text-foreground/35 leading-relaxed">
                Scaffold a new GGEZ game from template
              </div>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan-400/0 to-cyan-400/0 transition-all duration-300 group-hover:from-cyan-400/[0.02] group-hover:to-transparent" />
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="flex gap-6 text-[10px] tracking-[0.2em] uppercase text-foreground/20">
          <span>Ctrl+O to open</span>
          <span>Ctrl+N to create</span>
        </div>
      </div>
    </div>
  );
}
