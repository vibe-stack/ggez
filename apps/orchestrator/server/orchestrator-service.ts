import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  listLiveGameRegistrations,
  setGameCommand
} from "../../../packages/dev-sync/src/node";
import type { DevSyncGameRegistration } from "../../../packages/dev-sync/src/shared";

const HOST = "127.0.0.1";
const TRIDENT_PORT = 8080;
const ANIMATION_STUDIO_PORT = 8081;
const GAME_PORT_START = 4301;
const STATE_VERSION = 1;
const LOG_LIMIT = 120;
const SHUTDOWN_GRACE_MS = 3_000;
const STARTUP_TIMEOUT_MS = 20_000;

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";
export type ViewId = "trident" | "animation-studio" | "game";
type RuntimeStatus = "stopped" | "starting" | "running" | "error";

type StoredProject = {
  createdAt: number;
  hasGameDevSupport: boolean;
  id: string;
  name: string;
  packageManager: PackageManager;
  preferredPort: number | null;
  projectRoot: string;
  source: "created" | "existing";
  updatedAt: number;
};

type StoredState = {
  activeProjectId: string | null;
  activeView: ViewId;
  projects: StoredProject[];
  version: number;
};

type ManagedRuntime = {
  commandLabel: string;
  cwd: string;
  id: string;
  intentionalStop: boolean;
  kind: "editor" | "game";
  label: string;
  lastError: string | null;
  logLines: string[];
  port: number;
  process: ChildProcess | null;
  projectId: string | null;
  startedAt: number | null;
  status: RuntimeStatus;
  url: string;
};

export type RuntimeSnapshot = {
  commandLabel: string;
  currentSceneId: string | null;
  cwd: string;
  lastError: string | null;
  logLines: string[];
  port: number;
  sceneIds: string[];
  startedAt: number | null;
  status: RuntimeStatus;
  url: string;
};

export type EditorSnapshot = RuntimeSnapshot & {
  id: Exclude<ViewId, "game">;
  label: string;
};

export type ProjectSnapshot = StoredProject & {
  isSelected: boolean;
  runtime: RuntimeSnapshot;
};

