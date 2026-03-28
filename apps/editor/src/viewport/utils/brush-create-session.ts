import { computePolygonNormal, createEditableMeshFromPolygons } from "@ggez/geometry-kernel";
import type { EditableMeshPolygon } from "@ggez/geometry-kernel";
import {
  addVec3,
  averageVec3,
  crossVec3,
  dotVec3,
  makeTransform,
  normalizeVec3,
  scaleVec3,
  snapValue,
  subVec3,
  vec3,
  type BrushShape,
  type Vec3
} from "@ggez/shared";
import { createPrimitiveNodeData, createPrimitiveNodeLabel } from "@/lib/authoring";
import { createEditableMeshFromPlane, createEditableMeshFromPrimitiveData } from "@/lib/primitive-to-mesh";
import type { BrushCreateBasis, BrushCreatePlacement, BrushCreateState } from "@/viewport/types";
import {
  computeBrushCreateCenter,
  createBrushCreateDragPlane,
  measureBrushCreateBase,
  projectPointerToPlane,
  projectPointerToThreePlane
} from "@/viewport/utils/brush-create";
import { Camera, Euler, Matrix4, Quaternion, Raycaster, Vector3 } from "three";

type BrushCreatePointerContext = {
  bounds: DOMRect;
  camera: Camera;
  clientX?: number;
  clientY?: number;
  raycaster: Raycaster;
  snapSize: number;
};

export function startBrushCreateState(shape: BrushShape, anchor: Vec3, basis: BrushCreateBasis): BrushCreateState {
  if (shape === "cube" || shape === "plane") {
    return {
      anchor,
      basis,
      currentPoint: anchor,
      shape,
      stage: "base"
    };
  }

  if (shape === "sphere") {
    return {
      anchor,
      basis,
      currentPoint: anchor,
      radius: 0,
      shape,
      stage: "radius"
    };
  }

  if (shape === "custom-polygon") {
    return {
      anchor,
      basis,
      currentPoint: anchor,
      points: [anchor],
      shape,
      stage: "outline"
    };
  }

  if (shape === "stairs") {
    return {
      anchor,
      basis,
      currentPoint: anchor,
      rotationSteps: 0,
      shape,
      stage: "base"
    };
  }

  if (shape === "ramp") {
    return {
      anchor,
      arcSegments: 0,
      basis,
      currentPoint: anchor,
      shape,
      stage: "base"
    };
  }

  return {
    anchor,
    basis,
    currentPoint: anchor,
    radius: 0,
    shape,
    stage: "base"
  };
}

export function updateBrushCreateState(
  state: BrushCreateState,
  { bounds, camera, clientX, clientY, raycaster, snapSize }: BrushCreatePointerContext
): BrushCreateState | undefined {
  if ((state.shape === "cube" || state.shape === "plane") && state.stage === "base") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point
    };
  }

  if (state.shape === "sphere") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point,
      radius: measureRadialRadius(state.anchor, state.basis, point, snapSize)
    };
  }

  if (state.shape === "custom-polygon" && state.stage === "outline") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: snapPointToBasisPlane(state.anchor, state.basis, point, snapSize)
    };
  }

  if (state.shape === "stairs" && state.stage === "base") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point
    };
  }

  if (state.shape === "ramp" && state.stage === "base") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      currentPoint: point
    };
  }

  if (state.shape === "cylinder" || state.shape === "cone") {
    if (state.stage === "base") {
      const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal);

      if (!point) {
        return undefined;
      }

      return {
        ...state,
        currentPoint: point,
        radius: measureRadialRadius(state.anchor, state.basis, point, snapSize)
      };
    }

    const point = projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, state.dragPlane);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
    };
  }

  if (state.stage === "height") {
    const point = projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, state.dragPlane);

    if (!point) {
      return undefined;
    }

    return {
      ...state,
      height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
    };
  }

  return undefined;
}

