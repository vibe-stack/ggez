import { defineConfig, searchForWorkspaceRoot, type PluginOption } from "vite";
import { createWebHammerGamePlugin } from "@ggez/game-dev";

export default defineConfig({
  plugins: [createWebHammerGamePlugin({ initialSceneId: "main", projectName: "__PROJECT_NAME__" }) as PluginOption],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())]
    }
  }
});
