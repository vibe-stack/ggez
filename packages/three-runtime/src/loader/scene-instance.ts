import type { PropPhysics } from "@ggez/shared";
import { resolveSceneGraph } from "@ggez/shared";
import {
  Box3,
  BufferGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Texture,
  Vector3
} from "three";
import {
  getRuntimeAudioDescriptors,
  parseRuntimeScene,
  type RuntimeAudioDescriptor,
  type RuntimeScene
} from "@ggez/runtime-format";
import { createWebHammerSceneObjectFactory, extractPhysics, findPrimaryLight } from "../object-factory/index";
import type { WebHammerEngineScene } from "../types";
import type { WebHammerSceneLoaderOptions } from "./types";
import { applyWebHammerWorldSettings, createWorldAmbientLight } from "./world-settings";
import { fetchWebHammerEngineScene } from "./scene-fetch";

export type ThreeRuntimeSceneInstance = {
  audioDescriptors: RuntimeAudioDescriptor[];
  dispose: () => void;
  entities: WebHammerEngineScene["entities"];
  lights: Object3D[];
  nodesById: Map<string, Object3D>;
  physicsDescriptors: Array<{
    nodeId: string;
    object: Object3D;
    physics: PropPhysics;
  }>;
  root: Group;
  scene: WebHammerEngineScene;
};

export type WebHammerLoadedScene = ThreeRuntimeSceneInstance & {
  nodes: ThreeRuntimeSceneInstance["nodesById"];
  physicsNodes: ThreeRuntimeSceneInstance["physicsDescriptors"];
};

const _runtimeSceneBounds = new Box3();
const _runtimeSceneBoundsCenter = new Vector3();
const _runtimeSceneBoundsSize = new Vector3();
const DEFAULT_DIRECTIONAL_LIGHT_OFFSET = new Vector3(28, 42, 24);
const DEFAULT_DIRECTIONAL_SHADOW_RADIUS = 72;
const DEFAULT_DIRECTIONAL_SHADOW_FAR = 180;

