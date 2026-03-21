import { createStableId } from "@ggez/anim-utils";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { EditorGraph, EditorGraphNode, ParameterDefinition, TransitionOperator } from "@ggez/anim-schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEditorStoreValue } from "../use-editor-store-value";
import { PropertyField, StudioSection, editorInputClassName, editorSelectClassName, sectionHintClassName } from "./shared";

type Blend1DNode = Extract<EditorGraphNode, { kind: "blend1d" }>;
type Blend2DNode = Extract<EditorGraphNode, { kind: "blend2d" }>;
type StateMachineNode = Extract<EditorGraphNode, { kind: "stateMachine" }>;
type StateMachineState = StateMachineNode["states"][number];
type StateMachineTransition = StateMachineNode["transitions"][number];

const TRANSITION_OPERATORS: TransitionOperator[] = [">", ">=", "<", "<=", "==", "!=", "set"];
const INTERRUPTION_SOURCES: StateMachineTransition["interruptionSource"][] = ["none", "current", "next", "both"];

function updateTypedNode<TKind extends EditorGraphNode["kind"]>(
  store: AnimationEditorStore,
  graphId: string,
  nodeId: string,
  expectedKind: TKind,
  updater: (node: Extract<EditorGraphNode, { kind: TKind }>) => Extract<EditorGraphNode, { kind: TKind }>
) {
  store.updateNode(graphId, nodeId, (current) => {
    if (current.kind !== expectedKind) {
      return current;
    }

    return updater(current as Extract<EditorGraphNode, { kind: TKind }>);
  });
}

function updateStateMachineNode(
  store: AnimationEditorStore,
  graphId: string,
  nodeId: string,
  updater: (node: StateMachineNode) => StateMachineNode
) {
  updateTypedNode(store, graphId, nodeId, "stateMachine", updater);
}

function buildDefaultTransition(parameter?: ParameterDefinition): StateMachineTransition["conditions"][number] {
  return {
    parameterId: parameter?.id ?? "",
    operator: parameter?.type === "trigger" ? "set" : parameter?.type === "bool" ? "==" : ">",
    value: parameter?.type === "bool" ? true : parameter?.type === "trigger" ? undefined : 0,
  };
}

function Blend1DChildrenEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: Blend1DNode;
}) {
  if (props.node.children.length === 0) {
    return <div className={sectionHintClassName}>Connect clip nodes into this blend to create children, then edit thresholds here.</div>;
  }

  return (
    <div className="space-y-2">
      {props.node.children.map((child) => {
        const childNode = props.graph.nodes.find((candidate) => candidate.id === child.nodeId);

        return (
          <div key={child.nodeId} className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 border border-white/8 bg-black/20 p-2">
            <PropertyField label="Child">
              <Input
                value={child.label ?? childNode?.name ?? child.nodeId}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend1d", (current) => ({
                    ...current,
                    children: current.children.map((entry) =>
                      entry.nodeId === child.nodeId ? { ...entry, label: event.target.value } : entry
                    ),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Threshold">
              <Input
                type="number"
                value={child.threshold}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend1d", (current) => ({
                    ...current,
                    children: current.children.map((entry) =>
                      entry.nodeId === child.nodeId ? { ...entry, threshold: Number(event.target.value) } : entry
                    ),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
          </div>
        );
      })}
    </div>
  );
}

function Blend2DChildrenEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: Blend2DNode;
}) {
  if (props.node.children.length === 0) {
    return <div className={sectionHintClassName}>Connect clip nodes into this blend to create children, then edit sample positions here.</div>;
  }

  return (
    <div className="space-y-2">
      {props.node.children.map((child) => {
        const childNode = props.graph.nodes.find((candidate) => candidate.id === child.nodeId);

        return (
          <div key={child.nodeId} className="grid grid-cols-[minmax(0,1fr)_84px_84px] gap-2 border border-white/8 bg-black/20 p-2">
            <PropertyField label="Child">
              <Input
                value={child.label ?? childNode?.name ?? child.nodeId}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend2d", (current) => ({
                    ...current,
                    children: current.children.map((entry) =>
                      entry.nodeId === child.nodeId ? { ...entry, label: event.target.value } : entry
                    ),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="X">
              <Input
                type="number"
                value={child.x}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend2d", (current) => ({
                    ...current,
                    children: current.children.map((entry) =>
                      entry.nodeId === child.nodeId ? { ...entry, x: Number(event.target.value) } : entry
                    ),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Y">
              <Input
                type="number"
                value={child.y}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend2d", (current) => ({
                    ...current,
                    children: current.children.map((entry) =>
                      entry.nodeId === child.nodeId ? { ...entry, y: Number(event.target.value) } : entry
                    ),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
          </div>
        );
      })}
    </div>
  );
}

