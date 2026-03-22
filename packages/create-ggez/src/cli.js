#!/usr/bin/env node
import { cancel, confirm, intro, isCancel, note, outro, select, spinner, text } from "@clack/prompts";
import pico from "picocolors";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const TEMPLATE_ROOT = resolve(import.meta.dirname, "../template");
const DEFAULT_PROJECT_DIR = "my-ggez-app";
const DEFAULT_TEMPLATE = "vanilla-three";
const TEMPLATE_DEFINITIONS = {
  "vanilla-three": {
    copyFrom: "vanilla-three",
    description: "Vite + TypeScript + Three.js + Web Hammer runtime starter.",
    label: "Vanilla Three"
  }
};
const PACKAGE_MANAGERS = {
  bun: {
    installArgs: ["install"],
    runDevCommand: "bun run dev",
    runInstallCommand: "bun install"
  },
  npm: {
    installArgs: ["install"],
    runDevCommand: "npm run dev",
    runInstallCommand: "npm install"
  },
  pnpm: {
    installArgs: ["install"],
    runDevCommand: "pnpm dev",
    runInstallCommand: "pnpm install"
  },
  yarn: {
    installArgs: ["install"],
    runDevCommand: "yarn dev",
    runInstallCommand: "yarn install"
  }
};

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Scaffold failed."}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (options.version) {
    process.stdout.write(`${await readPackageVersion()}\n`);
    return;
  }

  const interactive = !options.yes && process.stdout.isTTY && process.stdin.isTTY;

  if (interactive) {
    intro(pico.inverse(" create-ggez "));
  }

  const context = await resolveScaffoldContext(options, interactive);
  const overwrite = await prepareTargetDirectory(context, interactive);

  if (interactive) {
    note(
      [
        `${pico.bold("Project")}: ${context.packageName}`,
        `${pico.bold("Directory")}: ${context.projectRoot}`,
        `${pico.bold("Template")}: ${TEMPLATE_DEFINITIONS[context.template].label}`,
        `${pico.bold("Package manager")}: ${context.packageManager}`,
        `${pico.bold("Install dependencies")}: ${context.installDependencies ? "yes" : "no"}`,
        `${pico.bold("Initialize git")}: ${context.initializeGit ? "yes" : "no"}`,
        `${pico.bold("Overwrite existing files")}: ${overwrite ? "yes" : "no"}`
      ].join("\n"),
      "Scaffold plan"
    );
  }

  await scaffoldProject(context);
  await maybeInitializeGit(context, interactive);
  await maybeInstallDependencies(context, interactive);
  printNextSteps(context, interactive);
}

async function resolveScaffoldContext(options, interactive) {
  const template = await resolveTemplate(options.template, interactive);
  const packageManager = resolvePackageManager(options.packageManager);
  let projectDirInput = options.projectDir;

  if (!projectDirInput) {
    if (!interactive) {
      projectDirInput = DEFAULT_PROJECT_DIR;
    } else {
      projectDirInput = await promptText({
        defaultValue: DEFAULT_PROJECT_DIR,
        message: "Where should the project be created?",
        placeholder: DEFAULT_PROJECT_DIR,
        validate: (value) => (value.trim().length === 0 ? "Project directory is required." : undefined)
      });
    }
  }

  const normalizedProjectDir = normalizeProjectDir(projectDirInput);
  const projectRoot = resolve(process.cwd(), normalizedProjectDir);
  const defaultPackageName = deriveProjectName(normalizedProjectDir, projectRoot);
  let packageName = options.projectName ?? defaultPackageName;

  if (!isValidPackageName(packageName)) {
    if (!interactive) {
      throw new Error(
        `Invalid package name: ${packageName}. Try ${formatSuggestedPackageName(packageName)} instead.`
      );
    }

    packageName = await promptText({
      defaultValue: formatSuggestedPackageName(packageName),
      message: "Package name",
      placeholder: defaultPackageName,
      validate: (value) => (isValidPackageName(value) ? undefined : "Package name must be lowercase and npm-safe.")
    });
  }

  const installDependencies = await resolveBooleanOption({
    defaultValue: interactive,
    explicitValue: options.install,
    interactive,
    message: `Install dependencies with ${packageManager}?`
  });
  const initializeGit = await resolveBooleanOption({
    defaultValue: interactive,
    explicitValue: options.git,
    interactive,
    message: "Initialize a git repository?"
  });

  return {
    force: options.force,
    initializeGit,
    installDependencies,
    packageManager,
    packageName,
    projectDir: normalizedProjectDir,
    projectRoot,
    template
  };
}

