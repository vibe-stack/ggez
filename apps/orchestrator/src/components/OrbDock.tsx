import { useEffect, useRef } from "react";
import { Clapperboard, Gamepad2, Home, Monitor, Settings } from "lucide-react";
import type { DockMode, OrchestratorSnapshot, ViewId } from "../types";

interface OrbDockProps {
  visible: boolean;
  dockOpen: boolean;
  onToggleDock: () => void;
  onCloseDock: () => void;
  activeDockMode: DockMode;
  snapshot: OrchestratorSnapshot | null;
  selectedProjectName: string | null;
  onSetView: (view: ViewId) => void;
  onOpenSettings: () => void;
  onOpenGames: () => void;
  busyKey: string | null;
}

export function OrbDock({
  visible,
  dockOpen,
  onToggleDock,
  onCloseDock,
  activeDockMode,
  snapshot,
  selectedProjectName,
  onSetView,
  onOpenSettings,
  onOpenGames,
  busyKey
}: OrbDockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dock on outside click
  useEffect(() => {
    if (!dockOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCloseDock();
      }
    };
    window.addEventListener("mousedown", handler, { capture: true });
    return () => window.removeEventListener("mousedown", handler, { capture: true });
  }, [dockOpen, onCloseDock]);

  if (!visible) return null;

  const closeAndCall = (fn: () => void) => {
    onCloseDock();
    fn();
  };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute bottom-6 left-6 z-30 flex flex-col items-start gap-3"
    >
      {dockOpen ? (
        <nav
          className="pointer-events-auto flex animate-[dock-rise_200ms_cubic-bezier(0.34,1.56,0.64,1)] flex-col gap-1 rounded-[22px] bg-zinc-900/80 p-2.5 shadow-[0_24px_48px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
          aria-label="View switcher"
        >
          <DockButton
            active={activeDockMode === "welcome"}
            disabled={!snapshot}
            icon={<Home size={14} />}
            label="Games"
            subtitle="Launcher"
            onClick={() => closeAndCall(onOpenGames)}
          />
          <DockButton
            active={activeDockMode === "trident"}
            disabled={!snapshot}
            icon={<Monitor size={14} />}
            label="Trident"
            subtitle="World editor"
            onClick={() => closeAndCall(() => onSetView("trident"))}
            busy={busyKey === "view:trident"}
          />
          <DockButton
            active={activeDockMode === "animation-studio"}
            disabled={!snapshot}
            icon={<Clapperboard size={14} />}
            label="Animation Studio"
            subtitle="Motion editor"
            onClick={() => closeAndCall(() => onSetView("animation-studio"))}
            busy={busyKey === "view:animation-studio"}
          />
          <DockButton
            active={activeDockMode === "game"}
            disabled={!snapshot || !selectedProjectName}
            icon={<Gamepad2 size={14} />}
            label={selectedProjectName ?? "Game"}
            subtitle="Play mode"
            onClick={() => closeAndCall(() => onSetView("game"))}
            busy={busyKey === "view:game"}
          />
          <div className="mx-2.5 my-0.5 h-px bg-white/[0.05]" />
          <DockButton
            active={activeDockMode === "settings"}
            disabled={!snapshot}
            icon={<Settings size={14} />}
            label="Settings"
            subtitle="Projects & editors"
            onClick={() => closeAndCall(onOpenSettings)}
          />
        </nav>
      ) : null}

      <button
        type="button"
        className="gg-orb pointer-events-auto"
        onClick={onToggleDock}
        title="Toggle dock"
        aria-label="Toggle navigation dock"
      >
        <span className="gg-orb-text">GG</span>
      </button>
    </div>
  );
}

interface DockButtonProps {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
  busy?: boolean;
}

function DockButton({ active, disabled, icon, label, subtitle, onClick, busy }: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-w-[200px] items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-all duration-150 ${
        active
          ? "bg-white/8 text-white"
          : "text-white/52 hover:bg-white/[0.06] hover:text-white/80"
      } ${disabled ? "pointer-events-none opacity-30" : ""}`}
    >
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[10px] ${
          active ? "bg-white/10 text-white/90" : "bg-white/[0.06] text-white/42"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-none">{label}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-white/30">{subtitle}</span>
      </span>
    </button>
  );
}
