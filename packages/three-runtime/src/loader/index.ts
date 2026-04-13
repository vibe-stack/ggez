// Barrel — all public API re-exported from sub-modules.
export type { WebHammerAssetResolverContext, WebHammerSceneLoaderOptions, WebHammerSceneLodOptions } from "./types";
export { resolveConfiguredSceneLodLevels } from "./lod-config";
export {
  isWebHammerEngineScene,
  isWebHammerEngineBundle,
  parseWebHammerEngineScene,
  fetchWebHammerEngineScene
} from "./scene-fetch";
export type { ThreeRuntimeSceneInstance, WebHammerLoadedScene } from "./scene-instance";
export {
  createThreeRuntimeSceneInstance,
  loadWebHammerEngineScene,
  loadWebHammerEngineSceneFromUrl,
  loadThreeRuntimeSceneInstanceFromUrl
} from "./scene-instance";
export {
  applyWebHammerWorldSettings,
  clearWebHammerWorldSettings,
  applyRuntimeWorldSettingsToThreeScene,
  clearRuntimeWorldSettingsFromThreeScene
} from "./world-settings";

// Legacy type aliases
export type { WebHammerAssetResolverContext as ThreeRuntimeAssetResolverContext } from "./types";
export type { WebHammerSceneLoaderOptions as ThreeRuntimeSceneInstanceOptions } from "./types";
export type { WebHammerSceneLodOptions as ThreeRuntimeSceneLodOptions } from "./types";

