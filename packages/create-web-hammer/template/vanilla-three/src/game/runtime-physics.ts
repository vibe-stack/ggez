import type RAPIER from "@dimforge/rapier3d-compat";
import { deriveRenderScene, type DerivedRenderScene } from "@web-hammer/render-pipeline";
import { createDynamicRigidBody, createStaticRigidBody } from "@web-hammer/runtime-physics-rapier";
import type { Material } from "@web-hammer/shared";
import type { ThreeRuntimeSceneInstance } from "@web-hammer/three-runtime";
import { Matrix4, Quaternion, Vector3 } from "three";

export type RuntimePhysicsSession = {
  colliderCount: number;
  dispose: () => void;
  renderScene: DerivedRenderScene;
  syncVisuals: () => void;
};

export function createRuntimePhysicsSession(options: {
  runtimeScene: ThreeRuntimeSceneInstance;
  world: RAPIER.World;
}): RuntimePhysicsSession {
  const renderScene = deriveRuntimeRenderScene(options.runtimeScene);
  const physicsMeshes = renderScene.meshes.filter((mesh) => mesh.physics?.enabled);
  const physicsMeshIds = new Set(physicsMeshes.map((mesh) => mesh.nodeId));
  const staticMeshes = renderScene.meshes.filter((mesh) => !physicsMeshIds.has(mesh.nodeId));
  const dynamicBindings: Array<{
    body: RAPIER.RigidBody;
    object: NonNullable<ReturnType<ThreeRuntimeSceneInstance["nodesById"]["get"]>>;
  }> = [];

  staticMeshes.forEach((mesh) => {
    createStaticRigidBody(options.world, mesh);
  });

  physicsMeshes.forEach((mesh) => {
    const body = createDynamicRigidBody(options.world, mesh);
    const object = options.runtimeScene.nodesById.get(mesh.nodeId);

    if (object) {
      dynamicBindings.push({ body, object });
    }
  });

  return {
    colliderCount: staticMeshes.length + physicsMeshes.length,
    dispose() {},
    renderScene,
    syncVisuals() {
      dynamicBindings.forEach(({ body, object }) => {
        const translation = body.translation();
        const rotation = body.rotation();
        scratchWorldMatrix.compose(
          scratchPosition.set(translation.x, translation.y, translation.z),
          scratchQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w),
          object.scale
        );

        if (object.parent) {
          object.parent.updateMatrixWorld(true);
          scratchLocalMatrix.copy(object.parent.matrixWorld).invert().multiply(scratchWorldMatrix);
          scratchLocalMatrix.decompose(object.position, object.quaternion, scratchScale);
          object.scale.copy(scratchScale);
          return;
        }

        scratchWorldMatrix.decompose(object.position, object.quaternion, scratchScale);
        object.scale.copy(scratchScale);
      });
    }
  };
}

function deriveRuntimeRenderScene(runtimeScene: ThreeRuntimeSceneInstance): DerivedRenderScene {
  return deriveRenderScene(
    runtimeScene.scene.nodes,
    runtimeScene.scene.entities,
    runtimeScene.scene.materials.map(toSharedMaterial),
    runtimeScene.scene.assets
  );
}

function toSharedMaterial(material: ThreeRuntimeSceneInstance["scene"]["materials"][number]): Material {
  return {
    color: material.color,
    colorTexture: material.baseColorTexture,
    id: material.id,
    metalness: material.metallicFactor,
    metalnessTexture: material.metallicRoughnessTexture,
    name: material.name,
    normalTexture: material.normalTexture,
    roughness: material.roughnessFactor,
    roughnessTexture: material.metallicRoughnessTexture,
    side: material.side
  };
}

const scratchLocalMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const scratchWorldMatrix = new Matrix4();
