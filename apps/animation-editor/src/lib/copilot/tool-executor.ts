import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type {
  AnimationEditorDocument,
  BoneMaskDefinition,
  EditorGraph,
  EditorGraphNode,
  ParameterDefinition
} from "@ggez/anim-schema";
import { createStableId } from "@ggez/anim-utils";
import type { ImportedPreviewClip } from "@/editor/preview-assets";
import { adjustClipMotion, createClip, createPoseClip, duplicateClipAsVariant, getClipTrackData, listClipBones, matchClipTransition, setClipTrackData } from "./clip-tools";
import type { CopilotToolCall, CopilotToolResult } from "./types";

type Args = Record<string, unknown>;
type StateMachineNode = Extract<EditorGraphNode, { kind: "stateMachine" }>;
type StateMachineTransition = StateMachineNode["transitions"][number];

export type CopilotToolExecutionContext = {
  requestAnimationPush?: (options: {
    gameId?: string;
    projectName?: string;
    projectSlug?: string;
  }) => void;
  createImportedClip?: (clip: ImportedPreviewClip, options?: { select?: boolean }) => void;
  getImportedClips?: () => ImportedPreviewClip[];
  updateImportedClip?: (clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) => void;
};

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data });
}

function fail(error: string): string {
  return JSON.stringify({ success: false, error });
}

