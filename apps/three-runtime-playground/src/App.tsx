import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGameplayRuntime,
} from "@web-hammer/gameplay-runtime";
import {
  createWebHammerBundleAssetResolver,
  parseWebHammerEngineBundleZip,
  parseWebHammerEngineScene,
  type WebHammerEngineScene
} from "@web-hammer/three-runtime";
import { normalizeSceneSettings, type PlayerCameraMode } from "@web-hammer/shared";
import { createPlaybackRenderScene } from "./adapter";
import { createPlaybackGameplayHost } from "./gameplay-host";
import { createPlaybackGameplaySystems } from "./gameplay-systems";
import { PlaybackScene } from "./PlaybackScene";
import { createSampleScene, resolveSampleAssetPath } from "./sample-scene";

const SAMPLE_DOOR_ID = "node:sample:door-root";
const SAMPLE_PATH_ID = "node:sample:spire-group";
const SAMPLE_PLATFORM_ID = "node:sample:platform-root";

export function App() {
  const [scene, setScene] = useState<WebHammerEngineScene>(createSampleScene());
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string>();
  const [physicsPlayback, setPhysicsPlayback] = useState<"paused" | "running" | "stopped">("stopped");
  const [physicsRevision, setPhysicsRevision] = useState(0);
  const [cameraMode, setCameraMode] = useState<PlayerCameraMode>("third-person");
  const [runtimeEvents, setRuntimeEvents] = useState<string[]>([]);
  const [enabledSystems, setEnabledSystems] = useState({
    mover: true,
    openable: true,
    pathMover: true,
    sequence: true,
    trigger: true
  });
  const [resolveAssetPath, setResolveAssetPath] = useState<(path: string) => Promise<string> | string>(() => resolveSampleAssetPath);
  const bundleResolverRef = useRef<ReturnType<typeof createWebHammerBundleAssetResolver> | undefined>(undefined);
  const gameplayHostRef = useRef(createPlaybackGameplayHost());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedSceneSettings = useMemo(() => normalizeSceneSettings(scene.settings), [scene.settings]);

  const renderScene = useMemo(() => createPlaybackRenderScene(scene), [scene]);
  const gameplaySystems = useMemo(
    () => createPlaybackGameplaySystems(scene, enabledSystems),
    [enabledSystems, scene]
  );
  const gameplayRuntime = useMemo(
    () =>
      createGameplayRuntime({
        host: gameplayHostRef.current.host,
        scene: {
          entities: scene.entities,
          nodes: scene.nodes
        },
        systems: gameplaySystems
      }),
    [gameplaySystems, scene.entities, scene.nodes]
  );
  const handlePlayerActorChange = useCallback((actor: { height?: number; id: string; position: { x: number; y: number; z: number }; radius?: number; tags: string[] } | null) => {
    if (actor) {
      gameplayRuntime.updateActor(actor);
      return;
    }

    gameplayRuntime.removeActor("player");
  }, [gameplayRuntime]);

  useEffect(() => {
    setCameraMode(normalizedSceneSettings.player.cameraMode);
  }, [normalizedSceneSettings.player.cameraMode]);

  useEffect(() => {
    return () => {
      bundleResolverRef.current?.dispose();
      gameplayRuntime.dispose();
    };
  }, [gameplayRuntime]);

  useEffect(() => {
    gameplayHostRef.current.reset();
    setRuntimeEvents([]);
    const unsubscribe = gameplayRuntime.onEvent((event) => {
      setRuntimeEvents((current) =>
        [`${event.event}${event.targetId ? ` -> ${event.targetId}` : ""}`, ...current].slice(0, 10)
      );
    });

    gameplayRuntime.start();

    return () => {
      unsubscribe();
      gameplayRuntime.dispose();
    };
  }, [gameplayRuntime]);

  const loadSample = () => {
    bundleResolverRef.current?.dispose();
    bundleResolverRef.current = undefined;
    setScene(createSampleScene());
    setResolveAssetPath(() => resolveSampleAssetPath);
    setPhysicsPlayback("stopped");
    setPhysicsRevision((current) => current + 1);
    setRuntimeEvents([]);
    setError(undefined);
    setStatus("Sample scene loaded");
  };

  const importFile = async (file: File) => {
    setError(undefined);
    setStatus(`Importing ${file.name}`);

    try {
      let nextScene: WebHammerEngineScene;
      let nextResolver: (path: string) => Promise<string> | string = resolveSampleAssetPath;

      if (file.name.toLowerCase().endsWith(".zip")) {
        const zipBytes = new Uint8Array(await file.arrayBuffer());
        const bundle = parseWebHammerEngineBundleZip(zipBytes);
        bundleResolverRef.current?.dispose();
        const bundleResolver = createWebHammerBundleAssetResolver(bundle);
        bundleResolverRef.current = bundleResolver;
        nextScene = bundle.manifest;
        nextResolver = (path: string) => bundleResolver.resolve(path);
      } else {
        const text = await file.text();
        bundleResolverRef.current?.dispose();
        bundleResolverRef.current = undefined;
        nextScene = parseWebHammerEngineScene(text);
      }

      setScene(nextScene);
      setResolveAssetPath(() => nextResolver);
      setPhysicsPlayback("stopped");
      setPhysicsRevision((current) => current + 1);
      setRuntimeEvents([]);
      setStatus(`${file.name}: ${createPlaybackRenderScene(nextScene).meshes.length} meshes`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to import runtime bundle.");
      setStatus("Import failed");
    }
  };

  const emitRuntimeEvent = (event: string, targetId: string) => {
    gameplayRuntime.emitEvent({
      event,
      sourceId: "playground",
      sourceKind: "system",
      targetId
    });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Web Hammer Runtime Playground</div>
        <div className="toolbar">
          <button onClick={loadSample} type="button">Sample</button>
          <button onClick={() => fileInputRef.current?.click()} type="button">Import Bundle</button>
          <input
            accept=".zip,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void importFile(file);
              }

              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          <select aria-label="Camera mode" onChange={(event) => setCameraMode(event.target.value as PlayerCameraMode)} value={cameraMode}>
            <option value="third-person">Third Person</option>
            <option value="fps">FPS</option>
            <option value="top-down">Top Down</option>
          </select>
          <button className={physicsPlayback === "running" ? "active" : undefined} onClick={() => setPhysicsPlayback("running")} type="button">Play</button>
          <button className={physicsPlayback === "paused" ? "active" : undefined} onClick={() => setPhysicsPlayback("paused")} type="button">Pause</button>
          <button
            className={physicsPlayback === "stopped" ? "active" : undefined}
            onClick={() => {
              setPhysicsPlayback("stopped");
              setPhysicsRevision((current) => current + 1);
            }}
            type="button"
          >
            Stop
          </button>
        </div>
        <div className="status">{status}</div>
      </header>

      <main id="stage">
        <PlaybackScene
          cameraMode={cameraMode}
          gameplayRuntime={gameplayRuntime}
          onNodeObjectChange={gameplayHostRef.current.bindNodeObject}
          onNodePhysicsBodyChange={gameplayHostRef.current.bindNodePhysicsBody}
          onPlayerActorChange={handlePlayerActorChange}
          physicsRevision={physicsRevision}
          physicsPlayback={physicsPlayback}
          renderScene={renderScene}
          resolveAssetPath={resolveAssetPath}
          sceneSettings={normalizedSceneSettings}
        />
      </main>

      <aside className="runtime-panel">
        <div className="runtime-panel__header">
          <div>
            <div className="runtime-panel__eyebrow">Gameplay Runtime</div>
            <div className="runtime-panel__title">Systems</div>
          </div>
        </div>
        <div className="runtime-panel__section">
          {([
            ["trigger", "Trigger"],
            ["sequence", "Sequence"],
            ["openable", "Openable"],
            ["mover", "Mover"],
            ["pathMover", "Path Mover"]
          ] as const).map(([key, label]) => (
            <label className="runtime-toggle" key={key}>
              <input
                checked={enabledSystems[key]}
                onChange={(event) =>
                  setEnabledSystems((current) => ({
                    ...current,
                    [key]: event.target.checked
                  }))
                }
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="runtime-panel__section">
          <div className="runtime-panel__subhead">Emit Demo Events</div>
          <div className="runtime-actions">
            <button onClick={() => emitRuntimeEvent("open.requested", SAMPLE_DOOR_ID)} type="button">Door Open</button>
            <button onClick={() => emitRuntimeEvent("close.requested", SAMPLE_DOOR_ID)} type="button">Door Close</button>
            <button onClick={() => emitRuntimeEvent("toggle.requested", SAMPLE_DOOR_ID)} type="button">Door Toggle</button>
            <button onClick={() => emitRuntimeEvent("path.start", SAMPLE_PATH_ID)} type="button">Path Start</button>
            <button onClick={() => emitRuntimeEvent("path.stop", SAMPLE_PATH_ID)} type="button">Path Stop</button>
            <button onClick={() => emitRuntimeEvent("path.reverse", SAMPLE_PATH_ID)} type="button">Path Reverse</button>
            <button onClick={() => emitRuntimeEvent("path.start", SAMPLE_PLATFORM_ID)} type="button">Platform Start</button>
          </div>
        </div>
        <div className="runtime-panel__section">
          <div className="runtime-panel__subhead">Event Log</div>
          <div className="runtime-log">
            {runtimeEvents.length === 0 ? <div className="runtime-log__empty">No events yet</div> : null}
            {runtimeEvents.map((entry) => (
              <div className="runtime-log__entry" key={entry}>
                {entry}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className={`error-banner${error ? "" : " hidden"}`}>{error}</div>
    </div>
  );
}
