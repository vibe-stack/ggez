import { compileAnimationEditorDocument, type CompileDiagnostic, type CompileResult } from "@ggez/anim-compiler";
import type {
  AnimationEditorDocument,
  BoneMaskDefinition,
  ClipReference,
  EditorGraph,
  EditorGraphNode,
  EditorLayer,
  ParameterDefinition,
  SecondaryDynamicsProfile,
  SerializableRig
} from "@ggez/anim-schema";
import { createStableId, Emitter, type Unsubscribe } from "@ggez/anim-utils";
import { createDefaultAnimationEditorDocument, createDefaultNode } from "./defaults";

export type EditorTopic =
  | "document"
  | "selection"
  | "graphs"
  | "parameters"
  | "layers"
  | "masks"
  | "dynamics"
  | "compile"
  | "clipboard"
  | `graph:${string}`
  | `node:${string}`;

export interface AnimationEditorSelection {
  graphId: string;
  nodeIds: string[];
}

export interface AnimationEditorClipboard {
  graphId: string;
  nodes: EditorGraphNode[];
}

export interface AnimationEditorState {
  document: AnimationEditorDocument;
  selection: AnimationEditorSelection;
  diagnostics: CompileDiagnostic[];
  compileResult?: CompileResult;
  clipboard?: AnimationEditorClipboard;
}

type Snapshot = Pick<AnimationEditorState, "document" | "selection">;

export interface AnimationEditorStore {
  getState(): Readonly<AnimationEditorState>;
  getRevision(): number;
  subscribe(listener: () => void, topics?: EditorTopic[]): Unsubscribe;
  clearHistory(): void;
  setDocument(document: AnimationEditorDocument): void;
  selectGraph(graphId: string): void;
  selectNodes(nodeIds: string[]): void;
  setEntryGraph(graphId: string): void;
  addGraph(name?: string): string;
  renameGraph(graphId: string, name: string): void;
  addNode(graphId: string, kind: EditorGraphNode["kind"]): string;
  updateNode(graphId: string, nodeId: string, updater: (node: EditorGraphNode) => EditorGraphNode): void;
  moveNodes(graphId: string, positions: Record<string, { x: number; y: number }>): void;
  connectNodes(graphId: string, sourceNodeId: string, targetNodeId: string): void;
  deleteSelectedNodes(): void;
  deleteEdges(graphId: string, edgeIds: string[]): void;
  duplicateSelection(): void;
  copySelection(): void;
  pasteSelection(): void;
  addParameter(parameter?: Partial<ParameterDefinition>): void;
  updateParameter(parameterId: string, patch: Partial<ParameterDefinition>): void;
  deleteParameter(parameterId: string): void;
  addLayer(layer?: Partial<EditorLayer>): void;
  updateLayer(layerId: string, patch: Partial<EditorLayer>): void;
  addMask(mask?: Partial<BoneMaskDefinition>): void;
  updateMask(maskId: string, patch: Partial<BoneMaskDefinition>): void;
  addDynamicsProfile(profile?: Partial<SecondaryDynamicsProfile>): string;
  updateDynamicsProfile(profileId: string, updater: (profile: SecondaryDynamicsProfile) => SecondaryDynamicsProfile): void;
  deleteDynamicsProfile(profileId: string): void;
  addClip(clip?: Partial<ClipReference>): void;
  updateClip(clipId: string, patch: Partial<ClipReference>): void;
  deleteClip(clipId: string): void;
  setRig(rig?: SerializableRig): void;
  upsertClips(clips: ClipReference[]): void;
  compile(): CompileResult;
  undo(): void;
  redo(): void;
}

function cloneSnapshot(state: AnimationEditorState): Snapshot {
  return {
    document: structuredClone(state.document),
    selection: structuredClone(state.selection)
  };
}

function replaceNode(graph: EditorGraph, nodeId: string, nextNode: EditorGraphNode): EditorGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? nextNode : node))
  };
}

