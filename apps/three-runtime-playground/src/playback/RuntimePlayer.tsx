import { useBeforePhysicsStep, CapsuleCollider, CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { CapsuleGeometry, Group, MathUtils, Object3D, Quaternion, Vector3 } from "three";
import type { GameplayRuntime } from "@ggez/gameplay-runtime";
import type { DerivedEntityMarker } from "@ggez/render-pipeline";
import { vec3, type SceneSettings } from "@ggez/shared";
import type { PlaybackPhysicsState, PlayerActor } from "./types";

const PHYSICS_STEP_SECONDS = 1 / 60;

export function RuntimePlayer({
  gameplayRuntime,
  onActorChange,
  physicsPlayback,
  sceneSettings,
  spawn
}: {
  gameplayRuntime?: GameplayRuntime;
  onActorChange?: (actor: PlayerActor | null) => void;
  physicsPlayback: PlaybackPhysicsState;
  sceneSettings: SceneSettings;
  spawn: DerivedEntityMarker;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const keyStateRef = useRef(new Set<string>());
  const jumpQueuedRef = useRef(false);
  const groundedColliderHandlesRef = useRef(new Set<number>());
  const groundedBodiesRef = useRef(new Map<number, RapierRigidBody>());
  const activeSupportHandleRef = useRef<number | null>(null);
  const yawRef = useRef(spawn.rotation.y);
  const pitchRef = useRef(sceneSettings.player.cameraMode === "fps" ? 0 : -0.2);
  const renderRootRef = useRef<Group | null>(null);
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
  const supportVelocityRef = useRef(new Vector3());
  const supportPointRef = useRef(new Vector3());
  const supportBodyPositionRef = useRef(new Vector3());
  const supportBodyNextPositionRef = useRef(new Vector3());
  const supportLocalPointRef = useRef(new Vector3());
  const supportMovedPointRef = useRef(new Vector3());
  const supportAngularVelocityRef = useRef(new Vector3());
  const supportRotationRef = useRef(new Quaternion());
  const supportNextRotationRef = useRef(new Quaternion());
  const supportInverseRotationRef = useRef(new Quaternion());
  const smoothedTranslationRef = useRef(new Vector3());
  const rawTranslationRef = useRef(new Vector3());
  const renderOffsetRef = useRef(new Vector3());
  const renderTranslationInitializedRef = useRef(false);
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
    smoothedTranslationRef.current.set(...spawnPosition);
    rawTranslationRef.current.set(...spawnPosition);
    renderOffsetRef.current.set(0, 0, 0);
    renderTranslationInitializedRef.current = false;
  }, [sceneSettings.player.cameraMode, spawn.rotation.y, spawnPosition]);

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

      if (
        event.code === (sceneSettings.player.interactKey || "KeyE") &&
        sceneSettings.player.canInteract !== false &&
        gameplayRuntime
      ) {
        gameplayRuntime.getHookTargetsByType("interactable")
          .filter((t) => t.hook.enabled !== false)
          .forEach((t) => {
            gameplayRuntime!.emitEvent({
              event: "interact.requested",
              sourceId: "player",
              sourceKind: "system",
              targetId: t.targetId
            });
          });
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
      activeSupportHandleRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [gameplayRuntime, sceneSettings.player.interactKey, sceneSettings.player.canInteract]);

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

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const running = physicsPlayback === "running";
    const translation = body.translation();
    const linearVelocity = body.linvel();
    const keyState = keyStateRef.current;
    const crouching = running && sceneSettings.player.canCrouch && (keyState.has("ControlLeft") || keyState.has("ControlRight") || keyState.has("KeyC"));
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

    const supportBody = resolveActiveSupportBody(
      groundedBodiesRef.current,
      groundedColliderHandlesRef.current,
      activeSupportHandleRef
    );
    const grounded = groundedColliderHandlesRef.current.size > 0;
    const supportVelocity = supportVelocityRef.current;

    if (grounded && supportBody) {
      resolveSupportVelocityAtPoint(
        supportBody,
        supportPointRef.current.set(translation.x, translation.y - footOffset, translation.z),
        PHYSICS_STEP_SECONDS,
        {
          angularVelocity: supportAngularVelocityRef.current,
          bodyPosition: supportBodyPositionRef.current,
          bodyNextPosition: supportBodyNextPositionRef.current,
          inverseRotation: supportInverseRotationRef.current,
          localPoint: supportLocalPointRef.current,
          movedPoint: supportMovedPointRef.current,
          nextRotation: supportNextRotationRef.current,
          rotation: supportRotationRef.current
        },
        supportVelocity
      );
    } else {
      supportVelocity.set(0, 0, 0);
    }

    if (running) {
      if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize().multiplyScalar(crouching ? speed * 0.58 : speed);
      }

      body.setLinvel(
        {
          x: moveDirection.x + supportVelocity.x,
          y: grounded ? supportVelocity.y : linearVelocity.y,
          z: moveDirection.z + supportVelocity.z
        },
        true
      );

      if (jumpQueuedRef.current) {
        if (sceneSettings.player.canJump && grounded) {
          const gravityMagnitude = Math.max(
            0.001,
            Math.hypot(sceneSettings.world.gravity.x, sceneSettings.world.gravity.y, sceneSettings.world.gravity.z)
          );

          body.setLinvel(
            {
              x: moveDirection.x + supportVelocity.x,
              y: supportVelocity.y + Math.sqrt(2 * gravityMagnitude * sceneSettings.player.jumpHeight),
              z: moveDirection.z + supportVelocity.z
            },
            true
          );
          groundedColliderHandlesRef.current.clear();
          groundedBodiesRef.current.clear();
          activeSupportHandleRef.current = null;
        }

        jumpQueuedRef.current = false;
      }
    } else if (jumpQueuedRef.current) {
      jumpQueuedRef.current = false;
    }
  });

  useFrame((_, delta) => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const translation = body.translation();
    const keyState = keyStateRef.current;
    const crouching =
      physicsPlayback === "running" &&
      sceneSettings.player.canCrouch &&
      (keyState.has("ControlLeft") || keyState.has("ControlRight") || keyState.has("KeyC"));
    const currentHeight = crouchHeight && crouching ? crouchHeight : standingHeight;
    const viewDirection = resolveViewDirection(yawRef.current, pitchRef.current, directionRef.current);
    const rawTranslation = rawTranslationRef.current.set(translation.x, translation.y, translation.z);
    const smoothedTranslation = smoothedTranslationRef.current;

    if (!renderTranslationInitializedRef.current) {
      smoothedTranslation.copy(rawTranslation);
      renderTranslationInitializedRef.current = true;
    } else {
      smoothedTranslation.lerp(rawTranslation, 1 - Math.exp(-delta * 18));
    }

    if (renderRootRef.current) {
      renderRootRef.current.position.copy(renderOffsetRef.current.copy(smoothedTranslation).sub(rawTranslation));
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

            if (activeSupportHandleRef.current === null) {
              activeSupportHandleRef.current = payload.other.collider.handle;
            }
          }
        }}
        onIntersectionExit={(payload) => {
          groundedColliderHandlesRef.current.delete(payload.other.collider.handle);
          groundedBodiesRef.current.delete(payload.other.collider.handle);

          if (activeSupportHandleRef.current === payload.other.collider.handle) {
            activeSupportHandleRef.current = null;
          }
        }}
        position={[0, -(footOffset + 0.04), 0]}
        sensor
      />
      <group ref={renderRootRef}>
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

