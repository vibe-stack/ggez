import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { useMemo, useRef, useState } from "react";
import type { ImportedPreviewClip } from "../preview-assets";
import { useEditorStoreValue } from "../use-editor-store-value";

export type CharacterPlaybackState = {
  mode: "graph" | "clip";
  setMode: (mode: "graph" | "clip") => void;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playbackSpeed: number;
  setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
  activeSelectedClipId: string;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string>>;
  parameterValues: Record<string, number | boolean>;
  setParameterValues: React.Dispatch<React.SetStateAction<Record<string, number | boolean>>>;
  resolvedParameterValues: Record<string, number | boolean>;
  // Mutable refs for the Three.js animation loop — updated each render
  modeRef: React.MutableRefObject<"graph" | "clip">;
  isPlayingRef: React.MutableRefObject<boolean>;
  playbackSpeedRef: React.MutableRefObject<number>;
  selectedClipIdRef: React.MutableRefObject<string>;
  parameterValuesRef: React.MutableRefObject<Record<string, number | boolean>>;
  pendingTriggersRef: React.MutableRefObject<Set<string>>;
};

export function useCharacterPlayback(
  store: AnimationEditorStore,
  importedClips: ImportedPreviewClip[]
): CharacterPlaybackState {
  const [mode, setMode] = useState<"graph" | "clip">("graph");
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [parameterValues, setParameterValues] = useState<Record<string, number | boolean>>({});

  const modeRef = useRef<"graph" | "clip">("graph");
  const isPlayingRef = useRef(true);
  const playbackSpeedRef = useRef(1);
  const selectedClipIdRef = useRef("");
  const parameterValuesRef = useRef<Record<string, number | boolean>>({});
  const pendingTriggersRef = useRef<Set<string>>(new Set());

  // Keep refs in sync with state every render (no useEffect needed)
  modeRef.current = mode;
  isPlayingRef.current = isPlaying;
  playbackSpeedRef.current = playbackSpeed;
  // parameterValuesRef is set to resolvedParameterValues below (after defaults are merged)

  const document = useEditorStoreValue(store, () => store.getState().document, ["document"]);

  const clipMap = useMemo(
    () => new Map(importedClips.map((clip) => [clip.id, clip])),
    [importedClips]
  );

  const activeSelectedClipId = useMemo(() => {
    if (selectedClipId && clipMap.has(selectedClipId)) return selectedClipId;
    return importedClips[0]?.id ?? "";
  }, [clipMap, importedClips, selectedClipId]);

  // Keep selectedClipIdRef in sync with the resolved active clip
  selectedClipIdRef.current = activeSelectedClipId;

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

  // Store RESOLVED values (with defaults filled in) so the render loop always
  // initialises the animator with the same defaults as AnimationPreviewPanel.
  parameterValuesRef.current = resolvedParameterValues;

  return {
    mode,
    setMode,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    activeSelectedClipId,
    setSelectedClipId,
    parameterValues,
    setParameterValues,
    resolvedParameterValues,
    modeRef,
    isPlayingRef,
    playbackSpeedRef,
    selectedClipIdRef,
    parameterValuesRef,
    pendingTriggersRef,
  };
}
