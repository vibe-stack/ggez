import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchForWorkspaceRoot, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { createCodexBridgePlugin } from "./server/codex-bridge-plugin";
import { createEditorGameSyncPlugin } from "./server/editor-game-sync-plugin";
import { createObjectGenerationApiPlugin } from "./server/object-generation-api";
import { createTextureGenerationApiPlugin } from "./server/texture-generation-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const workspaceAliases = {
  "@ggez/dev-sync": path.resolve(repoRoot, "packages/dev-sync/src/index.ts"),
  "@ggez/editor-core": path.resolve(repoRoot, "packages/editor-core/src/index.ts"),
  "@ggez/geometry-kernel": path.resolve(repoRoot, "packages/geometry-kernel/src/index.ts"),
  "@ggez/render-pipeline": path.resolve(repoRoot, "packages/render-pipeline/src/index.ts"),
  "@ggez/runtime-build": path.resolve(repoRoot, "packages/runtime-build/src/index.ts"),
  "@ggez/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
  "@ggez/three-runtime": path.resolve(repoRoot, "packages/three-runtime/src/index.ts"),
  "@ggez/tool-system": path.resolve(repoRoot, "packages/tool-system/src/index.ts"),
  "@ggez/workers": path.resolve(repoRoot, "packages/workers/src/index.ts")
} as const;

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
    resolve: {
      alias: workspaceAliases
    },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())]
      }
    }
  };
});
