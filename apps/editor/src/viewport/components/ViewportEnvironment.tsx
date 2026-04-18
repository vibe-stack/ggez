import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { applyWebHammerWorldSettings, clearWebHammerWorldSettings, resolveWebHammerToneMapping } from "@ggez/three-runtime";
import { type SceneSettings, type Vec3 } from "@ggez/shared";
import { Color, NoToneMapping, Object3D, VSMShadowMap } from "three";
import { renderModeUsesFullLighting, renderModeUsesShadows, type ViewportRenderMode } from "@/viewport/viewports";
import { VSM_SHADOW_BLUR_SAMPLES, VSM_SHADOW_RADIUS } from "@/viewport/utils/shadow-config";

export function ViewportWorldSettings({ renderMode, sceneSettings }: { renderMode: ViewportRenderMode; sceneSettings: SceneSettings }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    if (!renderModeUsesFullLighting(renderMode)) {
      clearWebHammerWorldSettings(scene);
      scene.background = new Color(renderMode === "wireframe" ? "#091018" : "#0b1016");
      scene.environment = null;
      gl.toneMapping = NoToneMapping;
      return;
    }

    scene.background = new Color(sceneSettings.world.fogColor);
    gl.toneMapping = resolveWebHammerToneMapping(sceneSettings.world.toneMapping);

    void applyWebHammerWorldSettings(scene, { settings: sceneSettings });

    return () => {
      clearWebHammerWorldSettings(scene);
      scene.background = null;
      scene.environment = null;
      gl.toneMapping = NoToneMapping;
    };
  }, [gl, renderMode, scene, sceneSettings]);

  return null;
}

export function ViewportShadowMapSettings({ renderMode }: { renderMode: ViewportRenderMode }) {
  const { gl } = useThree();

  useEffect(() => {
    gl.shadowMap.enabled = renderModeUsesShadows(renderMode);
    gl.shadowMap.type = VSMShadowMap;
  }, [gl, renderMode]);

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
        shadow-blurSamples={VSM_SHADOW_BLUR_SAMPLES}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
        shadow-normalBias={0.03}
        shadow-radius={VSM_SHADOW_RADIUS}
      />
      <object3D position={[center.x, center.y, center.z]} ref={targetRef} />
    </>
  );
}