function disconnectSourceFromTarget(graph: EditorGraph, sourceNodeId: string, targetNodeId: string): EditorGraph {
  const targetNode = graph.nodes.find((node) => node.id === targetNodeId);
  if (!targetNode) {
    return graph;
  }

  if (targetNode.kind === "output" && targetNode.sourceNodeId === sourceNodeId) {
    return replaceNode(graph, targetNode.id, {
      ...targetNode,
      sourceNodeId: undefined
    });
  }

  if (targetNode.kind === "blend1d") {
    return replaceNode(graph, targetNode.id, {
      ...targetNode,
      children: targetNode.children.filter((child) => child.nodeId !== sourceNodeId)
    });
  }

  if (targetNode.kind === "blend2d") {
    return replaceNode(graph, targetNode.id, {
      ...targetNode,
      children: targetNode.children.filter((child) => child.nodeId !== sourceNodeId)
    });
  }

  if (targetNode.kind === "selector") {
    return replaceNode(graph, targetNode.id, {
      ...targetNode,
      children: targetNode.children.filter((child) => child.nodeId !== sourceNodeId)
    });
  }

  if ((targetNode.kind === "orientationWarp" || targetNode.kind === "strideWarp" || targetNode.kind === "secondaryDynamics") && targetNode.sourceNodeId === sourceNodeId) {
    return replaceNode(graph, targetNode.id, {
      ...targetNode,
      sourceNodeId: undefined
    });
  }

  return graph;
}

function removeNodeReferences(graph: EditorGraph, removedNodeIds: Set<string>): EditorGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.kind === "output") {
        return removedNodeIds.has(node.sourceNodeId ?? "") ? { ...node, sourceNodeId: undefined } : node;
      }

      if (node.kind === "blend1d") {
        return {
          ...node,
          children: node.children.filter((child) => !removedNodeIds.has(child.nodeId))
        };
      }

      if (node.kind === "blend2d") {
        return {
          ...node,
          children: node.children.filter((child) => !removedNodeIds.has(child.nodeId))
        };
      }

      if (node.kind === "selector") {
        return {
          ...node,
          children: node.children.filter((child) => !removedNodeIds.has(child.nodeId))
        };
      }

      if (node.kind === "orientationWarp" || node.kind === "strideWarp" || node.kind === "secondaryDynamics") {
        return removedNodeIds.has(node.sourceNodeId ?? "") ? { ...node, sourceNodeId: undefined } : node;
      }

      if (node.kind === "stateMachine") {
        return {
          ...node,
          states: node.states.map((state) =>
            removedNodeIds.has(state.motionNodeId)
              ? {
                  ...state,
                  motionNodeId: ""
                }
              : state
          )
        };
      }

      return node;
    })
  };
}

function deriveGraphTopics(graphId: string, nodeIds: string[] = []): EditorTopic[] {
  return ["document", "graphs", `graph:${graphId}`, ...nodeIds.map((nodeId) => `node:${nodeId}` as const)];
}