export type OrchestratorSnapshot = {
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

export type ProjectCodexContext = {
  id: string;
  name: string;
  projectRoot: string;
};

type CreateProjectInput = {
  destinationRoot: string;
  force: boolean;
  initializeGit: boolean;
  installDependencies: boolean;
  packageManager: PackageManager;
  projectName: string;
};

type AddProjectInput = {
  projectRoot: string;
};

type RuntimeCommand = {
  args: string[];
  command: string;
  cwd: string;
};

type ProjectMetadata = {
  hasGameDevSupport: boolean;
  name: string;
  packageManager: PackageManager;
  projectRoot: string;
};

export class OrchestratorService {
  private readonly repoRoot: string;
  private readonly statePath: string;
  private state: StoredState | null = null;
  private initializePromise: Promise<void> | null = null;
  private readonly editors: Record<Exclude<ViewId, "game">, ManagedRuntime>;
  private readonly games = new Map<string, ManagedRuntime>();
  private cleanupRegistered = false;
  private shuttingDown = false;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.statePath = join(homedir(), ".web-hammer-engine", "orchestrator-state.json");
    this.editors = {
      "animation-studio": createManagedRuntime({
        cwd: join(repoRoot, "apps/animation-editor"),
        id: "animation-studio",
        kind: "editor",
        label: "Animation Studio",
        port: ANIMATION_STUDIO_PORT
      }),
      trident: createManagedRuntime({
        cwd: join(repoRoot, "apps/editor"),
        id: "trident",
        kind: "editor",
        label: "Trident",
        port: TRIDENT_PORT
      })
    };
  }

  async initialize() {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.initializeInternal();
    return this.initializePromise;
  }

  async getSnapshot(): Promise<OrchestratorSnapshot> {
    await this.initialize();

    const state = this.state!;
    const liveGameRegistrations = new Map(
      (await listLiveGameRegistrations()).map((registration) => [registration.projectRoot, registration])
    );
    const selectedProject = state.projects.find((project) => project.id === state.activeProjectId) ?? null;
    const editors = [this.editors.trident, this.editors["animation-studio"]]
      .filter((editor): editor is ManagedRuntime => Boolean(editor))
      .map((editor) => ({
        id: editor.id as Exclude<ViewId, "game">,
        label: editor.label,
        ...toRuntimeSnapshot(editor)
      }));

    const projects = state.projects.map((project) => ({
      ...project,
      isSelected: project.id === state.activeProjectId,
      runtime: toRuntimeSnapshot(
        this.games.get(project.id) ?? createStoppedGameRuntime(project),
        liveGameRegistrations.get(project.projectRoot)
      )
    }));

    return {
      activeProjectId: state.activeProjectId,
      activeView: state.activeView,
      editors,
      projects,
      storagePath: this.statePath,
      viewport: resolveViewport({
        activeView: state.activeView,
        editors,
        selectedProject: selectedProject
          ? {
              ...selectedProject,
              isSelected: true,
              runtime: toRuntimeSnapshot(
                this.games.get(selectedProject.id) ?? createStoppedGameRuntime(selectedProject),
                liveGameRegistrations.get(selectedProject.projectRoot)
              )
            }
          : null
      })
    };
  }

  async addProject(input: AddProjectInput) {
    await this.initialize();

    const metadata = await readProjectMetadata(input.projectRoot);
    const state = this.state!;
    const existing = state.projects.find((project) => project.projectRoot === metadata.projectRoot);

    if (existing) {
      existing.hasGameDevSupport = metadata.hasGameDevSupport;
      existing.name = metadata.name;
      existing.packageManager = metadata.packageManager;
      existing.updatedAt = Date.now();
      state.activeProjectId = existing.id;
      await this.persistState();
      return existing;
    }

    const project: StoredProject = {
      createdAt: Date.now(),
      hasGameDevSupport: metadata.hasGameDevSupport,
      id: randomUUID(),
      name: metadata.name,
      packageManager: metadata.packageManager,
      preferredPort: null,
      projectRoot: metadata.projectRoot,
      source: "existing",
      updatedAt: Date.now()
    };

    state.projects = [project, ...state.projects];
    state.activeProjectId = project.id;
    await this.persistState();
    return project;
  }

  async createProject(input: CreateProjectInput) {
    await this.initialize();

    const normalizedName = input.projectName.trim();

    if (!normalizedName) {
      throw new Error("Project name is required.");
    }

    const targetRoot = resolvePath(input.destinationRoot, slugifyDirectoryName(normalizedName));
    const cliPath = join(this.repoRoot, "packages/create-ggez/src/cli.js");
    const command: RuntimeCommand = {
      args: [
        cliPath,
        targetRoot,
        "--yes",
        "--template",
        "vanilla-three",
        "--package-manager",
        input.packageManager,
        input.installDependencies ? "--install" : "--no-install",
        input.initializeGit ? "--git" : "--no-git",
        "--name",
        slugifyPackageName(normalizedName),
        ...(input.force ? ["--force"] : [])
      ],
      command: "bun",
      cwd: this.repoRoot
    };

    await runCommand(command, {
      label: `create project ${normalizedName}`
    });

    const project = await this.addProject({ projectRoot: targetRoot });
    project.source = "created";
    project.packageManager = input.packageManager;
    project.updatedAt = Date.now();
    this.state!.activeProjectId = project.id;
    await this.persistState();
    return project;
  }

  async removeProject(projectId: string) {
    await this.initialize();

    const state = this.state!;
    const project = state.projects.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    await this.stopGame(projectId);
    this.games.delete(projectId);
    state.projects = state.projects.filter((entry) => entry.id !== projectId);

    if (state.activeProjectId === projectId) {
      state.activeProjectId = state.projects[0]?.id ?? null;
      if (!state.activeProjectId && state.activeView === "game") {
        state.activeView = "trident";
      }
    }

    await this.persistState();
  }

  async selectProject(projectId: string) {
    await this.initialize();
    const state = this.state!;
    const project = state.projects.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    state.activeProjectId = projectId;
    project.updatedAt = Date.now();
    await this.persistState();
  }

  async setActiveView(view: ViewId) {
    await this.initialize();
    const state = this.state!;

    if (view === "game" && !state.activeProjectId) {
      throw new Error("Select a game project first.");
    }

    state.activeView = view;
    await this.persistState();
  }

  async startGame(projectId: string) {
    await this.initialize();

    const state = this.state!;
    const project = state.projects.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const metadata = await readProjectMetadata(project.projectRoot);
    project.hasGameDevSupport = metadata.hasGameDevSupport;
    project.name = metadata.name;
    project.packageManager = metadata.packageManager;
    project.updatedAt = Date.now();

    for (const [activeProjectId] of this.games) {
      if (activeProjectId !== projectId) {
        await this.stopGame(activeProjectId);
      }
    }

    let runtime = this.games.get(projectId);

    if (!runtime) {
      runtime = createManagedRuntime({
        cwd: project.projectRoot,
        id: projectId,
        kind: "game",
        label: project.name,
        port: project.preferredPort ?? (await findAvailablePort(GAME_PORT_START)),
        projectId
      });
      this.games.set(projectId, runtime);
    }

    if (runtime.status === "running" || runtime.status === "starting") {
      state.activeProjectId = projectId;
      await this.persistState();
      return;
    }

    runtime.port = project.preferredPort ?? (await findAvailablePort(project.preferredPort ?? GAME_PORT_START));
    runtime.url = createUrl(runtime.port);
    runtime.label = project.name;
    runtime.cwd = project.projectRoot;

    const command = createGameCommand(project.packageManager, runtime.port, project.projectRoot);
    await this.startRuntime(runtime, command);
    project.preferredPort = runtime.port;
    state.activeProjectId = projectId;
    await this.persistState();
  }

  async stopGame(projectId: string) {
    await this.initialize();

    const runtime = this.games.get(projectId);

    if (!runtime) {
      return;
    }

    await this.stopRuntime(runtime);
  }

  async restartEditor(editorId: Exclude<ViewId, "game">) {
    await this.initialize();

    const runtime = this.editors[editorId];

    if (!runtime) {
      throw new Error("Editor not found.");
    }

    await this.stopRuntime(runtime);
    await this.ensureEditorRunning(editorId);
  }

  async getProjectCodexContext(projectId: string): Promise<ProjectCodexContext> {
    await this.initialize();

    const project = this.state?.projects.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    return {
      id: project.id,
      name: project.name,
      projectRoot: project.projectRoot
    };
  }

  async switchGameScene(projectId: string, sceneId: string) {
    await this.initialize();

    const project = this.state?.projects.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const registration = (await listLiveGameRegistrations()).find((entry) => entry.projectRoot === project.projectRoot);

    if (!registration) {
      throw new Error("No live game dev server was found for that project.");
    }

    if (!registration.sceneIds.includes(sceneId)) {
      throw new Error(`Scene \"${sceneId}\" is not available in the running game.`);
    }

    await setGameCommand(registration.id, {
      issuedAt: Date.now(),
      nonce: `${Date.now()}:${sceneId}`,
      sceneId,
      type: "switch-scene"
    });
  }

  async shutdown() {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    const shutdownTargets = [
      ...Object.values(this.editors).filter((editor): editor is ManagedRuntime => Boolean(editor)),
      ...this.games.values()
    ];

    await Promise.all(shutdownTargets.map((runtime) => this.stopRuntime(runtime)));
  }

  private async initializeInternal() {
    await mkdir(dirname(this.statePath), { recursive: true });
    this.state = await this.readStateFile();
    this.registerCleanupHooks();
    await Promise.allSettled([this.ensureEditorRunning("trident"), this.ensureEditorRunning("animation-studio")]);
  }

  private async readStateFile(): Promise<StoredState> {
    try {
      const source = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(source) as Partial<StoredState>;
      return normalizeState(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      const nextState = createInitialState();
      await this.writeStateFile(nextState);
      return nextState;
    }
  }

  private async persistState() {
    if (!this.state) {
      return;
    }

    await this.writeStateFile(this.state);
  }

  private async writeStateFile(state: StoredState) {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2), "utf8");
  }

  private async ensureEditorRunning(editorId: Exclude<ViewId, "game">) {
    const runtime = this.editors[editorId];

    if (!runtime || runtime.status === "running" || runtime.status === "starting") {
      return;
    }

    const distPath = join(runtime.cwd, "dist");

    try {
      await access(distPath);
    } catch {
      await this.buildEditorPreview(editorId, runtime, distPath);
    }

    const command =
      editorId === "trident"
        ? {
            args: [
              "run",
              "--cwd",
              join(this.repoRoot, "apps/editor"),
              "preview",
              "--",
              "--host",
              HOST,
              "--port",
              String(TRIDENT_PORT),
              "--strictPort"
            ],
            command: "bun",
            cwd: this.repoRoot
          }
        : {
            args: [
              "run",
              "--cwd",
              join(this.repoRoot, "apps/animation-editor"),
              "preview",
              "--",
              "--host",
              HOST,
              "--port",
              String(ANIMATION_STUDIO_PORT),
              "--strictPort"
            ],
            command: "bun",
            cwd: this.repoRoot
          };

    await this.startRuntime(runtime, command);
  }

  private async buildEditorPreview(
    editorId: Exclude<ViewId, "game">,
    runtime: ManagedRuntime,
    distPath: string
  ) {
    const appPath = editorId === "trident"
      ? join(this.repoRoot, "apps/editor")
      : join(this.repoRoot, "apps/animation-editor");

    runtime.status = "starting";
    runtime.lastError = null;
    runtime.logLines = [`Missing build output at ${distPath}. Building ${runtime.label} once...`];

    try {
      await runCommand({
        args: ["run", "--cwd", appPath, "build"],
        command: "bun",
        cwd: this.repoRoot
      }, {
        label: `build ${runtime.label}`
      });
      appendLog(runtime, `${runtime.label} build complete.`);
    } catch (error) {
      runtime.status = "error";
      runtime.lastError = error instanceof Error
        ? error.message
        : `Failed to build ${runtime.label}.`;
      appendLog(runtime, runtime.lastError);
      throw error;
    }

    await access(distPath);
  }

  private async startRuntime(runtime: ManagedRuntime, command: RuntimeCommand) {
    if (!(await isPortFree(runtime.port))) {
      runtime.status = "error";
      runtime.lastError = `Port ${runtime.port} is already in use.`;
      runtime.logLines = [runtime.lastError];
      throw new Error(runtime.lastError);
    }

    runtime.commandLabel = formatCommand(command);
    runtime.cwd = command.cwd;
    runtime.lastError = null;
    runtime.logLines = [];
    runtime.status = "starting";
    runtime.startedAt = Date.now();
    runtime.intentionalStop = false;

    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: createChildEnvironment(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    runtime.process = child;
    const stdout = child.stdout ? createInterface({ input: child.stdout }) : null;
    const stderr = child.stderr ? createInterface({ input: child.stderr }) : null;

    stdout?.on("line", (line) => appendLog(runtime, line));
    stderr?.on("line", (line) => appendLog(runtime, line));

    child.on("error", (error) => {
      runtime.lastError = `Failed to start ${runtime.label}: ${error.message}`;
      runtime.status = "error";
      runtime.process = null;
      appendLog(runtime, runtime.lastError);
    });

    child.on("exit", (code, signal) => {
      runtime.process = null;

      if (runtime.intentionalStop) {
        runtime.status = "stopped";
        runtime.intentionalStop = false;
        return;
      }

      if (code === 0) {
        runtime.status = "stopped";
        appendLog(runtime, `${runtime.label} stopped.`);
        return;
      }

      runtime.status = "error";
      runtime.lastError = `${runtime.label} exited with ${signal ?? code ?? "unknown"} while starting.`;
      appendLog(runtime, runtime.lastError);
    });

    try {
      await waitForHttp(runtime.url, STARTUP_TIMEOUT_MS);

      if (runtime.process) {
        runtime.status = "running";
        appendLog(runtime, `${runtime.label} available at ${runtime.url}`);
      }
    } catch (error) {
      runtime.status = "error";
      runtime.lastError =
        error instanceof Error ? error.message : `Timed out waiting for ${runtime.label} to start.`;
      appendLog(runtime, runtime.lastError);
      throw error;
    }
  }

  private async stopRuntime(runtime: ManagedRuntime) {
    if (!runtime.process) {
      if (runtime.status !== "error") {
        runtime.status = "stopped";
      }
      return;
    }

    runtime.intentionalStop = true;
    const child = runtime.process;
    child.kill("SIGTERM");

    await Promise.race([
      waitForExit(child),
      sleep(SHUTDOWN_GRACE_MS).then(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      })
    ]);

    runtime.process = null;
    runtime.status = "stopped";
  }

  private registerCleanupHooks() {
    if (this.cleanupRegistered) {
      return;
    }

    this.cleanupRegistered = true;
    const handleSignal = (exitCode: number) => {
      void this.shutdown().finally(() => {
        process.exit(exitCode);
      });
    };

    process.once("SIGINT", () => handleSignal(0));
    process.once("SIGTERM", () => handleSignal(0));
  }
}

