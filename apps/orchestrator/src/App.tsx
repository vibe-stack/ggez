import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent
} from "react";

import { requestJson } from "./api";
import type { DockMode, Notice, OrchestratorSnapshot, PackageManager, ViewId } from "./types";
import { GamesScreen } from "./components/GamesScreen";
import { OrbDock } from "./components/OrbDock";
import { SettingsSheet } from "./components/SettingsSheet";
import { ViewportFallback } from "./components/ViewportFallback";

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

  const [orbVisible, setOrbVisible] = useState(true);
  const [gamesOpen, setGamesOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshSnapshot = useEffectEvent(async () => {
    const next = await requestJson<OrchestratorSnapshot>("/api/orchestrator/state");
    startTransition(() => setSnapshot(next));
  });

  useEffect(() => {
    void refreshSnapshot();
    const interval = window.setInterval(() => void refreshSnapshot(), 2_000);
    return () => window.clearInterval(interval);
  }, [refreshSnapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "." && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOrbVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedProject = useMemo(
    () => snapshot?.projects.find((p) => p.isSelected) ?? null,
    [snapshot]
  );

  // Track the game iframe URL separately so the iframe stays mounted (and its
  // editor-sync polling client stays alive) even when the view switches to an editor.
  const [gameIframeUrl, setGameIframeUrl] = useState<string | null>(null);
  useEffect(() => {
    const running = snapshot?.projects.find(
      (p) => p.isSelected && p.runtime.status === "running"
    );
    if (running) {
      setGameIframeUrl(running.runtime.url);
    } else if (snapshot?.projects.every((p) => p.runtime.status === "stopped")) {
      setGameIframeUrl(null);
    }
  }, [snapshot]);

  const activeDockMode: DockMode = settingsOpen
    ? "settings"
    : gamesOpen
      ? "welcome"
      : (snapshot?.activeView ?? "welcome");

  const handleOpenSettings = () => {
    setGamesOpen(false);
    setSettingsOpen(true);
  };

  const handleOpenGames = () => {
    setSettingsOpen(false);
    setGamesOpen(true);
  };

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
        text: error instanceof Error ? error.message : "Unexpected error."
      });
      throw error;
    } finally {
      setBusyKey(null);
    }
  });

  const handleAddExisting = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await runAction("add-project", () =>
        requestJson("/api/orchestrator/projects/add", {
          method: "POST",
          body: JSON.stringify({ projectRoot: existingPath })
        })
      );
      setExistingPath("");
      setNotice({ kind: "success", text: "Project added to the deck." });
    } catch {
      /* handled in runAction */
    }
  };

  const handleCreateProject = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await runAction("create-project", () =>
        requestJson("/api/orchestrator/projects/create", {
          method: "POST",
          body: JSON.stringify({
            destinationRoot,
            force,
            initializeGit,
            installDependencies,
            packageManager,
            projectName
          })
        })
      );
      setProjectName("");
      setNotice({ kind: "success", text: "Game scaffolded and added." });
    } catch {
      /* handled */
    }
  };

  const handleSelectProject = async (projectId: string) => {
    try {
      await runAction(`select:${projectId}`, () =>
        requestJson("/api/orchestrator/projects/select", {
          method: "POST",
          body: JSON.stringify({ projectId })
        })
      );
    } catch {
      /* handled */
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
      setSettingsOpen(false);
      setGamesOpen(false);
    } catch {
      /* handled */
    }
  };

  const handleStopProject = async (projectId: string) => {
    try {
      await runAction(`stop:${projectId}`, () =>
        requestJson("/api/orchestrator/projects/stop", {
          method: "POST",
          body: JSON.stringify({ projectId })
        })
      );
    } catch {
      /* handled */
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!window.confirm("Remove this project from the deck? Files on disk are untouched.")) return;
    try {
      await runAction(`remove:${projectId}`, () =>
        requestJson("/api/orchestrator/projects/remove", {
          method: "POST",
          body: JSON.stringify({ projectId })
        })
      );
    } catch {
      /* handled */
    }
  };

  const handleRestartEditor = async (editorId: "trident" | "animation-studio") => {
    try {
      await runAction(`restart:${editorId}`, () =>
        requestJson("/api/orchestrator/editors/restart", {
          method: "POST",
          body: JSON.stringify({ editorId })
        })
      );
    } catch {
      /* handled */
    }
  };

  const handleSetView = async (view: ViewId) => {
    try {
      await runAction(`view:${view}`, () =>
        requestJson("/api/orchestrator/view", {
          method: "POST",
          body: JSON.stringify({ view })
        })
      );
      setSettingsOpen(false);
      setGamesOpen(false);
    } catch {
      /* handled */
    }
  };

  return (
    <div className="engine-shell">
      <div className="engine-grid absolute inset-0 opacity-50" aria-hidden="true" />

      {/* Game iframe — kept alive once running so the editor-sync polling client
          stays connected even when the view switches to an editor. Hidden via
          visibility:hidden (not display:none) so JS timers keep running. */}
      {gameIframeUrl ? (
        <iframe
          src={gameIframeUrl}
          title="Game"
          className="engine-viewport"
          style={{
            visibility: snapshot?.activeView === "game" ? "visible" : "hidden",
            zIndex: snapshot?.activeView === "game" ? 1 : 0
          }}
        />
      ) : null}

      {/* Editor iframe — only mounted when on a non-game view */}
      {snapshot?.activeView !== "game" ? (
        snapshot?.viewport.url ? (
          <iframe
            key={snapshot.viewport.url}
            src={snapshot.viewport.url}
            title={snapshot.viewport.label}
            className="engine-viewport"
            style={{ zIndex: 2 }}
          />
        ) : (
          <ViewportFallback snapshot={snapshot} />
        )
      ) : !gameIframeUrl ? (
        <ViewportFallback snapshot={snapshot} />
      ) : null}

      {notice ? (
        <div className="pointer-events-none absolute left-1/2 top-5 z-30 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 px-2">
          <div
            className={`pointer-events-auto rounded-2xl px-4 py-3 text-sm shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur-2xl ${
              notice.kind === "error"
                ? "bg-zinc-900/80 text-rose-300"
                : "bg-zinc-900/80 text-emerald-300"
            }`}
          >
            {notice.text}
          </div>
        </div>
      ) : null}

      {gamesOpen && !settingsOpen ? (
        <GamesScreen
          snapshot={snapshot}
          busyKey={busyKey}
          onStart={handleStartProject}
          onStop={handleStopProject}
          onSelect={handleSelectProject}
          onOpenSettings={handleOpenSettings}
          onClose={() => setGamesOpen(false)}
        />
      ) : null}

      {settingsOpen ? (
        <>
          <button
            type="button"
            aria-label="Close settings"
            className="absolute inset-0 z-20 bg-black/44 backdrop-blur-[2px]"
            onClick={() => setSettingsOpen(false)}
          />
          <SettingsSheet
            snapshot={snapshot}
            busyKey={busyKey}
            existingPath={existingPath}
            onExistingPathChange={setExistingPath}
            onAddExisting={handleAddExisting}
            projectName={projectName}
            onProjectNameChange={setProjectName}
            destinationRoot={destinationRoot}
            onDestinationRootChange={setDestinationRoot}
            packageManager={packageManager}
            onPackageManagerChange={setPackageManager}
            installDependencies={installDependencies}
            onInstallDependenciesChange={setInstallDependencies}
            initializeGit={initializeGit}
            onInitializeGitChange={setInitializeGit}
            force={force}
            onForceChange={setForce}
            onCreateProject={handleCreateProject}
            onSelectProject={handleSelectProject}
            onStartProject={handleStartProject}
            onStopProject={handleStopProject}
            onRemoveProject={handleRemoveProject}
            onRestartEditor={handleRestartEditor}
            onSetView={handleSetView}
            onClose={() => setSettingsOpen(false)}
          />
        </>
      ) : null}

      <OrbDock
        visible={orbVisible}
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen((prev) => !prev)}
        onCloseDock={() => setDockOpen(false)}
        activeDockMode={activeDockMode}
        snapshot={snapshot}
        selectedProjectName={selectedProject?.name ?? null}
        onSetView={handleSetView}
        onOpenSettings={handleOpenSettings}
        onOpenGames={handleOpenGames}
        busyKey={busyKey}
      />
    </div>
  );
}
