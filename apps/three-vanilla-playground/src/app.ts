import { createGameplayRuntime, createGameplayRuntimeSceneFromRuntimeScene } from "@ggez/gameplay-runtime";
import { createAudioManager, type AudioManager } from "@ggez/runtime-audio";
import { normalizeSceneSettings } from "@ggez/shared";
import {
  createWebHammerBundleAssetResolver,
  parseWebHammerEngineBundleZip,
  parseWebHammerEngineScene,
  type WebHammerEngineScene
} from "@ggez/three-runtime";
import { createPlaybackRenderScene } from "./adapter";
import { createPlaybackGameplayHost } from "./gameplay-host";
import { createPlaybackGameplaySystems } from "./gameplay-systems";
import { PlaybackSceneController } from "./playback/scene-controller";
import { createSampleScene, resolveSampleAssetPath } from "./sample-scene";
import type { AssetPathResolver, EnabledSystemKey, EnabledSystemsState, PlaybackPhysicsState, StageStats } from "./types";

const DEFAULT_SYSTEMS: EnabledSystemsState = {
  audio: true,
  mover: true,
  openable: true,
  pathMover: true,
  sequence: true,
  trigger: true
};

const SYSTEM_OPTIONS: Array<{ key: EnabledSystemKey; label: string }> = [
  { key: "trigger", label: "Trigger" },
  { key: "sequence", label: "Sequence" },
  { key: "openable", label: "Openable" },
  { key: "mover", label: "Mover" },
  { key: "pathMover", label: "Path Mover" },
  { key: "audio", label: "Audio" }
];

export function createRuntimePlaygroundApp(root: HTMLElement) {
  return new RuntimePlaygroundApp(root);
}

class RuntimePlaygroundApp {
  private readonly fileInput = document.createElement("input");
  private readonly host = createPlaybackGameplayHost();
  private readonly refs: UiRefs;
  private readonly root: HTMLElement;
  private readonly sceneController: PlaybackSceneController;

  private audioManager?: AudioManager;
  private bundleResolver?: ReturnType<typeof createWebHammerBundleAssetResolver>;
  private drawerOpen = false;
  private enabledSystems: EnabledSystemsState = { ...DEFAULT_SYSTEMS };
  private error?: string;
  private gameplayRuntime?: ReturnType<typeof createGameplayRuntime>;
  private logOpen = false;
  private physicsPlayback: PlaybackPhysicsState = "stopped";
  private resolveAssetPath: AssetPathResolver = resolveSampleAssetPath;
  private runtimeEvents: string[] = [];
  private scene: WebHammerEngineScene = createSampleScene();
  private status = "Ready";

