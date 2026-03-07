import type { Brush } from "@web-hammer/shared";
import { vec3 } from "@web-hammer/shared";

export type BrushAxis = "x" | "y" | "z";

type AxisBounds = {
  x: { min: number; max: number };
  y: { min: number; max: number };
  z: { min: number; max: number };
};

export function splitAxisAlignedBrush(brush: Brush, axis: BrushAxis): [Brush, Brush] | undefined {
  const bounds = getAxisAlignedBrushBounds(brush);

  if (!bounds) {
    return undefined;
  }

  const midpoint = (bounds[axis].min + bounds[axis].max) * 0.5;

  if (Math.abs(bounds[axis].max - bounds[axis].min) <= 0.0001) {
    return undefined;
  }

  const first = cloneBounds(bounds);
  first[axis].max = midpoint;

  const second = cloneBounds(bounds);
  second[axis].min = midpoint;

  return [
    preserveAxisAlignedBrushFaceMetadata(brush, createAxisAlignedBrushFromBounds(first)),
    preserveAxisAlignedBrushFaceMetadata(brush, createAxisAlignedBrushFromBounds(second))
  ];
}

export function splitAxisAlignedBrushAtCoordinate(
  brush: Brush,
  axis: BrushAxis,
  coordinate: number,
  epsilon = 0.0001
): [Brush, Brush] | undefined {
  const bounds = getAxisAlignedBrushBounds(brush);

  if (!bounds) {
    return undefined;
  }

  const min = bounds[axis].min;
  const max = bounds[axis].max;
  const clamped = Math.min(Math.max(coordinate, min), max);

  if (clamped - min <= epsilon || max - clamped <= epsilon) {
    return undefined;
  }

  const first = cloneBounds(bounds);
  first[axis].max = clamped;

  const second = cloneBounds(bounds);
  second[axis].min = clamped;

  return [
    preserveAxisAlignedBrushFaceMetadata(brush, createAxisAlignedBrushFromBounds(first)),
    preserveAxisAlignedBrushFaceMetadata(brush, createAxisAlignedBrushFromBounds(second))
  ];
}

export function extrudeAxisAlignedBrush(
  brush: Brush,
  axis: BrushAxis,
  amount: number,
  direction: -1 | 1
): Brush | undefined {
  const bounds = getAxisAlignedBrushBounds(brush);

  if (!bounds) {
    return undefined;
  }

  const next = cloneBounds(bounds);

  if (direction > 0) {
    next[axis].max += amount;
  } else {
    next[axis].min -= amount;
  }

  return preserveAxisAlignedBrushFaceMetadata(brush, createAxisAlignedBrushFromBounds(next));
}

export function offsetAxisAlignedBrushFace(
  brush: Brush,
  axis: BrushAxis,
  side: "max" | "min",
  amount: number,
  epsilon = 0.0001
): Brush | undefined {
  const bounds = getAxisAlignedBrushBounds(brush);

  if (!bounds) {
    return undefined;
  }

  const next = cloneBounds(bounds);

  if (side === "max") {
    next[axis].max += amount;
  } else {
    next[axis].min -= amount;
  }

  if (next[axis].max - next[axis].min <= epsilon) {
    return undefined;
  }

  return preserveAxisAlignedBrushFaceMetadata(brush, createAxisAlignedBrushFromBounds(next));
}

export function getAxisAlignedBrushBounds(brush: Brush): AxisBounds | undefined {
  const bounds: AxisBounds = {
    x: { min: 0, max: 0 },
    y: { min: 0, max: 0 },
    z: { min: 0, max: 0 }
  };

  let hasX = false;
  let hasY = false;
  let hasZ = false;

  for (const plane of brush.planes) {
    if (plane.normal.x === 1 && plane.normal.y === 0 && plane.normal.z === 0) {
      bounds.x.max = plane.distance;
      hasX = true;
    } else if (plane.normal.x === -1 && plane.normal.y === 0 && plane.normal.z === 0) {
      bounds.x.min = -plane.distance;
      hasX = true;
    } else if (plane.normal.x === 0 && plane.normal.y === 1 && plane.normal.z === 0) {
      bounds.y.max = plane.distance;
      hasY = true;
    } else if (plane.normal.x === 0 && plane.normal.y === -1 && plane.normal.z === 0) {
      bounds.y.min = -plane.distance;
      hasY = true;
    } else if (plane.normal.x === 0 && plane.normal.y === 0 && plane.normal.z === 1) {
      bounds.z.max = plane.distance;
      hasZ = true;
    } else if (plane.normal.x === 0 && plane.normal.y === 0 && plane.normal.z === -1) {
      bounds.z.min = -plane.distance;
      hasZ = true;
    } else {
      return undefined;
    }
  }

  if (!hasX || !hasY || !hasZ) {
    return undefined;
  }

  return bounds;
}

export function createAxisAlignedBrushFromBounds(bounds: AxisBounds): Brush {
  return {
    planes: [
      { normal: vec3(1, 0, 0), distance: bounds.x.max },
      { normal: vec3(-1, 0, 0), distance: -bounds.x.min },
      { normal: vec3(0, 1, 0), distance: bounds.y.max },
      { normal: vec3(0, -1, 0), distance: -bounds.y.min },
      { normal: vec3(0, 0, 1), distance: bounds.z.max },
      { normal: vec3(0, 0, -1), distance: -bounds.z.min }
    ],
    faces: [],
    previewSize: vec3(
      bounds.x.max - bounds.x.min,
      bounds.y.max - bounds.y.min,
      bounds.z.max - bounds.z.min
    )
  };
}

function cloneBounds(bounds: AxisBounds): AxisBounds {
  return {
    x: { ...bounds.x },
    y: { ...bounds.y },
    z: { ...bounds.z }
  };
}

function preserveAxisAlignedBrushFaceMetadata(source: Brush, next: Brush): Brush {
  const metadataByPlane = new Map(
    source.planes.map((plane, index) => [
      makeAxisPlaneKey(plane.normal.x, plane.normal.y, plane.normal.z),
      source.faces[index]
    ])
  );

  return {
    ...next,
    faces: next.planes.map((plane, index) => {
      const preserved = metadataByPlane.get(makeAxisPlaneKey(plane.normal.x, plane.normal.y, plane.normal.z));

      return {
        id: preserved?.id ?? `face:brush:${index}`,
        materialId: preserved?.materialId,
        plane,
        uvScale: preserved?.uvScale,
        vertexIds: preserved?.vertexIds ?? []
      };
    })
  };
}

function makeAxisPlaneKey(x: number, y: number, z: number) {
  return `${x}:${y}:${z}`;
}
