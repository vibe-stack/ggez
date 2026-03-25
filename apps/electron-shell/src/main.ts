import { app, BrowserWindow, Menu, MenuItemConstructorOptions, shell, protocol, net } from "electron";
import path from "path";
import { readFile } from "node:fs/promises";
import { registerIpcHandlers, getCurrentProjectPath, setCurrentProjectPath } from "./ipc-handlers";

const isDev = !app.isPackaged;
const VITE_DEV_URL = "http://localhost:5173";

// ── MIME type map for trident:// protocol ───────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".hdr": "application/octet-stream",
  ".exr": "application/octet-stream",
  ".json": "application/json",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".css": "text/css",
  ".html": "text/html",
  ".txt": "text/plain",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ── Window ──────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  // Bun compiles __dirname to the original /src folder path
  const preloadPath = path.resolve(__dirname, "..", "dist", "preload.js");
  console.log("[Main] Preload path resolved to:", preloadPath);

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 600,
    title: "GGEZ — Web Hammer",
    backgroundColor: "#09090b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  if (isDev) {
    win.loadURL(VITE_DEV_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  return win;
}

// ── Native Menu ─────────────────────────────────────────────────────

function buildMenu(win: BrowserWindow): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            // Trigger create project flow via IPC (same as renderer calling it)
            win.webContents.send("menu:createProject");
          },
        },
        {
          label: "Open Project",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            // Trigger open project flow via IPC
            win.webContents.send("menu:openProject");
          },
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            win.webContents.send("menu:save");
          },
        },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click: () => win.webContents.send("menu:undo"),
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => win.webContents.send("menu:redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "GGEZ Documentation",
          click: () => {
            shell.openExternal("https://github.com/Ciuby/trident");
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

// ── Custom Protocol: trident:// ─────────────────────────────────────

function registerTridentProtocol(): void {
  protocol.handle("trident", async (request) => {
    const projectPath = getCurrentProjectPath();
    if (!projectPath) {
      return new Response("No project open", { status: 404 });
    }

    // Parse the URL: trident://assets/path/to/file.png
    // URL constructor will parse it as: host="assets", pathname="/path/to/file.png"
    const url = new URL(request.url);
    const relativePath = url.hostname + url.pathname;

    // Resolve to absolute path under the project's src/scenes/ directory
    const absolutePath = path.join(projectPath, "src", "scenes", relativePath);

    // Security: ensure the resolved path is within the project
    const normalizedProject = path.resolve(projectPath);
    const normalizedFile = path.resolve(absolutePath);
    if (!normalizedFile.startsWith(normalizedProject)) {
      return new Response("Access denied: path traversal", { status: 403 });
    }

    try {
      const data = await readFile(absolutePath);
      const mimeType = getMimeType(absolutePath);
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": data.byteLength.toString(),
        },
      });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return new Response("File not found", { status: 404 });
      }
      return new Response(`Error reading file: ${err.message}`, { status: 500 });
    }
  });
}

// ── App Lifecycle ───────────────────────────────────────────────────

app.whenReady().then(() => {
  // Register IPC handlers
  registerIpcHandlers();

  // Register custom protocol
  registerTridentProtocol();

  // Create window
  const win = createWindow();
  
  // Disable native menu bar since we have a custom web-based menu
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
