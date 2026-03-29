import type { FormEvent } from "react";
import {
  ArrowUpRight,
  Clapperboard,
  FolderOpen,
  Gamepad2,
  Layers,
  Monitor,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Square,
  Trash2,
  Wand2,
  X
} from "lucide-react";
import { StatusPill } from "./StatusPill";
import type {
  OrchestratorSnapshot,
  PackageManager,
  ProjectSnapshot,
  ViewId
} from "../types";
import { PACKAGE_MANAGER_OPTIONS } from "../types";

interface SettingsSheetProps {
  snapshot: OrchestratorSnapshot | null;
  busyKey: string | null;

  existingPath: string;
  onExistingPathChange: (v: string) => void;
  onAddExisting: (e: FormEvent<HTMLFormElement>) => void;

  projectName: string;
  onProjectNameChange: (v: string) => void;
  destinationRoot: string;
  onDestinationRootChange: (v: string) => void;
  packageManager: PackageManager;
  onPackageManagerChange: (v: PackageManager) => void;
  installDependencies: boolean;
  onInstallDependenciesChange: (v: boolean) => void;
  initializeGit: boolean;
  onInitializeGitChange: (v: boolean) => void;
  force: boolean;
  onForceChange: (v: boolean) => void;
  onCreateProject: (e: FormEvent<HTMLFormElement>) => void;

  onSelectProject: (id: string) => void;
  onStartProject: (id: string) => void;
  onStopProject: (id: string) => void;
  onRemoveProject: (id: string) => void;
  onRestartEditor: (id: "trident" | "animation-studio") => void;
  onSetView: (view: ViewId) => void;
  onClose: () => void;
}

export function SettingsSheet({
  snapshot,
  busyKey,
  existingPath,
  onExistingPathChange,
  onAddExisting,
  projectName,
  onProjectNameChange,
  destinationRoot,
  onDestinationRootChange,
  packageManager,
  onPackageManagerChange,
  installDependencies,
  onInstallDependenciesChange,
  initializeGit,
  onInitializeGitChange,
  force,
  onForceChange,
  onCreateProject,
  onSelectProject,
  onStartProject,
  onStopProject,
  onRemoveProject,
  onRestartEditor,
  onSetView,
  onClose
}: SettingsSheetProps) {
  return (
    <aside className="settings-sheet">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div>
          <p className="engine-eyebrow">
            <Settings size={10} className="inline-block" />
            Settings
          </p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">GGEZ</h1>
          <p className="mt-1.5 text-xs leading-5 text-white/46">
            Manage editors, projects, and the live viewport.
          </p>
        </div>
        <button
          type="button"
          className="icon-btn mt-0.5"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X size={14} />
        </button>
      </div>

      <div className="settings-scroll">
        {/* Viewport */}
        <section className="settings-block">
          <SectionHeader icon={<Monitor size={13} />} title="Viewport">
            <span className="ml-auto text-xs text-white/40">{snapshot?.viewport.label ?? "—"}</span>
          </SectionHeader>
          <p className="mb-4 mt-1 text-xs text-white/42">{snapshot?.viewport.subtitle}</p>
          <div className="flex flex-wrap gap-2">
            <SheetButton icon={<Monitor size={12} />} onClick={() => onSetView("trident")}>
              Trident
            </SheetButton>
            <SheetButton
              icon={<Clapperboard size={12} />}
              onClick={() => onSetView("animation-studio")}
            >
              Animation Studio
            </SheetButton>
            {snapshot?.projects.some((p) => p.isSelected) ? (
              <SheetButton icon={<Gamepad2 size={12} />} onClick={() => onSetView("game")}>
                Focus Game
              </SheetButton>
            ) : null}
            {snapshot?.viewport.url ? (
              <a
                href={snapshot.viewport.url}
                target="_blank"
                rel="noreferrer"
                className="sheet-btn-secondary inline-flex items-center gap-1.5"
              >
                <ArrowUpRight size={12} />
                Open in tab
              </a>
            ) : null}
          </div>
        </section>

        {/* Editors */}
        <section className="space-y-2.5">
          <SectionHeader icon={<Layers size={13} />} title="Editors" />

          {snapshot?.editors.map((editor) => (
            <article key={editor.id} className="settings-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-white">{editor.label}</h3>
                    <StatusPill status={editor.status} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-white/42">{editor.url}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Restart"
                    onClick={() =>
                      onRestartEditor(editor.id === "animation-studio" ? "animation-studio" : "trident")
                    }
                    disabled={busyKey === `restart:${editor.id}`}
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Open"
                    onClick={() =>
                      onSetView(editor.id === "animation-studio" ? "animation-studio" : "trident")
                    }
                  >
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
              {editor.lastError ? (
                <p className="mt-2.5 text-[11px] text-rose-300/80">{editor.lastError}</p>
              ) : null}
            </article>
          ))}
        </section>

        {/* Projects */}
        <section className="space-y-2.5">
          <SectionHeader icon={<Gamepad2 size={13} />} title="Projects">
            <span className="ml-auto text-xs text-white/36">
              {snapshot?.projects.length ?? 0} tracked
            </span>
          </SectionHeader>

          {snapshot?.projects.length ? (
            snapshot.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                busyKey={busyKey}
                onSelect={onSelectProject}
                onStart={onStartProject}
                onStop={onStopProject}
                onRemove={onRemoveProject}
                onOpenGame={() => onSetView("game")}
              />
            ))
          ) : (
            <div className="settings-card opacity-60 text-sm text-white/50">
              No games tracked yet. Import an existing one or scaffold a new one below.
            </div>
          )}
        </section>

        {/* Add Existing */}
        <section className="settings-block">
          <SectionHeader icon={<FolderOpen size={13} />} title="Add Existing Game" />
          <p className="mb-4 mt-1 text-xs text-white/42">
            Paste the absolute path. Files stay where they are.
          </p>
          <form className="space-y-3" onSubmit={onAddExisting}>
            <label className="space-y-1.5">
              <span className="form-label">Project root</span>
              <input
                value={existingPath}
                onChange={(e) => onExistingPathChange(e.target.value)}
                placeholder="~/Projects/my-game"
                className="engine-input"
              />
            </label>
            <SheetButton
              type="submit"
              className="w-full justify-center"
              icon={<Plus size={12} />}
              disabled={busyKey === "add-project"}
            >
              Add to deck
            </SheetButton>
          </form>
        </section>

        {/* Create New */}
        <section className="settings-block">
          <SectionHeader icon={<Wand2 size={13} />} title="Create New Game" />
          <p className="mb-4 mt-1 text-xs text-white/42">
            Scaffolds a fresh game outside this repo using create-ggez.
          </p>
          <form className="space-y-3" onSubmit={onCreateProject}>
            <label className="space-y-1.5">
              <span className="form-label">Project name</span>
              <input
                value={projectName}
                onChange={(e) => onProjectNameChange(e.target.value)}
                placeholder="Solar Drift"
                className="engine-input"
              />
            </label>
            <label className="space-y-1.5">
              <span className="form-label">Destination folder</span>
              <input
                value={destinationRoot}
                onChange={(e) => onDestinationRootChange(e.target.value)}
                placeholder="~/Games"
                className="engine-input"
              />
            </label>
            <label className="space-y-1.5">
              <span className="form-label">Package manager</span>
              <select
                value={packageManager}
                onChange={(e) => onPackageManagerChange(e.target.value as PackageManager)}
                className="engine-input"
              >
                {PACKAGE_MANAGER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="engine-check">
              <input
                type="checkbox"
                checked={installDependencies}
                onChange={(e) => onInstallDependenciesChange(e.target.checked)}
              />
              <span>Install dependencies after scaffolding</span>
            </label>
            <label className="engine-check">
              <input
                type="checkbox"
                checked={initializeGit}
                onChange={(e) => onInitializeGitChange(e.target.checked)}
              />
              <span>Initialize a git repository</span>
            </label>
            <label className="engine-check">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => onForceChange(e.target.checked)}
              />
              <span>Overwrite target folder if it exists</span>
            </label>
            <SheetButton
              type="submit"
              variant="primary"
              className="w-full justify-center"
              icon={<Wand2 size={12} />}
              disabled={busyKey === "create-project"}
            >
              Scaffold game
            </SheetButton>
          </form>
        </section>
      </div>
    </aside>
  );
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  children
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-white/40">{icon}</span>
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">{title}</h2>
      {children}
    </div>
  );
}

