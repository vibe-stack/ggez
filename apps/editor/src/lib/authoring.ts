import {
  type BrushShape,
  makeTransform,
  vec3,
  type Entity,
  type EntityType,
  type LightNodeData,
  type LightType,
  type PrimitiveNodeData,
  type PrimitiveRole,
  type PrimitiveShape,
  type PropColliderShape,
  type PropPhysics,
  type Transform,
  type Vec3
} from "@ggez/shared";

export const BRUSH_SHAPES: Array<{ label: string; shape: BrushShape }> = [
  { label: "Cube", shape: "cube" },
  { label: "Custom Polygon", shape: "custom-polygon" },
  { label: "Plane", shape: "plane" },
  { label: "Ramp", shape: "ramp" },
  { label: "Sphere", shape: "sphere" },
  { label: "Stairs", shape: "stairs" },
  { label: "Cylinder", shape: "cylinder" },
  { label: "Cone", shape: "cone" }
];

export const PROP_PRESETS: Array<{ label: string; shape: PrimitiveShape }> = [
  { label: "Crate", shape: "cube" },
  { label: "Cylinder", shape: "cylinder" },
  { label: "Cone", shape: "cone" },
  { label: "Sphere", shape: "sphere" }
];

export const ENTITY_PRESETS: Array<{ label: string; type: EntityType }> = [
  { label: "Player Spawn", type: "player-spawn" },
  { label: "NPC Spawn", type: "npc-spawn" },
  { label: "Smart Object", type: "smart-object" }
];

export const LIGHT_PRESETS: Array<{ label: string; type: LightType }> = [
  { label: "Point", type: "point" },
  { label: "Directional", type: "directional" },
  { label: "Hemisphere", type: "hemisphere" },
  { label: "Spot", type: "spot" },
  { label: "Ambient", type: "ambient" }
];

export function createPrimitiveNodeData(
  role: PrimitiveRole,
  shape: PrimitiveShape,
  size = createDefaultPrimitiveSize(shape)
): PrimitiveNodeData {
  return {
    materialId: role === "brush" ? "material:blockout:orange" : "material:flat:steel",
    physics: role === "prop" ? createDefaultPropPhysics(shape) : undefined,
    radialSegments: shape === "cube" ? undefined : 24,
    role,
    shape,
    size,
    uvScale: { x: 1, y: 1 }
  };
}

export function createPrimitiveNodeLabel(role: PrimitiveRole, shape: PrimitiveShape) {
  if (role === "prop" && shape === "cube") {
    return "Crate";
  }

  const base = shape.charAt(0).toUpperCase() + shape.slice(1);
  return role === "brush" ? `Blockout ${base}` : base;
}

export function createDefaultPrimitiveSize(shape: PrimitiveShape) {
  switch (shape) {
    case "sphere":
      return vec3(2, 2, 2);
    case "cylinder":
      return vec3(2, 3, 2);
    case "cone":
      return vec3(2, 3, 2);
    case "cube":
    default:
      return vec3(2, 2, 2);
  }
}

export function createDefaultPrimitiveTransform(position: Vec3): Transform {
  return makeTransform(position);
}

export function createDefaultPropPhysics(shape: PrimitiveShape): PropPhysics {
  return {
    angularDamping: 0.8,
    bodyType: "fixed",
    canSleep: true,
    ccd: false,
    colliderShape: resolveDefaultColliderShape(shape),
    contactSkin: 0,
    density: undefined,
    enabled: true,
    friction: 0.8,
    gravityScale: 1,
    linearDamping: 0.7,
    lockRotations: false,
    lockTranslations: false,
    mass: 1,
    restitution: 0.05,
    sensor: false
  };
}

export function createDefaultLightData(type: LightType): LightNodeData {
  switch (type) {
    case "ambient":
      return {
        castShadow: false,
        color: "#fff5d6",
        enabled: true,
        intensity: 0.6,
        type
      };
    case "directional":
      return {
        castShadow: true,
        color: "#fff3cf",
        enabled: true,
        intensity: 1.25,
        type
      };
    case "hemisphere":
      return {
        castShadow: false,
        color: "#9ec5f8",
        enabled: true,
        groundColor: "#0f1721",
        intensity: 0.85,
        type
      };
    case "spot":
      return {
        angle: Math.PI / 6,
        castShadow: true,
        color: "#ffd089",
        decay: 1.4,
        distance: 24,
        enabled: true,
        intensity: 28,
        penumbra: 0.35,
        type
      };
    case "point":
    default:
      return {
        castShadow: true,
        color: "#ffd089",
        decay: 1.2,
        distance: 18,
        enabled: true,
        intensity: 18,
        type
      };
  }
}

export function createLightNodeLabel(type: LightType) {
  return `${type.charAt(0).toUpperCase() + type.slice(1)} Light`;
}

export function createDefaultEntity(type: EntityType, position: Vec3, index: number): Entity {
  const label = createEntityLabel(type);

  return {
    hooks: [],
    id: `entity:${type}:${index}`,
    name: label,
    properties:
      type === "player-spawn"
        ? { enabled: true, team: "player" }
        : type === "npc-spawn"
          ? { enabled: true, faction: "neutral" }
          : { enabled: true, reusable: true },
    transform: makeTransform(position),
    type
  };
}

export function createEntityLabel(type: EntityType) {
  switch (type) {
    case "player-spawn":
      return "Player Spawn";
    case "npc-spawn":
      return "NPC Spawn";
    case "smart-object":
    default:
      return "Smart Object";
  }
}

function resolveDefaultColliderShape(shape: PrimitiveShape): PropColliderShape {
  switch (shape) {
    case "sphere":
      return "ball";
    case "cylinder":
      return "cylinder";
    case "cone":
      return "cone";
    case "cube":
    default:
      return "cuboid";
  }
}
