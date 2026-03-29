import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent
} from "react";

type PackageManager = "bun" | "npm" | "pnpm" | "yarn";
type RuntimeStatus = "stopped" | "starting" | "running" | "error";
type ViewId = "trident" | "animation-studio" | "game";

type RuntimeSnapshot = {
  commandLabel: string;
  cwd: string;
  lastError: string | null;
  logLines: string[];
  port: number;
  startedAt: number | null;
  status: RuntimeStatus;
  url: string;
};

type EditorSnapshot = RuntimeSnapshot & {
  id: ViewId;
  label: string;
};

type ProjectSnapshot = {
  createdAt: number;
  hasGameDevSupport: boolean;
  id: string;
  isSelected: boolean;
  name: string;
  packageManager: PackageManager;
  preferredPort: number | null;
  projectRoot: string;
  runtime: RuntimeSnapshot;
  source: "created" | "existing";
  updatedAt: number;
};

type OrchestratorSnapshot = {
  activeProjectId: string | null;
  activeView: ViewId;
  editors: EditorSnapshot[];
  projects: ProjectSnapshot[];
  storagePath: string;
  viewport: {
    label: string;
    subtitle: string;
    url: string | null;
    view: ViewId;
  };
};

type Notice = {
  kind: "error" | "success";
  text: string;
};

const PACKAGE_MANAGER_OPTIONS: PackageManager[] = ["bun", "npm", "pnpm", "yarn"];

