import { PerspectiveCamera, Vector3 } from "three";
import type { CameraController, CameraMode } from "./controller";

const SMOOTH = 8;

export class TopDownCameraController implements CameraController {
  readonly mode = "top-down" as const;
  readonly pitchMin = -1.25;
  readonly pitchMax = -0.12;
  readonly showPlayerBody = true;

  private readonly camera: PerspectiveCamera;
  private readonly _desiredPos = new Vector3();
  private followDistance = 8;
  private eyeUpOffset = 0;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  setStandingHeight(height: number): void {
    this.followDistance = Math.max(8, height * 5.2);
    this.eyeUpOffset = height * 1.8;
  }

  update(eye: Readonly<Vector3>, viewDir: Readonly<Vector3>, deltaSeconds: number): void {
    this._desiredPos
      .copy(eye as Vector3)
      .addScaledVector(viewDir as Vector3, -this.followDistance);
    this._desiredPos.y += this.eyeUpOffset;
    this.camera.position.lerp(this._desiredPos, 1 - Math.exp(-deltaSeconds * SMOOTH));
    this.camera.lookAt(eye as Vector3);
  }
}
