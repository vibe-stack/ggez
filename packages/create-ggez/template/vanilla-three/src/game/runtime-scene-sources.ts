import { parseRuntimeScene, type RuntimeScene } from "@ggez/runtime-format";
import type { GameSceneDefinition, RuntimeSceneSource } from "./scene-types";

const MATERIAL_TEXTURE_SLOTS = ["baseColorTexture", "metallicRoughnessTexture", "normalTexture"] as const;

type RuntimeModuleLoader = () => Promise<unknown>;

export function defineGameScene(definition: GameSceneDefinition) {
  return definition;
}

export function createPublicRuntimeSceneSource(manifestUrl: string): RuntimeSceneSource {
  return createCachedRuntimeSceneSource(async () => {
    const response = await fetch(manifestUrl);

    if (!response.ok) {
      throw new Error(`Failed to load runtime scene from ${manifestUrl}`);
    }

    const scene = parseRuntimeScene(await response.text());
    return rewriteRuntimeSceneAssetUrls(scene, (path) => absolutizeRuntimeUrl(path, manifestUrl));
  });
}

export function createBundledRuntimeSceneSource(options: {
  assetUrls: Record<string, string>;
  manifestText: string;
}): RuntimeSceneSource {
  const assetUrls = normalizeBundledAssetUrls(options.assetUrls);

  return createCachedRuntimeSceneSource(async () => {
    const scene = parseRuntimeScene(options.manifestText);

    return rewriteRuntimeSceneAssetUrls(scene, (path) => {
      const normalizedPath = normalizeRelativeRuntimePath(path);
      return assetUrls[normalizedPath] ?? path;
    });
  });
}

export function createColocatedRuntimeSceneSource(options: {
  assetUrlLoaders?: Record<string, RuntimeModuleLoader>;
  manifestLoader: RuntimeModuleLoader;
}): RuntimeSceneSource {
  let pendingAssetUrls: Promise<Record<string, string>> | undefined;

  const loadAssetUrls = () => {
    if (!pendingAssetUrls) {
      pendingAssetUrls = loadBundledAssetUrls(options.assetUrlLoaders).catch((error) => {
        pendingAssetUrls = undefined;
        throw error;
      });
    }

    return pendingAssetUrls;
  };

  return createCachedRuntimeSceneSource(async () => {
    const manifestText = expectString(await options.manifestLoader(), "runtime scene manifest");
    const assetUrls = await loadAssetUrls();
    const scene = parseRuntimeScene(manifestText);

    return rewriteRuntimeSceneAssetUrls(scene, (path) => {
      const normalizedPath = normalizeRelativeRuntimePath(path);
      return assetUrls[normalizedPath] ?? path;
    });
  });
}

export function normalizeBundledAssetUrls(assetUrls: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(assetUrls).map(([key, value]) => [normalizeRelativeRuntimePath(key), value])
  );
}

function createCachedRuntimeSceneSource(loadScene: () => Promise<RuntimeScene>): RuntimeSceneSource {
  let pendingScene: Promise<RuntimeScene> | undefined;

  const loadSharedScene = () => {
    if (!pendingScene) {
      pendingScene = loadScene().catch((error) => {
        pendingScene = undefined;
        throw error;
      });
    }

    return pendingScene;
  };

  return {
    async load() {
      return structuredClone(await loadSharedScene());
    },
    async preload() {
      await loadSharedScene();
    }
  };
}

async function loadBundledAssetUrls(assetUrlLoaders: Record<string, RuntimeModuleLoader> | undefined) {
  if (!assetUrlLoaders) {
    return {};
  }

  const entries = await Promise.all(
    Object.entries(assetUrlLoaders).map(async ([path, load]) => [
      path,
      expectString(await load(), `asset url for ${path}`)
    ] as const)
  );

  return normalizeBundledAssetUrls(Object.fromEntries(entries));
}

function rewriteRuntimeSceneAssetUrls(
  scene: RuntimeScene,
  resolveAssetUrl: (path: string) => string
): RuntimeScene {
  const rewritten = structuredClone(scene);

  rewritten.assets = rewritten.assets.map((asset) => ({
    ...asset,
    path: resolveRuntimeAssetPath(asset.path, resolveAssetUrl)
  }));

  rewritten.materials = rewritten.materials.map((material) => {
    const nextMaterial = { ...material };

    for (const slot of MATERIAL_TEXTURE_SLOTS) {
      const value = nextMaterial[slot];

      if (typeof value === "string") {
        nextMaterial[slot] = resolveRuntimeAssetPath(value, resolveAssetUrl);
      }
    }

    return nextMaterial;
  });

  if (rewritten.settings.world.skybox.enabled && rewritten.settings.world.skybox.source) {
    rewritten.settings.world.skybox.source = resolveRuntimeAssetPath(
      rewritten.settings.world.skybox.source,
      resolveAssetUrl
    );
  }

  return rewritten;
}

function resolveRuntimeAssetPath(path: string, resolveAssetUrl: (path: string) => string) {
  if (!path || isAbsoluteRuntimeUrl(path)) {
    return path;
  }

  return resolveAssetUrl(path);
}

function absolutizeRuntimeUrl(path: string, manifestUrl: string) {
  if (isAbsoluteRuntimeUrl(path)) {
    return path;
  }

  return new URL(path, new URL(manifestUrl, window.location.origin)).toString();
}

function isAbsoluteRuntimeUrl(path: string) {
  return /^[a-z]+:/i.test(path) || path.startsWith("//") || path.startsWith("/");
}

function normalizeRelativeRuntimePath(path: string) {
  return path.replace(/^\.\//, "");
}

function expectString(value: unknown, label: string) {
  const unwrappedValue = unwrapModuleDefault(value);

  if (typeof unwrappedValue !== "string") {
    throw new Error(`Expected ${label} to resolve to a string.`);
  }

  return unwrappedValue;
}

function unwrapModuleDefault(value: unknown) {
  if (value && typeof value === "object" && "default" in value) {
    return value.default;
  }

  return value;
}
