import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import { Box3, Color, Group, Vector3 } from "three";
import { applyWebHammerWorldSettings, clearWebHammerWorldSettings } from "@ggez/three-runtime";
import { toTuple, type SceneSettings } from "@ggez/shared";
import { PhysicsPropMesh, RenderLightNode, RenderStaticMesh, StaticPhysicsCollider } from "./PlaybackRenderables";
import { RuntimePlayer } from "./RuntimePlayer";
import type { AssetPathResolver, PlaybackSceneProps } from "./types";

type OrbitControlsHandle = {
  addEventListener?: (type: "start", listener: () => void) => void;
  removeEventListener?: (type: "start", listener: () => void) => void;
  target: Vector3;
  update: () => void;
};

export function PlaybackScene({
  cameraMode,
  gameplayRuntime,
  onNodeObjectChange,
  onNodePhysicsBodyChange,
  onPlayerActorChange,
  physicsPlayback,
  physicsRevision,
  renderScene,
  resolveAssetPath,
  sceneSettings
}: PlaybackSceneProps) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null) as MutableRefObject<OrbitControlsHandle | null>;
  const worldRootRef = useRef<Group | null>(null);
  const effectiveSettings = useMemo<SceneSettings>(
    () => ({
      ...sceneSettings,
      player: {
        ...sceneSettings.player,
        cameraMode
      }
    }),
    [cameraMode, sceneSettings]
  );

  return (
    <Canvas className="h-full w-full" dpr={0.5} camera={{ far: 2000, fov: 60, near: 0.1, position: [18, 12, 18] }} shadows>
      <PlaybackWorldSettings resolveAssetPath={resolveAssetPath} sceneSettings={effectiveSettings} />
      <ambientLight color={effectiveSettings.world.ambientColor} intensity={effectiveSettings.world.ambientIntensity} />
      <GameplayRuntimeTicker gameplayRuntime={gameplayRuntime} />
      <FrameSceneCamera
        active={physicsPlayback === "stopped"}
        controlsRef={controlsRef}
        fitKey={physicsRevision}
        worldRootRef={worldRootRef}
      />
      <group ref={worldRootRef}>
        <PlaybackWorld
          gameplayRuntime={gameplayRuntime}
          onNodeObjectChange={onNodeObjectChange}
          onNodePhysicsBodyChange={onNodePhysicsBodyChange}
          onPlayerActorChange={onPlayerActorChange}
          physicsPlayback={physicsPlayback}
          physicsRevision={physicsRevision}
          renderScene={renderScene}
          resolveAssetPath={resolveAssetPath}
          sceneSettings={effectiveSettings}
        />
      </group>
      <OrbitControls enabled={physicsPlayback === "stopped"} makeDefault ref={controlsRef as never} />
    </Canvas>
  );
}

function PlaybackWorldSettings({
  resolveAssetPath,
  sceneSettings
}: {
  resolveAssetPath: AssetPathResolver;
  sceneSettings: SceneSettings;
}) {
  const { scene } = useThree();

  useEffect(() => {
    scene.background = new Color(sceneSettings.world.fogColor);

    void applyWebHammerWorldSettings(
      scene,
      { settings: sceneSettings },
      {
        resolveAssetUrl: (context) => resolveAssetPath(context.path)
      }
    );

    return () => {
      clearWebHammerWorldSettings(scene);
      scene.background = null;
      scene.environment = null;
    };
  }, [resolveAssetPath, scene, sceneSettings]);

  return null;
}