async function resolveTemplate(explicitTemplate, interactive) {
  if (explicitTemplate) {
    if (!(explicitTemplate in TEMPLATE_DEFINITIONS)) {
      throw new Error(`Unsupported template: ${explicitTemplate}`);
    }

    return explicitTemplate;
  }

  const templateIds = Object.keys(TEMPLATE_DEFINITIONS);

  if (templateIds.length === 1 || !interactive) {
    return DEFAULT_TEMPLATE;
  }

  return promptSelect({
    initialValue: DEFAULT_TEMPLATE,
    message: "Select a starter template",
    options: templateIds.map((templateId) => ({
      label: TEMPLATE_DEFINITIONS[templateId].label,
      hint: TEMPLATE_DEFINITIONS[templateId].description,
      value: templateId
    }))
  });
}

async function resolveBooleanOption({ defaultValue, explicitValue, interactive, message }) {
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  if (!interactive) {
    return defaultValue;
  }

  return promptConfirm({ initialValue: defaultValue, message });
}

async function prepareTargetDirectory(context, interactive) {
  try {
    const existing = await stat(context.projectRoot);

    if (!existing.isDirectory()) {
      throw new Error(`Target path exists and is not a directory: ${context.projectRoot}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    await mkdir(context.projectRoot, { recursive: true });
    return false;
  }

  const entries = await getDirectoryEntries(context.projectRoot);

  if (entries.length === 0) {
    return false;
  }

  if (!context.force) {
    if (!interactive) {
      throw new Error(
        `Target directory is not empty: ${context.projectRoot}. Use --force to overwrite existing files.`
      );
    }

    const overwrite = await promptConfirm({
      initialValue: false,
      message: `Remove existing files in ${context.projectDir === "." ? "the current directory" : context.projectDir}?`
    });

    if (!overwrite) {
      cancel("Scaffold canceled.");
      process.exit(0);
    }
  }

  await emptyDirectory(context.projectRoot);
  return true;
}

async function scaffoldProject(context) {
  const template = TEMPLATE_DEFINITIONS[context.template];
  const templateDir = join(TEMPLATE_ROOT, template.copyFrom);

  await cp(templateDir, context.projectRoot, { recursive: true });
  await replaceTemplateTokens(context.projectRoot, {
    PACKAGE_MANAGER: context.packageManager,
    PROJECT_NAME: context.packageName
  });
}

async function maybeInitializeGit(context, interactive) {
  if (!context.initializeGit || (await hasGitDirectory(context.projectRoot))) {
    return;
  }

  const task = interactive ? spinner() : null;
  task?.start("Initializing git repository");

  try {
    await runCommand("git", ["init"], context.projectRoot);
    task?.stop("Initialized git repository");
  } catch (error) {
    task?.stop("Skipped git initialization");

    if (interactive) {
      note(String(error instanceof Error ? error.message : error), "Git init skipped");
      return;
    }

    throw error;
  }
}

async function maybeInstallDependencies(context, interactive) {
  if (!context.installDependencies) {
    return;
  }

  const manager = PACKAGE_MANAGERS[context.packageManager];
  const task = interactive ? spinner() : null;
  task?.start(`Installing dependencies with ${context.packageManager}`);

  try {
    await runCommand(context.packageManager, manager.installArgs, context.projectRoot);
    task?.stop("Installed dependencies");
  } catch (error) {
    task?.stop("Dependency install failed");

    if (interactive) {
      note(String(error instanceof Error ? error.message : error), "Install failed");
      return;
    }

    throw error;
  }
}

async function replaceTemplateTokens(rootDir, replacements) {
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      await replaceTemplateTokens(absolutePath, replacements);
      continue;
    }

    if (!entry.isFile() || shouldCopyBinary(entry.name)) {
      continue;
    }

    const source = await readFile(absolutePath, "utf8");
    const replaced = Object.entries(replacements).reduce(
      (content, [key, value]) => content.replaceAll(`__${key}__`, value),
      source
    );

    if (replaced !== source) {
      await writeFile(absolutePath, replaced, "utf8");
    }
  }
}

function shouldCopyBinary(filename) {
  return /\.(png|jpg|jpeg|gif|webp|glb|zip|ico)$/i.test(filename);
}

function parseArgs(argv) {
  const options = {
    force: false,
    git: undefined,
    help: false,
    install: undefined,
    packageManager: undefined,
    projectDir: undefined,
    projectName: undefined,
    template: undefined,
    version: false,
    yes: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("-") && !options.projectDir) {
      options.projectDir = value;
      continue;
    }

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--version" || value === "-v") {
      options.version = true;
      continue;
    }

    if (value === "--yes" || value === "-y") {
      options.yes = true;
      continue;
    }

    if (value === "--force") {
      options.force = true;
      continue;
    }

    if (value === "--name") {
      options.projectName = readFlagValue(argv, index, value);
      index += 1;
      continue;
    }

    if (value === "--template") {
      options.template = readFlagValue(argv, index, value);
      index += 1;
      continue;
    }

    if (value === "--package-manager") {
      const next = readFlagValue(argv, index, value);

      if (!(next in PACKAGE_MANAGERS)) {
        throw new Error(`Unsupported package manager: ${next}`);
      }

      options.packageManager = next;
      index += 1;
      continue;
    }

    if (value === "--install") {
      options.install = true;
      continue;
    }

    if (value === "--no-install") {
      options.install = false;
      continue;
    }

    if (value === "--git") {
      options.git = true;
      continue;
    }

    if (value === "--no-git") {
      options.git = false;
      continue;
    }

    throw new Error(`Unknown option: ${value}`);
  }

  return options;
}

function readFlagValue(argv, index, flagName) {
  const value = argv[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flagName}`);
  }

  return value;
}

function resolvePackageManager(explicitPackageManager) {
  if (explicitPackageManager) {
    return explicitPackageManager;
  }

  const userAgent = process.env.npm_config_user_agent ?? "";

  for (const packageManager of Object.keys(PACKAGE_MANAGERS)) {
    if (userAgent.startsWith(`${packageManager}/`)) {
      return packageManager;
    }
  }

  return "npm";
}

function normalizeProjectDir(projectDir) {
  const normalized = projectDir.trim();
  return normalized.length === 0 ? DEFAULT_PROJECT_DIR : normalized;
}

function deriveProjectName(projectDir, projectRoot) {
  if (projectDir === ".") {
    return formatSuggestedPackageName(basename(projectRoot));
  }

  const normalized = projectDir.replace(/\/+$/g, "");
  const name = normalized.split("/").at(-1) ?? DEFAULT_PROJECT_DIR;
  return formatSuggestedPackageName(name);
}

function formatSuggestedPackageName(name) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]+/g, "")
    .replace(/[^a-z0-9~._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_PROJECT_DIR;
}

function isValidPackageName(name) {
  return /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name);
}

