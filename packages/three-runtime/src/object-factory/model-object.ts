import {
  BoxGeometry,
  Group,
  LOD,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Asset } from "@ggez/shared";
import { vec3 } from "@ggez/shared";
import type { WebHammerEngineModelNode, WebHammerExportModelLod } from "../types";
import type { ModelReference, WebHammerSceneObjectFactoryOptions, WebHammerSceneObjectFactoryResources } from "./types";
import { readAssetString, readAssetVec3, resolveModelFormat, patchMtlTextureReferences } from "./scene-utils";

const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const modelTextureLoader = new TextureLoader();

export function createMissingModelFallback(asset: Asset | undefined, name = "Missing Model") {
  const previewColor = readAssetString(asset, "previewColor") ?? "#7f8ea3";
  const size = readAssetVec3(asset, "nativeSize") ?? { x: 1.4, y: 1.4, z: 1.4 };
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  const material = new MeshStandardMaterial({
    color: previewColor,
    metalness: 0.08,
    roughness: 0.72
  });
  const mesh = new Mesh(geometry, material);

  mesh.name = name;
  return mesh;
}

export async function loadObjModel(
  asset: Asset | undefined,
  resolvedPath: string,
  resolvedTexturePath?: string,
  materialMtlText?: string
) {
  const objLoader = new OBJLoader();
  const mtlText = materialMtlText ?? readAssetString(asset, "materialMtlText");

  if (mtlText) {
    const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, resolvedTexturePath), "");
    materialCreator.preload();
    objLoader.setMaterials(materialCreator);
  }

  const object = await objLoader.loadAsync(resolvedPath);

  if (!mtlText && resolvedTexturePath) {
    const texture = await loadModelTexture(resolvedTexturePath);

    object.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        child.material = new MeshStandardMaterial({
          map: texture,
          metalness: 0.12,
          roughness: 0.76
        });
      }
    });
  }

  return object;
}

export async function loadGltfModel(asset: Asset | undefined, resolvedPath: string) {
  const gltf = await gltfLoader.loadAsync(resolvedPath);
  const object = gltf.scene;
  object.userData.webHammer = {
    ...(object.userData.webHammer ?? {}),
    animations: gltf.animations,
    nativeCenter: readAssetVec3(asset, "nativeCenter")
  };
  return object;
}

export async function loadModelTexture(path: string) {
  const texture = await modelTextureLoader.loadAsync(path);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function resolveModelReference(
  node: WebHammerEngineModelNode,
  assetsById: Map<string, Asset>,
  lodLevel?: WebHammerExportModelLod
): ModelReference {
  const asset = assetsById.get(node.data.assetId);
  const modelPath = lodLevel?.path ?? asset?.path ?? node.data.path;
  const modelFormat = lodLevel?.format ?? asset?.metadata.modelFormat;

  return {
    asset,
    assetId: lodLevel?.assetId ?? asset?.id ?? node.data.assetId,
    center: readAssetVec3(asset, "nativeCenter"),
    fallbackName: `${node.name}:${lodLevel?.level ?? "high"}:fallback`,
    format: resolveModelFormat(modelFormat, modelPath),
    materialMtlText: lodLevel?.materialMtlText ?? readAssetString(asset, "materialMtlText"),
    modelPath,
    nodeId: node.id,
    nodeName: node.name,
    texturePath: lodLevel?.texturePath ?? readAssetString(asset, "texturePath")
  };
}

export async function loadModelTemplate(
  reference: ModelReference,
  options: WebHammerSceneObjectFactoryOptions,
  resources: WebHammerSceneObjectFactoryResources
) {
  if (!reference.modelPath) {
    return createMissingModelFallback(reference.asset, reference.fallbackName);
  }

  const resolvedPath = options.resolveAssetUrl
    ? await options.resolveAssetUrl({
        asset: reference.asset,
        format: reference.format,
        kind: "model",
        node: {
          data: {
            assetId: reference.assetId ?? "",
            path: reference.modelPath
          },
          id: reference.nodeId,
          kind: "model",
          name: reference.nodeName,
          transform: {
            position: vec3(0, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        },
        path: reference.modelPath
      })
    : reference.modelPath;
  const resolvedTexturePath =
    reference.texturePath && options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "texture",
          material: {
            color: "#ffffff",
            id: `material:model-texture:${reference.nodeId}`,
            metallicFactor: 0,
            name: `${reference.nodeName} Model Texture`,
            roughnessFactor: 1
          },
          path: reference.texturePath,
          slot: "baseColorTexture"
        })
      : reference.texturePath;
  const cacheKey = `${reference.format}:${resolvedPath}:${resolvedTexturePath ?? ""}:${reference.materialMtlText ?? ""}`;
  const cached = resources.modelTemplateCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = (async () => {
    try {
      const object =
        reference.format === "obj"
          ? await loadObjModel(reference.asset, resolvedPath, resolvedTexturePath, reference.materialMtlText)
          : await loadGltfModel(reference.asset, resolvedPath);
      return object;
    } catch (error) {
      console.warn(
        `Failed to load model "${reference.nodeName}" from ${resolvedPath}. Falling back to placeholder geometry.`,
        error
      );
      return createMissingModelFallback(reference.asset, reference.fallbackName);
    }
  })();

  resources.modelTemplateCache.set(cacheKey, pending);
  return pending;
}

export async function createModelObject(
  node: WebHammerEngineModelNode,
  resources: WebHammerSceneObjectFactoryResources,
  options: WebHammerSceneObjectFactoryOptions,
  lodLevel?: WebHammerExportModelLod
) {
  const template = await loadModelTemplate(resolveModelReference(node, resources.assetsById, lodLevel), options, resources);
  const clone = template.clone(true);

  clone.name = `${node.name}:${lodLevel?.level ?? "high"}`;
  clone.userData.webHammer = {
    ...(clone.userData.webHammer ?? {}),
    lodLevel: lodLevel?.level ?? "high",
    nodeId: node.id
  };
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = options.castShadow ?? true;
      child.receiveShadow = options.receiveShadow ?? true;
    }
  });

  return clone;
}
