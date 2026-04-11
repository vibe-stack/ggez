import { useMemo } from "react";
import { type GeometryNode, type SceneHook, type Transform, type Vec3 } from "@ggez/shared";
import {
    type DerivedGroupMarker, type DerivedRenderScene
} from "@ggez/render-pipeline";
import { toTuple } from "@ggez/shared";
import type { SceneSettings } from "@ggez/shared";

export function TriggerHookGuides({
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

export function TriggerVolumeGuide({
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

export function PathGuides({
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

export function SinglePathGuide({
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

export function readHookNumber(config: SceneHook["config"], key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" ? value : fallback;
}

export function readHookString(config: SceneHook["config"], key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

export function readHookVec3Tuple(config: SceneHook["config"], key: string, fallback: [number, number, number]): [number, number, number] {
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

export function RenderGroupNode({
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