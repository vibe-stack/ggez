import {
  createColocatedRuntimeSceneSource,
  defineGameScene
} from "../../game/runtime-scene-sources";

const assetUrlLoaders = import.meta.glob("./assets/**/*", {
  import: "default",
  query: "?url"
}) as Record<string, () => Promise<string>>;

export const mainScene = defineGameScene({
  id: "main",
  mount({ gotoScene, player, setStatus }) {
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
  source: createColocatedRuntimeSceneSource({
    assetUrlLoaders,
    manifestLoader: () => import("./scene.runtime.json?raw").then((module) => module.default)
  }),
  title: "Main Scene"
});
