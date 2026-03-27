import {
  MotionQuality,
  MotionType,
  addBroadphaseLayer,
  addObjectLayer,
  box,
  createWorld,
  createWorldSettings,
  enableCollision,
  registerAll,
  rigidBody,
  sphere,
  transformed,
  triangleMesh,
  updateWorld,
  type RigidBody,
  type Shape,
  type World
} from "crashcat";
import { capsule, castRay, createClosestCastRayCollector, createDefaultCastRaySettings, cylinder, dof, filter } from "crashcat";
import type { DerivedRenderMesh } from "@ggez/render-pipeline";
import { getRuntimePhysicsDescriptors, type RuntimePhysicsDescriptor } from "@ggez/runtime-format";
import { resolveTransformPivot, toTuple, type SceneSettings } from "@ggez/shared";
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Quaternion,
  SphereGeometry
} from "three";

export {
  CastRayStatus,
  MotionQuality,
  MotionType,
  capsule,
  castRay,
  createClosestCastRayCollector,
  createDefaultCastRaySettings,
  cylinder,
  dof,
  filter,
  rigidBody
} from "crashcat";
export type { ClosestCastRayCollector, RigidBody as CrashcatRigidBody, World as CrashcatPhysicsWorld } from "crashcat";

let crashcatReady = false;

export const CRASHCAT_BROADPHASE_LAYER_MOVING = 0;
export const CRASHCAT_BROADPHASE_LAYER_STATIC = 1;
export const CRASHCAT_OBJECT_LAYER_MOVING = 0;
export const CRASHCAT_OBJECT_LAYER_STATIC = 1;

export async function ensureCrashcatRuntimePhysics() {
  if (crashcatReady) {
    return;
  }

  registerAll();
  crashcatReady = true;
}

export function createCrashcatPhysicsWorld(settings: Pick<SceneSettings, "world">) {
  const worldSettings = createWorldSettings();
  worldSettings.gravity = toTuple(settings.world.gravity);
  const movingBroadphaseLayer = addBroadphaseLayer(worldSettings);
  const staticBroadphaseLayer = addBroadphaseLayer(worldSettings);
  const movingObjectLayer = addObjectLayer(worldSettings, movingBroadphaseLayer);
  const staticObjectLayer = addObjectLayer(worldSettings, staticBroadphaseLayer);
  enableCollision(worldSettings, movingObjectLayer, movingObjectLayer);
  enableCollision(worldSettings, movingObjectLayer, staticObjectLayer);
  return createWorld(worldSettings);
}

export function stepCrashcatPhysicsWorld(world: World, deltaSeconds: number) {
  updateWorld(world, undefined, deltaSeconds);
}

export function createStaticRigidBody(world: World, mesh: DerivedRenderMesh) {
  return rigidBody.create(world, {
    friction: mesh.physics?.friction ?? 0.5,
    motionType: MotionType.STATIC,
    objectLayer: CRASHCAT_OBJECT_LAYER_STATIC,
    position: toTuple(mesh.position),
    quaternion: createCrashcatQuaternion(mesh.rotation),
    restitution: mesh.physics?.restitution ?? 0,
    sensor: mesh.physics?.sensor ?? false,
    shape: createCrashcatShape(mesh)
  });
}

export function createDynamicRigidBody(world: World, mesh: DerivedRenderMesh) {
  const physics = mesh.physics;
  const motionType = resolveMotionType(physics?.bodyType ?? "dynamic");

  return rigidBody.create(world, {
    allowSleeping: physics?.canSleep ?? true,
    allowedDegreesOfFreedom: dof(
      !(physics?.lockTranslations ?? false),
      !(physics?.lockTranslations ?? false),
      !(physics?.lockTranslations ?? false),
      !(physics?.lockRotations ?? false),
      !(physics?.lockRotations ?? false),
      !(physics?.lockRotations ?? false)
    ),
    angularDamping: physics?.angularDamping ?? 0,
    friction: physics?.friction ?? 0.5,
    gravityFactor: physics?.gravityScale ?? 1,
    linearDamping: physics?.linearDamping ?? 0,
    mass: physics?.mass,
    motionQuality: physics?.ccd ? MotionQuality.LINEAR_CAST : MotionQuality.DISCRETE,
    motionType,
    objectLayer: motionType === MotionType.STATIC ? CRASHCAT_OBJECT_LAYER_STATIC : CRASHCAT_OBJECT_LAYER_MOVING,
    position: toTuple(mesh.position),
    quaternion: createCrashcatQuaternion(mesh.rotation),
    restitution: physics?.restitution ?? 0,
    sensor: physics?.sensor ?? false,
    shape: createCrashcatShape(mesh)
  });
}

export function createRuntimePhysicsDescriptors(scene: Parameters<typeof getRuntimePhysicsDescriptors>[0]) {
  return getRuntimePhysicsDescriptors(scene);
}

export function createCrashcatShapeFromRuntimePhysics(descriptor: RuntimePhysicsDescriptor) {
  const node = descriptor.node;

  if (node.kind !== "primitive") {
    return undefined;
  }

  const mesh: Pick<DerivedRenderMesh, "physics" | "pivot" | "position" | "primitive" | "rotation" | "scale"> = {
    physics: descriptor.physics,
    pivot: node.transform.pivot,
    position: node.transform.position,
    primitive: toDerivedPrimitive(node),
    rotation: node.transform.rotation,
    scale: node.transform.scale
  };

  return createCrashcatShape(mesh as DerivedRenderMesh);
}

