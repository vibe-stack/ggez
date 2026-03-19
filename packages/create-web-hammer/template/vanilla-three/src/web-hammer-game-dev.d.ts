declare module "virtual:web-hammer-scene-registry" {
  import type { GameSceneDefinition } from "./game/scene-types";

  export const scenes: Record<string, GameSceneDefinition>;
  export const initialSceneId: string;
}
