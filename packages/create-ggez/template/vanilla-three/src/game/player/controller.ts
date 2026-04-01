/**
 * StarterPlayerController
 *
 * Responsibilities:
 *  - Owns the physics capsule body and syncs it to a Three.js Group each step.
 *  - Reads movement input from InputManager (no raw DOM listeners here).
 *  - Delegates all camera work to a CameraController that can be swapped at runtime.
 *  - Reports the player actor to GameplayRuntime for trigger / path systems.
 *
 * Update contract (called by app.ts / game loop):
 *  - updateBeforeStep(fixedDt)  — apply movement forces, queue jumps
 *  - updateAfterStep(fixedDt)   — sync object position from physics body
 *  - updateCamera(variableDt)   — consume mouse delta, drive camera (variable-rate)
 */

import type { GameplayRuntime } from "@ggez/gameplay-runtime";
import { vec3, type SceneSettings, type Vec3 } from "@ggez/shared";
import {
  CRASHCAT_OBJECT_LAYER_MOVING,
  CastRayStatus,
  MotionQuality,
  MotionType,
  capsule,
  castRay,
  createClosestCastRayCollector,
  createDefaultCastRaySettings,
  dof,
  filter,
  rigidBody,
  type CrashcatPhysicsWorld,
  type CrashcatRigidBody
} from "@ggez/runtime-physics-crashcat";
import {
  CapsuleGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3
} from "three";
import { createCameraController, type CameraController, type CameraMode } from "../camera";
import type { InputManager } from "../input";
import type { PlayerController } from "../scene";

// ------------------------------------------------------------------
// Constants

const GROUND_MIN_NORMAL_Y = 0.45;
const GROUND_PROBE_DISTANCE = 0.2;
const GROUND_PROBE_HEIGHT = 0.12;
const JUMP_GROUND_LOCK_SECONDS = 0.12;
const MOUSE_SENSITIVITY_X = 0.0024;
const MOUSE_SENSITIVITY_Y = 0.0018;

// ------------------------------------------------------------------
// Types

type StarterPlayerSpawn = {
  position: Vec3;
  rotationY: number;
};

type StarterPlayerControllerOptions = {
  /** Inject the shared InputManager — controller never attaches its own listeners. */
  input: InputManager;
  /** Initial camera controller. Use setCameraMode() to swap at runtime. */
  camera: CameraController;
  /** Held for setCameraMode() rebuilds — the controller does not expose Three camera directly. */
  threeCamera: PerspectiveCamera;
  gameplayRuntime: GameplayRuntime;
  sceneSettings: Pick<SceneSettings, "player" | "world">;
  spawn: StarterPlayerSpawn;
  world: CrashcatPhysicsWorld;
};

type KinematicBody = NonNullable<ReturnType<typeof rigidBody.get>>;

// ------------------------------------------------------------------
// StarterPlayerController

export class StarterPlayerController implements PlayerController {
  readonly object = new Group();

  private readonly body: CrashcatRigidBody;
  private camera: CameraController;
  private readonly threeCamera: PerspectiveCamera;
  private readonly input: InputManager;
  private readonly gameplayRuntime: GameplayRuntime;
  private readonly sceneSettings: Pick<SceneSettings, "player" | "world">;
  private readonly world: CrashcatPhysicsWorld;

  // Capsule dimensions
  private readonly standingHeight: number;
  private readonly radius: number;
  private readonly halfHeight: number;
  private readonly footOffset: number;

  // Look state — updated at variable rate in updateCamera()
  private yaw: number;
  private pitch: number;

  // Jump state
  private jumpQueued = false;
  private spaceWasDown = false;
  private jumpGroundLockRemaining = 0;

  // Ground tracking
  private readonly groundProbeCollector = createClosestCastRayCollector();
  private readonly groundProbeFilter: ReturnType<typeof filter.create>;
  private readonly groundProbeSettings = createDefaultCastRaySettings();
  private readonly supportVelocity = new Vector3();

  // Visual
  private readonly visual: Mesh;

  // Scratch vectors — re-used per call, never allocated in hot paths
  private readonly _eyePosition = new Vector3();
  private readonly _viewDirection = new Vector3();