function createInitialState(): StoredState {
  return {
    activeProjectId: null,
    activeView: "trident",
    projects: [],
    version: STATE_VERSION
  };
}

function normalizeState(state: Partial<StoredState>): StoredState {
  return {
    activeProjectId: state.activeProjectId ?? null,
    activeView:
      state.activeView === "animation-studio" || state.activeView === "game" || state.activeView === "trident"
        ? state.activeView
        : "trident",
    projects: Array.isArray(state.projects)
      ? state.projects.map((project) => ({
          createdAt: Number(project.createdAt) || Date.now(),
          hasGameDevSupport: Boolean(project.hasGameDevSupport),
          id: String(project.id ?? randomUUID()),
          name: String(project.name ?? basename(String(project.projectRoot ?? "Untitled Game"))),
          packageManager: normalizePackageManager(project.packageManager),
          preferredPort: typeof project.preferredPort === "number" ? project.preferredPort : null,
          projectRoot: String(project.projectRoot ?? ""),
          source: project.source === "created" ? "created" : "existing",
          updatedAt: Number(project.updatedAt) || Date.now()
        }))
      : [],
    version: STATE_VERSION
  };
}

function normalizePackageManager(packageManager: unknown): PackageManager {
  if (packageManager === "bun" || packageManager === "pnpm" || packageManager === "yarn") {
    return packageManager;
  }

  return "npm";
}

