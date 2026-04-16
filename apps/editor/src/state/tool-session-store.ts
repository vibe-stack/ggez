import { proxy } from "valtio";
import type { BrushShape } from "@ggez/shared";
import { defaultToolId, type ToolId } from "@ggez/tool-system";
import type { MeshEditMode } from "@/viewport/editing";
import type { BrushToolMode, MeshEditToolbarActionRequest } from "@/viewport/types";

export type PhysicsPlaybackState = "paused" | "running" | "stopped";
export type TransformMode = "rotate" | "scale" | "translate";
export type AiModelDraft = {
  error?: string;
  nodeId: string;
  prompt: string;
} | null;

type ToolSessionState = {
  activeBrushShape: BrushShape;
  activeToolId: ToolId;
  aiModelDraft: AiModelDraft;
  aiModelPlacementArmed: boolean;
  brushToolMode: BrushToolMode;
  instanceBrushAlignToNormal: boolean;
  instanceBrushAverageNormal: boolean;
  instanceBrushDensity: number;
  instanceBrushRandomness: number;
  instanceBrushSize: number;
  instanceBrushSourceNodeId: string;
  instanceBrushSourceNodeIds: string[];
  instanceBrushYOffsetMin: number;
  instanceBrushYOffsetMax: number;
  instanceBrushScaleMin: number;
  instanceBrushScaleMax: number;
  materialPaintBrushOpacity: number;
  materialPaintMode: "erase" | "paint" | null;
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  physicsPlayback: PhysicsPlaybackState;
  physicsRevision: number;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  sculptMode: "deflate" | "inflate" | "smooth" | null;
  transformMode: TransformMode;
};

function createInitialToolSessionState(): ToolSessionState {
  return {
    activeBrushShape: "cube",
    activeToolId: defaultToolId,
    aiModelDraft: null,
    aiModelPlacementArmed: false,
    brushToolMode: "create",
    instanceBrushAlignToNormal: true,
    instanceBrushAverageNormal: false,
    instanceBrushDensity: 8,
    instanceBrushRandomness: 0.35,
    instanceBrushSize: 2.5,
    instanceBrushSourceNodeId: "",
    instanceBrushSourceNodeIds: [],
    instanceBrushYOffsetMin: 0,
    instanceBrushYOffsetMax: 0,
    instanceBrushScaleMin: 1,
    instanceBrushScaleMax: 1,
    materialPaintBrushOpacity: 0.85,
    materialPaintMode: null,
    meshEditMode: "vertex",
    meshEditToolbarAction: undefined,
    physicsPlayback: "stopped",
    physicsRevision: 0,
    sculptBrushRadius: 3,
    sculptBrushStrength: 0.2,
    sculptMode: null,
    transformMode: "translate"
  };
}

export const toolSessionStore = proxy<ToolSessionState>(createInitialToolSessionState());

export function resetToolSessionStore() {
  Object.assign(toolSessionStore, createInitialToolSessionState());
}

export function queueMeshEditToolbarAction(kind: MeshEditToolbarActionRequest["kind"]) {
  toolSessionStore.meshEditToolbarAction = {
    id: (toolSessionStore.meshEditToolbarAction?.id ?? 0) + 1,
    kind
  };
}

export function stopPhysicsPlayback() {
  toolSessionStore.physicsPlayback = "stopped";
  toolSessionStore.physicsRevision += 1;
}
