export type LogicGraphHook = {
  hookId: string;
  hookType: string;
  label: string;
  category: string;
  enabled: boolean;
  emits: string[];
  listens: string[];
  dynamicEmits: Array<{ event: string; targetId?: string }>;
  dynamicListens: Array<{ event: string; sourceId?: string }>;
};

export type LogicGraphNode = {
  id: string;
  label: string;
  kind: string;
  hooks: LogicGraphHook[];
};

export type LogicGraphEdge = {
  id: string;
  sourceNodeId: string;
  sourceHookId: string;
  targetNodeId: string;
  targetHookId: string;
  event: string;
  category: string;
};

export type LogicCluster = {
  id: string;
  nodeIds: string[];
  label: string;
  dominantCategory: string;
};

export type LogicGraph = {
  nodes: LogicGraphNode[];
  edges: LogicGraphEdge[];
  clusters: LogicCluster[];
};
