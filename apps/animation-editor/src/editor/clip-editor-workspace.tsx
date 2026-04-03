import type { AnimationClipAsset, AnimationTrack, RigDefinition } from "@ggez/anim-core";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Clock3, Film, Pause, Play, Plus, Scissors, Square, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ClipCurveEditor } from "./clip-curve-editor";
import { ClipGhostClipSelect } from "./clip-ghost-clip-select";
import { ClipKeyframeInspector } from "./clip-keyframe-inspector";
import { ClipPreviewViewport } from "./clip-preview-viewport";
import { ClipTrackList } from "./clip-track-list";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { PropertyField, StudioSection } from "./workspace/shared";

type ChannelKind = "translation" | "rotation" | "scale";

type ChannelConfig = {
  kind: ChannelKind;
  label: string;
  components: readonly string[];
  timesKey: "translationTimes" | "rotationTimes" | "scaleTimes";
  valuesKey: "translationValues" | "rotationValues" | "scaleValues";
  chipClassName: string;
  markerClassName: string;
};

type ClipChannelRow = {
  id: string;
  boneIndex: number;
  boneName: string;
  channel: ChannelKind;
  label: string;
  componentIndex: number;
  componentLabel: string;
  componentCount: number;
  chipClassName: string;
  markerClassName: string;
  times: Float32Array;
  values: Float32Array;
};

type ClipBoneSection = {
  id: string;
  boneIndex: number;
  boneName: string;
  rows: ClipChannelRow[];
};

type SelectedKeyframe = {
  rowId: string;
  keyIndex: number;
};

type ChannelFrame = {
  id: string;
  time: number;
  values: number[];
};

type ValueRange = {
  min: number;
  max: number;
};

type DragState = {
  rowId: string;
  selectedIndices: number[];
  startClientX: number;
  startClientY: number;
  startFrames: ChannelFrame[];
  minDeltaTime: number;
  maxDeltaTime: number;
  valueRange: ValueRange;
};

type SelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type SelectionBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const DEFAULT_PIXELS_PER_SECOND = 140;
const MIN_PIXELS_PER_SECOND = 40;
const MAX_PIXELS_PER_SECOND = 24000;
const CHANNEL_EPSILON = 1e-4;
const MIN_CLIP_DURATION = 0.05;
const CURVE_PADDING_X = 28;
const CURVE_PADDING_Y = 24;
const CURVE_HEIGHT = 320;
const CURVE_AUTO_PAN_EDGE = 40;
const CURVE_AUTO_PAN_SPEED = 0.085;

const CHANNEL_CONFIGS: readonly ChannelConfig[] = [
  {
    kind: "translation",
    label: "Translation",
    components: ["X", "Y", "Z"],
    timesKey: "translationTimes",
    valuesKey: "translationValues",
    chipClassName: "bg-sky-400/12 text-sky-200 ring-sky-300/20",
    markerClassName: "border-sky-200/70 bg-sky-300/95 shadow-[0_0_0_4px_rgba(56,189,248,0.12)]",
  },
  {
    kind: "rotation",
    label: "Quaternion Rotation",
    components: ["X", "Y", "Z", "W"],
    timesKey: "rotationTimes",
    valuesKey: "rotationValues",
    chipClassName: "bg-violet-400/12 text-violet-200 ring-violet-300/20",
    markerClassName: "border-violet-200/70 bg-violet-300/95 shadow-[0_0_0_4px_rgba(167,139,250,0.12)]",
  },
  {
    kind: "scale",
    label: "Scale",
    components: ["X", "Y", "Z"],
    timesKey: "scaleTimes",
    valuesKey: "scaleValues",
    chipClassName: "bg-amber-400/12 text-amber-200 ring-amber-300/20",
    markerClassName: "border-amber-100/80 bg-amber-200/95 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]",
  },
];

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    Boolean(element?.isContentEditable)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getChannelConfig(channel: ChannelKind): ChannelConfig {
  return CHANNEL_CONFIGS.find((entry) => entry.kind === channel) ?? CHANNEL_CONFIGS[0]!;
}

function cloneTrack(track: AnimationTrack): AnimationTrack {
  return {
    boneIndex: track.boneIndex,
    translationTimes: track.translationTimes ? new Float32Array(track.translationTimes) : undefined,
    translationValues: track.translationValues ? new Float32Array(track.translationValues) : undefined,
    rotationTimes: track.rotationTimes ? new Float32Array(track.rotationTimes) : undefined,
    rotationValues: track.rotationValues ? new Float32Array(track.rotationValues) : undefined,
    scaleTimes: track.scaleTimes ? new Float32Array(track.scaleTimes) : undefined,
    scaleValues: track.scaleValues ? new Float32Array(track.scaleValues) : undefined,
  };
}

function cloneClipAsset(clip: AnimationClipAsset): AnimationClipAsset {
  return {
    ...clip,
    tracks: clip.tracks.map(cloneTrack),
  };
}

function hasTrackData(track: AnimationTrack): boolean {
  return Boolean(
    (track.translationTimes?.length ?? 0) > 0 ||
      (track.rotationTimes?.length ?? 0) > 0 ||
      (track.scaleTimes?.length ?? 0) > 0
  );
}

function readChannelData(track: AnimationTrack, channel: ChannelKind): { times: Float32Array; values: Float32Array } | null {
  const config = getChannelConfig(channel);
  const times = track[config.timesKey];
  const values = track[config.valuesKey];

  if (!(times instanceof Float32Array) || !(values instanceof Float32Array) || times.length === 0 || values.length === 0) {
    return null;
  }

  return { times, values };
}

function buildChannelFrames(row: ClipChannelRow): ChannelFrame[] {
  return Array.from({ length: row.times.length }, (_, keyIndex) => ({
    id: `frame-${keyIndex}`,
    time: row.times[keyIndex]!,
    values: Array.from({ length: row.componentCount }, (_, componentIndex) => row.values[keyIndex * row.componentCount + componentIndex]!),
  }));
}

function writeChannelFrames(track: AnimationTrack, channel: ChannelKind, frames: ChannelFrame[]) {
  const config = getChannelConfig(channel);
  const componentCount = config.components.length;

  if (frames.length === 0) {
    track[config.timesKey] = undefined;
    track[config.valuesKey] = undefined;
    return;
  }

  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * componentCount);

  frames.forEach((frame, keyIndex) => {
    times[keyIndex] = frame.time;
    frame.values.forEach((value, componentIndex) => {
      values[keyIndex * componentCount + componentIndex] = value;
    });
  });

  track[config.timesKey] = times;
  track[config.valuesKey] = values;
}

function findFrameIndex(times: Float32Array, time: number): number {
  if (times.length <= 1) {
    return 0;
  }

  let low = 0;
  let high = times.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid]!;
    if (value <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, Math.min(times.length - 2, high));
}