export function advanceBrushCreateState(
  state: BrushCreateState,
  { bounds, camera, clientX, clientY, raycaster, snapSize }: BrushCreatePointerContext
): { nextState?: BrushCreateState; placement?: BrushCreatePlacement } {
  if (state.shape === "plane" && state.stage === "base") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, point, snapSize);

    if (Math.abs(width) <= snapSize * 0.5 || Math.abs(depth) <= snapSize * 0.5) {
      return {};
    }

    const center = computeBrushCreateCenter(state.anchor, state.basis, width, depth, 0);

    return {
      placement: buildPlanePlacement(vec3(Math.abs(width), 0, Math.abs(depth)), center, basisToEuler(state.basis))
    };
  }

  if (state.shape === "cube" && state.stage === "base") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, point, snapSize);

    if (Math.abs(width) <= snapSize * 0.5 || Math.abs(depth) <= snapSize * 0.5) {
      return {};
    }

    const center = computeBrushCreateCenter(state.anchor, state.basis, width, depth, 0);
    const dragPlane = createBrushCreateDragPlane(camera, state.basis.normal, center);
    const startPoint =
      projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, dragPlane) ??
      new Vector3(center.x, center.y, center.z);

    return {
      nextState: {
        ...state,
        depth,
        dragPlane,
        height: 0,
        stage: "height",
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
        width
      }
    };
  }

  if (state.shape === "sphere") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const radius = measureRadialRadius(state.anchor, state.basis, point, snapSize);
    const placement = buildBrushCreatePlacement({
      ...state,
      currentPoint: point,
      radius
    });

    return placement ? { placement } : {};
  }

  if (state.shape === "custom-polygon") {
    if (state.stage === "outline") {
      const point =
        projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
      const snappedPoint = snapPointToBasisPlane(state.anchor, state.basis, point, snapSize);

      if (pointsAlmostEqual(snappedPoint, state.points[state.points.length - 1])) {
        return {};
      }

      return {
        nextState: {
          ...state,
          currentPoint: snappedPoint,
          points: [...state.points, snappedPoint]
        }
      };
    }

    const point =
      projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, state.dragPlane) ??
      new Vector3(state.startPoint.x, state.startPoint.y, state.startPoint.z);
    const placement = buildBrushCreatePlacement({
      ...state,
      height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
    });

    return placement ? { placement } : {};
  }

  if (state.shape === "stairs") {
    if (state.stage === "base") {
      const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
      const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, point, snapSize);

      if (Math.abs(width) <= snapSize * 0.5 || Math.abs(depth) <= snapSize * 0.5) {
        return {};
      }

      const center = computeBrushCreateCenter(state.anchor, state.basis, width, depth, 0);
      const dragPlane = createBrushCreateDragPlane(camera, state.basis.normal, center);
      const startPoint =
        projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, dragPlane) ??
        new Vector3(center.x, center.y, center.z);

      return {
        nextState: {
          anchor: state.anchor,
          basis: state.basis,
          depth,
          dragPlane,
          height: 0,
          rotationSteps: state.rotationSteps,
          shape: "stairs",
          stage: "height",
          startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
          stepCount: resolveDefaultStairStepCount(depth, snapSize),
          width
        }
      };
    }

    const point =
      projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, state.dragPlane) ??
      new Vector3(state.startPoint.x, state.startPoint.y, state.startPoint.z);
    const placement = buildBrushCreatePlacement({
      ...state,
      height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
    });

    return placement ? { placement } : {};
  }

  if (state.shape === "ramp") {
    if (state.stage === "base") {
      const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
      const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, point, snapSize);

      if (Math.abs(width) <= snapSize * 0.5 || Math.abs(depth) <= snapSize * 0.5) {
        return {};
      }

      const center = computeBrushCreateCenter(state.anchor, state.basis, width, depth, 0);
      const dragPlane = createBrushCreateDragPlane(camera, state.basis.normal, center);
      const startPoint =
        projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, dragPlane) ??
        new Vector3(center.x, center.y, center.z);

      return {
        nextState: {
          anchor: state.anchor,
          arcSegments: state.arcSegments,
          basis: state.basis,
          depth,
          dragPlane,
          height: 0,
          shape: "ramp",
          stage: "height",
          startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
          width
        }
      };
    }

    const point =
      projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, state.dragPlane) ??
      new Vector3(state.startPoint.x, state.startPoint.y, state.startPoint.z);
    const rampPlacement = buildBrushCreatePlacement({
      ...state,
      height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
    });

    return rampPlacement ? { placement: rampPlacement } : {};
  }

  if (state.stage === "base") {
    const point = projectPointerToPlane(clientX!, clientY!, bounds, camera, raycaster, state.anchor, state.basis.normal) ?? state.currentPoint;
    const radius = measureRadialRadius(state.anchor, state.basis, point, snapSize);

    if (radius <= snapSize * 0.5) {
      return {};
    }

    const dragPlane = createBrushCreateDragPlane(camera, state.basis.normal, state.anchor);
    const startPoint =
      projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, dragPlane) ??
      new Vector3(state.anchor.x, state.anchor.y, state.anchor.z);

    return {
      nextState: {
        anchor: state.anchor,
        basis: state.basis,
        dragPlane,
        height: 0,
        radius,
        shape: state.shape,
        stage: "height",
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      }
    };
  }

  const point =
    projectPointerToThreePlane(clientX!, clientY!, bounds, camera, raycaster, state.dragPlane) ??
    new Vector3(state.startPoint.x, state.startPoint.y, state.startPoint.z);
  const placement = buildBrushCreatePlacement({
    ...state,
    height: resolveExtrusionHeight(state.startPoint, state.basis.normal, point, snapSize)
  });

  return placement ? { placement } : {};
}

