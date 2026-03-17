import {
  createWebHammerEngineBundleZip as packWebHammerEngineBundle,
  externalizeWebHammerEngineScene as externalizeWebHammerEngineSceneAssets,
  parseWebHammerEngineBundleZip as unpackWebHammerEngineBundle
} from "@web-hammer/runtime-build";
import type { RuntimeBundle, WebHammerEngineBundle } from "@web-hammer/runtime-format";

export {
  buildRuntimeBundle,
  buildRuntimeScene,
  buildRuntimeWorldIndex,
  externalizeRuntimeAssets,
  packRuntimeBundle,
  unpackRuntimeBundle
} from "@web-hammer/runtime-build";

export function createThreeAssetResolver(bundle: RuntimeBundle) {
  const urlByPath = new Map<string, string>();

  return {
    dispose() {
      urlByPath.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urlByPath.clear();
    },
    resolve(path: string) {
      const existing = urlByPath.get(path);

      if (existing) {
        return existing;
      }

      const file = bundle.files.find((entry) => entry.path === path);

      if (!file) {
        return path;
      }

      const bytes = new Uint8Array(file.bytes.byteLength);
      bytes.set(file.bytes);
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: file.mimeType }));
      urlByPath.set(path, url);
      return url;
    }
  };
}

export function createWebHammerBundleAssetResolver(bundle: WebHammerEngineBundle) {
  return createThreeAssetResolver(bundle);
}

export function createWebHammerEngineBundleZip(bundle: WebHammerEngineBundle, options?: Parameters<typeof packWebHammerEngineBundle>[1]) {
  return packWebHammerEngineBundle(bundle, options);
}

export function parseWebHammerEngineBundleZip(bundleBytes: Uint8Array, options?: Parameters<typeof unpackWebHammerEngineBundle>[1]) {
  return unpackWebHammerEngineBundle(bundleBytes, options);
}

export function externalizeWebHammerEngineScene(
  scene: WebHammerEngineBundle["manifest"],
  options?: Parameters<typeof externalizeWebHammerEngineSceneAssets>[1]
) {
  return externalizeWebHammerEngineSceneAssets(scene, options);
}
