import { describe, expect, test } from "bun:test";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));

describe("create-ggez cli", () => {
  test("scaffolds a starter project with detected package manager commands", async () => {
    const targetDir = join("/tmp", `web-hammer-starter-${Date.now()}`);
    await mkdir(targetDir, { recursive: true });

    await execFileAsync(
      process.execPath,
      [cliPath, join(targetDir, "app"), "--yes", "--no-install", "--no-git"],
      {
        env: {
          ...process.env,
          npm_config_user_agent: "npm/10.8.0 node/v22.0.0 darwin arm64"
        }
      }
    );

    const packageJson = await readFile(join(targetDir, "app/package.json"), "utf8");
    const mainFile = await readFile(join(targetDir, "app/src/main.ts"), "utf8");
    const sceneModule = await readFile(join(targetDir, "app/src/scenes/main/index.ts"), "utf8");
    const sceneDirectories = await readdir(join(targetDir, "app/src/scenes"));
    const readme = await readFile(join(targetDir, "app/README.md"), "utf8");

    expect(packageJson).toContain("\"name\": \"app\"");
    expect(packageJson).toContain("@ggez/three-runtime");
    expect(packageJson).toContain("@ggez/runtime-physics-crashcat");
    expect(packageJson).not.toContain("@ggez/runtime-physics-rapier");
    expect(mainFile).toContain("createGameApp");
    expect(sceneModule).toContain("createColocatedRuntimeSceneSource");
    expect(sceneDirectories.includes("arena")).toEqual(false);
    expect(readme).toContain("npm install");
    expect(readme).toContain("npm run dev");

    await rm(targetDir, { force: true, recursive: true });
  });

  test("scaffolds into the current directory when invoked with dot", async () => {
    const targetDir = join("/tmp", `web-hammer-starter-current-${Date.now()}`);
    await mkdir(targetDir, { recursive: true });

    await execFileAsync(
      process.execPath,
      [cliPath, ".", "--name", "current-dir-app", "--yes", "--no-install", "--no-git"],
      {
        cwd: targetDir,
        env: {
          ...process.env,
          npm_config_user_agent: "bun/1.3.0"
        }
      }
    );

    const packageJson = await readFile(join(targetDir, "package.json"), "utf8");
    const readme = await readFile(join(targetDir, "README.md"), "utf8");

    expect(packageJson).toContain("\"name\": \"current-dir-app\"");
    expect(readme).toContain("bun install");
    expect(readme).toContain("bun run dev");

    await rm(targetDir, { force: true, recursive: true });
  });

  test("refuses to scaffold into a non-empty directory without force", async () => {
    const targetDir = join("/tmp", `web-hammer-starter-refuse-${Date.now()}`);
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, "keep.txt"), "do not overwrite", "utf8");

    let stderr = "";

    try {
      await execFileAsync(process.execPath, [cliPath, targetDir, "--yes", "--no-install", "--no-git"]);
    } catch (error) {
      stderr = String(error.stderr ?? "");
    }

    expect(stderr).toContain("Target directory is not empty");

    await rm(targetDir, { force: true, recursive: true });
  });

  test("overwrites an existing directory when force is enabled", async () => {
    const targetDir = join("/tmp", `web-hammer-starter-force-${Date.now()}`);
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, "stale.txt"), "old", "utf8");

    await execFileAsync(
      process.execPath,
      [cliPath, targetDir, "--yes", "--force", "--no-install", "--no-git"],
      {
        env: {
          ...process.env,
          npm_config_user_agent: "pnpm/10.0.0"
        }
      }
    );

    const packageJson = await readFile(join(targetDir, "package.json"), "utf8");

    expect(packageJson).toContain("\"name\": \"web-hammer-starter-force");

    await rm(targetDir, { force: true, recursive: true });
  });
});
