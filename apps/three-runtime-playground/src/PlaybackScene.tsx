import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BallCollider,
  CapsuleCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  TrimeshCollider,
  type RapierRigidBody
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Side
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { DerivedEntityMarker, DerivedLight, DerivedRenderMesh, DerivedRenderScene } from "@web-hammer/render-pipeline";
import { createBlockoutTextureDataUri, resolveTransformPivot, toTuple, vec3, type MaterialRenderSide, type SceneSettings, type Vec3 } from "@web-hammer/shared";
import type { GameplayRuntime } from "@web-hammer/gameplay-runtime";

const previewTextureCache = new Map<string, ReturnType<TextureLoader["load"]>>();
const modelSceneCache = new Map<string, Object3D>();
const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const modelTextureLoader = new TextureLoader();

type AssetPathResolver = (path: string) => Promise<string> | string;
type OrbitControlsHandle = {
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
}: {
  cameraMode: "fps" | "third-person" | "top-down";
  gameplayRuntime?: GameplayRuntime;
  onNodeObjectChange?: (nodeId: string, object: Object3D | null) => void;
  onNodePhysicsBodyChange?: (nodeId: string, body: RapierRigidBody | null) => void;
  onPlayerActorChange?: (actor: { height?: number; id: string; position: Vec3; radius?: number; tags: string[] } | null) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderScene: DerivedRenderScene;
  resolveAssetPath: AssetPathResolver;
  sceneSettings: SceneSettings;
}) {
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
    <Canvas dpr={0.5} camera={{ far: 2000, fov: 60, near: 0.1, position: [18, 12, 18] }} shadows>
      <color args={[effectiveSettings.world.fogColor]} attach="background" />
      <fog attach="fog" args={[effectiveSettings.world.fogColor, effectiveSettings.world.fogNear, effectiveSettings.world.fogFar]} />
      <ambientLight color={effectiveSettings.world.ambientColor} intensity={effectiveSettings.world.ambientIntensity} />
      <GameplayRuntimeTicker gameplayRuntime={gameplayRuntime} />
      <FrameSceneCamera active={physicsPlayback === "stopped"} controlsRef={controlsRef} worldRootRef={worldRootRef} />
      <group ref={worldRootRef}>
        <PlaybackWorld
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

function PlaybackWorld({
  onNodeObjectChange,
  onNodePhysicsBodyChange,
  onPlayerActorChange,
  physicsPlayback,
  physicsRevision,
  renderScene,
  resolveAssetPath,
  sceneSettings
}: {
  onNodeObjectChange?: (nodeId: string, object: Object3D | null) => void;
  onNodePhysicsBodyChange?: (nodeId: string, body: RapierRigidBody | null) => void;
  onPlayerActorChange?: (actor: { height?: number; id: string; position: Vec3; radius?: number; tags: string[] } | null) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderScene: DerivedRenderScene;
  resolveAssetPath: AssetPathResolver;
  sceneSettings: SceneSettings;
}) {
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

function GameplayRuntimeTicker({ gameplayRuntime }: { gameplayRuntime?: GameplayRuntime }) {
  useFrame((_, deltaSeconds) => {
    gameplayRuntime?.update(deltaSeconds);
  });

  return null;
}

function FrameSceneCamera({
  active,
  controlsRef,
  worldRootRef
}: {
  active: boolean;
  controlsRef: RefObject<OrbitControlsHandle | null>;
  worldRootRef: RefObject<Group | null>;
}) {
  const { camera } = useThree();
  const cameraPositionRef = useRef(new Vector3());
  const lookTargetRef = useRef(new Vector3());

  useFrame((_, delta) => {
    if (!active || !worldRootRef.current) {
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
    const nextPosition = new Vector3(center.x + distance, center.y + distance * 0.72, center.z + distance);

    camera.position.lerp(nextPosition, 1 - Math.exp(-delta * 4));
    controlsRef.current?.target.lerp(center, 1 - Math.exp(-delta * 5));
    controlsRef.current?.update();
    camera.lookAt(center);
    camera.near = 0.1;
    camera.far = Math.max(2000, distance * 12);
    camera.updateProjectionMatrix();
  });

  return null;
}

function RuntimePlayer({
  onActorChange,
  physicsPlayback,
  sceneSettings,
  spawn
}: {
  onActorChange?: (actor: { height?: number; id: string; position: Vec3; radius?: number; tags: string[] } | null) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  sceneSettings: SceneSettings;
  spawn: DerivedEntityMarker;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const keyStateRef = useRef(new Set<string>());
  const jumpQueuedRef = useRef(false);
  const groundedColliderHandlesRef = useRef(new Set<number>());
  const groundedBodiesRef = useRef(new Map<number, RapierRigidBody>());
  const yawRef = useRef(spawn.rotation.y);
  const pitchRef = useRef(sceneSettings.player.cameraMode === "fps" ? 0 : -0.2);
  const eyeAnchorRef = useRef<Object3D | null>(null);
  const visualRef = useRef<Object3D | null>(null);
  const cameraPositionRef = useRef(new Vector3());
  const cameraTargetRef = useRef(new Vector3());
  const eyeWorldPositionRef = useRef(new Vector3());
  const lookTargetRef = useRef(new Vector3());
  const directionRef = useRef(new Vector3());
  const orbitDirectionRef = useRef(new Vector3());
  const forwardRef = useRef(new Vector3());
  const rightRef = useRef(new Vector3());
  const moveRef = useRef(new Vector3());
  const { camera, gl } = useThree();

  const standingHeight = Math.max(1.2, sceneSettings.player.height);
  const crouchHeight = sceneSettings.player.canCrouch
    ? clampNumber(sceneSettings.player.crouchHeight, 0.9, standingHeight - 0.15)
    : standingHeight;
  const colliderRadius = useMemo(() => clampNumber(standingHeight * 0.18, 0.24, 0.42), [standingHeight]);
  const capsuleHalfHeight = useMemo(() => Math.max(0.12, standingHeight * 0.5 - colliderRadius), [colliderRadius, standingHeight]);
  const capsuleCylinderHeight = Math.max(0.12, standingHeight - colliderRadius * 2);
  const footOffset = capsuleHalfHeight + colliderRadius;
  const playerGeometry = useMemo(() => new CapsuleGeometry(colliderRadius, capsuleCylinderHeight, 6, 14), [capsuleCylinderHeight, colliderRadius]);
  const spawnPosition = useMemo<[number, number, number]>(
    () => [spawn.position.x, spawn.position.y + standingHeight * 0.5 + 0.04, spawn.position.z],
    [spawn.position.x, spawn.position.y, spawn.position.z, standingHeight]
  );

  useEffect(() => () => playerGeometry.dispose(), [playerGeometry]);

  useEffect(() => {
    yawRef.current = spawn.rotation.y;
    pitchRef.current = sceneSettings.player.cameraMode === "fps" ? 0 : sceneSettings.player.cameraMode === "third-person" ? -0.22 : -0.78;
  }, [sceneSettings.player.cameraMode, spawn.rotation.y]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      keyStateRef.current.add(event.code);

      if (event.code === "Space") {
        jumpQueuedRef.current = true;
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keyStateRef.current.delete(event.code);
    };

    const handleWindowBlur = () => {
      keyStateRef.current.clear();
      jumpQueuedRef.current = false;
      groundedColliderHandlesRef.current.clear();
      groundedBodiesRef.current.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const domElement = gl.domElement;

    const handleCanvasClick = () => {
      if (physicsPlayback !== "running" || document.pointerLockElement === domElement) {
        return;
      }

      void domElement.requestPointerLock();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (physicsPlayback !== "running" || document.pointerLockElement !== domElement) {
        return;
      }

      yawRef.current -= event.movementX * 0.0024;
      pitchRef.current = clampNumber(
        pitchRef.current - event.movementY * 0.0018,
        sceneSettings.player.cameraMode === "fps" ? -1.35 : -1.25,
        sceneSettings.player.cameraMode === "fps" ? 1.35 : sceneSettings.player.cameraMode === "top-down" ? -0.12 : 0.4
      );
    };

    domElement.addEventListener("click", handleCanvasClick);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      domElement.removeEventListener("click", handleCanvasClick);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [gl, physicsPlayback, sceneSettings.player.cameraMode]);

  useEffect(() => {
    const domElement = gl.domElement;

    if (physicsPlayback === "running" || document.pointerLockElement !== domElement) {
      return;
    }

    document.exitPointerLock();
  }, [gl, physicsPlayback]);

  useEffect(() => () => {
    onActorChange?.(null);
  }, [onActorChange]);

  useFrame((_, delta) => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const running = physicsPlayback === "running";
    const translation = body.translation();
    const linearVelocity = body.linvel();
    const supportBody = groundedBodiesRef.current.values().next().value;
    const supportVelocity = supportBody?.linvel();
    const keyState = keyStateRef.current;
    const crouching = running && sceneSettings.player.canCrouch && (keyState.has("ControlLeft") || keyState.has("ControlRight") || keyState.has("KeyC"));
    const currentHeight = crouchHeight && crouching ? crouchHeight : standingHeight;
    const speed = sceneSettings.player.canRun && running && (keyState.has("ShiftLeft") || keyState.has("ShiftRight"))
      ? sceneSettings.player.runningSpeed
      : sceneSettings.player.movementSpeed;
    const moveInputX = (keyState.has("KeyD") || keyState.has("ArrowRight") ? 1 : 0) - (keyState.has("KeyA") || keyState.has("ArrowLeft") ? 1 : 0);
    const moveInputZ = (keyState.has("KeyW") || keyState.has("ArrowUp") ? 1 : 0) - (keyState.has("KeyS") || keyState.has("ArrowDown") ? 1 : 0);
    const viewDirection = resolveViewDirection(yawRef.current, pitchRef.current, directionRef.current);
    const forwardDirection = forwardRef.current.set(viewDirection.x, 0, viewDirection.z);
    const rightDirection = rightRef.current;
    const moveDirection = moveRef.current.set(0, 0, 0);

    if (forwardDirection.lengthSq() > 0) {
      forwardDirection.normalize();
    } else {
      forwardDirection.set(0, 0, -1);
    }

    rightDirection.set(-forwardDirection.z, 0, forwardDirection.x).normalize();
    moveDirection.addScaledVector(rightDirection, moveInputX).addScaledVector(forwardDirection, moveInputZ);

    if (running) {
      if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize().multiplyScalar(crouching ? speed * 0.58 : speed);
      }

      body.setLinvel(
        {
          x: moveDirection.x + (supportVelocity?.x ?? 0),
          y: linearVelocity.y,
          z: moveDirection.z + (supportVelocity?.z ?? 0)
        },
        true
      );

      if (jumpQueuedRef.current) {
        if (sceneSettings.player.canJump && groundedColliderHandlesRef.current.size > 0) {
          const gravityMagnitude = Math.max(
            0.001,
            Math.hypot(sceneSettings.world.gravity.x, sceneSettings.world.gravity.y, sceneSettings.world.gravity.z)
          );

          body.setLinvel(
            {
              x: moveDirection.x + (supportVelocity?.x ?? 0),
              y: Math.sqrt(2 * gravityMagnitude * sceneSettings.player.jumpHeight),
              z: moveDirection.z + (supportVelocity?.z ?? 0)
            },
            true
          );
          groundedColliderHandlesRef.current.clear();
          groundedBodiesRef.current.clear();
        }

        jumpQueuedRef.current = false;
      }
    }

    if (visualRef.current) {
      visualRef.current.rotation.set(0, yawRef.current, 0);
      visualRef.current.scale.y = clampNumber(currentHeight / standingHeight, 0.55, 1);
      visualRef.current.position.y = (standingHeight - currentHeight) * -0.22;
    }

    const eyeHeight = Math.max(colliderRadius * 1.5, currentHeight * 0.92);
    const eyePosition = eyeWorldPositionRef.current;

    if (eyeAnchorRef.current) {
      eyeAnchorRef.current.position.set(0, -standingHeight * 0.5 + eyeHeight, 0);
      eyeAnchorRef.current.updateWorldMatrix(true, false);
      eyeAnchorRef.current.getWorldPosition(eyePosition);
    } else {
      eyePosition.set(translation.x, translation.y - standingHeight * 0.5 + eyeHeight, translation.z);
    }

    cameraTargetRef.current.copy(eyePosition);
    const nextCameraPosition = cameraPositionRef.current;
    const nextLookTarget = lookTargetRef.current;

    if (sceneSettings.player.cameraMode === "fps") {
      nextCameraPosition.copy(eyePosition);
      nextLookTarget.copy(eyePosition).add(viewDirection);
      camera.position.copy(nextCameraPosition);
      camera.lookAt(nextLookTarget);
    } else if (sceneSettings.player.cameraMode === "third-person") {
      const followDistance = Math.max(3.2, standingHeight * 2.7);

      nextCameraPosition.copy(eyePosition).addScaledVector(viewDirection, -followDistance);
      nextCameraPosition.y += standingHeight * 0.24;
      camera.position.lerp(nextCameraPosition, 1 - Math.exp(-delta * 10));
      camera.lookAt(eyePosition);
    } else {
      const topDownDirection = resolveViewDirection(yawRef.current, pitchRef.current, orbitDirectionRef.current);
      const followDistance = Math.max(8, standingHeight * 5.2);

      nextCameraPosition.copy(eyePosition).addScaledVector(topDownDirection, -followDistance);
      nextCameraPosition.y += standingHeight * 1.8;
      camera.position.lerp(nextCameraPosition, 1 - Math.exp(-delta * 8));
      camera.lookAt(eyePosition);
    }

    onActorChange?.({
      height: currentHeight,
      id: "player",
      position: vec3(translation.x, translation.y, translation.z),
      radius: colliderRadius,
      tags: ["player"]
    });
  });

  return (
    <RigidBody
      canSleep={false}
      ccd
      colliders={false}
      linearDamping={0.8}
      lockRotations
      position={spawnPosition}
      ref={bodyRef}
      type="dynamic"
    >
      <CapsuleCollider args={[capsuleHalfHeight, colliderRadius]} friction={0} restitution={0} />
      <CuboidCollider
        args={[colliderRadius * 0.72, 0.05, colliderRadius * 0.72]}
        onIntersectionEnter={(payload) => {
          groundedColliderHandlesRef.current.add(payload.other.collider.handle);

          if (payload.other.rigidBody) {
            groundedBodiesRef.current.set(payload.other.collider.handle, payload.other.rigidBody);
          }
        }}
        onIntersectionExit={(payload) => {
          groundedColliderHandlesRef.current.delete(payload.other.collider.handle);
          groundedBodiesRef.current.delete(payload.other.collider.handle);
        }}
        position={[0, -(footOffset + 0.04), 0]}
        sensor
      />
      <group>
        <object3D ref={eyeAnchorRef} />
        <group ref={visualRef} visible={sceneSettings.player.cameraMode !== "fps"}>
          <mesh castShadow receiveShadow>
            <primitive attach="geometry" object={playerGeometry} />
            <meshStandardMaterial color="#7dd3fc" emissive="#0f4c81" emissiveIntensity={0.12} flatShading roughness={0.62} />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}

function RenderStaticMesh({
  mesh,
  onNodeObjectChange,
  resolveAssetPath
}: {
  mesh: DerivedRenderMesh;
  onNodeObjectChange?: (nodeId: string, object: Object3D | null) => void;
  resolveAssetPath: AssetPathResolver;
}) {
  const groupRef = useRef<Group | null>(null);

  useEffect(() => {
    onNodeObjectChange?.(mesh.nodeId, groupRef.current);
    return () => {
      onNodeObjectChange?.(mesh.nodeId, null);
    };
  }, [mesh.nodeId, onNodeObjectChange]);

  if (!mesh.surface && !mesh.primitive && !mesh.modelPath) {
    return null;
  }

  return (
    <group position={toTuple(mesh.position)} ref={groupRef} rotation={toTuple(mesh.rotation)} scale={toTuple(mesh.scale)}>
      <RenderNodeBody mesh={mesh} resolveAssetPath={resolveAssetPath} />
    </group>
  );
}

function PhysicsPropMesh({
  mesh,
  onNodePhysicsBodyChange,
  resolveAssetPath
}: {
  mesh: DerivedRenderMesh;
  onNodePhysicsBodyChange?: (nodeId: string, body: RapierRigidBody | null) => void;
  resolveAssetPath: AssetPathResolver;
}) {
  const physics = mesh.physics;
  const colliderProps = useMemo(() => resolvePhysicsColliderProps(mesh.physics), [mesh.physics]);
  const bodyRef = useRef<RapierRigidBody | null>(null);

  if (!physics) {
    return null;
  }

  useEffect(() => {
    onNodePhysicsBodyChange?.(mesh.nodeId, bodyRef.current);
    return () => {
      onNodePhysicsBodyChange?.(mesh.nodeId, null);
    };
  }, [mesh.nodeId, onNodePhysicsBodyChange]);

  const useTrimeshCollider = physics.colliderShape === "trimesh" || !mesh.primitive;

  return (
    <RigidBody
      angularDamping={physics.angularDamping}
      canSleep={physics.canSleep}
      ccd={physics.ccd}
      colliders={false}
      gravityScale={physics.gravityScale}
      linearDamping={physics.linearDamping}
      lockRotations={physics.lockRotations}
      lockTranslations={physics.lockTranslations}
      position={toTuple(mesh.position)}
      ref={bodyRef}
      rotation={toTuple(mesh.rotation)}
      type={physics.bodyType}
    >
      {!useTrimeshCollider ? <ManualCollider mesh={mesh} /> : <TrimeshPhysicsCollider colliderProps={colliderProps} mesh={mesh} />}
      <group scale={toTuple(mesh.scale)}>
        <RenderNodeBody mesh={mesh} resolveAssetPath={resolveAssetPath} />
      </group>
    </RigidBody>
  );
}

function RenderNodeBody({ mesh, resolveAssetPath }: { mesh: DerivedRenderMesh; resolveAssetPath: AssetPathResolver }) {
  if (mesh.modelPath) {
    return <RenderModelBody mesh={mesh} resolveAssetPath={resolveAssetPath} />;
  }

  return <RenderMeshBody mesh={mesh} resolveAssetPath={resolveAssetPath} />;
}

function StaticPhysicsCollider({
  mesh,
  onNodePhysicsBodyChange
}: {
  mesh: DerivedRenderMesh;
  onNodePhysicsBodyChange?: (nodeId: string, body: RapierRigidBody | null) => void;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);

  useEffect(() => {
    onNodePhysicsBodyChange?.(mesh.nodeId, bodyRef.current);
    return () => {
      onNodePhysicsBodyChange?.(mesh.nodeId, null);
    };
  }, [mesh.nodeId, onNodePhysicsBodyChange]);

  return (
    <RigidBody colliders={false} position={toTuple(mesh.position)} ref={bodyRef} rotation={toTuple(mesh.rotation)} type="kinematicPosition">
      <TrimeshPhysicsCollider mesh={mesh} />
    </RigidBody>
  );
}

function TrimeshPhysicsCollider({
  colliderProps,
  mesh
}: {
  colliderProps?: ReturnType<typeof resolvePhysicsColliderProps>;
  mesh: DerivedRenderMesh;
}) {
  const colliderArgs = useTrimeshColliderArgs(mesh);
  const pivot = resolveMeshPivot(mesh);

  if (!colliderArgs) {
    return null;
  }

  return (
    <group scale={toTuple(mesh.scale)}>
      <TrimeshCollider args={colliderArgs} position={[-pivot.x, -pivot.y, -pivot.z]} {...colliderProps} />
    </group>
  );
}

function useTrimeshColliderArgs(mesh: DerivedRenderMesh): [ArrayLike<number>, ArrayLike<number>] | undefined {
  const geometry = useRenderableGeometry(mesh);
  const fallbackIndices = useMemo(() => {
    if (!geometry) {
      return new Uint32Array();
    }

    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    return Uint32Array.from({ length: positionCount }, (_, index) => index);
  }, [geometry]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) {
    return undefined;
  }

  return [geometry.getAttribute("position").array, geometry.getIndex()?.array ?? fallbackIndices];
}

function RenderMeshBody({ mesh, resolveAssetPath }: { mesh: DerivedRenderMesh; resolveAssetPath: AssetPathResolver }) {
  const geometry = useRenderableGeometry(mesh);
  const previewMaterials = usePreviewMaterials(mesh, resolveAssetPath);
  const pivot = resolveMeshPivot(mesh);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => previewMaterials.forEach((material) => material.dispose()), [previewMaterials]);

  if (!geometry) {
    return null;
  }

  return (
    <group position={[-pivot.x, -pivot.y, -pivot.z]}>
      <mesh castShadow receiveShadow>
        <primitive attach="geometry" object={geometry} />
        <primitive attach="material" object={previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials} />
      </mesh>
    </group>
  );
}

function RenderModelBody({
  mesh,
  resolveAssetPath
}: {
  mesh: DerivedRenderMesh;
  resolveAssetPath: AssetPathResolver;
}) {
  const loadedScene = useLoadedModelScene(
    mesh.modelPath,
    mesh.modelFormat === "obj" ? "obj" : "glb",
    mesh.modelTexturePath,
    mesh.modelMtlText,
    resolveAssetPath
  );
  const loadedBounds = useMemo(() => (loadedScene ? computeModelBounds(loadedScene) : undefined), [loadedScene]);
  const modelScene = useMemo(() => {
    if (!loadedScene) {
      return undefined;
    }

    const clone = loadedScene.clone(true);
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [loadedScene]);
  const modelBounds = loadedBounds ?? (mesh.modelSize && mesh.modelCenter ? { center: mesh.modelCenter, size: mesh.modelSize } : undefined);
  const center = modelBounds?.center ?? mesh.modelCenter ?? { x: 0, y: 0, z: 0 };

  return modelScene ? (
    <primitive object={modelScene} position={[-center.x, -center.y, -center.z]} />
  ) : (
    <mesh castShadow receiveShadow>
      <boxGeometry args={toTuple(mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
      <meshStandardMaterial color={mesh.material.color} metalness={0.08} roughness={0.72} />
    </mesh>
  );
}

function useLoadedModelScene(
  path?: string,
  format: "glb" | "obj" = "glb",
  texturePath?: string,
  mtlText?: string,
  resolveAssetPath?: AssetPathResolver
) {
  const [scene, setScene] = useState<Object3D>();

  useEffect(() => {
    if (!path) {
      setScene(undefined);
      return;
    }

    let cancelled = false;

    void Promise.all([
      Promise.resolve(resolveAssetPath ? resolveAssetPath(path) : path),
      texturePath ? Promise.resolve(resolveAssetPath ? resolveAssetPath(texturePath) : texturePath) : Promise.resolve(undefined)
    ])
      .then(async ([resolvedPath, resolvedTexturePath]) => {
        const cacheKey = `${format}:${resolvedPath}:${resolvedTexturePath ?? ""}:${mtlText ?? ""}`;
        const cachedScene = modelSceneCache.get(cacheKey);

        if (cachedScene) {
          return cachedScene;
        }

        const loadedScene = await loadModelScene(resolvedPath, format, resolvedTexturePath, mtlText);
        modelSceneCache.set(cacheKey, loadedScene);
        return loadedScene;
      })
      .then((loadedScene) => {
        if (!cancelled) {
          setScene(loadedScene);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScene(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [format, mtlText, path, resolveAssetPath, texturePath]);

  return scene;
}

async function loadModelScene(path: string, format: "glb" | "obj", texturePath?: string, mtlText?: string) {
  if (format === "obj") {
    const objLoader = new OBJLoader();

    if (mtlText) {
      const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, texturePath), "");
      materialCreator.preload();
      objLoader.setMaterials(materialCreator);
    }

    const object = await objLoader.loadAsync(path);

    if (!mtlText && texturePath) {
      const texture = await loadModelTexture(texturePath);

      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = new MeshStandardMaterial({
            map: texture,
            metalness: 0.12,
            roughness: 0.76
          });
        }
      });
    }

    return object;
  }

  const gltf = await gltfLoader.loadAsync(path);
  return gltf.scene;
}

async function loadModelTexture(path: string) {
  const cacheKey = `model:${path}`;
  const cached = previewTextureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const texture = await modelTextureLoader.loadAsync(path);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  previewTextureCache.set(cacheKey, texture);
  return texture;
}

function computeModelBounds(scene: Object3D) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  return {
    center: { x: center.x, y: center.y, z: center.z },
    size: {
      x: Math.max(size.x, 0.001),
      y: Math.max(size.y, 0.001),
      z: Math.max(size.z, 0.001)
    }
  };
}

function RenderLightNode({
  light,
  onNodeObjectChange
}: {
  light: DerivedLight;
  onNodeObjectChange?: (nodeId: string, object: Object3D | null) => void;
}) {
  const targetRef = useRef<Object3D | null>(null);
  const lightRef = useRef<{ target?: Object3D } | null>(null);
  const groupRef = useRef<Group | null>(null);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      targetRef.current.updateMatrixWorld();
    }
  }, [light.nodeId, light.rotation.x, light.rotation.y, light.rotation.z]);

  useEffect(() => {
    onNodeObjectChange?.(light.nodeId, groupRef.current);
    return () => {
      onNodeObjectChange?.(light.nodeId, null);
    };
  }, [light.nodeId, onNodeObjectChange]);

  if (!light.data.enabled) {
    return null;
  }

  return (
    <group position={toTuple(light.position)} ref={groupRef} rotation={toTuple(light.rotation)}>
      {light.data.type === "ambient" ? <ambientLight color={light.data.color} intensity={light.data.intensity} /> : null}
      {light.data.type === "hemisphere" ? (
        <hemisphereLight args={[light.data.color, light.data.groundColor ?? "#0f1721", light.data.intensity]} />
      ) : null}
      {light.data.type === "point" ? (
        <pointLight castShadow={light.data.castShadow} color={light.data.color} decay={light.data.decay} distance={light.data.distance} intensity={light.data.intensity} />
      ) : null}
      {light.data.type === "directional" ? (
        <>
          <directionalLight castShadow={light.data.castShadow} color={light.data.color} intensity={light.data.intensity} ref={lightRef} />
          <object3D position={[0, 0, -6]} ref={targetRef} />
        </>
      ) : null}
      {light.data.type === "spot" ? (
        <>
          <spotLight
            angle={light.data.angle}
            castShadow={light.data.castShadow}
            color={light.data.color}
            decay={light.data.decay}
            distance={light.data.distance}
            intensity={light.data.intensity}
            penumbra={light.data.penumbra}
            ref={lightRef}
          />
          <object3D position={[0, 0, -6]} ref={targetRef} />
        </>
      ) : null}
    </group>
  );
}

function ManualCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  const pivot = resolveMeshPivot(mesh);
  const commonProps = {
    position: [-pivot.x, -pivot.y, -pivot.z] as [number, number, number],
    scale: toTuple(mesh.scale),
    ...resolvePhysicsColliderProps(mesh.physics)
  };

  if (!mesh.primitive || !mesh.physics) {
    return null;
  }

  if (mesh.physics.colliderShape === "ball" && mesh.primitive.kind === "sphere") {
    return <BallCollider args={[mesh.primitive.radius]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cuboid" && mesh.primitive.kind === "box") {
    return <CuboidCollider args={[mesh.primitive.size.x * 0.5, mesh.primitive.size.y * 0.5, mesh.primitive.size.z * 0.5]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cylinder" && mesh.primitive.kind === "cylinder") {
    return <CylinderCollider args={[mesh.primitive.height * 0.5, Math.max(mesh.primitive.radiusTop, mesh.primitive.radiusBottom)]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cone" && mesh.primitive.kind === "cone") {
    return <ConeCollider args={[mesh.primitive.height * 0.5, mesh.primitive.radius]} {...commonProps} />;
  }

  return null;
}

function resolvePhysicsColliderProps(physics: DerivedRenderMesh["physics"]) {
  if (!physics) {
    return {};
  }

  return {
    ...(physics.contactSkin !== undefined ? { contactSkin: physics.contactSkin } : {}),
    ...(physics.density !== undefined ? { density: physics.density } : physics.mass !== undefined ? { mass: physics.mass } : {}),
    ...(physics.friction !== undefined ? { friction: physics.friction } : {}),
    ...(physics.restitution !== undefined ? { restitution: physics.restitution } : {}),
    ...(physics.sensor !== undefined ? { sensor: physics.sensor } : {})
  };
}

function useRenderableGeometry(mesh: DerivedRenderMesh) {
  return useMemo(() => {
    let bufferGeometry: BufferGeometry | undefined;

    if (mesh.surface) {
      bufferGeometry = createIndexedGeometry(mesh.surface.positions, mesh.surface.indices, mesh.surface.uvs, mesh.surface.groups);
    } else if (mesh.primitive?.kind === "box") {
      bufferGeometry = new BoxGeometry(...toTuple(mesh.primitive.size));
    } else if (mesh.primitive?.kind === "sphere") {
      bufferGeometry = new SphereGeometry(mesh.primitive.radius, mesh.primitive.widthSegments, mesh.primitive.heightSegments);
    } else if (mesh.primitive?.kind === "cylinder") {
      bufferGeometry = new CylinderGeometry(mesh.primitive.radiusTop, mesh.primitive.radiusBottom, mesh.primitive.height, mesh.primitive.radialSegments);
    } else if (mesh.primitive?.kind === "cone") {
      bufferGeometry = new ConeGeometry(mesh.primitive.radius, mesh.primitive.height, mesh.primitive.radialSegments);
    }

    if (!bufferGeometry) {
      return undefined;
    }

    bufferGeometry.computeVertexNormals();
    bufferGeometry.computeBoundingBox();
    bufferGeometry.computeBoundingSphere();
    return bufferGeometry;
  }, [mesh.primitive, mesh.surface]);
}

function usePreviewMaterials(mesh: DerivedRenderMesh, resolveAssetPath: AssetPathResolver) {
  const resolvedSpecs = useResolvedMaterialSpecs(mesh, resolveAssetPath);

  return useMemo(() => resolvedSpecs.map((spec) => createPreviewMaterial(spec)), [resolvedSpecs]);
}

function useResolvedMaterialSpecs(mesh: DerivedRenderMesh, resolveAssetPath: AssetPathResolver) {
  const specs = useMemo(() => mesh.materials ?? [mesh.material], [mesh.material, mesh.materials]);
  const [resolvedSpecs, setResolvedSpecs] = useState(specs);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      specs.map(async (spec) => ({
        ...spec,
        colorTexture: spec.colorTexture ? await Promise.resolve(resolveAssetPath(spec.colorTexture)) : spec.colorTexture,
        metalnessTexture: spec.metalnessTexture ? await Promise.resolve(resolveAssetPath(spec.metalnessTexture)) : spec.metalnessTexture,
        normalTexture: spec.normalTexture ? await Promise.resolve(resolveAssetPath(spec.normalTexture)) : spec.normalTexture,
        roughnessTexture: spec.roughnessTexture ? await Promise.resolve(resolveAssetPath(spec.roughnessTexture)) : spec.roughnessTexture
      }))
    ).then((nextSpecs) => {
      if (!cancelled) {
        setResolvedSpecs(nextSpecs);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resolveAssetPath, specs]);

  return resolvedSpecs;
}

function resolveMeshPivot(mesh: DerivedRenderMesh) {
  return resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });
}

function createPreviewMaterial(spec: DerivedRenderMesh["material"]) {
  const colorTexture = spec.colorTexture
    ? loadTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? loadTexture(createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018), true)
      : undefined;
  const normalTexture = spec.normalTexture ? loadTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadTexture(spec.roughnessTexture, false) : undefined;

  return new MeshStandardMaterial({
    color: colorTexture ? "#ffffff" : spec.color,
    flatShading: spec.flatShaded,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    side: resolvePreviewMaterialSide(spec.side),
    wireframe: spec.wireframe,
    ...(colorTexture ? { map: colorTexture } : {}),
    ...(metalnessTexture ? { metalnessMap: metalnessTexture } : {}),
    ...(normalTexture ? { normalMap: normalTexture } : {}),
    ...(roughnessTexture ? { roughnessMap: roughnessTexture } : {})
  });
}

function loadTexture(source: string, isColor: boolean) {
  const cacheKey = `${isColor ? "color" : "data"}:${source}`;
  const cached = previewTextureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const texture = new TextureLoader().load(source);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  if (isColor) {
    texture.colorSpace = SRGBColorSpace;
  }

  previewTextureCache.set(cacheKey, texture);
  return texture;
}

function resolvePreviewMaterialSide(side?: MaterialRenderSide): Side {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

function createIndexedGeometry(positions: number[], indices?: number[], uvs?: number[], groups?: Array<{ count: number; materialIndex: number; start: number }>) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  if (uvs) {
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }

  if (indices) {
    geometry.setIndex(indices);
  }

  geometry.clearGroups();
  groups?.forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  });

  return geometry;
}

function resolveViewDirection(yaw: number, pitch: number, target: Vector3) {
  return target.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
}

function clampNumber(value: number, min: number, max: number) {
  return MathUtils.clamp(value, min, max);
}

function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern = /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap ? normalized : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}
