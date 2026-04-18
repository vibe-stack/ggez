import { createSerializedModelAssetFiles, resolveModelAssetFiles } from "@ggez/shared";
import { parseRuntimeScene, type RuntimeScene } from "@ggez/runtime-format";
import type { GameSceneDefinition, RuntimeSceneSource } from "../scene";

const MATERIAL_TEXTURE_SLOTS = [
  "baseColorTexture",
  "metallicRoughnessTexture",
  "metalnessTexture",
  "normalTexture",
  "roughnessTexture"
] as const;

type RuntimeModuleLoader = () => Promise<unknown>;

const materializedAssetUrls = new Map<string, string>();

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
      materializeInlineAssetUrl(expectString(await load(), `asset url for ${path}`))
    ] as const)
  );

  return normalizeBundledAssetUrls(Object.fromEntries(entries));
}

function rewriteRuntimeSceneAssetUrls(
  scene: RuntimeScene,
  resolveAssetUrl: (path: string) => string
): RuntimeScene {
  const rewritten = structuredClone(scene);

  rewritten.assets = rewritten.assets.map((asset) => {
    const nextAsset = {
      ...asset,
      metadata: { ...asset.metadata },
      path: resolveRuntimeAssetPath(asset.path, resolveAssetUrl)
    };

    if (asset.type === "model") {
      const modelFiles = resolveModelAssetFiles(asset).map((file) => ({
        ...file,
        path: resolveRuntimeAssetPath(file.path, resolveAssetUrl),
        texturePath:
          typeof file.texturePath === "string"
            ? resolveRuntimeAssetPath(file.texturePath, resolveAssetUrl)
            : undefined
      }));

      if (modelFiles.length > 0) {
        nextAsset.metadata.modelFiles = createSerializedModelAssetFiles(modelFiles);
      }

      if (typeof nextAsset.metadata.texturePath === "string") {
        nextAsset.metadata.texturePath = resolveRuntimeAssetPath(nextAsset.metadata.texturePath, resolveAssetUrl);
      }
    }

    return nextAsset;
  });

  rewritten.materials = rewritten.materials.map((material) => rewriteRuntimeMaterialAssetUrls(material, resolveAssetUrl));

  rewritten.entities = rewritten.entities.map((entity) => {
    if (entity.type !== "vfx-object") {
      return entity;
    }

    const nextEntity = {
      ...entity,
      properties: { ...entity.properties }
    };

    for (const key of ["vfxBundleAssetPath", "vfxBundleDataUrl"] as const) {
      const value = nextEntity.properties[key];

      if (typeof value === "string") {
        nextEntity.properties[key] = resolveRuntimeAssetPath(value, resolveAssetUrl);
      }
    }

    return nextEntity;
  });

  rewritten.nodes = rewritten.nodes.map((node) => {
    if (node.kind === "brush" || node.kind === "mesh" || node.kind === "primitive") {
      return {
        ...node,
        geometry: rewriteRuntimeGeometryAssetUrls(node.geometry, resolveAssetUrl),
        lods: node.lods?.map((lod) => ({
          ...lod,
          geometry: rewriteRuntimeGeometryAssetUrls(lod.geometry, resolveAssetUrl)
        }))
      };
    }

    if (node.kind !== "model") {
      return node;
    }

    const nextNode = {
      ...node,
      data: {
        ...node.data,
        path:
          typeof node.data.path === "string"
            ? resolveRuntimeAssetPath(node.data.path, resolveAssetUrl)
            : node.data.path
      },
      lods: node.lods?.map((lod) => ({
        ...lod,
        path: resolveRuntimeAssetPath(lod.path, resolveAssetUrl),
        texturePath:
          typeof lod.texturePath === "string"
            ? resolveRuntimeAssetPath(lod.texturePath, resolveAssetUrl)
            : undefined
      }))
    };

    return nextNode;
  });

  if (rewritten.settings.world.skybox.enabled && rewritten.settings.world.skybox.source) {
    rewritten.settings.world.skybox.source = resolveRuntimeAssetPath(
      rewritten.settings.world.skybox.source,
      resolveAssetUrl
    );
  }

  return rewritten;
}

function rewriteRuntimeGeometryAssetUrls<TGeometry extends RuntimeGeometryLike>(
  geometry: TGeometry,
  resolveAssetUrl: (path: string) => string
) : TGeometry {
  return {
    ...geometry,
    primitives: geometry.primitives.map((primitive) => rewriteRuntimePrimitiveAssetUrls(primitive, resolveAssetUrl))
  } as TGeometry;
}

function rewriteRuntimePrimitiveAssetUrls<TPrimitive extends RuntimePrimitiveLike>(
  primitive: TPrimitive,
  resolveAssetUrl: (path: string) => string
) : TPrimitive {
  return {
    ...primitive,
    blend: primitive.blend
      ? {
          ...primitive.blend,
          material: rewriteRuntimeMaterialAssetUrls(primitive.blend.material, resolveAssetUrl)
        }
      : primitive.blend,
    blendLayers: primitive.blendLayers?.map((layer) => ({
      ...layer,
      material: rewriteRuntimeMaterialAssetUrls(layer.material, resolveAssetUrl)
    })),
    material: rewriteRuntimeMaterialAssetUrls(primitive.material, resolveAssetUrl)
  } as TPrimitive;
}

function rewriteRuntimeMaterialAssetUrls<T extends object>(material: T, resolveAssetUrl: (path: string) => string): T {
  const nextMaterial = { ...material } as Record<string, unknown>;

  for (const slot of MATERIAL_TEXTURE_SLOTS) {
    const value = nextMaterial[slot];

    if (typeof value === "string") {
      nextMaterial[slot] = resolveRuntimeAssetPath(value, resolveAssetUrl);
    }
  }

  return nextMaterial as T;
}

type RuntimePrimitiveLike = {
  blend?: {
    material: object;
  };
  blendLayers?: Array<{
    material: object;
  }>;
  material: object;
};

type RuntimeGeometryLike = {
  primitives: RuntimePrimitiveLike[];
};

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

function materializeInlineAssetUrl(value: string) {
  if (
    typeof window === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    !value.startsWith("data:image/svg+xml,")
  ) {
    return value;
  }

  const cached = materializedAssetUrls.get(value);

  if (cached) {
    return cached;
  }

  const commaIndex = value.indexOf(",");

  if (commaIndex < 0) {
    return value;
  }

  const encodedPayload = value.slice(commaIndex + 1);
  const svgText = decodeURIComponent(encodedPayload);
  const objectUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));

  materializedAssetUrls.set(value, objectUrl);
  return objectUrl;
}