  constructor(root: HTMLElement) {
    this.root = root;
    this.refs = createShell(root);
    this.fileInput.accept = ".zip,.json,.whmap";
    this.fileInput.className = "hidden";
    this.fileInput.type = "file";
    this.fileInput.addEventListener("change", this.handleFileInput);
    this.refs.topBar.append(this.fileInput);

    // Resume AudioContext on first user gesture (browsers require this).
    const resumeAudio = () => {
      void this.audioManager?.resume();
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
    window.addEventListener("pointerdown", resumeAudio, { once: true });
    window.addEventListener("keydown", resumeAudio, { once: true });
    this.sceneController = new PlaybackSceneController(this.refs.stage, {
      host: this.host,
      onError: (message) => {
        this.error = message;
        this.render();
      },
      onPlayerActorChange: (actor) => {
        if (actor) {
          this.gameplayRuntime?.updateActor(actor);
          return;
        }

        this.gameplayRuntime?.removeActor("player");
      }
    });

    void this.rebuildRuntime();
  }

  private get stageStats(): StageStats {
    const renderScene = createPlaybackRenderScene(this.scene);

    return {
      entities: this.scene.entities.length,
      lights: renderScene.lights.length,
      meshes: renderScene.meshes.length,
      nodes: this.scene.nodes.length
    };
  }

  private get playbackLabel() {
    return this.physicsPlayback === "running" ? "Pause" : "Play";
  }

  private async rebuildRuntime() {
    this.gameplayRuntime?.dispose();
    this.audioManager?.dispose();
    this.audioManager = undefined;

    const renderScene = createPlaybackRenderScene(this.scene);
    const sceneSettings = normalizeSceneSettings(this.scene.settings);
    const resolveAssetPath = this.resolveAssetPath;
    const gameplayRuntime = createGameplayRuntime({
      host: this.host.host,
      scene: createGameplayRuntimeSceneFromRuntimeScene(this.scene),
      systems: createPlaybackGameplaySystems(this.scene, this.enabledSystems)
    });

    // Wire AudioManager to gameplay audio events.
    const audioManager = createAudioManager({
      clipResolver: async (clipId) => {
        const url = await Promise.resolve(resolveAssetPath(clipId));
        const response = await fetch(url);
        return response.arrayBuffer();
      }
    });
    this.audioManager = audioManager;

    this.host.reset();
    this.runtimeEvents = [];
    gameplayRuntime.onEvent((event) => {
      this.runtimeEvents = [`${event.event}${event.targetId ? ` -> ${event.targetId}` : ""}`, ...this.runtimeEvents].slice(0, 12);
      this.render();

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
    this.gameplayRuntime = gameplayRuntime;

    await this.sceneController.load({
      cameraMode: sceneSettings.player.cameraMode,
      gameplayRuntime,
      physicsPlayback: this.physicsPlayback,
      renderScene,
      resolveAssetPath: this.resolveAssetPath,
      scene: this.scene,
      sceneSettings
    });

    this.render();
  }

  private async importFile(file: File) {
    this.error = undefined;
    this.status = `Importing ${file.name}`;
    this.render();

    try {
      let nextScene: WebHammerEngineScene;
      let nextResolver: AssetPathResolver = resolveSampleAssetPath;

      if (file.name.toLowerCase().endsWith(".zip")) {
        const zipBytes = new Uint8Array(await file.arrayBuffer());
        const bundle = parseWebHammerEngineBundleZip(zipBytes);
        this.bundleResolver?.dispose();
        this.bundleResolver = createWebHammerBundleAssetResolver(bundle);
        nextScene = bundle.manifest;
        nextResolver = (path: string) => this.bundleResolver!.resolve(path);
      } else {
        const text = await file.text();
        this.bundleResolver?.dispose();
        this.bundleResolver = undefined;
        nextScene = parseSceneText(text);
      }

      this.scene = nextScene;
      this.resolveAssetPath = nextResolver;
      this.physicsPlayback = "stopped";
      this.runtimeEvents = [];
      this.status = `${file.name}: ${createPlaybackRenderScene(nextScene).meshes.length} meshes`;
      await this.rebuildRuntime();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Failed to import runtime bundle.";
      this.status = "Import failed";
      this.render();
    }
  }

  private async setPlayback(nextPlayback: PlaybackPhysicsState) {
    if (nextPlayback === "stopped") {
      this.physicsPlayback = "stopped";
      await this.rebuildRuntime();
      return;
    }

    if (this.physicsPlayback === "stopped") {
      this.physicsPlayback = nextPlayback;
      await this.rebuildRuntime();
      return;
    }

    this.physicsPlayback = nextPlayback;
    this.sceneController.setPlaybackState(nextPlayback);
    this.render();
  }

  private render() {
    const stageStats = this.stageStats;
    this.refs.topBar.innerHTML = renderTopBar(this.physicsPlayback);
    this.refs.sidebar.innerHTML = renderSidebar({
      drawerOpen: this.drawerOpen,
      logOpen: this.logOpen,
      playbackLabel: this.playbackLabel,
      runtimeEvents: this.runtimeEvents,
      stageStats,
      status: this.status,
      systemState: this.enabledSystems
    });
    this.refs.error.textContent = this.error ?? "";
    this.refs.error.className = this.error
      ? "pointer-events-none absolute inset-x-4 bottom-4 z-20 mx-auto max-w-3xl rounded-2xl border border-rose-400/30 bg-rose-950/85 px-4 py-3 text-sm text-rose-100 shadow-[0_20px_80px_rgba(40,4,4,0.45)] backdrop-blur"
      : "hidden";

    this.refs.topBar.querySelector('[data-action="import"]')?.addEventListener("click", () => {
      this.fileInput.click();
    });
    this.refs.topBar.querySelector('[data-action="toggle-play"]')?.addEventListener("click", () => {
      void this.setPlayback(this.physicsPlayback === "running" ? "paused" : "running");
    });
    this.refs.topBar.querySelector('[data-action="stop"]')?.addEventListener("click", () => {
      void this.setPlayback("stopped");
    });
    this.refs.sidebar.querySelector('[data-action="toggle-drawer"]')?.addEventListener("click", () => {
      this.drawerOpen = !this.drawerOpen;
      this.render();
    });
    this.refs.sidebar.querySelector('[data-action="toggle-log"]')?.addEventListener("click", () => {
      this.logOpen = !this.logOpen;
      this.render();
    });
    this.refs.sidebar.querySelectorAll<HTMLButtonElement>("[data-system-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.systemKey as EnabledSystemKey;
        this.enabledSystems = {
          ...this.enabledSystems,
          [key]: !this.enabledSystems[key]
        };
        void this.rebuildRuntime();
      });
    });
  }