function SheetButton({
  children,
  icon,
  onClick,
  disabled,
  type = "button",
  variant = "secondary",
  className = ""
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150";
  const variants = {
    primary: "bg-white text-[#060c18] hover:bg-white/90",
    secondary: "sheet-btn-secondary"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variant === "primary" ? variants.primary : variants.secondary} ${disabled ? "cursor-not-allowed opacity-40" : ""} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ProjectCard({
  project,
  busyKey,
  onSelect,
  onStart,
  onStop,
  onRemove,
  onOpenGame
}: {
  project: ProjectSnapshot;
  busyKey: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenGame: () => void;
}) {
  return (
    <article
      className={`settings-card ${
        project.isSelected ? "bg-emerald-400/[0.06]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelect(project.id)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-white">{project.name}</h3>
            <StatusPill status={project.runtime.status} />
          </div>
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Remove project"
          onClick={() => onRemove(project.id)}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <SheetButton
          variant="primary"
          icon={<Play size={11} />}
          onClick={() => onStart(project.id)}
          disabled={
            busyKey === `start:${project.id}` || project.runtime.status === "starting"
          }
        >
          {project.runtime.status === "running" ? "Relaunch" : "Run game"}
        </SheetButton>
        <SheetButton
          icon={<Square size={11} />}
          onClick={() => onStop(project.id)}
          disabled={project.runtime.status !== "running" && project.runtime.status !== "error"}
        >
          Stop
        </SheetButton>
        <SheetButton
          icon={<ArrowUpRight size={11} />}
          onClick={onOpenGame}
          disabled={!project.isSelected}
        >
          Open
        </SheetButton>
      </div>

      {project.runtime.lastError ? (
        <p className="mt-2.5 text-[11px] text-rose-300/80">{project.runtime.lastError}</p>
      ) : null}
    </article>
  );
}
