import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createGameplayRuntime, createGameplayRuntimeSceneFromRuntimeScene } from "@ggez/gameplay-runtime";
import { createAudioManager, type AudioManager } from "@ggez/runtime-audio";
import {
  createWebHammerBundleAssetResolver,
  parseWebHammerEngineBundleZip,
  parseWebHammerEngineScene,
  type WebHammerEngineScene
} from "@ggez/three-runtime";
import { normalizeSceneSettings, type Vec3 } from "@ggez/shared";
import { createPlaybackRenderScene } from "../adapter";
import { createPlaybackGameplayHost } from "../gameplay-host";
import { createPlaybackGameplaySystems } from "../gameplay-systems";
import { createSampleScene, resolveSampleAssetPath } from "../sample-scene";
import type { EnabledSystemKey, EnabledSystemsState, PanelSection, PlaygroundControls, StageStats } from "./types";

type PlayerActor = {
  height?: number;
  id: string;
  position: Vec3;
  radius?: number;
  tags: string[];
};

const DEFAULT_SYSTEMS: EnabledSystemsState = {
  audio: true,
  mover: true,
  openable: true,
  pathMover: true,
  sequence: true,
  trigger: true
};

export function useRuntimePlayground() {
  const [scene, setScene] = useState<WebHammerEngineScene>(createSampleScene());
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string>();
  const [physicsPlayback, setPhysicsPlayback] = useState<"paused" | "running" | "stopped">("stopped");
  const [physicsRevision, setPhysicsRevision] = useState(0);
  const [runtimeEvents, setRuntimeEvents] = useState<string[]>([]);
  const [enabledSystems, setEnabledSystems] = useState<EnabledSystemsState>(DEFAULT_SYSTEMS);
  const [resolveAssetPath, setResolveAssetPath] = useState<(path: string) => Promise<string> | string>(() => resolveSampleAssetPath);
  const bundleResolverRef = useRef<ReturnType<typeof createWebHammerBundleAssetResolver> | undefined>(undefined);
  const hostRef = useRef(createPlaybackGameplayHost());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sceneSettings = useMemo(() => normalizeSceneSettings(scene.settings), [scene.settings]);
  const renderScene = useMemo(() => createPlaybackRenderScene(scene), [scene]);
  const gameplaySystems = useMemo(
    () => createPlaybackGameplaySystems(scene, enabledSystems),
    [enabledSystems, scene]
  );
  const gameplayRuntime = useMemo(
    () =>
      createGameplayRuntime({
        host: hostRef.current.host,
        scene: createGameplayRuntimeSceneFromRuntimeScene(scene),
        systems: gameplaySystems
      }),
    [gameplaySystems, scene.entities, scene.nodes]
  );

  useEffect(() => () => {
    bundleResolverRef.current?.dispose();
  }, []);

  const audioManagerRef = useRef<AudioManager | undefined>(undefined);

  useEffect(() => {
    audioManagerRef.current?.dispose();

    const audioManager = createAudioManager({
      clipResolver: async (clipId) => {
        const url = await Promise.resolve(resolveAssetPath(clipId));
        const response = await fetch(url);
        return response.arrayBuffer();
      }
    });
    audioManagerRef.current = audioManager;

    hostRef.current.reset();
    setRuntimeEvents([]);
    const unsubscribe = gameplayRuntime.onEvent((event) => {
      setRuntimeEvents((current) =>
        [`${event.event}${event.targetId ? ` -> ${event.targetId}` : ""}`, ...current].slice(0, 12)
      );

      if (event.event === "audio.play") {
        const p = event.payload as Record<string, unknown> | undefined;
        if (p?.clip && typeof p.clip === "string") {
          void audioManager.play({
            channel: (p.channel as "sfx" | "music" | "ambient" | "ui" | "voice") ?? "sfx",
            clip: p.clip as string,
            distanceModel: (p.distanceModel as "inverse" | "linear" | "exponential") ?? "inverse",
            id: p.hookId as string | undefined,
            loop: p.loop === true,
            maxDistance: typeof p.maxDistance === "number" ? p.maxDistance : 10000,
            pitch: typeof p.pitch === "number" ? p.pitch : 1,
            position: Array.isArray(p.position) ? { x: p.position[0], y: p.position[1], z: p.position[2] } : undefined,
            refDistance: typeof p.refDistance === "number" ? p.refDistance : 1,
            rolloffFactor: typeof p.rolloffFactor === "number" ? p.rolloffFactor : 1,
            spatial: p.spatial === true,
            volume: typeof p.volume === "number" ? p.volume : 1
          });
        }
      }

      if (event.event === "audio.stop") {
        const p = event.payload as Record<string, unknown> | undefined;
        if (p?.hookId && typeof p.hookId === "string") {
          audioManager.stop(p.hookId);
        }
      }
    });

    gameplayRuntime.start();

    // Resume AudioContext on first user gesture (browsers require this).
    const resumeAudio = () => {
      void audioManager.resume();
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);

    return () => {
      unsubscribe();
      gameplayRuntime.dispose();
      audioManager.dispose();
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
  }, [gameplayRuntime, resolveAssetPath]);

  const resetPhysics = useCallback(() => {
    setPhysicsPlayback("stopped");
    setPhysicsRevision((current) => current + 1);
  }, []);

  const importFile = useCallback(async (file: File) => {
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
        nextScene = parseSceneText(text);
      }

      setScene(nextScene);
      setResolveAssetPath(() => nextResolver);
      resetPhysics();
      setRuntimeEvents([]);
      setStatus(`${file.name}: ${createPlaybackRenderScene(nextScene).meshes.length} meshes`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to import runtime bundle.");
      setStatus("Import failed");
    }
  }, [resetPhysics]);

  const handlePlayerActorChange = useCallback((actor: PlayerActor | null) => {
    if (actor) {
      gameplayRuntime.updateActor(actor);
      return;
    }

    gameplayRuntime.removeActor("player");
  }, [gameplayRuntime]);

  const onToggleSystem = useCallback((key: EnabledSystemKey, enabled: boolean) => {
    setEnabledSystems((current) => ({
      ...current,
      [key]: enabled
    }));
  }, []);

  const stageStats = useMemo<StageStats>(() => ({
    entities: scene.entities.length,
    lights: renderScene.lights.length,
    meshes: renderScene.meshes.length,
    nodes: scene.nodes.length
  }), [renderScene.lights.length, renderScene.meshes.length, scene.entities.length, scene.nodes.length]);

  const controls = useMemo<PlaygroundControls>(() => ({
    fileInputRef,
    onFileSelected: (file) => {
      void importFile(file);
    },
    toolbarActions: [
      { icon: "import", label: "Import", onClick: () => fileInputRef.current?.click() },
      {
        active: physicsPlayback === "running",
        icon: physicsPlayback === "running" ? "pause" : "play",
        label: physicsPlayback === "running" ? "Pause" : "Play",
        onClick: () => setPhysicsPlayback((current) => (current === "running" ? "paused" : "running")),
        tone: "primary"
      },
      { active: physicsPlayback === "stopped", icon: "stop", label: "Stop", onClick: resetPhysics }
    ]
  }), [importFile, physicsPlayback, resetPhysics]);

  const panel = useMemo<PanelSection>(() => ({
    eventLog: runtimeEvents,
    onToggleSystem,
    playbackLabel: physicsPlayback === "running" ? "Pause" : "Play",
    status,
    systemState: enabledSystems
  }), [enabledSystems, onToggleSystem, physicsPlayback, runtimeEvents, status]);

  return {
    controls,
    error,
    gameplayRuntime,
    handlePlayerActorChange,
    host: hostRef.current,
    panel,
    physicsPlayback,
    physicsRevision,
    renderScene,
    resolveAssetPath,
    sceneSettings,
    stageStats,
    status
  };
}

/** Parse scene text — handles both runtime format and .whmap editor format. */
function parseSceneText(text: string): WebHammerEngineScene {
  const parsed = JSON.parse(text);

  if (parsed?.format === "whmap" && parsed.scene) {
    const scene = parsed.scene;
    scene.metadata = {
      exportedAt: new Date().toISOString(),
      format: "web-hammer-engine",
      version: 6
    };
    return parseWebHammerEngineScene(JSON.stringify(scene));
  }

  return parseWebHammerEngineScene(text);
}
