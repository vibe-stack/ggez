import type { PropColliderDefinition, PropColliderDefinitionShape, Vec3 } from "./types";

export type ResolvedPropColliderDefinition =
  | {
      shape: "ball";
      position: Vec3;
      radius: number;
      rotation: Vec3;
      scale: Vec3;
    }
  | {
      halfExtents: Vec3;
      position: Vec3;
      rotation: Vec3;
      scale: Vec3;
      shape: "cuboid";
    }
  | {
      halfHeight: number;
      position: Vec3;
      radius: number;
      rotation: Vec3;
      scale: Vec3;
      shape: "cone" | "cylinder";
    }
  | {
      halfHeightOfCylinder: number;
      position: Vec3;
      radius: number;
      rotation: Vec3;
      scale: Vec3;
      shape: "capsule";
    };

export function createDefaultColliderDefinition(
  shape: PropColliderDefinitionShape,
  id: string,
  scale: Vec3 = shape === "ball" ? { x: 1, y: 1, z: 1 } : { x: 1, y: 2, z: 1 }
): PropColliderDefinition {
  return {
    id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale,
    shape
  };
}

export function resolvePropColliderDefinition(definition: PropColliderDefinition): ResolvedPropColliderDefinition {
  const absScale = {
    x: Math.max(Math.abs(definition.scale.x), 1e-4),
    y: Math.max(Math.abs(definition.scale.y), 1e-4),
    z: Math.max(Math.abs(definition.scale.z), 1e-4)
  };
  const planarRadius = Math.max(absScale.x, absScale.z) * 0.5;

  switch (definition.shape) {
    case "ball":
      return {
        position: definition.position,
        radius: Math.max(absScale.x, absScale.y, absScale.z) * 0.5,
        rotation: definition.rotation,
        scale: absScale,
        shape: definition.shape
      };
    case "cuboid":
      return {
        halfExtents: { x: absScale.x * 0.5, y: absScale.y * 0.5, z: absScale.z * 0.5 },
        position: definition.position,
        rotation: definition.rotation,
        scale: absScale,
        shape: definition.shape
      };
    case "capsule":
      return {
        halfHeightOfCylinder: Math.max(0, absScale.y * 0.5 - planarRadius),
        position: definition.position,
        radius: planarRadius,
        rotation: definition.rotation,
        scale: absScale,
        shape: definition.shape
      };
    case "cone":
    case "cylinder":
      return {
        halfHeight: absScale.y * 0.5,
        position: definition.position,
        radius: planarRadius,
        rotation: definition.rotation,
        scale: absScale,
        shape: definition.shape
      };
  }
}