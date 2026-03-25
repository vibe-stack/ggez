# Electron Integration Plan per Trident / GGEZ

Questo piano descrive i passaggi per migrare Trident (e/o Animation Studio) in un'applicazione desktop Electron completa con Monaco Editor, gestione files nativa, e project management.

## 1. Architettura File System e Texture Management

L'obiettivo è abbandonare l'approccio browser (`FileReader`, Data URL nei materials) per avere letture/scritture reali su disco, seguendo la struttura `create-ggez`.

### Nuovo Workflow Texture
- **Prima (Browser):** L'utente fa l'upload di un'immagine, Trident estrae il data URL Base64 in `importMaterial` e lo salva inline nel json `.whmap`.
- **Dopo (Electron):**
  1. Quando si importa una texture, l'editor la **dovrà copiare fisicamente** in `{project_root}/src/scenes/assets/modelli-e-texture/{name}.png`.
  2. Nel JSON del manifesto verrà salvato **solo il path relativo** (es. `assets/texture/muro.png`).
  3. L'editor leggerà l'immagine via protocollo custom locale (es. `project://assets/texture/muro.png`) gestito tramite un "protocol handler" Electron.

### File Browser (File Tree)
Un nuovo componente React "File Browser" in una sidebar (o Pannello destro) comunicherà via IPC con Node.js per:
- `fs.readdir` (leggere l'albero `src/scenes` e `src/animations`)
- `chokidar` (in [main.ts](file:///K:/Repository/trident/packages/create-ggez/template/vanilla-three/src/main.ts) di Electron) invierà eventi React per triggerare un refresh visivo dopo edit/delete/create esterni.
- Bottone Refresh, Rename, Delete files, Upload.

## 2. Integrazione Monaco Editor

Il file/logic viewer sarà esteso per usare `@monaco-editor/react`. Questo fornirà highlight per JSON (.whmap), script e JSON-LD configs.
- Cliccando su un file nel nuovo File Browser, aprirà Monaco in un tab centrale.
- L'auto-save aggiornerà i file via `ipcRenderer.invoke`.

## 3. Struttura Electron (New Package: `apps/electron-shell`)

Invece di appesantire il single app `apps/editor` con package electron mischiati, creeremo un package dedicato in `apps/electron-shell`:

```text
apps/electron-shell/
├── src/
│   ├── main.ts              # Electron Entry (WindowManager, IPC Handlers, Menu, FS)
│   ├── preload.ts           # ContextBridge (espone window.electronAPI all'editor)
│   └── index.html           # In produzione, bridge. In dev carica localhost:5173
├── scripts/
│   └── dev.ts               # Avvia Vite editor + Vite Anim Studio + Electron run
├── package.json
└── tsconfig.json
```

### Script aggiunto:
Aggiungeremo al root monorepo: `"dev:electron": "bun run --cwd apps/electron-shell dev"`

## 4. Fasi di Implementazione (Roadmap)

### Fase 1: Setup Electron Base e Finestre
- [ ] Creare il nuovo package `apps/electron-shell` con Vite + Electron (`electronic-vite` o manual setup).
- [ ] Creare il main process Node con l'apertura tramite `loadURL('http://localhost:5173')` per dev.
- [ ] Aggiungere lo script `dev:electron` globale.
- [ ] Aggiungere Native Menus (File -> New Project, Open Project...).

### Fase 2: File System Bridge (IPC) e Gestione Progetto
- [ ] Creare `preload.ts` e le API IPC Node (`window.electronAPI.readFile`, `writeFile`, `readDir`).
- [ ] Aggiungere il menu "Create Project" che in Node esegue npx/bun `create-ggez` su una cartella scelta dall'utente.
- [ ] Aggiungere il protocollo locale Electron per servire file texture in modo che Three.js ci acceda come url normali (`trident://file-path`).

### Fase 3: Rielaborazione File Browser / Monaco Editor nell'UI Trident
- [ ] Installare `@monaco-editor/react` in `apps/editor`.
- [ ] Modificare l'interfaccia dell'editor React (`EditorShell.tsx`) per avere un nuovo tab "Project Files" sulla sinistra/destra.
- [ ] Aggiungere Logica File Browser (leggi cartella progetto dal path passato da Electron, pulsanti CRUD, upload).
- [ ] Implementare l'uso di Monaco per clic/edit dei JSON/.ts scripts.

### Fase 4: Refactor Texture Management
- [ ] Modificare Trident e la funzione di export e Material Import affinché salvi i file (PNG/JPG e GLB importati) nella cartella `assets/` del progetto attualmente aperto via `ipcRenderer`.
- [ ] Aggiornare Three.js `TextureLoader`/`GLTFLoader` backend per usare gli URL protocol locali Electron.
