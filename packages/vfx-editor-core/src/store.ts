import { compileVfxEffectDocument, type CompileVfxResult } from "@ggez/vfx-compiler";
import type { CompileDiagnostic, EmitterDocument, ModuleInstance, VfxEffectDocument } from "@ggez/vfx-schema";
import { createStableId, Emitter, type Unsubscribe } from "@ggez/anim-utils";
import { createDefaultVfxEffectDocument } from "./defaults";

type StageKey = "deathStage" | "initializeStage" | "spawnStage" | "updateStage";

export type VfxEditorTopic =
  | "compile"
  | "document"
  | "graph"
  | "selection"
  | "emitters"
  | `emitter:${string}`;

export type VfxEditorSelection = {
  graphNodeIds: string[];
  selectedEmitterId?: string;
};

export type VfxEditorState = {
  document: VfxEffectDocument;
  selection: VfxEditorSelection;
  diagnostics: CompileDiagnostic[];
  compileResult?: CompileVfxResult["effect"];
};

type Snapshot = Pick<VfxEditorState, "document" | "selection">;

export type VfxEditorStore = {
  getState(): Readonly<VfxEditorState>;
  subscribe(listener: () => void, topics?: VfxEditorTopic[]): Unsubscribe;
  setDocument(document: VfxEffectDocument): void;
  selectGraphNodes(nodeIds: string[]): void;
  selectEmitter(emitterId?: string): void;
  addEmitterWithGraphNode(input: { name?: string; position: { x: number; y: number } }): { emitterId: string; nodeId: string };
  addGraphNodeWithSelection(
    kind: VfxEffectDocument["graph"]["nodes"][number]["kind"],
    position: { x: number; y: number },
    options?: {
      bindingId?: string;
      name?: string;
    }
  ): string;
  addGraphNode(
    kind: VfxEffectDocument["graph"]["nodes"][number]["kind"],
    position: { x: number; y: number },
    options?: {
      bindingId?: string;
      name?: string;
    }
  ): string;
  moveGraphNodes(positions: Record<string, { x: number; y: number }>): void;
  connectGraphNodes(sourceNodeId: string, targetNodeId: string): string | null;
  deleteSelectedGraphNodes(): void;
  deleteGraphEdges(edgeIds: string[]): void;
  addEmitter(name?: string): string;
  updateEmitter(emitterId: string, updater: (emitter: EmitterDocument) => EmitterDocument): void;
  addStageModule(emitterId: string, stage: "death" | "initialize" | "spawn" | "update", kind: ModuleInstance["kind"]): string;
  updatePreviewSettings(patch: Partial<VfxEffectDocument["preview"]>): void;
  compile(): CompileVfxResult;
  undo(): void;
  redo(): void;
};

