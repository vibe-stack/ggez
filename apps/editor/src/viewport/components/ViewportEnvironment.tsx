import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { applyWebHammerWorldSettings, clearWebHammerWorldSettings } from "@ggez/three-runtime";
import { type SceneSettings, type Vec3 } from "@ggez/shared";
import { Color, Object3D } from "three";
import { renderModeUsesFullLighting, type ViewportRenderMode } from "@/viewport/viewports";

export function ViewportWorldSettings({ renderMode, sceneSettings }: { renderMode: ViewportRenderMode; sceneSettings: SceneSettings }) {
  const { scene } = useThree();

  useEffect(() => {
    if (!renderModeUsesFullLighting(renderMode)) {
      clearWebHammerWorldSettings(scene);
      scene.background = new Color(renderMode === "wireframe" ? "#091018" : "#0b1016");
      scene.environment = null;
      return;
    }

    scene.background = new Color(sceneSettings.world.fogColor);

    void applyWebHammerWorldSettings(scene, { settings: sceneSettings });

    return () => {
      clearWebHammerWorldSettings(scene);
      scene.background = null;
      scene.environment = null;
    };
  }, [renderMode, scene, sceneSettings]);

  return null;
}

export function DefaultViewportSun({ center }: { center: Vec3 }) {
  const lightRef = useRef<any>(null);
  const targetRef = useRef<Object3D | null>(null);

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) {
      return;
    }

    lightRef.current.target = targetRef.current;
    targetRef.current.updateMatrixWorld();
  }, [center.x, center.y, center.z]);

  return (
    <>
      <directionalLight
        castShadow
        intensity={1.35}
        position={[center.x + 28, center.y + 42, center.z + 24]}
        ref={lightRef}
        shadow-bias={-0.00015}
        shadow-camera-bottom={-72}
        shadow-camera-far={180}
        shadow-camera-left={-72}
        shadow-camera-right={72}
        shadow-camera-top={72}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
        shadow-normalBias={0.03}
      />
      <object3D position={[center.x, center.y, center.z]} ref={targetRef} />
    </>
  );
}
