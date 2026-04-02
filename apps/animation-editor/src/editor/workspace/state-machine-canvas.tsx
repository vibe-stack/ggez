import { createStableId } from "@ggez/anim-utils";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { EditorGraph, ParameterDefinition } from "@ggez/anim-schema";
import {
  Background,
  Controls,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
  type Node as FlowNode,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { ArrowLeft, CircleDot, Flag, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PropertyField, StudioSection, editorInputClassName, editorSelectClassName, sectionHintClassName } from "./shared";
import {
  buildDefaultTransition,
  INTERRUPTION_SOURCES,
  NumericDragInput,
  TRANSITION_BLEND_CURVES,
  TRANSITION_OPERATORS,
  createDefaultStateMachineTransition,
  updateStateMachineNode
} from "./inspector/shared";
import type { StateMachineNode, StateMachineState, StateMachineTransition } from "./inspector/types";

const ENTRY_NODE_ID = "__entry__";
const ANY_STATE_NODE_ID = "__any_state__";
const OUTPUT_NODE_ID = "__output__";

type SelectedTransition = {
  id: string;
  isAnyState: boolean;
};

function formatCondition(condition: StateMachineTransition["conditions"][number], parameters: ParameterDefinition[]): string {
  const parameter = parameters.find((entry) => entry.id === condition.parameterId);
  const parameterName = parameter?.name ?? "param";

  if (condition.operator === "set") {
    return `${parameterName} set`;
  }

  if (typeof condition.value === "boolean") {
    return `${parameterName} ${condition.operator} ${condition.value ? "true" : "false"}`;
  }

  return `${parameterName} ${condition.operator} ${condition.value ?? 0}`;
}

function describeTransition(transition: StateMachineTransition, parameters: ParameterDefinition[]) {
  const parts: string[] = [];

  parts.push(`${transition.duration.toFixed(2)}s ${transition.blendCurve}`);

  if (transition.syncNormalizedTime) {
    parts.push("phase sync");
  }

  if (transition.hasExitTime) {
    parts.push(`exit ${Number(transition.exitTime ?? 1).toFixed(2)}`);
  }

  if (transition.conditions.length > 0) {
    parts.push(transition.conditions.map((condition) => formatCondition(condition, parameters)).join(", "));
  }

  return parts.join(" | ") || "Immediate";
}

function getDefaultStatePosition(node: StateMachineNode, index: number) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 240 + column * 260,
    y: 120 + row * 180,
  };
}

function getStatePosition(node: StateMachineNode, state: StateMachineState, index: number) {
  return state.position ?? getDefaultStatePosition(node, index);
}

function toStateNode(
  graph: EditorGraph,
  node: StateMachineNode,
  state: StateMachineState,
  index: number,
  selected: boolean
): FlowNode {
  const motionNode = graph.nodes.find((candidate) => candidate.id === state.motionNodeId);

  return {
    id: state.id,
    position: getStatePosition(node, state, index),
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected,
    className: cn("animation-flow__node", selected && "selected"),
    data: {
      label: (
        <div className="pointer-events-none flex min-w-[180px] flex-col gap-1">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-emerald-300/70">
            {node.entryStateId === state.id ? <Flag className="size-3" /> : <CircleDot className="size-3" />}
            {node.entryStateId === state.id ? "Entry State" : "State"}
          </div>
          <div className="text-sm font-medium text-zinc-100">{state.name}</div>
          <div className="text-[11px] text-zinc-400">{motionNode ? `${motionNode.name} (${motionNode.kind})` : "No motion assigned"}</div>
        </div>
      ),
    },
  };
}

function toSpecialNode(id: string, label: string, description: string, position: { x: number; y: number }, selected = false): FlowNode {
  return {
    id,
    position,
    draggable: false,
    selectable: false,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected,
    className: "animation-flow__node",
    data: {
      label: (
        <div className="pointer-events-none flex min-w-[160px] flex-col gap-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">{label}</div>
          <div className="text-sm font-medium text-zinc-100">{description}</div>
        </div>
      ),
    },
  };
}

