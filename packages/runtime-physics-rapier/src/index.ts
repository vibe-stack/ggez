import RAPIER from "@dimforge/rapier3d-compat";
import type { DerivedRenderMesh } from "@web-hammer/render-pipeline";
import { getRuntimePhysicsDescriptors, type RuntimePhysicsDescriptor } from "@web-hammer/runtime-format";
import { resolveTransformPivot, type SceneSettings } from "@web-hammer/shared";
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

let rapierReady: Promise<void> | undefined;

export async function ensureRapierRuntimePhysics() {
  rapierReady ??= RAPIER.init();
  await rapierReady;
}

export function createRapierPhysicsWorld(settings: Pick<SceneSettings, "world">) {
  return new RAPIER.World(settings.world.gravity);
}

export function createStaticRigidBody(world: RAPIER.World, mesh: DerivedRenderMesh) {
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    .setRotation(createRapierQuaternion(mesh.rotation));
  const body = world.createRigidBody(bodyDesc);
  const collider = createRapierColliderDesc(mesh);

  if (collider) {
    world.createCollider(collider, body);
  }

  return body;
}

export function createDynamicRigidBody(world: RAPIER.World, mesh: DerivedRenderMesh) {
  const physics = mesh.physics;
  const bodyDesc = resolveRigidBodyDesc(physics?.bodyType ?? "dynamic")
    .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    .setRotation(createRapierQuaternion(mesh.rotation));
  const body = world.createRigidBody(bodyDesc);

  if (physics) {
    body.setAngularDamping(physics.angularDamping);
    body.setLinearDamping(physics.linearDamping);
    body.setGravityScale(physics.gravityScale, true);

    if (physics.lockRotations) {
      body.lockRotations(true, true);
    }

    if (physics.lockTranslations) {
      body.lockTranslations(true, true);
    }
  }

  const collider = createRapierColliderDesc(mesh);

  if (collider) {
    world.createCollider(collider, body);
  }

  return body;
}

export function createRapierColliderDesc(mesh: DerivedRenderMesh) {
  const physics = mesh.physics;
  const pivot = resolveMeshPivot(mesh);
  let desc: RAPIER.ColliderDesc | undefined;

  if (mesh.primitive && physics) {
    if (physics.colliderShape === "ball" && mesh.primitive.kind === "sphere") {
      desc = RAPIER.ColliderDesc.ball(mesh.primitive.radius * maxAxisScale(mesh.scale));
    }

    if (physics.colliderShape === "cuboid" && mesh.primitive.kind === "box") {
      desc = RAPIER.ColliderDesc.cuboid(
        Math.abs(mesh.primitive.size.x * mesh.scale.x) * 0.5,
        Math.abs(mesh.primitive.size.y * mesh.scale.y) * 0.5,
        Math.abs(mesh.primitive.size.z * mesh.scale.z) * 0.5
      );
    }

    if (physics.colliderShape === "cylinder" && mesh.primitive.kind === "cylinder") {
      desc = RAPIER.ColliderDesc.cylinder(
        Math.abs(mesh.primitive.height * mesh.scale.y) * 0.5,
        Math.max(Math.abs(mesh.primitive.radiusTop * mesh.scale.x), Math.abs(mesh.primitive.radiusBottom * mesh.scale.z))
      );
    }

    if (physics.colliderShape === "cone" && mesh.primitive.kind === "cone") {
      desc = RAPIER.ColliderDesc.cone(
        Math.abs(mesh.primitive.height * mesh.scale.y) * 0.5,
        Math.abs(mesh.primitive.radius * maxAxisScale(mesh.scale))
      );
    }
  }

  if (!desc) {
    const geometry = createRenderableGeometry(mesh);

    if (!geometry) {
      return undefined;
    }

    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const scaledVertices = new Float32Array(position.count * 3);

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      scaledVertices[vertexIndex * 3] = position.getX(vertexIndex) * mesh.scale.x - pivot.x;
      scaledVertices[vertexIndex * 3 + 1] = position.getY(vertexIndex) * mesh.scale.y - pivot.y;
      scaledVertices[vertexIndex * 3 + 2] = position.getZ(vertexIndex) * mesh.scale.z - pivot.z;
    }

    const indices = index
      ? Uint32Array.from(index.array as ArrayLike<number>)
      : Uint32Array.from({ length: position.count }, (_, value) => value);
    desc = RAPIER.ColliderDesc.trimesh(scaledVertices, indices);
    geometry.dispose();
  } else {
    desc.setTranslation(-pivot.x, -pivot.y, -pivot.z);
  }

  if (!physics) {
    return desc;
  }

  if (physics.contactSkin !== undefined) {
    desc.setContactSkin(physics.contactSkin);
  }

  if (physics.density !== undefined) {
    desc.setDensity(physics.density);
  } else if (physics.mass !== undefined) {
    desc.setMass(physics.mass);
  }

  desc.setFriction(physics.friction);
  desc.setRestitution(physics.restitution);
  desc.setSensor(physics.sensor);

  return desc;
}

export function createRuntimePhysicsDescriptors(scene: Parameters<typeof getRuntimePhysicsDescriptors>[0]) {
  return getRuntimePhysicsDescriptors(scene);
}

export function createRapierColliderDescFromRuntimePhysics(descriptor: RuntimePhysicsDescriptor) {
  const node = descriptor.node;

  if (node.kind !== "primitive") {
    return undefined;
  }

  const mesh: Pick<DerivedRenderMesh, "physics" | "position" | "primitive" | "rotation" | "scale" | "pivot"> = {
    physics: descriptor.physics,
    pivot: node.transform.pivot,
    position: node.transform.position,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
    primitive: toDerivedPrimitive(node)
  };

  return createRapierColliderDesc(mesh as DerivedRenderMesh);
}

export function createRapierQuaternion(rotation: DerivedRenderMesh["rotation"]) {
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z));

  return {
    w: quaternion.w,
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z
  };
}

function resolveRigidBodyDesc(bodyType: NonNullable<DerivedRenderMesh["physics"]>["bodyType"]) {
  switch (bodyType) {
    case "fixed":
      return RAPIER.RigidBodyDesc.fixed();
    case "kinematicPosition":
      return RAPIER.RigidBodyDesc.kinematicPositionBased();
    default:
      return RAPIER.RigidBodyDesc.dynamic();
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
