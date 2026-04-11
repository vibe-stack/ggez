import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import {
    CapsuleGeometry, Object3D, Vector3
} from "three";
import {
    type DerivedEntityMarker
} from "@ggez/render-pipeline";
import type { SceneSettings } from "@ggez/shared";
import { clampNumber, isTextInputTarget, resolveViewDirection } from "../utils/preview-utils";

export function RuntimePlayer({
  physicsPlayback,
  sceneSettings,
  spawn
}: {
  physicsPlayback: "paused" | "running" | "stopped";
  sceneSettings: SceneSettings;
  spawn: DerivedEntityMarker;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const keyStateRef = useRef(new Set<string>());
  const jumpQueuedRef = useRef(false);
  const groundedColliderHandlesRef = useRef(new Set<number>());
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

  useEffect(() => {
    return () => {
      playerGeometry.dispose();
    };
  }, [playerGeometry]);

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
    const canLookAround = true;

    const handleCanvasClick = () => {
      if (!canLookAround || physicsPlayback !== "running" || document.pointerLockElement === domElement) {
        return;
      }

      void domElement.requestPointerLock();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!canLookAround || physicsPlayback !== "running" || document.pointerLockElement !== domElement) {
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

  useFrame((_, delta) => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const running = physicsPlayback === "running";
    const translation = body.translation();
    const linearVelocity = body.linvel();
    const keyState = keyStateRef.current;
    const crouching = running && sceneSettings.player.canCrouch && (keyState.has("ControlLeft") || keyState.has("ControlRight") || keyState.has("KeyC"));
    const currentHeight = crouching ? crouchHeight : standingHeight;
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

    rightDirection.set(-forwardDirection.z, 0, forwardDirection.x);
    rightDirection.normalize();
    moveDirection
      .addScaledVector(rightDirection, moveInputX)
      .addScaledVector(forwardDirection, moveInputZ);

    if (running) {
      if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize().multiplyScalar(crouching ? speed * 0.58 : speed);
      }

      body.setLinvel(
        {
          x: moveDirection.x,
          y: linearVelocity.y,
          z: moveDirection.z
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
              x: moveDirection.x,
              y: Math.sqrt(2 * gravityMagnitude * sceneSettings.player.jumpHeight),
              z: moveDirection.z
            },
            true
          );
          groundedColliderHandlesRef.current.clear();
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
        }}
        onIntersectionExit={(payload) => {
          groundedColliderHandlesRef.current.delete(payload.other.collider.handle);
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