function normalizeQuaternion(values: number[]): number[] {
  const length = Math.hypot(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0) || 1;
  return values.map((value) => value / length);
}

function sampleFrameValues(row: ClipChannelRow, time: number): number[] {
  if (row.times.length === 1) {
    return Array.from({ length: row.componentCount }, (_, componentIndex) => row.values[componentIndex]!);
  }

  const firstTime = row.times[0]!;
  const lastTime = row.times[row.times.length - 1]!;
  if (time <= firstTime) {
    return Array.from({ length: row.componentCount }, (_, componentIndex) => row.values[componentIndex]!);
  }
  if (time >= lastTime) {
    const baseOffset = (row.times.length - 1) * row.componentCount;
    return Array.from({ length: row.componentCount }, (_, componentIndex) => row.values[baseOffset + componentIndex]!);
  }

  const index = findFrameIndex(row.times, time);
  const nextIndex = Math.min(index + 1, row.times.length - 1);
  const startTime = row.times[index]!;
  const endTime = row.times[nextIndex]!;
  const alpha = endTime === startTime ? 0 : (time - startTime) / (endTime - startTime);
  const startOffset = index * row.componentCount;
  const endOffset = nextIndex * row.componentCount;
  const values = Array.from({ length: row.componentCount }, (_, componentIndex) =>
    row.values[startOffset + componentIndex]! + (row.values[endOffset + componentIndex]! - row.values[startOffset + componentIndex]!) * alpha
  );

  return row.channel === "rotation" ? normalizeQuaternion(values) : values;
}

function buildClipSections(clip: ImportedPreviewClip, rig: RigDefinition | null): ClipBoneSection[] {
  const sections: ClipBoneSection[] = [];
  const sortedTracks = [...clip.asset.tracks].sort((left, right) => left.boneIndex - right.boneIndex);

  sortedTracks.forEach((track) => {
    const rows = CHANNEL_CONFIGS.flatMap((config) => {
      const channelData = readChannelData(track, config.kind);
      if (!channelData) {
        return [];
      }

      return [
        ...config.components.map(
          (componentLabel, componentIndex) =>
            ({
              id: `${track.boneIndex}:${config.kind}:${componentIndex}`,
              boneIndex: track.boneIndex,
              boneName: rig?.boneNames[track.boneIndex] ?? `Bone ${track.boneIndex}`,
              channel: config.kind,
              label: config.label,
              componentIndex,
              componentLabel,
              componentCount: config.components.length,
              chipClassName: config.chipClassName,
              markerClassName: config.markerClassName,
              times: channelData.times,
              values: channelData.values,
            }) satisfies ClipChannelRow
        ),
      ];
    });

    if (rows.length === 0) {
      return;
    }

    sections.push({
      id: `bone-${track.boneIndex}`,
      boneIndex: track.boneIndex,
      boneName: rig?.boneNames[track.boneIndex] ?? `Bone ${track.boneIndex}`,
      rows,
    });
  });

  return sections;
}

