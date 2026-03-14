import { Euler, Quaternion, type Object3D } from "three";
import type { GameplayRuntimeHost } from "@web-hammer/gameplay-runtime";
import type { Transform } from "@web-hammer/shared";

type KinematicPhysicsBody = {
  setNextKinematicRotation: (rotation: QuaternionLike) => void;
  setNextKinematicTranslation: (translation: VectorLike) => void;
};

type QuaternionLike = {
  w: number;
  x: number;
  y: number;
  z: number;
};

type VectorLike = {
  x: number;
  y: number;
  z: number;
};

export type PlaybackGameplayHost = {
  bindNodePhysicsBody: (nodeId: string, body: KinematicPhysicsBody | null) => void;
  bindNodeObject: (nodeId: string, object: Object3D | null) => void;
  host: GameplayRuntimeHost;
  reset: () => void;
};

export function createPlaybackGameplayHost(): PlaybackGameplayHost {
  const physicsBodiesByNodeId = new Map<string, KinematicPhysicsBody | null>();
  const objectsByNodeId = new Map<string, Object3D | null>();
  const pendingTransforms = new Map<string, Transform>();

  return {
    bindNodePhysicsBody(nodeId, body) {
      if (body) {
        physicsBodiesByNodeId.set(nodeId, body);
        const pendingTransform = pendingTransforms.get(nodeId);

        if (pendingTransform) {
          applyBodyTransform(body, pendingTransform);
        }

        return;
      }

      physicsBodiesByNodeId.delete(nodeId);
    },
    bindNodeObject(nodeId, object) {
      if (object) {
        objectsByNodeId.set(nodeId, object);
        const pendingTransform = pendingTransforms.get(nodeId);

        if (pendingTransform) {
          applyTransform(object, pendingTransform);
        }

        return;
      }

      objectsByNodeId.delete(nodeId);
    },
    host: {
      applyNodeWorldTransform(nodeId, transform) {
        const object = objectsByNodeId.get(nodeId);
        const body = physicsBodiesByNodeId.get(nodeId);

        if (!object && !body) {
          pendingTransforms.set(nodeId, structuredClone(transform));
          return;
        }

        pendingTransforms.set(nodeId, structuredClone(transform));

        if (object) {
          applyTransform(object, transform);
        }

        if (body) {
          applyBodyTransform(body, transform);
        }
      }
    },
    reset() {
      pendingTransforms.clear();
      physicsBodiesByNodeId.clear();
      objectsByNodeId.clear();
    }
  };
}

function applyTransform(object: Object3D, transform: Transform) {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  object.updateMatrixWorld();
}

function applyBodyTransform(body: KinematicPhysicsBody, transform: Transform) {
  body.setNextKinematicTranslation(transform.position);
  body.setNextKinematicRotation(
    new Quaternion().setFromEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z))
  );
}
