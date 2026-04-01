import {
  createColocatedRuntimeSceneSource,
  defineGameScene
} from "../../game/loaders/scene-sources";

const assetUrlLoaders = import.meta.glob("./assets/**/*", {
  import: "default",
  query: "?url"
}) as Record<string, () => Promise<string>>;

export const mainScene = defineGameScene({
  id: "main",
  source: createColocatedRuntimeSceneSource({
    assetUrlLoaders,
    manifestLoader: () => import("./scene.runtime.json?raw").then((module) => module.default)
  }),
  title: "Main Scene"
});
