import type { Object3D } from "three";
import type { WebHammerEngineNode, WebHammerEngineScene } from "../types";
import type { CreateNodeObjectOverrides, WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources } from "./types";
import { createObjectForNode, createInstancingObjects } from "./node-object";

export type WebHammerSceneObjectFactory = {
  createInstancingObjects: () => Promise<Object3D[]>;
  createNodeObject: (node: WebHammerEngineNode, overrides?: CreateNodeObjectOverrides) => Promise<Object3D>;
};

export function createWebHammerSceneObjectFactory(
  engineScene: Pick<WebHammerEngineScene, "assets" | "nodes" | "settings">,
  options: WebHammerSceneObjectFactoryOptions = {}
): WebHammerSceneObjectFactory {
  const resources: WebHammerSceneObjectFactoryResources = {
    assetsById: new Map(engineScene.assets.map((asset) => [asset.id, asset])),
    materialCache: new Map(),
    modelTemplateCache: new Map(),
    textureCache: new Map()
  };

  return {
    createInstancingObjects: () => createInstancingObjects(engineScene, resources, options),
    createNodeObject: (node, overrides) => createObjectForNode(node, resources, options, engineScene.settings.world.lod, overrides)
  };
}

export const createThreeRuntimeObjectFactory = createWebHammerSceneObjectFactory;

export { preloadLazyRuntimeModels } from "./lazy-model";
export { extractPhysics, findPrimaryLight } from "./scene-utils";
