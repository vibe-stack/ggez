import type { BrushNode, GeometryNode, MeshNode, ModelNode, Transform, Vec2, Vec3 } from "./types";

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

export function isBrushNode(node: GeometryNode): node is BrushNode {
  return node.kind === "brush";
}

export function isMeshNode(node: GeometryNode): node is MeshNode {
  return node.kind === "mesh";
}

export function isModelNode(node: GeometryNode): node is ModelNode {
  return node.kind === "model";
}
