import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";

import { requestJson } from "./api";
import type { DockMode, Notice, OrchestratorSnapshot, PackageManager, ViewId } from "./types";
import { GamesScreen } from "./components/GamesScreen";
import { GameCopilot } from "./components/GameCopilot";
import { GameSceneBar } from "./components/GameSceneBar";
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
  const gameIframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeEditor = snapshot?.activeView === "trident" || snapshot?.activeView === "animation-studio"
    ? snapshot.editors.find((editor) => editor.id === snapshot.activeView) ?? null
    : null;
  const activeEditorUrl = activeEditor?.status === "running" ? activeEditor.url : null;
  const activeGameRuntime = selectedProject?.runtime.status === "running" ? selectedProject.runtime : null;
  const activeGameUrl = snapshot?.activeView === "game" ? activeGameRuntime?.url ?? null : null;

  const activeDockMode: DockMode = settingsOpen
    ? "settings"
    : gamesOpen
      ? "welcome"
      : (snapshot?.activeView ?? "welcome");
  const gameCopilotVisible =
    orbVisible &&
    !gamesOpen &&
    !settingsOpen &&
    snapshot?.activeView === "game" &&
    Boolean(selectedProject) &&
    Boolean(activeGameUrl);

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

  const handleSwitchGameScene = async (sceneId: string) => {
    if (!selectedProject) {
      return;
    }

    try {
      await runAction(`scene:${sceneId}`, () =>
        requestJson("/api/orchestrator/projects/switch-scene", {
          method: "POST",
          body: JSON.stringify({
            projectId: selectedProject.id,
            sceneId
          })
        })
      );
    } catch {
      /* handled */
    }
  };

  // Listen for postMessage events from editor iframes (e.g. after a push-with-switch).
  // useEffectEvent captures the latest handleSetView without needing it in deps.
  const onIframeMessage = useEffectEvent((e: MessageEvent) => {
    if (
      e.data &&
      typeof e.data === "object" &&
      e.data.type === "wh-orchestrator:switch-view" &&
      typeof e.data.view === "string"
    ) {
      void handleSetView(e.data.view as ViewId);
    }
  });
  useEffect(() => {
    window.addEventListener("message", onIframeMessage);
    return () => window.removeEventListener("message", onIframeMessage);
  }, []);

  return (
    <div className="engine-shell">
      <div className="engine-grid absolute inset-0 opacity-50" aria-hidden="true" />

      {activeEditorUrl ? (
        <iframe
          src={activeEditorUrl}
          title={snapshot?.activeView ?? "editor"}
          className="engine-viewport"
        />
      ) : null}

      {activeGameUrl ? (
        <iframe
          ref={gameIframeRef}
          src={activeGameUrl}
          title="Game"
          className="engine-viewport"
        />
      ) : null}

      {snapshot?.activeView === "game" && activeGameRuntime ? (
        <GameSceneBar
          activeSceneId={activeGameRuntime.currentSceneId}
          busySceneId={busyKey?.startsWith("scene:") ? busyKey.slice("scene:".length) : null}
          onSwitchScene={handleSwitchGameScene}
          sceneIds={activeGameRuntime.sceneIds}
        />
      ) : null}

      <GameCopilot
        gameIframeRef={gameIframeRef}
        gameIframeUrl={activeGameUrl}
        project={selectedProject}
        visible={gameCopilotVisible}
      />

      {/* Fallback — shown only when no iframes are available for the current view */}
      {!activeGameUrl && !activeEditorUrl ? (
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
