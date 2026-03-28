import { useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CapsuleCollider, ConeCollider, CuboidCollider, CylinderCollider, Physics, RigidBody, TrimeshCollider, type RapierRigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackSide,
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  BufferGeometry,
  type Side
} from "three";
import type { GeometryNode, MaterialRenderSide, SceneHook, Transform, Vec3 } from "@ggez/shared";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeletonScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  disableBvhRaycast,
  enableBvhRaycast,
  type DerivedEntityMarker,
  type DerivedGroupMarker,
  type DerivedInstancedMesh,
  type DerivedLight,
  type DerivedRenderMesh,
  type DerivedRenderScene
} from "@ggez/render-pipeline";
import { createBlockoutTextureDataUri, resolveTransformPivot, toTuple } from "@ggez/shared";
import { createIndexedGeometry } from "@/viewport/utils/geometry";
import type { ViewportRenderMode } from "@/viewport/viewports";
import type { SceneSettings } from "@ggez/shared";

const previewTextureCache = new Map<string, ReturnType<TextureLoader["load"]>>();
const modelSceneCache = new Map<string, Object3D>();
const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const modelTextureLoader = new TextureLoader();
const tempInstanceObject = new Object3D();
const tempInstanceMatrix = new Matrix4();
const tempPivotMatrix = new Matrix4();
const tempInstanceColor = new Color();
export function ScenePreview({
  hiddenSceneItemIds = [],
  interactive,
  onFocusNode,
  onMeshObjectChange,
  onSelectNode,
  pathDefinitions,
  physicsPlayback,
  physicsRevision,
  renderMode = "lit",
  renderScene,
  sceneSettings,
  selectedHookNodes = [],
  selectedPathId,
  selectedNodeIds
}: {
  hiddenSceneItemIds?: string[];
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNode: (nodeIds: string[]) => void;
  pathDefinitions?: SceneSettings["paths"];
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderMode?: ViewportRenderMode;
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  selectedHookNodes?: GeometryNode[];
  selectedPathId?: string;
  selectedNodeIds: string[];
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string>();
  const hiddenIds = useMemo(() => new Set(hiddenSceneItemIds), [hiddenSceneItemIds]);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const physicsActive = renderMode === "lit" && physicsPlayback !== "stopped" && sceneSettings.world.physicsEnabled;
  const { physicsPropMeshes, playerSpawn, staticMeshes, visibleEntityMarkers, visibleGroups, visibleInstancedMeshes, visibleLights } = useMemo(() => {
    const nextPlayerSpawn = physicsActive
      ? renderScene.entityMarkers.find((entity) => entity.entityType === "player-spawn")
      : undefined;
    const nextPhysicsPropMeshes = physicsActive
      ? renderScene.meshes.filter((mesh) => !hiddenIds.has(mesh.nodeId) && mesh.physics?.enabled)
      : [];
    const physicsPropIds = new Set(nextPhysicsPropMeshes.map((mesh) => mesh.nodeId));
    const nextStaticMeshes = renderScene.meshes.filter(
      (mesh) => !hiddenIds.has(mesh.nodeId) && !physicsPropIds.has(mesh.nodeId)
    );
    const nextVisibleEntityMarkers =
      physicsActive && nextPlayerSpawn
        ? renderScene.entityMarkers.filter((entity) => !hiddenIds.has(entity.entityId) && entity.entityId !== nextPlayerSpawn.entityId)
        : renderScene.entityMarkers.filter((entity) => !hiddenIds.has(entity.entityId));
    const nextVisibleGroups = renderScene.groups.filter((group) => !hiddenIds.has(group.nodeId));
    const nextVisibleInstancedMeshes = renderScene.instancedMeshes
      .map((batch) => ({
        ...batch,
        instances: batch.instances.filter((instance) => !hiddenIds.has(instance.nodeId))
      }))
      .filter((batch) => batch.instances.length > 0);
    const nextVisibleLights = renderScene.lights.filter((light) => !hiddenIds.has(light.nodeId));

    return {
      physicsPropMeshes: nextPhysicsPropMeshes,
      playerSpawn: nextPlayerSpawn,
      staticMeshes: nextStaticMeshes,
      visibleEntityMarkers: nextVisibleEntityMarkers,
      visibleGroups: nextVisibleGroups,
      visibleInstancedMeshes: nextVisibleInstancedMeshes,
      visibleLights: nextVisibleLights
    };
  }, [hiddenIds, physicsActive, renderScene]);

  return (
    <>
      <PathGuides pathDefinitions={pathDefinitions ?? sceneSettings.paths ?? []} selectedPathId={selectedPathId} />
      <TriggerHookGuides nodeTransforms={renderScene.nodeTransforms} nodes={selectedHookNodes} />

      {staticMeshes.map((mesh) => (
        <RenderStaticMesh
          hovered={hoveredNodeId === mesh.nodeId}
          interactive={interactive}
          key={mesh.nodeId}
          mesh={mesh}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onMeshObjectChange={onMeshObjectChange}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selected={selectedIdSet.has(mesh.nodeId)}
        />
      ))}

      {visibleInstancedMeshes.map((batch) => (
        <RenderInstancedMeshBatch
          batch={batch}
          hoveredNodeId={hoveredNodeId}
          interactive={interactive}
          key={batch.batchId}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onMeshObjectChange={onMeshObjectChange}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selectedNodeIds={selectedIdSet}
        />
      ))}

      {physicsActive ? (
        <Physics
          gravity={toTuple(sceneSettings.world.gravity)}
          key={`physics:${physicsRevision}`}
          paused={physicsPlayback !== "running"}
          timeStep={1 / 60}
        >
          {staticMeshes.map((mesh) => (
            <StaticPhysicsCollider key={`collider:${mesh.nodeId}`} mesh={mesh} />
          ))}
          {physicsPropMeshes.map((mesh) => (
            <PhysicsPropMesh
              hovered={hoveredNodeId === mesh.nodeId}
              interactive={interactive}
              key={`prop:${mesh.nodeId}`}
              mesh={mesh}
              onFocusNode={onFocusNode}
              onHoverEnd={() => setHoveredNodeId(undefined)}
              onHoverStart={setHoveredNodeId}
              onMeshObjectChange={onMeshObjectChange}
              onSelectNodes={onSelectNode}
              renderMode={renderMode}
              selected={selectedIdSet.has(mesh.nodeId)}
            />
          ))}
          {playerSpawn ? (
            <RuntimePlayer
              physicsPlayback={physicsPlayback}
              sceneSettings={sceneSettings}
              spawn={playerSpawn}
            />
          ) : null}
        </Physics>
      ) : null}

      {visibleEntityMarkers.map((entity) => {
        const selected = selectedIdSet.has(entity.entityId);
        const color = selected ? "#ffb35a" : entity.color;

        return (
          <group
            key={entity.entityId}
            name={`entity:${entity.entityId}`}
            onClick={(event) => {
              if (!interactive) {
                return;
              }

              event.stopPropagation();
              onSelectNode([entity.entityId]);
            }}
            onDoubleClick={(event) => {
              if (!interactive) {
                return;
              }

              event.stopPropagation();
              onFocusNode(entity.entityId);
            }}
            position={toTuple(entity.position)}
            rotation={toTuple(entity.rotation)}
            scale={toTuple(entity.scale)}
          >
            <mesh position={[0, 0.8, 0]}>
              <octahedronGeometry args={[0.35, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.7, 8]} />
              <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
            </mesh>
          </group>
        );
      })}

      {visibleGroups.map((group) => (
        <RenderGroupNode
          hovered={hoveredNodeId === group.nodeId}
          interactive={interactive}
          key={group.nodeId}
          group={group}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onSelectNodes={onSelectNode}
          selected={selectedIdSet.has(group.nodeId)}
        />
      ))}

      {visibleLights.map((light) => (
        <RenderLightNode
          hovered={hoveredNodeId === light.nodeId}
          interactive={interactive}
          key={light.nodeId}
          light={light}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selected={selectedIdSet.has(light.nodeId)}
        />
      ))}
    </>
  );
}

function TriggerHookGuides({
  nodeTransforms,
  nodes
}: {
  nodeTransforms: DerivedRenderScene["nodeTransforms"];
  nodes: GeometryNode[];
}) {
  const overlays = nodes.flatMap((node) =>
    (node.hooks ?? [])
      .filter((hook) => hook.type === "trigger_volume" && hook.enabled !== false)
      .map((hook) => ({
        hook,
        nodeId: node.id,
        transform: nodeTransforms.get(node.id) ?? node.transform
      }))
  );

  return (
    <>
      {overlays.map(({ hook, nodeId, transform }) => (
        <TriggerVolumeGuide hook={hook} key={`${nodeId}:${hook.id}`} transform={transform} />
      ))}
    </>
  );
}

function TriggerVolumeGuide({
  hook,
  transform
}: {
  hook: SceneHook;
  transform: Transform;
}) {
  const shape = readHookString(hook.config, "shape", "box");
  const size = readHookVec3Tuple(hook.config, "size", [1, 1, 1]);
  const radius = Math.max(0.05, readHookNumber(hook.config, "radius", 0.5));
  const height = Math.max(radius * 2, readHookNumber(hook.config, "height", radius * 2));
  const capsuleLength = Math.max(0.001, height - radius * 2);

  return (
    <group
      position={[transform.position.x, transform.position.y, transform.position.z]}
      rotation={toTuple(transform.rotation)}
      scale={[transform.scale.x, transform.scale.y, transform.scale.z]}
    >
      {shape === "sphere" ? (
        <mesh raycast={() => null}>
          <sphereGeometry args={[radius, 18, 18]} />
          <meshBasicMaterial color="#34d399" opacity={0.12} transparent wireframe />
        </mesh>
      ) : null}
      {shape === "capsule" ? (
        <mesh raycast={() => null}>
          <capsuleGeometry args={[radius, capsuleLength, 6, 12]} />
          <meshBasicMaterial color="#34d399" opacity={0.12} transparent wireframe />
        </mesh>
      ) : null}
      {shape === "box" ? (
        <mesh raycast={() => null}>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#34d399" opacity={0.12} transparent wireframe />
        </mesh>
      ) : null}
    </group>
  );
}

function PathGuides({
  pathDefinitions,
  selectedPathId
}: {
  pathDefinitions: NonNullable<SceneSettings["paths"]>;
  selectedPathId?: string;
}) {
  return (
    <>
      {pathDefinitions.map((pathDefinition) => (
        <SinglePathGuide
          key={pathDefinition.id}
          loop={pathDefinition.loop === true}
          pathId={pathDefinition.id}
          points={pathDefinition.points}
          selected={pathDefinition.id === selectedPathId}
        />
      ))}
    </>
  );
}

function SinglePathGuide({
  loop,
  pathId,
  points,
  selected
}: {
  loop: boolean;
  pathId: string;
  points: Vec3[];
  selected: boolean;
}) {
  const positions = useMemo(() => {
    if (points.length === 0) {
      return new Float32Array();
    }

    const resolvedPoints = loop && points.length > 2 ? [...points, points[0]] : points;
    return new Float32Array(resolvedPoints.flatMap((point) => [point.x, point.y, point.z]));
  }, [loop, points]);

  if (points.length === 0) {
    return null;
  }

  return (
    <group name={`path:${pathId}`}>
      <line>
        <bufferGeometry>
          <bufferAttribute args={[positions, 3]} attach="attributes-position" count={positions.length / 3} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={selected ? "#f59e0b" : "#34d399"} transparent opacity={selected ? 0.95 : 0.72} />
      </line>
      {points.map((point, index) => (
        <mesh key={`${pathId}:${index}`} position={[point.x, point.y, point.z]} raycast={() => null}>
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshBasicMaterial color={selected ? "#fdba74" : index === 0 ? "#f59e0b" : "#99f6e4"} transparent opacity={selected ? 1 : 0.88} />
        </mesh>
      ))}
    </group>
  );
}

function readHookNumber(config: SceneHook["config"], key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" ? value : fallback;
}

function readHookString(config: SceneHook["config"], key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function readHookVec3Tuple(config: SceneHook["config"], key: string, fallback: [number, number, number]): [number, number, number] {
  const value = config[key];

  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    typeof value[0] === "number" ? value[0] : fallback[0],
    typeof value[1] === "number" ? value[1] : fallback[1],
    typeof value[2] === "number" ? value[2] : fallback[2]
  ];
}

function RenderGroupNode({
  group,
  hovered,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  selected
}: {
  group: DerivedGroupMarker;
  hovered: boolean;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  selected: boolean;
}) {
  const markerColor = selected ? "#ffb35a" : hovered ? "#d8f4f0" : "#7dd3fc";

  return (
    <group
      name={`node:${group.nodeId}`}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([group.nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onFocusNode(group.nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverStart(group.nodeId);
      }}
      position={toTuple(group.position)}
      rotation={toTuple(group.rotation)}
      scale={toTuple(group.scale)}
    >
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.18} transparent opacity={0.85} />
      </mesh>
      <mesh visible={false}>
        <sphereGeometry args={[0.4, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function RuntimePlayer({
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

function RenderStaticMesh({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  if (!mesh.surface && !mesh.primitive && !mesh.modelPath) {
    return null;
  }

  return (
    <RenderNodeRoot
      hovered={hovered}
      interactive={interactive}
      mesh={mesh}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onMeshObjectChange={onMeshObjectChange}
      onSelectNodes={onSelectNodes}
      renderMode={renderMode}
      selected={selected}
    />
  );
}

function PhysicsPropMesh({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const physics = mesh.physics;
  const colliderProps = useMemo(() => resolvePhysicsColliderProps(mesh.physics), [mesh.physics]);

  if (!physics) {
    return null;
  }

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
      rotation={toTuple(mesh.rotation)}
      type={physics.bodyType}
    >
      {!useTrimeshCollider ? (
        <ManualCollider mesh={mesh} />
      ) : (
        <TrimeshPhysicsCollider colliderProps={colliderProps} mesh={mesh} />
      )}
      <group scale={toTuple(mesh.scale)}>
        <RenderNodeBody
          hovered={hovered}
          interactive={interactive}
          mesh={mesh}
          onFocusNode={onFocusNode}
          onHoverEnd={onHoverEnd}
          onHoverStart={onHoverStart}
          onSelectNodes={onSelectNodes}
          renderMode={renderMode}
          selected={selected}
        />
      </group>
      <object3D
        name={`node:${mesh.nodeId}`}
        ref={(object) => {
          onMeshObjectChange(mesh.nodeId, object);
        }}
      />
    </RigidBody>
  );
}

function RenderInstancedMeshBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
}) {
  if (batch.mesh.modelPath) {
    return (
      <RenderInstancedModelBatch
        batch={batch}
        hoveredNodeId={hoveredNodeId}
        interactive={interactive}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onMeshObjectChange={onMeshObjectChange}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selectedNodeIds={selectedNodeIds}
      />
    );
  }

  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useRenderableGeometry(batch.mesh, renderMode);
  const previewMaterials = useInstancedPreviewMaterials(batch.mesh, renderMode);
  const pivot = resolveMeshPivot(batch.mesh);
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject || !geometry || previewMaterials.length === 0) {
      return;
    }

    tempPivotMatrix.makeTranslation(-pivot.x, -pivot.y, -pivot.z);

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      tempInstanceMatrix.copy(tempInstanceObject.matrix).multiply(tempPivotMatrix);
      meshObject.setMatrixAt(index, tempInstanceMatrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#ffb35a"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#ffffff"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, geometry, hoveredNodeId, pivot.x, pivot.y, pivot.z, previewMaterials, selectedNodeIds]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => {
        if (material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) {
          material.dispose();
        }
      });
    };
  }, [previewMaterials]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry || previewMaterials.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      args={[geometry, previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials, batch.instances.length]}
      castShadow={renderMode === "lit"}
      name={`node:${batch.batchId}`}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderMode === "lit"}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        onMeshObjectChange(batch.batchId, object);
        meshRef.current = object;
      }}
    />
  );
}

function RenderInstancedModelBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
}) {
  const loadedScene = useLoadedModelScene(
    batch.mesh.modelPath,
    batch.mesh.modelFormat === "obj" ? "obj" : "glb",
    batch.mesh.modelTexturePath,
    batch.mesh.modelMtlText
  );
  const loadedBounds = useMemo(
    () => (loadedScene ? computeModelBounds(loadedScene) : undefined),
    [loadedScene]
  );
  const center = loadedBounds?.center ?? batch.mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
  const modelParts = useMemo(() => buildModelParts(loadedScene, center), [center.x, center.y, center.z, loadedScene]);

  useEffect(() => {
    return () => {
      modelParts.forEach((part) => {
        if (part.disposeGeometry) {
          part.geometry.dispose();
        }
      });
    };
  }, [modelParts]);

  if (renderMode === "wireframe" || modelParts.length === 0) {
    return (
      <RenderInstancedModelBoundsBatch
        batch={batch}
        hoveredNodeId={hoveredNodeId}
        interactive={interactive}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onMeshObjectChange={onMeshObjectChange}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selectedNodeIds={selectedNodeIds}
        size={loadedBounds?.size ?? batch.mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 }}
      />
    );
  }

  return (
    <group
      name={`node:${batch.batchId}`}
      ref={(object) => {
        onMeshObjectChange(batch.batchId, object);
      }}
    >
      {modelParts.map((part) => (
        <RenderInstancedModelPart
          batch={batch}
          hoveredNodeId={hoveredNodeId}
          interactive={interactive}
          key={part.key}
          localMatrix={part.localMatrix}
          material={part.material}
          onFocusNode={onFocusNode}
          onHoverEnd={onHoverEnd}
          onHoverStart={onHoverStart}
          onSelectNodes={onSelectNodes}
          partKey={part.key}
          renderMode={renderMode}
          selectedNodeIds={selectedNodeIds}
          sourceGeometry={part.geometry}
        />
      ))}
    </group>
  );
}

