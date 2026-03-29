import "./style.css";
import { createGameApp } from "./game/app";
import { initialSceneId, scenes } from "./scenes";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

const app = await createGameApp({
  initialSceneId,
  root,
  scenes
});

void app.start();