function createManagedRuntime(options: {
  cwd: string;
  id: string;
  kind: "editor" | "game";
  label: string;
  port: number;
  projectId?: string;
}): ManagedRuntime {
  return {
    commandLabel: "",
    cwd: options.cwd,
    id: options.id,
    intentionalStop: false,
    kind: options.kind,
    label: options.label,
    lastError: null,
    logLines: [],
    port: options.port,
    process: null,
    projectId: options.projectId ?? null,
    startedAt: null,
    status: "stopped",
    url: createUrl(options.port)
  };
}

function createStoppedGameRuntime(project: StoredProject): ManagedRuntime {
  return createManagedRuntime({
    cwd: project.projectRoot,
    id: project.id,
    kind: "game",
    label: project.name,
    port: project.preferredPort ?? GAME_PORT_START,
    projectId: project.id
  });
}

function toRuntimeSnapshot(runtime: ManagedRuntime, registration?: DevSyncGameRegistration): RuntimeSnapshot {
  return {
    commandLabel: runtime.commandLabel,
    currentSceneId: registration?.currentCommand?.sceneId ?? null,
    cwd: runtime.cwd,
    lastError: runtime.lastError,
    logLines: runtime.logLines,
    port: runtime.port,
    sceneIds: registration?.sceneIds ?? [],
    startedAt: runtime.startedAt,
    status: runtime.status,
    url: runtime.url
  };
}