function RenderInstancedModelPart({
  batch,
  hoveredNodeId,
  interactive,
  localMatrix,
  material,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  partKey,
  renderMode,
  selectedNodeIds,
  sourceGeometry
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  localMatrix: Matrix4;
  material: Mesh["material"];
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  partKey: string;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
  sourceGeometry: BufferGeometry;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject) {
      return;
    }

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      tempInstanceMatrix.copy(tempInstanceObject.matrix).multiply(localMatrix);
      meshObject.setMatrixAt(index, tempInstanceMatrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#ffb35a"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#ffffff"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, hoveredNodeId, localMatrix, selectedNodeIds]);

  return (
    <instancedMesh
      args={[sourceGeometry, material, batch.instances.length]}
      castShadow={renderMode === "lit"}
      name={`node:${batch.batchId}:${partKey}`}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderMode === "lit"}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        meshRef.current = object;
      }}
    />
  );
}

function RenderInstancedModelBoundsBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds,
  size
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
  size: Vec3;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useMemo(() => new BoxGeometry(size.x, size.y, size.z), [size.x, size.y, size.z]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#94a3b8",
        depthWrite: false,
        opacity: renderMode === "wireframe" ? 1 : 0.85,
        toneMapped: false,
        transparent: renderMode !== "wireframe",
        wireframe: true
      }),
    [renderMode]
  );
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject) {
      return;
    }

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      meshObject.setMatrixAt(index, tempInstanceObject.matrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#f97316"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#94a3b8"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, hoveredNodeId, selectedNodeIds]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <instancedMesh
      args={[geometry, material, batch.instances.length]}
      castShadow={renderMode === "lit"}
      name={`node:${batch.batchId}`}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderMode === "lit"}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        onMeshObjectChange(batch.batchId, object);
        meshRef.current = object;
      }}
    />
  );
}