export function App() {
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [existingPath, setExistingPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [destinationRoot, setDestinationRoot] = useState("~/Games");
  const [packageManager, setPackageManager] = useState<PackageManager>("bun");
  const [installDependencies, setInstallDependencies] = useState(true);
  const [initializeGit, setInitializeGit] = useState(false);
  const [force, setForce] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);

  const refreshSnapshot = useEffectEvent(async () => {
    const nextSnapshot = await requestJson<OrchestratorSnapshot>("/api/orchestrator/state");
    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
  });

  useEffect(() => {
    void refreshSnapshot();
    const interval = window.setInterval(() => {
      void refreshSnapshot();
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [refreshSnapshot]);

  const selectedProject = useMemo(
    () => snapshot?.projects.find((project) => project.isSelected) ?? null,
    [snapshot]
  );

  const runAction = useEffectEvent(async <T,>(busyLabel: string, action: () => Promise<T>) => {
    setBusyKey(busyLabel);
    setNotice(null);

    try {
      const result = await action();
      await refreshSnapshot();
      return result;
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Unexpected orchestrator error."
      });
      throw error;
    } finally {
      setBusyKey(null);
    }
  });

  const handleAddExisting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await runAction("add-project", async () => {
        await requestJson("/api/orchestrator/projects/add", {
          method: "POST",
          body: JSON.stringify({ projectRoot: existingPath })
        });
      });
      setExistingPath("");
      setNotice({ kind: "success", text: "Project added to the engine deck." });
    } catch {
      return;
    }
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await runAction("create-project", async () => {
        await requestJson("/api/orchestrator/projects/create", {
          method: "POST",
          body: JSON.stringify({
            destinationRoot,
            force,
            initializeGit,
            installDependencies,
            packageManager,
            projectName
          })
        });
      });
      setProjectName("");
      setNotice({ kind: "success", text: "New game scaffolded and added." });
    } catch {
      return;
    }
  };

  const handleSelectProject = async (projectId: string) => {
    try {
      await runAction(`select:${projectId}`, async () => {
        await requestJson("/api/orchestrator/projects/select", {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
      });
    } catch {
      return;
    }
  };

  const handleStartProject = async (projectId: string) => {
    try {
      await runAction(`start:${projectId}`, async () => {
        await requestJson("/api/orchestrator/projects/start", {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
        await requestJson("/api/orchestrator/view", {
          method: "POST",
          body: JSON.stringify({ view: "game" })
        });
      });
      setNotice({ kind: "success", text: "Game dev server is running." });
    } catch {
      return;
    }
  };

  const handleStopProject = async (projectId: string) => {
    try {
      await runAction(`stop:${projectId}`, async () => {
        await requestJson("/api/orchestrator/projects/stop", {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
      });
    } catch {
      return;
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!window.confirm("Remove this project from the deck? The files on disk will stay untouched.")) {
      return;
    }

    try {
      await runAction(`remove:${projectId}`, async () => {
        await requestJson("/api/orchestrator/projects/remove", {
          method: "POST",
          body: JSON.stringify({ projectId })
        });
      });
    } catch {
      return;
    }
  };

  const handleRestartEditor = async (editorId: "trident" | "animation-studio") => {
    try {
      await runAction(`restart:${editorId}`, async () => {
        await requestJson("/api/orchestrator/editors/restart", {
          method: "POST",
          body: JSON.stringify({ editorId })
        });
      });
    } catch {
      return;
    }
  };

  const handleSetView = async (view: ViewId) => {
    try {
      await runAction(`view:${view}`, async () => {
        await requestJson("/api/orchestrator/view", {
          method: "POST",
          body: JSON.stringify({ view })
        });
      });
    } catch {
      return;
    }
  };

  return (
    <div className="engine-shell">
      <div className="engine-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="engine-eyebrow">Local Engine Deck</p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">Web Hammer Engine</h1>
                <p className="max-w-3xl text-sm text-white/65">
                  Trident and Animation Studio stay on fixed preview ports. Games live wherever you want on disk and
                  get launched into the same shell.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/65 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
              <div>State file</div>
              <div className="mt-1 font-mono text-[11px] text-white/85">{snapshot?.storagePath ?? "Loading..."}</div>
            </div>
          </div>
        </header>

        {notice ? (
          <div className="px-6 pt-4">
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                notice.kind === "error"
                  ? "border-rose-300/25 bg-rose-400/10 text-rose-50"
                  : "border-emerald-300/20 bg-emerald-400/10 text-emerald-50"
              }`}
            >
              {notice.text}
            </div>
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 gap-5 px-6 py-5">
          <aside className="deck-panel flex w-[390px] min-w-[340px] max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-white/10">
            <div className="border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-medium uppercase tracking-[0.22em] text-white/60">Runtime</h2>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Editors</h3>
                  <span className="text-xs text-white/45">Fixed ports</span>
                </div>

                {snapshot?.editors.map((editor) => (
                  <article key={editor.id} className="rounded-[22px] border border-white/10 bg-black/18 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-medium text-white">{editor.label}</h4>
                          <StatusPill status={editor.status} />
                        </div>
                        <p className="mt-1 text-xs text-white/55">{editor.url}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/30 hover:bg-white/10"
                        onClick={() =>
                          void handleRestartEditor(editor.id === "animation-studio" ? "animation-studio" : "trident")
                        }
                        disabled={busyKey === `restart:${editor.id}`}
                      >
                        Restart
                      </button>
                    </div>
                    {editor.lastError ? <p className="mt-3 text-xs text-rose-200/90">{editor.lastError}</p> : null}
                    <RuntimeFootnote runtime={editor} />
                  </article>
                ))}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Projects</h3>
                  <span className="text-xs text-white/45">{snapshot?.projects.length ?? 0} tracked</span>
                </div>

                <div className="space-y-3">
                  {snapshot?.projects.length ? (
                    snapshot.projects.map((project) => (
                      <article
                        key={project.id}
                        className={`rounded-[24px] border p-4 transition ${
                          project.isSelected
                            ? "border-cyan-300/40 bg-cyan-400/10 shadow-[0_18px_48px_rgba(29,78,216,0.16)]"
                            : "border-white/10 bg-black/18 hover:border-white/18"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => void handleSelectProject(project.id)}
                          >
                            <div className="flex items-center gap-2">
                              <h4 className="truncate text-base font-medium text-white">{project.name}</h4>
                              <StatusPill status={project.runtime.status} />
                            </div>
                            <p className="mt-1 truncate text-xs text-white/55">{project.projectRoot}</p>
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/30 hover:bg-white/10"
                            onClick={() => void handleRemoveProject(project.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                          <span>{project.packageManager}</span>
                          <span>{project.source === "created" ? "Scaffolded" : "Imported"}</span>
                          <span>{project.hasGameDevSupport ? "Editor Sync Ready" : "No @ggez/game-dev detected"}</span>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            className="rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-950 transition hover:bg-white/90"
                            onClick={() => void handleStartProject(project.id)}
                            disabled={busyKey === `start:${project.id}` || project.runtime.status === "starting"}
                          >
                            {project.runtime.status === "running" ? "Relaunch Game" : "Run Game"}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-white/12 px-4 py-2 text-xs text-white/82 transition hover:border-white/30 hover:bg-white/10"
                            onClick={() => void handleStopProject(project.id)}
                            disabled={project.runtime.status !== "running" && project.runtime.status !== "error"}
                          >
                            Stop
                          </button>
                        </div>

                        {project.runtime.lastError ? (
                          <p className="mt-3 text-xs text-rose-200/90">{project.runtime.lastError}</p>
                        ) : null}
                        <RuntimeFootnote runtime={project.runtime} />
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-white/12 bg-black/15 px-4 py-6 text-sm text-white/55">
                      No games tracked yet. Import one with an absolute path or scaffold a fresh game below.
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Add Existing Game</h3>
                  <p className="mt-1 text-xs text-white/50">Paste the project root. The files stay where they are.</p>
                </div>
                <form className="space-y-3" onSubmit={handleAddExisting}>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-white/42">Project Root</span>
                    <input
                      value={existingPath}
                      onChange={(event) => setExistingPath(event.target.value)}
                      placeholder="~/Projects/my-game"
                      className="engine-input"
                    />
                  </label>
                  <button type="submit" className="engine-button-secondary w-full" disabled={busyKey === "add-project"}>
                    Add To Deck
                  </button>
                </form>
              </section>

              <section className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Create New Game</h3>
                  <p className="mt-1 text-xs text-white/50">
                    Uses the existing `create-ggez` CLI and creates the project outside this repo.
                  </p>
                </div>
                <form className="space-y-3" onSubmit={handleCreateProject}>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-white/42">Project Name</span>
                    <input
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="Solar Drift"
                      className="engine-input"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-white/42">Destination Folder</span>
                    <input
                      value={destinationRoot}
                      onChange={(event) => setDestinationRoot(event.target.value)}
                      placeholder="~/Games"
                      className="engine-input"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-white/42">Package Manager</span>
                    <select
                      value={packageManager}
                      onChange={(event) => setPackageManager(event.target.value as PackageManager)}
                      className="engine-input"
                    >
                      {PACKAGE_MANAGER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="engine-check">
                    <input
                      type="checkbox"
                      checked={installDependencies}
                      onChange={(event) => setInstallDependencies(event.target.checked)}
                    />
                    <span>Install dependencies after scaffolding</span>
                  </label>
                  <label className="engine-check">
                    <input
                      type="checkbox"
                      checked={initializeGit}
                      onChange={(event) => setInitializeGit(event.target.checked)}
                    />
                    <span>Initialize a git repository</span>
                  </label>
                  <label className="engine-check">
                    <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
                    <span>Overwrite the target folder if it already exists</span>
                  </label>
                  <button type="submit" className="engine-button-primary w-full" disabled={busyKey === "create-project"}>
                    Scaffold Game
                  </button>
                </form>
              </section>
            </div>
          </aside>

          <section className="deck-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/55">Viewport</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">{snapshot?.viewport.label ?? "Loading..."}</h2>
                <p className="mt-1 text-sm text-white/55">{snapshot?.viewport.subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {selectedProject ? (
                  <button
                    type="button"
                    className="engine-button-secondary"
                    onClick={() => void handleStartProject(selectedProject.id)}
                    disabled={busyKey === `start:${selectedProject.id}`}
                  >
                    {selectedProject.runtime.status === "running" ? "Restart Game" : "Run Selected Game"}
                  </button>
                ) : null}
                {snapshot?.viewport.url ? (
                  <a
                    href={snapshot.viewport.url}
                    target="_blank"
                    rel="noreferrer"
                    className="engine-button-secondary"
                  >
                    Open In Tab
                  </a>
                ) : null}
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-[#050913]">
              {snapshot?.viewport.url ? (
                <iframe
                  key={`${snapshot.viewport.view}:${snapshot.viewport.url}`}
                  src={snapshot.viewport.url}
                  title={snapshot.viewport.label}
                  className="h-full w-full border-0 bg-black"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-10">
                  <div className="max-w-xl rounded-[30px] border border-white/10 bg-white/6 px-8 py-10 text-center shadow-[0_32px_90px_rgba(0,0,0,0.32)]">
                    <p className="engine-eyebrow mx-auto w-fit">Viewport Idle</p>
                    <h3 className="mt-4 text-3xl font-semibold text-white">
                      {snapshot?.viewport.view === "game" ? "Start a game server" : "Waiting for the editor preview"}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/60">
                      {snapshot?.viewport.view === "game"
                        ? "Select a project, run its dev server, and the shell will swap the viewport into game mode."
                        : "The orchestrator expects Trident and Animation Studio to be built already so it can run their preview servers on fixed ports."}
                    </p>
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute bottom-6 left-6 z-20 flex flex-col items-start gap-3">
                {dockOpen ? (
                  <div className="pointer-events-auto flex animate-[dock-rise_220ms_ease] flex-col gap-2 rounded-[26px] border border-white/12 bg-[#07111f]/92 p-3 shadow-[0_28px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                    <OrbButton
                      active={snapshot?.activeView === "trident"}
                      disabled={!snapshot}
                      label="Trident"
                      subtitle="World"
                      onClick={() => void handleSetView("trident")}
                    />
                    <OrbButton
                      active={snapshot?.activeView === "animation-studio"}
                      disabled={!snapshot}
                      label="Animation Studio"
                      subtitle="Motion"
                      onClick={() => void handleSetView("animation-studio")}
                    />
                    <OrbButton
                      active={snapshot?.activeView === "game"}
                      disabled={!snapshot || !selectedProject}
                      label={selectedProject?.name ?? "Game"}
                      subtitle="Play"
                      onClick={() => void handleSetView("game")}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-200/20 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.9),rgba(103,232,249,0.36)_32%,rgba(8,15,31,0.96)_70%)] text-[11px] font-semibold uppercase tracking-[0.26em] text-white shadow-[0_24px_54px_rgba(7,18,36,0.46)] transition hover:scale-[1.03]"
                  onClick={() => setDockOpen((current) => !current)}
                >
                  WH
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RuntimeStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${
        status === "running"
          ? "bg-emerald-300/14 text-emerald-100"
          : status === "starting"
            ? "bg-amber-300/14 text-amber-100"
            : status === "error"
              ? "bg-rose-300/14 text-rose-100"
              : "bg-white/8 text-white/55"
      }`}
    >
      {status}
    </span>
  );
}

function RuntimeFootnote({ runtime }: { runtime: RuntimeSnapshot }) {
  return (
    <div className="mt-3 space-y-2">
      <div className="text-[11px] text-white/45">
        <span className="font-medium text-white/65">Port</span> {runtime.port}
      </div>
      {runtime.commandLabel ? (
        <div className="rounded-2xl border border-white/8 bg-black/18 px-3 py-2 font-mono text-[10px] text-white/55">
          {runtime.commandLabel}
        </div>
      ) : null}
      {runtime.logLines.length ? (
        <pre className="max-h-24 overflow-auto rounded-2xl border border-white/8 bg-black/18 px-3 py-2 font-mono text-[10px] leading-5 text-white/52">
          {runtime.logLines.slice(-4).join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

function OrbButton(props: {
  active: boolean | undefined;
  disabled: boolean;
  label: string;
  onClick: () => void;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`flex min-w-[190px] items-center justify-between rounded-[18px] px-4 py-3 text-left transition ${
        props.active
          ? "bg-cyan-300/18 text-white shadow-[inset_0_0_0_1px_rgba(103,232,249,0.28)]"
          : "bg-white/5 text-white/72 hover:bg-white/9"
      } ${props.disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <div>
        <div className="text-sm font-medium">{props.label}</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">{props.subtitle}</div>
      </div>
      <span className="text-lg">{props.active ? "●" : "○"}</span>
    </button>
  );
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  const payload = (await response.json()) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}.`);
  }

  return payload as T;
}
