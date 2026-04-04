import { compileAnimationEditorDocument } from "@ggez/anim-compiler";
import { copyPose, createPoseBufferFromRig, sampleClipPose } from "@ggez/anim-core";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { createAnimatorInstance } from "@ggez/anim-runtime";
import type { AnimatorInstance } from "@ggez/anim-runtime";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import { Film, LocateFixed, Pause, Play, SlidersHorizontal, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DragInput } from "@/components/ui/drag-input";
import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { applyPoseBufferToSceneBones, preparePreviewObject } from "./preview-assets";
import { useEditorStoreValue } from "./use-editor-store-value";
import { PropertyField, editorSelectClassName } from "./workspace/shared";

type PreviewMode = "graph" | "clip";

function fitCameraToObject(camera: PerspectiveCamera, controls: OrbitControls, object: Object3D): void {
  const bounds = new Box3().setFromObject(object);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.near = 0.01;
  camera.far = Math.max(1000, distance * 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function setAnimatorParameter(animator: AnimatorInstance, name: string, value: number | boolean, type: AnimationEditorDocument["parameters"][number]["type"]): void {
  if (type === "float") {
    animator.setFloat(name, Number(value));
    return;
  }

  if (type === "int") {
    animator.setInt(name, Number(value));
    return;
  }

  if (type === "bool") {
    animator.setBool(name, Boolean(value));
    return;
  }

  if (value) {
    animator.trigger(name);
  }
}

function forceBoneTranslationToBindPose(translations: Float32Array, bindTranslations: Float32Array, boneIndex: number): void {
  const offset = boneIndex * 3;
  translations[offset] = bindTranslations[offset]!;
  translations[offset + 1] = bindTranslations[offset + 1]!;
  translations[offset + 2] = bindTranslations[offset + 2]!;
}

function configureGridOpacity(grid: GridHelper, opacity: number): void {
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  materials.forEach((material) => {
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
  });
}

function updateInfiniteGrid(fineGrid: GridHelper, coarseGrid: GridHelper, anchorX: number, anchorZ: number): void {
  const fineStep = 1;
  const coarseStep = 10;
  fineGrid.position.set(Math.round(anchorX / fineStep) * fineStep, 0, Math.round(anchorZ / fineStep) * fineStep);
  coarseGrid.position.set(Math.round(anchorX / coarseStep) * coarseStep, 0.002, Math.round(anchorZ / coarseStep) * coarseStep);
}

function addBoneTranslationOffset(translations: Float32Array, boneIndex: number, x: number, y: number, z: number): void {
  const offset = boneIndex * 3;
  translations[offset] += x;
  translations[offset + 1] += y;
  translations[offset + 2] += z;
}

export function AnimationPreviewPanel(props: {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  assetStatus?: string;
  assetError?: string | null;
}) {
  const { store, character, importedClips, assetError, assetStatus } = props;
  const document = useEditorStoreValue(store, () => store.getState().document, ["document"]);
  const [mode, setMode] = useState<PreviewMode>("graph");
  const [selectedClipId, setSelectedClipId] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [parameterValues, setParameterValues] = useState<Record<string, number | boolean>>({});
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);
  const playbackSpeedRef = useRef(playbackSpeed);
  const selectedClipIdRef = useRef(selectedClipId);
  const parameterValuesRef = useRef(parameterValues);
  const pendingTriggersRef = useRef<Set<string>>(new Set());
  const animatorRef = useRef<AnimatorInstance | null>(null);
  const resetPreviewPositionRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const compileResult = useMemo(() => compileAnimationEditorDocument(document), [document]);
  const clipMap = useMemo(() => new Map(importedClips.map((clip) => [clip.id, clip])), [importedClips]);
  const activeSelectedClipId = useMemo(() => {
    if (selectedClipId && clipMap.has(selectedClipId)) {
      return selectedClipId;
    }

    return importedClips[0]?.id ?? "";
  }, [clipMap, importedClips, selectedClipId]);
  const resolvedParameterValues = useMemo(() => {
    const next: Record<string, number | boolean> = {};

    for (const parameter of document.parameters) {
      next[parameter.name] =
        parameter.name in parameterValues
          ? parameterValues[parameter.name]!
          : parameter.type === "bool" || parameter.type === "trigger"
            ? Boolean(parameter.defaultValue ?? false)
            : Number(parameter.defaultValue ?? 0);
    }

    return next;
  }, [document.parameters, parameterValues]);

  useEffect(() => {
    selectedClipIdRef.current = activeSelectedClipId;
  }, [activeSelectedClipId]);

  useEffect(() => {
    parameterValuesRef.current = resolvedParameterValues;
  }, [resolvedParameterValues]);

  const graphPreview = useMemo(() => {
    if (!character) {
      return {
        animator: null,
        error: "Import a rigged character first to preview the graph.",
      };
    }

    if (!compileResult.ok || !compileResult.graph) {
      const firstError = compileResult.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      return {
        animator: null,
        error: firstError?.message ?? "Fix compile errors before graph preview can run.",
      };
    }

    try {
      const clips = compileResult.graph.clipSlots.map((slot) => {
        const clip = clipMap.get(slot.id);
        if (!clip) {
          throw new Error(`Compiled graph references clip "${slot.id}" but no imported animation provides it.`);
        }
        return clip.asset;
      });

      return {
        animator: createAnimatorInstance({
          rig: character.rig,
          graph: compileResult.graph,
          clips,
        }),
        error: null,
      };
    } catch (error) {
      return {
        animator: null,
        error: error instanceof Error ? error.message : "Failed to create graph preview animator.",
      };
    }
  }, [character, clipMap, compileResult]);

  useEffect(() => {
    if (!character) {
      animatorRef.current = null;
      return;
    }

    if (graphPreview.animator) {
      animatorRef.current = graphPreview.animator;
      return;
    }

    if (!graphPreview.error) {
      animatorRef.current = null;
    }
  }, [character, graphPreview.animator, graphPreview.error]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const host = mount;

    const scene = new Scene();
    scene.background = new Color("#060b09");
    const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambient = new AmbientLight("#ffffff", 1.2);
    const keyLight = new DirectionalLight("#ffffff", 1.5);
    keyLight.position.set(6, 12, 8);
    const fillLight = new DirectionalLight("#7dd3fc", 0.7);
    fillLight.position.set(-4, 6, -6);
    const fineGrid = new GridHelper(240, 120, "#14532d", "#052e16");
    const coarseGrid = new GridHelper(240, 24, "#1f7a4d", "#14532d");
    configureGridOpacity(fineGrid, 0.34);
    configureGridOpacity(coarseGrid, 0.18);
    scene.add(ambient, keyLight, fillLight, fineGrid, coarseGrid);

    let previewObject: Object3D | null = null;
    let directClipTime = 0;
    let disposed = false;
    const directPose = character ? createPoseBufferFromRig(character.rig) : null;
    const graphDisplayPose = character ? createPoseBufferFromRig(character.rig) : null;

    if (character) {
      previewObject = clone(character.scene);

      if (previewObject) {
        preparePreviewObject(previewObject);
        scene.add(previewObject);
        fitCameraToObject(camera, controls, previewObject);
      }
    } else {
      camera.position.set(3, 2, 3);
      controls.update();
    }

    function resize() {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const clock = new Clock();
    let animationFrame = 0;
    let lastMode = modeRef.current;
    let lastAnimator: AnimatorInstance | null = animatorRef.current;
    let hadRootMotion = false;
    let handledResetPreviewPosition = resetPreviewPositionRef.current;
    const previewMotionOffset = new Vector3();

    function translateView(deltaX: number, deltaZ: number) {
      camera.position.x += deltaX;
      camera.position.z += deltaZ;
      controls.target.x += deltaX;
      controls.target.z += deltaZ;
      controls.update();
    }

    function resetPreviewMotion() {
      if (previewMotionOffset.x !== 0 || previewMotionOffset.z !== 0) {
        translateView(-previewMotionOffset.x, -previewMotionOffset.z);
      }

      if (!previewObject) {
        previewMotionOffset.set(0, 0, 0);
        return;
      }

      previewMotionOffset.set(0, 0, 0);
    }

    function renderFrame() {
      if (disposed) {
        return;
      }

      const delta = Math.min(clock.getDelta(), 1 / 24);
      updateInfiniteGrid(fineGrid, coarseGrid, controls.target.x, controls.target.z);

      if (resetPreviewPositionRef.current !== handledResetPreviewPosition) {
        resetPreviewMotion();
        handledResetPreviewPosition = resetPreviewPositionRef.current;
      }

      if (modeRef.current !== lastMode) {
        resetPreviewMotion();
        lastMode = modeRef.current;
        hadRootMotion = false;
      }

      if (previewObject && character) {
        if (modeRef.current === "clip") {
          resetPreviewMotion();
          const clip = clipMap.get(selectedClipIdRef.current);
          if (clip) {
            if (isPlayingRef.current) {
              directClipTime += delta * playbackSpeedRef.current;
            }

            if (directPose) {
              sampleClipPose(clip.asset, character.rig, directClipTime, directPose, true);
              applyPoseBufferToSceneBones(directPose, character.rig, previewObject);
            }
          }
        } else if (animatorRef.current) {
          if (animatorRef.current !== lastAnimator) {
            resetPreviewMotion();
            lastAnimator = animatorRef.current;
            hadRootMotion = false;
          }

          for (const parameter of document.parameters) {
            if (parameter.type === "trigger") {
              if (pendingTriggersRef.current.has(parameter.name)) {
                animatorRef.current.trigger(parameter.name);
                pendingTriggersRef.current.delete(parameter.name);
              }
              continue;
            }

            const value = parameterValuesRef.current[parameter.name];
            if (value !== undefined) {
              setAnimatorParameter(animatorRef.current, parameter.name, value, parameter.type);
            }
          }

          const hasRootMotion = animatorRef.current.graph.layers.some(
            (layer) => layer.enabled && layer.weight > 0 && layer.rootMotionMode !== "none"
          );
          if (!hasRootMotion && hadRootMotion) {
            resetPreviewMotion();
          }

          const result = animatorRef.current.update(isPlayingRef.current ? delta * playbackSpeedRef.current : 0);

          if (graphDisplayPose) {
            if (hasRootMotion) {
              const deltaX = result.rootMotion.translation[0] ?? 0;
              previewMotionOffset.y += result.rootMotion.translation[1] ?? 0;
              const deltaZ = result.rootMotion.translation[2] ?? 0;
              previewMotionOffset.x += deltaX;
              previewMotionOffset.z += deltaZ;
              translateView(deltaX, deltaZ);
            }

            copyPose(result.pose, graphDisplayPose);
            forceBoneTranslationToBindPose(
              graphDisplayPose.translations,
              animatorRef.current.rig.bindTranslations,
              animatorRef.current.rig.rootBoneIndex
            );
            if (hasRootMotion) {
              addBoneTranslationOffset(
                graphDisplayPose.translations,
                animatorRef.current.rig.rootBoneIndex,
                previewMotionOffset.x,
                previewMotionOffset.y,
                previewMotionOffset.z
              );
            }
            applyPoseBufferToSceneBones(graphDisplayPose, animatorRef.current.rig, previewObject);
            hadRootMotion = hasRootMotion;
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [character, clipMap, document.parameters]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 rounded-2xl bg-white/4 p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setMode("graph")}
            className={mode === "graph" ? "flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-[12px] font-medium text-zinc-50" : "flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] text-zinc-300 transition hover:bg-white/6"}
          >
            <Workflow className="size-3.5" />
            Graph
          </button>
          <button
            type="button"
            onClick={() => setMode("clip")}
            className={mode === "clip" ? "flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-[12px] font-medium text-zinc-50" : "flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] text-zinc-300 transition hover:bg-white/6"}
          >
            <Film className="size-3.5" />
            Clip
          </button>
        </div>
      </div>

      <div className="relative min-h-45 flex-1 overflow-hidden rounded-3xl bg-[#050608] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/8">
        <div ref={mountRef} className="absolute inset-0" />
        <Button
          variant="secondary"
          size="icon-sm"
          className="absolute top-3 right-3 z-10 rounded-full bg-black/65 text-zinc-100 shadow-lg hover:bg-black/80"
          onClick={() => setIsPlaying((current) => !current)}
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-3 left-3 z-10 h-9 rounded-full bg-black/65 px-3 text-zinc-100 shadow-lg hover:bg-black/80"
          onClick={() => {
            resetPreviewPositionRef.current += 1;
          }}
        >
          <LocateFixed className="mr-2 size-4" />
          Reset Position
        </Button>
        {/* {mode === "graph" && graphPreview.error ? (
          <div className="absolute right-3 bottom-3 z-10 max-w-[min(22rem,calc(100%-1.5rem))] rounded-2xl bg-black/70 px-3 py-2 text-[11px] leading-5 text-amber-100 ring-1 ring-amber-400/20 backdrop-blur">
            {animatorRef.current ? `Preview is running the last valid graph. ${graphPreview.error}` : graphPreview.error}
          </div>
        ) : null} */}
      </div>

      <div className="shrink-0 space-y-3">
        {assetStatus || assetError ? (
          <div className={assetError ? "rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-100" : "rounded-2xl border border-emerald-400/12 bg-emerald-500/8 px-3 py-2 text-[11px] leading-5 text-emerald-100"}>
            {assetError ?? assetStatus}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <PropertyField label="Speed">
            <DragInput value={playbackSpeed} min={0.1} max={4} step={0.05} precision={2} onChange={setPlaybackSpeed} className="w-full" />
          </PropertyField>
          {mode === "clip" ? (
            <PropertyField label="Clip">
              <select value={activeSelectedClipId} onChange={(event) => setSelectedClipId(event.target.value)} className={editorSelectClassName}>
                {importedClips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clip.name}
                  </option>
                ))}
              </select>
            </PropertyField>
          ) : (
            <PropertyField label="Mode">
              <div className="flex h-9 items-center rounded-xl bg-white/7 px-3 text-[12px] text-zinc-400">Runtime graph playback</div>
            </PropertyField>
          )}
        </div>

        {mode === "graph" && document.parameters.length > 0 ? (
          <div className="space-y-2 rounded-[22px] bg-white/4 p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
              <SlidersHorizontal className="size-3.5" />
              Parameters
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {document.parameters.map((parameter) => (
                <PropertyField key={parameter.id} label={parameter.name}>
                  {parameter.type === "trigger" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 w-full justify-start rounded-xl bg-amber-400/10 px-3 text-[12px] text-amber-100 hover:bg-amber-400/16"
                      onClick={() => {
                        pendingTriggersRef.current.add(parameter.name);
                      }}
                    >
                      Fire Trigger
                    </Button>
                  ) : parameter.type === "bool" ? (
                    <label className="flex h-9 items-center gap-2 rounded-xl bg-white/7 px-3 text-[12px] text-zinc-200">
                      <Checkbox
                        checked={Boolean(resolvedParameterValues[parameter.name])}
                        onCheckedChange={(checked) =>
                          setParameterValues((current) => ({
                            ...current,
                            [parameter.name]: Boolean(checked),
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  ) : (
                    <DragInput
                      value={Number(resolvedParameterValues[parameter.name] ?? 0)}
                      step={parameter.type === "int" ? 1 : 0.05}
                      precision={parameter.type === "int" ? 0 : 2}
                      onChange={(value) =>
                        setParameterValues((current) => ({
                          ...current,
                          [parameter.name]: value,
                        }))
                      }
                      className="w-full"
                    />
                  )}
                </PropertyField>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
