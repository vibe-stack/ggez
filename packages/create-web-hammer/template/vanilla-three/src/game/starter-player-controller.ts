import type { GameplayRuntime } from "@web-hammer/gameplay-runtime";
import { vec3, type SceneSettings, type Vec3 } from "@web-hammer/shared";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  CapsuleGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3
} from "three";

type StarterPlayerSpawn = {
  position: Vec3;
  rotationY: number;
};

type StarterPlayerControllerOptions = {
  camera: PerspectiveCamera;
  cameraMode: SceneSettings["player"]["cameraMode"];
  domElement: HTMLCanvasElement;
  gameplayRuntime: GameplayRuntime;
  sceneSettings: Pick<SceneSettings, "player" | "world">;
  spawn: StarterPlayerSpawn;
  world: RAPIER.World;
};

const GROUND_MIN_NORMAL_Y = 0.45;
const GROUND_PROBE_DISTANCE = 0.2;
const GROUND_PROBE_HEIGHT = 0.12;
const JUMP_GROUND_LOCK_SECONDS = 0.12;

export class StarterPlayerController {
  readonly object = new Group();

  private readonly body: RAPIER.RigidBody;
  private readonly camera: PerspectiveCamera;
  private cameraMode: SceneSettings["player"]["cameraMode"];
  private readonly domElement: HTMLCanvasElement;
  private readonly footOffset: number;
  private readonly gameplayRuntime: GameplayRuntime;
  private readonly halfHeight: number;
  private jumpGroundLockRemaining = 0;
  private jumpQueued = false;
  private readonly keyState = new Set<string>();
  private lastGrounded = false;
  private pitch = 0;
  private pointerLocked = false;
  private readonly radius: number;
  private readonly sceneSettings: Pick<SceneSettings, "player" | "world">;
  private readonly standingHeight: number;
  private readonly supportVelocity = new Vector3();
  private readonly visual: Mesh;
  private readonly world: RAPIER.World;
  private yaw = 0;

  constructor(options: StarterPlayerControllerOptions) {
    this.camera = options.camera;
    this.cameraMode = options.cameraMode;
    this.domElement = options.domElement;
    this.gameplayRuntime = options.gameplayRuntime;
    this.sceneSettings = options.sceneSettings;
    this.world = options.world;
    this.standingHeight = Math.max(1.2, options.sceneSettings.player.height);
    this.radius = MathUtils.clamp(this.standingHeight * 0.18, 0.24, 0.42);
    this.halfHeight = Math.max(0.12, this.standingHeight * 0.5 - this.radius);
    this.footOffset = this.halfHeight + this.radius;
    this.yaw = options.spawn.rotationY;
    this.pitch = defaultPitchForCameraMode(this.cameraMode);

    const visualHeight = Math.max(0.2, this.halfHeight * 2);
    this.visual = new Mesh(
      new CapsuleGeometry(this.radius, visualHeight, 4, 12),
      new MeshStandardMaterial({
        color: "#7dd3fc",
        emissive: "#0f4c81",
        emissiveIntensity: 0.12,
        roughness: 0.62
      })
    );

    const spawnPosition = {
      x: options.spawn.position.x,
      y: options.spawn.position.y + this.standingHeight * 0.5 + 0.04,
      z: options.spawn.position.z
    };
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0.8);
    this.body = this.world.createRigidBody(bodyDesc);
    this.body.lockRotations(true, true);
    this.world.createCollider(RAPIER.ColliderDesc.capsule(this.halfHeight, this.radius).setFriction(0), this.body);

