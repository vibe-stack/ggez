import { createAxisAlignedBrushFromBounds } from "@web-hammer/geometry-kernel";
import {
  dotVec3,
  makeTransform,
  resolveTransformPivot,
  snapValue,
  subVec3,
  vec3,
  type Brush,
  type GeometryNode,
  type Transform,
  type Vec3
} from "@web-hammer/shared";
import type { BrushCreateBasis, BrushCreateState } from "@/viewport/types";
import {
  Euler,
  Matrix4,
  Mesh,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type PerspectiveCamera
} from "three";

export function resolveBrushCreateSurfaceHit(
  clientX: number,
  clientY: number,
  viewportBounds: DOMRect,
  camera: PerspectiveCamera,
  raycaster: Raycaster,
  meshObjects: Map<string, Mesh>,
  gridElevation: number,
  snapToGrid: boolean,
  snapSize: number
): { normal: Vec3; point: Vec3 } | undefined {
  const ndc = new Vector2(
    ((clientX - viewportBounds.left) / viewportBounds.width) * 2 - 1,
    -(((clientY - viewportBounds.top) / viewportBounds.height) * 2 - 1)
  );
  raycaster.setFromCamera(ndc, camera);

  const hit = raycaster.intersectObjects(Array.from(meshObjects.values()), false)[0];

  if (hit) {
    const worldNormal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new Vector3(0, 1, 0);

    return {
      normal: vec3(worldNormal.x, worldNormal.y, worldNormal.z),
      point: vec3(hit.point.x, hit.point.y, hit.point.z)
    };
  }

  const point = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -gridElevation), new Vector3());

  if (!point) {
    return undefined;
  }

  const anchorPoint = snapToGrid
    ? vec3(snapValue(point.x, snapSize), point.y, snapValue(point.z, snapSize))
    : vec3(point.x, point.y, point.z);

  return {
    normal: vec3(0, 1, 0),
    point: anchorPoint
  };
}

export function createBrushCreateBasis(normal: Vec3): BrushCreateBasis {
  const normalVector = new Vector3(normal.x, normal.y, normal.z).normalize();
  const reference = Math.abs(normalVector.y) < 0.99 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const u = new Vector3().crossVectors(reference, normalVector).normalize();
  const v = new Vector3().crossVectors(u, normalVector).normalize();

  return {
    normal: vec3(normalVector.x, normalVector.y, normalVector.z),
    u: vec3(u.x, u.y, u.z),
    v: vec3(v.x, v.y, v.z)
  };
}

export function projectPointerToPlane(
  clientX: number,
  clientY: number,
  viewportBounds: DOMRect,
  camera: PerspectiveCamera,
  raycaster: Raycaster,
  anchor: Vec3,
  normal: Vec3
): Vec3 | undefined {
  const plane = new Plane().setFromNormalAndCoplanarPoint(
    new Vector3(normal.x, normal.y, normal.z),
    new Vector3(anchor.x, anchor.y, anchor.z)
  );
  const point = projectPointerToThreePlane(clientX, clientY, viewportBounds, camera, raycaster, plane);

  return point ? vec3(point.x, point.y, point.z) : undefined;
}

export function projectPointerToThreePlane(
  clientX: number,
  clientY: number,
  viewportBounds: DOMRect,
  camera: PerspectiveCamera,
  raycaster: Raycaster,
  plane: Plane
) {
  const ndc = new Vector2(
    ((clientX - viewportBounds.left) / viewportBounds.width) * 2 - 1,
    -(((clientY - viewportBounds.top) / viewportBounds.height) * 2 - 1)
  );
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(plane, new Vector3()) ?? undefined;
}

export function measureBrushCreateBase(anchor: Vec3, basis: BrushCreateBasis, point: Vec3, snapSize: number) {
  const delta = subVec3(point, anchor);

  return {
    depth: snapValue(dotVec3(delta, basis.v), snapSize),
    width: snapValue(dotVec3(delta, basis.u), snapSize)
  };
}

export function computeBrushCreateCenter(anchor: Vec3, basis: BrushCreateBasis, width: number, depth: number, height: number): Vec3 {
  return vec3(
    anchor.x + basis.u.x * (width * 0.5) + basis.v.x * (depth * 0.5) + basis.normal.x * (height * 0.5),
    anchor.y + basis.u.y * (width * 0.5) + basis.v.y * (depth * 0.5) + basis.normal.y * (height * 0.5),
    anchor.z + basis.u.z * (width * 0.5) + basis.v.z * (depth * 0.5) + basis.normal.z * (height * 0.5)
  );
}