async function getDirectoryEntries(projectDir) {
  const entries = await readdir(projectDir);
  return entries.filter((entry) => entry !== ".DS_Store");
}

async function emptyDirectory(projectDir) {
  const entries = await readdir(projectDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git")
      .map((entry) => rm(join(projectDir, entry.name), { force: true, recursive: true }))
  );
}

async function hasGitDirectory(projectDir) {
  try {
    const gitDirectory = await stat(join(projectDir, ".git"));
    return gitDirectory.isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function runCommand(command, args, cwd) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: false
    });

    child.on("error", (error) => {
      rejectPromise(new Error(`Failed to run ${command}: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function printNextSteps(context, interactive) {
  const manager = PACKAGE_MANAGERS[context.packageManager];
  const relativeProjectDir = context.projectDir === "." ? null : relative(process.cwd(), context.projectRoot) || context.projectDir;
  const commands = [];

  if (relativeProjectDir) {
    commands.push(`cd ${relativeProjectDir}`);
  }

  if (!context.installDependencies) {
    commands.push(manager.runInstallCommand);
  }

  commands.push(manager.runDevCommand);

  const lines = [
    `${pico.green("Success")}: created ${pico.bold(context.packageName)} in ${context.projectRoot}`,
    "",
    "Next steps:",
    ...commands.map((command) => `  ${command}`),
    "",
    "Starter docs:",
    "  README.md",
    ""
  ];

  if (interactive) {
    outro(lines.join("\n"));
    return;
  }

  process.stdout.write(lines.join("\n"));
}

async function readPackageVersion() {
  const packageJsonPath = resolve(import.meta.dirname, "../package.json");
  const source = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(source);
  return parsed.version ?? "0.0.0";
}

async function promptText({ defaultValue, message, placeholder, validate }) {
  const response = await text({ defaultValue, message, placeholder, validate });
  return unwrapPromptValue(response);
}

async function promptSelect({ initialValue, message, options }) {
  const response = await select({ initialValue, message, options });
  return unwrapPromptValue(response);
}

async function promptConfirm({ initialValue, message }) {
  const response = await confirm({ initialValue, message });
  return unwrapPromptValue(response);
}

function unwrapPromptValue(value) {
  if (isCancel(value)) {
    cancel("Scaffold canceled.");
    process.exit(0);
  }

  return value;
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  create-ggez [project-dir] [options]",
      "",
      "Options:",
      "  -h, --help                       Show this help message",
      "  -v, --version                    Print the CLI version",
      "  -y, --yes                        Skip prompts and use defaults",
      "      --name <package-name>        Override the generated package name",
      "      --template <template>        Starter template to use",
      "      --package-manager <pm>       bun | npm | pnpm | yarn",
      "      --install / --no-install     Install dependencies after scaffolding",
      "      --git / --no-git             Initialize a git repository",
      "      --force                      Empty an existing target directory before scaffolding",
      "",
      "Templates:",
      ...Object.entries(TEMPLATE_DEFINITIONS).map(
        ([templateId, template]) => `  ${templateId.padEnd(20, " ")} ${template.description}`
      ),
      "",
      "Examples:",
      "  bunx create-ggez",
      "  bunx create-ggez my-game",
      "  npm create ggez@latest my-game -- --package-manager npm",
      "  pnpm create ggez my-game --template vanilla-three --no-install",
      "  bunx create-ggez . --name my-studio-game --force",
      ""
    ].join("\n")
  );
}
