import { Group, Object3D } from "three";
import { resolveInstancingSourceNode, resolveSceneGraph } from "@ggez/shared";
import type { WorldLodSettings } from "@ggez/shared";
import type { WebHammerEngineGeometryNode, WebHammerEngineNode, WebHammerEngineScene } from "../types";
import type { CreateNodeObjectOverrides, WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources } from "./types";
import { applyTransform } from "./scene-utils";
import { createThreeLight } from "./scene-light";
import { createGeometryObject, createLodObjectForGeometryNode } from "./geometry-object";
import { createInstancedObjectForGeometryNode } from "./instancing-geometry";
import { createInstancedObjectForModelNode } from "./instancing-model";
import { createLazyModelObject } from "./lazy-model";

export async function createObjectForNode(
  node: WebHammerEngineNode,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings,
  overrides?: CreateNodeObjectOverrides
) {
  const anchor = new Group();
  const content = new Group();
  const transform = overrides?.transform ?? node.transform;
  const pivot = transform.pivot;

  anchor.name = node.name;
  applyTransform(anchor, transform);
  anchor.userData.webHammer = {
    data: node.data,
    hooks: node.hooks,
    id: node.id,
    kind: node.kind,
    metadata: node.metadata,
    tags: node.tags
  };

  if (pivot && node.kind !== "model") {
    content.position.set(-pivot.x, -pivot.y, -pivot.z);
  }

  anchor.add(content);

  if (node.kind === "light") {
    const light = createThreeLight(node);

    if (light) {
      content.add(light);
    }

    return anchor;
  }

  if (node.kind === "group") {
    return anchor;
  }

  if (node.kind === "instancing") {
    anchor.visible = false;
    return anchor;
  }

  if (node.kind === "model") {
    content.add(createLazyModelObject(node, resources, options, worldLodSettings));
    return anchor;
  }

  const lodObject = await createLodObjectForGeometryNode(node, resources, options, worldLodSettings);

  if (lodObject) {
    content.add(lodObject);
  }

  return anchor;
}

export async function createInstancingObjects(
  engineScene: Pick<WebHammerEngineScene, "assets" | "nodes" | "settings">,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions
) {
  const sceneGraph = resolveSceneGraph(engineScene.nodes);
  const batches = new Map<string, Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>>();

  engineScene.nodes.forEach((node) => {
    if (node.kind !== "instancing") {
      return;
    }

    const sourceNode = resolveInstancingSourceNode(engineScene.nodes, node.data.sourceNodeId);

    if (!sourceNode) {
      return;
    }

    const instances = batches.get(sourceNode.id);

    if (instances) {
      instances.push(node);
      return;
    }

    batches.set(sourceNode.id, [node]);
  });

  const objects: Object3D[] = [];

  for (const [sourceNodeId, instances] of batches) {
    const sourceNode = resolveInstancingSourceNode(engineScene.nodes, sourceNodeId);

    if (!sourceNode) {
      continue;
    }

    const exportedSourceNode = engineScene.nodes.find((node) => node.id === sourceNode.id);

    if (
      !exportedSourceNode ||
      exportedSourceNode.kind === "group" ||
      exportedSourceNode.kind === "instancing" ||
      exportedSourceNode.kind === "light"
    ) {
      continue;
    }

    const object =
      exportedSourceNode.kind === "model"
        ? await createInstancedObjectForModelNode(
            exportedSourceNode,
            instances,
            sceneGraph,
            resources,
            options,
            engineScene.settings.world.lod
          )
        : await createInstancedObjectForGeometryNode(
            exportedSourceNode,
            instances,
            sceneGraph,
            resources,
            options,
            engineScene.settings.world.lod
          );

    if (object) {
      objects.push(object);
    }
  }

  return objects;
}
