import {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import type { EditorGraphNode } from "@ggez/anim-schema";
import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
function toCanvasNode(node: EditorGraphNode, selected = false) {
  return {
    id: node.id,
    position: node.position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected,
    className: cn("animation-flow__node", selected && "selected"),
    data: {
      label: (
        <div className="pointer-events-none flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/70">{node.kind}</span>
          <span className="text-sm font-medium text-zinc-100">{node.name}</span>
        </div>
      ),
    },
  };
}

function buildCanvasEdges(nodes: EditorGraphNode[], graphEdges: { id: string; sourceNodeId: string; targetNodeId: string }[]) {
  const edges: Edge[] = [...graphEdges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId }))];

  nodes.forEach((node) => {
    if (node.kind === "blend1d") {
      node.children.forEach((child) => {
        edges.push({
          id: `${child.nodeId}->${node.id}`,
          source: child.nodeId,
          target: node.id,
          label: child.threshold.toString(),
        });
      });
    }

    if (node.kind === "blend2d") {
      node.children.forEach((child) => {
        edges.push({
          id: `${child.nodeId}->${node.id}`,
          source: child.nodeId,
          target: node.id,
          label: `${child.x}, ${child.y}`,
        });
      });
    }
  });

  const deduped = new Map<string, Edge>();
  edges.forEach((edge) => {
    deduped.set(edge.id, {
      ...edge,
      type: "smoothstep",
      className: "animation-flow__edge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: "#71717a",
      },
    });
  });

  return Array.from(deduped.values());
}

export function GraphCanvas(props: {
  graph: { id: string; name: string; nodes: EditorGraphNode[]; edges: { id: string; sourceNodeId: string; targetNodeId: string }[] };
  selectedNodeIds: string[];
  onConnect: (connection: Connection) => void;
  onSelectionChange: (nodeIds: string[]) => void;
  onNodeDragStop: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  const lastSelectedNodeIdsRef = useRef(props.selectedNodeIds);
  const flowKey = useMemo(
    () =>
      [
        props.graph.id,
        props.selectedNodeIds.join(","),
        props.graph.nodes.map((node) => `${node.id}:${node.position.x}:${node.position.y}:${node.name}:${node.kind}`).join("|"),
        props.graph.edges.map((edge) => edge.id).join("|"),
      ].join("::"),
    [props.graph.edges, props.graph.id, props.graph.nodes, props.selectedNodeIds]
  );

  const nodes = useMemo(
    () => props.graph.nodes.map((node) => toCanvasNode(node, props.selectedNodeIds.includes(node.id))),
    [props.graph.nodes, props.selectedNodeIds]
  );

  const edges = useMemo(() => buildCanvasEdges(props.graph.nodes, props.graph.edges), [props.graph.edges, props.graph.nodes]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d1012]">
      <div className="flex h-9 items-center justify-between border-b border-white/8 bg-black/30 px-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        <span>{props.graph.name}</span>
        <span>{props.graph.nodes.length} nodes</span>
      </div>

      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            key={flowKey}
            defaultNodes={nodes}
            defaultEdges={edges}
            className="animation-flow"
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.18 }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 18,
                height: 18,
                color: "#71717a",
              },
            }}
            onSelectionChange={(selection) => {
              const nextNodeIds = (selection.nodes ?? []).map((node) => node.id);

              if (!areStringArraysEqual(lastSelectedNodeIdsRef.current, nextNodeIds)) {
                lastSelectedNodeIdsRef.current = nextNodeIds;
                props.onSelectionChange(nextNodeIds);
              }
            }}
            onNodeDragStop={(_, draggedNode) => {
              props.onNodeDragStop(draggedNode.id, draggedNode.position);
            }}
            onConnect={props.onConnect}
          >
            <MiniMap pannable zoomable nodeColor="#34d399" maskColor="rgba(9, 10, 12, 0.82)" className="animation-flow__minimap" />
            <Controls className="animation-flow__controls" />
            <Background color="rgba(91, 110, 101, 0.24)" gap={22} size={1} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}