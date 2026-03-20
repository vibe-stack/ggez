import {
  ReactFlow,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeChange,
  type Connection,
  applyNodeChanges,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Entity, GeometryNode, SceneHook } from "@ggez/shared";
import { deriveLogicGraph } from "./logic-graph";
import { layoutGraph, NODE_WIDTH } from "./logic-layout";
import { LogicNode, computeNodeHeight, type LogicNodeData } from "./LogicNode";
import { LogicEdge } from "./LogicEdge";
import { LogicClusterNode } from "./LogicClusterNode";
import { parseHandle, resolveConnection } from "./logic-connect";

const nodeTypes = {
  logic: LogicNode,
  cluster: LogicClusterNode
};
const edgeTypes = { logic: LogicEdge };

const CLUSTER_PAD = 40;

type LogicViewerProps = {
  nodes: GeometryNode[];
  entities: Entity[];
  onNodeClick?: (nodeId: string) => void;
  onUpdateNodeHooks?: (nodeId: string, hooks: SceneHook[], beforeHooks: SceneHook[]) => void;
  onUpdateEntityHooks?: (entityId: string, hooks: SceneHook[], beforeHooks: SceneHook[]) => void;
};

export function LogicViewer({
  nodes,
  entities,
  onNodeClick,
  onUpdateNodeHooks,
  onUpdateEntityHooks
}: LogicViewerProps) {
  const [rfNodes, setRfNodes] = useState<Node[]>([]);

  const { graph, positions } = useMemo(() => {
    const g = deriveLogicGraph(nodes, entities);
    const p = layoutGraph(g);
    return { graph: g, positions: p };
  }, [nodes, entities]);

  // Build initial node list with clusters + logic nodes
  useEffect(() => {
    const clusterNodes: Node[] = [];
    for (const cluster of graph.clusters) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const nid of cluster.nodeIds) {
        const pos = positions.get(nid);
        if (!pos) continue;
        const gn = graph.nodes.find((n) => n.id === nid);
        if (!gn) continue;
        const h = computeNodeHeight(gn.hooks);
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + NODE_WIDTH);
        maxY = Math.max(maxY, pos.y + h);
      }

      if (!isFinite(minX)) continue;

      const width = maxX - minX + CLUSTER_PAD * 2;
      const height = maxY - minY + CLUSTER_PAD * 2;

      clusterNodes.push({
        id: cluster.id,
        type: "cluster",
        position: { x: minX - CLUSTER_PAD, y: minY - CLUSTER_PAD },
        data: { label: cluster.label, category: cluster.dominantCategory, width, height },
        zIndex: -1,
        style: { width, height },
        selectable: false,
        draggable: false,
        focusable: false
      });
    }

    const logicNodes: Node[] = graph.nodes.map((node) => {
      const pos = positions.get(node.id) ?? { x: 0, y: 0 };
      const h = computeNodeHeight(node.hooks);
      return {
        id: node.id,
        type: "logic",
        position: pos,
        data: { label: node.label, kind: node.kind, hooks: node.hooks } satisfies LogicNodeData,
        style: { width: NODE_WIDTH, height: h }
      };
    });

    setRfNodes([...clusterNodes, ...logicNodes]);
  }, [graph, positions]);

  const rfEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        sourceHandle: `${edge.sourceHookId}:emit:${edge.event}`,
        target: edge.targetNodeId,
        targetHandle: `${edge.targetHookId}:listen:${edge.event}`,
        type: "logic",
        data: { event: edge.event, category: edge.category },
        animated: false
      })),
    [graph]
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "cluster") return;
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

      const mutation = resolveConnection(
        connection.source,
        connection.sourceHandle,
        connection.target,
        connection.targetHandle,
        nodes,
        entities
      );

      if (!mutation) return;

      if (mutation.ownerKind === "node") {
        onUpdateNodeHooks?.(mutation.ownerId, mutation.hooks, mutation.beforeHooks);
      } else {
        onUpdateEntityHooks?.(mutation.ownerId, mutation.hooks, mutation.beforeHooks);
      }
    },
    [nodes, entities, onUpdateNodeHooks, onUpdateEntityHooks]
  );

  return (
    <div className="size-full">
      <ReactFlow
        colorMode="dark"
        className="bg-transparent"
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable
        nodesConnectable
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={2.5}
        snapToGrid
        snapGrid={[16, 16]}
        isValidConnection={(connection) => {
          if (!connection.sourceHandle || !connection.targetHandle) return false;
          if (connection.source === connection.target) return false;
          const src = parseHandle(connection.sourceHandle);
          const tgt = parseHandle(connection.targetHandle);
          if (!src || !tgt) return false;
          return src.direction === "emit" && tgt.direction === "listen";
        }}
        connectionLineStyle={{ stroke: "rgba(16,185,129,0.5)", strokeWidth: 2 }}
        style={{ backgroundColor: "transparent" }}
      >
        <MiniMap
          nodeColor={(node) =>
            node.type === "cluster" ? "transparent" : "rgba(16,185,129,0.25)"
          }
          maskColor="rgba(0,0,0,0.65)"
          style={{ background: "transparent", borderRadius: 12, border: "none" }}
        />
        <Controls
          showInteractive={false}
          style={{
            background: "transparent",
            borderRadius: 12,
            border: "none",
            boxShadow: "none"
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function useLogicViewerRelayout() {
  const { fitView } = useReactFlow();
  return useCallback(() => {
    fitView({ duration: 300 });
  }, [fitView]);
}