export function finalizeBrushCreateState(
  state: BrushCreateState,
  context?: BrushCreatePointerContext
): { nextState?: BrushCreateState; placement?: BrushCreatePlacement } {
  if (state.shape !== "custom-polygon" || state.stage !== "outline" || state.points.length < 3) {
    return {};
  }

  const centroid = averageVec3(state.points);
  const dragPlane = createBrushCreateDragPlane(context?.camera ?? new Camera(), state.basis.normal, centroid);
  const startPoint =
    context?.camera && context.clientX !== undefined && context.clientY !== undefined
      ? projectPointerToThreePlane(
          context.clientX,
          context.clientY,
          context.bounds,
          context.camera,
          context.raycaster,
          dragPlane
        ) ?? new Vector3(centroid.x, centroid.y, centroid.z)
      : new Vector3(centroid.x, centroid.y, centroid.z);

  return {
    nextState: {
      anchor: state.anchor,
      basis: state.basis,
      dragPlane,
      height: 0,
      points: compactPolygonPoints(state.points),
      shape: "custom-polygon",
      stage: "height",
      startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
    }
  };
}

export function adjustBrushCreateStateWithWheel(state: BrushCreateState, deltaY: number): BrushCreateState {
  const step = deltaY < 0 ? 1 : -1;

  if (state.shape === "stairs" && state.stage === "base") {
    return {
      ...state,
      basis: rotateBrushCreateBasis(state.basis, step * (Math.PI / 4)),
      rotationSteps: state.rotationSteps + step
    };
  }

  if (state.shape === "stairs" && state.stage === "height") {
    return {
      ...state,
      stepCount: Math.max(1, state.stepCount + step)
    };
  }

  if (state.shape === "ramp") {
    return {
      ...state,
      arcSegments: Math.max(0, state.arcSegments + step)
    };
  }

  return state;
}

