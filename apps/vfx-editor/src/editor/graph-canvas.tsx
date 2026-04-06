import {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import type { EffectGraph, EffectGraphNode, EmitterDocument, ModuleInstance } from "@ggez/vfx-schema";
import { Boxes, Cable, Gauge, Layers3, Orbit, Sparkles, Workflow } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { EmitterNode, type EmitterNodeData, type EmitterStageData, type StageName } from "./emitter-node";

// Stable nodeTypes reference - must live outside the component.
const nodeTypes = { "emitter-node": EmitterNode };

const STAGE_ACCENTS: Record<StageName, string> = {
  spawn: "bg-sky-400",
  initialize: "bg-emerald-400",
  update: "bg-violet-400",
  death: "bg-rose-400"
};

const STAGE_LABELS: Record<StageName, string> = {
  spawn: "Spawn",
  initialize: "Initialize",
  update: "Update",
  death: "Death"
};

const STAGE_KEYS: Array<{
  stage: StageName;
  docKey: keyof Pick<EmitterDocument, "spawnStage" | "initializeStage" | "updateStage" | "deathStage">;
}> = [
  { stage: "spawn", docKey: "spawnStage" },
  { stage: "initialize", docKey: "initializeStage" },
  { stage: "update", docKey: "updateStage" },
  { stage: "death", docKey: "deathStage" }
];

type FlowNodeData = {
  kind: EffectGraphNode["kind"];
  name: string;
  subtitle: string;
  label: ReactNode;
};

const NODE_ICONS: Record<EffectGraphNode["kind"], typeof Sparkles> = {
  comment: Workflow,
  dataInterface: Cable,
  emitter: Sparkles,
  event: Orbit,
  output: Layers3,
  parameter: Boxes,
  scalability: Gauge,
  subgraph: Workflow
};

function getNodeSubtitle(node: EffectGraphNode) {
  switch (node.kind) {
    case "emitter": return node.emitterId;
    case "parameter": return node.parameterId ?? "unassigned parameter";
    case "event": return node.eventId ?? "unassigned event";
    case "dataInterface": return node.bindingId ?? "unassigned interface";
    case "subgraph": return node.subgraphId ?? "unassigned subgraph";
    case "scalability": return "lod / budgets / fallbacks";
    case "output": return "compiled effect output";
    default: return "note";
  }
}

function computeEmitterFingerprint(doc: EmitterDocument): string {
  const allModules = [
    ...doc.spawnStage.modules,
    ...doc.initializeStage.modules,
    ...doc.updateStage.modules,
    ...doc.deathStage.modules
  ];
  return allModules.map((m) => `${m.id}:${m.enabled}`).join(",");
}

function toGenericNode(node: EffectGraphNode, selected: boolean): Node<FlowNodeData> {
  const Icon = NODE_ICONS[node.kind];
  const subtitle = getNodeSubtitle(node);
  return {
    id: node.id,
    position: node.position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected,
    data: {
      kind: node.kind,
      name: node.name,
      subtitle,
      label: (
        <div className="flex h-full flex-col gap-1 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-emerald-300/55">
            <Icon className="size-3.5" />
            <span>{node.kind}</span>
          </div>
          <div className="text-sm font-medium text-emerald-50">{node.name}</div>
          <div className="text-[11px] text-zinc-400">{subtitle}</div>
        </div>
      )
    },
    className: selected ? "selected" : undefined,
    draggable: true,
    selectable: true,
    type: "default",
    style: { padding: 0 },
    width: 230,
    height: 92
  };
}

function toEmitterNode(
  node: EffectGraphNode & { kind: "emitter" },
  selected: boolean,
  emitterDoc: EmitterDocument,
  fingerprint: string,
  selectedModuleId: string | null,
  stagePresets: Record<StageName, ModuleInstance["kind"][]>,
  onAddModule: (stage: StageName, kind: ModuleInstance["kind"]) => void,
  onRemoveModule: (stage: StageName, moduleId: string) => void,
  onSelectModule: (stage: StageName, moduleId: string) => void
): Node<EmitterNodeData> {
  const stages: EmitterStageData[] = STAGE_KEYS.map(({ stage, docKey }) => ({
    name: stage,
    label: STAGE_LABELS[stage],
    accent: STAGE_ACCENTS[stage],
    modules: emitterDoc[docKey].modules.map((m) => ({
      id: m.id,
      label: m.label,
      kind: m.kind,
      enabled: m.enabled
    })),
    presets: stagePresets[stage]
  }));

  return {
    id: node.id,
    position: node.position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected,
    data: {
      kind: "emitter",
      name: node.name,
      subtitle: node.emitterId,
      label: null,
      emitterName: node.name,
      emitterFingerprint: fingerprint,
      stages,
      selectedModuleId,
      onAddModule,
      onRemoveModule,
      onSelectModule
    },
    className: selected ? "selected" : undefined,
    draggable: true,
    selectable: true,
    type: "emitter-node",
    style: { padding: 0 },
    width: 272
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

function areCanvasNodesEqual(left: Node[], right: Node[]) {
  if (left.length !== right.length) return false;
  return left.every((node, index) => {
    const c = right[index];
    if (!c) return false;
    if (node.id !== c.id || node.selected !== c.selected || node.type !== c.type) return false;
    if (node.position.x !== c.position.x || node.position.y !== c.position.y) return false;
    if (node.type === "emitter-node") {
      const ld = node.data as EmitterNodeData;
      const rd = c.data as EmitterNodeData;
      return ld.emitterFingerprint === rd.emitterFingerprint && ld.selectedModuleId === rd.selectedModuleId;
    }
    const ld = node.data as FlowNodeData;
    const rd = c.data as FlowNodeData;
    return ld.kind === rd.kind && ld.name === rd.name && ld.subtitle === rd.subtitle;
  });
}

function areCanvasEdgesEqual(left: Edge[], right: Edge[]) {
  if (left.length !== right.length) return false;
  return left.every((edge, i) => {
    const c = right[i];
    return c && edge.id === c.id && edge.source === c.source && edge.target === c.target && edge.selected === c.selected && edge.label === c.label;
  });
}

type NodeCacheEntry = {
  graphNode: EffectGraphNode;
  selected: boolean;
  emitterFingerprint: string;
  selectedModuleId: string | null;
  flowNode: Node;
};

export function GraphCanvas(props: {
  graph: EffectGraph;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  emitterDocuments: Map<string, EmitterDocument>;
  selectedModuleId: string | null;
  stagePresets: Record<StageName, ModuleInstance["kind"][]>;
  onEdgeSelectionChange(edgeIds: string[]): void;
  onSelectionChange(nodeIds: string[]): void;
  onConnect(connection: Connection): void;
  onNodeDragStop(nodeId: string, position: { x: number; y: number }): void;
  onDeleteNodes(): void;
  onDeleteEdges(edgeIds: string[]): void;
  onAddStageModule(emitterId: string, stage: StageName, kind: ModuleInstance["kind"]): void;
  onRemoveStageModule(emitterId: string, stage: StageName, moduleId: string): void;
  onSelectModule(emitterId: string, stage: StageName, moduleId: string): void;
}) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const lastSelectedNodeIdsRef = useRef(props.selectedNodeIds);
  const selectedEdgeIdsRef = useRef(props.selectedEdgeIds);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const nodeCacheRef = useRef<Map<string, NodeCacheEntry>>(new Map());

  const stableOnAddModule = useCallback((emitterId: string, stage: StageName, kind: ModuleInstance["kind"]) => {
    propsRef.current.onAddStageModule(emitterId, stage, kind);
  }, []);
  const stableOnRemoveModule = useCallback((emitterId: string, stage: StageName, moduleId: string) => {
    propsRef.current.onRemoveStageModule(emitterId, stage, moduleId);
  }, []);
  const stableOnSelectModule = useCallback((emitterId: string, stage: StageName, moduleId: string) => {
    propsRef.current.onSelectModule(emitterId, stage, moduleId);
  }, []);

  const computedNodes = useMemo(() => {
    const prevCache = nodeCacheRef.current;
    const nextCache = new Map<string, NodeCacheEntry>();

    const result = props.graph.nodes.map((graphNode) => {
      const selected = props.selectedNodeIds.includes(graphNode.id);

      if (graphNode.kind === "emitter") {
        const emitterDoc = props.emitterDocuments.get(graphNode.emitterId);
        const fingerprint = emitterDoc ? computeEmitterFingerprint(emitterDoc) : "";
        const selectedModuleId = props.selectedModuleId;
        const cached = prevCache.get(graphNode.id);

        let flowNode: Node;
        if (
          cached &&
          cached.graphNode === graphNode &&
          cached.selected === selected &&
          cached.emitterFingerprint === fingerprint &&
          cached.selectedModuleId === selectedModuleId
        ) {
          flowNode = cached.flowNode;
        } else if (emitterDoc) {
          const emitterId = graphNode.emitterId;
          flowNode = toEmitterNode(
            graphNode,
            selected,
            emitterDoc,
            fingerprint,
            selectedModuleId,
            props.stagePresets,
            (stage, kind) => stableOnAddModule(emitterId, stage, kind),
            (stage, moduleId) => stableOnRemoveModule(emitterId, stage, moduleId),
            (stage, moduleId) => stableOnSelectModule(emitterId, stage, moduleId)
          );
        } else {
          flowNode = toGenericNode(graphNode, selected);
        }

        nextCache.set(graphNode.id, { graphNode, selected, emitterFingerprint: fingerprint, selectedModuleId, flowNode });
        return flowNode;
      }

      const cached = prevCache.get(graphNode.id);
      let flowNode: Node;
      if (cached && cached.graphNode === graphNode && cached.selected === selected) {
        flowNode = cached.flowNode;
      } else {
        flowNode = toGenericNode(graphNode, selected);
      }
      nextCache.set(graphNode.id, { graphNode, selected, emitterFingerprint: "", selectedModuleId: null, flowNode });
      return flowNode;
    });

    nodeCacheRef.current = nextCache;
    return result;
  }, [
    props.graph.nodes,
    props.selectedNodeIds,
    props.emitterDocuments,
    props.selectedModuleId,
    props.stagePresets,
    stableOnAddModule,
    stableOnRemoveModule,
    stableOnSelectModule
  ]);

  const computedEdges = useMemo(
    () => props.graph.edges.map((edge) => toEdge(edge, props.selectedEdgeIds.includes(edge.id))),
    [props.graph.edges, props.selectedEdgeIds]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes((current) => (areCanvasNodesEqual(current, computedNodes) ? current : computedNodes));
  }, [computedNodes, setNodes]);

  useEffect(() => {
    setEdges((current) => (areCanvasEdgesEqual(current, computedEdges) ? current : computedEdges));
  }, [computedEdges, setEdges]);

  useEffect(() => { lastSelectedNodeIdsRef.current = props.selectedNodeIds; }, [props.selectedNodeIds]);
  useEffect(() => { selectedEdgeIdsRef.current = props.selectedEdgeIds; }, [props.selectedEdgeIds]);

  useEffect(() => {
    if (!reactFlowRef.current) return;
    reactFlowRef.current.fitView({ padding: 0.16, duration: 180 });
  }, [props.graph.nodes.length, props.graph.edges.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isTypingTarget || (event.key !== "Backspace" && event.key !== "Delete")) return;

      const { selectedNodeIds, onDeleteEdges, onEdgeSelectionChange, onDeleteNodes } = propsRef.current;
      if (selectedEdgeIdsRef.current.length === 0 && selectedNodeIds.length === 0) return;
      event.preventDefault();

      if (selectedEdgeIdsRef.current.length > 0) {
        const edgeIds = [...selectedEdgeIdsRef.current];
        selectedEdgeIdsRef.current = [];
        onDeleteEdges(edgeIds);
        onEdgeSelectionChange([]);
        return;
      }
      onDeleteNodes();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectionChange = useCallback((selection: { nodes: Node[]; edges: Edge[] }) => {
    const { onSelectionChange, onEdgeSelectionChange } = propsRef.current;
    const nextNodeIds = (selection.nodes ?? []).map((n) => n.id);
    const nextEdgeIds = (selection.edges ?? []).map((e) => e.id);
    if (!areStringArraysEqual(lastSelectedNodeIdsRef.current, nextNodeIds)) {
      lastSelectedNodeIdsRef.current = nextNodeIds;
      onSelectionChange(nextNodeIds);
    }
    if (!areStringArraysEqual(selectedEdgeIdsRef.current, nextEdgeIds)) {
      selectedEdgeIdsRef.current = nextEdgeIds;
      onEdgeSelectionChange(nextEdgeIds);
    }
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const optimisticEdgeId = `${connection.source}:${connection.target}`;
    setEdges((current) => {
      if (current.some((e) => e.source === connection.source && e.target === connection.target)) return current;
      return [
        ...current,
        {
          id: optimisticEdgeId,
          source: connection.source,
          target: connection.target,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#6ee7b7", width: 18, height: 18 }
        }
      ];
    });
    propsRef.current.onConnect(connection);
  }, [setEdges]);

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    propsRef.current.onNodeDragStop(node.id, node.position);
  }, []);

  const handlePaneClick = useCallback(() => {
    const { selectedNodeIds, onSelectionChange, onEdgeSelectionChange } = propsRef.current;
    if (selectedNodeIds.length > 0) { lastSelectedNodeIdsRef.current = []; onSelectionChange([]); }
    if (selectedEdgeIdsRef.current.length > 0) { selectedEdgeIdsRef.current = []; onEdgeSelectionChange([]); }
  }, []);

  return (
    <div className="vfx-flow h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode="dark"
        deleteKeyCode={null}
        onInit={(instance) => {
          reactFlowRef.current = instance;
          instance.fitView({ padding: 0.16, duration: 0 });
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
      >
        <Background gap={36} size={1} color="rgba(255,255,255,0.045)" />
        <MiniMap pannable zoomable nodeColor={() => "#f58b47"} maskColor="rgba(9,10,12,0.84)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function toEdge(edge: EffectGraph["edges"][number], selected: boolean): Edge {
  return {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label,
    type: "smoothstep",
    selected,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#6ee7b7", width: 18, height: 18 }
  };
}
