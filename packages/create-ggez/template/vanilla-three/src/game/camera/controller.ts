import { PerspectiveCamera, Vector3 } from "three";
import type { SceneSettings } from "@ggez/shared";
import { FpsCameraController } from "./fps";
import { ThirdPersonCameraController } from "./third-person";
import { TopDownCameraController } from "./top-down";

export type CameraMode = SceneSettings["player"]["cameraMode"];

/**
 * Implemented by FPS / third-person / top-down controllers.
 * Pass an instance to StarterPlayerController; swap at runtime via setCameraMode().
 */
export interface CameraController {
  readonly mode: CameraMode;
  readonly pitchMin: number;
  readonly pitchMax: number;
  /** Whether the player body mesh should be visible. FPS hides it; others show it. */
  readonly showPlayerBody: boolean;
  /**
   * Called once when the player height is known (or changes).
   * Pre-computes scale-dependent distances (follow distance, eye offset, etc.).
   */
  setStandingHeight(height: number): void;
  /**
   * Called every variable-rate frame (from onUpdate, not onFixedUpdate).
   * @param eye      World-space eye position.
   * @param viewDir  Normalised view direction.
   * @param deltaSeconds Variable frame delta for lerp smoothing.
   */
  update(eye: Readonly<Vector3>, viewDir: Readonly<Vector3>, deltaSeconds: number): void;
}

/** Instantiate the correct camera controller for the given mode. */
export function createCameraController(mode: CameraMode, camera: PerspectiveCamera): CameraController {
  switch (mode) {
    case "fps":
      return new FpsCameraController(camera);
    case "third-person":
      return new ThirdPersonCameraController(camera);
    case "top-down":
      return new TopDownCameraController(camera);
  }
}