export function createAnimationEditorStore(initialDocument = createDefaultAnimationEditorDocument()): AnimationEditorStore {
  const emitter = new Emitter<Set<EditorTopic>>();
  const historyPast: Snapshot[] = [];
  const historyFuture: Snapshot[] = [];
  let revision = 0;
  const state: AnimationEditorState = {
    document: initialDocument,
    selection: {
      graphId: initialDocument.entryGraphId,
      nodeIds: []
    },
    diagnostics: []
  };

  function createUniqueGraphId(): string {
    const existingIds = new Set(state.document.graphs.map((graph) => graph.id));
    let graphId = createStableId("graph");

    while (existingIds.has(graphId)) {
      graphId = createStableId("graph");
    }

    return graphId;
  }

  function notify(topics: EditorTopic[]): void {
    revision += 1;
    emitter.emit(new Set(topics));
  }

  function commit(topics: EditorTopic[], mutator: () => void): void {
    historyPast.push(cloneSnapshot(state));
    historyFuture.length = 0;
    mutator();
    notify(topics);
  }

  function getSelectedGraph(): EditorGraph {
    const graph = state.document.graphs.find((entry) => entry.id === state.selection.graphId);
    if (!graph) {
      throw new Error(`Unknown selected graph "${state.selection.graphId}".`);
    }
    return graph;
  }

  function updateGraph(graphId: string, updater: (graph: EditorGraph) => EditorGraph): void {
    state.document = {
      ...state.document,
      graphs: state.document.graphs.map((graph) => (graph.id === graphId ? updater(graph) : graph))
    };
  }

  function setStateFromSnapshot(snapshot: Snapshot): void {
    state.document = snapshot.document;
    state.selection = snapshot.selection;
  }

  return {
    getState() {
      return state;
    },
    getRevision() {
      return revision;
    },
    subscribe(listener, topics = ["document"]) {
      return emitter.subscribe((changedTopics) => {
        if (topics.some((topic) => changedTopics.has(topic))) {
          listener();
        }
      });
    },
    clearHistory() {
      historyPast.length = 0;
      historyFuture.length = 0;
    },
    setDocument(document) {
      commit(["document", "selection", "graphs", "parameters", "layers", "masks", "dynamics", "compile", "clipboard"], () => {
        state.document = structuredClone(document);
        state.selection = {
          graphId: document.entryGraphId,
          nodeIds: []
        };
        state.diagnostics = [];
        state.compileResult = undefined;
        state.clipboard = undefined;
      });
    },
    selectGraph(graphId) {
      state.selection = { graphId, nodeIds: [] };
      notify(["selection", "graphs", `graph:${graphId}`]);
    },
    selectNodes(nodeIds) {
      state.selection = {
        ...state.selection,
        nodeIds
      };
      notify(["selection", `graph:${state.selection.graphId}`, ...nodeIds.map((nodeId) => `node:${nodeId}` as const)]);
    },
    setEntryGraph(graphId) {
      commit(["document", "graphs", `graph:${graphId}`], () => {
        state.document = {
          ...state.document,
          entryGraphId: graphId
        };
      });
    },
    addGraph(name = "New Graph") {
      const outputNode = createDefaultNode("output", "Output");
      const graphId = createUniqueGraphId();
      commit(["document", "graphs", `graph:${graphId}`], () => {
        state.document = {
          ...state.document,
          graphs: [
            ...state.document.graphs,
            {
              id: graphId,
              name,
              outputNodeId: outputNode.id,
              nodes: [
                {
                  ...outputNode,
                  position: { x: 320, y: 120 }
                }
              ],
              edges: []
            }
          ]
        };
        state.selection = { graphId, nodeIds: [] };
      });
      return graphId;
    },
    renameGraph(graphId, name) {
      commit(["document", "graphs", `graph:${graphId}`], () => {
        updateGraph(graphId, (graph) => ({ ...graph, name }));
      });
    },
    addNode(graphId, kind) {
      const node = createDefaultNode(
        kind,
        kind === "blend1d"
          ? "Blend 1D"
          : kind === "blend2d"
            ? "Blend 2D"
            : kind === "selector"
              ? "Selector"
              : kind === "orientationWarp"
                ? "Orientation Warp"
                : kind === "strideWarp"
                  ? "Stride Warp"
                    : kind === "secondaryDynamics"
                      ? "Secondary Dynamics"
              : kind
      );
      const graph = state.document.graphs.find((entry) => entry.id === graphId);
      if (!graph) {
        throw new Error(`Unknown graph "${graphId}".`);
      }

      commit(deriveGraphTopics(graphId, [node.id]), () => {
        updateGraph(graphId, (currentGraph) => ({
          ...currentGraph,
          nodes: [
            ...currentGraph.nodes,
            {
              ...node,
              position: {
                x: 120 + currentGraph.nodes.length * 24,
                y: 120 + currentGraph.nodes.length * 24
              }
            }
          ]
        }));
        state.selection = { graphId, nodeIds: [node.id] };
      });
      return node.id;
    },
    updateNode(graphId, nodeId, updater) {
      commit(deriveGraphTopics(graphId, [nodeId]), () => {
        updateGraph(graphId, (graph) => {
          const node = graph.nodes.find((entry) => entry.id === nodeId);
          if (!node) {
            return graph;
          }
          return replaceNode(graph, nodeId, updater(node));
        });
      });
    },
    moveNodes(graphId, positions) {
      commit(deriveGraphTopics(graphId, Object.keys(positions)), () => {
        updateGraph(graphId, (graph) => ({
          ...graph,
          nodes: graph.nodes.map((node) =>
            positions[node.id]
              ? {
                  ...node,
                  position: positions[node.id]!
                }
              : node
          )
        }));
      });
    },
    connectNodes(graphId, sourceNodeId, targetNodeId) {
      commit(deriveGraphTopics(graphId, [sourceNodeId, targetNodeId]), () => {
        updateGraph(graphId, (graph) => {
          const targetNode = graph.nodes.find((node) => node.id === targetNodeId);
          if (!targetNode) {
            return graph;
          }

          let nextGraph = graph;
          if (targetNode.kind === "output") {
            nextGraph = replaceNode(graph, targetNodeId, {
              ...targetNode,
              sourceNodeId
            });
          } else if (targetNode.kind === "blend1d") {
            nextGraph = replaceNode(graph, targetNodeId, {
              ...targetNode,
              children: [
                ...targetNode.children.filter((child) => child.nodeId !== sourceNodeId),
                {
                  nodeId: sourceNodeId,
                  threshold: targetNode.children.length
                }
              ]
            });
          } else if (targetNode.kind === "blend2d") {
            nextGraph = replaceNode(graph, targetNodeId, {
              ...targetNode,
              children: [
                ...targetNode.children.filter((child) => child.nodeId !== sourceNodeId),
                {
                  nodeId: sourceNodeId,
                  x: targetNode.children.length,
                  y: 0
                }
              ]
            });
          } else if (targetNode.kind === "selector") {
            nextGraph = replaceNode(graph, targetNodeId, {
              ...targetNode,
              children: [
                ...targetNode.children.filter((child) => child.nodeId !== sourceNodeId),
                {
                  nodeId: sourceNodeId,
                  value: targetNode.children.length
                }
              ]
            });
          } else if (targetNode.kind === "orientationWarp" || targetNode.kind === "strideWarp" || targetNode.kind === "secondaryDynamics") {
            nextGraph = replaceNode(graph, targetNodeId, {
              ...targetNode,
              sourceNodeId
            });
          }

          const edgeId = `${sourceNodeId}->${targetNodeId}`;
          return {
            ...nextGraph,
            edges: [
              ...nextGraph.edges.filter((edge) => edge.id !== edgeId),
              {
                id: edgeId,
                sourceNodeId,
                targetNodeId
              }
            ]
          };
        });
      });
    },
    deleteSelectedNodes() {
      const { graphId, nodeIds } = state.selection;
      if (nodeIds.length === 0) {
        return;
      }

      commit(deriveGraphTopics(graphId, nodeIds), () => {
        updateGraph(graphId, (graph) => {
          const protectedNodeIds = new Set(
            graph.nodes
              .filter((node) => node.kind === "output" || node.id === graph.outputNodeId)
              .map((node) => node.id)
          );
          const removableNodeIds = nodeIds.filter((nodeId) => !protectedNodeIds.has(nodeId));
          const removedNodeIdSet = new Set(removableNodeIds);
          const nextGraph = removeNodeReferences(
            {
              ...graph,
              nodes: graph.nodes.filter((node) => !removedNodeIdSet.has(node.id)),
              edges: graph.edges.filter((edge) => !removedNodeIdSet.has(edge.sourceNodeId) && !removedNodeIdSet.has(edge.targetNodeId))
            },
            removedNodeIdSet
          );

          return nextGraph;
        });
        state.selection = { graphId, nodeIds: [] };
      });
    },
    deleteEdges(graphId, edgeIds) {
      if (edgeIds.length === 0) {
        return;
      }

      commit(deriveGraphTopics(graphId), () => {
        updateGraph(graphId, (graph) => {
          const edgesToDelete = graph.edges.filter((edge) => edgeIds.includes(edge.id));
          let nextGraph: EditorGraph = {
            ...graph,
            edges: graph.edges.filter((edge) => !edgeIds.includes(edge.id))
          };

          edgesToDelete.forEach((edge) => {
            nextGraph = disconnectSourceFromTarget(nextGraph, edge.sourceNodeId, edge.targetNodeId);
          });

          return nextGraph;
        });
      });
    },
    duplicateSelection() {
      const { graphId, nodeIds } = state.selection;
      const graph = getSelectedGraph();
      const nodes = graph.nodes.filter((node) => nodeIds.includes(node.id));
      if (nodes.length === 0) {
        return;
      }

      commit(deriveGraphTopics(graphId), () => {
        const duplicatedNodes = nodes.map((node) => ({
          ...structuredClone(node),
          id: createStableId(node.kind),
          position: {
            x: node.position.x + 32,
            y: node.position.y + 32
          }
        }));
        updateGraph(graphId, (currentGraph) => ({
          ...currentGraph,
          nodes: [...currentGraph.nodes, ...duplicatedNodes]
        }));
        state.selection = { graphId, nodeIds: duplicatedNodes.map((node) => node.id) };
      });
    },
    copySelection() {
      const graph = getSelectedGraph();
      state.clipboard = {
        graphId: graph.id,
        nodes: graph.nodes.filter((node) => state.selection.nodeIds.includes(node.id)).map((node) => structuredClone(node))
      };
      notify(["clipboard"]);
    },
    pasteSelection() {
      if (!state.clipboard || state.clipboard.nodes.length === 0) {
        return;
      }

      const graphId = state.selection.graphId;
      commit(deriveGraphTopics(graphId), () => {
        const pastedNodes = state.clipboard!.nodes.map((node) => ({
          ...structuredClone(node),
          id: createStableId(node.kind),
          position: {
            x: node.position.x + 40,
            y: node.position.y + 40
          }
        }));
        updateGraph(graphId, (graph) => ({
          ...graph,
          nodes: [...graph.nodes, ...pastedNodes]
        }));
        state.selection = { graphId, nodeIds: pastedNodes.map((node) => node.id) };
      });
    },
    addParameter(parameter = {}) {
      commit(["document", "parameters"], () => {
        state.document = {
          ...state.document,
          parameters: [
            ...state.document.parameters,
            {
              id: createStableId("param"),
              name: parameter.name ?? `param_${state.document.parameters.length}`,
              type: parameter.type ?? "float",
              defaultValue: parameter.defaultValue ?? 0,
              ...(parameter.smoothingDuration !== undefined ? { smoothingDuration: parameter.smoothingDuration } : {})
            }
          ]
        };
      });
    },
    updateParameter(parameterId, patch) {
      commit(["document", "parameters"], () => {
        state.document = {
          ...state.document,
          parameters: state.document.parameters.map((parameter) =>
            parameter.id === parameterId ? { ...parameter, ...patch } : parameter
          )
        };
      });
    },
    deleteParameter(parameterId) {
      commit(["document", "parameters"], () => {
        state.document = {
          ...state.document,
          parameters: state.document.parameters.filter((parameter) => parameter.id !== parameterId)
        };
      });
    },
    addLayer(layer = {}) {
      commit(["document", "layers"], () => {
        state.document = {
          ...state.document,
          layers: [
            ...state.document.layers,
            {
              id: createStableId("layer"),
              name: layer.name ?? `Layer ${state.document.layers.length + 1}`,
              graphId: layer.graphId ?? state.selection.graphId,
              weight: layer.weight ?? 1,
              blendMode: layer.blendMode ?? "override",
              rootMotionMode: layer.rootMotionMode ?? "none",
              enabled: layer.enabled ?? true,
              maskId: layer.maskId
            }
          ]
        };
      });
    },
    updateLayer(layerId, patch) {
      commit(["document", "layers"], () => {
        state.document = {
          ...state.document,
          layers: state.document.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer))
        };
      });
    },
    addMask(mask = {}) {
      commit(["document", "masks"], () => {
        state.document = {
          ...state.document,
          masks: [
            ...state.document.masks,
            {
              id: createStableId("mask"),
              name: mask.name ?? `Mask ${state.document.masks.length + 1}`,
              rootBoneName: mask.rootBoneName,
              includeChildren: mask.includeChildren ?? true,
              weights: mask.weights ?? []
            }
          ]
        };
      });
    },
    updateMask(maskId, patch) {
      commit(["document", "masks"], () => {
        state.document = {
          ...state.document,
          masks: state.document.masks.map((mask) => (mask.id === maskId ? { ...mask, ...patch } : mask))
        };
      });
    },
    addDynamicsProfile(profile = {}) {
      const profileId = profile.id ?? createStableId("dyn-profile");
      commit(["document", "dynamics"], () => {
        state.document = {
          ...state.document,
          dynamicsProfiles: [
            ...state.document.dynamicsProfiles,
            {
              id: profileId,
              name: profile.name ?? `Dynamics ${state.document.dynamicsProfiles.length + 1}`,
              iterations: profile.iterations ?? 4,
              chains: profile.chains ?? [],
              sphereColliders: profile.sphereColliders ?? []
            }
          ]
        };
      });
      return profileId;
    },
    updateDynamicsProfile(profileId, updater) {
      commit(["document", "dynamics"], () => {
        state.document = {
          ...state.document,
          dynamicsProfiles: state.document.dynamicsProfiles.map((profile) =>
            profile.id === profileId ? updater(profile) : profile
          )
        };
      });
    },
    deleteDynamicsProfile(profileId) {
      commit(["document", "dynamics", "graphs"], () => {
        state.document = {
          ...state.document,
          dynamicsProfiles: state.document.dynamicsProfiles.filter((profile) => profile.id !== profileId),
          graphs: state.document.graphs.map((graph) => ({
            ...graph,
            nodes: graph.nodes.map((node) =>
              node.kind === "secondaryDynamics" && node.profileId === profileId
                ? { ...node, profileId: "" }
                : node
            )
          }))
        };
      });
    },
    addClip(clip = {}) {
      commit(["document"], () => {
        state.document = {
          ...state.document,
          clips: [
            ...state.document.clips,
            {
              id: clip.id ?? createStableId("clip-ref"),
              name: clip.name ?? `Clip ${state.document.clips.length + 1}`,
              duration: clip.duration ?? 1,
              source: clip.source
            }
          ]
        };
      });
    },
    updateClip(clipId, patch) {
      commit(["document"], () => {
        state.document = {
          ...state.document,
          clips: state.document.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip))
        };
      });
    },
    deleteClip(clipId) {
      commit(["document"], () => {
        state.document = {
          ...state.document,
          clips: state.document.clips.filter((clip) => clip.id !== clipId)
        };
      });
    },
    setRig(rig) {
      commit(["document"], () => {
        state.document = {
          ...state.document,
          rig
        };
      });
    },
    upsertClips(clips) {
      commit(["document"], () => {
        const existingById = new Map(state.document.clips.map((clip) => [clip.id, clip]));

        for (const clip of clips) {
          existingById.set(clip.id, {
            ...existingById.get(clip.id),
            ...clip
          });
        }

        state.document = {
          ...state.document,
          clips: Array.from(existingById.values())
        };
      });
    },
    compile() {
      const result = compileAnimationEditorDocument(state.document);
      state.compileResult = result;
      state.diagnostics = result.diagnostics;
      notify(["compile"]);
      return result;
    },
    undo() {
      const snapshot = historyPast.pop();
      if (!snapshot) {
        return;
      }
      historyFuture.push(cloneSnapshot(state));
      setStateFromSnapshot(snapshot);
      notify(["document", "selection", "graphs"]);
    },
    redo() {
      const snapshot = historyFuture.pop();
      if (!snapshot) {
        return;
      }
      historyPast.push(cloneSnapshot(state));
      setStateFromSnapshot(snapshot);
      notify(["document", "selection", "graphs"]);
    }
  };
}
