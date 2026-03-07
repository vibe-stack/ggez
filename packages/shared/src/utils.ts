import type { BrushNode, GeometryNode, MeshNode, ModelNode, Transform, Vec2, Vec3 } from "./types";

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
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

export function isBrushNode(node: GeometryNode): node is BrushNode {
  return node.kind === "brush";
}

export function isMeshNode(node: GeometryNode): node is MeshNode {
  return node.kind === "mesh";
}

export function isModelNode(node: GeometryNode): node is ModelNode {
  return node.kind === "model";
}
