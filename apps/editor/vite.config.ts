import { searchForWorkspaceRoot, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { createObjectGenerationApiPlugin } from "./server/object-generation-api";
import { createTextureGenerationApiPlugin } from "./server/texture-generation-api";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (env.FAL_KEY) {
    process.env.FAL_KEY = env.FAL_KEY;
  }

  return {
    plugins: [
      react(),
      tsconfigPaths(),
      tailwindcss(),
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
