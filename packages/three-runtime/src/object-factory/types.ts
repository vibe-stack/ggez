import type { Asset, Vec3 } from "@ggez/shared";
import type { MeshStandardMaterial, Object3D, Texture } from "three";
import type { WebHammerSceneLoaderOptions } from "../loader/types";
import type { WebHammerExportMaterial, WebHammerExportModelLod } from "../types";

export type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

export type WebHammerSceneObjectFactoryOptions = Pick<
  WebHammerSceneLoaderOptions,
  "castShadow" | "lod" | "receiveShadow" | "resolveAssetUrl" | "useNodeMaterials"
>;

export type CreateNodeObjectOverrides = {
  transform?: import("@ggez/shared").Transform;
};

export type ModelReference = {
  asset?: Asset;
  assetId?: string;
  center?: Vec3;
  fallbackName: string;
  format: "gltf" | "obj";
  materialMtlText?: string;
  modelPath?: string;
  nodeId: string;
  nodeName: string;
  texturePath?: string;
};

export type RuntimeModelLevelDescriptor = {
  distance: number;
  key: "high" | WebHammerExportModelLod["level"];
  reference?: WebHammerExportModelLod;
};

export type WebHammerSceneObjectFactoryResources = {
  assetsById: Map<string, Asset>;
  materialCache: Map<string, MeshStandardMaterial>;
  modelTemplateCache: Map<string, Promise<Object3D>>;
  textureCache: Map<string, Promise<Texture>>;
};
