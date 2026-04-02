import type { EditorGraph, EditorGraphNode } from "@ggez/anim-schema";
import type { Connection, Edge, Node as FlowNode } from "@xyflow/react";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GraphCanvas, type NodeActionKind } from "./graph-canvas";

const SUBGRAPH_INPUT_NODE_ID = "__subgraph_in__";
const SUBGRAPH_OUTPUT_NODE_ID = "__subgraph_out__";

type CanvasNodeData = {
  isVirtual?: boolean;
  label: React.ReactNode;
};

function createBoundaryNode(id: string, title: string, description: string, position: { x: number; y: number }): FlowNode<CanvasNodeData> {
  return {
    id,
    position,
    draggable: false,
    selectable: false,
    className: "animation-flow__node",
    data: {
      isVirtual: true,
      label: (
        <div className="pointer-events-none flex min-w-[160px] flex-col gap-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">{title}</div>
          <div className="text-sm font-medium text-zinc-100">{description}</div>
        </div>
      ),
    },
  };
}

function collectGraphRoots(graph: EditorGraph): EditorGraphNode[] {
  const incomingNodeIds = new Set(graph.edges.map((edge) => edge.targetNodeId));
  return graph.nodes.filter((node) => node.kind !== "output" && !incomingNodeIds.has(node.id));
}

export function SubgraphCanvas(props: {
  graph: EditorGraph;
  graphNamesById?: Record<string, string>;
  selectedNodeIds: string[];
  parentGraphName: string;
  subgraphNodeName: string;
  onExit: () => void;
  onConnect: (connection: Connection) => void;
  onSelectionChange: (nodeIds: string[]) => void;
  onOpenStateMachine?: (nodeId: string) => void;
  onOpenSubgraph?: (nodeId: string) => void;
  onNodeDragStop: (nodeId: string, position: { x: number; y: number }) => void;
  onAddNode: (kind: NodeActionKind, position: { x: number; y: number }) => void;
  onDeleteNodes: () => void;
  onDeleteEdges: (edgeIds: string[]) => void;
}) {
  const syntheticNodes = useMemo<FlowNode<CanvasNodeData>[]>(() => {
    const rootNodes = collectGraphRoots(props.graph);
    const outputNode = props.graph.nodes.find((node) => node.id === props.graph.outputNodeId) ?? props.graph.nodes.find((node) => node.kind === "output") ?? null;
    const allRenderableNodes = props.graph.nodes.filter((node) => node.id !== outputNode?.id);
    const minX = allRenderableNodes.length > 0 ? Math.min(...allRenderableNodes.map((node) => node.position.x)) : 160;
    const minY = allRenderableNodes.length > 0 ? Math.min(...allRenderableNodes.map((node) => node.position.y)) : 120;
    const maxX = props.graph.nodes.length > 0 ? Math.max(...props.graph.nodes.map((node) => node.position.x)) : 520;
    const maxY = props.graph.nodes.length > 0 ? Math.max(...props.graph.nodes.map((node) => node.position.y)) : 240;
    const rootCenterY =
      rootNodes.length > 0 ? rootNodes.reduce((sum, node) => sum + node.position.y, 0) / rootNodes.length : minY + Math.max((maxY - minY) / 2, 80);
    const outputY = outputNode?.position.y ?? rootCenterY;

    return [
      createBoundaryNode(SUBGRAPH_INPUT_NODE_ID, "In", `Entry from ${props.parentGraphName}`, { x: minX - 260, y: rootCenterY }),
      createBoundaryNode(SUBGRAPH_OUTPUT_NODE_ID, "Out", `Returns ${props.subgraphNodeName}`, { x: Math.max(maxX, outputNode?.position.x ?? maxX) + 280, y: outputY })
    ];
  }, [props.graph, props.parentGraphName, props.subgraphNodeName]);

  const syntheticEdges = useMemo<Edge[]>(() => {
    const rootNodes = collectGraphRoots(props.graph);
    const outputNode = props.graph.nodes.find((node) => node.id === props.graph.outputNodeId) ?? props.graph.nodes.find((node) => node.kind === "output") ?? null;
    const entryTargets = rootNodes.length > 0 ? rootNodes : outputNode ? [outputNode] : [];

    return [
      ...entryTargets.map((node) => ({
        id: `${SUBGRAPH_INPUT_NODE_ID}->${node.id}`,
        source: SUBGRAPH_INPUT_NODE_ID,
        target: node.id,
        selectable: false,
        className: "animation-flow__edge",
        style: { stroke: "#34d399", strokeDasharray: "6 5" },
      })),
      ...(outputNode
        ? [
            {
              id: `${outputNode.id}->${SUBGRAPH_OUTPUT_NODE_ID}`,
              source: outputNode.id,
              target: SUBGRAPH_OUTPUT_NODE_ID,
              selectable: false,
              className: cn("animation-flow__edge"),
              style: { stroke: "#34d399", strokeDasharray: "6 5" },
            },
          ]
        : []),
    ];
  }, [props.graph]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0d1012]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/8 bg-black/25 px-4">
        <Button type="button" variant="ghost" size="xs" className="gap-1 text-zinc-300" onClick={props.onExit}>
          <ArrowLeft className="size-3.5" />
          Back
        </Button>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Subgraph</div>
          <div className="truncate text-sm font-medium text-zinc-100">{props.graph.name}</div>
        </div>
        <div className="ml-auto hidden text-[11px] text-zinc-500 md:block">{props.subgraphNodeName} inside {props.parentGraphName}</div>
      </div>

      <GraphCanvas
        graph={props.graph}
        graphNamesById={props.graphNamesById}
        selectedNodeIds={props.selectedNodeIds}
        syntheticNodes={syntheticNodes}
        syntheticEdges={syntheticEdges}
        onConnect={props.onConnect}
        onSelectionChange={props.onSelectionChange}
        onOpenStateMachine={props.onOpenStateMachine}
        onOpenSubgraph={props.onOpenSubgraph}
        onNodeDragStop={props.onNodeDragStop}
        onAddNode={props.onAddNode}
        onDeleteNodes={props.onDeleteNodes}
        onDeleteEdges={props.onDeleteEdges}
      />
    </div>
  );
}
