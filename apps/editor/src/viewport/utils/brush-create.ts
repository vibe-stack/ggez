import {
  dotVec3,
  resolveTransformPivot,
  snapValue,
  subVec3,
  vec3,
  type GeometryNode,
  type Vec3
} from "@web-hammer/shared";
import type { BrushCreateBasis } from "@/viewport/types";
import {
  Camera,
  Euler,
  Object3D,
  Plane,
  Raycaster,
  Vector2,
  Vector3
} from "three";

export function resolveBrushCreateSurfaceHit(
  clientX: number,
  clientY: number,
  viewportBounds: DOMRect,
  camera: Camera,
  raycaster: Raycaster,
  meshObjects: Map<string, Object3D>,
  fallbackPlanePoint: Vec3,
  fallbackPlaneNormal: Vec3
): { kind: "plane" | "surface"; normal: Vec3; point: Vec3 } | undefined {
  const ndc = new Vector2(
    ((clientX - viewportBounds.left) / viewportBounds.width) * 2 - 1,
    -(((clientY - viewportBounds.top) / viewportBounds.height) * 2 - 1)
  );
  raycaster.setFromCamera(ndc, camera);

  const hit = raycaster.intersectObjects(Array.from(meshObjects.values()), true)[0];

  if (hit) {
    const worldNormal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new Vector3(0, 1, 0);

    return {
      kind: "surface",
      normal: vec3(worldNormal.x, worldNormal.y, worldNormal.z),
      point: vec3(hit.point.x, hit.point.y, hit.point.z)
    };
  }

  const point = raycaster.ray.intersectPlane(
    new Plane().setFromNormalAndCoplanarPoint(
      new Vector3(fallbackPlaneNormal.x, fallbackPlaneNormal.y, fallbackPlaneNormal.z),
      new Vector3(fallbackPlanePoint.x, fallbackPlanePoint.y, fallbackPlanePoint.z)
    ),
    new Vector3()
  );

  if (!point) {
    return undefined;
  }

  return {
    kind: "plane",
    normal: vec3(fallbackPlaneNormal.x, fallbackPlaneNormal.y, fallbackPlaneNormal.z),
    point: vec3(point.x, point.y, point.z)
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
  camera: Camera,
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
  camera: Camera,
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

export function createBrushCreateDragPlane(camera: Camera, normal: Vec3, coplanarPoint: Vec3) {
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

export function projectLocalPointToScreen(
  point: Vec3,
  node: GeometryNode,
  camera: Camera,
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
