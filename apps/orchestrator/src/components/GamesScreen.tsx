import { Play, Plus, Settings2, Square, X } from "lucide-react";
import type { OrchestratorSnapshot, ProjectSnapshot, RuntimeStatus } from "../types";

interface GamesScreenProps {
  snapshot: OrchestratorSnapshot | null;
  busyKey: string | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export function GamesScreen({
  snapshot,
  busyKey,
  onStart,
  onStop,
  onSelect,
  onOpenSettings,
  onClose
}: GamesScreenProps) {
  const projects = snapshot?.projects ?? [];

  return (
    <div className="games-screen-overlay">
      <div className="games-panel">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Games</h1>
            <p className="mt-1 text-xs text-white/38">
              {projects.length === 0
                ? "No games registered yet"
                : `${projects.length} game${projects.length !== 1 ? "s" : ""} registered`}
            </p>
          </div>
          <button type="button" className="icon-btn mt-0.5" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {projects.length > 0 ? (
          <div className="space-y-2">
            {projects.map((project) => (
              <GameRow
                key={project.id}
                project={project}
                busyKey={busyKey}
                onSelect={onSelect}
                onStart={onStart}
                onStop={onStop}
              />
            ))}
          </div>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm text-white/38">No games yet.</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-zinc-800/70 px-4 py-2 text-sm text-white/60 transition-colors hover:bg-zinc-700/80 hover:text-white/90"
              onClick={onOpenSettings}
            >
              <Plus size={13} />
              Add a game
            </button>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-white/32 transition-colors hover:text-white/56"
            onClick={onOpenSettings}
          >
            <Settings2 size={11} />
            Manage projects & editors
          </button>
        </div>
      </div>
    </div>
  );
}

function GameRow({
  project,
  busyKey,
  onSelect,
  onStart,
  onStop
}: {
  project: ProjectSnapshot;
  busyKey: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const { status } = project.runtime;
  const isRunning = status === "running";
  const isStarting = status === "starting";

  return (
    <div className={`games-row ${project.isSelected ? "games-row-selected" : ""}`}>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => onSelect(project.id)}
      >
        <div className="flex items-center gap-2.5">
          <StatusDot status={status} />
          <span className="text-[13px] font-medium text-white">{project.name}</span>
        </div>
      </button>

      <div className="flex flex-shrink-0 gap-1.5">
        {isRunning ? (
          <button
            type="button"
            className="icon-btn"
            title="Stop"
            onClick={() => onStop(project.id)}
            disabled={busyKey === `stop:${project.id}`}
          >
            <Square size={11} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn"
            title="Start"
            onClick={() => onStart(project.id)}
            disabled={busyKey === `start:${project.id}` || isStarting}
          >
            <Play size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: RuntimeStatus }) {
  const cls =
    status === "running"
      ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.55)]"
      : status === "starting"
        ? "bg-amber-400"
        : status === "error"
          ? "bg-rose-400"
          : "bg-zinc-600";

  return <span className={`block h-1.5 w-1.5 flex-shrink-0 rounded-full ${cls}`} />;
}
