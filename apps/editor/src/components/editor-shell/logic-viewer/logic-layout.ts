import dagre from "@dagrejs/dagre";
import type { LogicGraph } from "./types";
import { computeNodeHeight } from "./LogicNode";

const NODE_WIDTH = 300;

export function layoutGraph(graph: LogicGraph): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 80,
    ranksep: 180,
    marginx: 60,
    marginy: 60,
    edgesep: 30
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    const height = computeNodeHeight(node.hooks);
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }

  for (const edge of graph.edges) {
    g.setEdge(edge.sourceNodeId, edge.targetNodeId);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();

  for (const node of graph.nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      positions.set(node.id, {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - computeNodeHeight(node.hooks) / 2
      });
    }
  }

  return positions;
}

export { NODE_WIDTH };