export function buildBrushCreatePlacement(state: BrushCreateState): BrushCreatePlacement | undefined {
  if (state.shape === "cube") {
    if (state.stage !== "height" || Math.abs(state.width) <= 0.0001 || Math.abs(state.depth) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
      return undefined;
    }

    const center = computeBrushCreateCenter(state.anchor, state.basis, state.width, state.depth, state.height);
    return buildPrimitiveMeshPlacement(
      "cube",
      vec3(Math.abs(state.width), Math.abs(state.height), Math.abs(state.depth)),
      center,
      basisToEuler(state.basis)
    );
  }

  if (state.shape === "sphere") {
    if (Math.abs(state.radius) <= 0.0001) {
      return undefined;
    }

    const radius = Math.abs(state.radius);
    const center = vec3(
      state.anchor.x + state.basis.normal.x * radius,
      state.anchor.y + state.basis.normal.y * radius,
      state.anchor.z + state.basis.normal.z * radius
    );

    return buildPrimitiveMeshPlacement(
      "sphere",
      vec3(radius * 2, radius * 2, radius * 2),
      center,
      basisToEuler(state.basis)
    );
  }

  if (state.shape === "custom-polygon") {
    if (state.stage !== "height" || Math.abs(state.height) <= 0.0001 || state.points.length < 3) {
      return undefined;
    }

    return buildMeshPlacementFromPolygons(
      buildExtrudedPolygonPolygons(state.points, state.basis.normal, state.height, "material:blockout:orange"),
      "Custom Polygon"
    );
  }

  if (state.shape === "stairs") {
    if (state.stage !== "height" || Math.abs(state.width) <= 0.0001 || Math.abs(state.depth) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
      return undefined;
    }

    return buildMeshPlacementFromPolygons(
      buildStairPolygons(
        state.anchor,
        state.basis,
        state.width,
        state.depth,
        state.height,
        state.stepCount,
        "material:blockout:orange"
      ),
      "Blockout Stairs"
    );
  }

  if (state.shape === "ramp") {
    if (state.stage !== "height" || Math.abs(state.width) <= 0.0001 || Math.abs(state.depth) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
      return undefined;
    }

    return buildMeshPlacementFromPolygons(
      buildRampPolygons(
        state.anchor,
        state.basis,
        state.width,
        state.depth,
        state.height,
        state.arcSegments,
        "material:blockout:orange"
      ),
      "Blockout Ramp"
    );
  }

  if (state.stage !== "height" || Math.abs(state.radius) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
    return undefined;
  }

  const radius = Math.abs(state.radius);
  const center = vec3(
    state.anchor.x + state.basis.normal.x * (state.height * 0.5),
    state.anchor.y + state.basis.normal.y * (state.height * 0.5),
    state.anchor.z + state.basis.normal.z * (state.height * 0.5)
  );

  return buildPrimitiveMeshPlacement(
    state.shape,
    vec3(radius * 2, Math.abs(state.height), radius * 2),
    center,
    basisToEuler(state.basis)
  );
}