  constructor(options: StarterPlayerControllerOptions) {
    this.input = options.input;
    this.camera = options.camera;
    this.threeCamera = options.threeCamera;
    this.gameplayRuntime = options.gameplayRuntime;
    this.sceneSettings = options.sceneSettings;
    this.world = options.world;

    this.standingHeight = Math.max(1.2, options.sceneSettings.player.height);
    this.radius = MathUtils.clamp(this.standingHeight * 0.18, 0.24, 0.42);
    this.halfHeight = Math.max(0.12, this.standingHeight * 0.5 - this.radius);
    this.footOffset = this.halfHeight + this.radius;
    this.yaw = options.spawn.rotationY;
    this.pitch = defaultPitchForCameraMode(this.camera.mode);

    this.camera.setStandingHeight(this.standingHeight);

    this.groundProbeFilter = filter.create(this.world.settings.layers);
    this.groundProbeSettings.collideWithBackfaces = true;
    this.groundProbeSettings.treatConvexAsSolid = false;

    // Visual representation of the capsule
    const visualCylHeight = Math.max(0.2, this.halfHeight * 2);
    this.visual = new Mesh(
      new CapsuleGeometry(this.radius, visualCylHeight, 4, 12),
      new MeshStandardMaterial({
        color: "#7dd3fc",
        emissive: "#0f4c81",
        emissiveIntensity: 0.12,
        roughness: 0.62
      })
    );
    this.visual.castShadow = true;
    this.visual.receiveShadow = true;
    this.object.add(this.visual);

    // Physics body
    const spawnPos = {
      x: options.spawn.position.x,
      y: options.spawn.position.y + this.standingHeight * 0.5 + 0.04,
      z: options.spawn.position.z
    };

    this.body = rigidBody.create(this.world, {
      allowSleeping: false,
      allowedDegreesOfFreedom: dof(true, true, true, false, false, false),
      friction: 0,
      linearDamping: 0.8,
      motionQuality: MotionQuality.LINEAR_CAST,
      motionType: MotionType.DYNAMIC,
      objectLayer: CRASHCAT_OBJECT_LAYER_MOVING,
      position: [spawnPos.x, spawnPos.y, spawnPos.z],
      shape: capsule.create({ halfHeightOfCylinder: this.halfHeight, radius: this.radius })
    });

    // Exclude player body from its own ground probes
    this.groundProbeFilter.bodyFilter = (candidate) => candidate.id !== this.body.id;

    this.object.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  }

  // ------------------------------------------------------------------ public

  /**
   * Swap the camera mode at runtime (e.g. entering a vehicle, cutscene, etc.).
   * Creates a fresh CameraController and clamps the current pitch into range.
   */
  setCameraMode(mode: CameraMode): void {
    this.camera = createCameraController(mode, this.threeCamera);
    this.camera.setStandingHeight(this.standingHeight);
    this.pitch = MathUtils.clamp(this.pitch, this.camera.pitchMin, this.camera.pitchMax);
  }

  releasePointerLock(): void {
    this.input.releasePointerLock();
  }

  dispose(): void {
    this.gameplayRuntime.removeActor("player");
    rigidBody.remove(this.world, this.body);
  }

  // ----------------------------------------------------------- update hooks

  /**
   * Fixed-rate update (60 Hz). Apply movement and jump forces to the physics body.
   * Does NOT touch the camera — that happens in updateCamera() at variable rate.
   */
  updateBeforeStep(deltaSeconds: number): void {
    this.jumpGroundLockRemaining = Math.max(0, this.jumpGroundLockRemaining - deltaSeconds);

    const translation = this.body.position;
    const linearVelocity = this.body.motionProperties.linearVelocity;
    const groundedHit =
      this.jumpGroundLockRemaining > 0 ? undefined : this.resolveGroundHit(translation);
    const grounded = groundedHit !== undefined;

    const speed =
      this.sceneSettings.player.canRun && this.isRunning()
        ? this.sceneSettings.player.runningSpeed
        : this.sceneSettings.player.movementSpeed;

    // Movement direction derived from current yaw (set each frame in updateCamera)
    resolveViewDirection(this.yaw, this.pitch, this._viewDirection);
    const vx = this._viewDirection.x;
    const vz = this._viewDirection.z;
    const fLen = Math.hypot(vx, vz) || 1;
    const fx = vx / fLen;
    const fz = vz / fLen;
    const rx = -fz;
    const rz = fx;

    const moveX =
      this.input.axis("KeyD", "KeyA") + this.input.axis("ArrowRight", "ArrowLeft");
    const moveZ =
      this.input.axis("KeyW", "KeyS") + this.input.axis("ArrowUp", "ArrowDown");

    let wishX = rx * moveX + fx * moveZ;
    let wishZ = rz * moveX + fz * moveZ;
    const wishLen = Math.hypot(wishX, wishZ);

    if (wishLen > 0) {
      wishX = (wishX / wishLen) * speed;
      wishZ = (wishZ / wishLen) * speed;
    }

    if (groundedHit) {
      const vel = groundedHit.body.motionProperties.linearVelocity;
      this.supportVelocity.set(vel[0], vel[1], vel[2]);
    } else {
      this.supportVelocity.set(0, 0, 0);
    }

    rigidBody.setLinearVelocity(this.world, this.body, [
      wishX + this.supportVelocity.x,
      grounded && linearVelocity[1] <= this.supportVelocity.y
        ? this.supportVelocity.y
        : linearVelocity[1],
      wishZ + this.supportVelocity.z
    ]);

    // Jump — detect rising edge of Space key
    const spaceDown = this.input.isKeyDown("Space");

    if (spaceDown && !this.spaceWasDown) {
      this.jumpQueued = true;
    }

    this.spaceWasDown = spaceDown;

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
        const currentVel = this.body.motionProperties.linearVelocity;
        rigidBody.setLinearVelocity(this.world, this.body, [
          currentVel[0],
          this.supportVelocity.y +
            Math.sqrt(2 * gravityMagnitude * this.sceneSettings.player.jumpHeight),
          currentVel[2]
        ]);
        this.jumpGroundLockRemaining = JUMP_GROUND_LOCK_SECONDS;
      }