function getOutputNodePosition(node: StateMachineNode) {
  const statePositions = node.states.map((state, index) => getStatePosition(node, state, index));
  if (statePositions.length === 0) {
    return { x: 760, y: 200 };
  }

  return {
    x: Math.max(...statePositions.map((position) => position.x)) + 320,
    y: statePositions.reduce((sum, position) => sum + position.y, 0) / statePositions.length,
  };
}

function areCanvasNodesEqual(left: FlowNode[], right: FlowNode[]) {
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
      node.className === candidate.className
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
      edge.label === candidate.label &&
      edge.className === candidate.className
    );
  });
}

function updateTransitionCollections(
  current: StateMachineNode,
  transitionId: string,
  isAnyState: boolean,
  updater: (transition: StateMachineTransition) => StateMachineTransition
): StateMachineNode {
  return {
    ...current,
    transitions: isAnyState ? current.transitions : current.transitions.map((entry) => (entry.id === transitionId ? updater(entry) : entry)),
    anyStateTransitions: isAnyState ? current.anyStateTransitions.map((entry) => (entry.id === transitionId ? updater(entry) : entry)) : current.anyStateTransitions,
  };
}

function removeTransition(current: StateMachineNode, transitionId: string, isAnyState: boolean): StateMachineNode {
  return {
    ...current,
    transitions: isAnyState ? current.transitions : current.transitions.filter((entry) => entry.id !== transitionId),
    anyStateTransitions: isAnyState ? current.anyStateTransitions.filter((entry) => entry.id !== transitionId) : current.anyStateTransitions,
  };
}