function formatDuration(seconds: number): string {
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)}s`;
}

function buildRulerTimes(duration: number, pixelsPerSecond: number): number[] {
  const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
  const step = steps.find((candidate) => candidate * pixelsPerSecond >= 72) ?? steps[steps.length - 1]!;
  const count = Math.ceil(duration / step);
  return Array.from({ length: count + 1 }, (_, index) => Number((index * step).toFixed(4)));
}

function getTimelineWidth(duration: number, pixelsPerSecond: number): number {
  return Math.max(720, CURVE_PADDING_X * 2 + Math.max(duration, 1) * pixelsPerSecond);
}

function findTrack(clip: AnimationClipAsset, boneIndex: number): AnimationTrack | undefined {
  return clip.tracks.find((track) => track.boneIndex === boneIndex);
}

function getChannelDisplayBaseline(row: ClipChannelRow, rig: RigDefinition | null): number {
  if (!rig || row.channel !== "translation") {
    return 0;
  }

  return rig.bindTranslations[row.boneIndex * 3 + row.componentIndex] ?? 0;
}

function toDisplayChannelValue(value: number, row: ClipChannelRow, rig: RigDefinition | null): number {
  return value - getChannelDisplayBaseline(row, rig);
}

function toStoredChannelValue(value: number, row: ClipChannelRow, rig: RigDefinition | null): number {
  return value + getChannelDisplayBaseline(row, rig);
}

function getFrameComponentValue(frame: ChannelFrame, row: ClipChannelRow, rig: RigDefinition | null): number {
  return toDisplayChannelValue(frame.values[row.componentIndex] ?? 0, row, rig);
}

function getCurveValueRange(row: ClipChannelRow | null, frames: ChannelFrame[], rig: RigDefinition | null): ValueRange {
  if (!row || frames.length === 0) {
    return { min: -1, max: 1 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    const value = getFrameComponentValue(frame, row, rig);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -1, max: 1 };
  }

  if (Math.abs(max - min) < 1e-5) {
    const padding = Math.max(Math.abs(max) * 0.2, 0.5);
    return {
      min: min - padding,
      max: max + padding,
    };
  }

  const padding = (max - min) * 0.15;
  return {
    min: min - padding,
    max: max + padding,
  };
}

function getVisibleValueRange(center: number, span: number): ValueRange {
  const halfSpan = Math.max(span, 1e-4) * 0.5;
  return {
    min: center - halfSpan,
    max: center + halfSpan,
  };
}

function projectCurveValueToY(value: number, valueRange: ValueRange): number {
  const normalized = (value - valueRange.min) / Math.max(valueRange.max - valueRange.min, 1e-5);
  return CURVE_HEIGHT - CURVE_PADDING_Y - normalized * (CURVE_HEIGHT - CURVE_PADDING_Y * 2);
}

function normalizeSelectionBox(box: SelectionBox): SelectionBounds {
  return {
    left: Math.min(box.startX, box.currentX),
    right: Math.max(box.startX, box.currentX),
    top: Math.min(box.startY, box.currentY),
    bottom: Math.max(box.startY, box.currentY),
  };
}

function buildMatchingClipRow(clip: ImportedPreviewClip, row: ClipChannelRow): ClipChannelRow | null {
  const track = findTrack(clip.asset, row.boneIndex);
  if (!track) {
    return null;
  }

  const channelData = readChannelData(track, row.channel);
  if (!channelData) {
    return null;
  }

  return {
    ...row,
    times: channelData.times,
    values: channelData.values,
  };
}

export function ClipEditorWorkspace(props: {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  selectedClipId: string;
  assetStatus?: string;
  assetError?: string | null;
  onImportAnimations: () => void;
  onDropAnimationFiles: (files: File[]) => void;
  onSelectClip: (clipId: string) => void;
  onUpdateClip: (clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) => void;
  onDeleteClip: (clipId: string) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState<SelectedKeyframe | null>(null);
  const [selectedKeyIndices, setSelectedKeyIndices] = useState<number[]>([]);
  const [ghostClipId, setGhostClipId] = useState<string | null>(null);
  const [isClipPanelDragging, setIsClipPanelDragging] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [dragPreviewFrames, setDragPreviewFrames] = useState<ChannelFrame[] | null>(null);
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const curveSvgRef = useRef<SVGSVGElement | null>(null);
  const rulerContentRef = useRef<HTMLDivElement | null>(null);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const playheadTimeTextRef = useRef<HTMLDivElement | null>(null);
  const playheadTimeRef = useRef(0);
  const pixelsPerSecondRef = useRef(DEFAULT_PIXELS_PER_SECOND);
  const dragStateRef = useRef<DragState | null>(null);
  const dragPreviewFramesRef = useRef<ChannelFrame[] | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const activeClip = useMemo(
    () => props.importedClips.find((clip) => clip.id === props.selectedClipId) ?? props.importedClips[0] ?? null,
    [props.importedClips, props.selectedClipId]
  );
  const clipSections = useMemo(
    () => (activeClip ? buildClipSections(activeClip, props.character?.rig ?? null) : []),
    [activeClip, props.character?.rig]
  );
  const channelRows = useMemo(() => clipSections.flatMap((section) => section.rows), [clipSections]);
  const rowById = useMemo(() => new Map(channelRows.map((row) => [row.id, row])), [channelRows]);
  const selectedRow = selectedRowId ? rowById.get(selectedRowId) ?? null : null;
  const activeRig = props.character?.rig ?? null;
  const timelineDuration = activeClip ? Math.max(activeClip.duration, 1) : 1;
  const timelineWidth = getTimelineWidth(timelineDuration, pixelsPerSecond);
  const rulerTimes = useMemo(() => buildRulerTimes(timelineDuration, pixelsPerSecond), [timelineDuration, pixelsPerSecond]);
  const baseSelectedRowFrames = useMemo(() => (selectedRow ? buildChannelFrames(selectedRow) : []), [selectedRow]);
  const selectedRowFrames = dragPreviewFrames ?? baseSelectedRowFrames;
  const baseValueRange = useMemo(() => getCurveValueRange(selectedRow, baseSelectedRowFrames, activeRig), [activeRig, selectedRow, baseSelectedRowFrames]);
  const initialViewportCenter = (baseValueRange.min + baseValueRange.max) * 0.5;
  const initialViewportSpan = Math.max(baseValueRange.max - baseValueRange.min, 1);
  const [yViewportCenter, setYViewportCenter] = useState(initialViewportCenter);
  const [yViewportSpan, setYViewportSpan] = useState(initialViewportSpan);
  const yViewportCenterRef = useRef(initialViewportCenter);
  const yViewportSpanRef = useRef(initialViewportSpan);
  const selectedValueRange = useMemo(() => getVisibleValueRange(yViewportCenter, yViewportSpan), [yViewportCenter, yViewportSpan]);
  const selectedValueRangeRef = useRef(selectedValueRange);
  const selectionBounds = useMemo(() => (selectionBox ? normalizeSelectionBox(selectionBox) : null), [selectionBox]);
  const ghostClipOptions = useMemo(
    () =>
      props.importedClips
        .filter((clip) => clip.id !== activeClip?.id)
        .map((clip) => ({
          id: clip.id,
          name: clip.name,
          source: clip.source,
        })),
    [activeClip?.id, props.importedClips]
  );
  const ghostClip = useMemo(
    () => (ghostClipId ? props.importedClips.find((clip) => clip.id === ghostClipId) ?? null : null),
    [ghostClipId, props.importedClips]
  );
  const ghostRow = useMemo(
    () => (ghostClip && selectedRow ? buildMatchingClipRow(ghostClip, selectedRow) : null),
    [ghostClip, selectedRow]
  );
  const ghostRowFrames = useMemo(() => (ghostRow ? buildChannelFrames(ghostRow) : []), [ghostRow]);
  const selectedCurvePath = useMemo(() => {
    if (!selectedRow || selectedRowFrames.length === 0) {
      return "";
    }

    return selectedRowFrames
      .map((frame, index) => {
        const x = CURVE_PADDING_X + frame.time * pixelsPerSecond;
        const value = getFrameComponentValue(frame, selectedRow, activeRig);
        const y = projectCurveValueToY(value, selectedValueRange);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [activeRig, pixelsPerSecond, selectedRow, selectedRowFrames, selectedValueRange]);
  const curvePoints = useMemo(() => {
    if (!selectedRow) {
      return [];
    }

    return selectedRowFrames.map((frame, keyIndex) => {
      const value = getFrameComponentValue(frame, selectedRow, activeRig);
      const y = projectCurveValueToY(value, selectedValueRange);
      return {
        id: `${selectedRow.id}:${keyIndex}:${frame.time}`,
        time: frame.time,
        value: y,
        isSelected: selectedKeyIndices.includes(keyIndex),
      };
    });
  }, [activeRig, selectedKeyIndices, selectedRow, selectedRowFrames, selectedValueRange]);
  const ghostCurvePath = useMemo(() => {
    if (!ghostRow || ghostRowFrames.length === 0) {
      return "";
    }

    return ghostRowFrames
      .map((frame, index) => {
        const x = CURVE_PADDING_X + frame.time * pixelsPerSecond;
        const value = getFrameComponentValue(frame, ghostRow, activeRig);
        const y = projectCurveValueToY(value, selectedValueRange);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [activeRig, ghostRow, ghostRowFrames, pixelsPerSecond, selectedValueRange]);
  const ghostCurvePoints = useMemo(() => {
    if (!ghostRow) {
      return [];
    }

    return ghostRowFrames.map((frame, keyIndex) => {
      const value = getFrameComponentValue(frame, ghostRow, activeRig);
      const y = projectCurveValueToY(value, selectedValueRange);
      return {
        id: `${ghostRow.id}:${ghostClip?.id ?? "ghost"}:${keyIndex}:${frame.time}`,
        time: frame.time,
        value: y,
      };
    });
  }, [activeRig, ghostClip?.id, ghostRow, ghostRowFrames, selectedValueRange]);

  const selectedFrameInfo = useMemo(() => {
    if (!activeClip || !selectedKeyframe) {
      return null;
    }

    const row = rowById.get(selectedKeyframe.rowId);
    if (!row) {
      return null;
    }

    const frames = row.id === selectedRow?.id ? selectedRowFrames : buildChannelFrames(row);
    const frame = frames[selectedKeyframe.keyIndex];
    if (!frame) {
      return null;
    }

    return {
      row,
      frame,
    };
  }, [activeClip, rowById, selectedKeyframe, selectedRow?.id, selectedRowFrames]);

  const handleSelectTrackRow = useCallback((rowId: string) => {
    setSelectedRowId(rowId);
    setSelectedKeyframe(null);
    setSelectedKeyIndices([]);
    setDragPreviewFrames(null);
    setSelectionBox(null);
  }, []);

  function setPlayhead(nextTime: number, syncState = true) {
    const clampedTime = clamp(nextTime, 0, activeClip?.duration ?? 0);
    playheadTimeRef.current = clampedTime;
    if (playheadLineRef.current) {
      playheadLineRef.current.style.transform = `translateX(${CURVE_PADDING_X + clampedTime * pixelsPerSecondRef.current}px)`;
    }
    if (playheadTimeTextRef.current) {
      playheadTimeTextRef.current.textContent = `${formatDuration(clampedTime)} / ${formatDuration(activeClip?.duration ?? 0)}`;
    }
    if (syncState) {
      setPlayheadTime(clampedTime);
    }
  }

  useEffect(() => {
    if (activeClip && props.selectedClipId !== activeClip.id) {
      props.onSelectClip(activeClip.id);
    }
  }, [activeClip, props]);

  useEffect(() => {
    if (!ghostClipId) {
      return;
    }

    if (ghostClipId === activeClip?.id || !props.importedClips.some((clip) => clip.id === ghostClipId)) {
      setGhostClipId(null);
    }
  }, [activeClip?.id, ghostClipId, props.importedClips]);

  useEffect(() => {
    if (!channelRows.length) {
      setSelectedRowId(null);
      setSelectedKeyframe(null);
      setSelectedKeyIndices([]);
      setDragPreviewFrames(null);
      dragPreviewFramesRef.current = null;
      return;
    }

    if (!selectedRowId || !rowById.has(selectedRowId)) {
      setSelectedRowId(channelRows[0]!.id);
      setSelectedKeyframe(null);
      setSelectedKeyIndices([]);
      setDragPreviewFrames(null);
      dragPreviewFramesRef.current = null;
    }
  }, [channelRows, rowById, selectedRowId]);

  useEffect(() => {
    if (!activeClip) {
      setPlayhead(0);
      return;
    }

    setPlayhead(playheadTimeRef.current, true);
  }, [activeClip]);

  useEffect(() => {
    setDragPreviewFrames(null);
    dragPreviewFramesRef.current = null;
    setSelectionBox(null);
    selectionBoxRef.current = null;
  }, [selectedRowId]);

  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
    if (playheadLineRef.current) {
      playheadLineRef.current.style.transform = `translateX(${CURVE_PADDING_X + playheadTimeRef.current * pixelsPerSecond}px)`;
    }
  }, [pixelsPerSecond]);

  useEffect(() => {
    if (!selectedRow) {
      return;
    }

    const nextCenter = (baseValueRange.min + baseValueRange.max) * 0.5;
    const nextSpan = Math.max(baseValueRange.max - baseValueRange.min, 1);
    setYViewportCenter(nextCenter);
    setYViewportSpan(nextSpan);
    yViewportCenterRef.current = nextCenter;
    yViewportSpanRef.current = nextSpan;
    selectedValueRangeRef.current = getVisibleValueRange(nextCenter, nextSpan);
  }, [activeClip?.id, selectedRow?.id]);

  useEffect(() => {
    yViewportCenterRef.current = yViewportCenter;
  }, [yViewportCenter]);

  useEffect(() => {
    yViewportSpanRef.current = yViewportSpan;
  }, [yViewportSpan]);

  useEffect(() => {
    selectedValueRangeRef.current = selectedValueRange;
  }, [selectedValueRange]);

  useEffect(() => {
    if (!activeClip || !isPlaying) {
      return;
    }

    let frameId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 1 / 24);
      lastTime = now;
      const next = activeClip.duration <= 0 ? 0 : (playheadTimeRef.current + deltaSeconds * playbackSpeed) % activeClip.duration;
      setPlayhead(next, false);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeClip, isPlaying, playbackSpeed]);

  useEffect(() => {
    if (!isPlaying) {
      setPlayheadTime(playheadTimeRef.current);
    }
  }, [isPlaying]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== " " || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsPlaying((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function updateActiveClip(
    updater: (clip: ImportedPreviewClip) => ImportedPreviewClip,
    options?: { nextSelection?: SelectedKeyframe | null; nextSelectedIndices?: number[]; nextPlayhead?: number }
  ) {
    if (!activeClip) {
      return;
    }

    props.onUpdateClip(activeClip.id, updater);

    if (options && "nextSelection" in options) {
      setSelectedKeyframe(options.nextSelection ?? null);
      setSelectedRowId(options.nextSelection?.rowId ?? selectedRowId);
      setSelectedKeyIndices(options.nextSelectedIndices ?? (options.nextSelection ? [options.nextSelection.keyIndex] : []));
    } else if (options?.nextSelectedIndices) {
      setSelectedKeyIndices(options.nextSelectedIndices);
    }
    if (options?.nextPlayhead !== undefined) {
      setPlayhead(options.nextPlayhead);
    }
    setDragPreviewFrames(null);
    dragPreviewFramesRef.current = null;
  }

  function withRowMutation(
    row: ClipChannelRow,
    mutateFrames: (frames: ChannelFrame[]) => {
      frames: ChannelFrame[];
      nextSelection?: SelectedKeyframe | null;
      nextSelectedIndices?: number[];
      nextPlayhead?: number;
    }
  ) {
    const baseFrames = buildChannelFrames(row);
    const mutationResult = mutateFrames(baseFrames);

    updateActiveClip(
      (clip) => {
        const asset = cloneClipAsset(clip.asset);
        const track = findTrack(asset, row.boneIndex);
        if (!track) {
          return clip;
        }

        const nextTrack = cloneTrack(track);
        writeChannelFrames(nextTrack, row.channel, mutationResult.frames);

        const nextAsset: AnimationClipAsset = {
          ...asset,
          tracks: asset.tracks
          .map((entry) => (entry.boneIndex === row.boneIndex ? nextTrack : entry))
          .filter(hasTrackData),
        };

        return {
          ...clip,
          duration: nextAsset.duration,
          asset: nextAsset,
          reference: {
            ...clip.reference,
            duration: nextAsset.duration,
          },
        };
      },
      mutationResult
    );
  }

  function updateSelectedKeyframeTime(nextTime: number) {
    if (!selectedFrameInfo || !activeClip) {
      return;
    }

    withRowMutation(selectedFrameInfo.row, (frames) => {
      const target = frames[selectedKeyframe!.keyIndex];
      if (!target) {
        return { frames };
      }

      const previousTime = frames[selectedKeyframe!.keyIndex - 1]?.time ?? 0;
      const nextNeighborTime = frames[selectedKeyframe!.keyIndex + 1]?.time ?? activeClip.duration;
      const clampedTime = clamp(
        nextTime,
        selectedKeyframe!.keyIndex > 0 ? previousTime + CHANNEL_EPSILON : 0,
        selectedKeyframe!.keyIndex < frames.length - 1 ? nextNeighborTime - CHANNEL_EPSILON : activeClip.duration
      );
      const nextFrames = frames.map((frame, index) => (index === selectedKeyframe!.keyIndex ? { ...frame, time: clampedTime } : frame));

      return {
        frames: nextFrames,
        nextSelection: { rowId: selectedFrameInfo.row.id, keyIndex: selectedKeyframe!.keyIndex },
        nextPlayhead: clampedTime,
      };
    });
  }

  function updateSelectedKeyframeValue(nextValue: number) {
    if (!selectedFrameInfo) {
      return;
    }

    withRowMutation(selectedFrameInfo.row, (frames) => {
      const target = frames[selectedKeyframe!.keyIndex];
      if (!target) {
        return { frames };
      }

      const nextValues = [...target.values];
      nextValues[selectedFrameInfo.row.componentIndex] = toStoredChannelValue(nextValue, selectedFrameInfo.row, activeRig);
      const normalizedValues = selectedFrameInfo.row.channel === "rotation" ? normalizeQuaternion(nextValues) : nextValues;

      return {
        frames: frames.map((frame) => (frame.id === target.id ? { ...frame, values: normalizedValues } : frame)),
        nextSelection: selectedKeyframe,
      };
    });
  }

  function updateSelectedKeyframePoint(nextTime: number, nextValue: number) {
    if (!selectedFrameInfo || !activeClip) {
      return;
    }

    withRowMutation(selectedFrameInfo.row, (frames) => {
      const target = frames[selectedKeyframe!.keyIndex];
      if (!target) {
        return { frames };
      }

      const previousTime = frames[selectedKeyframe!.keyIndex - 1]?.time ?? 0;
      const nextNeighborTime = frames[selectedKeyframe!.keyIndex + 1]?.time ?? activeClip.duration;
      const clampedTime = clamp(
        nextTime,
        selectedKeyframe!.keyIndex > 0 ? previousTime + CHANNEL_EPSILON : 0,
        selectedKeyframe!.keyIndex < frames.length - 1 ? nextNeighborTime - CHANNEL_EPSILON : activeClip.duration
      );

      const nextFrames = frames.map((frame, index) => {
        if (index !== selectedKeyframe!.keyIndex) {
          return frame;
        }

        const nextValues = [...frame.values];
        nextValues[selectedFrameInfo.row.componentIndex] = toStoredChannelValue(nextValue, selectedFrameInfo.row, activeRig);
        const normalizedValues = selectedFrameInfo.row.channel === "rotation" ? normalizeQuaternion(nextValues) : nextValues;

        return {
          ...frame,
          time: clampedTime,
          values: normalizedValues,
        };
      });

      return {
        frames: nextFrames,
        nextSelection: { rowId: selectedFrameInfo.row.id, keyIndex: selectedKeyframe!.keyIndex },
        nextPlayhead: clampedTime,
      };
    });
  }

  function handleAddKeyframe() {
    if (!selectedRow || !activeClip) {
      return;
    }

    const currentPlayheadTime = playheadTimeRef.current;
    const sampledValues = sampleFrameValues(selectedRow, currentPlayheadTime);
    withRowMutation(selectedRow, (frames) => {
      const existingIndex = frames.findIndex((frame) => Math.abs(frame.time - currentPlayheadTime) <= CHANNEL_EPSILON);
      if (existingIndex >= 0) {
        const nextFrames = frames.map((frame, index) => (index === existingIndex ? { ...frame, values: sampledValues } : frame));
        return {
          frames: nextFrames,
          nextSelection: { rowId: selectedRow.id, keyIndex: existingIndex },
          nextPlayhead: currentPlayheadTime,
        };
      }

      const keyedId = `frame-${Math.random().toString(36).slice(2, 10)}`;
      const nextFrames = [...frames, { id: keyedId, time: currentPlayheadTime, values: sampledValues }].sort((left, right) => left.time - right.time);
      return {
        frames: nextFrames,
        nextSelection: { rowId: selectedRow.id, keyIndex: nextFrames.findIndex((frame) => frame.id === keyedId) },
        nextPlayhead: currentPlayheadTime,
      };
    });
  }

  function handleDeleteKeyframe() {
    if (!selectedFrameInfo) {
      return;
    }

    withRowMutation(selectedFrameInfo.row, (frames) => {
      const nextFrames = frames.filter((_, index) => index !== selectedKeyframe!.keyIndex);
      const nextIndex = Math.min(selectedKeyframe!.keyIndex, nextFrames.length - 1);
      return {
        frames: nextFrames,
        nextSelection: nextIndex >= 0 ? { rowId: selectedFrameInfo.row.id, keyIndex: nextIndex } : null,
      };
    });
  }

  function handleTrimToPlayhead() {
    if (!activeClip) {
      return;
    }

    const nextDuration = clamp(playheadTimeRef.current, MIN_CLIP_DURATION, activeClip.duration);
    if (nextDuration >= activeClip.duration - CHANNEL_EPSILON) {
      return;
    }

    updateActiveClip(
      (clip) => {
        const asset = cloneClipAsset(clip.asset);
        const nextTracks = asset.tracks
          .map((track) => {
            const nextTrack = cloneTrack(track);
            CHANNEL_CONFIGS.forEach((config) => {
              const currentRow = clipSections.flatMap((section) => section.rows).find((row) => row.boneIndex === track.boneIndex && row.channel === config.kind);
              if (!currentRow) {
                return;
              }

              let frames = buildChannelFrames(currentRow).filter((frame) => frame.time <= nextDuration + CHANNEL_EPSILON);
              const hadFramesAfterCut = currentRow.times[currentRow.times.length - 1]! > nextDuration + CHANNEL_EPSILON;
              if (hadFramesAfterCut) {
                const boundaryValues = sampleFrameValues(currentRow, nextDuration);
                const existingBoundary = frames.findIndex((frame) => Math.abs(frame.time - nextDuration) <= CHANNEL_EPSILON);
                if (existingBoundary >= 0) {
                  frames[existingBoundary] = { ...frames[existingBoundary]!, values: boundaryValues, time: nextDuration };
                } else {
                  frames = [...frames, { id: "boundary", time: nextDuration, values: boundaryValues }].sort((left, right) => left.time - right.time);
                }
              }

              writeChannelFrames(nextTrack, config.kind, frames);
            });

            return nextTrack;
          })
          .filter(hasTrackData);
        const nextAsset: AnimationClipAsset = {
          ...asset,
          duration: nextDuration,
          tracks: nextTracks,
        };

        return {
          ...clip,
          duration: nextDuration,
          asset: nextAsset,
          reference: {
            ...clip.reference,
            duration: nextDuration,
          },
        };
      },
      {
        nextSelection: null,
        nextPlayhead: nextDuration,
      }
    );
  }

  function handleExtendClip() {
    if (!activeClip) {
      return;
    }

    const nextDuration = activeClip.duration + 0.25;
    updateActiveClip(
      (clip) => {
        const asset = cloneClipAsset(clip.asset);
        const previousDuration = asset.duration;
        const nextTracks = asset.tracks.map((track) => {
          const nextTrack = cloneTrack(track);
          CHANNEL_CONFIGS.forEach((config) => {
            const currentRow = clipSections.flatMap((section) => section.rows).find((row) => row.boneIndex === track.boneIndex && row.channel === config.kind);
            if (!currentRow) {
              return;
            }

            const frames = buildChannelFrames(currentRow);
            const lastFrame = frames[frames.length - 1];
            const holdValues = sampleFrameValues(currentRow, previousDuration);
            if (lastFrame && Math.abs(lastFrame.time - nextDuration) <= CHANNEL_EPSILON) {
              return;
            }

            writeChannelFrames(nextTrack, config.kind, [...frames, { id: "extended", time: nextDuration, values: holdValues }]);
          });
          return nextTrack;
        });
        const nextAsset: AnimationClipAsset = {
          ...asset,
          duration: nextDuration,
          tracks: nextTracks,
        };

        return {
          ...clip,
          duration: nextDuration,
          asset: nextAsset,
          reference: {
            ...clip.reference,
            duration: nextDuration,
          },
        };
      }
    );
  }

  function resolveTimeFromClientX(clientX: number): number {
    const scroller = timelineScrollerRef.current;
    if (!scroller || !activeClip) {
      return 0;
    }

    const rect = scroller.getBoundingClientRect();
    const contentX = scroller.scrollLeft + (clientX - rect.left);
    const time = (contentX - CURVE_PADDING_X) / pixelsPerSecondRef.current;
    return clamp(time, 0, activeClip.duration);
  }

  function handleTimelineSeek(clientX: number) {
    if (!activeClip) {
      return;
    }

    setPlayhead(resolveTimeFromClientX(clientX));
  }

  function handleValueAxisWheel(deltaY: number) {
    setYViewportSpan((current) => clamp(current * (deltaY < 0 ? 1 / 1.12 : 1.12), 1e-4, 1_000_000));
  }

  function resolveValueFromClientY(clientY: number, valueRange = selectedValueRange): number {
    const curveSvg = curveSvgRef.current;
    if (!curveSvg) {
      return 0;
    }

    const rect = curveSvg.getBoundingClientRect();
    const drawableHeight = CURVE_HEIGHT - CURVE_PADDING_Y * 2;
    const localY = clamp(clientY - rect.top - CURVE_PADDING_Y, 0, drawableHeight);
    const normalized = 1 - localY / Math.max(drawableHeight, 1);
    return valueRange.min + normalized * (valueRange.max - valueRange.min);
  }

  function beginTimelineZoom(event: ReactPointerEvent) {
    if (!activeClip || !event.metaKey) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsPlaying(false);

    const scroller = timelineScrollerRef.current;
    if (!scroller) {
      return true;
    }

    const rect = scroller.getBoundingClientRect();
    const anchorClientX = event.clientX;
    const anchorTime = resolveTimeFromClientX(anchorClientX);
    const startPixelsPerSecond = pixelsPerSecondRef.current;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - anchorClientX;
      const nextPixelsPerSecond = clamp(startPixelsPerSecond + deltaX, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND);
      pixelsPerSecondRef.current = nextPixelsPerSecond;
      setPixelsPerSecond(nextPixelsPerSecond);

      const cursorOffset = moveEvent.clientX - rect.left;
      scroller.scrollLeft = CURVE_PADDING_X + anchorTime * nextPixelsPerSecond - cursorOffset;
      if (playheadLineRef.current) {
        playheadLineRef.current.style.transform = `translateX(${CURVE_PADDING_X + playheadTimeRef.current * nextPixelsPerSecond}px)`;
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return true;
  }

  function beginBoxSelection(event: ReactPointerEvent) {
    if (!selectedRow) {
      return false;
    }

    const curveSvg = curveSvgRef.current;
    const scroller = timelineScrollerRef.current;
    if (!curveSvg) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsPlaying(false);

    const rect = curveSvg.getBoundingClientRect();
    const scrollLeft = scroller?.scrollLeft ?? 0;
    const scrollTop = scroller?.scrollTop ?? 0;
    const startX = scrollLeft + (event.clientX - rect.left);
    const startY = scrollTop + (event.clientY - rect.top);
    const initialBox: SelectionBox = {
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    };
    setSelectionBox(initialBox);
    selectionBoxRef.current = initialBox;
    const rowAtStart = selectedRow;
    const framesAtStart = selectedRowFrames;
    const rangeAtStart = selectedValueRange;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextBox: SelectionBox = {
        startX,
        startY,
        currentX: scrollLeft + (moveEvent.clientX - rect.left),
        currentY: scrollTop + (moveEvent.clientY - rect.top),
      };
      setSelectionBox(nextBox);
      selectionBoxRef.current = nextBox;
    };

    const handlePointerUp = () => {
      const box = selectionBoxRef.current ?? initialBox;
      const bounds = normalizeSelectionBox(box);
      const selectedIndices = framesAtStart.flatMap((frame, index) => {
        const x = CURVE_PADDING_X + frame.time * pixelsPerSecondRef.current;
        const y = projectCurveValueToY(getFrameComponentValue(frame, rowAtStart, activeRig), rangeAtStart);
        return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom ? [index] : [];
      });

      setSelectedKeyIndices(selectedIndices);
      setSelectedKeyframe(selectedIndices.length > 0 ? { rowId: rowAtStart.id, keyIndex: selectedIndices[0]! } : null);
      setSelectionBox(null);
      selectionBoxRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return true;
  }

  function beginKeyframeDrag(event: ReactPointerEvent, row: ClipChannelRow, keyIndex: number) {
    if (!activeClip || selectedRow?.id !== row.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedRowId(row.id);
    setSelectedKeyframe({ rowId: row.id, keyIndex });
    setIsPlaying(false);
    setPlayhead(selectedRowFrames[keyIndex]?.time ?? 0, false);
    const nextSelectedIndices =
      event.shiftKey
        ? Array.from(new Set([...selectedKeyIndices, keyIndex])).sort((a, b) => a - b)
        : selectedKeyIndices.includes(keyIndex) && selectedKeyIndices.length > 0
          ? [...selectedKeyIndices].sort((a, b) => a - b)
          : [keyIndex];
    setSelectedKeyIndices(nextSelectedIndices);
    previewCleanup();
    const selectedSet = new Set(nextSelectedIndices);
    const leadingIndex = nextSelectedIndices[0]!;
    const trailingIndex = nextSelectedIndices[nextSelectedIndices.length - 1]!;
    const previousUnselectedIndex = leadingIndex - 1;
    const nextUnselectedIndex = trailingIndex + 1;
    const minDeltaTime = leadingIndex > 0 ? (selectedRowFrames[previousUnselectedIndex]?.time ?? 0) + CHANNEL_EPSILON - selectedRowFrames[leadingIndex]!.time : -selectedRowFrames[leadingIndex]!.time;
    const maxDeltaTime =
      trailingIndex < selectedRowFrames.length - 1
        ? (selectedRowFrames[nextUnselectedIndex]?.time ?? activeClip.duration) - CHANNEL_EPSILON - selectedRowFrames[trailingIndex]!.time
        : activeClip.duration - selectedRowFrames[trailingIndex]!.time;
    dragStateRef.current = {
      rowId: row.id,
      selectedIndices: nextSelectedIndices,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrames: selectedRowFrames.map((frame) => ({ ...frame, values: [...frame.values] })),
      minDeltaTime,
      maxDeltaTime,
      valueRange: selectedValueRange,
    };
    dragPreviewFramesRef.current = null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const curveSvg = curveSvgRef.current;
      let currentValueRange = selectedValueRangeRef.current;
      if (curveSvg) {
        const rect = curveSvg.getBoundingClientRect();
        const drawableHeight = CURVE_HEIGHT - CURVE_PADDING_Y * 2;
        const localY = moveEvent.clientY - rect.top - CURVE_PADDING_Y;
        const topEdgeDelta = CURVE_AUTO_PAN_EDGE - localY;
        const bottomEdgeDelta = localY - (drawableHeight - CURVE_AUTO_PAN_EDGE);
        const visibleSpan = Math.max(currentValueRange.max - currentValueRange.min, 1e-5);

        let nextViewportCenter = yViewportCenterRef.current;
        if (topEdgeDelta > 0) {
          nextViewportCenter += visibleSpan * CURVE_AUTO_PAN_SPEED * (topEdgeDelta / CURVE_AUTO_PAN_EDGE);
        } else if (bottomEdgeDelta > 0) {
          nextViewportCenter -= visibleSpan * CURVE_AUTO_PAN_SPEED * (bottomEdgeDelta / CURVE_AUTO_PAN_EDGE);
        }

        if (nextViewportCenter !== yViewportCenterRef.current) {
          yViewportCenterRef.current = nextViewportCenter;
          setYViewportCenter(nextViewportCenter);
          currentValueRange = getVisibleValueRange(nextViewportCenter, yViewportSpanRef.current);
          selectedValueRangeRef.current = currentValueRange;
        }
      }

      const deltaTime = clamp((moveEvent.clientX - dragState.startClientX) / pixelsPerSecondRef.current, dragState.minDeltaTime, dragState.maxDeltaTime);
      const valueDelta =
        resolveValueFromClientY(moveEvent.clientY, currentValueRange) -
        resolveValueFromClientY(dragState.startClientY, dragState.valueRange);

      const previewFrames = dragState.startFrames.map((frame, index) => {
        if (!selectedSet.has(index)) {
          return frame;
        }

        const nextValues = [...frame.values];
        nextValues[row.componentIndex] += valueDelta;
        const normalizedValues = row.channel === "rotation" ? normalizeQuaternion(nextValues) : nextValues;

        return {
          ...frame,
          time: frame.time + deltaTime,
          values: normalizedValues,
        };
      });

      dragPreviewFramesRef.current = previewFrames;
      setDragPreviewFrames(previewFrames);
      const leadFrame = previewFrames[nextSelectedIndices[0]!] ?? previewFrames[keyIndex];
      setPlayhead(leadFrame?.time ?? 0, false);
    };

    const handlePointerUp = () => {
      const dragState = dragStateRef.current;
      if (dragState && selectedRow) {
        const previewFrames = dragPreviewFramesRef.current ?? dragState.startFrames;
        withRowMutation(selectedRow, () => ({
          frames: previewFrames,
          nextSelection: { rowId: selectedRow.id, keyIndex: dragState.selectedIndices[0]! },
          nextSelectedIndices: dragState.selectedIndices,
          nextPlayhead: previewFrames[dragState.selectedIndices[0]!]!.time,
        }));
        setSelectedKeyIndices(dragState.selectedIndices);
      }
      dragStateRef.current = null;
      setDragPreviewFrames(null);
      dragPreviewFramesRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function previewCleanup() {
    setDragPreviewFrames(null);
    dragPreviewFramesRef.current = null;
    setSelectionBox(null);
    selectionBoxRef.current = null;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
      <StudioSection
        title="Clips"
        className={cn(
          "h-full overflow-hidden rounded-none border-y-0 border-l-0 border-r border-white/8 bg-[#071014]/88 transition",
          isClipPanelDragging && "ring-2 ring-emerald-400/28"
        )}
        bodyClassName="h-full p-0"
        action={
          <Button type="button" variant="ghost" size="xs" className="h-7 px-2 text-[11px] text-zinc-300" onClick={props.onImportAnimations}>
            <Upload className="size-3.5" />
            Import
          </Button>
        }
      >
        <div
          className="flex h-full min-h-0 flex-col"
          onDragOver={(event) => {
            event.preventDefault();
            setIsClipPanelDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsClipPanelDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsClipPanelDragging(false);
            const files = Array.from(event.dataTransfer.files ?? []).filter((file) => /\.(glb|gltf|fbx)$/i.test(file.name));
            if (files.length > 0) {
              props.onDropAnimationFiles(files);
            }
          }}
        >
          <div className="border-b border-white/8 px-3 py-3 text-[11px] leading-5 text-zinc-500">
            Drop animation files here to append new takes directly into the clip library.
          </div>
          <ScrollArea className="min-h-0 flex-1 pb-24">
            <div className="space-y-1.5 p-2.5">
              {props.importedClips.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/3 px-4 py-6 text-center text-[12px] leading-6 text-zinc-500">
                  No clips imported yet.
                </div>
              ) : (
                props.importedClips.map((clip) => {
                  const isActive = activeClip?.id === clip.id;
                  return (
                    <div key={clip.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => props.onSelectClip(clip.id)}
                        className={cn(
                          "flex w-full flex-col rounded-[20px] border px-3 py-3 text-left transition",
                          isActive
                            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-50"
                            : "border-white/6 bg-white/4 text-zinc-200 hover:border-white/10 hover:bg-white/6"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-medium">{clip.name}</div>
                            <div className="truncate text-[11px] text-zinc-500">{clip.source}</div>
                          </div>
                          <Film className={cn("size-4 shrink-0", isActive ? "text-emerald-200" : "text-zinc-500")} />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                          <span>{formatDuration(clip.duration)}</span>
                          <span>{clip.asset.tracks.length} tracks</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onDeleteClip(clip.id);
                        }}
                        aria-label={`Delete clip "${clip.name}"`}
                        className="absolute top-2 right-2 hidden rounded-full p-1 text-zinc-500 transition hover:text-red-400 group-hover:flex"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </StudioSection>

      <div className="grid min-h-0 grid-rows-[minmax(240px,0.9fr)_minmax(360px,1fr)]">
        <StudioSection
          title="Preview"
          className="overflow-hidden rounded-none border-x-0 border-t-0 border-b border-white/8 bg-[#071014]/88"
          bodyClassName="flex h-full min-h-0 flex-col p-0"
          action={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="h-8 w-8 rounded-full bg-white/7 text-zinc-100 hover:bg-white/10"
                onClick={() => setIsPlaying((current) => !current)}
                aria-label={isPlaying ? "Pause playback" : "Start playback"}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 rounded-full text-zinc-300 hover:bg-white/8 hover:text-zinc-100"
                onClick={() => {
                  setIsPlaying(false);
                  setPlayhead(0);
                }}
                aria-label="Stop playback"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            </div>
          }
        >
          <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-h-0">
              <ClipPreviewViewport character={props.character} clip={activeClip} currentTimeRef={playheadTimeRef} />
            </div>

            <div className="grid content-start gap-0 border-l border-white/8 bg-black/16">
              <div className="p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Playback</div>
                <div className="mt-3 grid gap-3">
                  <PropertyField label="Time">
                    <div ref={playheadTimeTextRef} className="flex h-9 items-center rounded-xl bg-white/7 px-3 text-[12px] text-zinc-100">
                      {formatDuration(playheadTime)} / {formatDuration(activeClip?.duration ?? 0)}
                    </div>
                  </PropertyField>
                  <PropertyField label="Speed">
                    <DragInput value={playbackSpeed} min={0.1} max={3} step={0.05} precision={2} onChange={setPlaybackSpeed} className="w-full" />
                  </PropertyField>
                  <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[11px] leading-5 text-zinc-400">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Clock3 className="size-3.5" />
                      Space toggles play and pause, Cmd-drag zooms the timeline
                    </div>
                  </div>
                </div>
              </div>

              {props.assetStatus || props.assetError ? (
                <div
                  className={
                    props.assetError
                      ? "border-t border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-100"
                      : "border-t border-emerald-400/14 bg-emerald-500/8 px-3 py-2 text-[11px] leading-5 text-emerald-100"
                  }
                >
                  {props.assetError ?? props.assetStatus}
                </div>
              ) : null}
            </div>
          </div>
        </StudioSection>

        <StudioSection
          title="Clip Editor"
          className="min-h-0 overflow-hidden rounded-none border-0 bg-[#071014]/88"
          bodyClassName="flex h-full min-h-0 flex-col p-0"
          action={
            <div className="flex items-center gap-2">
              <ClipGhostClipSelect options={ghostClipOptions} value={ghostClipId} onValueChange={setGhostClipId} disabled={!activeClip || ghostClipOptions.length === 0} />
              <Button type="button" variant="ghost" size="xs" className="h-7 px-2 text-[11px] text-zinc-300" onClick={handleTrimToPlayhead} disabled={!activeClip}>
                <Scissors className="size-3.5" />
                Trim To Playhead
              </Button>
              <Button type="button" variant="ghost" size="xs" className="h-7 px-2 text-[11px] text-zinc-300" onClick={handleExtendClip} disabled={!activeClip}>
                <Plus className="size-3.5" />
                Extend +0.25s
              </Button>
            </div>
          }
        >
          <ClipKeyframeInspector
            selectedFrame={
              selectedFrameInfo
                ? {
                    boneName: selectedFrameInfo.row.boneName,
                    label: selectedFrameInfo.row.label,
                    chipClassName: selectedFrameInfo.row.chipClassName,
                    componentLabel: selectedFrameInfo.row.componentLabel,
                    channel: selectedFrameInfo.row.channel,
                    time: selectedFrameInfo.frame.time,
                    value: getFrameComponentValue(selectedFrameInfo.frame, selectedFrameInfo.row, activeRig),
                  }
                : null
            }
            maxTime={activeClip?.duration ?? 0}
            onDelete={handleDeleteKeyframe}
            onTimeChange={updateSelectedKeyframeTime}
            onValueChange={updateSelectedKeyframeValue}
          />

          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/6 px-2.5 py-1 text-zinc-200">{activeClip?.name ?? "No clip selected"}</span>
              {selectedRow ? (
                <span className="rounded-full border border-white/8 px-2.5 py-1 text-zinc-400">
                  {selectedRow.boneName} / {selectedRow.label} {selectedRow.componentLabel}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="xs" className="h-7 px-2 text-[11px] text-zinc-300" onClick={handleAddKeyframe} disabled={!selectedRow}>
                <Plus className="size-3.5" />
                Key At Playhead
              </Button>
            </div>
          </div>

          {!activeClip ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-[12px] leading-6 text-zinc-500">
              Import or select a clip to open the editor timeline.
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
              <ClipTrackList sections={clipSections} selectedRowId={selectedRowId} onSelectRow={handleSelectTrackRow} />

              <ClipCurveEditor
                curveHeight={CURVE_HEIGHT}
                curvePaddingX={CURVE_PADDING_X}
                curvePaddingY={CURVE_PADDING_Y}
                pixelsPerSecond={pixelsPerSecond}
                playheadTransform={`translateX(${CURVE_PADDING_X + playheadTimeRef.current * pixelsPerSecond}px)`}
                ghostCurvePath={ghostCurvePath}
                ghostPoints={ghostCurvePoints}
                points={curvePoints}
                rulerTimes={rulerTimes}
                selectedCurvePath={selectedCurvePath}
                selectedValueRange={selectedValueRange}
                timelineScrollerRef={timelineScrollerRef}
                rulerContentRef={rulerContentRef}
                playheadLineRef={playheadLineRef}
                curveSvgRef={curveSvgRef}
                timelineWidth={timelineWidth}
                selectionBox={selectionBounds}
                onCurvePointerDown={(event) => {
                  if (event.shiftKey && beginBoxSelection(event)) {
                    return;
                  }
                  if (beginTimelineZoom(event)) {
                    return;
                  }
                  setSelectedKeyframe(null);
                  setSelectedKeyIndices([]);
                  handleTimelineSeek(event.clientX);
                }}
                onPointPointerDown={(event, keyIndex) => {
                  if (!selectedRow) {
                    return;
                  }
                  beginKeyframeDrag(event, selectedRow, keyIndex);
                }}
                onRulerPointerDown={(event) => {
                  if (beginTimelineZoom(event)) {
                    return;
                  }
                  handleTimelineSeek(event.clientX);
                }}
                onCurveWheel={(event) => {
                  event.preventDefault();
                  handleValueAxisWheel(event.deltaY);
                }}
              />
            </div>
          )}
        </StudioSection>
      </div>
    </div>
  );
}