export async function createThreeRuntimeSceneInstance(
  input: RuntimeScene | string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<ThreeRuntimeSceneInstance> {
  const engineScene = typeof input === "string" ? parseRuntimeScene(input) : parseRuntimeScene(JSON.stringify(input));
  const root = new Group();
  const nodesById = new Map<string, Object3D>();
  const lights: Object3D[] = [];
  const physicsDescriptors: ThreeRuntimeSceneInstance["physicsDescriptors"] = [];
  const runtimeNodesById = new Map(engineScene.nodes.map((node) => [node.id, node]));
  const sceneGraph = resolveSceneGraph(engineScene.nodes, engineScene.entities);
  const objectFactory = createWebHammerSceneObjectFactory(engineScene, options);
  const createdObjects = await Promise.all(
    engineScene.nodes.map(async (node) => [node.id, await objectFactory.createNodeObject(node)] as const)
  );
  const attachedNodeIds = new Set<string>();
  const attachStack = new Set<string>();

  root.name = "Web Hammer Scene";
  root.userData.webHammer = {
    metadata: engineScene.metadata,
    settings: engineScene.settings
  };

  if (options.applyToScene) {
    await applyWebHammerWorldSettings(options.applyToScene, engineScene, options);
  }

  const worldAmbient = createWorldAmbientLight(engineScene);

  if (worldAmbient) {
    root.add(worldAmbient);
    lights.push(worldAmbient);
  }

  createdObjects.forEach(([nodeId, object]) => {
    nodesById.set(nodeId, object);
  });

  const attachNode = (nodeId: string) => {
    if (attachedNodeIds.has(nodeId)) {
      return;
    }

    const node = runtimeNodesById.get(nodeId);
    const object = nodesById.get(nodeId);

    if (!node || !object) {
      return;
    }

    if (attachStack.has(nodeId)) {
      root.add(object);
      attachedNodeIds.add(nodeId);
      return;
    }

    attachStack.add(nodeId);

    const parentObject =
      node.parentId && node.parentId !== node.id
        ? nodesById.get(node.parentId)
        : undefined;

    if (parentObject && !attachStack.has(node.parentId!)) {
      attachNode(node.parentId!);
      parentObject.add(object);
    } else {
      root.add(object);
    }

    attachStack.delete(nodeId);
    attachedNodeIds.add(nodeId);
  };

  for (const node of engineScene.nodes) {
    attachNode(node.id);
  }

  const instancingObjects = await objectFactory.createInstancingObjects();

  instancingObjects.forEach((object) => {
    root.add(object);
  });

  for (const node of engineScene.nodes) {
    const object = nodesById.get(node.id);

    if (!object) {
      continue;
    }

    const light = findPrimaryLight(object);

    if (light) {
      lights.push(light);
    }

    const physics = extractPhysics(node);

    if (physics?.enabled) {
      physicsDescriptors.push({
        nodeId: node.id,
        object,
        physics
      });
    }
  }

  configureRuntimeLightShadows(root, lights);

  return {
    audioDescriptors: getRuntimeAudioDescriptors(engineScene),
    dispose() {
      disposeThreeRuntimeSceneInstance(root);
    },
    entities: engineScene.entities.map((entity) => ({
      ...entity,
      transform: sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform
    })),
    lights,
    nodesById,
    physicsDescriptors,
    root,
    scene: engineScene
  };
}

function configureRuntimeLightShadows(root: Object3D, lights: Object3D[]) {
  root.updateMatrixWorld(true);
  _runtimeSceneBounds.setFromObject(root);

  const hasSceneBounds = !_runtimeSceneBounds.isEmpty();

  if (hasSceneBounds) {
    _runtimeSceneBounds.getCenter(_runtimeSceneBoundsCenter);
    _runtimeSceneBounds.getSize(_runtimeSceneBoundsSize);
  } else {
    _runtimeSceneBoundsCenter.set(0, 0, 0);
    _runtimeSceneBoundsSize.set(0, 0, 0);
  }

  const shadowRadius = hasSceneBounds
    ? Math.max(
        DEFAULT_DIRECTIONAL_SHADOW_RADIUS,
        _runtimeSceneBoundsSize.x * 0.75,
        _runtimeSceneBoundsSize.z * 0.75,
        _runtimeSceneBoundsSize.y
      )
    : DEFAULT_DIRECTIONAL_SHADOW_RADIUS;
  const shadowFar = hasSceneBounds
    ? Math.max(DEFAULT_DIRECTIONAL_SHADOW_FAR, _runtimeSceneBoundsSize.length() * 2.5)
    : DEFAULT_DIRECTIONAL_SHADOW_FAR;

  lights.forEach((object) => {
    if (!(object instanceof DirectionalLight) || !object.castShadow) {
      return;
    }

    if (hasSceneBounds && object.parent && object.target.parent) {
      const localLightPosition = object.parent.worldToLocal(
        _runtimeSceneBoundsCenter.clone().add(DEFAULT_DIRECTIONAL_LIGHT_OFFSET)
      );
      const localTarget = object.target.parent.worldToLocal(_runtimeSceneBoundsCenter.clone());

      object.position.copy(localLightPosition);
      object.target.position.copy(localTarget);
      object.updateMatrixWorld(true);
      object.target.updateMatrixWorld(true);
    }

    const shadowCamera = object.shadow.camera as OrthographicCamera;

    shadowCamera.near = 0.5;
    shadowCamera.far = shadowFar;
    shadowCamera.left = -shadowRadius;
    shadowCamera.right = shadowRadius;
    shadowCamera.top = shadowRadius;
    shadowCamera.bottom = -shadowRadius;
    shadowCamera.updateProjectionMatrix();

    const biasScale = shadowRadius / DEFAULT_DIRECTIONAL_SHADOW_RADIUS;
    object.shadow.bias = -0.00015 * biasScale;
    object.shadow.normalBias = 0.03 * biasScale;
    const mapSize = Math.min(4096, Math.ceil(2048 * biasScale / 512) * 512);
    object.shadow.mapSize.width = mapSize;
    object.shadow.mapSize.height = mapSize;
  });
}

function disposeThreeRuntimeSceneInstance(root: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof InstancedMesh)) {
      return;
    }

    if (object.geometry instanceof BufferGeometry) {
      geometries.add(object.geometry);
    }

    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];

    objectMaterials.forEach((material) => {
      if (!(material instanceof MeshStandardMaterial)) {
        return;
      }

      materials.add(material);

      if (material.map) {
        textures.add(material.map);
      }

      if (material.normalMap) {
        textures.add(material.normalMap);
      }

      if (material.metalnessMap) {
        textures.add(material.metalnessMap);
      }

      if (material.roughnessMap) {
        textures.add(material.roughnessMap);
      }
    });
  });

  root.removeFromParent();
  geometries.forEach((geometry) => {
    geometry.dispose();
  });
  materials.forEach((material) => {
    material.dispose();
  });
  textures.forEach((texture) => {
    texture.dispose();
  });
}

export async function loadWebHammerEngineScene(
  input: WebHammerEngineScene | string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<WebHammerLoadedScene> {
  const instance = await createThreeRuntimeSceneInstance(input, options);

  return {
    ...instance,
    nodes: instance.nodesById,
    physicsNodes: instance.physicsDescriptors
  };
}

export async function loadWebHammerEngineSceneFromUrl(
  url: string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<WebHammerLoadedScene> {
  const scene = await fetchWebHammerEngineScene(url);
  return loadWebHammerEngineScene(scene, options);
}

export async function loadThreeRuntimeSceneInstanceFromUrl(
  url: string,
  options: WebHammerSceneLoaderOptions = {}
): Promise<ThreeRuntimeSceneInstance> {
  const scene = await fetchWebHammerEngineScene(url);
  return createThreeRuntimeSceneInstance(scene, options);
}