export function StateMachineCanvas(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StateMachineNode;
  parameters: ParameterDefinition[];
  onExit: () => void;
}) {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const [selectedStateId, setSelectedStateId] = useState<string>(props.node.entryStateId);
  const [selectedTransition, setSelectedTransition] = useState<SelectedTransition | null>(null);
  const previousNodeIdRef = useRef(props.node.id);
  const motionOptions = useMemo(
    () =>
      props.graph.nodes
        .filter((candidate) => candidate.id !== props.node.id && candidate.kind !== "output")
        .map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.kind})` })),
    [props.graph.nodes, props.node.id]
  );

  const computedNodes = useMemo<FlowNode[]>(
    () => [
      toSpecialNode(ENTRY_NODE_ID, "In", "Entry into this state machine", { x: 24, y: 120 }),
      toSpecialNode(ANY_STATE_NODE_ID, "Any State", "Create interrupt-style transitions", { x: 24, y: 280 }),
      toSpecialNode(OUTPUT_NODE_ID, "Out", "Resolved motion from the active state", getOutputNodePosition(props.node)),
      ...props.node.states.map((state, index) => toStateNode(props.graph, props.node, state, index, selectedStateId === state.id)),
    ],
    [props.graph, props.node, selectedStateId]
  );

  const computedEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];

    if (props.node.entryStateId) {
      edges.push({
        id: `${ENTRY_NODE_ID}->${props.node.entryStateId}`,
        source: ENTRY_NODE_ID,
        target: props.node.entryStateId,
        label: "Entry",
        selectable: false,
        className: "animation-flow__edge",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#34d399",
          width: 18,
          height: 18,
        },
        style: {
          stroke: "#34d399",
        },
      });
    }

    props.node.transitions.forEach((transition) => {
      edges.push({
        id: transition.id,
        source: transition.fromStateId ?? props.node.entryStateId,
        target: transition.toStateId,
        label: describeTransition(transition, props.parameters),
        className: cn("animation-flow__edge", selectedTransition?.id === transition.id && !selectedTransition.isAnyState && "selected"),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#f59e0b",
          width: 18,
          height: 18,
        },
        style: {
          stroke: "#f59e0b",
        },
        data: {
          isAnyState: false,
        },
      });
    });

    props.node.anyStateTransitions.forEach((transition) => {
      edges.push({
        id: transition.id,
        source: ANY_STATE_NODE_ID,
        target: transition.toStateId,
        label: describeTransition(transition, props.parameters),
        className: cn("animation-flow__edge", selectedTransition?.id === transition.id && selectedTransition.isAnyState && "selected"),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#f87171",
          width: 18,
          height: 18,
        },
        style: {
          stroke: "#f87171",
          strokeDasharray: "6 5",
        },
        data: {
          isAnyState: true,
        },
      });
    });

    props.node.states.forEach((state) => {
      edges.push({
        id: `${state.id}->${OUTPUT_NODE_ID}`,
        source: state.id,
        target: OUTPUT_NODE_ID,
        selectable: false,
        className: "animation-flow__edge",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#34d399",
          width: 18,
          height: 18,
        },
        style: {
          stroke: "#34d399",
          strokeDasharray: "6 5",
          opacity: 0.7,
        },
      });
    });

    return edges;
  }, [props.node, props.parameters, selectedTransition]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  const selectedState = props.node.states.find((state) => state.id === selectedStateId) ?? null;
  const selectedTransitionEntry = selectedTransition
    ? (selectedTransition.isAnyState ? props.node.anyStateTransitions : props.node.transitions).find((entry) => entry.id === selectedTransition.id) ?? null
    : null;

  useEffect(() => {
    setNodes((current) => (areCanvasNodesEqual(current, computedNodes) ? current : computedNodes));
  }, [computedNodes, setNodes]);

  useEffect(() => {
    setEdges((current) => (areCanvasEdgesEqual(current, computedEdges) ? current : computedEdges));
  }, [computedEdges, setEdges]);

  useEffect(() => {
    if (previousNodeIdRef.current !== props.node.id) {
      previousNodeIdRef.current = props.node.id;
      setSelectedStateId(props.node.entryStateId);
      setSelectedTransition(null);
      window.requestAnimationFrame(() => {
        reactFlowInstance?.fitView({ padding: 0.2, duration: 180 });
      });
    }
  }, [props.node.entryStateId, props.node.id, reactFlowInstance]);

  useEffect(() => {
    if (!selectedStateId || props.node.states.some((state) => state.id === selectedStateId)) {
      return;
    }

    setSelectedStateId(props.node.entryStateId || (props.node.states[0]?.id ?? ""));
  }, [props.node.entryStateId, props.node.states, selectedStateId]);

  useEffect(() => {
    if (
      selectedTransition &&
      !(selectedTransition.isAnyState ? props.node.anyStateTransitions : props.node.transitions).some((entry) => entry.id === selectedTransition.id)
    ) {
      setSelectedTransition(null);
    }
  }, [props.node.anyStateTransitions, props.node.transitions, selectedTransition]);

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

      if (selectedTransitionEntry) {
        event.preventDefault();
        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
          removeTransition(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState))
        );
        setSelectedTransition(null);
        return;
      }

      if (!selectedState || props.node.states.length <= 1) {
        return;
      }

      event.preventDefault();
      updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => {
        const remainingStates = current.states.filter((entry) => entry.id !== selectedState.id);
        return {
          ...current,
          entryStateId: current.entryStateId === selectedState.id ? remainingStates[0]?.id ?? current.entryStateId : current.entryStateId,
          states: remainingStates,
          transitions: current.transitions.filter((transition) => transition.fromStateId !== selectedState.id && transition.toStateId !== selectedState.id),
          anyStateTransitions: current.anyStateTransitions.filter((transition) => transition.toStateId !== selectedState.id),
        };
      });
      setSelectedTransition(null);
      setSelectedStateId(props.node.entryStateId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [props.graph.id, props.node.entryStateId, props.node.id, props.node.states.length, props.store, selectedState, selectedTransition, selectedTransitionEntry]);

  function handleAddState(position?: { x: number; y: number }) {
    const nextStateId = createStableId("state");
    const nextState: StateMachineState = {
      id: nextStateId,
      name: `State ${props.node.states.length + 1}`,
      motionNodeId: motionOptions[0]?.value ?? "unassigned-motion",
      position: position ?? getDefaultStatePosition(props.node, props.node.states.length),
      speed: 1,
      cycleOffset: 0,
    };

    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
      ...current,
      entryStateId: current.states.length === 0 ? nextState.id : current.entryStateId,
      states: [...current.states, nextState],
    }));
    setSelectedTransition(null);
    setSelectedStateId(nextStateId);
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    if (connection.source === ENTRY_NODE_ID) {
      updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
        ...current,
        entryStateId: connection.target!,
      }));
      setSelectedTransition(null);
      setSelectedStateId(connection.target);
      return;
    }

    const nextTransitionCollection = connection.source === ANY_STATE_NODE_ID ? props.node.anyStateTransitions : props.node.transitions;
    const existingTransition = nextTransitionCollection.find((transition) =>
      connection.source === ANY_STATE_NODE_ID
        ? transition.toStateId === connection.target
        : transition.fromStateId === connection.source && transition.toStateId === connection.target
    );

    if (existingTransition) {
      setSelectedStateId("");
      setSelectedTransition({ id: existingTransition.id, isAnyState: connection.source === ANY_STATE_NODE_ID });
      return;
    }

    const nextTransition: StateMachineTransition = createDefaultStateMachineTransition({
      id: createStableId(connection.source === ANY_STATE_NODE_ID ? "any-transition" : "transition"),
      fromStateId: connection.source === ANY_STATE_NODE_ID ? undefined : connection.source,
      toStateId: connection.target,
      parameter: props.parameters[0]
    });

    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
      ...current,
      transitions: connection.source === ANY_STATE_NODE_ID ? current.transitions : [...current.transitions, nextTransition],
      anyStateTransitions: connection.source === ANY_STATE_NODE_ID ? [...current.anyStateTransitions, nextTransition] : current.anyStateTransitions,
    }));
    setSelectedStateId("");
    setSelectedTransition({ id: nextTransition.id, isAnyState: connection.source === ANY_STATE_NODE_ID });
  }

  const handleEdgeClick: EdgeMouseHandler = (_, edge) => {
    const nextSelection = { id: edge.id, isAnyState: Boolean(edge.data?.isAnyState) };
    setSelectedStateId("");
    setSelectedTransition(nextSelection);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0d1012]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/8 bg-black/25 px-4">
        <Button type="button" variant="ghost" size="xs" className="gap-1 text-zinc-300" onClick={props.onExit}>
          <ArrowLeft className="size-3.5" />
          Back To Graph
        </Button>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">State Machine</div>
          <div className="truncate text-sm font-medium text-zinc-100">{props.node.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-[11px] text-zinc-500 md:block">Connect states to create transitions. Connect Entry or Any State for special flows.</div>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="gap-1"
            onClick={() => {
              const viewport = reactFlowInstance?.getViewport();
              handleAddState(
                viewport
                  ? {
                      x: Math.abs(viewport.x) / Math.max(viewport.zoom, 0.01) + 320,
                      y: Math.abs(viewport.y) / Math.max(viewport.zoom, 0.01) + 180,
                    }
                  : undefined
              );
            }}
          >
            <Plus className="size-3.5" />
            Add State
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            className="animation-flow"
            colorMode="dark"
            onInit={setReactFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, flowNode) => {
              if (flowNode.id === ENTRY_NODE_ID || flowNode.id === ANY_STATE_NODE_ID || flowNode.id === OUTPUT_NODE_ID) {
                setSelectedStateId("");
                setSelectedTransition(null);
                return;
              }

              setSelectedStateId(flowNode.id);
              setSelectedTransition(null);
            }}
            onEdgeClick={handleEdgeClick}
            onNodeDragStop={(_, draggedNode) => {
              if (draggedNode.id === ENTRY_NODE_ID || draggedNode.id === ANY_STATE_NODE_ID || draggedNode.id === OUTPUT_NODE_ID) {
                return;
              }

              updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                ...current,
                states: current.states.map((state) => (state.id === draggedNode.id ? { ...state, position: draggedNode.position } : state)),
              }));
            }}
            onPaneClick={() => {
              setSelectedStateId("");
              setSelectedTransition(null);
            }}
            onConnect={handleConnect}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 18,
                height: 18,
              },
            }}
            fitView
          >
            <MiniMap pannable zoomable nodeColor="#34d399" maskColor="rgba(9, 10, 12, 0.82)" className="animation-flow__minimap" />
            <Controls className="animation-flow__controls" />
            <Background color="rgba(91, 110, 101, 0.24)" gap={22} size={1} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      <div className="pointer-events-none absolute top-16 right-84 z-20 flex w-[360px] max-w-[calc(100vw-3rem)]">
        <div className="pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-[24px] bg-[#091012]/30 shadow-[0_24px_80px_rgba(0,0,0,0.42)] ring-1 ring-white/8 backdrop-blur-md">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              {selectedState ? (
                <StudioSection title="Selected State" variant="soft">
                  <PropertyField label="Name">
                    <Input
                      value={selectedState.name}
                      onChange={(event) =>
                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                          ...current,
                          states: current.states.map((entry) => (entry.id === selectedState.id ? { ...entry, name: event.target.value } : entry)),
                        }))
                      }
                      className={editorInputClassName}
                    />
                  </PropertyField>
                  <PropertyField label="Motion Node">
                    <select
                      value={selectedState.motionNodeId}
                      onChange={(event) =>
                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                          ...current,
                          states: current.states.map((entry) => (entry.id === selectedState.id ? { ...entry, motionNodeId: event.target.value } : entry)),
                        }))
                      }
                      className={editorSelectClassName}
                    >
                      {motionOptions.map((motionOption) => (
                        <option key={motionOption.value} value={motionOption.value}>
                          {motionOption.label}
                        </option>
                      ))}
                    </select>
                  </PropertyField>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PropertyField label="Speed">
                      <NumericDragInput
                        value={selectedState.speed}
                        step={0.05}
                        precision={2}
                        onChange={(value) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                            ...current,
                            states: current.states.map((entry) => (entry.id === selectedState.id ? { ...entry, speed: value } : entry)),
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Cycle Offset">
                      <NumericDragInput
                        value={selectedState.cycleOffset}
                        step={0.05}
                        precision={2}
                        onChange={(value) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                            ...current,
                            states: current.states.map((entry) => (entry.id === selectedState.id ? { ...entry, cycleOffset: value } : entry)),
                          }))
                        }
                      />
                    </PropertyField>
                  </div>
                  <label className="flex h-9 items-center gap-2 rounded-xl bg-white/7 px-3 text-[12px] text-zinc-200">
                    <Checkbox
                      checked={props.node.entryStateId === selectedState.id}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          return;
                        }

                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                          ...current,
                          entryStateId: selectedState.id,
                        }));
                      }}
                    />
                    <span>{props.node.entryStateId === selectedState.id ? "Entry state" : "Make entry state"}</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      if (props.node.states.length <= 1) {
                        return;
                      }

                      updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => {
                        const remainingStates = current.states.filter((entry) => entry.id !== selectedState.id);
                        return {
                          ...current,
                          entryStateId: current.entryStateId === selectedState.id ? remainingStates[0]?.id ?? current.entryStateId : current.entryStateId,
                          states: remainingStates,
                          transitions: current.transitions.filter((transition) => transition.fromStateId !== selectedState.id && transition.toStateId !== selectedState.id),
                          anyStateTransitions: current.anyStateTransitions.filter((transition) => transition.toStateId !== selectedState.id),
                        };
                      });
                      setSelectedStateId(props.node.entryStateId);
                    }}
                    disabled={props.node.states.length <= 1}
                  >
                    Remove State
                  </Button>
                </StudioSection>
              ) : null}

              {selectedTransitionEntry ? (
                <StudioSection title={selectedTransition?.isAnyState ? "Any State Transition" : "Transition"} variant="soft">
                  <div className="text-[11px] leading-5 text-zinc-400">
                    {selectedTransition?.isAnyState
                      ? `Any State to ${props.node.states.find((state) => state.id === selectedTransitionEntry.toStateId)?.name ?? "Missing"}`
                      : `${props.node.states.find((state) => state.id === selectedTransitionEntry.fromStateId)?.name ?? "Missing"} to ${props.node.states.find((state) => state.id === selectedTransitionEntry.toStateId)?.name ?? "Missing"}`}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                    <PropertyField label="To">
                      <select
                        value={selectedTransitionEntry.toStateId}
                        onChange={(event) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                            updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                              ...entry,
                              toStateId: event.target.value,
                            }))
                          )
                        }
                        className={editorSelectClassName}
                      >
                        {props.node.states.map((state) => (
                          <option key={state.id} value={state.id}>
                            {state.name}
                          </option>
                        ))}
                      </select>
                    </PropertyField>
                    <PropertyField label="Duration">
                      <NumericDragInput
                        value={selectedTransitionEntry.duration}
                        step={0.05}
                        precision={2}
                        min={0}
                        onChange={(value) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                            updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                              ...entry,
                              duration: value,
                            }))
                          )
                        }
                      />
                    </PropertyField>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[132px_minmax(0,1fr)_132px]">
                    <PropertyField label="Exit Time">
                      <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
                        <Checkbox
                          checked={selectedTransitionEntry.hasExitTime}
                          onCheckedChange={(checked) =>
                            updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                              updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                ...entry,
                                hasExitTime: Boolean(checked),
                              }))
                            )
                          }
                        />
                        <span>Enabled</span>
                      </label>
                    </PropertyField>
                    <PropertyField label="Exit Normalized Time">
                      <NumericDragInput
                        value={selectedTransitionEntry.exitTime ?? 1}
                        step={0.05}
                        precision={2}
                        min={0}
                        onChange={(value) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                            updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                              ...entry,
                              exitTime: value,
                            }))
                          )
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Interrupt">
                      <select
                        value={selectedTransitionEntry.interruptionSource}
                        onChange={(event) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                            updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                              ...entry,
                              interruptionSource: event.target.value as StateMachineTransition["interruptionSource"],
                            }))
                          )
                        }
                        className={editorSelectClassName}
                      >
                        {INTERRUPTION_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                      </select>
                    </PropertyField>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
                    <PropertyField label="Blend Curve">
                      <select
                        value={selectedTransitionEntry.blendCurve}
                        onChange={(event) =>
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                            updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                              ...entry,
                              blendCurve: event.target.value as StateMachineTransition["blendCurve"],
                            }))
                          )
                        }
                        className={editorSelectClassName}
                      >
                        {TRANSITION_BLEND_CURVES.map((curve) => (
                          <option key={curve} value={curve}>
                            {curve}
                          </option>
                        ))}
                      </select>
                    </PropertyField>
                    <PropertyField label="Phase Sync">
                      <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
                        <Checkbox
                          checked={selectedTransitionEntry.syncNormalizedTime}
                          onCheckedChange={(checked) =>
                            updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                              updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                ...entry,
                                syncNormalizedTime: Boolean(checked),
                              }))
                            )
                          }
                        />
                        <span>Match phase</span>
                      </label>
                    </PropertyField>
                  </div>
                  <div className="space-y-2 border-t border-white/8 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-medium tracking-[0.01em] text-zinc-400">Conditions</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          const nextCondition = buildDefaultTransition(props.parameters[0]);
                          updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                            updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                              ...entry,
                              conditions: [...entry.conditions, nextCondition],
                            }))
                          );
                        }}
                      >
                        Add Condition
                      </Button>
                    </div>

                    {selectedTransitionEntry.conditions.length === 0 ? <div className={sectionHintClassName}>No conditions. This transition will fire as soon as its timing gates pass.</div> : null}

                    {selectedTransitionEntry.conditions.map((condition, conditionIndex) => {
                      const parameter = props.parameters.find((entry) => entry.id === condition.parameterId);
                      const requiresValue = condition.operator !== "set" && parameter?.type !== "trigger";

                      return (
                        <div key={`${selectedTransitionEntry.id}-${conditionIndex}`} className="grid gap-2 rounded-2xl bg-white/4 p-2">
                          <PropertyField label="Parameter">
                            <select
                              value={condition.parameterId}
                              onChange={(event) =>
                                updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                                  updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                    ...entry,
                                    conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                      entryIndex === conditionIndex ? { ...entryCondition, parameterId: event.target.value } : entryCondition
                                    ),
                                  }))
                                )
                              }
                              className={editorSelectClassName}
                            >
                              {props.parameters.map((parameterOption) => (
                                <option key={parameterOption.id} value={parameterOption.id}>
                                  {parameterOption.name}
                                </option>
                              ))}
                            </select>
                          </PropertyField>
                          <div className="grid gap-2 sm:grid-cols-[88px_minmax(0,1fr)_72px]">
                            <PropertyField label="Op">
                              <select
                                value={condition.operator}
                                onChange={(event) =>
                                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                                    updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                      ...entry,
                                      conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                        entryIndex === conditionIndex ? { ...entryCondition, operator: event.target.value as StateMachineTransition["conditions"][number]["operator"] } : entryCondition
                                      ),
                                    }))
                                  )
                                }
                                className={editorSelectClassName}
                              >
                                {TRANSITION_OPERATORS.map((operator) => (
                                  <option key={operator} value={operator}>
                                    {operator}
                                  </option>
                                ))}
                              </select>
                            </PropertyField>
                            <PropertyField label="Value">
                              {requiresValue ? (
                                parameter?.type === "bool" ? (
                                  <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
                                    <Checkbox
                                      checked={Boolean(condition.value)}
                                      onCheckedChange={(checked) =>
                                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                                          updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                            ...entry,
                                            conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                              entryIndex === conditionIndex ? { ...entryCondition, value: Boolean(checked) } : entryCondition
                                            ),
                                          }))
                                        )
                                      }
                                    />
                                    <span>{condition.value === true ? "True" : "False"}</span>
                                  </label>
                                ) : (
                                  <NumericDragInput
                                    value={Number(condition.value ?? 0)}
                                    step={parameter?.type === "int" ? 1 : 0.05}
                                    precision={parameter?.type === "int" ? 0 : 2}
                                    onChange={(value) =>
                                      updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                                        updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                          ...entry,
                                          conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                            entryIndex === conditionIndex ? { ...entryCondition, value } : entryCondition
                                          ),
                                        }))
                                      )
                                    }
                                  />
                                )
                              ) : (
                                <div className="flex h-8 items-center rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-500">N/A</div>
                              )}
                            </PropertyField>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                                    updateTransitionCollections(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState), (entry) => ({
                                      ...entry,
                                      conditions: entry.conditions.filter((_, entryIndex) => entryIndex !== conditionIndex),
                                    }))
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                        removeTransition(current, selectedTransitionEntry.id, Boolean(selectedTransition?.isAnyState))
                      );
                      setSelectedTransition(null);
                    }}
                  >
                    Remove Transition
                  </Button>
                </StudioSection>
              ) : null}

              {!selectedState && !selectedTransitionEntry ? (
                <div className={sectionHintClassName}>
                  Select a state node to edit its motion and timing, or select a transition edge to edit exit time, conditions, and interruption behavior.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
