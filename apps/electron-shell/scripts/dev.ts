/**
 * Electron Dev Script
 *
 * 1. Builds main.ts and preload.ts with bun
 * 2. Starts the Vite dev server for apps/editor
 * 3. Waits for Vite to be ready on localhost:5173
 * 4. Launches Electron pointing to dist/main.js
 * 5. Cleans up all processes on exit
 */

import { spawn, type Subprocess } from "bun";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");
const MONOREPO_ROOT = path.resolve(ROOT, "../..");
const EDITOR_DIR = path.resolve(MONOREPO_ROOT, "apps/editor");
const VITE_URL = "http://localhost:5173";
const VITE_POLL_INTERVAL_MS = 500;
const VITE_TIMEOUT_MS = 30_000;

const children: Subprocess[] = [];

function cleanup() {
  console.log("\n🧹 Cleaning up processes...");
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // already dead
    }
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// ── Step 1: Build main + preload ────────────────────────────────────

console.log("🔨 Building Electron main & preload...");

const buildMain = spawn({
  cmd: ["bun", "build", "src/main.ts", "--outdir", "dist", "--target", "node", "--format", "cjs", "--external", "electron"],
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});
await buildMain.exited;

const buildPreload = spawn({
  cmd: ["bun", "build", "src/preload.ts", "--outdir", "dist", "--target", "node", "--format", "cjs", "--external", "electron"],
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});
await buildPreload.exited;

console.log("✅ Electron build complete.\n");

// ── Step 2: Start Vite dev server ───────────────────────────────────

console.log("🚀 Starting Vite dev server for apps/editor...");

const vite = spawn({
  cmd: ["bun", "run", "dev"],
  cwd: EDITOR_DIR,
  stdout: "inherit",
  stderr: "inherit",
});
children.push(vite);

// ── Step 3: Wait for Vite to be ready ───────────────────────────────

console.log(`⏳ Waiting for Vite on ${VITE_URL}...`);

const startTime = Date.now();

async function waitForVite(): Promise<void> {
  while (Date.now() - startTime < VITE_TIMEOUT_MS) {
    try {
      const response = await fetch(VITE_URL);
      if (response.ok) {
        console.log("✅ Vite is ready!\n");
        return;
      }
    } catch {
      // Not ready yet
    }
    await Bun.sleep(VITE_POLL_INTERVAL_MS);
  }
  throw new Error(`Vite did not start within ${VITE_TIMEOUT_MS / 1000}s`);
}

await waitForVite();

// ── Step 4: Launch Electron ─────────────────────────────────────────

console.log("⚡ Launching Electron...");

// Resolve the electron binary path
const electronBin = path.resolve(ROOT, "node_modules/.bin/electron");

const electron = spawn({
  cmd: [electronBin, path.join(ROOT, "dist/main.js")],
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
});
children.push(electron);

// When Electron exits, kill everything
const exitCode = await electron.exited;
console.log(`\nElectron exited with code ${exitCode}`);
cleanup();