function str(args: Args, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function num(args: Args, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(args: Args, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function strArray(args: Args, key: string): string[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function vec2Arg(args: Args, key: string, fallback: { x: number; y: number }): { x: number; y: number } {
  const value = args[key];
  if (isRecord(value)) {
    return {
      x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : fallback.x,
      y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : fallback.y
    };
  }

  const x = num(args, `${key}X`);
  const y = num(args, `${key}Y`);
  if (x !== undefined || y !== undefined) {
    return {
      x: x ?? fallback.x,
      y: y ?? fallback.y
    };
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeNode(node: EditorGraphNode) {
  const base = {
    id: node.id,
    name: node.name,
    kind: node.kind,
    position: node.position
  };

  switch (node.kind) {
    case "clip":
      return {
        ...base,
        clipId: node.clipId,
        speed: node.speed,
        loop: node.loop,
        inPlace: node.inPlace,
        syncGroup: node.syncGroup
      };
    case "blend1d":
      return {
        ...base,
        parameterId: node.parameterId,
        children: node.children,
        syncGroup: node.syncGroup
      };
    case "blend2d":
      return {
        ...base,
        xParameterId: node.xParameterId,
        yParameterId: node.yParameterId,
        children: node.children,
        syncGroup: node.syncGroup
      };
    case "selector":
      return {
        ...base,
        parameterId: node.parameterId,
        children: node.children,
        syncGroup: node.syncGroup
      };
    case "orientationWarp":
      return {
        ...base,
        sourceNodeId: node.sourceNodeId,
        angleParameterId: node.angleParameterId,
        maxAngle: node.maxAngle,
        weight: node.weight,
        hipBoneName: node.hipBoneName,
        hipWeight: node.hipWeight,
        spineBoneNames: node.spineBoneNames,
        legs: node.legs
      };
    case "strideWarp":
      return {
        ...base,
        sourceNodeId: node.sourceNodeId,
        evaluationMode: node.evaluationMode,
        locomotionSpeedParameterId: node.locomotionSpeedParameterId,
        strideDirection: node.strideDirection,
        manualStrideScale: node.manualStrideScale,
        minLocomotionSpeedThreshold: node.minLocomotionSpeedThreshold,
        pelvisBoneName: node.pelvisBoneName,
        pelvisWeight: node.pelvisWeight,
        clampResult: node.clampResult,
        minStrideScale: node.minStrideScale,
        maxStrideScale: node.maxStrideScale,
        interpResult: node.interpResult,
        interpSpeedIncreasing: node.interpSpeedIncreasing,
        interpSpeedDecreasing: node.interpSpeedDecreasing,
        legs: node.legs
      };
    case "stateMachine":
      return {
        ...base,
        entryStateId: node.entryStateId,
        states: node.states,
        transitions: node.transitions,
        anyStateTransitions: node.anyStateTransitions
      };
    case "subgraph":
      return {
        ...base,
        graphId: node.graphId,
        syncGroup: node.syncGroup
      };
    case "output":
      return {
        ...base,
        sourceNodeId: node.sourceNodeId
      };
  }
}

function getDocument(store: AnimationEditorStore): AnimationEditorDocument {
  return store.getState().document;
}

function getGraph(document: AnimationEditorDocument, graphId: string): EditorGraph | undefined {
  return document.graphs.find((graph) => graph.id === graphId);
}

function getGraphOrFail(document: AnimationEditorDocument, graphId: string): EditorGraph {
  const graph = getGraph(document, graphId);
  if (!graph) {
    throw new Error(`Unknown graph \"${graphId}\".`);
  }
  return graph;
}

function getNodeOrFail(graph: EditorGraph, nodeId: string): EditorGraphNode {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    throw new Error(`Unknown node \"${nodeId}\" in graph \"${graph.id}\".`);
  }
  return node;
}

function buildDocumentSummary(document: AnimationEditorDocument) {
  return {
    name: document.name,
    entryGraphId: document.entryGraphId,
    graphCount: document.graphs.length,
    parameterCount: document.parameters.length,
    clipCount: document.clips.length,
    layerCount: document.layers.length,
    maskCount: document.masks.length,
    rigBoneCount: document.rig?.boneNames.length ?? 0,
    graphIds: document.graphs.map((graph) => graph.id)
  };
}

function applyNodePatch(node: EditorGraphNode, args: Args): EditorGraphNode {
  const nextNode: EditorGraphNode = {
    ...node,
    name: str(args, "name", node.name),
    comment: "comment" in args ? str(args, "comment", "") || undefined : node.comment,
    color: "color" in args ? str(args, "color", "") || undefined : node.color,
    collapsed: "collapsed" in args ? bool(args, "collapsed") : node.collapsed,
    position: {
      x: num(args, "x") ?? node.position.x,
      y: num(args, "y") ?? node.position.y
    }
  };

  switch (nextNode.kind) {
    case "clip":
      return {
        ...nextNode,
        clipId: str(args, "clipId", nextNode.clipId),
        speed: num(args, "speed") ?? nextNode.speed,
        loop: bool(args, "loop") ?? nextNode.loop,
        inPlace: bool(args, "inPlace") ?? nextNode.inPlace,
        syncGroup: "syncGroup" in args ? str(args, "syncGroup") || undefined : nextNode.syncGroup
      };
    case "blend1d":
      return {
        ...nextNode,
        parameterId: str(args, "parameterId", nextNode.parameterId),
        syncGroup: "syncGroup" in args ? str(args, "syncGroup") || undefined : nextNode.syncGroup
      };
    case "blend2d":
      return {
        ...nextNode,
        xParameterId: str(args, "xParameterId", nextNode.xParameterId),
        yParameterId: str(args, "yParameterId", nextNode.yParameterId),
        syncGroup: "syncGroup" in args ? str(args, "syncGroup") || undefined : nextNode.syncGroup
      };
    case "selector":
      return {
        ...nextNode,
        parameterId: str(args, "parameterId", nextNode.parameterId),
        syncGroup: "syncGroup" in args ? str(args, "syncGroup") || undefined : nextNode.syncGroup
      };
    case "orientationWarp":
      return {
        ...nextNode,
        sourceNodeId: "sourceNodeId" in args ? str(args, "sourceNodeId") || undefined : nextNode.sourceNodeId,
        angleParameterId: str(args, "angleParameterId", nextNode.angleParameterId),
        maxAngle: num(args, "maxAngle") ?? nextNode.maxAngle,
        weight: num(args, "weight") ?? nextNode.weight,
        hipBoneName: "hipBoneName" in args ? str(args, "hipBoneName") || undefined : nextNode.hipBoneName,
        hipWeight: num(args, "hipWeight") ?? nextNode.hipWeight,
        spineBoneNames: "spineBoneNames" in args ? strArray(args, "spineBoneNames") : nextNode.spineBoneNames,
        legs: "legs" in args ? parseLegDefinitions(args.legs) : nextNode.legs
      };
    case "strideWarp":
      return {
        ...nextNode,
        sourceNodeId: "sourceNodeId" in args ? str(args, "sourceNodeId") || undefined : nextNode.sourceNodeId,
        evaluationMode:
          "evaluationMode" in args && (str(args, "evaluationMode") === "graph" || str(args, "evaluationMode") === "manual")
            ? (str(args, "evaluationMode") as typeof nextNode.evaluationMode)
            : nextNode.evaluationMode,
        locomotionSpeedParameterId:
          "locomotionSpeedParameterId" in args ? str(args, "locomotionSpeedParameterId") || undefined : nextNode.locomotionSpeedParameterId,
        strideDirection:
          "strideDirection" in args || "strideDirectionX" in args || "strideDirectionY" in args
            ? vec2Arg(args, "strideDirection", nextNode.strideDirection)
            : nextNode.strideDirection,
        manualStrideScale: num(args, "manualStrideScale") ?? nextNode.manualStrideScale,
        minLocomotionSpeedThreshold: num(args, "minLocomotionSpeedThreshold") ?? nextNode.minLocomotionSpeedThreshold,
        pelvisBoneName: "pelvisBoneName" in args ? str(args, "pelvisBoneName") || undefined : nextNode.pelvisBoneName,
        pelvisWeight: num(args, "pelvisWeight") ?? nextNode.pelvisWeight,
        clampResult: bool(args, "clampResult") ?? nextNode.clampResult,
        minStrideScale: num(args, "minStrideScale") ?? nextNode.minStrideScale,
        maxStrideScale: num(args, "maxStrideScale") ?? nextNode.maxStrideScale,
        interpResult: bool(args, "interpResult") ?? nextNode.interpResult,
        interpSpeedIncreasing: num(args, "interpSpeedIncreasing") ?? nextNode.interpSpeedIncreasing,
        interpSpeedDecreasing: num(args, "interpSpeedDecreasing") ?? nextNode.interpSpeedDecreasing,
        legs: "legs" in args ? parseLegDefinitions(args.legs) : nextNode.legs
      };
    case "subgraph":
      return {
        ...nextNode,
        graphId: str(args, "subgraphId", nextNode.graphId),
        syncGroup: "syncGroup" in args ? str(args, "syncGroup") || undefined : nextNode.syncGroup
      };
    default:
      return nextNode;
  }
}

function parseBlend1DChildren(children: unknown): Extract<EditorGraphNode, { kind: "blend1d" }>["children"] {
  if (!Array.isArray(children)) {
    throw new Error("children must be an array.");
  }

  return children.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.nodeId !== "string") {
      throw new Error(`children[${index}] must include a string nodeId.`);
    }

    return {
      nodeId: entry.nodeId,
      threshold: typeof entry.threshold === "number" ? entry.threshold : index,
      label: typeof entry.label === "string" ? entry.label : undefined
    };
  });
}

function parseBlend2DChildren(children: unknown): Extract<EditorGraphNode, { kind: "blend2d" }>["children"] {
  if (!Array.isArray(children)) {
    throw new Error("children must be an array.");
  }

  return children.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.nodeId !== "string") {
      throw new Error(`children[${index}] must include a string nodeId.`);
    }

    return {
      nodeId: entry.nodeId,
      x: typeof entry.x === "number" ? entry.x : index,
      y: typeof entry.y === "number" ? entry.y : 0,
      label: typeof entry.label === "string" ? entry.label : undefined
    };
  });
}

