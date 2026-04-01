import { Box3, PerspectiveCamera, Sphere, Vector3, type Object3D } from "three";

const VIEW_DIRECTION = new Vector3(1, 0.55, 1).normalize();

/**
 * Positions the camera to frame the given object in view.
 * Used as a fallback when the scene has no player-spawn entity.
 */
export function frameCameraOnObject(camera: PerspectiveCamera, object: Object3D): void {
  const bounds = new Box3().setFromObject(object);

  if (bounds.isEmpty()) {
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return;
  }

  const sphere = bounds.getBoundingSphere(new Sphere());
  const fov = Math.max(camera.fov, 1) * (Math.PI / 180);
  const fitDistance = sphere.radius / Math.tan(fov * 0.5);
  const distance = Math.max(fitDistance * 1.35, 4);

  camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);
  camera.near = Math.max(distance / 200, 0.1);
  camera.far = Math.max(distance * 20, 2000);
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
}
