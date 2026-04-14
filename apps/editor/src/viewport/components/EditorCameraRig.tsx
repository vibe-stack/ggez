import { MapControls, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { toTuple } from "@ggez/shared";
import { useEffect, useRef, type MutableRefObject } from "react";
import { OrthographicCamera, PerspectiveCamera } from "three";
import type { ViewportCanvasProps } from "@/viewport/types";

export function EditorCameraRig({
  controlsRef: externalControlsRef,
  controlsEnabled,
  onViewportChange,
  viewportId,
  viewport
}: Pick<ViewportCanvasProps, "onViewportChange" | "viewport" | "viewportId"> & {
  controlsEnabled: boolean;
  controlsRef?: MutableRefObject<any | null>;
}) {
  const camera = useThree((state) => state.camera);
  const internalControlsRef = useRef<any>(null);
  const controlsRef = externalControlsRef ?? internalControlsRef;

  useEffect(() => {
    const [x, y, z] = toTuple(viewport.camera.position);
    const [targetX, targetY, targetZ] = toTuple(viewport.camera.target);

    camera.position.set(x, y, z);
    camera.near = viewport.camera.near;
    camera.far = viewport.camera.far;

    if ("up" in viewport.camera) {
      camera.up.set(viewport.camera.up.x, viewport.camera.up.y, viewport.camera.up.z);
    }

    if (camera instanceof PerspectiveCamera && viewport.projection === "perspective") {
      camera.fov = viewport.camera.fov;
    }

    if (camera instanceof OrthographicCamera && viewport.projection === "orthographic") {
      camera.zoom = viewport.camera.zoom;
    }

    camera.updateProjectionMatrix();

    controlsRef.current?.target.set(targetX, targetY, targetZ);
    controlsRef.current?.update();
  }, [
    camera,
    viewport.camera.far,
    viewport.camera.near,
    viewport.camera.position.x,
    viewport.camera.position.y,
    viewport.camera.position.z,
    viewport.camera.target.x,
    viewport.camera.target.y,
    viewport.camera.target.z,
    viewport.projection,
    "fov" in viewport.camera ? viewport.camera.fov : undefined,
    "up" in viewport.camera ? viewport.camera.up.x : undefined,
    "up" in viewport.camera ? viewport.camera.up.y : undefined,
    "up" in viewport.camera ? viewport.camera.up.z : undefined,
    "zoom" in viewport.camera ? viewport.camera.zoom : undefined
  ]);

  useEffect(() => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const handleEnd = () => {
      if (camera instanceof PerspectiveCamera && viewport.projection === "perspective") {
        onViewportChange(viewportId, {
          ...viewport,
          camera: {
            ...viewport.camera,
            position: {
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z
            },
            target: {
              x: controls.target.x,
              y: controls.target.y,
              z: controls.target.z
            }
          }
        });
        return;
      }

      if (camera instanceof OrthographicCamera && viewport.projection === "orthographic") {
        onViewportChange(viewportId, {
          ...viewport,
          camera: {
            ...viewport.camera,
            position: {
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z
            },
            target: {
              x: controls.target.x,
              y: controls.target.y,
              z: controls.target.z
            },
            up: {
              x: camera.up.x,
              y: camera.up.y,
              z: camera.up.z
            },
            zoom: camera.zoom
          }
        });
      }
    };

    controls.addEventListener("end", handleEnd);

    return () => {
      controls.removeEventListener("end", handleEnd);
    };
  }, [camera, onViewportChange, viewport, viewportId]);

  if (viewport.projection === "orthographic") {
    return (
      <MapControls
        ref={controlsRef}
        enabled={controlsEnabled}
        enableRotate={false}
        makeDefault
        maxZoom={viewport.camera.maxZoom}
        minZoom={viewport.camera.minZoom}
        screenSpacePanning
        target={toTuple(viewport.camera.target)}
      />
    );
  }

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.12}
      enableDamping
      enabled={controlsEnabled}
      makeDefault
      maxDistance={viewport.camera.maxDistance}
      maxPolarAngle={Math.PI - 0.01}
      minDistance={viewport.camera.minDistance}
      minPolarAngle={0.01}
      target={toTuple(viewport.camera.target)}
    />
  );
}