export function createCrashcatQuaternion(rotation: DerivedRenderMesh["rotation"]): [number, number, number, number] {
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z));
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function createCrashcatShape(mesh: DerivedRenderMesh) {
  const physics = mesh.physics;
  const primitiveShape = createPrimitiveShape(mesh);

  if (primitiveShape) {
    return applyPivotOffset(mesh, primitiveShape);
  }

  const geometry = createRenderableGeometry(mesh);

  if (!geometry) {
    return box.create({
      density: physics?.density,
      halfExtents: [0.5, 0.5, 0.5]
    });
  }

  const pivot = resolveMeshPivot(mesh);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const scaledVertices: number[] = new Array(position.count * 3);

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    scaledVertices[vertexIndex * 3] = position.getX(vertexIndex) * mesh.scale.x - pivot.x;
    scaledVertices[vertexIndex * 3 + 1] = position.getY(vertexIndex) * mesh.scale.y - pivot.y;
    scaledVertices[vertexIndex * 3 + 2] = position.getZ(vertexIndex) * mesh.scale.z - pivot.z;
  }

  const indices = index
    ? Array.from(index.array as ArrayLike<number>)
    : Array.from({ length: position.count }, (_, value) => value);

  geometry.dispose();

  return triangleMesh.create({
    indices,
    positions: scaledVertices
  });
}

function createPrimitiveShape(mesh: DerivedRenderMesh) {
  const physics = mesh.physics;

  if (mesh.primitive && physics) {
    if (physics.colliderShape === "ball" && mesh.primitive.kind === "sphere") {
      return sphere.create({
        density: physics.density,
        radius: mesh.primitive.radius * maxAxisScale(mesh.scale)
      });
    }

    if (physics.colliderShape === "cuboid" && mesh.primitive.kind === "box") {
      return box.create({
        density: physics.density,
        halfExtents: [
          Math.abs(mesh.primitive.size.x * mesh.scale.x) * 0.5,
          Math.abs(mesh.primitive.size.y * mesh.scale.y) * 0.5,
          Math.abs(mesh.primitive.size.z * mesh.scale.z) * 0.5
        ]
      });
    }

    if (physics.colliderShape === "cylinder" && mesh.primitive.kind === "cylinder") {
      return cylinder.create({
        density: physics.density,
        halfHeight: Math.abs(mesh.primitive.height * mesh.scale.y) * 0.5,
        radius: Math.max(
          Math.abs(mesh.primitive.radiusTop * mesh.scale.x),
          Math.abs(mesh.primitive.radiusBottom * mesh.scale.z)
        )
      });
    }
  }

  return undefined;
}

function applyPivotOffset(mesh: Pick<DerivedRenderMesh, "pivot" | "position" | "rotation" | "scale">, shape: Shape) {
  const pivot = resolveMeshPivot(mesh);

  if (pivot.x === 0 && pivot.y === 0 && pivot.z === 0) {
    return shape;
  }

  return transformed.create({
    position: [-pivot.x, -pivot.y, -pivot.z],
    quaternion: [0, 0, 0, 1],
    shape
  });
}

function resolveMotionType(bodyType: NonNullable<DerivedRenderMesh["physics"]>["bodyType"]) {
  switch (bodyType) {
    case "fixed":
      return MotionType.STATIC;
    case "kinematicPosition":
      return MotionType.KINEMATIC;
    default:
      return MotionType.DYNAMIC;
  }
}

function createRenderableGeometry(mesh: DerivedRenderMesh) {
  let geometry: BufferGeometry | undefined;

  if (mesh.surface) {
    geometry = createIndexedGeometry(mesh.surface.positions, mesh.surface.indices, mesh.surface.uvs, mesh.surface.groups);
  } else if (mesh.primitive?.kind === "box") {
    geometry = new BoxGeometry(mesh.primitive.size.x, mesh.primitive.size.y, mesh.primitive.size.z);
  } else if (mesh.primitive?.kind === "sphere") {
    geometry = new SphereGeometry(mesh.primitive.radius, mesh.primitive.widthSegments, mesh.primitive.heightSegments);
  } else if (mesh.primitive?.kind === "cylinder") {
    geometry = new CylinderGeometry(
      mesh.primitive.radiusTop,
      mesh.primitive.radiusBottom,
      mesh.primitive.height,
      mesh.primitive.radialSegments
    );
  } else if (mesh.primitive?.kind === "cone") {
    geometry = new ConeGeometry(mesh.primitive.radius, mesh.primitive.height, mesh.primitive.radialSegments);
  }

  if (!geometry) {
    return undefined;
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createIndexedGeometry(
  positions: number[],
  indices?: number[],
  uvs?: number[],
  groups?: Array<{ count: number; materialIndex: number; start: number }>
) {
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

function resolveMeshPivot(mesh: Pick<DerivedRenderMesh, "pivot" | "position" | "rotation" | "scale">) {
  return resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });
}

function maxAxisScale(scale: DerivedRenderMesh["scale"]) {
  return Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
}

function toDerivedPrimitive(node: Extract<RuntimePhysicsDescriptor["node"], { kind: "primitive" }>): DerivedRenderMesh["primitive"] {
  switch (node.data.shape) {
    case "sphere":
      return {
        heightSegments: Math.max(8, Math.floor((node.data.radialSegments ?? 24) * 0.75)),
        kind: "sphere",
        radius: Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5,
        widthSegments: node.data.radialSegments ?? 24
      };
    case "cylinder":
      return {
        height: Math.abs(node.data.size.y),
        kind: "cylinder",
        radialSegments: node.data.radialSegments ?? 24,
        radiusBottom: Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5,
        radiusTop: Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5
      };
    case "cone":
      return {
        height: Math.abs(node.data.size.y),
        kind: "cone",
        radialSegments: node.data.radialSegments ?? 24,
        radius: Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5
      };
    default:
      return {
        kind: "box",
        size: node.data.size
      };
  }
}