function resolveViewport(options: {
  activeView: ViewId;
  editors: EditorSnapshot[];
  selectedProject: ProjectSnapshot | null;
}): OrchestratorSnapshot["viewport"] {
  if (options.activeView === "trident") {
    const editor = options.editors.find((entry) => entry.id === "trident");
    return {
      label: "Trident",
      subtitle: editor?.status === "running" ? "World editing" : "Preview server unavailable",
      url: editor?.status === "running" ? editor.url : null,
      view: "trident"
    };
  }

  if (options.activeView === "animation-studio") {
    const editor = options.editors.find((entry) => entry.id === "animation-studio");
    return {
      label: "Animation Studio",
      subtitle: editor?.status === "running" ? "Animation authoring" : "Preview server unavailable",
      url: editor?.status === "running" ? editor.url : null,
      view: "animation-studio"
    };
  }

  return {
    label: options.selectedProject?.name ?? "No Game Selected",
    subtitle:
      options.selectedProject?.runtime.status === "running"
        ? "Game dev server"
        : "Start the selected game to use the engine viewport.",
    url: options.selectedProject?.runtime.status === "running" ? options.selectedProject.runtime.url : null,
    view: "game"
  };
}

async function readProjectMetadata(projectRootInput: string): Promise<ProjectMetadata> {
  const projectRoot = resolvePath(projectRootInput);
  const packageJsonPath = join(projectRoot, "package.json");
  const source = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(source) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    name?: string;
    packageManager?: string;
    scripts?: Record<string, string>;
  };

  if (!parsed.scripts?.dev) {
    throw new Error(`Missing a dev script in ${packageJsonPath}.`);
  }

  return {
    hasGameDevSupport: Boolean(parsed.dependencies?.["@ggez/game-dev"] || parsed.devDependencies?.["@ggez/game-dev"]),
    name: parsed.name?.trim() || basename(projectRoot),
    packageManager: await inferPackageManager(projectRoot, parsed.packageManager),
    projectRoot
  };
}