function parseSelectorChildren(children: unknown): Extract<EditorGraphNode, { kind: "selector" }>["children"] {
  if (!Array.isArray(children)) {
    throw new Error("children must be an array.");
  }

  return children.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.nodeId !== "string") {
      throw new Error(`children[${index}] must include a string nodeId.`);
    }

    return {
      nodeId: entry.nodeId,
      value: typeof entry.value === "number" ? Math.trunc(entry.value) : index,
      label: typeof entry.label === "string" ? entry.label : undefined
    };
  });
}

function parseLegDefinitions(legs: unknown): Array<{
  upperBoneName: string;
  lowerBoneName: string;
  footBoneName: string;
  weight: number;
}> {
  if (!Array.isArray(legs)) {
    throw new Error("legs must be an array.");
  }

  return legs.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.upperBoneName !== "string" ||
      typeof entry.lowerBoneName !== "string" ||
      typeof entry.footBoneName !== "string"
    ) {
      throw new Error(`legs[${index}] must include upperBoneName, lowerBoneName, and footBoneName strings.`);
    }

    return {
      upperBoneName: entry.upperBoneName,
      lowerBoneName: entry.lowerBoneName,
      footBoneName: entry.footBoneName,
      weight: typeof entry.weight === "number" ? entry.weight : 1
    };
  });
}