    this.visual.castShadow = true;
    this.visual.receiveShadow = true;
    this.object.add(this.visual);
    this.object.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);

    this.domElement.addEventListener("click", this.handleCanvasClick);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousemove", this.handleMouseMove);
  }

  dispose() {
    this.releasePointerLock();
    this.domElement.removeEventListener("click", this.handleCanvasClick);
    window.removeEventListener("blur", this.handleWindowBlur);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
    this.gameplayRuntime.removeActor("player");
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }

    this.pointerLocked = false;
  }

  setCameraMode(cameraMode: SceneSettings["player"]["cameraMode"]) {
    this.cameraMode = cameraMode;
  }

  updateAfterStep(deltaSeconds: number) {
    const translation = this.body.translation();
    this.object.position.set(translation.x, translation.y, translation.z);
    this.visual.rotation.set(0, this.yaw, 0);
    this.visual.visible = this.cameraMode !== "fps";

    const eyePosition = new Vector3(
      translation.x,
      translation.y + this.standingHeight * 0.42,
      translation.z
    );
    const viewDirection = resolveViewDirection(this.yaw, this.pitch, new Vector3());

    if (this.cameraMode === "fps") {
      this.camera.position.copy(eyePosition);
      this.camera.lookAt(eyePosition.clone().add(viewDirection));
    } else if (this.cameraMode === "third-person") {
      const followDistance = Math.max(3.2, this.standingHeight * 2.7);
      const targetCameraPosition = eyePosition.clone().addScaledVector(viewDirection, -followDistance);
      targetCameraPosition.y += this.standingHeight * 0.24;
      this.camera.position.lerp(targetCameraPosition, 1 - Math.exp(-deltaSeconds * 10));
      this.camera.lookAt(eyePosition);
    } else {
      const followDistance = Math.max(8, this.standingHeight * 5.2);
      const targetCameraPosition = eyePosition.clone().addScaledVector(viewDirection, -followDistance);
      targetCameraPosition.y += this.standingHeight * 1.8;
      this.camera.position.lerp(targetCameraPosition, 1 - Math.exp(-deltaSeconds * 8));
      this.camera.lookAt(eyePosition);
    }

    this.gameplayRuntime.updateActor({
      height: this.standingHeight,
      id: "player",
      position: vec3(translation.x, translation.y, translation.z),
      radius: this.radius,
      tags: ["player"]
    });
  }

  updateBeforeStep(deltaSeconds: number) {
    this.jumpGroundLockRemaining = Math.max(0, this.jumpGroundLockRemaining - deltaSeconds);
    const translation = this.body.translation();
    const linearVelocity = this.body.linvel();
    const groundedHit = this.jumpGroundLockRemaining > 0 ? undefined : this.resolveGroundHit(translation);
    const grounded = groundedHit !== undefined;
    const speed =
      this.sceneSettings.player.canRun && this.isRunning()
        ? this.sceneSettings.player.runningSpeed
        : this.sceneSettings.player.movementSpeed;
    const viewDirection = resolveViewDirection(this.yaw, this.pitch, scratchViewDirection);
    const forward = scratchForward.set(viewDirection.x, 0, viewDirection.z);

    if (forward.lengthSq() > 0) {
      forward.normalize();
    } else {
      forward.set(0, 0, -1);
    }

    const right = scratchRight.set(-forward.z, 0, forward.x).normalize();
    const moveDirection = scratchMoveDirection
      .set(0, 0, 0)
      .addScaledVector(right, this.axis("KeyD", "ArrowRight") - this.axis("KeyA", "ArrowLeft"))
      .addScaledVector(forward, this.axis("KeyW", "ArrowUp") - this.axis("KeyS", "ArrowDown"));

    if (moveDirection.lengthSq() > 0) {
      moveDirection.normalize().multiplyScalar(speed);
    }

    if (groundedHit?.collider.parent()) {
      const supportBody = groundedHit.collider.parent();

      if (supportBody) {
        const velocity = supportBody.linvel();
        this.supportVelocity.set(velocity.x, velocity.y, velocity.z);
      }
    } else {
      this.supportVelocity.set(0, 0, 0);
    }

    this.body.setLinvel(
      {
        x: moveDirection.x + this.supportVelocity.x,
        y: grounded && linearVelocity.y <= this.supportVelocity.y ? this.supportVelocity.y : linearVelocity.y,
        z: moveDirection.z + this.supportVelocity.z
      },
      true
    );

    if (this.jumpQueued) {
      if (this.sceneSettings.player.canJump && grounded) {
        const gravityMagnitude = Math.max(
          0.001,
          Math.hypot(
            this.sceneSettings.world.gravity.x,
            this.sceneSettings.world.gravity.y,
            this.sceneSettings.world.gravity.z
          )
        );
        const currentVelocity = this.body.linvel();
        this.body.setLinvel(
          {
            x: currentVelocity.x,
            y: this.supportVelocity.y + Math.sqrt(2 * gravityMagnitude * this.sceneSettings.player.jumpHeight),
            z: currentVelocity.z
          },
          true
        );
        this.jumpGroundLockRemaining = JUMP_GROUND_LOCK_SECONDS;
      }

      this.jumpQueued = false;
    }

    this.lastGrounded = grounded;
  }

  private axis(primary: string, secondary: string) {
    return this.keyState.has(primary) || this.keyState.has(secondary) ? 1 : 0;
  }

  private isRunning() {
    return this.keyState.has("ShiftLeft") || this.keyState.has("ShiftRight");
  }

  private resolveGroundHit(translation: ReturnType<RAPIER.RigidBody["translation"]>) {
    const ray = new RAPIER.Ray(
      {
        x: translation.x,
        y: translation.y - this.footOffset + GROUND_PROBE_HEIGHT,
        z: translation.z
      },
      { x: 0, y: -1, z: 0 }
    );

    const hit = this.world.castRayAndGetNormal(
      ray,
      GROUND_PROBE_DISTANCE,
      false,
      undefined,
      undefined,
      undefined,
      this.body
    );

    if (!hit || hit.normal.y < GROUND_MIN_NORMAL_Y) {
      return undefined;
    }

    return hit;
  }

  private readonly handleCanvasClick = () => {
    if (document.pointerLockElement === this.domElement) {
      return;
    }

    void this.domElement.requestPointerLock();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (isTextInputTarget(event.target)) {
      return;
    }

    this.keyState.add(event.code);

    if (event.code === "Space") {
      this.jumpQueued = true;
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.keyState.delete(event.code);
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    this.pointerLocked = document.pointerLockElement === this.domElement;

    if (!this.pointerLocked) {
      return;
    }

    this.yaw -= event.movementX * 0.0024;
    this.pitch = MathUtils.clamp(
      this.pitch - event.movementY * 0.0018,
      this.cameraMode === "fps" ? -1.35 : -1.25,
      this.cameraMode === "fps" ? 1.35 : this.cameraMode === "top-down" ? -0.12 : 0.4
    );
  };

  private readonly handleWindowBlur = () => {
    this.keyState.clear();
    this.jumpQueued = false;
    this.releasePointerLock();
  };
}

function defaultPitchForCameraMode(cameraMode: SceneSettings["player"]["cameraMode"]) {
  if (cameraMode === "fps") {
    return 0;
  }

  if (cameraMode === "third-person") {
    return -0.22;
  }

  return -0.78;
}

function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}

function resolveViewDirection(yaw: number, pitch: number, target: Vector3) {
  target.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );

  return target.normalize();
}

const scratchForward = new Vector3();
const scratchMoveDirection = new Vector3();
const scratchRight = new Vector3();
const scratchViewDirection = new Vector3();