  private readonly handleFileInput = () => {
    const file = this.fileInput.files?.[0];

    if (file) {
      void this.importFile(file);
    }

    this.fileInput.value = "";
  };
}

type UiRefs = {
  error: HTMLDivElement;
  sidebar: HTMLDivElement;
  stage: HTMLDivElement;
  topBar: HTMLDivElement;
};

function createShell(root: HTMLElement): UiRefs {
  root.innerHTML = `
    <div class="relative flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(89,116,129,0.16),_transparent_28%),linear-gradient(180deg,_#11161b_0%,_#0b1015_100%)] text-slate-100">
      <div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20"></div>
      <main class="relative z-10 flex min-h-screen flex-1">
        <section class="relative flex-1">
          <div data-top-bar></div>
          <div class="absolute inset-0" data-stage></div>
          <div data-error></div>
        </section>
        <div data-sidebar></div>
      </main>
    </div>
  `;

  return {
    error: root.querySelector("[data-error]") as HTMLDivElement,
    sidebar: root.querySelector("[data-sidebar]") as HTMLDivElement,
    stage: root.querySelector("[data-stage]") as HTMLDivElement,
    topBar: root.querySelector("[data-top-bar]") as HTMLDivElement
  };
}

function renderTopBar(physicsPlayback: PlaybackPhysicsState) {
  return `
    <header class="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
      <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/62 p-1 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-md">
        ${toolbarButton("import", "Import", "default", false)}
        ${toolbarButton("toggle-play", physicsPlayback === "running" ? "Pause" : "Play", "primary", physicsPlayback === "running")}
        ${toolbarButton("stop", "Stop", "default", physicsPlayback === "stopped")}
      </div>
    </header>
  `;
}

function renderSidebar(input: {
  drawerOpen: boolean;
  logOpen: boolean;
  playbackLabel: "Pause" | "Play";
  runtimeEvents: string[];
  stageStats: StageStats;
  status: string;
  systemState: EnabledSystemsState;
}) {
  if (!input.drawerOpen) {
    return `
      <div class="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center">
        <button
          aria-label="Show runtime panel"
          class="pointer-events-auto absolute right-0 flex h-15 w-8 items-center justify-center rounded-l-2xl border border-r-0 border-white/10 bg-slate-950/78 text-slate-200 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur transition hover:bg-slate-900/90"
          data-action="toggle-drawer"
          type="button"
        >
          ${icon("chevron-left")}
        </button>
      </div>
    `;
  }

  return `
    <div class="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center">
      <aside class="pointer-events-auto mr-0 w-[18rem] overflow-hidden rounded-l-2xl border border-r-0 border-white/10 bg-slate-950/80 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
        <div class="border-b border-white/8 px-3 py-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-white">
              ${icon("settings")}
              <span class="text-sm font-medium">Runtime</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="${input.logOpen ? "border-cyan-300/35 bg-cyan-300/14 text-cyan-50" : "border-white/10 bg-white/[0.04] text-slate-300"} rounded-full border px-2 py-1 text-[11px] transition"
                data-action="toggle-log"
                type="button"
              >
                <span class="flex items-center gap-1">
                  ${icon("scroll")}
                  Log
                </span>
              </button>
              <button
                aria-label="Hide runtime panel"
                class="rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:bg-white/[0.08]"
                data-action="toggle-drawer"
                type="button"
              >
                ${icon("close")}
              </button>
            </div>
          </div>
        </div>
        <div class="space-y-4 px-3 py-3">
          <div class="grid grid-cols-2 gap-2">
            ${miniStat("State", input.playbackLabel)}
            ${miniStat("Status", input.status)}
            ${miniStat("Meshes", String(input.stageStats.meshes))}
            ${miniStat("Nodes", String(input.stageStats.nodes))}
          </div>
          <section class="space-y-2">
            ${sectionHeading("Gameplay", "Systems")}
            <div class="space-y-1.5">
              ${SYSTEM_OPTIONS.map((system) => systemToggle(system.key, system.label, input.systemState[system.key])).join("")}
            </div>
          </section>
          ${input.logOpen ? `
            <section class="space-y-2 overflow-hidden">
              ${sectionHeading("Telemetry", "Event Log")}
              <div class="max-h-52 space-y-1.5 overflow-y-auto">
                ${input.runtimeEvents.length === 0
                  ? `<div class="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-slate-400">No runtime events yet.</div>`
                  : input.runtimeEvents.map((entry) => `<div class="rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-2 font-mono text-[11px] text-slate-200">${escapeHtml(entry)}</div>`).join("")}
              </div>
            </section>
          ` : ""}
        </div>
      </aside>
    </div>
  `;
}

