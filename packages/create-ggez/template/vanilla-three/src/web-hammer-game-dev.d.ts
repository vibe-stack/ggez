declare module "virtual:web-hammer-scene-registry" {
  import type { GameSceneDefinition } from "./game/scene/types";

  export const scenes: Record<string, GameSceneDefinition>;
  export const initialSceneId: string;
}

declare module "virtual:web-hammer-animation-registry" {
  import type { GameAnimationBundleDefinition } from "./game/loaders/animation-sources";

  export const animations: Record<string, GameAnimationBundleDefinition>;
}
