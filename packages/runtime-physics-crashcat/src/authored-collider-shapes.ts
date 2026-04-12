import type { DerivedRenderMesh } from "@ggez/render-pipeline";
import {
  box,
  capsule,
  convexHull,
  cylinder,
  sphere,
  staticCompound,
  transformed,
  type Shape
} from "crashcat";
import { resolvePropColliderDefinition } from "@ggez/shared";
import { Euler, Quaternion } from "three";

const IDENTITY_QUATERNION: [0, 0, 0, 1] = [0, 0, 0, 1];

export function createAuthoredColliderShape(
  mesh: Pick<DerivedRenderMesh, "modelCenter" | "modelPath" | "physics" | "pivot" | "scale">,
  definitions = mesh.physics?.colliderDefinitions ?? []
) {
  if (definitions.length === 0) {
    return undefined;
  }

  const pivot = mesh.pivot ?? { x: 0, y: 0, z: 0 };
  const modelCenter = mesh.modelPath ? (mesh.modelCenter ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
  const nodeScale = mesh.scale ?? { x: 1, y: 1, z: 1 };
  const children = definitions.map((definition) => {
    const resolved = resolvePropColliderDefinition(definition);

    return {
      position: [
        (resolved.position.x + modelCenter.x - pivot.x) * nodeScale.x,
        (resolved.position.y + modelCenter.y - pivot.y) * nodeScale.y,
        (resolved.position.z + modelCenter.z - pivot.z) * nodeScale.z
      ] as [number, number, number],
      quaternion: toCrashcatQuaternion(resolved.rotation),
      shape: createLocalColliderShape(mesh.physics?.density, resolved, nodeScale)
    };
  });

  const baseShape = children.length === 1
    ? transformed.create({
        position: children[0].position,
        quaternion: children[0].quaternion,
        shape: children[0].shape
      })
    : staticCompound.create({ children });

  return baseShape;
}

function createLocalColliderShape(
  density: number | undefined,
  resolved: ReturnType<typeof resolvePropColliderDefinition>,
  nodeScale: { x: number; y: number; z: number }
): Shape {
  const scaleAbs = {
    x: Math.max(Math.abs(nodeScale.x), 1e-4),
    y: Math.max(Math.abs(nodeScale.y), 1e-4),
    z: Math.max(Math.abs(nodeScale.z), 1e-4)
  };

  switch (resolved.shape) {
    case "ball":
      return sphere.create({ density, radius: resolved.radius * Math.max(scaleAbs.x, scaleAbs.y, scaleAbs.z) });
    case "cuboid":
      return box.create({
        density,
        halfExtents: [
          resolved.halfExtents.x * scaleAbs.x,
          resolved.halfExtents.y * scaleAbs.y,
          resolved.halfExtents.z * scaleAbs.z
        ]
      });
    case "capsule":
      return capsule.create({
        density,
        halfHeightOfCylinder: resolved.halfHeightOfCylinder * scaleAbs.y,
        radius: resolved.radius * Math.max(scaleAbs.x, scaleAbs.z)
      });
    case "cylinder":
      return cylinder.create({
        density,
        halfHeight: resolved.halfHeight * scaleAbs.y,
        radius: resolved.radius * Math.max(scaleAbs.x, scaleAbs.z)
      });
    case "cone":
      return convexHull.create({
        density,
        positions: createConeHullPositions(
          resolved.radius * Math.max(scaleAbs.x, scaleAbs.z),
          resolved.halfHeight * scaleAbs.y
        )
      });
  }
}

function createConeHullPositions(radius: number, halfHeight: number) {
  const positions = [0, halfHeight, 0];
  const segments = 12;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, -halfHeight, Math.sin(angle) * radius);
  }

  return positions;
}

function toCrashcatQuaternion(rotation: { x: number; y: number; z: number }): [number, number, number, number] {
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z));
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}