function parseMaskWeights(weights: unknown): BoneMaskDefinition["weights"] | undefined {
  if (!Array.isArray(weights)) {
    return undefined;
  }

  return weights.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.boneName !== "string" || typeof entry.weight !== "number") {
      return [];
    }

    return [{ boneName: entry.boneName, weight: entry.weight }];
  });
}

function parseConditions(conditions: unknown): StateMachineTransition["conditions"] {
  if (!Array.isArray(conditions)) {
    return [];
  }

  return conditions.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.parameterId !== "string" || typeof entry.operator !== "string") {
      return [];
    }

    const condition: StateMachineTransition["conditions"][number] = {
      parameterId: entry.parameterId,
      operator: entry.operator as StateMachineTransition["conditions"][number]["operator"]
    };

    if (typeof entry.value === "number" || typeof entry.value === "boolean") {
      condition.value = entry.value;
    }

    return [condition];
  });
}

function createParameter(store: AnimationEditorStore, args: Args) {
  const beforeIds = new Set(store.getState().document.parameters.map((parameter) => parameter.id));
  store.addParameter({
    name: str(args, "name"),
    type: str(args, "type") as ParameterDefinition["type"],
    defaultValue: args.defaultValue as ParameterDefinition["defaultValue"]
  });

  return store.getState().document.parameters.find((parameter) => !beforeIds.has(parameter.id));
}

function createLayer(store: AnimationEditorStore, args: Args) {
  const beforeIds = new Set(store.getState().document.layers.map((layer) => layer.id));
  store.addLayer({
    name: str(args, "name"),
    graphId: str(args, "graphId"),
    weight: num(args, "weight"),
    blendMode: str(args, "blendMode") as AnimationEditorDocument["layers"][number]["blendMode"],
    maskId: str(args, "maskId") || undefined,
    rootMotionMode: str(args, "rootMotionMode") as AnimationEditorDocument["layers"][number]["rootMotionMode"],
    enabled: bool(args, "enabled")
  });

  return store.getState().document.layers.find((layer) => !beforeIds.has(layer.id));
}

function createMask(store: AnimationEditorStore, args: Args) {
  const beforeIds = new Set(store.getState().document.masks.map((mask) => mask.id));
  store.addMask({
    name: str(args, "name"),
    rootBoneName: str(args, "rootBoneName") || undefined,
    includeChildren: bool(args, "includeChildren"),
    weights: parseMaskWeights(args.weights)
  });

  return store.getState().document.masks.find((mask) => !beforeIds.has(mask.id));
}

export function executeTool(
  store: AnimationEditorStore,
  toolCall: CopilotToolCall,
  context: CopilotToolExecutionContext = {}
): CopilotToolResult {
  const result = executeToolInner(store, toolCall.name, toolCall.args, context);
  return {
    callId: toolCall.id,
    name: toolCall.name,
    result
  };
}

