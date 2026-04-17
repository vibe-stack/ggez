import { BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { resolveSceneGraph } from "@ggez/shared";
import type { WorldLodSettings } from "@ggez/shared";
import type { WebHammerEngineModelNode, WebHammerEngineNode, WebHammerExportModelLod } from "../types";
import type { WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources } from "./types";
import { composeTransformMatrix, computeInstancedBatchCenter } from "./scene-utils";
import { loadModelTemplate, resolveModelReference } from "./model-object";
import {
  createLazyRuntimeModelGroup,
  resolveRuntimeModelLevelDescriptors
} from "./lazy-model";

const tempModelInstanceMatrix = new Matrix4();
const tempModelChildMatrix = new Matrix4();

export async function createInstancedModelObject(
  sourceNode: WebHammerEngineModelNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  lodLevel?: WebHammerExportModelLod
) {
  const group = new Group();
  const template = await loadModelTemplate(
    resolveModelReference(sourceNode, resources.assetsById, lodLevel),
    options,
    resources
  );
  const templateInstanceNodeIds = instances.map((instance) => instance.id);
  let modelMeshIndex = 0;

  template.updateMatrixWorld(true);

  template.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) {
      return;
    }

    const instancedMesh = new InstancedMesh(child.geometry, child.material, instances.length);
    instancedMesh.castShadow = options.castShadow ?? true;
    instancedMesh.receiveShadow = options.receiveShadow ?? true;
    instancedMesh.name = `${sourceNode.name}:${lodLevel?.level ?? "high"}:${child.name || modelMeshIndex}:instanced`;
    instancedMesh.userData.webHammer = {
      instanceNodeIds: templateInstanceNodeIds,
      lodLevel: lodLevel?.level ?? "high",
      modelMeshIndex,
      sourceNodeId: sourceNode.id
    };

    tempModelChildMatrix.copy(child.matrixWorld);

    instances.forEach((instance, index) => {
      const worldTransform = sceneGraph.nodeWorldTransforms.get(instance.id) ?? instance.transform;
      tempModelInstanceMatrix.copy(composeTransformMatrix(worldTransform)).multiply(tempModelChildMatrix);
      instancedMesh.setMatrixAt(index, tempModelInstanceMatrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.computeBoundingBox();
    instancedMesh.computeBoundingSphere();
    group.add(instancedMesh);
    modelMeshIndex += 1;
  });

  group.name = `${sourceNode.name}:instances`;
  group.userData.webHammer = {
    instanceNodeIds: templateInstanceNodeIds,
    sourceNodeId: sourceNode.id
  };
  return group;
}

export async function createInstancedObjectForModelNode(
  sourceNode: WebHammerEngineModelNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const highReference = resolveModelReference(sourceNode, resources.assetsById);

  if (!highReference.modelPath) {
    return createInstancedModelObject(sourceNode, instances, sceneGraph, resources, options);
  }

  return createLazyInstancedModelObject(sourceNode, instances, sceneGraph, resources, options, worldLodSettings);
}

export function createLazyInstancedModelObject(
  sourceNode: WebHammerEngineModelNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const descriptors = resolveRuntimeModelLevelDescriptors(sourceNode, options.lod, worldLodSettings);
  const fallback = new Group();
  const center = computeInstancedBatchCenter(instances, sceneGraph);

  fallback.userData.webHammer = {
    instanceNodeIds: instances.map((instance) => instance.id),
    sourceNodeId: sourceNode.id
  };

  return createLazyRuntimeModelGroup({
    descriptors,
    fallback,
    name: `${sourceNode.name}:InstancingLOD`,
    onLoadLevel: (descriptor) =>
      createInstancedModelObject(
        sourceNode,
        instances,
        sceneGraph,
        resources,
        options,
        descriptor.reference
      ),
    resolveDistance: (camera) => camera.position.distanceTo(center)
  });
}
