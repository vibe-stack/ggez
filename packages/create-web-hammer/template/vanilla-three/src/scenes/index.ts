import { arenaScene } from "./arena";
import { mainScene } from "./main";

export const scenes = {
  [arenaScene.id]: arenaScene,
  [mainScene.id]: mainScene
};

export const initialSceneId = mainScene.id;
