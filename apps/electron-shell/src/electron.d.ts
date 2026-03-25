/**
 * Type declarations for the Electron bridge API.
 *
 * These types describe the `window.electronAPI` object exposed by the
 * preload script. Import or reference this file from `apps/editor`
 * to get type safety when calling Electron APIs from the renderer.
 */

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
  /** Modification time in milliseconds since epoch */
  mtime: number;
  /** Creation time in milliseconds since epoch */
  ctime: number;
}

export interface BinaryFileData {
  base64: string;
  byteLength: number;
}

export interface ElectronAPI {
  // ── Identity ──
  readonly isElectron: true;
  readonly platform: string;

  // ── Menu Events ──
  onSave(callback: () => void): () => void;
  onUndo(callback: () => void): () => void;
  onRedo(callback: () => void): () => void;

  // ── File System ──
  readFile(path: string, encoding: "utf8" | "utf-8"): Promise<string>;
  readFile(path: string): Promise<BinaryFileData>;
  writeFile(path: string, data: string): Promise<void>;
  writeFile(path: string, data: { base64: string }): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  readDirTree(path: string): Promise<DirTreeEntry[]>;
  deleteFile(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  mkdir(path: string): Promise<void>;

  // ── Project Management ──
  openProject(): Promise<string | null>;
  createProject(): Promise<string | null>;
  getCurrentProject(): Promise<string | null>;
  onProjectOpened(callback: (projectPath: string) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