function cloneSnapshot(state: VfxEditorState): Snapshot {
  return {
    document: structuredClone(state.document),
    selection: structuredClone(state.selection)
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function createVfxEditorStore(initialDocument = createDefaultVfxEffectDocument()): VfxEditorStore {
  const emitter = new Emitter<Set<VfxEditorTopic>>();
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  const state: VfxEditorState = {
    document: initialDocument,
    selection: {
      graphNodeIds: [],
      selectedEmitterId: initialDocument.emitters[0]?.id
    },
    diagnostics: []
  };

  // Snapshot is replaced with a new object reference after every mutation so that
  // React's useSyncExternalStore (which uses Object.is comparison) detects changes.
  let currentSnapshot: Readonly<VfxEditorState> = { ...state };

  function bumpSnapshot() {
    currentSnapshot = { ...state };
  }

  function notify(topics: VfxEditorTopic[]) {
    emitter.emit(new Set(topics));
  }

  function compileAndStore() {
    const result = compileVfxEffectDocument(state.document);
    state.diagnostics = result.diagnostics;
    state.compileResult = result.effect;
    return result;
  }

  function shouldCompile(topics: VfxEditorTopic[]) {
    return topics.some((topic) => topic === "document" || topic === "graph" || topic === "emitters" || topic.startsWith("emitter:"));
  }

  function commit(mutator: () => void, topics: VfxEditorTopic[]) {
    past.push(cloneSnapshot(state));
    future.length = 0;
    mutator();
    const nextTopics: VfxEditorTopic[] = shouldCompile(topics) ? [...topics, "compile"] : topics;
    if (shouldCompile(topics)) {
      compileAndStore();
    }
    bumpSnapshot();
    notify(nextTopics);
  }

  compileAndStore();
  bumpSnapshot();

  return {
    getState() {
      return currentSnapshot;
    },
    subscribe(listener, topics) {
      return emitter.subscribe((emittedTopics: Set<VfxEditorTopic>) => {
        if (!topics || topics.some((topic) => emittedTopics.has(topic))) {
          listener();
        }
      });
    },
    setDocument(document) {
      commit(() => {
        state.document = structuredClone(document);
      }, ["document", "graph", "emitters"]);
    },
    selectGraphNodes(nodeIds) {
      if (areStringArraysEqual(state.selection.graphNodeIds, nodeIds)) {
        return;
      }

      state.selection = {
        ...state.selection,
        graphNodeIds: nodeIds
      };
      bumpSnapshot();
      notify(["selection"]);
    },
    selectEmitter(emitterId) {
      if (state.selection.selectedEmitterId === emitterId) {
        return;
      }

      state.selection = {
        ...state.selection,
        selectedEmitterId: emitterId
      };
      bumpSnapshot();
      notify(["selection"]);
    },
    addEmitterWithGraphNode(input) {
      const emitterId = createStableId("emitter");
      const nodeId = createStableId("vfx-node");
      const name = input.name ?? "New Emitter";

      commit(() => {
        state.document.emitters.push({
          id: emitterId,
          name,
          simulationDomain: "particle",
          maxParticleCount: 512,
          attributes: {},
          spawnStage: { modules: [] },
          initializeStage: { modules: [] },
          updateStage: { modules: [] },
          deathStage: { modules: [] },
          eventHandlers: [],
          renderers: [],
          sourceBindings: [],
          dataInterfaces: []
        });

        state.document.graph.nodes.push({
          id: nodeId,
          kind: "emitter",
          name,
          position: input.position,
          emitterId
        });

        state.selection = {
          ...state.selection,
          selectedEmitterId: emitterId,
          graphNodeIds: [nodeId]
        };
      }, ["document", "graph", "emitters", `emitter:${emitterId}`, "selection"]);

      return { emitterId, nodeId };
    },
    addGraphNodeWithSelection(kind, position, options) {
      const nodeId = createStableId("vfx-node");

      commit(() => {
        const base = {
          id: nodeId,
          kind,
          name:
            options?.name ??
            (kind === "emitter"
              ? "New Emitter"
              : kind === "parameter"
                ? "Parameter"
                : kind === "event"
                  ? "Event"
                  : "Node"),
          position
        };

        const node =
          kind === "emitter"
            ? { ...base, emitterId: options?.bindingId ?? state.document.emitters[0]?.id ?? "" }
            : kind === "parameter"
              ? { ...base, parameterId: options?.bindingId ?? state.document.parameters[0]?.id }
              : kind === "event"
                ? { ...base, eventId: options?.bindingId ?? state.document.events[0]?.id }
                : kind === "subgraph"
                  ? { ...base, subgraphId: options?.bindingId ?? state.document.subgraphs[0]?.id }
                  : kind === "dataInterface"
                    ? { ...base, bindingId: options?.bindingId ?? state.document.dataInterfaces[0]?.id }
                    : base;

        state.document.graph.nodes.push(node as VfxEffectDocument["graph"]["nodes"][number]);
        state.selection = {
          ...state.selection,
          graphNodeIds: [nodeId],
          selectedEmitterId:
            kind === "emitter"
              ? (node as Extract<VfxEffectDocument["graph"]["nodes"][number], { kind: "emitter" }>).emitterId
              : state.selection.selectedEmitterId
        };
      }, ["document", "graph", "selection"]);

      return nodeId;
    },
    addGraphNode(kind, position, options) {
      const nodeId = createStableId("vfx-node");
      commit(() => {
        const base = {
          id: nodeId,
          kind,
          name: options?.name ?? (kind === "emitter" ? "New Emitter" : kind === "parameter" ? "Parameter" : kind === "event" ? "Event" : "Node"),
          position
        };

        const node =
          kind === "emitter"
            ? { ...base, emitterId: options?.bindingId ?? state.document.emitters[0]?.id ?? "" }
            : kind === "parameter"
              ? { ...base, parameterId: options?.bindingId ?? state.document.parameters[0]?.id }
              : kind === "event"
                ? { ...base, eventId: options?.bindingId ?? state.document.events[0]?.id }
                : kind === "subgraph"
                  ? { ...base, subgraphId: options?.bindingId ?? state.document.subgraphs[0]?.id }
                  : kind === "dataInterface"
                    ? { ...base, bindingId: options?.bindingId ?? state.document.dataInterfaces[0]?.id }
                    : base;

        state.document.graph.nodes.push(node as VfxEffectDocument["graph"]["nodes"][number]);
      }, ["document", "graph"]);
      return nodeId;
    },
    moveGraphNodes(positions) {
      commit(() => {
        state.document.graph.nodes = state.document.graph.nodes.map((node) =>
          positions[node.id]
            ? {
                ...node,
                position: positions[node.id]!
              }
            : node
        );
      }, ["document", "graph"]);
    },
    connectGraphNodes(sourceNodeId, targetNodeId) {
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
        return null;
      }

      const edgeId = createStableId("vfx-edge");
      commit(() => {
        const alreadyExists = state.document.graph.edges.some(
          (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
        );
        if (alreadyExists) {
          return;
        }

        state.document.graph.edges.push({
          id: edgeId,
          sourceNodeId,
          targetNodeId
        });
      }, ["document", "graph"]);

      return edgeId;
    },
    deleteSelectedGraphNodes() {
      const removedNodeIds = new Set(state.selection.graphNodeIds);
      if (removedNodeIds.size === 0) {
        return;
      }

      commit(() => {
        state.document.graph.nodes = state.document.graph.nodes.filter((node) => !removedNodeIds.has(node.id));
        state.document.graph.edges = state.document.graph.edges.filter(
          (edge) => !removedNodeIds.has(edge.sourceNodeId) && !removedNodeIds.has(edge.targetNodeId)
        );
        state.selection.graphNodeIds = [];
      }, ["document", "graph", "selection"]);
    },
    deleteGraphEdges(edgeIds) {
      if (edgeIds.length === 0) {
        return;
      }

      const edgeIdSet = new Set(edgeIds);
      commit(() => {
        state.document.graph.edges = state.document.graph.edges.filter((edge) => !edgeIdSet.has(edge.id));
      }, ["document", "graph"]);
    },
    addEmitter(name = "New Emitter") {
      const emitterId = createStableId("emitter");
      commit(() => {
        state.document.emitters.push({
          id: emitterId,
          name,
          simulationDomain: "particle",
          maxParticleCount: 512,
          attributes: {},
          spawnStage: { modules: [] },
          initializeStage: { modules: [] },
          updateStage: { modules: [] },
          deathStage: { modules: [] },
          eventHandlers: [],
          renderers: [],
          sourceBindings: [],
          dataInterfaces: []
        });
        state.selection.selectedEmitterId = emitterId;
      }, ["document", "emitters", `emitter:${emitterId}`, "selection"]);
      return emitterId;
    },
    updateEmitter(emitterId, updater) {
      commit(() => {
        state.document.emitters = state.document.emitters.map((entry: EmitterDocument) => (entry.id === emitterId ? updater(entry) : entry));
      }, ["document", "emitters", `emitter:${emitterId}`]);
    },
    addStageModule(emitterId, stage, kind) {
      const moduleId = createStableId("module");
      const stageKey: StageKey =
        stage === "spawn"
          ? "spawnStage"
          : stage === "initialize"
            ? "initializeStage"
            : stage === "update"
              ? "updateStage"
              : "deathStage";
      commit(() => {
        state.document.emitters = state.document.emitters.map((entry: EmitterDocument) => {
          if (entry.id !== emitterId) {
            return entry;
          }

          const nextModules = [...entry[stageKey].modules, { id: moduleId, kind, enabled: true, config: {} }];
          return {
            ...entry,
            [stageKey]: {
              modules: nextModules
            }
          } as EmitterDocument;
        });
      }, ["document", "emitters", `emitter:${emitterId}`]);
      return moduleId;
    },
    updatePreviewSettings(patch) {
      const nextPreview = {
        ...state.document.preview,
        ...patch
      };

      if (
        nextPreview.attachMode === state.document.preview.attachMode &&
        nextPreview.durationSeconds === state.document.preview.durationSeconds &&
        nextPreview.loop === state.document.preview.loop &&
        nextPreview.playbackRate === state.document.preview.playbackRate
      ) {
        return;
      }

      commit(() => {
        state.document.preview = nextPreview;
      }, ["document"]);
    },
    compile() {
      const result = compileAndStore();
      bumpSnapshot();
      return result;
    },
    undo() {
      const snapshot = past.pop();
      if (!snapshot) {
        return;
      }

      future.push(cloneSnapshot(state));
      state.document = snapshot.document;
      state.selection = snapshot.selection;
      compileAndStore();
      bumpSnapshot();
      notify(["document", "graph", "emitters", "selection", "compile"]);
    },
    redo() {
      const snapshot = future.pop();
      if (!snapshot) {
        return;
      }

      past.push(cloneSnapshot(state));
      state.document = snapshot.document;
      state.selection = snapshot.selection;
      compileAndStore();
      bumpSnapshot();
      notify(["document", "graph", "emitters", "selection", "compile"]);
    }
  };
}
