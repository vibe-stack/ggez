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
import type { EffectGraph, EffectGraphNode } from "@ggez/vfx-schema";
import { Boxes, Cable, Gauge, Layers3, Orbit, Sparkles, Workflow } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";

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
    case "emitter":
      return node.emitterId;
    case "parameter":
      return node.parameterId ?? "unassigned parameter";
    case "event":
      return node.eventId ?? "unassigned event";
    case "dataInterface":
      return node.bindingId ?? "unassigned interface";
    case "subgraph":
      return node.subgraphId ?? "unassigned subgraph";
    case "scalability":
      return "lod / budgets / fallbacks";
    case "output":
      return "compiled effect output";
    case "comment":
    default:
      return "note";
  }
}

function toNode(node: EffectGraphNode, selected: boolean): Node<FlowNodeData> {
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

function toEdge(edge: EffectGraph["edges"][number], selected: boolean): Edge {
  return {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label,
    type: "smoothstep",
    selected,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#6ee7b7",
      width: 18,
      height: 18
    }
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function areCanvasNodesEqual(left: Node<FlowNodeData>[], right: Node<FlowNodeData>[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((node, index) => {
    const candidate = right[index];
    return (
      candidate &&
      node.id === candidate.id &&
      node.selected === candidate.selected &&
      node.position.x === candidate.position.x &&
      node.position.y === candidate.position.y &&
      node.data.kind === candidate.data.kind &&
      node.data.name === candidate.data.name &&
      node.data.subtitle === candidate.data.subtitle
    );
  });
}

function areCanvasEdgesEqual(left: Edge[], right: Edge[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((edge, index) => {
    const candidate = right[index];
    return (
      candidate &&
      edge.id === candidate.id &&
      edge.source === candidate.source &&
      edge.target === candidate.target &&
      edge.selected === candidate.selected &&
      edge.label === candidate.label
    );
  });
}

type NodeCacheEntry = { graphNode: EffectGraphNode; selected: boolean; flowNode: Node<FlowNodeData> };

export function GraphCanvas(props: {
  graph: EffectGraph;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  onEdgeSelectionChange(edgeIds: string[]): void;
  onSelectionChange(nodeIds: string[]): void;
  onConnect(connection: Connection): void;
  onNodeDragStop(nodeId: string, position: { x: number; y: number }): void;
  onDeleteNodes(): void;
  onDeleteEdges(edgeIds: string[]): void;
}) {
  // Always-up-to-date ref so stable callbacks never capture stale props.
  const propsRef = useRef(props);
  propsRef.current = props;

  const lastSelectedNodeIdsRef = useRef(props.selectedNodeIds);
  const selectedEdgeIdsRef = useRef(props.selectedEdgeIds);
  const reactFlowRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);

  // Stable node-object cache: reuse the same Node<FlowNodeData> reference when
  // the underlying EffectGraphNode identity and selected state haven't changed.
  // React Flow's adoptUserNodes uses reference equality (checkEquality: true) to
  // preserve measured dimensions; new references cause re-measurement storms that
  // overflow React's nested-update counter.
  const nodeCacheRef = useRef<Map<string, NodeCacheEntry>>(new Map());

  const computedNodes = useMemo(() => {
    const prevCache = nodeCacheRef.current;
    const nextCache = new Map<string, NodeCacheEntry>();

    const result = props.graph.nodes.map((graphNode) => {
      const selected = props.selectedNodeIds.includes(graphNode.id);
      const cached = prevCache.get(graphNode.id);

      let flowNode: Node<FlowNodeData>;
      if (cached && cached.graphNode === graphNode && cached.selected === selected) {
        flowNode = cached.flowNode;
      } else {
        flowNode = toNode(graphNode, selected);
      }

      nextCache.set(graphNode.id, { graphNode, selected, flowNode });
      return flowNode;
    });

    nodeCacheRef.current = nextCache;
    return result;
  }, [props.graph.nodes, props.selectedNodeIds]);

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

  useEffect(() => {
    lastSelectedNodeIdsRef.current = props.selectedNodeIds;
  }, [props.selectedNodeIds]);

  useEffect(() => {
    selectedEdgeIdsRef.current = props.selectedEdgeIds;
  }, [props.selectedEdgeIds]);

  useEffect(() => {
    if (!reactFlowRef.current) {
      return;
    }
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

      if (isTypingTarget || (event.key !== "Backspace" && event.key !== "Delete")) {
        return;
      }

      const { selectedNodeIds, onDeleteEdges, onEdgeSelectionChange, onDeleteNodes } = propsRef.current;

      if (selectedEdgeIdsRef.current.length === 0 && selectedNodeIds.length === 0) {
        return;
      }

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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []); // stable: reads latest props via propsRef

  const handleSelectionChange = useCallback((selection: { nodes: Node<FlowNodeData>[]; edges: Edge[] }) => {
    const { onSelectionChange, onEdgeSelectionChange } = propsRef.current;
    const nextNodeIds = (selection.nodes ?? []).map((node) => node.id);
    const nextEdgeIds = (selection.edges ?? []).map((edge) => edge.id);

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
    if (!connection.source || !connection.target) {
      return;
    }

    const optimisticEdgeId = `${connection.source}:${connection.target}`;

    setEdges((current) => {
      if (current.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
        return current;
      }

      return [
        ...current,
        {
          id: optimisticEdgeId,
          source: connection.source,
          target: connection.target,
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#6ee7b7",
            width: 18,
            height: 18
          }
        }
      ];
    });

    propsRef.current.onConnect(connection);
  }, [setEdges]);

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node<FlowNodeData>) => {
    propsRef.current.onNodeDragStop(node.id, node.position);
  }, []);

  const handlePaneClick = useCallback(() => {
    const { selectedNodeIds, onSelectionChange, onEdgeSelectionChange } = propsRef.current;
    if (selectedNodeIds.length > 0) {
      lastSelectedNodeIdsRef.current = [];
      onSelectionChange([]);
    }
    if (selectedEdgeIdsRef.current.length > 0) {
      selectedEdgeIdsRef.current = [];
      onEdgeSelectionChange([]);
    }
  }, []);

  return (
    <div className="vfx-flow h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        <MiniMap
          pannable
          zoomable
          nodeColor={() => "#f58b47"}
          maskColor="rgba(9,10,12,0.84)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
