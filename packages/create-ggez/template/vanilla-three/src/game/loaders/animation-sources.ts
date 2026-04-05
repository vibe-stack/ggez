import type { AnimationClipAsset, RigDefinition } from "@ggez/anim-core";
import { loadClipsFromArtifact, loadRigFromArtifact, parseAnimationArtifactJson, parseClipDataBinary } from "@ggez/anim-exporter";
import { parseAnimationBundle, type AnimationArtifact, type AnimationBundle } from "@ggez/anim-schema";
import { createClipAssetFromThreeClip, createRigFromSkeleton } from "@ggez/anim-three";
import type { AnimationClip, Object3D, Skeleton } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const fbxLoader = new FBXLoader();

type LoadedAnimationSource = {
  animations: AnimationClip[];
  root: Object3D;
};

type RuntimeModuleLoader = () => Promise<unknown>;

export type RuntimeAnimationBundleSource = {
  load: () => Promise<RuntimeAnimationBundle>;
  preload?: () => Promise<void>;
};

export type GameAnimationBundleDefinition = {
  id: string;
  source: RuntimeAnimationBundleSource;
  title?: string;
};

export type LoadedRuntimeAnimationCharacter = {
  rig: RigDefinition;
  root: Object3D;
  skeleton: Skeleton;
  sourceUrl: string;
};

export type RuntimeAnimationBundle = {
  artifact: AnimationArtifact;
  manifest: AnimationBundle;
  rig: RigDefinition | undefined;
  resolveAssetUrl: (path: string) => string;
  loadCharacterAsset: () => Promise<LoadedRuntimeAnimationCharacter | undefined>;
  loadClipAssetsById: (skeleton: Skeleton) => Promise<Record<string, AnimationClipAsset>>;
  loadClipAssetsByName: (skeleton: Skeleton) => Promise<Record<string, AnimationClipAsset>>;
  loadGraphClipAssets: (skeleton: Skeleton) => Promise<AnimationClipAsset[]>;
  preloadAssets: () => Promise<void>;
};

export function defineGameAnimationBundle(definition: GameAnimationBundleDefinition) {
  return definition;
}

export function createPublicRuntimeAnimationSource(manifestUrl: string): RuntimeAnimationBundleSource {
  return createCachedRuntimeAnimationSource(async () => {
    const response = await fetch(manifestUrl);

    if (!response.ok) {
      throw new Error(`Failed to load runtime animation bundle from ${manifestUrl}`);
    }

    const manifest = rewriteRuntimeAnimationBundleAssetUrls(
      parseAnimationBundle(await response.json()),
      (path) => absolutizeRuntimeUrl(path, manifestUrl)
    );
    const artifactUrl = absolutizeRuntimeUrl(manifest.artifact, manifestUrl);
    const artifactResponse = await fetch(artifactUrl);

    if (!artifactResponse.ok) {
      throw new Error(`Failed to load animation artifact from ${artifactUrl}`);
    }

    return createRuntimeAnimationBundle({
      artifact: parseAnimationArtifactJson(await artifactResponse.text()),
      manifest,
      resolveAssetUrl: (path) => absolutizeRuntimeUrl(path, manifestUrl)
    });
  });
}

export function createBundledRuntimeAnimationSource(options: {
  artifactText: string;
  assetUrls: Record<string, string>;
  manifestText: string;
}): RuntimeAnimationBundleSource {
  const assetUrls = normalizeBundledAnimationAssetUrls(options.assetUrls);

  return createCachedRuntimeAnimationSource(async () => {
    const resolveAssetUrl = (path: string) => {
      const normalizedPath = normalizeRelativeRuntimePath(path);
      return assetUrls[normalizedPath] ?? path;
    };

    return createRuntimeAnimationBundle({
      artifact: parseAnimationArtifactJson(options.artifactText),
      manifest: rewriteRuntimeAnimationBundleAssetUrls(parseAnimationBundle(JSON.parse(options.manifestText)), resolveAssetUrl),
      resolveAssetUrl
    });
  });
}

export function createColocatedRuntimeAnimationSource(options: {
  artifactLoader: RuntimeModuleLoader;
  assetUrlLoaders?: Record<string, RuntimeModuleLoader>;
  manifestLoader: RuntimeModuleLoader;
}): RuntimeAnimationBundleSource {
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

  return createCachedRuntimeAnimationSource(async () => {
    const [manifestValue, artifactText, assetUrls] = await Promise.all([
      options.manifestLoader(),
      expectString(await options.artifactLoader(), "runtime animation artifact"),
      loadAssetUrls()
    ]);

    const resolveAssetUrl = (path: string) => {
      const normalizedPath = normalizeRelativeRuntimePath(path);
      return assetUrls[normalizedPath] ?? path;
    };

    return createRuntimeAnimationBundle({
      artifact: parseAnimationArtifactJson(artifactText),
      manifest: rewriteRuntimeAnimationBundleAssetUrls(parseAnimationBundleManifest(manifestValue), resolveAssetUrl),
      resolveAssetUrl
    });
  });
}

