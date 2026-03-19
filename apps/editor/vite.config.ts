import { searchForWorkspaceRoot, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { createCodexBridgePlugin } from "./server/codex-bridge-plugin";
import { createEditorGameSyncPlugin } from "./server/editor-game-sync-plugin";
import { createObjectGenerationApiPlugin } from "./server/object-generation-api";
import { createTextureGenerationApiPlugin } from "./server/texture-generation-api";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const explicitBase = process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH;
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const inferredGithubPagesBase =
    process.env.GITHUB_ACTIONS === "true" && githubRepository
      ? `/${githubRepository.split("/")[1]}/`
      : "/";

  if (env.FAL_KEY) {
    process.env.FAL_KEY = env.FAL_KEY;
  }

  return {
    base: explicitBase ?? inferredGithubPagesBase,
    plugins: [
      react(),
      tsconfigPaths(),
      tailwindcss(),
      createCodexBridgePlugin(),
      createEditorGameSyncPlugin(),
      createObjectGenerationApiPlugin(),
      createTextureGenerationApiPlugin()
    ],
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())]
      }
    }
  };
});