export function buildBrushCreatePreviewPositions(state: BrushCreateState, snapSize: number): number[] {
  const positions: number[] = [];

  if (state.shape === "plane") {
    const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, state.currentPoint, snapSize);
    pushLoopSegments(positions, buildBoxCorners(state.anchor, state.basis, width, depth, 0));
    return positions;
  }

  if (state.shape === "cube") {
    const base =
      state.stage === "base"
        ? measureBrushCreateBase(state.anchor, state.basis, state.currentPoint, snapSize)
        : { depth: state.depth, width: state.width };
    const baseCorners = buildBoxCorners(state.anchor, state.basis, base.width, base.depth, 0);

    pushLoopSegments(positions, baseCorners);

    if (state.stage === "height" && Math.abs(state.height) > 0.0001) {
      const topCorners = buildBoxCorners(state.anchor, state.basis, state.width, state.depth, state.height);
      pushLoopSegments(positions, topCorners);

      for (let index = 0; index < baseCorners.length; index += 1) {
        pushSegment(positions, baseCorners[index], topCorners[index]);
      }
    }

    return positions;
  }

  if (state.shape === "sphere") {
    if (state.radius <= 0.0001) {
      return positions;
    }

    const radius = Math.abs(state.radius);
    const center = vec3(
      state.anchor.x + state.basis.normal.x * radius,
      state.anchor.y + state.basis.normal.y * radius,
      state.anchor.z + state.basis.normal.z * radius
    );

    pushCircleSegments(positions, center, state.basis.u, state.basis.v, radius);
    pushCircleSegments(positions, center, state.basis.u, state.basis.normal, radius);
    pushCircleSegments(positions, center, state.basis.v, state.basis.normal, radius);
    pushSegment(positions, state.anchor, center);

    return positions;
  }

  if (state.shape === "custom-polygon") {
    if (state.stage === "outline") {
      const outlinePoints = [...state.points];

      if (!pointsAlmostEqual(state.currentPoint, outlinePoints[outlinePoints.length - 1])) {
        outlinePoints.push(state.currentPoint);
      }

      if (outlinePoints.length >= 2) {
        pushOpenSegments(positions, outlinePoints);
      }

      return positions;
    }

    return buildPreviewPositionsFromPolygons(
      buildExtrudedPolygonPolygons(state.points, state.basis.normal, state.height)
    );
  }

  if (state.shape === "stairs") {
    if (state.stage === "base") {
      const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, state.currentPoint, snapSize);
      pushLoopSegments(positions, buildBoxCorners(state.anchor, state.basis, width, depth, 0));
      return positions;
    }

    return buildPreviewPositionsFromPolygons(
      buildStairPolygons(state.anchor, state.basis, state.width, state.depth, state.height, state.stepCount)
    );
  }

  if (state.shape === "ramp") {
    if (state.stage === "base") {
      const { depth, width } = measureBrushCreateBase(state.anchor, state.basis, state.currentPoint, snapSize);
      pushLoopSegments(positions, buildBoxCorners(state.anchor, state.basis, width, depth, 0));
      return positions;
    }

    return buildPreviewPositionsFromPolygons(
      buildRampPolygons(state.anchor, state.basis, state.width, state.depth, state.height, state.arcSegments)
    );
  }

  if (state.stage === "base") {
    if (state.radius <= 0.0001) {
      return positions;
    }

    pushCircleSegments(positions, state.anchor, state.basis.u, state.basis.v, state.radius);
    return positions;
  }

  const topCenter = vec3(
    state.anchor.x + state.basis.normal.x * state.height,
    state.anchor.y + state.basis.normal.y * state.height,
    state.anchor.z + state.basis.normal.z * state.height
  );

  pushCircleSegments(positions, state.anchor, state.basis.u, state.basis.v, state.radius);

  if (state.shape === "cylinder") {
    pushCircleSegments(positions, topCenter, state.basis.u, state.basis.v, state.radius);

    const sideAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

    sideAngles.forEach((angle) => {
      const bottom = resolveCirclePoint(state.anchor, state.basis.u, state.basis.v, state.radius, angle);
      const top = resolveCirclePoint(topCenter, state.basis.u, state.basis.v, state.radius, angle);
      pushSegment(positions, bottom, top);
    });

    return positions;
  }

  pushSegment(positions, state.anchor, topCenter);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const basePoint = resolveCirclePoint(state.anchor, state.basis.u, state.basis.v, state.radius, angle);
    pushSegment(positions, basePoint, topCenter);
  }

  return positions;
}

function measureRadialRadius(anchor: Vec3, basis: BrushCreateBasis, point: Vec3, snapSize: number) {
  const { depth, width } = measureBrushCreateBase(anchor, basis, point, snapSize);
  return snapValue(Math.hypot(width, depth), snapSize);
}

function resolveExtrusionHeight(startPoint: Vec3, normal: Vec3, point: Vector3, snapSize: number) {
  return snapValue(
    point
      .clone()
      .sub(new Vector3(startPoint.x, startPoint.y, startPoint.z))
      .dot(new Vector3(normal.x, normal.y, normal.z)),
    snapSize
  );
}

function basisToEuler(basis: BrushCreateBasis): Vec3 {
  const matrix = new Matrix4().makeBasis(
    new Vector3(basis.u.x, basis.u.y, basis.u.z),
    new Vector3(basis.normal.x, basis.normal.y, basis.normal.z),
    new Vector3(basis.v.x, basis.v.y, basis.v.z)
  );
  const quaternion = new Quaternion().setFromRotationMatrix(matrix);
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");

  return vec3(euler.x, euler.y, euler.z);
}

function buildBoxCorners(anchor: Vec3, basis: BrushCreateBasis, width: number, depth: number, height: number): Vec3[] {
  const widthOffset = vec3(basis.u.x * width, basis.u.y * width, basis.u.z * width);
  const depthOffset = vec3(basis.v.x * depth, basis.v.y * depth, basis.v.z * depth);
  const heightOffset = vec3(basis.normal.x * height, basis.normal.y * height, basis.normal.z * height);

  return [
    vec3(anchor.x + heightOffset.x, anchor.y + heightOffset.y, anchor.z + heightOffset.z),
    vec3(
      anchor.x + widthOffset.x + heightOffset.x,
      anchor.y + widthOffset.y + heightOffset.y,
      anchor.z + widthOffset.z + heightOffset.z
    ),
    vec3(
      anchor.x + widthOffset.x + depthOffset.x + heightOffset.x,
      anchor.y + widthOffset.y + depthOffset.y + heightOffset.y,
      anchor.z + widthOffset.z + depthOffset.z + heightOffset.z
    ),
    vec3(
      anchor.x + depthOffset.x + heightOffset.x,
      anchor.y + depthOffset.y + heightOffset.y,
      anchor.z + depthOffset.z + heightOffset.z
    )
  ];
}