function TransitionListEditor(props: {
  title: string;
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StateMachineNode;
  transitions: StateMachineTransition[];
  isAnyState?: boolean;
  motionOptions: { value: string; label: string }[];
  parameterOptions: ParameterDefinition[];
}) {
  const { graph, node, store } = props;
  const stateOptions = node.states.map((state) => ({ value: state.id, label: state.name }));

  return (
    <div className="space-y-2 border border-white/8 bg-black/18 p-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{props.title}</div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            const firstState = node.states[0];
            const fallbackTarget = node.states[1] ?? node.states[0];
            if (!firstState || !fallbackTarget) {
              return;
            }

            const transition: StateMachineTransition = {
              id: createStableId(props.isAnyState ? "any-transition" : "transition"),
              fromStateId: props.isAnyState ? undefined : firstState.id,
              toStateId: fallbackTarget.id,
              duration: 0.15,
              hasExitTime: false,
              exitTime: 1,
              interruptionSource: "none",
              conditions: props.parameterOptions.length > 0 ? [buildDefaultTransition(props.parameterOptions[0])] : [],
            };

            updateStateMachineNode(store, graph.id, node.id, (current) => ({
              ...current,
              transitions: props.isAnyState ? current.transitions : [...current.transitions, transition],
              anyStateTransitions: props.isAnyState ? [...current.anyStateTransitions, transition] : current.anyStateTransitions,
            }));
          }}
        >
          Add
        </Button>
      </div>

      {props.transitions.length === 0 ? <div className={sectionHintClassName}>No transitions authored yet.</div> : null}

      {props.transitions.map((transition) => (
        <div key={transition.id} className="space-y-2 border border-white/8 bg-black/25 p-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{transition.id}</div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                updateStateMachineNode(store, graph.id, node.id, (current) => ({
                  ...current,
                  transitions: props.isAnyState ? current.transitions : current.transitions.filter((entry) => entry.id !== transition.id),
                  anyStateTransitions: props.isAnyState ? current.anyStateTransitions.filter((entry) => entry.id !== transition.id) : current.anyStateTransitions,
                }))
              }
            >
              Remove
            </Button>
          </div>

          <div className={props.isAnyState ? "grid grid-cols-[minmax(0,1fr)_96px] gap-2" : "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px] gap-2"}>
            {props.isAnyState ? null : (
              <PropertyField label="From">
                <select
                  value={transition.fromStateId ?? stateOptions[0]?.value ?? ""}
                  onChange={(event) =>
                    updateStateMachineNode(store, graph.id, node.id, (current) => ({
                      ...current,
                      transitions: current.transitions.map((entry) =>
                        entry.id === transition.id ? { ...entry, fromStateId: event.target.value } : entry
                      ),
                    }))
                  }
                  className={editorSelectClassName}
                >
                  {stateOptions.map((stateOption) => (
                    <option key={stateOption.value} value={stateOption.value}>
                      {stateOption.label}
                    </option>
                  ))}
                </select>
              </PropertyField>
            )}
            <PropertyField label="To">
              <select
                value={transition.toStateId}
                onChange={(event) =>
                  updateStateMachineNode(store, graph.id, node.id, (current) => ({
                    ...current,
                    transitions: props.isAnyState
                      ? current.transitions
                      : current.transitions.map((entry) => (entry.id === transition.id ? { ...entry, toStateId: event.target.value } : entry)),
                    anyStateTransitions: props.isAnyState
                      ? current.anyStateTransitions.map((entry) => (entry.id === transition.id ? { ...entry, toStateId: event.target.value } : entry))
                      : current.anyStateTransitions,
                  }))
                }
                className={editorSelectClassName}
              >
                {stateOptions.map((stateOption) => (
                  <option key={stateOption.value} value={stateOption.value}>
                    {stateOption.label}
                  </option>
                ))}
              </select>
            </PropertyField>
            <PropertyField label="Duration">
              <Input
                type="number"
                value={transition.duration}
                onChange={(event) =>
                  updateStateMachineNode(store, graph.id, node.id, (current) => ({
                    ...current,
                    transitions: props.isAnyState
                      ? current.transitions
                      : current.transitions.map((entry) => (entry.id === transition.id ? { ...entry, duration: Number(event.target.value) } : entry)),
                    anyStateTransitions: props.isAnyState
                      ? current.anyStateTransitions.map((entry) => (entry.id === transition.id ? { ...entry, duration: Number(event.target.value) } : entry))
                      : current.anyStateTransitions,
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
          </div>

          <div className="grid grid-cols-[132px_1fr_132px] gap-2">
            <PropertyField label="Exit Time">
              <label className="flex h-8 items-center gap-2 border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-200">
                <Checkbox
                  checked={transition.hasExitTime}
                  onCheckedChange={(checked) =>
                    updateStateMachineNode(store, graph.id, node.id, (current) => ({
                      ...current,
                      transitions: props.isAnyState
                        ? current.transitions
                        : current.transitions.map((entry) => (entry.id === transition.id ? { ...entry, hasExitTime: Boolean(checked) } : entry)),
                      anyStateTransitions: props.isAnyState
                        ? current.anyStateTransitions.map((entry) => (entry.id === transition.id ? { ...entry, hasExitTime: Boolean(checked) } : entry))
                        : current.anyStateTransitions,
                    }))
                  }
                />
                <span>Enabled</span>
              </label>
            </PropertyField>
            <PropertyField label="Exit Normalized Time">
              <Input
                type="number"
                value={transition.exitTime ?? 1}
                onChange={(event) =>
                  updateStateMachineNode(store, graph.id, node.id, (current) => ({
                    ...current,
                    transitions: props.isAnyState
                      ? current.transitions
                      : current.transitions.map((entry) => (entry.id === transition.id ? { ...entry, exitTime: Number(event.target.value) } : entry)),
                    anyStateTransitions: props.isAnyState
                      ? current.anyStateTransitions.map((entry) => (entry.id === transition.id ? { ...entry, exitTime: Number(event.target.value) } : entry))
                      : current.anyStateTransitions,
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Interrupt">
              <select
                value={transition.interruptionSource}
                onChange={(event) =>
                  updateStateMachineNode(store, graph.id, node.id, (current) => ({
                    ...current,
                    transitions: props.isAnyState
                      ? current.transitions
                      : current.transitions.map((entry) =>
                          entry.id === transition.id
                            ? { ...entry, interruptionSource: event.target.value as StateMachineTransition["interruptionSource"] }
                            : entry
                        ),
                    anyStateTransitions: props.isAnyState
                      ? current.anyStateTransitions.map((entry) =>
                          entry.id === transition.id
                            ? { ...entry, interruptionSource: event.target.value as StateMachineTransition["interruptionSource"] }
                            : entry
                        )
                      : current.anyStateTransitions,
                  }))
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

          <div className="space-y-2 border-t border-white/8 pt-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Conditions</div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  const nextCondition = buildDefaultTransition(props.parameterOptions[0]);
                  updateStateMachineNode(store, graph.id, node.id, (current) => ({
                    ...current,
                    transitions: props.isAnyState
                      ? current.transitions
                      : current.transitions.map((entry) =>
                          entry.id === transition.id ? { ...entry, conditions: [...entry.conditions, nextCondition] } : entry
                        ),
                    anyStateTransitions: props.isAnyState
                      ? current.anyStateTransitions.map((entry) =>
                          entry.id === transition.id ? { ...entry, conditions: [...entry.conditions, nextCondition] } : entry
                        )
                      : current.anyStateTransitions,
                  }));
                }}
              >
                Add Condition
              </Button>
            </div>

            {transition.conditions.length === 0 ? <div className={sectionHintClassName}>No conditions. This transition will fire as soon as its other timing gates pass.</div> : null}

            {transition.conditions.map((condition, conditionIndex) => {
              const parameter = props.parameterOptions.find((entry) => entry.id === condition.parameterId);
              const requiresValue = condition.operator !== "set" && parameter?.type !== "trigger";

              return (
                <div key={`${transition.id}-${conditionIndex}`} className="grid grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_72px] gap-2 border border-white/8 bg-black/18 p-2">
                  <PropertyField label="Parameter">
                    <select
                      value={condition.parameterId}
                      onChange={(event) =>
                        updateStateMachineNode(store, graph.id, node.id, (current) => ({
                          ...current,
                          transitions: props.isAnyState
                            ? current.transitions
                            : current.transitions.map((entry) =>
                                entry.id === transition.id
                                  ? {
                                      ...entry,
                                      conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                        entryIndex === conditionIndex
                                          ? {
                                              ...entryCondition,
                                              parameterId: event.target.value,
                                            }
                                          : entryCondition
                                      ),
                                    }
                                  : entry
                              ),
                          anyStateTransitions: props.isAnyState
                            ? current.anyStateTransitions.map((entry) =>
                                entry.id === transition.id
                                  ? {
                                      ...entry,
                                      conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                        entryIndex === conditionIndex
                                          ? {
                                              ...entryCondition,
                                              parameterId: event.target.value,
                                            }
                                          : entryCondition
                                      ),
                                    }
                                  : entry
                              )
                            : current.anyStateTransitions,
                        }))
                      }
                      className={editorSelectClassName}
                    >
                      {props.parameterOptions.map((parameterOption) => (
                        <option key={parameterOption.id} value={parameterOption.id}>
                          {parameterOption.name}
                        </option>
                      ))}
                    </select>
                  </PropertyField>
                  <PropertyField label="Op">
                    <select
                      value={condition.operator}
                      onChange={(event) =>
                        updateStateMachineNode(store, graph.id, node.id, (current) => ({
                          ...current,
                          transitions: props.isAnyState
                            ? current.transitions
                            : current.transitions.map((entry) =>
                                entry.id === transition.id
                                  ? {
                                      ...entry,
                                      conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                        entryIndex === conditionIndex
                                          ? {
                                              ...entryCondition,
                                              operator: event.target.value as TransitionOperator,
                                            }
                                          : entryCondition
                                      ),
                                    }
                                  : entry
                              ),
                          anyStateTransitions: props.isAnyState
                            ? current.anyStateTransitions.map((entry) =>
                                entry.id === transition.id
                                  ? {
                                      ...entry,
                                      conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                        entryIndex === conditionIndex
                                          ? {
                                              ...entryCondition,
                                              operator: event.target.value as TransitionOperator,
                                            }
                                          : entryCondition
                                      ),
                                    }
                                  : entry
                              )
                            : current.anyStateTransitions,
                        }))
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
                        <label className="flex h-8 items-center gap-2 border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-200">
                          <Checkbox
                            checked={Boolean(condition.value)}
                            onCheckedChange={(checked) =>
                              updateStateMachineNode(store, graph.id, node.id, (current) => ({
                                ...current,
                                transitions: props.isAnyState
                                  ? current.transitions
                                  : current.transitions.map((entry) =>
                                      entry.id === transition.id
                                        ? {
                                            ...entry,
                                            conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                              entryIndex === conditionIndex ? { ...entryCondition, value: Boolean(checked) } : entryCondition
                                            ),
                                          }
                                        : entry
                                    ),
                                anyStateTransitions: props.isAnyState
                                  ? current.anyStateTransitions.map((entry) =>
                                      entry.id === transition.id
                                        ? {
                                            ...entry,
                                            conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                              entryIndex === conditionIndex ? { ...entryCondition, value: Boolean(checked) } : entryCondition
                                            ),
                                          }
                                        : entry
                                    )
                                  : current.anyStateTransitions,
                              }))
                            }
                          />
                          <span>{condition.value === true ? "True" : "False"}</span>
                        </label>
                      ) : (
                        <Input
                          type="number"
                          value={Number(condition.value ?? 0)}
                          onChange={(event) =>
                            updateStateMachineNode(store, graph.id, node.id, (current) => ({
                              ...current,
                              transitions: props.isAnyState
                                ? current.transitions
                                : current.transitions.map((entry) =>
                                    entry.id === transition.id
                                      ? {
                                          ...entry,
                                          conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                            entryIndex === conditionIndex ? { ...entryCondition, value: Number(event.target.value) } : entryCondition
                                          ),
                                        }
                                      : entry
                                  ),
                              anyStateTransitions: props.isAnyState
                                ? current.anyStateTransitions.map((entry) =>
                                    entry.id === transition.id
                                      ? {
                                          ...entry,
                                          conditions: entry.conditions.map((entryCondition, entryIndex) =>
                                            entryIndex === conditionIndex ? { ...entryCondition, value: Number(event.target.value) } : entryCondition
                                          ),
                                        }
                                      : entry
                                  )
                                : current.anyStateTransitions,
                            }))
                          }
                          className={editorInputClassName}
                        />
                      )
                    ) : (
                      <div className="flex h-8 items-center border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-500">N/A</div>
                    )}
                  </PropertyField>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        updateStateMachineNode(store, graph.id, node.id, (current) => ({
                          ...current,
                          transitions: props.isAnyState
                            ? current.transitions
                            : current.transitions.map((entry) =>
                                entry.id === transition.id
                                  ? {
                                      ...entry,
                                      conditions: entry.conditions.filter((_, entryIndex) => entryIndex !== conditionIndex),
                                    }
                                  : entry
                              ),
                          anyStateTransitions: props.isAnyState
                            ? current.anyStateTransitions.map((entry) =>
                                entry.id === transition.id
                                  ? {
                                      ...entry,
                                      conditions: entry.conditions.filter((_, entryIndex) => entryIndex !== conditionIndex),
                                    }
                                  : entry
                              )
                            : current.anyStateTransitions,
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StateMachineEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StateMachineNode;
  parameters: ParameterDefinition[];
}) {
  const motionOptions = props.graph.nodes
    .filter((candidate) => candidate.id !== props.node.id && candidate.kind !== "output")
    .map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.kind})` }));

  return (
    <div className="space-y-3">
      <div className={sectionHintClassName}>Use regular clip and blend nodes as motion sources, then reference them from states below. This lets you build locomotion graphs plus jump start, loop, and land transitions in one graph.</div>

      <div className="space-y-2 border border-white/8 bg-black/18 p-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">States</div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              const nextState: StateMachineState = {
                id: createStableId("state"),
                name: `State ${props.node.states.length + 1}`,
                motionNodeId: motionOptions[0]?.value ?? "unassigned-motion",
                speed: 1,
                cycleOffset: 0,
              };

              updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                ...current,
                entryStateId: current.states.length === 0 ? nextState.id : current.entryStateId,
                states: [...current.states, nextState],
              }));
            }}
          >
            Add State
          </Button>
        </div>

        {props.node.states.map((state) => (
          <div key={state.id} className="space-y-2 border border-white/8 bg-black/25 p-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{state.id}</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                  <Checkbox
                    checked={props.node.entryStateId === state.id}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        return;
                      }

                      updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                        ...current,
                        entryStateId: state.id,
                      }));
                    }}
                  />
                  Entry
                </label>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (props.node.states.length <= 1) {
                      return;
                    }

                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => {
                      const remainingStates = current.states.filter((entry) => entry.id !== state.id);
                      return {
                        ...current,
                        entryStateId: current.entryStateId === state.id ? remainingStates[0]?.id ?? current.entryStateId : current.entryStateId,
                        states: remainingStates,
                        transitions: current.transitions.filter((transition) => transition.fromStateId !== state.id && transition.toStateId !== state.id),
                        anyStateTransitions: current.anyStateTransitions.filter((transition) => transition.toStateId !== state.id),
                      };
                    });
                  }}
                  disabled={props.node.states.length <= 1}
                >
                  Remove
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <PropertyField label="Name">
                <Input
                  value={state.name}
                  onChange={(event) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                      ...current,
                      states: current.states.map((entry) => (entry.id === state.id ? { ...entry, name: event.target.value } : entry)),
                    }))
                  }
                  className={editorInputClassName}
                />
              </PropertyField>
              <PropertyField label="Motion Node">
                <select
                  value={state.motionNodeId}
                  onChange={(event) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                      ...current,
                      states: current.states.map((entry) => (entry.id === state.id ? { ...entry, motionNodeId: event.target.value } : entry)),
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
            </div>

            <div className="grid grid-cols-[120px_120px] gap-2">
              <PropertyField label="Speed">
                <Input
                  type="number"
                  value={state.speed}
                  onChange={(event) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                      ...current,
                      states: current.states.map((entry) => (entry.id === state.id ? { ...entry, speed: Number(event.target.value) } : entry)),
                    }))
                  }
                  className={editorInputClassName}
                />
              </PropertyField>
              <PropertyField label="Cycle Offset">
                <Input
                  type="number"
                  value={state.cycleOffset}
                  onChange={(event) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                      ...current,
                      states: current.states.map((entry) => (entry.id === state.id ? { ...entry, cycleOffset: Number(event.target.value) } : entry)),
                    }))
                  }
                  className={editorInputClassName}
                />
              </PropertyField>
            </div>
          </div>
        ))}
      </div>

      <TransitionListEditor
        title="State Transitions"
        store={props.store}
        graph={props.graph}
        node={props.node}
        transitions={props.node.transitions}
        motionOptions={motionOptions}
        parameterOptions={props.parameters}
      />

      <TransitionListEditor
        title="Any State Transitions"
        store={props.store}
        graph={props.graph}
        node={props.node}
        transitions={props.node.anyStateTransitions}
        isAnyState
        motionOptions={motionOptions}
        parameterOptions={props.parameters}
      />
    </div>
  );
}

export function NodeInspector(props: { store: AnimationEditorStore }) {
  const state = useEditorStoreValue(props.store, () => props.store.getState(), ["selection", "graphs", "parameters"]);
  const graph = state.document.graphs.find((entry) => entry.id === state.selection.graphId);
  const node = graph?.nodes.find((entry) => entry.id === state.selection.nodeIds[0]);

  return (
    <StudioSection title="Inspector">
      {!graph || !node ? <div className={sectionHintClassName}>Select a node to edit its properties.</div> : null}

      {graph && node ? (
        <div className="space-y-3">
          <PropertyField label="Name">
            <Input
              value={node.name}
              onChange={(event) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, name: event.target.value }))}
              className={editorInputClassName}
            />
          </PropertyField>

          {node.kind === "clip" ? (
            <>
              <PropertyField label="Clip">
                <select
                  value={node.clipId}
                  onChange={(event) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, clipId: event.target.value }))}
                  className={editorSelectClassName}
                >
                  {state.document.clips.map((clip) => (
                    <option key={clip.id} value={clip.id}>
                      {clip.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <PropertyField label="Speed">
                <Input
                  type="number"
                  value={node.speed}
                  onChange={(event) =>
                    props.store.updateNode(graph.id, node.id, (current) => ({
                      ...current,
                      speed: Number(event.target.value),
                    }))
                  }
                  className={editorInputClassName}
                />
              </PropertyField>
              <PropertyField label="Loop">
                <label className="flex h-8 items-center gap-2 border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-200">
                  <Checkbox
                    checked={node.loop}
                    onCheckedChange={(checked) =>
                      updateTypedNode(props.store, graph.id, node.id, "clip", (current) => ({
                        ...current,
                        loop: Boolean(checked),
                      }))
                    }
                  />
                  <span>{node.loop ? "Looping" : "Play once"}</span>
                </label>
              </PropertyField>
            </>
          ) : null}

          {node.kind === "blend1d" ? (
            <>
              <PropertyField label="Parameter">
                <select
                  value={node.parameterId}
                  onChange={(event) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, parameterId: event.target.value }))}
                  className={editorSelectClassName}
                >
                  {state.document.parameters.map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <Blend1DChildrenEditor store={props.store} graph={graph} node={node} />
            </>
          ) : null}

          {node.kind === "blend2d" ? (
            <>
              <PropertyField label="X Parameter">
                <select
                  value={node.xParameterId}
                  onChange={(event) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, xParameterId: event.target.value }))}
                  className={editorSelectClassName}
                >
                  {state.document.parameters.map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <PropertyField label="Y Parameter">
                <select
                  value={node.yParameterId}
                  onChange={(event) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, yParameterId: event.target.value }))}
                  className={editorSelectClassName}
                >
                  {state.document.parameters.map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <Blend2DChildrenEditor store={props.store} graph={graph} node={node} />
            </>
          ) : null}

          {node.kind === "subgraph" ? (
            <PropertyField label="Graph">
              <select
                value={node.graphId}
                onChange={(event) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, graphId: event.target.value }))}
                className={editorSelectClassName}
              >
                {state.document.graphs.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </PropertyField>
          ) : null}

          {node.kind === "output" ? <div className={sectionHintClassName}>Connect a motion node into the output node to define the graph result.</div> : null}

          {node.kind === "stateMachine" ? (
            <StateMachineEditor store={props.store} graph={graph} node={node} parameters={state.document.parameters} />
          ) : null}
        </div>
      ) : null}
    </StudioSection>
  );
}

export function ParameterTypeSelect(props: {
  value: ParameterDefinition["type"];
  onChange: (value: ParameterDefinition["type"]) => void;
}) {
  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value as ParameterDefinition["type"])} className={editorSelectClassName}>
      <option value="float">Float</option>
      <option value="int">Int</option>
      <option value="bool">Bool</option>
      <option value="trigger">Trigger</option>
    </select>
  );
}