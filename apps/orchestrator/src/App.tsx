import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent
} from "react";

import { requestJson } from "./api";
import type { Notice, OrchestratorSnapshot, PackageManager, ViewId } from "./types";
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

  const selectedProject = useMemo(
    () => snapshot?.projects.find((p) => p.isSelected) ?? null,
    [snapshot]
  );

  const activeDockMode = settingsOpen ? "settings" : (snapshot?.activeView ?? "settings");

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
      setNotice({ kind: "success", text: "Game dev server is running." });
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
    } catch {
      /* handled */
    }
  };

  return (
    <div className="engine-shell">
      <div className="engine-grid absolute inset-0 opacity-50" aria-hidden="true" />

      {snapshot?.viewport.url ? (
        <iframe
          key={`${snapshot.viewport.view}:${snapshot.viewport.url}`}
          src={snapshot.viewport.url}
          title={snapshot.viewport.label}
          className="engine-viewport"
        />
      ) : (
        <ViewportFallback snapshot={snapshot} />
      )}

      {notice ? (
        <div className="pointer-events-none absolute left-1/2 top-5 z-30 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 px-2">
          <div
            className={`pointer-events-auto rounded-2xl px-4 py-3 text-sm shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur-2xl ${
              notice.kind === "error"
                ? "bg-rose-950/70 text-rose-200 ring-1 ring-rose-400/20"
                : "bg-emerald-950/70 text-emerald-200 ring-1 ring-emerald-400/20"
            }`}
          >
            {notice.text}
          </div>
        </div>
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
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen((prev) => !prev)}
        activeDockMode={activeDockMode}
        snapshot={snapshot}
        selectedProjectName={selectedProject?.name ?? null}
        onSetView={handleSetView}
        onOpenSettings={() => setSettingsOpen(true)}
        busyKey={busyKey}
      />
    </div>
  );
}