function pushLoopSegments(positions: number[], points: Vec3[]) {
  for (let index = 0; index < points.length; index += 1) {
    pushSegment(positions, points[index], points[(index + 1) % points.length]);
  }
}

function pushOpenSegments(positions: number[], points: Vec3[]) {
  for (let index = 0; index < points.length - 1; index += 1) {
    pushSegment(positions, points[index], points[index + 1]);
  }
}

function pushCircleSegments(
  positions: number[],
  center: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  radius: number,
  segments = 24
) {
  for (let index = 0; index < segments; index += 1) {
    const currentAngle = (index / segments) * Math.PI * 2;
    const nextAngle = ((index + 1) / segments) * Math.PI * 2;
    pushSegment(
      positions,
      resolveCirclePoint(center, axisA, axisB, radius, currentAngle),
      resolveCirclePoint(center, axisA, axisB, radius, nextAngle)
    );
  }
}

function resolveCirclePoint(center: Vec3, axisA: Vec3, axisB: Vec3, radius: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return vec3(
    center.x + axisA.x * cos * radius + axisB.x * sin * radius,
    center.y + axisA.y * cos * radius + axisB.y * sin * radius,
    center.z + axisA.z * cos * radius + axisB.z * sin * radius
  );
}

function pushSegment(positions: number[], start: Vec3, end: Vec3) {
  positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
}

function snapPointToBasisPlane(anchor: Vec3, basis: BrushCreateBasis, point: Vec3, snapSize: number) {
  const delta = subVec3(point, anchor);
  const width = snapValue(dotVec3(delta, basis.u), snapSize);
  const depth = snapValue(dotVec3(delta, basis.v), snapSize);

  return vec3(
    anchor.x + basis.u.x * width + basis.v.x * depth,
    anchor.y + basis.u.y * width + basis.v.y * depth,
    anchor.z + basis.u.z * width + basis.v.z * depth
  );
}

function pointsAlmostEqual(left: Vec3, right: Vec3, epsilon = 0.0001) {
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.z - right.z) <= epsilon
  );
}

function compactPolygonPoints(points: Vec3[]) {
  return points.reduce<Vec3[]>((collection, point) => {
    if (collection.length === 0 || !pointsAlmostEqual(collection[collection.length - 1], point)) {
      collection.push(point);
    }
    return collection;
  }, []);
}

function rotateBrushCreateBasis(basis: BrushCreateBasis, angle: number): BrushCreateBasis {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    normal: basis.normal,
    u: normalizeVec3(
      addVec3(scaleVec3(basis.u, cos), scaleVec3(basis.v, sin))
    ),
    v: normalizeVec3(
      addVec3(scaleVec3(basis.v, cos), scaleVec3(basis.u, -sin))
    )
  };
}

function resolveDefaultStairStepCount(depth: number, snapSize: number) {
  return Math.max(1, Math.round(Math.abs(depth) / Math.max(snapSize, 0.5)));
}

function createOrientedPolygon(id: string, positions: Vec3[], desiredNormal: Vec3, materialId?: string): EditableMeshPolygon {
  const normal = computePolygonNormal(positions);

  return {
    id,
    materialId,
    positions: dotVec3(normal, desiredNormal) >= 0 ? positions : positions.slice().reverse()
  };
}

