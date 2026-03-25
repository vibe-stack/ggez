import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFile, writeFile, readdir, rm, rename, copyFile, stat, mkdir } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { spawn } from "node:child_process";

// ── Project State ───────────────────────────────────────────────────

let currentProjectPath: string | null = null;

export function getCurrentProjectPath(): string | null {
  return currentProjectPath;
}

export function setCurrentProjectPath(projectPath: string | null): void {
  currentProjectPath = projectPath;
}

// ── Types ───────────────────────────────────────────────────────────

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path: string;
}

export interface DirTreeEntry extends DirEntry {
  children?: DirTreeEntry[];
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  mtime: number;
  ctime: number;
}

// ── IPC Registration ────────────────────────────────────────────────

export function registerIpcHandlers(): void {
  // ── File System ──

  ipcMain.handle("fs:readFile", async (_event, filePath: string, encoding?: string) => {
    const data = await readFile(filePath);
    if (encoding === "utf8" || encoding === "utf-8") {
      return data.toString("utf-8");
    }
    // Return as base64 for binary files (safe for IPC serialization)
    return { base64: data.toString("base64"), byteLength: data.byteLength };
  });

  ipcMain.handle("fs:writeFile", async (_event, filePath: string, data: string | { base64: string }) => {
    if (typeof data === "string") {
      await writeFile(filePath, data, "utf-8");
    } else {
      await writeFile(filePath, Buffer.from(data.base64, "base64"));
    }
  });

  ipcMain.handle("fs:readDir", async (_event, dirPath: string): Promise<DirEntry[]> => {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.name !== ".DS_Store")
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        path: join(dirPath, e.name),
      }))
      .sort((a, b) => {
        // Directories first, then alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
  });

  ipcMain.handle("fs:readDirTree", async (_event, dirPath: string): Promise<DirTreeEntry[]> => {
    return readDirTreeRecursive(dirPath);
  });

  ipcMain.handle("fs:deleteFile", async (_event, targetPath: string) => {
    await rm(targetPath, { recursive: true, force: true });
  });

  ipcMain.handle("fs:rename", async (_event, oldPath: string, newPath: string) => {
    await rename(oldPath, newPath);
  });

  ipcMain.handle("fs:copyFile", async (_event, src: string, dest: string) => {
    await copyFile(src, dest);
  });

  ipcMain.handle("fs:stat", async (_event, filePath: string): Promise<FileStat> => {
    const s = await stat(filePath);
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      mtime: s.mtimeMs,
      ctime: s.ctimeMs,
    };
  });

  ipcMain.handle("fs:mkdir", async (_event, dirPath: string) => {
    await mkdir(dirPath, { recursive: true });
  });

  // ── Project Management ──

  ipcMain.handle("project:open", async (event) => {
    console.log("[IPC] project:open called");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      console.error("[IPC] project:open - No window found!");
      return null;
    }

    try {
      console.log("[IPC] project:open - showing dialog...");
      const result = await dialog.showOpenDialog(win, {
        title: "Open GGEZ Project",
        properties: ["openDirectory"],
        buttonLabel: "Open Project",
      });
      console.log("[IPC] project:open - dialog result:", result);

      if (result.canceled || result.filePaths.length === 0) {
        console.log("[IPC] project:open - dialog canceled");
        return null;
      }

      const projectPath = result.filePaths[0];
      console.log("[IPC] project:open - chosen path:", projectPath);
      currentProjectPath = projectPath;
      win.webContents.send("project:opened", projectPath);
      win.setTitle(`GGEZ — ${projectPath.split(/[\\/]/).pop()}`);
      return projectPath;
    } catch (err) {
      console.error("[IPC] project:open - ERROR:", err);
      return null;
    }
  });

  ipcMain.handle("project:create", async (event) => {
    console.log("[IPC] project:create called");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      console.error("[IPC] project:create - No window found!");
      return null;
    }

    try {
      console.log("[IPC] project:create - showing dialog...");
      const result = await dialog.showOpenDialog(win, {
        title: "Choose Folder for New GGEZ Project",
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "Create Project Here",
      });
      console.log("[IPC] project:create - dialog result:", result);

      if (result.canceled || result.filePaths.length === 0) {
        console.log("[IPC] project:create - dialog canceled");
        return null;
      }

    const parentDir = result.filePaths[0];

    // Run create-ggez in non-interactive mode
    // __dirname is .../apps/electron-shell/src, so we need ../../../packages
    const createGgezPath = resolve(__dirname, "../../../packages/create-ggez/src/cli.js");

    return new Promise<string | null>((resolvePromise) => {
      const child = spawn(
        "node",
        [createGgezPath, parentDir, "--yes", "--package-manager", "bun", "--no-install"],
        {
          cwd: parentDir,
          stdio: "pipe",
          env: process.env,
        }
      );

      let output = "";
      child.stdout?.on("data", (data) => {
        output += data.toString();
      });
      child.stderr?.on("data", (data) => {
        output += data.toString();
      });

      child.on("exit", (code) => {
        if (code === 0) {
          currentProjectPath = parentDir;
          win.webContents.send("project:opened", parentDir);
          win.setTitle(`GGEZ — ${parentDir.split(/[\\/]/).pop()}`);
          resolvePromise(parentDir);
        } else {
          console.error("[create-ggez] Failed:", output);
          resolvePromise(null);
        }
      });

      child.on("error", (err) => {
        console.error("[IPC] [create-ggez] Spawn error:", err);
        resolvePromise(null);
      });
    });
    } catch (err) {
      console.error("[IPC] project:create - ERROR:", err);
      return null;
    }
  });

  ipcMain.handle("project:getCurrent", () => {
    return currentProjectPath;
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

async function readDirTreeRecursive(dirPath: string): Promise<DirTreeEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const result: DirTreeEntry[] = [];

  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const entryPath = join(dirPath, entry.name);
    const node: DirTreeEntry = {
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      path: entryPath,
    };

    if (entry.isDirectory()) {
      node.children = await readDirTreeRecursive(entryPath);
    }

    result.push(node);
  }

  // Sort: directories first, then alphabetically
  result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}
