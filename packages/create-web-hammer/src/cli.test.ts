import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("create-web-hammer cli", () => {
  test("scaffolds a vanilla three starter project", async () => {
    const targetDir = join("/tmp", `web-hammer-starter-${Date.now()}`);
    await mkdir(targetDir, { recursive: true });

    const cliPath = join(process.cwd(), "packages/create-web-hammer/src/cli.js");

    await execFileAsync(process.execPath, [cliPath, join(targetDir, "app"), "--package-manager", "bun"]);

    const packageJson = await readFile(join(targetDir, "app/package.json"), "utf8");
    const mainFile = await readFile(join(targetDir, "app/src/main.ts"), "utf8");
    const sceneModule = await readFile(join(targetDir, "app/src/scenes/main/index.ts"), "utf8");

    expect(packageJson).toContain("\"name\": \"app\"");
    expect(packageJson).toContain("@web-hammer/three-runtime");
    expect(mainFile).toContain("createGameApp");
    expect(sceneModule).toContain("createBundledRuntimeSceneSource");

    await rm(targetDir, { force: true, recursive: true });
  });
});