function executeToolInner(
  store: AnimationEditorStore,
  name: string,
  args: Args,
  context: CopilotToolExecutionContext
): string {
  try {
    const document = getDocument(store);

    switch (name) {
      case "push_animation_to_connected_game": {
        if (!context.requestAnimationPush) {
          return fail("Editor-to-game animation sync is unavailable in this session.");
        }

        context.requestAnimationPush({
          gameId: str(args, "gameId") || undefined,
          projectName: str(args, "projectName") || undefined,
          projectSlug: str(args, "projectSlug") || undefined
        });
        return ok({ queued: true });
      }

      case "get_document_summary":
        return ok({ summary: buildDocumentSummary(document) });

      case "list_clips":
        return ok({
          clips: document.clips.map((clip) => ({
            id: clip.id,
            name: clip.name,
            duration: clip.duration,
            source: clip.source ?? null
          }))
        });

      case "create_clip": {
        if (!context.getImportedClips || !context.createImportedClip) {
          return fail("Clip creation is unavailable in this session.");
        }
        return ok(createClip(context.getImportedClips(), args, context.createImportedClip));
      }

      case "duplicate_clip_as_variant": {
        if (!context.getImportedClips || !context.createImportedClip) {
          return fail("Clip creation is unavailable in this session.");
        }
        return ok(duplicateClipAsVariant(context.getImportedClips(), args, context.createImportedClip));
      }

      case "create_pose_clip": {
        if (!context.getImportedClips || !context.createImportedClip) {
          return fail("Clip creation is unavailable in this session.");
        }
        return ok(createPoseClip(context.getImportedClips(), document.rig, args, context.createImportedClip));
      }

      case "list_clip_bones": {
        if (!context.getImportedClips) {
          return fail("Imported clip access is unavailable in this session.");
        }
        return ok(listClipBones(context.getImportedClips(), document.rig, args));
      }

      case "get_clip_track_data": {
        if (!context.getImportedClips) {
          return fail("Imported clip access is unavailable in this session.");
        }
        return ok(getClipTrackData(context.getImportedClips(), document.rig, args));
      }

      case "set_clip_track_data": {
        if (!context.getImportedClips || !context.updateImportedClip) {
          return fail("Clip editing is unavailable in this session.");
        }
        return ok(setClipTrackData(context.getImportedClips(), document.rig, args, context.updateImportedClip));
      }

      case "adjust_clip_motion": {
        if (!context.getImportedClips || !context.updateImportedClip) {
          return fail("Clip editing is unavailable in this session.");
        }
        return ok(adjustClipMotion(context.getImportedClips(), document.rig, args, context.updateImportedClip));
      }

      case "match_clip_transition": {
        if (!context.getImportedClips || !context.updateImportedClip) {
          return fail("Clip editing is unavailable in this session.");
        }
        return ok(matchClipTransition(context.getImportedClips(), document.rig, args, context.updateImportedClip));
      }

      case "list_parameters":
        return ok({ parameters: document.parameters });

      case "list_layers":
        return ok({ layers: document.layers });

      case "list_masks":
        return ok({ masks: document.masks });

      case "get_rig_summary":
        return ok({
          rig: document.rig
            ? {
                boneCount: document.rig.boneNames.length,
                rootBoneIndex: document.rig.rootBoneIndex,
                boneNames: document.rig.boneNames
              }
            : null
        });

      case "list_graphs":
        return ok({
          entryGraphId: document.entryGraphId,
          graphs: document.graphs.map((graph) => ({
            id: graph.id,
            name: graph.name,
            outputNodeId: graph.outputNodeId,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length
          }))
        });

      case "get_graph_details": {
        const graph = getGraphOrFail(document, str(args, "graphId"));
        return ok({
          graph: {
            id: graph.id,
            name: graph.name,
            outputNodeId: graph.outputNodeId,
            nodes: graph.nodes.map(summarizeNode),
            edges: graph.edges
          }
        });
      }

      case "set_entry_graph": {
        const graphId = str(args, "graphId");
        getGraphOrFail(document, graphId);
        store.setEntryGraph(graphId);
        return ok({ entryGraphId: graphId });
      }

      case "add_graph": {
        const graphId = store.addGraph(str(args, "name", "New Graph"));
        if (bool(args, "setAsEntry")) {
          store.setEntryGraph(graphId);
        }
        return ok({ graphId, graph: getGraphOrFail(store.getState().document, graphId) });
      }

      case "rename_graph": {
        const graphId = str(args, "graphId");
        getGraphOrFail(document, graphId);
        store.renameGraph(graphId, str(args, "name"));
        return ok({ graphId, name: str(args, "name") });
      }

      case "add_node": {
        const graphId = str(args, "graphId");
        const kind = str(args, "kind") as EditorGraphNode["kind"];
        getGraphOrFail(document, graphId);
        const nodeId = store.addNode(graphId, kind);
        store.updateNode(graphId, nodeId, (node) => applyNodePatch(node, args));
        const graph = getGraphOrFail(store.getState().document, graphId);
        return ok({ nodeId, node: summarizeNode(getNodeOrFail(graph, nodeId)) });
      }

      case "update_node": {
        const graphId = str(args, "graphId");
        const nodeId = str(args, "nodeId");
        const graph = getGraphOrFail(document, graphId);
        getNodeOrFail(graph, nodeId);
        store.updateNode(graphId, nodeId, (node) => applyNodePatch(node, args));
        const nextGraph = getGraphOrFail(store.getState().document, graphId);
        return ok({ node: summarizeNode(getNodeOrFail(nextGraph, nodeId)) });
      }

      case "connect_nodes": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        getNodeOrFail(graph, str(args, "sourceNodeId"));
        getNodeOrFail(graph, str(args, "targetNodeId"));
        store.connectNodes(graphId, str(args, "sourceNodeId"), str(args, "targetNodeId"));
        return ok({ graphId, sourceNodeId: str(args, "sourceNodeId"), targetNodeId: str(args, "targetNodeId") });
      }

      case "set_blend_children": {
        const graphId = str(args, "graphId");
        const nodeId = str(args, "nodeId");
        const graph = getGraphOrFail(document, graphId);
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "blend1d" && node.kind !== "blend2d") {
          return fail("set_blend_children only works on blend1d or blend2d nodes.");
        }

        if (node.kind === "blend1d") {
          const children = parseBlend1DChildren(args.children);
          store.updateNode(graphId, nodeId, (current) => current.kind === "blend1d" ? { ...current, children } : current);
        } else {
          const children = parseBlend2DChildren(args.children);
          store.updateNode(graphId, nodeId, (current) => current.kind === "blend2d" ? { ...current, children } : current);
        }

        const nextGraph = getGraphOrFail(store.getState().document, graphId);
        return ok({ node: summarizeNode(getNodeOrFail(nextGraph, nodeId)) });
      }

      case "set_selector_children": {
        const graphId = str(args, "graphId");
        const nodeId = str(args, "nodeId");
        const graph = getGraphOrFail(document, graphId);
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "selector") {
          return fail("set_selector_children only works on selector nodes.");
        }

        const children = parseSelectorChildren(args.children);
        store.updateNode(graphId, nodeId, (current) => current.kind === "selector" ? { ...current, children } : current);
        const nextGraph = getGraphOrFail(store.getState().document, graphId);
        return ok({ node: summarizeNode(getNodeOrFail(nextGraph, nodeId)) });
      }

      case "delete_edges": {
        const graphId = str(args, "graphId");
        getGraphOrFail(document, graphId);
        const edgeIds = strArray(args, "edgeIds");
        store.deleteEdges(graphId, edgeIds);
        return ok({ deletedEdgeIds: edgeIds });
      }

      case "delete_nodes": {
        const graphId = str(args, "graphId");
        getGraphOrFail(document, graphId);
        const nodeIds = strArray(args, "nodeIds");
        store.selectGraph(graphId);
        store.selectNodes(nodeIds);
        store.deleteSelectedNodes();
        return ok({ deletedNodeIds: nodeIds });
      }

      case "add_parameter": {
        const parameter = createParameter(store, args);
        if (!parameter) {
          return fail("Failed to create parameter.");
        }
        return ok({ parameter });
      }

      case "update_parameter": {
        const parameterId = str(args, "parameterId");
        if (!document.parameters.some((parameter) => parameter.id === parameterId)) {
          return fail(`Unknown parameter \"${parameterId}\".`);
        }

        store.updateParameter(parameterId, {
          ...(typeof args.name === "string" ? { name: args.name } : {}),
          ...(typeof args.type === "string" ? { type: args.type as ParameterDefinition["type"] } : {}),
          ...("defaultValue" in args ? { defaultValue: args.defaultValue as ParameterDefinition["defaultValue"] } : {})
        });
        return ok({ parameterId });
      }

      case "add_layer": {
        const layer = createLayer(store, args);
        if (!layer) {
          return fail("Failed to create layer.");
        }
        return ok({ layer });
      }

      case "update_layer": {
        const layerId = str(args, "layerId");
        if (!document.layers.some((layer) => layer.id === layerId)) {
          return fail(`Unknown layer \"${layerId}\".`);
        }

        store.updateLayer(layerId, {
          ...(typeof args.name === "string" ? { name: args.name } : {}),
          ...(typeof args.graphId === "string" ? { graphId: args.graphId } : {}),
          ...(typeof args.weight === "number" ? { weight: args.weight } : {}),
          ...(typeof args.blendMode === "string" ? { blendMode: args.blendMode as AnimationEditorDocument["layers"][number]["blendMode"] } : {}),
          ...(typeof args.maskId === "string" ? { maskId: args.maskId || undefined } : {}),
          ...(typeof args.rootMotionMode === "string" ? { rootMotionMode: args.rootMotionMode as AnimationEditorDocument["layers"][number]["rootMotionMode"] } : {}),
          ...(typeof args.enabled === "boolean" ? { enabled: args.enabled } : {})
        });
        return ok({ layerId });
      }

      case "add_mask": {
        const mask = createMask(store, args);
        if (!mask) {
          return fail("Failed to create mask.");
        }
        return ok({ mask });
      }

      case "update_mask": {
        const maskId = str(args, "maskId");
        if (!document.masks.some((mask) => mask.id === maskId)) {
          return fail(`Unknown mask \"${maskId}\".`);
        }

        store.updateMask(maskId, {
          ...(typeof args.name === "string" ? { name: args.name } : {}),
          ...(typeof args.rootBoneName === "string" ? { rootBoneName: args.rootBoneName || undefined } : {}),
          ...(typeof args.includeChildren === "boolean" ? { includeChildren: args.includeChildren } : {}),
          ...(Array.isArray(args.weights) ? { weights: parseMaskWeights(args.weights) ?? [] } : {})
        });
        return ok({ maskId });
      }

      case "create_state": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("create_state only works on stateMachine nodes.");
        }

        const stateId = createStableId("state");
        store.updateNode(graphId, nodeId, (current) => {
          if (current.kind !== "stateMachine") {
            return current;
          }

          return {
            ...current,
            entryStateId: bool(args, "setAsEntry") ? stateId : current.entryStateId,
            states: [
              ...current.states,
              {
                id: stateId,
                name: str(args, "name"),
                motionNodeId: str(args, "motionNodeId"),
                position: { x: num(args, "x") ?? 220, y: num(args, "y") ?? 160 },
                speed: num(args, "speed") ?? 1,
                cycleOffset: num(args, "cycleOffset") ?? 0
              }
            ]
          };
        });

        const nextGraph = getGraphOrFail(store.getState().document, graphId);
        return ok({ state: (getNodeOrFail(nextGraph, nodeId) as Extract<EditorGraphNode, { kind: "stateMachine" }>).states.find((state) => state.id === stateId) });
      }

      case "update_state": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("update_state only works on stateMachine nodes.");
        }

        const stateId = str(args, "stateId");
        store.updateNode(graphId, nodeId, (current) => {
          if (current.kind !== "stateMachine") {
            return current;
          }

          return {
            ...current,
            states: current.states.map((state) =>
              state.id === stateId
                ? {
                    ...state,
                    name: typeof args.name === "string" ? args.name : state.name,
                    motionNodeId: typeof args.motionNodeId === "string" ? args.motionNodeId : state.motionNodeId,
                    position:
                      "x" in args || "y" in args
                        ? {
                            x: num(args, "x") ?? state.position?.x ?? 220,
                            y: num(args, "y") ?? state.position?.y ?? 160
                          }
                        : state.position,
                    speed: num(args, "speed") ?? state.speed,
                    cycleOffset: num(args, "cycleOffset") ?? state.cycleOffset
                  }
                : state
            )
          };
        });
        return ok({ stateId });
      }

      case "delete_state": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("delete_state only works on stateMachine nodes.");
        }

        const stateId = str(args, "stateId");
        store.updateNode(graphId, nodeId, (current) => {
          if (current.kind !== "stateMachine") {
            return current;
          }

          const remainingStates = current.states.filter((state) => state.id !== stateId);
          return {
            ...current,
            entryStateId: current.entryStateId === stateId ? remainingStates[0]?.id ?? current.entryStateId : current.entryStateId,
            states: remainingStates,
            transitions: current.transitions.filter((transition) => transition.fromStateId !== stateId && transition.toStateId !== stateId),
            anyStateTransitions: current.anyStateTransitions.filter((transition) => transition.toStateId !== stateId)
          };
        });
        return ok({ stateId });
      }

      case "set_state_machine_entry": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("set_state_machine_entry only works on stateMachine nodes.");
        }

        const stateId = str(args, "stateId");
        if (!node.states.some((state) => state.id === stateId)) {
          return fail(`Unknown state \"${stateId}\".`);
        }

        store.updateNode(graphId, nodeId, (current) => current.kind === "stateMachine" ? { ...current, entryStateId: stateId } : current);
        return ok({ stateMachineNodeId: nodeId, entryStateId: stateId });
      }

      case "add_transition": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("add_transition only works on stateMachine nodes.");
        }

        const transitionId = createStableId("transition");
        const transition: StateMachineTransition = {
          id: transitionId,
          fromStateId: str(args, "fromStateId") || undefined,
          toStateId: str(args, "toStateId"),
          duration: num(args, "duration") ?? 0.15,
          blendCurve: (str(args, "blendCurve") || "linear") as StateMachineTransition["blendCurve"],
          syncNormalizedTime: bool(args, "syncNormalizedTime") ?? false,
          hasExitTime: bool(args, "hasExitTime") ?? false,
          exitTime: "exitTime" in args ? num(args, "exitTime") : undefined,
          interruptionSource: (str(args, "interruptionSource") || "none") as StateMachineTransition["interruptionSource"],
          conditions: parseConditions(args.conditions)
        };

        store.updateNode(graphId, nodeId, (current) => {
          if (current.kind !== "stateMachine") {
            return current;
          }

          return bool(args, "anyState")
            ? { ...current, anyStateTransitions: [...current.anyStateTransitions, transition] }
            : { ...current, transitions: [...current.transitions, transition] };
        });
        return ok({ transition });
      }

      case "update_transition": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("update_transition only works on stateMachine nodes.");
        }

        const transitionId = str(args, "transitionId");
        const isAnyState = bool(args, "anyState") ?? false;
        store.updateNode(graphId, nodeId, (current) => {
          if (current.kind !== "stateMachine") {
            return current;
          }

          const updateOne = (transition: StateMachineTransition): StateMachineTransition => ({
            ...transition,
            ...(typeof args.fromStateId === "string" ? { fromStateId: args.fromStateId || undefined } : {}),
            ...(typeof args.toStateId === "string" ? { toStateId: args.toStateId } : {}),
            ...(typeof args.duration === "number" ? { duration: args.duration } : {}),
            ...(typeof args.blendCurve === "string" ? { blendCurve: args.blendCurve as StateMachineTransition["blendCurve"] } : {}),
            ...(typeof args.syncNormalizedTime === "boolean" ? { syncNormalizedTime: args.syncNormalizedTime } : {}),
            ...(typeof args.hasExitTime === "boolean" ? { hasExitTime: args.hasExitTime } : {}),
            ...("exitTime" in args ? { exitTime: num(args, "exitTime") } : {}),
            ...(typeof args.interruptionSource === "string" ? { interruptionSource: args.interruptionSource as StateMachineTransition["interruptionSource"] } : {}),
            ...(Array.isArray(args.conditions) ? { conditions: parseConditions(args.conditions) } : {})
          });

          return {
            ...current,
            transitions: isAnyState ? current.transitions : current.transitions.map((transition) => transition.id === transitionId ? updateOne(transition) : transition),
            anyStateTransitions: isAnyState ? current.anyStateTransitions.map((transition) => transition.id === transitionId ? updateOne(transition) : transition) : current.anyStateTransitions
          };
        });
        return ok({ transitionId });
      }

      case "delete_transition": {
        const graphId = str(args, "graphId");
        const graph = getGraphOrFail(document, graphId);
        const nodeId = str(args, "stateMachineNodeId");
        const node = getNodeOrFail(graph, nodeId);
        if (node.kind !== "stateMachine") {
          return fail("delete_transition only works on stateMachine nodes.");
        }

        const transitionId = str(args, "transitionId");
        const isAnyState = bool(args, "anyState") ?? false;
        store.updateNode(graphId, nodeId, (current) => {
          if (current.kind !== "stateMachine") {
            return current;
          }

          return {
            ...current,
            transitions: isAnyState ? current.transitions : current.transitions.filter((transition) => transition.id !== transitionId),
            anyStateTransitions: isAnyState ? current.anyStateTransitions.filter((transition) => transition.id !== transitionId) : current.anyStateTransitions
          };
        });
        return ok({ transitionId });
      }

      case "compile_document": {
        const result = store.compile();
        return ok({
          diagnosticCount: result.diagnostics.length,
          diagnostics: result.diagnostics.map((diagnostic) => ({
            severity: diagnostic.severity,
            message: diagnostic.message,
            path: diagnostic.path
          }))
        });
      }

      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Tool execution failed.");
  }
}
