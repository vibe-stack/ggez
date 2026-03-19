import { defineConfig, searchForWorkspaceRoot } from "vite";
import { createWebHammerGamePlugin } from "@web-hammer/game-dev";

export default defineConfig({
  plugins: [createWebHammerGamePlugin({ initialSceneId: "main", projectName: "__PROJECT_NAME__" })],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())]
    }
  }
});
