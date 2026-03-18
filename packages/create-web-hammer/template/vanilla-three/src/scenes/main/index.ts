import sceneManifest from "./scene.runtime.json?raw";
import {
  createBundledRuntimeSceneSource,
  defineGameScene,
  normalizeBundledAssetUrls
} from "../../game/runtime-scene-sources";

const assetUrls = normalizeBundledAssetUrls(
  import.meta.glob("./assets/**/*", {
    eager: true,
    import: "default",
    query: "?url"
  }) as Record<string, string>
);

export const mainScene = defineGameScene({
  id: "main",
  mount({ gotoScene, player, setStatus }) {
    if (player) {
      setStatus("Click inside the game to capture the cursor. WASD to move, Space to jump, Shift to run. Press 2 for Arena.");
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Digit2") {
        void gotoScene("arena");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return {
      dispose() {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  },
  source: createBundledRuntimeSceneSource({
    assetUrls,
    manifestText: sceneManifest
  }),
  title: "Main Scene"
});
