import type { SceneSkyboxSettings } from "@ggez/shared";
import type { Scene } from "three";
import type { ToneMapping } from "three";
import type { WebHammerExportMaterial, WebHammerEngineNode } from "../types";
import type { Asset } from "@ggez/shared";

export type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

export type WebHammerAssetResolverContext =
  | {
      kind: "model";
      node: Extract<WebHammerEngineNode, { kind: "model" }>;
      asset?: Asset;
      path: string;
      format: "gltf" | "obj";
    }
  | {
      kind: "texture";
      material: WebHammerExportMaterial;
      path: string;
      slot: TextureSlot;
    }
  | {
      kind: "skybox";
      path: string;
      skybox: SceneSkyboxSettings;
    };

export type WebHammerSceneLoaderOptions = {
  applyToScene?: Scene;
  applyToRenderer?: {
    toneMapping: ToneMapping;
  };
  castShadow?: boolean;
  lod?: WebHammerSceneLodOptions;
  receiveShadow?: boolean;
  resolveAssetUrl?: (context: WebHammerAssetResolverContext) => Promise<string> | string;
  /**
   * When true, materials with texture variation are created as
   * `MeshStandardNodeMaterial` (three/webgpu) with TSL-based voronoi variation
   * instead of using the WebGL `onBeforeCompile` hook. Required when the scene
   * is rendered with `WebGPURenderer`.
   */
  useNodeMaterials?: boolean;
};

export type WebHammerSceneLodOptions = {
  levels?: Array<{ distance: number; level: string }>;
  lowDistance?: number;
  midDistance?: number;
};