function buildExtrudedPolygonPolygons(points: Vec3[], normal: Vec3, height: number, materialId?: string) {
  const compactedPoints = compactPolygonPoints(points);
  const extrusionVector = scaleVec3(normal, height);
  const extrusionDirection = normalizeVec3(height >= 0 ? normal : scaleVec3(normal, -1));
  const topPoints = compactedPoints.map((point) => addVec3(point, extrusionVector));
  const polygons: EditableMeshPolygon[] = [
    createOrientedPolygon("face:polygon:bottom", compactedPoints, scaleVec3(extrusionDirection, -1), materialId),
    createOrientedPolygon("face:polygon:top", topPoints, extrusionDirection, materialId)
  ];

  for (let index = 0; index < compactedPoints.length; index += 1) {
    const current = compactedPoints[index];
    const next = compactedPoints[(index + 1) % compactedPoints.length];
    const edge = subVec3(next, current);

    polygons.push(
      createOrientedPolygon(
        `face:polygon:side:${index}`,
        [current, next, topPoints[(index + 1) % compactedPoints.length], topPoints[index]],
        normalizeVec3(crossVec3(extrusionDirection, edge)),
        materialId
      )
    );
  }

  return polygons;
}

function buildRampPolygons(
  anchor: Vec3,
  basis: BrushCreateBasis,
  width: number,
  depth: number,
  height: number,
  arcSegments: number,
  materialId?: string
) {
  const clampedSegs = Math.max(0, arcSegments);
  const baseThickness = Math.max(0.2, Math.abs(height) * 0.15);
  const totalPoints = clampedSegs + 2;
  const topProfile: Array<{ run: number; rise: number }> =
    clampedSegs === 0 || Math.abs(depth) < 0.0001 || Math.abs(height) < 0.0001
      ? [{ run: 0, rise: 0 }, { run: depth, rise: height }]
      : Array.from({ length: totalPoints }, (_, index) => {
          const t = index / (totalPoints - 1);
          const angle = t * (Math.PI * 0.5);

          return {
            // Keep the bottom and top edges fixed and bend only the in-between samples.
            run: depth * Math.sin(angle),
            rise: height * (1 - Math.cos(angle))
          };
        });

  const profile: Array<{ run: number; rise: number }> = [
    { run: 0, rise: -baseThickness },
    ...topProfile,
    { run: depth, rise: -baseThickness }
  ];
  const acrossDirection = normalizeVec3(width >= 0 ? basis.u : scaleVec3(basis.u, -1));
  const front = profile.map((p) => projectStairPoint(anchor, basis, p.run, p.rise, 0));
  const back = profile.map((p) => projectStairPoint(anchor, basis, p.run, p.rise, width));
  const polygons: EditableMeshPolygon[] = [
    createOrientedPolygon("face:ramp:front", front, scaleVec3(acrossDirection, -1), materialId),
    createOrientedPolygon("face:ramp:back", back, acrossDirection, materialId)
  ];
  for (let index = 0; index < profile.length - 1; index++) {
    const currentFront = front[index];
    const nextFront = front[index + 1];
    const currentBack = back[index];
    const nextBack = back[index + 1];
    const edgeWorld = subVec3(nextFront, currentFront);
    polygons.push(
      createOrientedPolygon(
        `face:ramp:side:${index}`,
        [currentFront, nextFront, nextBack, currentBack],
        normalizeVec3(crossVec3(acrossDirection, edgeWorld)),
        materialId
      )
    );
  }
  return polygons;
}

function buildStairPolygons(
  anchor: Vec3,
  basis: BrushCreateBasis,
  width: number,
  depth: number,
  height: number,
  stepCount: number,
  materialId?: string
) {
  const clampedSteps = Math.max(1, stepCount);
  const stepHeight = height / clampedSteps;
  const treadDepth = depth / clampedSteps;
  const baseThickness = Math.max(0.2, Math.abs(stepHeight));
  const profile: Array<{ run: number; rise: number }> = compactProfile([
    { run: 0, rise: -baseThickness },
    { run: 0, rise: 0 },
    ...Array.from({ length: clampedSteps * 2 }, (_, index) => {
      const stepIndex = Math.floor(index / 2) + 1;
      return index % 2 === 0
        ? { run: (stepIndex - 1) * treadDepth, rise: stepIndex * stepHeight }
        : { run: stepIndex * treadDepth, rise: stepIndex * stepHeight };
    }),
    { run: depth, rise: -baseThickness }
  ]);
  const acrossDirection = normalizeVec3(width >= 0 ? basis.u : scaleVec3(basis.u, -1));
  const front = profile.map((point) => projectStairPoint(anchor, basis, point.run, point.rise, 0));
  const back = profile.map((point) => projectStairPoint(anchor, basis, point.run, point.rise, width));
  const polygons: EditableMeshPolygon[] = [
    createOrientedPolygon("face:stairs:front", front, scaleVec3(acrossDirection, -1), materialId),
    createOrientedPolygon("face:stairs:back", back, acrossDirection, materialId)
  ];

  for (let index = 0; index < profile.length; index += 1) {
    const current = profile[index];
    const next = profile[(index + 1) % profile.length];
    const currentFront = front[index];
    const nextFront = front[(index + 1) % profile.length];
    const currentBack = back[index];
    const nextBack = back[(index + 1) % profile.length];
    const edgeWorld = subVec3(nextFront, currentFront);

    polygons.push(
      createOrientedPolygon(
        `face:stairs:side:${index}`,
        [currentFront, nextFront, nextBack, currentBack],
        normalizeVec3(crossVec3(acrossDirection, edgeWorld)),
        materialId
      )
    );
  }

  return polygons;
}

