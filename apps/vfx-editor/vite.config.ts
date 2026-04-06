import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { createCodexBridgePlugin } from "./server/codex-bridge-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), createCodexBridgePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ggez/anim-utils": path.resolve(__dirname, "../../packages/anim-utils/src/index.ts"),
      "@ggez/vfx-compiler": path.resolve(__dirname, "../../packages/vfx-compiler/src/index.ts"),
      "@ggez/vfx-core": path.resolve(__dirname, "../../packages/vfx-core/src/index.ts"),
      "@ggez/vfx-editor-core": path.resolve(__dirname, "../../packages/vfx-editor-core/src/index.ts"),
      "@ggez/vfx-exporter": path.resolve(__dirname, "../../packages/vfx-exporter/src/index.ts"),
      "@ggez/vfx-runtime": path.resolve(__dirname, "../../packages/vfx-runtime/src/index.ts"),
      "@ggez/vfx-schema": path.resolve(__dirname, "../../packages/vfx-schema/src/index.ts"),
      "@ggez/vfx-three": path.resolve(__dirname, "../../packages/vfx-three/src/index.ts")
    }
  }
});
