import "./style.css";
import {
  createGameplayRuntime,
  createGameplayRuntimeSceneFromRuntimeScene
} from "@web-hammer/gameplay-runtime";
import { createRapierPhysicsWorld, ensureRapierRuntimePhysics } from "@web-hammer/runtime-physics-rapier";
import { createRuntimeWorldManager } from "@web-hammer/runtime-streaming";
import { parseRuntimeScene } from "@web-hammer/runtime-format";
import { createThreeRuntimeSceneInstance } from "@web-hammer/three-runtime";
import * as THREE from "three";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

root.innerHTML = `
  <div class="app-shell">
    <div class="hud">
      <span class="eyebrow">Web Hammer Starter</span>
      <h1>Vanilla Three + Rapier + Vite</h1>
      <p>Replace <code>public/scene.runtime.json</code> with your exported runtime manifest when you are ready.</p>
    </div>
  </div>
`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
root.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#d7e3ef");

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(8, 6, 8);

const hemiLight = new THREE.HemisphereLight("#f6fbff", "#8ba2b8", 1.1);
const dirLight = new THREE.DirectionalLight("#ffffff", 1.5);
dirLight.position.set(6, 12, 4);
dirLight.castShadow = true;
scene.add(hemiLight, dirLight);

const grid = new THREE.GridHelper(20, 20, "#7b93aa", "#b5c5d3");
scene.add(grid);

const clock = new THREE.Clock();

let runtimeSceneInstance: Awaited<ReturnType<typeof createThreeRuntimeSceneInstance>> | undefined;
let gameplayRuntime: ReturnType<typeof createGameplayRuntime> | undefined;
let physicsWorld: ReturnType<typeof createRapierPhysicsWorld> | undefined;

void bootstrap();

async function bootstrap() {
  await ensureRapierRuntimePhysics();
  runtimeSceneInstance = await loadRuntimeScene("/scene.runtime.json");
  scene.add(runtimeSceneInstance.root);
  physicsWorld = createRapierPhysicsWorld(runtimeSceneInstance.scene.settings);

  gameplayRuntime = createGameplayRuntime({
    scene: createGameplayRuntimeSceneFromRuntimeScene(runtimeSceneInstance.scene),
    systems: []
  });
  gameplayRuntime.start();

  const streaming = createRuntimeWorldManager({
    async loadChunk(chunk) {
      return loadRuntimeScene(chunk.manifestUrl ?? "");
    },
    async unloadChunk(_chunk, chunkInstance) {
      scene.remove(chunkInstance.root);
      chunkInstance.dispose();
    },
    worldIndex: {
      chunks: [],
      version: 1
    }
  });

  void streaming.updateStreamingFocus({ x: 0, y: 0, z: 0 });

  window.addEventListener("beforeunload", () => {
    gameplayRuntime?.dispose();
    runtimeSceneInstance?.dispose();
    physicsWorld?.free();
  });

  renderFrame();
}

async function loadRuntimeScene(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load runtime scene from ${url}`);
  }

  const manifest = parseRuntimeScene(await response.text());
  const manifestUrl = new URL(url, window.location.origin);

  return createThreeRuntimeSceneInstance(manifest, {
    applyToScene: scene,
    lod: {
      midDistance: 10,
      lowDistance: 30
    },
    resolveAssetUrl: ({ path }) => new URL(path, manifestUrl).toString()
  });
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  const delta = clock.getDelta();
  gameplayRuntime?.update(delta);
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
