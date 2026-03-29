import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { createOrchestratorPlugin } from "./server/orchestrator-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), createOrchestratorPlugin({ repoRoot })],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())]
    },
    host: "127.0.0.1",
    port: 4300,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4300,
    strictPort: true
  }
}));
