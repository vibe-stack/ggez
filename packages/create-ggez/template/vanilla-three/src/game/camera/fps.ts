import { PerspectiveCamera, Vector3 } from "three";
import type { CameraController, CameraMode } from "./controller";

export class FpsCameraController implements CameraController {
  readonly mode = "fps" as const;
  readonly pitchMin = -1.35;
  readonly pitchMax = 1.35;
  readonly showPlayerBody = false;

  private readonly camera: PerspectiveCamera;
  private readonly _lookTarget = new Vector3();

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  setStandingHeight(_height: number): void {}

  update(eye: Readonly<Vector3>, viewDir: Readonly<Vector3>, _deltaSeconds: number): void {
    this.camera.position.copy(eye as Vector3);
    this.camera.lookAt(this._lookTarget.copy(eye as Vector3).add(viewDir as Vector3));
  }
}
