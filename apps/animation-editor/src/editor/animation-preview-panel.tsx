import { compileAnimationEditorDocument } from "@ggez/anim-compiler";
import { createPoseBufferFromRig, sampleClipPose } from "@ggez/anim-core";
import { createAnimatorInstance } from "@ggez/anim-runtime";
import { applyPoseBufferToSkeleton, applyPoseToSkeleton } from "@ggez/anim-three";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import type { AnimatorInstance } from "@ggez/anim-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import type { Object3D, Skeleton } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEditorStoreValue } from "./use-editor-store-value";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { findPrimarySkeleton } from "./preview-assets";
import { PropertyField, StudioSection, editorInputClassName, editorSelectClassName, sectionHintClassName } from "./workspace/shared";

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

export function AnimationPreviewPanel(props: {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
}) {
  const { store, character, importedClips } = props;
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
  const animatorRef = useRef<AnimatorInstance | null>(null);

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
    animatorRef.current = graphPreview.animator;
  }, [graphPreview.animator]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const host = mount;

    const scene = new Scene();
    scene.background = new Color("#060b09");
    const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    const grid = new GridHelper(20, 20, "#14532d", "#052e16");
    scene.add(ambient, keyLight, fillLight, grid);

    let previewObject: Object3D | null = null;
    let previewSkeleton: Skeleton | null = null;
    let directClipTime = 0;
    let disposed = false;
    const directPose = character ? createPoseBufferFromRig(character.rig) : null;

    if (character) {
      previewObject = clone(character.scene);
      previewSkeleton = findPrimarySkeleton(previewObject);

      if (previewObject) {
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

    function renderFrame() {
      if (disposed) {
        return;
      }

      const delta = clock.getDelta();

      if (previewSkeleton && character) {
        if (modeRef.current === "clip") {
          const clip = clipMap.get(selectedClipIdRef.current);
          if (clip) {
            if (isPlayingRef.current) {
              directClipTime += delta * playbackSpeedRef.current;
            }

            if (directPose) {
              sampleClipPose(clip.asset, character.rig, directClipTime, directPose, true);
              applyPoseBufferToSkeleton(directPose, previewSkeleton);
            }
          }
        } else if (animatorRef.current) {
          for (const parameter of document.parameters) {
            const value = parameterValuesRef.current[parameter.name];
            if (value !== undefined) {
              setAnimatorParameter(animatorRef.current, parameter.name, value, parameter.type);
            }
          }

          animatorRef.current.update(isPlayingRef.current ? delta * playbackSpeedRef.current : 0);
          applyPoseToSkeleton(animatorRef.current, previewSkeleton);
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

  const previewStatus =
    !character
      ? "Import a rigged GLB/FBX character to preview animation."
      : mode === "graph"
        ? graphPreview.error ?? "Compiled runtime preview is active."
        : importedClips.length === 0
          ? "Import animation clips to use raw clip preview."
          : "Raw clip preview is active.";

  return (
    <StudioSection title="Preview">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex border border-white/10 bg-black/35 p-0.5">
          <Button variant={mode === "graph" ? "secondary" : "ghost"} size="xs" onClick={() => setMode("graph")}>
            Graph
          </Button>
          <Button variant={mode === "clip" ? "secondary" : "ghost"} size="xs" onClick={() => setMode("clip")}>
            Clip
          </Button>
        </div>
        <Button variant="outline" size="xs" onClick={() => setIsPlaying((current) => !current)}>
          {isPlaying ? "Pause" : "Play"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        <PropertyField label="Speed">
          <Input
            type="number"
            min={0.1}
            max={4}
            step={0.1}
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            className={editorInputClassName}
          />
        </PropertyField>

        {mode === "clip" ? (
          <PropertyField label="Clip" className="xl:col-span-2">
            <select value={activeSelectedClipId} onChange={(event) => setSelectedClipId(event.target.value)} className={editorSelectClassName}>
              {importedClips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.name}
                </option>
              ))}
            </select>
          </PropertyField>
        ) : (
          <div className="flex items-end xl:col-span-2">
            <div className="flex h-8 w-full items-center border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-400">Runtime graph playback</div>
          </div>
        )}
      </div>

      {mode === "graph" && document.parameters.length > 0 ? (
        <div className="grid gap-2 border-t border-white/8 pt-3">
          {document.parameters.map((parameter) => (
            <PropertyField key={parameter.id} label={parameter.name}>
              {parameter.type === "bool" || parameter.type === "trigger" ? (
                <label className="flex h-8 items-center gap-2 border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-200">
                  <Checkbox
                    checked={Boolean(resolvedParameterValues[parameter.name])}
                    onCheckedChange={(checked) =>
                      setParameterValues((current) => ({
                        ...current,
                        [parameter.name]: Boolean(checked),
                      }))
                    }
                  />
                  <span>{parameter.type === "trigger" ? "Trigger armed" : "Enabled"}</span>
                </label>
              ) : (
                <Input
                  type="number"
                  value={Number(resolvedParameterValues[parameter.name] ?? 0)}
                  onChange={(event) =>
                    setParameterValues((current) => ({
                      ...current,
                      [parameter.name]: Number(event.target.value),
                    }))
                  }
                  className={editorInputClassName}
                />
              )}
            </PropertyField>
          ))}
        </div>
      ) : null}

      <div ref={mountRef} className="relative h-80 max-h-[38vh] min-h-80 overflow-hidden border border-white/10 bg-[#050608]" />

      <div className={sectionHintClassName}>{previewStatus}</div>
    </StudioSection>
  );
}