function compactProfile(points: Array<{ run: number; rise: number }>, epsilon = 0.0001) {
  return points.reduce<Array<{ run: number; rise: number }>>((collection, point) => {
    const previous = collection[collection.length - 1];

    if (previous && Math.abs(previous.run - point.run) <= epsilon && Math.abs(previous.rise - point.rise) <= epsilon) {
      return collection;
    }

    collection.push(point);
    return collection;
  }, []);
}

function projectStairPoint(anchor: Vec3, basis: BrushCreateBasis, run: number, rise: number, across: number) {
  return addVec3(
    anchor,
    addVec3(
      scaleVec3(basis.v, run),
      addVec3(scaleVec3(basis.normal, rise), scaleVec3(basis.u, across))
    )
  );
}

function buildMeshPlacementFromPolygons(polygons: EditableMeshPolygon[], name: string): BrushCreatePlacement {
  const center = averageVec3(polygons.flatMap((polygon) => polygon.positions));
  const rebasedPolygons = polygons.map((polygon) => ({
    ...polygon,
    positions: polygon.positions.map((position) => subVec3(position, center))
  }));

  return {
    kind: "mesh",
    mesh: createEditableMeshFromPolygons(rebasedPolygons),
    name,
    transform: makeTransform(center)
  };
}

function buildPrimitiveMeshPlacement(shape: "cone" | "cube" | "cylinder" | "sphere", size: Vec3, center: Vec3, rotation: Vec3): BrushCreatePlacement {
  const data = createPrimitiveNodeData("brush", shape, size);

  return {
    kind: "mesh",
    mesh: createEditableMeshFromPrimitiveData(data, `brush:${shape}`),
    name: createPrimitiveNodeLabel("brush", shape),
    transform: {
      ...makeTransform(center),
      rotation
    }
  };
}

function buildPlanePlacement(size: Vec3, center: Vec3, rotation: Vec3): BrushCreatePlacement {
  return {
    kind: "mesh",
    mesh: createEditableMeshFromPlane(size, "brush:plane"),
    name: "Blockout Plane",
    transform: {
      ...makeTransform(center),
      rotation
    }
  };
}

function buildPreviewPositionsFromPolygons(polygons: EditableMeshPolygon[]) {
  const positions: number[] = [];
  const edgeKeys = new Set<string>();

  polygons.forEach((polygon) => {
    for (let index = 0; index < polygon.positions.length; index += 1) {
      const current = polygon.positions[index];
      const next = polygon.positions[(index + 1) % polygon.positions.length];
      const key = makeEdgeKey(current, next);

      if (edgeKeys.has(key)) {
        continue;
      }

      edgeKeys.add(key);
      pushSegment(positions, current, next);
    }
  });

  return positions;
}

function makeEdgeKey(start: Vec3, end: Vec3, epsilon = 0.0001) {
  const startKey = makePointKey(start, epsilon);
  const endKey = makePointKey(end, epsilon);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function makePointKey(point: Vec3, epsilon = 0.0001) {
  return [
    Math.round(point.x / epsilon),
    Math.round(point.y / epsilon),
    Math.round(point.z / epsilon)
  ].join(":");
}
