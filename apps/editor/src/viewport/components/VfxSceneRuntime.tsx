import { useFrame, useThree } from "@react-three/fiber";
import { parseVfxRuntimeBundleZip } from "@ggez/vfx-exporter";
import type { DerivedEntityMarker } from "@ggez/render-pipeline";
import { createThreeWebGpuPreviewRuntime, type ThreeWebGpuPreviewRuntime } from "@ggez/vfx-three";
import type { CompiledVfxEffect, VfxEffectDocument } from "@ggez/vfx-schema";
import { useEffect, useMemo, useRef } from "react";

type RuntimeRecord = {
  document: VfxEffectDocument;
  effect: CompiledVfxEffect;
  runtime: ThreeWebGpuPreviewRuntime;
  urls: string[];
};

function resolveEntityPreviewOverrides(entity: DerivedEntityMarker, document: VfxEffectDocument): VfxEffectDocument {
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

function resolveUniformScale(scale: DerivedEntityMarker["scale"]) {
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

async function loadEntityBundle(entity: DerivedEntityMarker) {
  const bundleDataUrl = typeof entity.properties.vfxBundleDataUrl === "string" ? entity.properties.vfxBundleDataUrl : "";

  if (!bundleDataUrl) {
    return null;
  }

  const response = await fetch(bundleDataUrl);
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

export function VfxSceneRuntime({
  entities,
  playbackActive
}: {
  entities: DerivedEntityMarker[];
  playbackActive: boolean;
}) {
  const { camera, gl, scene } = useThree();
  const runtimeRecordsRef = useRef<Map<string, RuntimeRecord>>(new Map());
  const entityMap = useMemo(() => new Map(entities.map((entity) => [entity.entityId, entity])), [entities]);
  const bundleSignature = useMemo(
    () =>
      JSON.stringify(
        entities.map((entity) => ({
          bundle: entity.properties.vfxBundleDataUrl ?? "",
          entityId: entity.entityId
        }))
      ),
    [entities]
  );

  useEffect(() => {
    let cancelled = false;
    const currentRecords = runtimeRecordsRef.current;

    const disposeAll = () => {
      currentRecords.forEach((record) => {
        record.runtime.dispose();
        record.urls.forEach((url) => URL.revokeObjectURL(url));
      });
      currentRecords.clear();
    };

    void (async () => {
      disposeAll();

      if (entities.length === 0) {
        return;
      }

      const loaded = await Promise.all(
        entities.map(async (entity) => {
          const bundle = await loadEntityBundle(entity);
          if (!bundle) {
            return null;
          }

          const runtime = await createThreeWebGpuPreviewRuntime({
            camera: camera as any,
            onParticleCountChange: undefined,
            presentationMode: "scene-sprites",
            renderer: gl as any,
            scene: scene as any
          });

          runtime.update({
            compileResult: bundle.effect,
            document: resolveEntityPreviewOverrides(entity, bundle.document),
            isPlaying: playbackActive,
            world: {
              position: entity.position,
              uniformScale: resolveUniformScale(entity.scale)
            }
          });

          return {
            entityId: entity.entityId,
            record: {
              document: bundle.document,
              effect: bundle.effect,
              runtime,
              urls: bundle.urls
            }
          };
        })
      );

      if (cancelled) {
        loaded.forEach((entry) => {
          if (!entry) {
            return;
          }

          entry.record.runtime.dispose();
          entry.record.urls.forEach((url) => URL.revokeObjectURL(url));
        });
        return;
      }

      loaded.forEach((entry) => {
        if (!entry) {
          return;
        }

        currentRecords.set(entry.entityId, entry.record);
      });
    })();

    return () => {
      cancelled = true;
      disposeAll();
    };
  }, [bundleSignature, camera, gl, scene]);

  useFrame((state, delta) => {
    const records = runtimeRecordsRef.current;

    if (records.size === 0) {
      (state.gl as any).render(state.scene, state.camera);
      return;
    }

    const nowSeconds = state.clock.elapsedTime;

    records.forEach((record, entityId) => {
      const entity = entityMap.get(entityId);
      if (!entity) {
        return;
      }

      const document = resolveEntityPreviewOverrides(entity, record.document);
      const playbackRate = Math.max(0.001, document.preview.playbackRate ?? 1);
      record.runtime.update({
        compileResult: record.effect,
        document,
        isPlaying: playbackActive && entity.properties.autoplay !== false && entity.properties.enabled !== false,
        world: {
          position: entity.position,
          uniformScale: resolveUniformScale(entity.scale)
        }
      });
      record.runtime.step(delta * playbackRate, nowSeconds);
    });

    (state.gl as any).clear?.();
    (state.gl as any).render(state.scene, state.camera);

    records.forEach((record) => {
      record.runtime.renderToCurrentTexture(nowSeconds);
    });
  }, 1);

  return null;
}