export function createBrushCreateDragPlane(camera: PerspectiveCamera, normal: Vec3, coplanarPoint: Vec3) {
  const axis = new Vector3(normal.x, normal.y, normal.z).normalize();
  const cameraDirection = camera.getWorldDirection(new Vector3());
  let tangent = new Vector3().crossVectors(cameraDirection, axis);

  if (tangent.lengthSq() <= 0.0001) {
    tangent = new Vector3().crossVectors(new Vector3(0, 1, 0), axis);
  }

  if (tangent.lengthSq() <= 0.0001) {
    tangent = new Vector3().crossVectors(new Vector3(1, 0, 0), axis);
  }

  const planeNormal = new Vector3().crossVectors(axis, tangent).normalize();

  return new Plane().setFromNormalAndCoplanarPoint(
    planeNormal,
    new Vector3(coplanarPoint.x, coplanarPoint.y, coplanarPoint.z)
  );
}

export function buildBrushCreatePlacement(
  state: Extract<BrushCreateState, { stage: "height" }>
): { brush: Brush; transform: Transform } | undefined {
  if (Math.abs(state.width) <= 0.0001 || Math.abs(state.depth) <= 0.0001 || Math.abs(state.height) <= 0.0001) {
    return undefined;
  }

  const center = computeBrushCreateCenter(state.anchor, state.basis, state.width, state.depth, state.height);
  const rotation = basisToEuler(state.basis);

  return {
    brush: createAxisAlignedBrushFromBounds({
      x: { min: -Math.abs(state.width) * 0.5, max: Math.abs(state.width) * 0.5 },
      y: { min: -Math.abs(state.height) * 0.5, max: Math.abs(state.height) * 0.5 },
      z: { min: -Math.abs(state.depth) * 0.5, max: Math.abs(state.depth) * 0.5 }
    }),
    transform: {
      ...makeTransform(center),
      rotation
    }
  };
}

export function buildBrushCreatePreviewPositions(state: BrushCreateState, snapSize: number): number[] {
  const positions: number[] = [];
  const base =
    state.stage === "base"
      ? measureBrushCreateBase(state.anchor, state.basis, state.currentPoint, snapSize)
      : { depth: state.depth, width: state.width };
  const baseCorners = buildBrushCreateCorners(state.anchor, state.basis, base.width, base.depth, 0);

  pushLoopSegments(positions, baseCorners);

  if (state.stage === "height" && Math.abs(state.height) > 0.0001) {
    const topCorners = buildBrushCreateCorners(state.anchor, state.basis, state.width, state.depth, state.height);
    pushLoopSegments(positions, topCorners);

    for (let index = 0; index < baseCorners.length; index += 1) {
      const bottom = baseCorners[index];
      const top = topCorners[index];
      positions.push(bottom.x, bottom.y, bottom.z, top.x, top.y, top.z);
    }
  }

  return positions;
}

export function projectLocalPointToScreen(
  point: Vec3,
  node: GeometryNode,
  camera: PerspectiveCamera,
  viewportBounds: DOMRect
) {
  const pivot = resolveTransformPivot(node.transform);
  const worldPoint = new Vector3(point.x, point.y, point.z)
    .sub(new Vector3(pivot.x, pivot.y, pivot.z))
    .multiply(new Vector3(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z))
    .applyEuler(new Euler(node.transform.rotation.x, node.transform.rotation.y, node.transform.rotation.z, "XYZ"))
    .add(new Vector3(node.transform.position.x, node.transform.position.y, node.transform.position.z))
    .project(camera);

  return {
    x: ((worldPoint.x + 1) * 0.5) * viewportBounds.width,
    y: ((1 - worldPoint.y) * 0.5) * viewportBounds.height
  };
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

function buildBrushCreateCorners(anchor: Vec3, basis: BrushCreateBasis, width: number, depth: number, height: number): Vec3[] {
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
    const current = points[index];
    const next = points[(index + 1) % points.length];
    positions.push(current.x, current.y, current.z, next.x, next.y, next.z);
  }
}