function RenderNodeRoot({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  return (
    <group
      name={`node:${mesh.nodeId}`}
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      scale={toTuple(mesh.scale)}
      ref={(object) => {
        onMeshObjectChange(mesh.nodeId, object);
      }}
    >
      <RenderNodeBody
        hovered={hovered}
        interactive={interactive}
        mesh={mesh}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selected={selected}
      />
    </group>
  );
}

function RenderNodeBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  if (mesh.modelPath) {
    return (
      <RenderModelBody
        hovered={hovered}
        interactive={interactive}
        mesh={mesh}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selected={selected}
      />
    );
  }

  return (
    <RenderMeshBody
      hovered={hovered}
      interactive={interactive}
      mesh={mesh}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onSelectNodes={onSelectNodes}
      renderMode={renderMode}
      selected={selected}
    />
  );
}

function StaticPhysicsCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  return (
    <RigidBody colliders={false} position={toTuple(mesh.position)} rotation={toTuple(mesh.rotation)} type="fixed">
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
      <TrimeshCollider
        args={colliderArgs}
        position={[-pivot.x, -pivot.y, -pivot.z]}
        {...colliderProps}
      />
    </group>
  );
}

function useTrimeshColliderArgs(mesh: DerivedRenderMesh): [ArrayLike<number>, ArrayLike<number>] | undefined {
  const geometry = useRenderableGeometry(mesh, "lit");
  const fallbackIndices = useMemo(() => {
    if (!geometry) {
      return new Uint32Array();
    }

    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    return Uint32Array.from({ length: positionCount }, (_, index) => index);
  }, [geometry]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return undefined;
  }

  return [
    geometry.getAttribute("position").array,
    geometry.getIndex()?.array ?? fallbackIndices
  ];
}

function RenderMeshBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const [meshObject, setMeshObject] = useState<Mesh | null>(null);
  const geometry = useRenderableGeometry(mesh, renderMode);
  const previewMaterials = usePreviewMaterials(mesh, renderMode, selected, hovered);
  const pivot = resolveMeshPivot(mesh);

  useEffect(() => {
    if (geometry && meshObject && mesh.bvhEnabled) {
      enableBvhRaycast(meshObject, geometry);
    }

    return () => {
      if (geometry) {
        disableBvhRaycast(geometry);
      }
    };
  }, [geometry, mesh.bvhEnabled, meshObject]);

  useEffect(() => {
    if (meshObject && previewMaterials.length > 0) {
      meshObject.material = previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials;
    }
  }, [meshObject, previewMaterials]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => disposePreviewMaterial(material));
    };
  }, [previewMaterials]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <group position={[-pivot.x, -pivot.y, -pivot.z]}>
      <mesh
        castShadow={renderMode === "lit"}
        onClick={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();

          if (renderMode === "wireframe") {
            const nodeIds = resolveIntersectedIds(event.intersections);

            if (nodeIds.length > 0) {
              onSelectNodes(nodeIds);
              return;
            }
          }

          onSelectNodes([mesh.nodeId]);
        }}
        onDoubleClick={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onFocusNode(mesh.nodeId);
        }}
        onPointerOut={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onHoverEnd();
        }}
        onPointerOver={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onHoverStart(mesh.nodeId);
        }}
        ref={setMeshObject}
        receiveShadow={renderMode === "lit"}
      >
        <primitive attach="geometry" object={geometry} />
        {renderMode === "wireframe" ? (
          <meshBasicMaterial
            color={selected ? "#f97316" : hovered ? "#67e8f9" : "#94a3b8"}
            depthWrite={false}
            toneMapped={false}
            wireframe
          />
        ) : null}
      </mesh>
    </group>
  );
}

function RenderModelBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const loadedScene = useLoadedModelScene(
    mesh.modelPath,
    mesh.modelFormat === "obj" ? "obj" : "glb",
    mesh.modelTexturePath,
    mesh.modelMtlText
  );
  const loadedBounds = useMemo(
    () => (loadedScene ? computeModelBounds(loadedScene) : undefined),
    [loadedScene]
  );
  const modelScene = useMemo(() => {
    if (!loadedScene) {
      return undefined;
    }

    const clone = cloneModelSceneGraph(loadedScene);
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = renderMode === "lit";
        child.receiveShadow = renderMode === "lit";
      }
    });
    return clone;
  }, [loadedScene, renderMode]);
  const modelBounds = loadedBounds ?? (mesh.modelSize && mesh.modelCenter
    ? {
        center: mesh.modelCenter,
        size: mesh.modelSize
      }
    : undefined);
  const center = modelBounds?.center ?? mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
  const showOverlay = renderMode === "wireframe" || selected || hovered;
  const overlayColor = selected ? "#f97316" : hovered ? "#67e8f9" : "#94a3b8";
  const overlayScene = useMemo(() => {
    if (!loadedScene || !showOverlay) {
      return undefined;
    }

    const clone = cloneModelSceneGraph(loadedScene);

    clone.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }

      child.castShadow = false;
      child.receiveShadow = false;
      child.renderOrder = renderMode === "wireframe" ? 0 : 6;
      child.material = createModelOverlayMaterial(child.material, overlayColor, renderMode);
    });

    return clone;
  }, [loadedScene, overlayColor, renderMode, showOverlay]);

  useEffect(() => {
    return () => {
      disposeOverlaySceneMaterials(overlayScene);
    };
  }, [overlayScene]);

  const handleClick = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onSelectNodes([mesh.nodeId]);
  }, [interactive, mesh.nodeId, onSelectNodes]);

  const handleDoubleClick = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onFocusNode(mesh.nodeId);
  }, [interactive, mesh.nodeId, onFocusNode]);

  const handlePointerOver = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onHoverStart(mesh.nodeId);
  }, [interactive, mesh.nodeId, onHoverStart]);

  const handlePointerOut = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onHoverEnd();
  }, [interactive, onHoverEnd]);

  return (
    <group>
      {modelScene && renderMode === "lit" ? (
        <primitive
          object={modelScene}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[-center.x, -center.y, -center.z]}
        />
      ) : null}
      {overlayScene ? (
        <primitive
          object={overlayScene}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[-center.x, -center.y, -center.z]}
        />
      ) : null}
      {!modelScene ? (
        <mesh
          castShadow={renderMode === "lit"}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          receiveShadow={renderMode === "lit"}
        >
          <boxGeometry args={toTuple(mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
          <meshStandardMaterial color={mesh.material.color} metalness={0.08} roughness={0.72} />
        </mesh>
      ) : null}
      {!modelScene && showOverlay ? (
        <mesh
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[-center.x, -center.y, -center.z]}
        >
          <boxGeometry args={toTuple(modelBounds?.size ?? mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
          <meshBasicMaterial
            color={overlayColor}
            depthWrite={false}
            opacity={renderMode === "wireframe" ? 1 : 0.85}
            toneMapped={false}
            transparent={renderMode !== "wireframe"}
            wireframe
          />
        </mesh>
      ) : null}
    </group>
  );
}

function useLoadedModelScene(
  path?: string,
  format: "glb" | "obj" = "glb",
  texturePath?: string,
  mtlText?: string
) {
  const [scene, setScene] = useState<Object3D>();

  useEffect(() => {
    if (!path) {
      setScene(undefined);
      return;
    }

    const cacheKey = `${format}:${path}:${texturePath ?? ""}:${mtlText ?? ""}`;
    const cachedScene = modelSceneCache.get(cacheKey);

    if (cachedScene) {
      setScene(cachedScene);
      return;
    }

    let cancelled = false;

    void loadModelScene(path, format, texturePath, mtlText)
      .then((loadedScene) => {
        if (cancelled) {
          return;
        }

        modelSceneCache.set(cacheKey, loadedScene);
        setScene(loadedScene);
      })
      .catch(() => {
        if (!cancelled) {
          setScene(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [format, mtlText, path, texturePath]);

  return scene;
}

async function loadModelScene(
  path: string,
  format: "glb" | "obj",
  texturePath?: string,
  mtlText?: string
) {
  if (format === "obj") {
    const objLoader = new OBJLoader();

    if (mtlText) {
      const materialCreator = mtlLoader.parse(
        patchMtlTextureReferences(mtlText, texturePath),
        ""
      );
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
  const cached = previewTextureCache.get(path);

  if (cached) {
    return cached;
  }

  const texture = await modelTextureLoader.loadAsync(path);
  texture.colorSpace = SRGBColorSpace;
  previewTextureCache.set(path, texture);
  return texture;
}

function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern =
    /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap
    ? normalized
    : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}

function computeModelBounds(scene: Object3D) {
  scene.updateMatrixWorld(true);
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

function buildModelParts(scene: Object3D | undefined, center: { x: number; y: number; z: number }) {
  if (!scene) {
    return [] as Array<{
      disposeGeometry?: boolean;
      geometry: BufferGeometry;
      key: string;
      localMatrix: Matrix4;
      material: Mesh["material"];
    }>;
  }

  const root = cloneModelSceneGraph(scene);
  root.position.set(-center.x, -center.y, -center.z);
  root.updateMatrixWorld(true);

  const parts: Array<{
    disposeGeometry?: boolean;
    geometry: BufferGeometry;
    key: string;
    localMatrix: Matrix4;
    material: Mesh["material"];
  }> = [];
  let partIndex = 0;

  root.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) {
      return;
    }

    const geometry = child instanceof SkinnedMesh ? bakeSkinnedMeshGeometry(child) : child.geometry;

    parts.push({
      disposeGeometry: child instanceof SkinnedMesh,
      geometry,
      key: `${partIndex}:${child.name || "mesh"}`,
      localMatrix: child.matrixWorld.clone(),
      material: child.material
    });
    partIndex += 1;
  });

  return parts;
}

function cloneModelSceneGraph(scene: Object3D) {
  const clone = cloneSkeletonScene(scene);
  clone.updateMatrixWorld(true);
  return clone;
}

function bakeSkinnedMeshGeometry(mesh: SkinnedMesh) {
  const sourceGeometry = mesh.geometry;
  const positionAttribute = sourceGeometry.getAttribute("position");
  const bakedGeometry = sourceGeometry.clone();
  const bakedPositions = new Float32Array(positionAttribute.count * 3);
  const bakedVertex = new Vector3();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    mesh.getVertexPosition(index, bakedVertex);
    bakedPositions[index * 3] = bakedVertex.x;
    bakedPositions[index * 3 + 1] = bakedVertex.y;
    bakedPositions[index * 3 + 2] = bakedVertex.z;
  }

  bakedGeometry.setAttribute("position", new Float32BufferAttribute(bakedPositions, 3));
  bakedGeometry.deleteAttribute("skinIndex");
  bakedGeometry.deleteAttribute("skinWeight");
  bakedGeometry.deleteAttribute("normal");
  bakedGeometry.computeVertexNormals();
  bakedGeometry.computeBoundingBox();
  bakedGeometry.computeBoundingSphere();

  return bakedGeometry;
}

function createModelOverlayMaterial(material: Mesh["material"], color: string, renderMode: ViewportRenderMode) {
  if (Array.isArray(material)) {
    return material.map((entry) => createSingleModelOverlayMaterial(entry, color, renderMode));
  }

  return createSingleModelOverlayMaterial(material, color, renderMode);
}

function createSingleModelOverlayMaterial(material: Mesh["material"], color: string, renderMode: ViewportRenderMode) {
  return new MeshBasicMaterial({
    color,
    depthWrite: false,
    opacity: renderMode === "wireframe" ? 1 : 0.85,
    side: material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial ? material.side : DoubleSide,
    toneMapped: false,
    transparent: renderMode !== "wireframe",
    wireframe: true
  });
}

function disposeOverlaySceneMaterials(scene: Object3D | undefined) {
  if (!scene) {
    return;
  }

  scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    if (Array.isArray(child.material)) {
      child.material.forEach((entry) => entry.dispose());
      return;
    }

    child.material.dispose();
  });
}

function RenderLightNode({
  hovered,
  interactive,
  light,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  light: DerivedLight;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const targetRef = useRef<Object3D | null>(null);
  const lightRef = useRef<any>(null);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      targetRef.current.updateMatrixWorld();
    }
  }, [light.nodeId, light.rotation.x, light.rotation.y, light.rotation.z]);

  const markerColor = selected ? "#ffb35a" : hovered ? "#d8f4f0" : light.color;

  return (
    <group
      name={`node:${light.nodeId}`}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([light.nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onFocusNode(light.nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverStart(light.nodeId);
      }}
      position={toTuple(light.position)}
      rotation={toTuple(light.rotation)}
    >
      <mesh>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.45, 8]} />
        <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
      </mesh>

      {renderMode === "lit" && light.data.enabled ? (
        <>
          {light.data.type === "ambient" ? (
            <ambientLight color={light.data.color} intensity={light.data.intensity} />
          ) : null}
          {light.data.type === "hemisphere" ? (
            <hemisphereLight
              args={[light.data.color, light.data.groundColor ?? "#0f1721", light.data.intensity]}
            />
          ) : null}
          {light.data.type === "point" ? (
            <pointLight
              castShadow={light.data.castShadow}
              color={light.data.color}
              decay={light.data.decay}
              distance={light.data.distance}
              intensity={light.data.intensity}
            />
          ) : null}
          {light.data.type === "directional" ? (
            <>
              <directionalLight
                castShadow={light.data.castShadow}
                color={light.data.color}
                intensity={light.data.intensity}
                ref={lightRef}
              />
              <object3D ref={targetRef} position={[0, 0, -6]} />
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
              <object3D ref={targetRef} position={[0, 0, -6]} />
            </>
          ) : null}
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
    return (
      <CuboidCollider
        args={[mesh.primitive.size.x * 0.5, mesh.primitive.size.y * 0.5, mesh.primitive.size.z * 0.5]}
        {...commonProps}
      />
    );
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

function useRenderableGeometry(mesh: DerivedRenderMesh, renderMode: ViewportRenderMode) {
  return useMemo(() => {
    let bufferGeometry: BufferGeometry | undefined;

    if (mesh.surface) {
      bufferGeometry = createIndexedGeometry(mesh.surface.positions, mesh.surface.indices, mesh.surface.uvs, mesh.surface.groups);
    } else if (mesh.primitive?.kind === "box") {
      bufferGeometry = new BoxGeometry(...toTuple(mesh.primitive.size));
    } else if (mesh.primitive?.kind === "sphere") {
      bufferGeometry = new SphereGeometry(mesh.primitive.radius, mesh.primitive.widthSegments, mesh.primitive.heightSegments);
    } else if (mesh.primitive?.kind === "cylinder") {
      bufferGeometry = new CylinderGeometry(
        mesh.primitive.radiusTop,
        mesh.primitive.radiusBottom,
        mesh.primitive.height,
        mesh.primitive.radialSegments
      );
    } else if (mesh.primitive?.kind === "cone") {
      bufferGeometry = new ConeGeometry(mesh.primitive.radius, mesh.primitive.height, mesh.primitive.radialSegments);
    }

    if (!bufferGeometry) {
      return undefined;
    }

    if (renderMode === "lit") {
      bufferGeometry.computeVertexNormals();
    }
    bufferGeometry.computeBoundingBox();
    bufferGeometry.computeBoundingSphere();

    return bufferGeometry;
  }, [mesh.primitive, mesh.surface, renderMode]);
}

function usePreviewMaterials(
  mesh: DerivedRenderMesh,
  renderMode: ViewportRenderMode,
  selected: boolean,
  hovered: boolean
) {
  return useMemo(() => {
    if (renderMode !== "lit") {
      return [];
    }

    const specs = mesh.materials ?? [mesh.material];
    return specs.map((spec) => createPreviewMaterial(spec, selected, hovered));
  }, [hovered, mesh.material, mesh.materials, renderMode, selected]);
}

function useInstancedPreviewMaterials(mesh: DerivedRenderMesh, renderMode: ViewportRenderMode) {
  return useMemo(() => {
    const specs = mesh.materials ?? [mesh.material];

    if (renderMode === "lit") {
      return specs.map((spec) => createPreviewMaterial(spec, false, false));
    }

    return specs.map((spec) => new MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      side: resolvePreviewMaterialSide(spec.side),
      toneMapped: false,
      wireframe: true
    }));
  }, [mesh.material, mesh.materials, renderMode]);
}

function resolveMeshPivot(mesh: DerivedRenderMesh) {
  return resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });
}

