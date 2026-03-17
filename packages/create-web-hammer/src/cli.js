#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const TEMPLATE_ROOT = resolve(import.meta.dirname, "../template");

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Scaffold failed."}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.projectDir) {
    printUsage();
    return;
  }

  const projectDir = resolve(process.cwd(), options.projectDir);
  const projectName = options.projectName ?? deriveProjectName(options.projectDir);
  await ensureTargetDirectory(projectDir, options.force);
  await scaffoldVanillaThreeStarter(projectDir, projectName, options.packageManager);

  process.stdout.write(
    [
      "",
      `Created ${projectName} in ${projectDir}`,
      "",
      "Next steps:",
      `  cd ${options.projectDir}`,
      `  ${options.packageManager} install`,
      `  ${options.packageManager} run dev`,
      "",
      "Starter docs:",
      "  README.md",
      ""
    ].join("\n")
  );
}

async function scaffoldVanillaThreeStarter(projectDir, projectName, packageManager) {
  const templateDir = join(TEMPLATE_ROOT, "vanilla-three");
  await cp(templateDir, projectDir, { recursive: true });
  await replaceTemplateTokens(projectDir, {
    PACKAGE_MANAGER: packageManager,
    PROJECT_NAME: projectName
  });
}

async function replaceTemplateTokens(
  rootDir,
  replacements
) {
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      await replaceTemplateTokens(absolutePath, replacements);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (shouldCopyBinary(entry.name)) {
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

async function ensureTargetDirectory(projectDir, force) {
  try {
    const existing = await stat(projectDir);

    if (!existing.isDirectory()) {
      throw new Error(`Target path exists and is not a directory: ${projectDir}`);
    }

    const entries = await readdir(projectDir);

    if (entries.length > 0 && !force) {
      throw new Error(`Target directory is not empty: ${projectDir}. Use --force to continue.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    await mkdir(projectDir, { recursive: true });
  }
}

function parseArgs(argv) {
  const options = {
    force: false,
    help: false,
    packageManager: "bun",
    template: "vanilla-three"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--") && !options.projectDir) {
      options.projectDir = value;
      continue;
    }

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--force") {
      options.force = true;
      continue;
    }

    if (value === "--name") {
      options.projectName = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--template") {
      const next = argv[index + 1];

      if (next !== "vanilla-three") {
        throw new Error(`Unsupported template: ${next}`);
      }

      options.template = next;
      index += 1;
      continue;
    }

    if (value === "--package-manager") {
      const next = argv[index + 1];

      if (next !== "bun" && next !== "npm" && next !== "pnpm") {
        throw new Error(`Unsupported package manager: ${next}`);
      }

      options.packageManager = next;
      index += 1;
    }
  }

  return options;
}

function deriveProjectName(projectDir) {
  const normalized = projectDir.replace(/\/+$/g, "");
  const name = normalized.split("/").at(-1) ?? "web-hammer-starter";
  return sanitizePackageName(name);
}

function sanitizePackageName(name) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "web-hammer-starter";
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  create-web-hammer <project-dir> [--template vanilla-three] [--package-manager bun|npm|pnpm] [--force]",
      "",
      "Examples:",
      "  bunx create-web-hammer my-game",
      "  bunx create-web-hammer my-game --package-manager npm",
      "  bunx create-web-hammer my-game --force",
      ""
    ].join("\n")
  );
}
