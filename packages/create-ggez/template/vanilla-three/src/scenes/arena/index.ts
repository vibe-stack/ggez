import {
  createColocatedRuntimeSceneSource,
  defineGameScene
} from "../../game/runtime-scene-sources";

const assetUrlLoaders = import.meta.glob("./assets/**/*", {
  import: "default",
  query: "?url"
}) as Record<string, () => Promise<string>>;

export const arenaScene = defineGameScene({
  id: "arena",
  mount({ gotoScene, player, setStatus }) {
    if (player) {
      setStatus("Arena scene. Click to recapture the cursor if needed. Press 1 to return to Main.");
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Digit1") {
        void gotoScene("main");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return {
      dispose() {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  },
  source: createColocatedRuntimeSceneSource({
    assetUrlLoaders,
    manifestLoader: () => import("./scene.runtime.json?raw").then((module) => module.default)
  }),
  title: "Arena Scene"
});