function PlaybackWorld({
  gameplayRuntime,
  onNodeObjectChange,
  onNodePhysicsBodyChange,
  onPlayerActorChange,
  physicsPlayback,
  physicsRevision,
  renderScene,
  resolveAssetPath,
  sceneSettings
}: Pick<
  PlaybackSceneProps,
  "gameplayRuntime" | "onNodeObjectChange" | "onNodePhysicsBodyChange" | "onPlayerActorChange" | "physicsPlayback" | "physicsRevision" | "renderScene" | "resolveAssetPath" | "sceneSettings"
>) {
  const physicsActive = physicsPlayback !== "stopped" && sceneSettings.world.physicsEnabled;
  const playerSpawn = physicsActive ? renderScene.entityMarkers.find((entity) => entity.entityType === "player-spawn") : undefined;
  const physicsPropMeshes = physicsActive ? renderScene.meshes.filter((mesh) => mesh.physics?.enabled) : [];
  const staticMeshes = renderScene.meshes.filter(
    (mesh) => !physicsPropMeshes.some((candidate) => candidate.nodeId === mesh.nodeId)
  );

  return (
    <>
      {staticMeshes.map((mesh) => (
        <RenderStaticMesh key={mesh.nodeId} mesh={mesh} onNodeObjectChange={onNodeObjectChange} resolveAssetPath={resolveAssetPath} />
      ))}

      {physicsActive ? (
        <Physics
          gravity={toTuple(sceneSettings.world.gravity)}
          interpolate={false}
          key={`physics:${physicsRevision}`}
          paused={physicsPlayback !== "running"}
          timeStep={1 / 60}
        >
          {staticMeshes.map((mesh) => (
            <StaticPhysicsCollider key={`collider:${mesh.nodeId}`} mesh={mesh} onNodePhysicsBodyChange={onNodePhysicsBodyChange} />
          ))}
          {physicsPropMeshes.map((mesh) => (
            <PhysicsPropMesh
              key={`prop:${mesh.nodeId}`}
              mesh={mesh}
              onNodePhysicsBodyChange={onNodePhysicsBodyChange}
              resolveAssetPath={resolveAssetPath}
            />
          ))}
          {playerSpawn ? (
            <RuntimePlayer
              gameplayRuntime={gameplayRuntime}
              onActorChange={onPlayerActorChange}
              physicsPlayback={physicsPlayback}
              sceneSettings={sceneSettings}
              spawn={playerSpawn}
            />
          ) : null}
        </Physics>
      ) : null}

      {renderScene.lights.map((light) => (
        <RenderLightNode key={light.nodeId} light={light} onNodeObjectChange={onNodeObjectChange} />
      ))}
    </>
  );
}

function GameplayRuntimeTicker({ gameplayRuntime }: Pick<PlaybackSceneProps, "gameplayRuntime">) {
  useFrame((_, deltaSeconds) => {
    gameplayRuntime?.update(deltaSeconds);
  });

  return null;
}

function FrameSceneCamera({
  active,
  controlsRef,
  fitKey,
  worldRootRef
}: {
  active: boolean;
  controlsRef: RefObject<OrbitControlsHandle | null>;
  fitKey: number;
  worldRootRef: RefObject<Group | null>;
}) {
  const { camera } = useThree();
  const cameraPositionRef = useRef(new Vector3());
  const lookTargetRef = useRef(new Vector3());
  const nextPositionRef = useRef(new Vector3());
  const autoFitEnabledRef = useRef(true);
  const fitFramesRemainingRef = useRef(90);

  useEffect(() => {
    autoFitEnabledRef.current = active;
    fitFramesRemainingRef.current = active ? 90 : 0;
  }, [active, fitKey]);

  useEffect(() => {
    const controls = controlsRef.current;

    if (!controls?.addEventListener || !controls.removeEventListener) {
      return;
    }

    const handleInteractionStart = () => {
      autoFitEnabledRef.current = false;
      fitFramesRemainingRef.current = 0;
    };

    controls.addEventListener("start", handleInteractionStart);

    return () => {
      controls.removeEventListener?.("start", handleInteractionStart);
    };
  }, [controlsRef, fitKey]);

  useFrame((_, delta) => {
    if (!active || !worldRootRef.current || !autoFitEnabledRef.current || fitFramesRemainingRef.current <= 0) {
      return;
    }

    const bounds = new Box3().setFromObject(worldRootRef.current);

    if (bounds.isEmpty()) {
      return;
    }

    const center = bounds.getCenter(lookTargetRef.current);
    const size = bounds.getSize(cameraPositionRef.current);
    const maxExtent = Math.max(size.x, size.y, size.z, 2);
    const distance = maxExtent * 1.6;
    const nextPosition = nextPositionRef.current.set(center.x + distance, center.y + distance * 0.72, center.z + distance);

    camera.position.lerp(nextPosition, 1 - Math.exp(-delta * 4));
    controlsRef.current?.target.lerp(center, 1 - Math.exp(-delta * 5));
    controlsRef.current?.update();
    camera.lookAt(center);
    camera.near = 0.1;
    camera.far = Math.max(2000, distance * 12);
    camera.updateProjectionMatrix();
    fitFramesRemainingRef.current -= 1;
  });

  return null;
}