function resolveActiveSupportBody(
  groundedBodies: Map<number, RapierRigidBody>,
  groundedColliderHandles: Set<number>,
  activeSupportHandleRef: MutableRefObject<number | null>
) {
  const activeHandle = activeSupportHandleRef.current;

  if (activeHandle !== null && groundedColliderHandles.has(activeHandle)) {
    const activeBody = groundedBodies.get(activeHandle);

    if (activeBody) {
      return activeBody;
    }
  }

  for (const [handle, body] of groundedBodies) {
    if (groundedColliderHandles.has(handle)) {
      activeSupportHandleRef.current = handle;
      return body;
    }
  }

  activeSupportHandleRef.current = null;
  return undefined;
}

function resolveSupportVelocityAtPoint(
  supportBody: RapierRigidBody,
  worldPoint: Vector3,
  stepSeconds: number,
  temps: {
    angularVelocity: Vector3;
    bodyNextPosition: Vector3;
    bodyPosition: Vector3;
    inverseRotation: Quaternion;
    localPoint: Vector3;
    movedPoint: Vector3;
    nextRotation: Quaternion;
    rotation: Quaternion;
  },
  target: Vector3
) {
  if (supportBody.isKinematic()) {
    const currentTranslation = supportBody.translation();
    const nextTranslation = supportBody.nextTranslation();
    const currentRotation = supportBody.rotation();
    const nextRotation = supportBody.nextRotation();

    temps.bodyPosition.set(currentTranslation.x, currentTranslation.y, currentTranslation.z);
    temps.bodyNextPosition.set(nextTranslation.x, nextTranslation.y, nextTranslation.z);
    temps.rotation.set(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w);
    temps.nextRotation.set(nextRotation.x, nextRotation.y, nextRotation.z, nextRotation.w);
    temps.inverseRotation.copy(temps.rotation).invert();
    temps.localPoint.copy(worldPoint).sub(temps.bodyPosition).applyQuaternion(temps.inverseRotation);
    temps.movedPoint.copy(temps.localPoint).applyQuaternion(temps.nextRotation).add(temps.bodyNextPosition);

    return target.copy(temps.movedPoint).sub(worldPoint).multiplyScalar(1 / stepSeconds);
  }

  const translation = supportBody.translation();
  const linearVelocity = supportBody.linvel();
  const angularVelocity = supportBody.angvel();

  temps.bodyPosition.set(translation.x, translation.y, translation.z);
  temps.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);

  return target
    .set(linearVelocity.x, linearVelocity.y, linearVelocity.z)
    .add(temps.angularVelocity.cross(temps.localPoint.copy(worldPoint).sub(temps.bodyPosition)));
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
