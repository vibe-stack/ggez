import { deriveRenderScene, type DerivedRenderMesh, type DerivedRenderScene } from "@ggez/render-pipeline";
import {
  createDynamicRigidBody,
  createStaticRigidBody,
  createStaticRigidBodyFromObject,
  rigidBody,
  type CrashcatPhysicsWorld,
  type CrashcatRigidBody
} from "@ggez/runtime-physics-crashcat";
import type { Material } from "@ggez/shared";
import type { ThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";

const INSTANCED_MODEL_COLLIDER_DISTANCE = 50;

export type RuntimePhysicsSession = {
  colliderCount: number;
  dispose: () => void;
  getBody: (nodeId: string) => CrashcatRigidBody | undefined;
  renderScene: DerivedRenderScene;
  syncVisuals: () => void;
};

export function createRuntimePhysicsSession(options: {
  camera: { position: Vector3 };
  runtimeScene: ThreeRuntimeSceneInstance;
  world: CrashcatPhysicsWorld;
}): RuntimePhysicsSession {
  const renderScene = deriveRuntimeRenderScene(options.runtimeScene);
  const instancedMeshes = deriveInstancedRuntimeMeshes(renderScene);
  const instancedNodeIds = new Set(instancedMeshes.map((mesh) => mesh.nodeId));
  const unsupportedDynamicInstanceMeshes = instancedMeshes.filter(
    (mesh) => mesh.physics?.enabled && mesh.physics.bodyType !== "fixed"
  );
  const unsupportedDynamicInstanceNodeIds = new Set(
    unsupportedDynamicInstanceMeshes.map((mesh) => mesh.nodeId)
  );
  const gatedInstancedModelMeshes = instancedMeshes.filter(
    (mesh) => mesh.sourceKind === "model" && !unsupportedDynamicInstanceNodeIds.has(mesh.nodeId)
  );
  const gatedInstancedModelNodeIds = new Set(gatedInstancedModelMeshes.map((mesh) => mesh.nodeId));
  const allMeshes = [
    ...renderScene.meshes,
    ...instancedMeshes.filter(
      (mesh) => !unsupportedDynamicInstanceNodeIds.has(mesh.nodeId) && !gatedInstancedModelNodeIds.has(mesh.nodeId)
    )
  ];
  const physicsMeshes = allMeshes.filter((mesh) => mesh.physics?.enabled);
  const physicsMeshIds = new Set(physicsMeshes.map((mesh) => mesh.nodeId));
  const staticMeshes = allMeshes.filter((mesh) => !physicsMeshIds.has(mesh.nodeId));
  const bodiesByNodeId = new Map<string, CrashcatRigidBody>();
  const instancedObjectsByNodeId = createInstancedObjectMap(options.runtimeScene);
  const proximityBodiesByNodeId = new Map<string, CrashcatRigidBody>();
  const dynamicBindings: Array<{
    body: CrashcatRigidBody;
    object: NonNullable<ReturnType<ThreeRuntimeSceneInstance["nodesById"]["get"]>>;
  }> = [];

  unsupportedDynamicInstanceMeshes.forEach((mesh) => {
    console.warn(
      `Skipping dynamic instanced collider for ${mesh.nodeId}. Instanced runtime bodies currently support fixed collision only.`
    );
  });

  staticMeshes.forEach((mesh) => {
    const runtimeObject = options.runtimeScene.nodesById.get(mesh.nodeId);
    const body = mesh.sourceKind === "model" && runtimeObject
      ? createStaticRigidBodyFromObject(options.world, mesh, runtimeObject)
      : createStaticRigidBody(options.world, mesh);
    bodiesByNodeId.set(mesh.nodeId, body);
  });

  physicsMeshes.forEach((mesh) => {
    const body = createDynamicRigidBody(options.world, mesh);
    bodiesByNodeId.set(mesh.nodeId, body);

    if (instancedNodeIds.has(mesh.nodeId)) {
      return;
    }

    const object = options.runtimeScene.nodesById.get(mesh.nodeId);

    if (object) {
      dynamicBindings.push({ body, object });
    }
  });

  updateNearbyInstancedModelBodies({
    bodiesByNodeId,
    cameraPosition: options.camera.position,
    instancedObjectsByNodeId,
    meshes: gatedInstancedModelMeshes,
    proximityBodiesByNodeId,
    world: options.world
  });

  return {
    colliderCount: staticMeshes.length + physicsMeshes.length + proximityBodiesByNodeId.size,
    dispose() {
      for (const body of bodiesByNodeId.values()) {
        rigidBody.remove(options.world, body);
      }

      bodiesByNodeId.clear();
      dynamicBindings.length = 0;
    },
    getBody(nodeId) {
      return bodiesByNodeId.get(nodeId);
    },
    renderScene,
    syncVisuals() {
      updateNearbyInstancedModelBodies({
        bodiesByNodeId,
        cameraPosition: options.camera.position,
        instancedObjectsByNodeId,
        meshes: gatedInstancedModelMeshes,
        proximityBodiesByNodeId,
        world: options.world
      });

      dynamicBindings.forEach(({ body, object }) => {
        const translation = body.position;
        const rotation = body.quaternion;
        scratchWorldMatrix.compose(
          scratchPosition.set(translation[0], translation[1], translation[2]),
          scratchQuaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]),
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

function createInstancedObjectMap(runtimeScene: ThreeRuntimeSceneInstance) {
  const objectsByNodeId = new Map<string, Object3D>();

  runtimeScene.root.traverse((object) => {
    const instanceNodeIds = (object.userData.webHammer as { instanceNodeIds?: string[] } | undefined)?.instanceNodeIds;

    if (!Array.isArray(instanceNodeIds)) {
      return;
    }

    instanceNodeIds.forEach((nodeId) => {
      if (!objectsByNodeId.has(nodeId)) {
        objectsByNodeId.set(nodeId, object);
      }
    });
  });

  return objectsByNodeId;
}

function updateNearbyInstancedModelBodies(input: {
  bodiesByNodeId: Map<string, CrashcatRigidBody>;
  cameraPosition: Vector3;
  instancedObjectsByNodeId: Map<string, Object3D>;
  meshes: DerivedRenderMesh[];
  proximityBodiesByNodeId: Map<string, CrashcatRigidBody>;
  world: CrashcatPhysicsWorld;
}) {
  const activeNodeIds = new Set<string>();

  input.meshes.forEach((mesh) => {
    if (
      input.cameraPosition.distanceTo(
        scratchDistancePosition.set(mesh.position.x, mesh.position.y, mesh.position.z)
      ) > INSTANCED_MODEL_COLLIDER_DISTANCE
    ) {
      return;
    }

    activeNodeIds.add(mesh.nodeId);

    if (input.proximityBodiesByNodeId.has(mesh.nodeId)) {
      return;
    }

    const object = input.instancedObjectsByNodeId.get(mesh.nodeId);
    const body = object
      ? createStaticRigidBodyFromObject(input.world, mesh, object, mesh.nodeId)
      : createStaticRigidBody(input.world, mesh);

    input.proximityBodiesByNodeId.set(mesh.nodeId, body);
    input.bodiesByNodeId.set(mesh.nodeId, body);
  });

  Array.from(input.proximityBodiesByNodeId.entries()).forEach(([nodeId, body]) => {
    if (activeNodeIds.has(nodeId)) {
      return;
    }

    rigidBody.remove(input.world, body);
    input.proximityBodiesByNodeId.delete(nodeId);
    input.bodiesByNodeId.delete(nodeId);
  });
}

function deriveInstancedRuntimeMeshes(renderScene: DerivedRenderScene): DerivedRenderMesh[] {
  return renderScene.instancedMeshes.flatMap((batch) =>
    batch.instances.map((instance) => ({
      ...batch.mesh,
      label: `${batch.mesh.label} [${instance.label}]`,
      nodeId: instance.nodeId,
      position: instance.position,
      rotation: instance.rotation,
      scale: instance.scale
    }))
  );
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
const scratchDistancePosition = new Vector3();
const scratchWorldMatrix = new Matrix4();