async function inferPackageManager(projectRoot: string, packageManagerField?: string): Promise<PackageManager> {
  if (packageManagerField?.startsWith("bun@")) {
    return "bun";
  }

  if (packageManagerField?.startsWith("pnpm@")) {
    return "pnpm";
  }

  if (packageManagerField?.startsWith("yarn@")) {
    return "yarn";
  }

  if (packageManagerField?.startsWith("npm@")) {
    return "npm";
  }

  const checks: Array<{ file: string; manager: PackageManager }> = [
    { file: "bun.lock", manager: "bun" },
    { file: "bun.lockb", manager: "bun" },
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" }
  ];

  for (const check of checks) {
    try {
      await access(join(projectRoot, check.file));
      return check.manager;
    } catch {
      continue;
    }
  }

  return "npm";
}

function createGameCommand(packageManager: PackageManager, port: number, cwd: string): RuntimeCommand {
  if (packageManager === "bun") {
    return {
      args: ["run", "dev", "--", "--host", HOST, "--port", String(port), "--strictPort"],
      command: "bun",
      cwd
    };
  }

  if (packageManager === "pnpm") {
    return {
      args: ["run", "dev", "--", "--host", HOST, "--port", String(port), "--strictPort"],
      command: "pnpm",
      cwd
    };
  }

  if (packageManager === "yarn") {
    return {
      args: ["run", "dev", "--host", HOST, "--port", String(port), "--strictPort"],
      command: "yarn",
      cwd
    };
  }

  return {
    args: ["run", "dev", "--", "--host", HOST, "--port", String(port), "--strictPort"],
    command: "npm",
    cwd
  };
}

async function runCommand(command: RuntimeCommand, options: { label: string }) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: createChildEnvironment(),
      stdio: "pipe"
    });

    const output: string[] = [];
    const capture = (chunk: string | Buffer) => {
      output.push(chunk.toString());
    };

    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("error", (error) => {
      rejectPromise(new Error(`Failed to ${options.label}: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(output.join("").trim() || `${options.label} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function appendLog(runtime: ManagedRuntime, message: string) {
  const line = message.trim();

  if (!line) {
    return;
  }

  runtime.logLines = [...runtime.logLines, line].slice(-LOG_LIMIT);
}

function createChildEnvironment() {
  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.local/bin`];
  return {
    ...process.env,
    PATH: [process.env.PATH, ...extraPaths].filter(Boolean).join(":")
  };
}

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });

      if (response.ok || response.status === 404) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    lastError instanceof Error ? lastError.message : `Timed out waiting for ${url} to accept connections.`
  );
}

async function findAvailablePort(startPort: number) {
  let port = startPort;

  while (!(await isPortFree(port))) {
    port += 1;
  }

  return port;
}

function isPortFree(port: number) {
  return new Promise<boolean>((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.on("error", () => {
      resolvePromise(false);
    });
    server.listen(port, HOST, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

function waitForExit(child: ChildProcess) {
  return new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null) {
      resolvePromise();
      return;
    }

    child.once("exit", () => resolvePromise());
  });
}

function sleep(durationMs: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
}

function createUrl(port: number) {
  return `http://${HOST}:${port}`;
}

function formatCommand(command: RuntimeCommand) {
  return [command.command, ...command.args].join(" ");
}

function resolvePath(root: string, childPath?: string) {
  const expanded = root.trim().startsWith("~/")
    ? join(homedir(), root.trim().slice(2))
    : root.trim() === "~"
      ? homedir()
      : root.trim();

  return childPath ? resolve(expanded || ".", childPath) : resolve(expanded || ".");
}

function slugifyDirectoryName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "new-game";
}

function slugifyPackageName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "new-game";
}
