import { contextBridge, ipcRenderer } from "electron";

/**
 * Electron Preload Script
 *
 * Exposes a safe bridge to the renderer process via window.electronAPI.
 * Provides file system operations, project management, and menu event listeners.
 */

const electronAPI = {
  // ── Identity ──────────────────────────────────────────────────────

  /** True when running inside Electron */
  isElectron: true as const,

  /** Platform identifier (win32, darwin, linux) */
  platform: process.platform,

  // ── Menu Events from Main Process ─────────────────────────────────

  onSave: (callback: () => void) => {
    ipcRenderer.on("menu:save", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:save"); };
  },

  onUndo: (callback: () => void) => {
    ipcRenderer.on("menu:undo", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:undo"); };
  },

  onRedo: (callback: () => void) => {
    ipcRenderer.on("menu:redo", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:redo"); };
  },

  onCreateProject: (callback: () => void) => {
    ipcRenderer.on("menu:createProject", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:createProject"); };
  },

  onOpenProject: (callback: () => void) => {
    ipcRenderer.on("menu:openProject", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:openProject"); };
  },

  // ── File System ───────────────────────────────────────────────────

  /** Read a file. Pass encoding='utf8' for text, omit for binary (returns base64). */
  readFile: (filePath: string, encoding?: string) =>
    ipcRenderer.invoke("fs:readFile", filePath, encoding),

  /** Write a file. Pass string for text, or { base64: string } for binary. */
  writeFile: (filePath: string, data: string | { base64: string }) =>
    ipcRenderer.invoke("fs:writeFile", filePath, data),

  /** Read directory contents (flat list). */
  readDir: (dirPath: string) =>
    ipcRenderer.invoke("fs:readDir", dirPath),

  /** Read directory tree recursively (nested). */
  readDirTree: (dirPath: string) =>
    ipcRenderer.invoke("fs:readDirTree", dirPath),

  /** Delete a file or directory recursively. */
  deleteFile: (targetPath: string) =>
    ipcRenderer.invoke("fs:deleteFile", targetPath),

  /** Rename or move a file/directory. */
  rename: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke("fs:rename", oldPath, newPath),

  /** Copy a file. */
  copyFile: (src: string, dest: string) =>
    ipcRenderer.invoke("fs:copyFile", src, dest),

  /** Get file/directory metadata. */
  stat: (filePath: string) =>
    ipcRenderer.invoke("fs:stat", filePath),

  /** Create a directory (recursive). */
  mkdir: (dirPath: string) =>
    ipcRenderer.invoke("fs:mkdir", dirPath),

  // ── Project Management ────────────────────────────────────────────

  /** Open a native dialog to select a project folder. Returns the path or null. */
  openProject: () =>
    ipcRenderer.invoke("project:open"),

  /** Open a native dialog + scaffold a new project with create-ggez. Returns the path or null. */
  createProject: () =>
    ipcRenderer.invoke("project:create"),

  /** Get the currently opened project path (or null). */
  getCurrentProject: () =>
    ipcRenderer.invoke("project:getCurrent"),

  /** Listen for project open/create events from the main process. */
  onProjectOpened: (callback: (projectPath: string) => void) => {
    ipcRenderer.on("project:opened", (_event, projectPath: string) => callback(projectPath));
    return () => { ipcRenderer.removeAllListeners("project:opened"); };
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// ── Type export for renderer ──
export type ElectronAPI = typeof electronAPI;
