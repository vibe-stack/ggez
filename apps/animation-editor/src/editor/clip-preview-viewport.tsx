import { createPoseBufferFromRig, sampleClipPose } from "@ggez/anim-core";
import { memo, useEffect, useRef, type RefObject } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { applyPoseBufferToSceneBones, preparePreviewObject } from "./preview-assets";

function fitCameraToObject(camera: PerspectiveCamera, controls: OrbitControls, object: Object3D): void {
  const bounds = new Box3().setFromObject(object);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.near = 0.01;
  camera.far = Math.max(1000, distance * 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function ClipPreviewViewportInner(props: {
  character: ImportedCharacterAsset | null;
  clip: ImportedPreviewClip | null;
  currentTimeRef: RefObject<number>;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef(props.clip);

  useEffect(() => {
    clipRef.current = props.clip;
  }, [props.clip]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new Scene();
    scene.background = new Color("#05070a");
    const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new AmbientLight("#ffffff", 1.18);
    const keyLight = new DirectionalLight("#ffffff", 1.45);
    keyLight.position.set(6, 12, 8);
    const fillLight = new DirectionalLight("#8dd3ff", 0.55);
    fillLight.position.set(-4, 6, -6);
    const grid = new GridHelper(24, 24, "#183b24", "#0b1c12");
    scene.add(ambientLight, keyLight, fillLight, grid);

    let previewObject: Object3D | null = null;
    let disposed = false;
    const poseBuffer = props.character ? createPoseBufferFromRig(props.character.rig) : null;

    if (props.character) {
      previewObject = clone(props.character.scene);

      if (previewObject) {
        preparePreviewObject(previewObject);
        scene.add(previewObject);
        fitCameraToObject(camera, controls, previewObject);
      }
    } else {
      camera.position.set(3, 2, 3);
      controls.update();
    }

    function resize() {
      const width = Math.max(mount?.clientWidth ?? 0, 1);
      const height = Math.max(mount?.clientHeight ?? 0, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    function renderFrame() {
      if (disposed) {
        return;
      }

      const activeClip = clipRef.current;
      if (previewObject && props.character && activeClip && poseBuffer) {
        sampleClipPose(activeClip.asset, props.character.rig, props.currentTimeRef.current, poseBuffer, true);
        applyPoseBufferToSceneBones(poseBuffer, props.character.rig, previewObject);
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [props.character, props.currentTimeRef]);

  return (
    <div className="relative h-full overflow-hidden rounded-none bg-[#040507] ring-1 ring-white/8">
      <div ref={mountRef} className="absolute inset-0" />
      {!props.character ? (
        <div className="absolute inset-0 grid place-items-center bg-black/55 px-6 text-center text-[12px] leading-6 text-zinc-400">
          Import a rigged character to enable the live 3D preview.
        </div>
      ) : null}
      {props.character && !props.clip ? (
        <div className="absolute inset-0 grid place-items-center bg-black/45 px-6 text-center text-[12px] leading-6 text-zinc-400">
          Import animation clips to preview the active take.
        </div>
      ) : null}
    </div>
  );
}

export const ClipPreviewViewport = memo(ClipPreviewViewportInner);
