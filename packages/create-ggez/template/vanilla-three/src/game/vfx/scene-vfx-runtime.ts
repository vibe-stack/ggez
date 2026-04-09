import { parseVfxRuntimeBundleZip } from "@ggez/vfx-exporter";
import type { Entity } from "@ggez/shared";
import type { CompiledVfxEffect, VfxEffectDocument } from "@ggez/vfx-schema";
import { createThreeWebGpuPreviewRuntime, type ThreeWebGpuPreviewRuntime } from "@ggez/vfx-three";
import type { PerspectiveCamera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";

type RuntimeRecord = {
  document: VfxEffectDocument;
  effect: CompiledVfxEffect;
  entity: Entity;
  runtime: ThreeWebGpuPreviewRuntime;
  urls: string[];
};

export type SceneVfxRuntime = {
  step: (deltaSeconds: number) => void;
  render: () => void;
  dispose: () => void;
};

export async function createSceneVfxRuntime(input: {
  camera: PerspectiveCamera;
  entities: Entity[];
  renderer: WebGPURenderer;
  scene: Scene;
}): Promise<SceneVfxRuntime | null> {
  const vfxEntities = input.entities.filter((entity) => entity.type === "vfx-object");

  if (vfxEntities.length === 0) {
    return null;
  }

  const loadedEntries = await Promise.all(
    vfxEntities.map(async (entity) => {
      try {
        const bundle = await loadEntityBundle(entity);

        if (!bundle) {
          return null;
        }

        const runtime = await createThreeWebGpuPreviewRuntime({
          camera: input.camera,
          onParticleCountChange: undefined,
          presentationMode: "scene-sprites",
          renderer: input.renderer,
          scene: input.scene
        });

        return {
          document: bundle.document,
          effect: bundle.effect,
          entity,
          runtime,
          urls: bundle.urls
        } satisfies RuntimeRecord;
      } catch (error) {
        console.error(`Failed to load VFX bundle for "${entity.name}" (${entity.id}).`, error);
        return null;
      }
    })
  );

  const records = loadedEntries.filter((entry): entry is RuntimeRecord => entry !== null);

  if (records.length === 0) {
    return null;
  }

  let lastNowSeconds = performance.now() / 1000;

  return {
    step(deltaSeconds) {
      lastNowSeconds = performance.now() / 1000;

      for (const record of records) {
        const document = resolveEntityPreviewOverrides(record.entity, record.document);
        const playbackRate = Math.max(0.001, document.preview.playbackRate ?? 1);

        record.runtime.update({
          compileResult: record.effect,
          document,
          isPlaying: record.entity.properties.autoplay !== false && record.entity.properties.enabled !== false,
          world: {
            position: record.entity.transform.position,
            uniformScale: resolveUniformScale(record.entity.transform.scale)
          }
        });
        record.runtime.step(deltaSeconds * playbackRate, lastNowSeconds);
      }
    },
    render() {
      for (const record of records) {
        record.runtime.renderToCurrentTexture(lastNowSeconds);
      }
    },
    dispose() {
      for (const record of records) {
        record.runtime.dispose();
        record.urls.forEach((url) => URL.revokeObjectURL(url));
      }
    }
  };
}

function resolveEntityPreviewOverrides(entity: Entity, document: VfxEffectDocument): VfxEffectDocument {
  const durationSeconds = typeof entity.properties.vfxDurationSeconds === "number"
    ? Math.max(0.1, entity.properties.vfxDurationSeconds)
    : document.preview.durationSeconds;
  const playbackRate = typeof entity.properties.vfxPlaybackRate === "number"
    ? Math.max(0.1, entity.properties.vfxPlaybackRate)
    : document.preview.playbackRate;
  const playInfinitely = typeof entity.properties.vfxLoop === "boolean"
    ? entity.properties.vfxLoop
    : !document.preview.loop;

  return {
    ...document,
    preview: {
      ...document.preview,
      durationSeconds,
      loop: !playInfinitely,
      playbackRate
    }
  };
}

function resolveUniformScale(scale: Entity["transform"]["scale"]) {
  return Math.max(0.0001, (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3);
}

function rewriteDocumentTextureBindings(document: VfxEffectDocument, assetUrls: Map<string, string>) {
  const nextDocument = structuredClone(document);

  nextDocument.emitters = nextDocument.emitters.map((emitter) => ({
    ...emitter,
    renderers: emitter.renderers.map((renderer) => ({
      ...renderer,
      parameterBindings: Object.fromEntries(
        Object.entries(renderer.parameterBindings).map(([key, value]) => [key, assetUrls.get(value) ?? value])
      )
    }))
  }));

  return nextDocument;
}

async function loadEntityBundle(entity: Entity) {
  const bundleUrl = resolveEntityBundleUrl(entity);

  if (!bundleUrl) {
    return null;
  }

  const response = await fetch(bundleUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch VFX bundle: ${bundleUrl}`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  const { artifact, bundle, document, files } = parseVfxRuntimeBundleZip(buffer);

  if (!document) {
    return null;
  }

  const assetUrls = new Map<string, string>();
  const urls: string[] = [];

  for (const asset of bundle.assets) {
    const assetBytes = files.get(`assets/${asset.path}`);

    if (!assetBytes) {
      continue;
    }

    const normalizedBytes = new Uint8Array(assetBytes.byteLength);
    normalizedBytes.set(assetBytes);
    const blob = new Blob([normalizedBytes], { type: asset.type === "texture" ? "image/png" : "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    urls.push(url);
    assetUrls.set(asset.id, url);
  }

  return {
    document: rewriteDocumentTextureBindings(document, assetUrls),
    effect: artifact.effect,
    urls
  };
}

function resolveEntityBundleUrl(entity: Entity) {
  const bundleAssetPath = typeof entity.properties.vfxBundleAssetPath === "string" ? entity.properties.vfxBundleAssetPath : "";

  if (bundleAssetPath.length > 0) {
    return bundleAssetPath;
  }

  return typeof entity.properties.vfxBundleDataUrl === "string" ? entity.properties.vfxBundleDataUrl : "";
}