export function normalizeBundledAnimationAssetUrls(assetUrls: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(assetUrls).map(([key, value]) => [normalizeRelativeRuntimePath(key), value])
  );
}

function createCachedRuntimeAnimationSource(
  loadBundle: () => Promise<RuntimeAnimationBundle>
): RuntimeAnimationBundleSource {
  let pendingBundle: Promise<RuntimeAnimationBundle> | undefined;

  const loadSharedBundle = () => {
    if (!pendingBundle) {
      pendingBundle = loadBundle().catch((error) => {
        pendingBundle = undefined;
        throw error;
      });
    }

    return pendingBundle;
  };

  return {
    load() {
      return loadSharedBundle();
    },
    async preload() {
      await loadSharedBundle();
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

  return normalizeBundledAnimationAssetUrls(Object.fromEntries(entries));
}

function createRuntimeAnimationBundle(input: {
  artifact: AnimationArtifact;
  manifest: AnimationBundle;
  resolveAssetUrl: (path: string) => string;
}): RuntimeAnimationBundle {
  const rig = loadRigFromArtifact(input.artifact);
  const artifactClipsById = new Map(loadClipsFromArtifact(input.artifact).map((clip) => [clip.id, clip]));
  const animationSourceCache = new Map<string, Promise<LoadedAnimationSource>>();
  let pendingEmbeddedClipAssets: Promise<Record<string, AnimationClipAsset>> | undefined;
  let pendingCharacterAsset: Promise<LoadedRuntimeAnimationCharacter | undefined> | undefined;

  const loadEmbeddedClipAssets = () => {
    if (!input.manifest.clipData) {
      return Promise.resolve({} as Record<string, AnimationClipAsset>);
    }

    if (!pendingEmbeddedClipAssets) {
      pendingEmbeddedClipAssets = (async () => {
        const clipDataUrl = resolveRuntimeAssetPath(input.manifest.clipData!, input.resolveAssetUrl);
        const response = await fetch(clipDataUrl);

        if (!response.ok) {
          throw new Error(`Failed to load runtime clip data from ${clipDataUrl}`);
        }

        const clips = parseClipDataBinary(new Uint8Array(await response.arrayBuffer()));
        return Object.fromEntries(clips.map((clip) => [clip.id, clip]));
      })().catch((error) => {
        pendingEmbeddedClipAssets = undefined;
        throw error;
      });
    }

    return pendingEmbeddedClipAssets;
  };

  const loadAnimationSourceCached = (assetUrl: string) => {
    let pending = animationSourceCache.get(assetUrl);

    if (!pending) {
      pending = loadAnimationSource(assetUrl).catch((error) => {
        animationSourceCache.delete(assetUrl);
        throw error;
      });
      animationSourceCache.set(assetUrl, pending);
    }

    return pending;
  };

  const externalAssetUrls = new Set<string>();

  if (input.manifest.characterAsset) {
    externalAssetUrls.add(resolveRuntimeAssetPath(input.manifest.characterAsset, input.resolveAssetUrl));
  }

  input.manifest.clips.forEach((clipEntry) => {
    if (clipEntry.asset) {
      externalAssetUrls.add(resolveRuntimeAssetPath(clipEntry.asset, input.resolveAssetUrl));
    }
  });

  input.manifest.equipment?.items.forEach((item) => {
    if (item.asset) {
      externalAssetUrls.add(resolveRuntimeAssetPath(item.asset, input.resolveAssetUrl));
    }
  });

  return {
    artifact: input.artifact,
    manifest: input.manifest,
    rig,
    resolveAssetUrl(path: string) {
      return resolveRuntimeAssetPath(path, input.resolveAssetUrl);
    },
    async loadCharacterAsset() {
      if (!input.manifest.characterAsset) {
        return undefined;
      }

      if (!pendingCharacterAsset) {
        pendingCharacterAsset = (async () => {
          const sourceUrl = resolveRuntimeAssetPath(input.manifest.characterAsset!, input.resolveAssetUrl);
          const source = await loadAnimationSourceCached(sourceUrl);
          const skeleton = findPrimarySkeleton(source.root);

          if (!skeleton) {
            throw new Error(`Animation character asset ${sourceUrl} does not contain a skinned skeleton.`);
          }

          return {
            rig: createRigFromSkeleton(skeleton),
            root: source.root,
            skeleton,
            sourceUrl
          };
        })().catch((error) => {
          pendingCharacterAsset = undefined;
          throw error;
        });
      }

      return pendingCharacterAsset;
    },
    async loadClipAssetsById(skeleton: Skeleton) {
      const embeddedClipsById = artifactClipsById.size > 0 ? {} as Record<string, AnimationClipAsset> : await loadEmbeddedClipAssets();
      const entries = await Promise.all(
        input.manifest.clips.map(async (clipEntry) => {
          const artifactClip = artifactClipsById.get(clipEntry.id);

          if (artifactClip) {
            return [clipEntry.id, artifactClip] as const;
          }

          const embeddedClip = embeddedClipsById[clipEntry.id];
          if (embeddedClip) {
            return [clipEntry.id, embeddedClip] as const;
          }

          if (!clipEntry.asset) {
            throw new Error(`Animation bundle clip ${clipEntry.id} is missing both embedded artifact data and an external asset path.`);
          }

          const assetUrl = resolveRuntimeAssetPath(clipEntry.asset, input.resolveAssetUrl);
          const source = await loadAnimationSourceCached(assetUrl);
          const clip = resolveAnimationClipFromSource(source.animations, clipEntry.name, clipEntry.id, assetUrl);
          const asset = createClipAssetFromThreeClip(clip, skeleton);

          return [
            clipEntry.id,
            {
              ...asset,
              duration: clipEntry.duration,
              id: clipEntry.id,
              name: clipEntry.name
            }
          ] as const;
        })
      );

      return Object.fromEntries(entries);
    },
    async loadClipAssetsByName(skeleton: Skeleton) {
      const clipsById = await this.loadClipAssetsById(skeleton);

      return Object.fromEntries(input.manifest.clips.map((clipEntry) => [clipEntry.name, clipsById[clipEntry.id]]));
    },
    async loadGraphClipAssets(skeleton: Skeleton) {
      const clipsById = await this.loadClipAssetsById(skeleton);

      return input.artifact.graph.clipSlots.map((clipSlot) => {
        const clip = clipsById[clipSlot.id];

        if (!clip) {
          throw new Error(`Animation bundle is missing clip asset data for slot ${clipSlot.id}.`);
        }

        return clip;
      });
    },
    async preloadAssets() {
      await Promise.all([
        ...Array.from(externalAssetUrls, (assetUrl) => loadAnimationSourceCached(assetUrl)),
        loadEmbeddedClipAssets()
      ]);
    }
  };
}

function rewriteRuntimeAnimationBundleAssetUrls(
  bundle: AnimationBundle,
  resolveAssetUrl: (path: string) => string
): AnimationBundle {
  const rewritten = structuredClone(bundle);

  rewritten.clips = rewritten.clips.map((clip) => ({
    ...clip,
    asset: clip.asset ? resolveRuntimeAssetPath(clip.asset, resolveAssetUrl) : undefined
  }));
  rewritten.clipAssets = Object.fromEntries(
    Object.entries(rewritten.clipAssets).map(([clipName, assetPath]) => [
      clipName,
      resolveRuntimeAssetPath(assetPath, resolveAssetUrl)
    ])
  );

  if (rewritten.characterAsset) {
    rewritten.characterAsset = resolveRuntimeAssetPath(rewritten.characterAsset, resolveAssetUrl);
  }

  if (rewritten.equipment) {
    rewritten.equipment = {
      ...rewritten.equipment,
      items: rewritten.equipment.items.map((item) => ({
        ...item,
        asset: item.asset ? resolveRuntimeAssetPath(item.asset, resolveAssetUrl) : undefined
      }))
    };
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

function getFileExtensionFromUrl(url: string) {
  const withoutHash = url.split("#", 1)[0] ?? url;
  const withoutQuery = withoutHash.split("?", 1)[0] ?? withoutHash;
  return withoutQuery.split(".").pop()?.toLowerCase() ?? "";
}

async function loadAnimationSource(url: string): Promise<LoadedAnimationSource> {
  const extension = getFileExtensionFromUrl(url);

  if (extension === "glb" || extension === "gltf") {
    const result = await gltfLoader.loadAsync(url);
    return {
      animations: result.animations,
      root: result.scene
    };
  }

  if (extension === "fbx") {
    const result = await fbxLoader.loadAsync(url);
    return {
      animations: result.animations,
      root: result
    };
  }

  throw new Error(`Unsupported runtime animation asset type .${extension || "unknown"}.`);
}

function findPrimarySkeleton(root: Object3D): Skeleton | null {
  let foundSkeleton: Skeleton | null = null;

  root.traverse((child) => {
    if (foundSkeleton) {
      return;
    }

    const candidate = child as Object3D & {
      isSkinnedMesh?: boolean;
      skeleton?: Skeleton;
    };

    if (candidate.isSkinnedMesh && candidate.skeleton) {
      foundSkeleton = candidate.skeleton;
    }
  });

  return foundSkeleton;
}

function resolveAnimationClipFromSource(
  animations: AnimationClip[],
  clipName: string,
  clipId: string,
  assetUrl: string
) {
  const matchedByName = animations.find((animation) => animation.name === clipName);

  if (matchedByName) {
    return matchedByName;
  }

  const matchedById = animations.find((animation) => animation.name === clipId);

  if (matchedById) {
    return matchedById;
  }

  if (animations.length === 1 && animations[0]) {
    return animations[0];
  }

  throw new Error(`Animation asset ${assetUrl} does not contain a clip named ${clipName}.`);
}

function parseAnimationBundleManifest(value: unknown) {
  const unwrappedValue = unwrapModuleDefault(value);

  if (typeof unwrappedValue === "string") {
    return parseAnimationBundle(JSON.parse(unwrappedValue));
  }

  if (!unwrappedValue || typeof unwrappedValue !== "object") {
    throw new Error("Expected runtime animation manifest to resolve to JSON text or an object.");
  }

  return parseAnimationBundle(unwrappedValue as AnimationBundle);
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