function toolbarButton(action: string, label: string, tone: "default" | "primary", active: boolean) {
  const className = tone === "primary"
    ? "flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-300/14 px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:bg-cyan-300/20"
    : `flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-emerald-300/35 bg-emerald-300/14 text-emerald-50"
          : "border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
      }`;

  return `
    <button class="${className}" data-action="${action}" type="button">
      ${icon(action === "import" ? "import" : action === "stop" ? "stop" : label.toLowerCase() === "pause" ? "pause" : "play")}
      <span>${label}</span>
    </button>
  `;
}

function sectionHeading(eyebrow: string, title: string) {
  return `
    <div>
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">${eyebrow}</div>
      <div class="mt-0.5 text-sm font-semibold text-white">${title}</div>
    </div>
  `;
}

function miniStat(label: string, value: string) {
  return `
    <div class="rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-2">
      <div class="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">${label}</div>
      <div class="mt-1 truncate text-xs font-medium text-white">${escapeHtml(value)}</div>
    </div>
  `;
}

function systemToggle(key: EnabledSystemKey, label: string, checked: boolean) {
  return `
    <label class="flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-2 text-xs text-slate-100">
      <span>${label}</span>
      <button
        aria-pressed="${checked}"
        class="relative h-6 w-10 rounded-full border transition ${checked ? "border-cyan-300/45 bg-cyan-300/20" : "border-white/10 bg-white/10"}"
        data-system-key="${key}"
        type="button"
      >
        <span class="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition ${checked ? "left-[1.1rem]" : "left-0.5"}"></span>
      </button>
    </label>
  `;
}

function icon(name: string) {
  const svgClass = "h-4 w-4";

  switch (name) {
    case "import":
      return `<svg class="${svgClass}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
    case "pause":
      return `<svg class="${svgClass}" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>`;
    case "play":
      return `<svg class="${svgClass}" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>`;
    case "stop":
      return `<svg class="${svgClass}" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.6"/></svg>`;
    case "settings":
      return `<svg class="${svgClass} text-cyan-200" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" viewBox="0 0 24 24"><path d="M12 3v3"/><path d="M12 18v3"/><path d="m4.93 4.93 2.12 2.12"/><path d="m16.95 16.95 2.12 2.12"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m4.93 19.07 2.12-2.12"/><path d="m16.95 7.05 2.12-2.12"/><circle cx="12" cy="12" r="3.5"/></svg>`;
    case "scroll":
      return `<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" viewBox="0 0 24 24"><path d="M8 6h10"/><path d="M8 12h8"/><path d="M8 18h6"/><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>`;
    case "close":
      return `<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" viewBox="0 0 24 24"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>`;
    case "chevron-left":
      return `<svg class="${svgClass}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>`;
    default:
      return "";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Parse scene text — handles both runtime format and .whmap editor format. */
function parseSceneText(text: string): WebHammerEngineScene {
  const parsed = JSON.parse(text);

  // .whmap editor format: { format: "whmap", scene: { ... } }
  if (parsed?.format === "whmap" && parsed.scene) {
    const scene = parsed.scene;
    // Inject runtime metadata so parseWebHammerEngineScene accepts it.
    scene.metadata = {
      exportedAt: new Date().toISOString(),
      format: "web-hammer-engine",
      version: 6
    };
    return parseWebHammerEngineScene(JSON.stringify(scene));
  }

  return parseWebHammerEngineScene(text);
}
