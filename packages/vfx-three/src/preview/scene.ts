import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WebGPURenderer } from "three/webgpu";

export type PreviewThreeScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resize(): void;
  dispose(): void;
};

export function createPreviewThreeScene(input: { mount: HTMLDivElement; renderer: WebGPURenderer }): PreviewThreeScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 200);
  camera.position.set(0, 2.5, 7);
  camera.lookAt(0, 1, 0);

  const controls = new OrbitControls(camera, input.renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 30;
  controls.update();

  scene.add(new THREE.GridHelper(8, 16, 0x1a2b1a, 0x111a11));
  scene.add(new THREE.AmbientLight(0x0a1a0f, 2));

  function resize() {
    const bounds = input.mount.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    input.renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    camera,
    controls,
    resize,
    dispose() {
      controls.dispose();
    }
  };
}
