import {
  BoxGeometry,
  Camera,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3
} from "three";
import type { WorldLodSettings } from "@ggez/shared";
import { HIGH_MODEL_LOD_LEVEL } from "@ggez/shared";
import type { WebHammerEngineModelNode } from "../types";
import type { RuntimeModelLevelDescriptor, WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources } from "./types";
import { resolveConfiguredSceneLodLevels } from "../loader/lod-config";
import { createMissingModelFallback, createModelObject } from "./model-object";

const lazyModelRenderCarrierGeometry = new BoxGeometry(0.001, 0.001, 0.001);
const lazyModelRenderCarrierMaterial = new MeshBasicMaterial({
  color: "#000000"
});

lazyModelRenderCarrierMaterial.colorWrite = false;
lazyModelRenderCarrierMaterial.depthTest = false;
lazyModelRenderCarrierMaterial.depthWrite = false;
lazyModelRenderCarrierMaterial.transparent = true;
lazyModelRenderCarrierMaterial.opacity = 0;

export function createLazyModelObject(
  node: WebHammerEngineModelNode,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const fallback = createMissingModelFallback(resources.assetsById.get(node.data.assetId), `${node.name}:loading`);
  const descriptors = resolveRuntimeModelLevelDescriptors(node, options.lod, worldLodSettings);

  return createLazyRuntimeModelGroup({
    descriptors,
    fallback,
    name: `${node.name}:LOD`,
    onLoadLevel: (descriptor) =>
      createModelObject(
        node,
        resources,
        options,
        descriptor.reference
      ),
    resolveDistance: (camera, group) => camera.position.distanceTo(group.getWorldPosition(new Vector3()))
  });
}

export function createLazyRuntimeModelGroup(input: {
  descriptors: RuntimeModelLevelDescriptor[];
  fallback: Object3D;
  name: string;
  onLoadLevel: (descriptor: RuntimeModelLevelDescriptor) => Promise<Object3D>;
  resolveDistance: (camera: Camera, group: Group) => number;
}) {
  const group = new Group();
  const loaded = new Map<string, Object3D>();
  const loading = new Map<string, Promise<void>>();
  const handleBeforeRender: Object3D["onBeforeRender"] = (_renderer, _scene, camera) => {
    if (!(camera instanceof Camera) || input.descriptors.length === 0) {
      return;
    }

    const desiredDescriptor = resolveDesiredRuntimeModelLevelDescriptor(input.descriptors, input.resolveDistance(camera, group));

    ensureLoaded(desiredDescriptor);
    updateVisibleLevel(desiredDescriptor.key);
  };

  group.name = input.name;
  group.add(input.fallback);

  if (!attachLazyModelRenderHook(input.fallback, handleBeforeRender)) {
    group.add(createLazyModelRenderCarrier(handleBeforeRender));
  }

  const updateVisibleLevel = (desiredKey: RuntimeModelLevelDescriptor["key"]) => {
    const preferred = loaded.get(desiredKey);
    const visible = preferred ?? loaded.values().next().value;

    loaded.forEach((object, key) => {
      object.visible = key === desiredKey || object === visible;
    });
    input.fallback.visible = !visible;
  };

  const ensureLoaded = (descriptor: RuntimeModelLevelDescriptor) => {
    if (loaded.has(descriptor.key) || loading.has(descriptor.key)) {
      return;
    }

    const pending = input
      .onLoadLevel(descriptor)
      .then((object) => {
        object.visible = false;
        attachLazyModelRenderHook(object, handleBeforeRender);
        group.add(object);
        loaded.set(descriptor.key, object);
      })
      .finally(() => {
        loading.delete(descriptor.key);
      });

    loading.set(descriptor.key, pending);
  };

  const preloadLevel = async (preferredLevel = "high") => {
    const descriptor = input.descriptors.find((candidate) => candidate.key === preferredLevel) ?? input.descriptors[0];

    if (!descriptor) {
      return;
    }

    ensureLoaded(descriptor);
    await loading.get(descriptor.key);
    updateVisibleLevel(descriptor.key);
  };

  const preloadAll = async () => {
    input.descriptors.forEach((descriptor) => {
      ensureLoaded(descriptor);
    });

    await Promise.all(Array.from(loading.values()));
  };

  group.userData.webHammer = {
    ...(group.userData.webHammer ?? {}),
    ...((input.fallback.userData.webHammer as Record<string, unknown> | undefined) ?? {}),
    lazyRuntimeModel: {
      preloadAll,
      preloadLevel
    },
    levelOrder: input.descriptors.map((descriptor) => descriptor.key)
  };

  return group;
}

export async function preloadLazyRuntimeModels(root: Object3D, preferredLevel = HIGH_MODEL_LOD_LEVEL) {
  const tasks: Promise<void>[] = [];

  root.traverse((object) => {
    const lazyRuntimeModel = (object.userData.webHammer as {
      lazyRuntimeModel?: { preloadLevel?: (level?: string) => Promise<void> };
    } | undefined)?.lazyRuntimeModel;

    if (lazyRuntimeModel?.preloadLevel) {
      tasks.push(lazyRuntimeModel.preloadLevel(preferredLevel));
    }
  });

  await Promise.all(tasks);
}

export function resolveRuntimeModelLevelDescriptors(
  node: WebHammerEngineModelNode,
  lod: WebHammerSceneObjectFactoryOptions["lod"],
  worldLodSettings: WorldLodSettings
) {
  const descriptors: RuntimeModelLevelDescriptor[] = [
    {
      distance: 0,
      key: HIGH_MODEL_LOD_LEVEL
    }
  ];

  const configuredLevels = resolveConfiguredSceneLodLevels(lod, worldLodSettings);

  if (!configuredLevels?.length) {
    return descriptors;
  }

  configuredLevels.forEach((configuredLevel) => {
    const reference = node.lods?.find((level) => level.level === configuredLevel.level);

    if (!reference) {
      return;
    }

    descriptors.push({
      distance: configuredLevel.distance,
      key: configuredLevel.level,
      reference
    });
  });

  return descriptors;
}

export function resolveDesiredRuntimeModelLevelDescriptor(
  descriptors: RuntimeModelLevelDescriptor[],
  distance: number
) {
  let resolved = descriptors[0]!;

  for (const descriptor of descriptors) {
    if (distance >= descriptor.distance) {
      resolved = descriptor;
    }
  }

  return resolved;
}

export function attachLazyModelRenderHook(object: Object3D, hook: Object3D["onBeforeRender"]) {
  let attached = false;

  object.traverse((child) => {
    if (!(child instanceof Mesh) && !(child instanceof InstancedMesh)) {
      return;
    }

    child.onBeforeRender = hook;
    attached = true;
  });

  return attached;
}

export function createLazyModelRenderCarrier(hook: Object3D["onBeforeRender"]) {
  const carrier = new Mesh(lazyModelRenderCarrierGeometry, lazyModelRenderCarrierMaterial);

  carrier.name = "LazyModelRenderCarrier";
  carrier.frustumCulled = false;
  carrier.onBeforeRender = hook;
  carrier.renderOrder = -1;

  return carrier;
}