      this.jumpQueued = false;
    }
  }

  /** Fixed-rate update — sync the Three.js object to the physics body position. */
  updateAfterStep(_deltaSeconds: number): void {
    const t = this.body.position;
    this.object.position.set(t[0], t[1], t[2]);
    this.visual.rotation.set(0, this.yaw, 0);
    this.visual.visible = this.camera.showPlayerBody;

    this.gameplayRuntime.updateActor({
      height: this.standingHeight,
      id: "player",
      position: vec3(t[0], t[1], t[2]),
      radius: this.radius,
      tags: ["player"]
    });
  }

  /**
   * Variable-rate update — called once per rendered frame after onUpdate.
   * Consumes accumulated mouse deltas, computes the final eye position and view
   * direction, and drives the camera controller for smooth motion at any refresh rate.
   */
  updateCamera(deltaSeconds: number): void {
    const delta = this.input.consumeMouseDelta();
    this.yaw -= delta.x * MOUSE_SENSITIVITY_X;
    this.pitch = MathUtils.clamp(
      this.pitch - delta.y * MOUSE_SENSITIVITY_Y,
      this.camera.pitchMin,
      this.camera.pitchMax
    );

    const t = this.body.position;
    this._eyePosition.set(t[0], t[1] + this.standingHeight * 0.42, t[2]);
    resolveViewDirection(this.yaw, this.pitch, this._viewDirection);

    this.camera.update(this._eyePosition, this._viewDirection, deltaSeconds);
  }

  // ----------------------------------------------------------------- private

  private isRunning(): boolean {
    return this.input.isKeyDown("ShiftLeft") || this.input.isKeyDown("ShiftRight");
  }

  private resolveGroundHit(
    translation: CrashcatRigidBody["position"]
  ): { body: KinematicBody; fraction: number; normal: [number, number, number] } | undefined {
    // Pass 1 — contacts already in the physics manifold (cheap)
    for (const contact of this.world.contacts.contacts) {
      if (contact.contactIndex < 0 || contact.numContactPoints === 0) continue;
      if (contact.bodyIdA !== this.body.id && contact.bodyIdB !== this.body.id) continue;

      const supportId = contact.bodyIdA === this.body.id ? contact.bodyIdB : contact.bodyIdA;
      const supportBody = rigidBody.get(this.world, supportId);

      if (!supportBody) continue;

      const normalY =
        contact.bodyIdB === this.body.id ? contact.contactNormal[1] : -contact.contactNormal[1];

      if (normalY < GROUND_MIN_NORMAL_Y) continue;

      return {
        body: supportBody,
        fraction: 0,
        normal: [0, normalY, 0]
      };
    }

    // Pass 2 — four short ray probes around the capsule base
    const probeOriginY = translation[1] - this.footOffset + GROUND_PROBE_HEIGHT;
    const probeOffset = this.radius + 0.05;

    for (const [offsetX, offsetZ] of [
      [probeOffset, 0],
      [-probeOffset, 0],
      [0, probeOffset],
      [0, -probeOffset]
    ] as const) {
      const origin: [number, number, number] = [
        translation[0] + offsetX,
        probeOriginY,
        translation[2] + offsetZ
      ];

      this.groundProbeCollector.reset();
      castRay(
        this.world,
        this.groundProbeCollector,
        this.groundProbeSettings,
        origin,
        DOWN_DIRECTION,
        GROUND_PROBE_DISTANCE,
        this.groundProbeFilter
      );

      const hit = this.groundProbeCollector.hit;

      if (hit.status !== CastRayStatus.COLLIDING) continue;

      const body = rigidBody.get(this.world, hit.bodyIdB);

      if (!body || body.id === this.body.id) continue;

      const hitPoint: [number, number, number] = [
        origin[0],
        origin[1] - GROUND_PROBE_DISTANCE * hit.fraction,
        origin[2]
      ];
      const normal = rigidBody.getSurfaceNormal([0, 0, 0], body, hitPoint, hit.subShapeId);

      if (Math.abs(normal[1]) < GROUND_MIN_NORMAL_Y) continue;

      return { body, fraction: hit.fraction, normal };
    }

    return undefined;
  }
}

// ------------------------------------------------------------------
// Module-level helpers

function defaultPitchForCameraMode(mode: CameraMode): number {
  if (mode === "fps") return 0;
  if (mode === "third-person") return -0.22;
  return -0.78;
}

function resolveViewDirection(yaw: number, pitch: number, target: Vector3): Vector3 {
  return target.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
}

const DOWN_DIRECTION: [number, number, number] = [0, -1, 0];