function resolveIntersectedIds(intersections: Array<{ instanceId?: number; object: Object3D }>) {
  const ids: string[] = [];
  const seen = new Set<string>();

  intersections.forEach((intersection) => {
    const id =
      typeof intersection.instanceId === "number"
        ? resolveInstancedNodeIdFromObject(intersection.object, intersection.instanceId)
        : resolveSceneObjectIdFromObject(intersection.object);

    if (!id || seen.has(id)) {
      return;
    }

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

function resolveSceneObjectIdFromObject(object: Object3D | null) {
  let current: Object3D | null = object;

  while (current) {
    if (current.name.startsWith("node:")) {
      return current.name.slice(5);
    }

    if (current.name.startsWith("entity:")) {
      return current.name.slice(7);
    }

    current = current.parent;
  }

  return undefined;
}

function resolveInstancedNodeIdFromObject(object: Object3D | null, instanceId: number) {
  let current: Object3D | null = object;

  while (current) {
    const instanceNodeIds = (current.userData.webHammer as { instanceNodeIds?: string[] } | undefined)?.instanceNodeIds;

    if (Array.isArray(instanceNodeIds)) {
      return instanceNodeIds[instanceId];
    }

    current = current.parent;
  }

  return undefined;
}

function createPreviewMaterial(spec: DerivedRenderMesh["material"], selected: boolean, hovered: boolean) {
  const colorTexture = spec.colorTexture
    ? loadTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? loadTexture(createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018), true)
      : undefined;
  const normalTexture = spec.normalTexture ? loadTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadTexture(spec.roughnessTexture, false) : undefined;
  const transparent = spec.transparent ?? false;
  const opacity = transparent ? spec.opacity ?? 1 : 1;

  return new MeshStandardMaterial({
    color: colorTexture ? "#ffffff" : selected ? "#ffb35a" : hovered ? "#d8f4f0" : spec.color,
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : spec.emissiveColor ?? "#000000",
    emissiveIntensity: selected ? 0.38 : hovered ? 0.14 : spec.emissiveIntensity ?? 0,
    flatShading: spec.flatShaded,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    opacity,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    side: resolvePreviewMaterialSide(spec.side),
    transparent,
    wireframe: spec.wireframe,
    ...(colorTexture ? { map: colorTexture } : {}),
    ...(metalnessTexture ? { metalnessMap: metalnessTexture } : {}),
    ...(normalTexture ? { normalMap: normalTexture } : {}),
    ...(roughnessTexture ? { roughnessMap: roughnessTexture } : {})
  });
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

function disposePreviewMaterial(material: MeshStandardMaterial) {
  material.dispose();
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

function resolveViewDirection(yaw: number, pitch: number, target: Vector3) {
  return target.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
