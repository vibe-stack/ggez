import type {
  BrushNode,
  Entity,
  GeometryNode,
  GroupNode,
  InstancingNode,
  LightNode,
  MeshNode,
  ModelNode,
  ScenePathDefinition,
  NodeID,
  PrimitiveNode,
  SceneSettings,
  Transform,
  Vec2,
  Vec3,
  WorldSettings
} from "./types";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function createBlockoutTextureDataUri(color: string, edgeColor = "#f5f2ea", edgeThickness = 0.018): string {
  const size = 256;
  const frame = Math.max(2, Math.min(6, Math.round(size * edgeThickness)));
  const innerInset = frame + 3;
  const seamInset = innerInset + 5;
  const corner = 18;
  const highlight = mixHexColors(edgeColor, "#ffffff", 0.42);
  const frameColor = mixHexColors(edgeColor, color, 0.12);
  const innerShadow = mixHexColors(edgeColor, color, 0.28);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${corner}" fill="${color}" />
      <rect x="${frame / 2}" y="${frame / 2}" width="${size - frame}" height="${size - frame}" rx="${corner - 2}" fill="none" stroke="${frameColor}" stroke-width="${frame}" />
      <rect x="${innerInset}" y="${innerInset}" width="${size - innerInset * 2}" height="${size - innerInset * 2}" rx="${corner - 5}" fill="none" stroke="${highlight}" stroke-opacity="0.42" stroke-width="1" />
      <rect x="${seamInset}" y="${seamInset}" width="${size - seamInset * 2}" height="${size - seamInset * 2}" rx="${corner - 9}" fill="none" stroke="${innerShadow}" stroke-opacity="0.12" stroke-width="1" />
      <path d="M ${innerInset} ${size * 0.28} H ${size - innerInset}" stroke="${highlight}" stroke-opacity="0.08" stroke-width="1" />
      <path d="M ${size * 0.28} ${innerInset} V ${size - innerInset}" stroke="${highlight}" stroke-opacity="0.06" stroke-width="1" />
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function mixHexColors(left: string, right: string, t: number) {
  const normalizedLeft = normalizeHex(left);
  const normalizedRight = normalizeHex(right);
  const leftValue = Number.parseInt(normalizedLeft.slice(1), 16);
  const rightValue = Number.parseInt(normalizedRight.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => {
    const leftChannel = (leftValue >> shift) & 255;
    const rightChannel = (rightValue >> shift) & 255;
    return Math.round(leftChannel + (rightChannel - leftChannel) * t)
      .toString(16)
      .padStart(2, "0");
  });

  return `#${channels.join("")}`;
}

function normalizeHex(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }

  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("")}`;
  }

  return "#808080";
}

export function toTuple(vector: Vec3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

export function addVec3(left: Vec3, right: Vec3): Vec3 {
  return vec3(left.x + right.x, left.y + right.y, left.z + right.z);
}

export function subVec3(left: Vec3, right: Vec3): Vec3 {
  return vec3(left.x - right.x, left.y - right.y, left.z - right.z);
}

export function scaleVec3(vector: Vec3, scalar: number): Vec3 {
  return vec3(vector.x * scalar, vector.y * scalar, vector.z * scalar);
}

export function dotVec3(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function crossVec3(left: Vec3, right: Vec3): Vec3 {
  return vec3(
    left.y * right.z - left.z * right.y,
    left.z * right.x - left.x * right.z,
    left.x * right.y - left.y * right.x
  );
}

export function lengthVec3(vector: Vec3): number {
  return Math.sqrt(dotVec3(vector, vector));
}

export function normalizeVec3(vector: Vec3, epsilon = 0.000001): Vec3 {
  const length = lengthVec3(vector);

  if (length <= epsilon) {
    return vec3(0, 0, 0);
  }

  return scaleVec3(vector, 1 / length);
}

export function averageVec3(vectors: Vec3[]): Vec3 {
  if (vectors.length === 0) {
    return vec3(0, 0, 0);
  }

  const total = vectors.reduce((sum, vector) => addVec3(sum, vector), vec3(0, 0, 0));

  return scaleVec3(total, 1 / vectors.length);
}

export function almostEqual(left: number, right: number, epsilon = 0.0001): boolean {
  return Math.abs(left - right) <= epsilon;
}

export function snapValue(value: number, increment: number): number {
  if (increment <= 0) {
    return value;
  }

  return Math.round(value / increment) * increment;
}

export function snapVec3(vector: Vec3, increment: number): Vec3 {
  return vec3(snapValue(vector.x, increment), snapValue(vector.y, increment), snapValue(vector.z, increment));
}

export function makeTransform(position = vec3(0, 0, 0)): Transform {
  return {
    position,
    rotation: vec3(0, 0, 0),
    scale: vec3(1, 1, 1)
  };
}

export function resolveTransformPivot(transform: Transform): Vec3 {
  return transform.pivot ?? vec3(0, 0, 0);
}

export type SceneGraphResolution = {
  entityChildrenByParentId: Map<NodeID, Entity["id"][]>;
  entityWorldTransforms: Map<Entity["id"], Transform>;
  nodeChildrenByParentId: Map<NodeID, NodeID[]>;
  nodeWorldTransforms: Map<NodeID, Transform>;
  rootEntityIds: Entity["id"][];
  rootNodeIds: NodeID[];
};

const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempScale = new Vector3();

export function composeTransforms(parent: Transform, child: Transform): Transform {
  const matrix = transformToMatrix(parent).multiply(transformToMatrix(child));
  return matrixToTransform(matrix, child.pivot);
}

export function localizeTransform(world: Transform, parentWorld?: Transform): Transform {
  if (!parentWorld) {
    return structuredClone(world);
  }

  const matrix = transformToMatrix(parentWorld).invert().multiply(transformToMatrix(world));
  return matrixToTransform(matrix, world.pivot);
}

export function resolveSceneGraph(
  nodes: Iterable<Pick<GeometryNode, "id" | "parentId" | "transform">>,
  entities: Iterable<Pick<Entity, "id" | "parentId" | "transform">> = []
): SceneGraphResolution {
  const nodeList = Array.from(nodes);
  const entityList = Array.from(entities);
  const nodesById = new Map(nodeList.map((node) => [node.id, node]));
  const nodeWorldTransforms = new Map<NodeID, Transform>();
  const entityWorldTransforms = new Map<Entity["id"], Transform>();
  const nodeChildrenByParentId = new Map<NodeID, NodeID[]>();
  const entityChildrenByParentId = new Map<NodeID, Entity["id"][]>();
  const rootNodeIds: NodeID[] = [];
  const rootEntityIds: Entity["id"][] = [];
  const nodeStack = new Set<NodeID>();

  const appendNodeChild = (parentId: NodeID, childId: NodeID) => {
    const children = nodeChildrenByParentId.get(parentId);

    if (children) {
      children.push(childId);
      return;
    }

    nodeChildrenByParentId.set(parentId, [childId]);
  };

  const appendEntityChild = (parentId: NodeID, childId: Entity["id"]) => {
    const children = entityChildrenByParentId.get(parentId);

    if (children) {
      children.push(childId);
      return;
    }

    entityChildrenByParentId.set(parentId, [childId]);
  };

  const resolveNodeTransform = (node: Pick<GeometryNode, "id" | "parentId" | "transform">): Transform => {
    const cached = nodeWorldTransforms.get(node.id);

    if (cached) {
      return cached;
    }

    if (nodeStack.has(node.id)) {
      const fallback = structuredClone(node.transform);
      nodeWorldTransforms.set(node.id, fallback);
      return fallback;
    }

    nodeStack.add(node.id);

    const parent =
      node.parentId && node.parentId !== node.id
        ? nodesById.get(node.parentId)
        : undefined;
    const resolved = parent
      ? composeTransforms(resolveNodeTransform(parent), node.transform)
      : structuredClone(node.transform);

    nodeWorldTransforms.set(node.id, resolved);
    nodeStack.delete(node.id);
    return resolved;
  };

  nodeList.forEach((node) => {
    resolveNodeTransform(node);

    const hasValidParent = Boolean(
      node.parentId &&
      node.parentId !== node.id &&
      nodesById.has(node.parentId)
    );

    if (hasValidParent) {
      appendNodeChild(node.parentId!, node.id);
      return;
    }

    rootNodeIds.push(node.id);
  });

  entityList.forEach((entity) => {
    const parent =
      entity.parentId && nodesById.has(entity.parentId)
        ? nodesById.get(entity.parentId)
        : undefined;

    entityWorldTransforms.set(
      entity.id,
      parent ? composeTransforms(resolveNodeTransform(parent), entity.transform) : structuredClone(entity.transform)
    );

    if (parent) {
      appendEntityChild(parent.id, entity.id);
      return;
    }

    rootEntityIds.push(entity.id);
  });

  return {
    entityChildrenByParentId,
    entityWorldTransforms,
    nodeChildrenByParentId,
    nodeWorldTransforms,
    rootEntityIds,
    rootNodeIds
  };
}

export function createDefaultSceneSettings(): SceneSettings {
  return {
    events: [],
    paths: [],
    player: {
      cameraMode: "fps",
      canCrouch: true,
      canInteract: true,
      canJump: true,
      canRun: true,
      crouchHeight: 1.2,
      height: 1.8,
      interactKey: "KeyE",
      jumpHeight: 1.2,
      movementSpeed: 4.5,
      runningSpeed: 7.5
    },
    world: {
      ambientColor: "#ffffff",
      ambientIntensity: 0.4,
      fogColor: "#0b1118",
      fogFar: 2000,
      fogNear: 500,
      gravity: vec3(0, -9.81, 0),
      lod: {
        bakedAt: "",
        enabled: false,
        lowDetailRatio: 0.22,
        midDetailRatio: 0.52
      },
      physicsEnabled: true,
      skybox: {
        affectsLighting: false,
        blur: 0,
        enabled: false,
        format: "image",
        intensity: 1,
        lightingIntensity: 1,
        name: "",
        source: ""
      }
    }
  };
}

export function normalizeSceneSettings(settings?: Partial<SceneSettings> | SceneSettings): SceneSettings {
  const defaults = createDefaultSceneSettings();

  return {
    ...defaults,
    ...settings,
    events: normalizeSceneEvents(settings?.events),
    paths: normalizeScenePaths(settings?.paths),
    player: {
      ...defaults.player,
      ...(settings?.player ?? {})
    },
    world: normalizeWorldSettings(settings?.world)
  };
}

function normalizeWorldSettings(world?: Partial<WorldSettings> | WorldSettings): WorldSettings {
  const defaults = createDefaultSceneSettings().world;
  const fogNear = clampFiniteNumber(world?.fogNear, defaults.fogNear);
  const fogFar = clampFiniteNumber(world?.fogFar, defaults.fogFar);
  const resolvedFogNear = Math.max(0, fogNear);
  const lod = normalizeWorldLodSettings(world?.lod);
  const skybox = normalizeSceneSkybox(world?.skybox);

  return {
    ...defaults,
    ...world,
    fogNear: resolvedFogNear,
    fogFar: Math.max(resolvedFogNear + 0.01, fogFar),
    gravity: world?.gravity ?? defaults.gravity,
    lod,
    skybox,
  };
}

function normalizeWorldLodSettings(lod?: Partial<WorldSettings["lod"]> | WorldSettings["lod"]): WorldSettings["lod"] {
  const defaults = createDefaultSceneSettings().world.lod;
  const resolvedMidDetailRatio = clampUnitInterval(clampFiniteNumber(lod?.midDetailRatio, defaults.midDetailRatio));
  const resolvedLowDetailRatio = Math.min(
    clampUnitInterval(clampFiniteNumber(lod?.lowDetailRatio, defaults.lowDetailRatio)),
    resolvedMidDetailRatio
  );

  return {
    ...defaults,
    ...lod,
    bakedAt: typeof lod?.bakedAt === "string" ? lod.bakedAt : defaults.bakedAt,
    enabled: Boolean(lod?.enabled),
    lowDetailRatio: resolvedLowDetailRatio,
    midDetailRatio: Math.max(resolvedMidDetailRatio, resolvedLowDetailRatio)
  };
}

function normalizeSceneSkybox(skybox?: Partial<WorldSettings["skybox"]> | WorldSettings["skybox"]): WorldSettings["skybox"] {
  const defaults = createDefaultSceneSettings().world.skybox;
  const format = skybox?.format === "hdr" ? "hdr" : "image";

  return {
    ...defaults,
    ...skybox,
    affectsLighting: Boolean(skybox?.affectsLighting),
    blur: Math.min(1, Math.max(0, clampFiniteNumber(skybox?.blur, defaults.blur))),
    enabled: Boolean(skybox?.enabled),
    format,
    intensity: Math.max(0, clampFiniteNumber(skybox?.intensity, defaults.intensity)),
    lightingIntensity: Math.max(0, clampFiniteNumber(skybox?.lightingIntensity, defaults.lightingIntensity)),
    name: typeof skybox?.name === "string" ? skybox.name.trim() : defaults.name,
    source: typeof skybox?.source === "string" ? skybox.source.trim() : defaults.source
  };
}

function normalizeSceneEvents(events?: SceneSettings["events"]): NonNullable<SceneSettings["events"]> {
  return (events ?? []).map((eventDefinition) => ({
    ...eventDefinition,
    custom: eventDefinition.custom ?? true
  }));
}

function normalizeScenePaths(paths?: SceneSettings["paths"]): NonNullable<SceneSettings["paths"]> {
  return (paths ?? []).map((pathDefinition, index) => ({
    id: pathDefinition.id?.trim() || `path_${index + 1}`,
    loop: pathDefinition.loop ?? false,
    name: pathDefinition.name?.trim() || `Path ${index + 1}`,
    points: normalizeScenePathPoints(pathDefinition.points)
  }));
}

function normalizeScenePathPoints(points?: ScenePathDefinition["points"]): ScenePathDefinition["points"] {
  return (points ?? []).map((point) => ({
    x: clampFiniteNumber(point?.x, 0),
    y: clampFiniteNumber(point?.y, 0),
    z: clampFiniteNumber(point?.z, 0)
  }));
}

function clampFiniteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function isBrushNode(node: GeometryNode): node is BrushNode {
  return node.kind === "brush";
}

export function isMeshNode(node: GeometryNode): node is MeshNode {
  return node.kind === "mesh";
}

export function isGroupNode(node: GeometryNode): node is GroupNode {
  return node.kind === "group";
}

export function isModelNode(node: GeometryNode): node is ModelNode {
  return node.kind === "model";
}

export function isPrimitiveNode(node: GeometryNode): node is PrimitiveNode {
  return node.kind === "primitive";
}

export function isInstancingNode(node: GeometryNode): node is InstancingNode {
  return node.kind === "instancing";
}

export function isLightNode(node: GeometryNode): node is LightNode {
  return node.kind === "light";
}

export function isInstancingSourceNode(node: GeometryNode): node is BrushNode | MeshNode | PrimitiveNode | ModelNode {
  return isBrushNode(node) || isMeshNode(node) || isPrimitiveNode(node) || isModelNode(node);
}

export function resolveInstancingSourceNode(
  nodes: Iterable<GeometryNode>,
  nodeOrId: GeometryNode | NodeID,
  maxDepth = 32
) {
  const nodesById = new Map(Array.from(nodes, (node) => [node.id, node] as const));
  let current = typeof nodeOrId === "string" ? nodesById.get(nodeOrId) : nodeOrId;
  let depth = 0;

  while (current && depth <= maxDepth) {
    if (isInstancingSourceNode(current)) {
      return current;
    }

    if (!isInstancingNode(current)) {
      return undefined;
    }

    current = nodesById.get(current.data.sourceNodeId);
    depth += 1;
  }

  return undefined;
}

function transformToMatrix(transform: Transform) {
  return new Matrix4().compose(
    new Vector3(transform.position.x, transform.position.y, transform.position.z),
    new Quaternion().setFromEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ")),
    new Vector3(transform.scale.x, transform.scale.y, transform.scale.z)
  );
}

function matrixToTransform(matrix: Matrix4, pivot?: Vec3): Transform {
  matrix.decompose(tempPosition, tempQuaternion, tempScale);
  const rotation = new Euler().setFromQuaternion(tempQuaternion, "XYZ");

  return {
    pivot: pivot ? vec3(pivot.x, pivot.y, pivot.z) : undefined,
    position: vec3(tempPosition.x, tempPosition.y, tempPosition.z),
    rotation: vec3(rotation.x, rotation.y, rotation.z),
    scale: vec3(tempScale.x, tempScale.y, tempScale.z)
  };
}
