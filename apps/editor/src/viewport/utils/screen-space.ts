import { resolveTransformPivot, type GeometryNode, type Vec3 } from "@web-hammer/shared";
import { Box3, Camera, Euler, Object3D, Vector2, Vector3 } from "three";

export type ScreenRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const tempBox = new Box3();
const projectedPoint = new Vector3();

export function createScreenRect(origin: Vector2, current: Vector2): ScreenRect {
  return {
    height: Math.abs(current.y - origin.y),
    left: Math.min(origin.x, current.x),
    top: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x)
  };
}

export function intersectsSelectionRect(
  object: Object3D,
  camera: Camera,
  viewportBounds: DOMRect,
  selectionRect: ScreenRect
): boolean {
  tempBox.setFromObject(object);

  if (tempBox.isEmpty()) {
    return false;
  }

  const screenRect = projectBoxToScreenRect(tempBox, camera, viewportBounds);
  return rectsIntersect(screenRect, selectionRect);
}

export function rectContainsPoint(rect: ScreenRect, point: { x: number; y: number }) {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
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

function projectBoxToScreenRect(box: Box3, camera: Camera, viewportBounds: DOMRect): ScreenRect {
  const min = box.min;
  const max = box.max;
  const corners = [
    [min.x, min.y, min.z],
    [min.x, min.y, max.z],
    [min.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, min.y, min.z],
    [max.x, min.y, max.z],
    [max.x, max.y, min.z],
    [max.x, max.y, max.z]
  ];

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  corners.forEach(([x, y, z]) => {
    projectedPoint.set(x, y, z).project(camera);
    const screenX = ((projectedPoint.x + 1) * 0.5) * viewportBounds.width;
    const screenY = ((1 - projectedPoint.y) * 0.5) * viewportBounds.height;

    left = Math.min(left, screenX);
    right = Math.max(right, screenX);
    top = Math.min(top, screenY);
    bottom = Math.max(bottom, screenY);
  });

  return {
    height: Math.max(0, bottom - top),
    left,
    top,
    width: Math.max(0, right - left)
  };
}

function rectsIntersect(left: ScreenRect, right: ScreenRect) {
  return !(
    left.left + left.width < right.left ||
    right.left + right.width < left.left ||
    left.top + left.height < right.top ||
    right.top + right.height < left.top
  );
}
