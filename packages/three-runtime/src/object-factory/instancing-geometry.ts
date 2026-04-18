import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LOD,
  Matrix4,
  Mesh
} from "three";
import type { WorldLodSettings } from "@ggez/shared";
import { vec3 } from "@ggez/shared";
import type {
  WebHammerEngineGeometryNode,
  WebHammerEngineNode,
  WebHammerExportGeometry,
  WebHammerExportGeometryLod
} from "../types";
import type { WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources } from "./types";
import { createThreeMaterial } from "./scene-material";
import { composeGeometryInstanceMatrix } from "./scene-utils";
import { resolveConfiguredSceneLodLevels } from "../loader/lod-config";

export async function createInstancedGeometryObject(
  geometry: WebHammerExportGeometry,
  sourceNode: WebHammerEngineGeometryNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof import("@ggez/shared").resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  lodLevel?: WebHammerExportGeometryLod
) {
  const group = new Group();
  const pivot = sourceNode.transform.pivot ?? vec3(0, 0, 0);

  for (const primitive of geometry.primitives) {
    const primitiveGeometry = new BufferGeometry();
    primitiveGeometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
    primitiveGeometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

    if (primitive.uvs.length > 0) {
      primitiveGeometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
    }

    (primitive.blendLayers ?? (primitive.blend ? [primitive.blend] : [])).forEach((layer, layerIndex) => {
      if (layer.weights.length) {
        primitiveGeometry.setAttribute(`whBlendWeight${layerIndex}`, new Float32BufferAttribute(layer.weights, 1));
      }
    });

    primitiveGeometry.setIndex(primitive.indices);
    primitiveGeometry.computeBoundingBox();
    primitiveGeometry.computeBoundingSphere();

    const material = await createThreeMaterial(
      primitive.material,
      primitive.blendLayers ?? (primitive.blend ? [primitive.blend] : undefined),
      resources,
      options,
    );
    const mesh = new InstancedMesh(primitiveGeometry, material, instances.length);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.frustumCulled = false;
    mesh.name = `${sourceNode.name}:${lodLevel?.level ?? "high"}:${primitive.material.name}:instanced`;
    mesh.userData.webHammer = {
      instanceNodeIds: instances.map((instance) => instance.id),
      lodLevel: lodLevel?.level ?? "high",
      materialId: primitive.material.id,
      sourceNodeId: sourceNode.id
    };

    instances.forEach((instance, index) => {
      const worldTransform = sceneGraph.nodeWorldTransforms.get(instance.id) ?? instance.transform;
      mesh.setMatrixAt(index, composeGeometryInstanceMatrix(worldTransform, pivot));
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  group.name = `${sourceNode.name}:instances`;
  group.userData.webHammer = {
    instanceNodeIds: instances.map((instance) => instance.id),
    sourceNodeId: sourceNode.id
  };
  return group;
}

export async function createInstancedObjectForGeometryNode(
  sourceNode: WebHammerEngineGeometryNode,
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof import("@ggez/shared").resolveSceneGraph>,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const baseGroup = await createInstancedGeometryObject(sourceNode.geometry, sourceNode, instances, sceneGraph, resources, options);
  const configuredLevels = resolveConfiguredSceneLodLevels(options.lod, worldLodSettings);

  if (!configuredLevels?.length || !sourceNode.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${sourceNode.name}:InstancingLOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of sourceNode.lods) {
    const levelGroup = await createInstancedGeometryObject(
      level.geometry,
      sourceNode,
      instances,
      sceneGraph,
      resources,
      options,
      level
    );
    const distance = configuredLevels.find((entry) => entry.level === level.level)?.distance;

    if (typeof distance === "number") {
      lod.addLevel(levelGroup, distance);
    }
  }

  lod.userData.webHammer = {
    instanceNodeIds: instances.map((instance) => instance.id),
    levelOrder: ["high", ...(sourceNode.lods ?? []).map((level) => level.level)],
    sourceNodeId: sourceNode.id
  };
  return lod;
}
