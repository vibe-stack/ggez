import { type GameplayRuntimeHost } from "@ggez/gameplay-runtime";
import { MotionType, rigidBody, type CrashcatPhysicsWorld } from "@ggez/runtime-physics-crashcat";
import type { Transform } from "@ggez/shared";
import type { ThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from "three";
import type { RuntimePhysicsSession } from "../physics/session";

type StarterGameplayHostOptions = {
  physicsWorld: CrashcatPhysicsWorld;
  runtimePhysics: Pick<RuntimePhysicsSession, "getBody">;
  runtimeScene: Pick<ThreeRuntimeSceneInstance, "nodesById">;
};

type KinematicPhysicsBody = NonNullable<ReturnType<RuntimePhysicsSession["getBody"]>>;

/**
 * Implements GameplayRuntimeHost: the bridge that lets gameplay systems move
 * scene nodes and physics bodies by calling applyNodeWorldTransform().
 */
export function createStarterGameplayHost(options: StarterGameplayHostOptions): GameplayRuntimeHost {
  return {
    applyNodeWorldTransform(nodeId, transform) {
      const object = options.runtimeScene.nodesById.get(nodeId);
      const body = options.runtimePhysics.getBody(nodeId);

      if (object) applyObjectWorldTransform(object, transform);
      if (body) applyBodyTransform(options.physicsWorld, body, transform);
    }
  };
}

// ------------------------------------------------------------------
// Transform helpers — module-level scratch objects avoid heap allocation
// in the fixed-rate physics update path.

const scratchEuler = new Euler();
const scratchLocalMatrix = new Matrix4();
const scratchWorldMatrix = new Matrix4();
const scratchWorldPosition = new Vector3();
const scratchWorldQuaternion = new Quaternion();
const scratchWorldScale = new Vector3();
const scratchBodyEuler = new Euler();
const scratchBodyQuaternion = new Quaternion();

function applyObjectWorldTransform(object: Object3D, transform: Transform) {
  scratchWorldQuaternion.setFromEuler(
    scratchEuler.set(transform.rotation.x, transform.rotation.y, transform.rotation.z)
  );
  scratchWorldMatrix.compose(
    scratchWorldPosition.set(transform.position.x, transform.position.y, transform.position.z),
    scratchWorldQuaternion,
    scratchWorldScale.set(transform.scale.x, transform.scale.y, transform.scale.z)
  );

  if (object.parent) {
    object.parent.updateMatrixWorld(true);
    scratchLocalMatrix.copy(object.parent.matrixWorld).invert().multiply(scratchWorldMatrix);
    scratchLocalMatrix.decompose(object.position, object.quaternion, object.scale);
  } else {
    scratchWorldMatrix.decompose(object.position, object.quaternion, object.scale);
  }

  object.updateMatrixWorld(true);
}

function applyBodyTransform(world: CrashcatPhysicsWorld, body: KinematicPhysicsBody, transform: Transform) {
  if (body.motionType !== MotionType.KINEMATIC) return;

  scratchBodyQuaternion.setFromEuler(
    scratchBodyEuler.set(transform.rotation.x, transform.rotation.y, transform.rotation.z)
  );
  rigidBody.setTransform(
    world,
    body,
    [transform.position.x, transform.position.y, transform.position.z],
    [scratchBodyQuaternion.x, scratchBodyQuaternion.y, scratchBodyQuaternion.z, scratchBodyQuaternion.w],
    false
  );
}
