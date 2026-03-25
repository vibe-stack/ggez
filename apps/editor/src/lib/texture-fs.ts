/**
 * Electron-aware texture file system helpers.
 *
 * In Electron mode: saves texture files to the project's assets directory
 * and returns `trident://` protocol URLs for Three.js consumption.
 *
 * In browser mode: falls back to Base64 data URLs (no-op).
 */

type ElectronAPI = {
  isElectron: true;
  writeFile: (path: string, data: string | { base64: string }) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  getCurrentProject: () => Promise<string | null>;
};

function getElectronAPI(): ElectronAPI | null {
  const api = (window as any).electronAPI;
  return api?.isElectron ? api : null;
}

/**
 * Resolves the project path, either from the UI store or the Electron API.
 */
async function resolveProjectPath(): Promise<string | null> {
  const api = getElectronAPI();
  if (!api) return null;
  return api.getCurrentProject();
}

/**
 * Sanitize a filename for safe disk usage.
 * Strips non-alphanumeric chars except for dots/dashes/underscores.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Generate a unique texture filename to avoid collisions.
 */
function uniqueFilename(baseName: string, ext: string): string {
  const timestamp = Date.now().toString(36);
  const safe = sanitizeFilename(baseName);
  return `${safe}_${timestamp}.${ext}`;
}

/**
 * Extract Base64 content and MIME info from a data URL.
 */
function parseDataUrl(dataUrl: string): { base64: string; ext: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/);
  if (!match) return null;
  return {
    base64: match[3],
    ext: match[2] === "jpeg" ? "jpg" : match[2],
    mimeType: match[1],
  };
}

/**
 * Save a texture file (from a browser File object) to the project's assets directory.
 *
 * @returns The `trident://` URL for the saved texture, or null if not in Electron.
 */
export async function saveTextureFileToProject(
  file: File,
  projectPath: string
): Promise<{ tridentUrl: string; filePath: string } | null> {
  const api = getElectronAPI();
  if (!api) return null;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "texture";
  const filename = uniqueFilename(baseName, ext);

  const texturesDir = `${projectPath}\\src\\scenes\\assets\\textures`;
  const filePath = `${texturesDir}\\${filename}`;
  const tridentUrl = `trident://assets/textures/${filename}`;

  // Ensure directory exists
  await api.mkdir(texturesDir);

  // Read file as base64
  const base64 = await fileToBase64(file);
  await api.writeFile(filePath, { base64 });

  return { tridentUrl, filePath };
}

/**
 * Save a Base64 data URL as a file to the project's assets directory.
 *
 * @returns The `trident://` URL for the saved texture, or null if not in Electron.
 */
export async function saveDataUrlToProject(
  dataUrl: string,
  name: string,
  projectPath: string,
  subDir = "textures"
): Promise<{ tridentUrl: string; filePath: string } | null> {
  const api = getElectronAPI();
  if (!api) return null;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const filename = uniqueFilename(name, parsed.ext);
  const assetsDir = `${projectPath}\\src\\scenes\\assets\\${subDir}`;
  const filePath = `${assetsDir}\\${filename}`;
  const tridentUrl = `trident://assets/${subDir}/${filename}`;

  await api.mkdir(assetsDir);
  await api.writeFile(filePath, { base64: parsed.base64 });

  return { tridentUrl, filePath };
}

/**
 * Save a raw binary (ArrayBuffer) to the project's assets directory.
 *
 * @returns The `trident://` URL for the saved file, or null if not in Electron.
 */
export async function saveBinaryToProject(
  data: ArrayBuffer,
  filename: string,
  projectPath: string,
  subDir = "models"
): Promise<{ tridentUrl: string; filePath: string } | null> {
  const api = getElectronAPI();
  if (!api) return null;

  const assetsDir = `${projectPath}\\src\\scenes\\assets\\${subDir}`;
  const filePath = `${assetsDir}\\${filename}`;
  const tridentUrl = `trident://assets/${subDir}/${filename}`;

  await api.mkdir(assetsDir);

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  await api.writeFile(filePath, { base64 });

  return { tridentUrl, filePath };
}

/**
 * Resolve the display URL for a texture.
 * Returns the trident:// URL if available (Electron), otherwise the raw dataUrl.
 */
export function resolveTextureDisplayUrl(texture: { dataUrl: string; filePath?: string }): string {
  // If the dataUrl is already a trident:// URL, use it directly
  if (texture.dataUrl.startsWith("trident://")) {
    return texture.dataUrl;
  }
  return texture.dataUrl;
}

/**
 * Check if running in Electron mode.
 */
export function isElectronMode(): boolean {
  return !!getElectronAPI();
}

/**
 * Get the current project path (Electron only).
 */
export async function getProjectPath(): Promise<string | null> {
  return resolveProjectPath();
}

// ── Internal ────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
