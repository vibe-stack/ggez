import { createStableId } from "@ggez/anim-utils";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { EditorGraph, ParameterDefinition, TransitionOperator } from "@ggez/anim-schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PropertyField, editorInputClassName, editorSelectClassName, sectionHintClassName } from "../shared";
import {
  buildDefaultTransition,
  INTERRUPTION_SOURCES,
  NumericDragInput,
  TRANSITION_BLEND_CURVES,
  TRANSITION_OPERATORS,
  createDefaultStateMachineTransition,
  updateStateMachineNode
} from "./shared";
import { StateMachineOverview } from "./state-machine-overview";
import type { StateMachineNode, StateMachineState, StateMachineTransition } from "./types";

function updateTransitionCollections(
  current: StateMachineNode,
  transitionId: string,
  isAnyState: boolean,
  updater: (transition: StateMachineTransition) => StateMachineTransition
): StateMachineNode {
  return {
    ...current,
    transitions: isAnyState ? current.transitions : current.transitions.map((entry) => (entry.id === transitionId ? updater(entry) : entry)),
    anyStateTransitions: isAnyState
      ? current.anyStateTransitions.map((entry) => (entry.id === transitionId ? updater(entry) : entry))
      : current.anyStateTransitions,
  };
}

function removeTransition(current: StateMachineNode, transitionId: string, isAnyState: boolean): StateMachineNode {
  return {
    ...current,
    transitions: isAnyState ? current.transitions : current.transitions.filter((entry) => entry.id !== transitionId),
    anyStateTransitions: isAnyState ? current.anyStateTransitions.filter((entry) => entry.id !== transitionId) : current.anyStateTransitions,
  };
}

function TransitionListEditor(props: {
  title: string;
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StateMachineNode;
  transitions: StateMachineTransition[];
  isAnyState?: boolean;
  parameterOptions: ParameterDefinition[];
}) {
  const stateOptions = props.node.states.map((state) => ({ value: state.id, label: state.name }));

  return (
    <div className="space-y-2 rounded-[22px] bg-white/4 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-medium text-zinc-300">{props.title}</div>
          <div className="mt-1 text-[11px] leading-5 text-zinc-500">{props.isAnyState ? "Transitions that can fire from any active state." : "Transitions that connect one authored state to another."}</div>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            const firstState = props.node.states[0];
            const fallbackTarget = props.node.states[1] ?? props.node.states[0];
            if (!firstState || !fallbackTarget) {
              return;
            }

            const transition: StateMachineTransition = createDefaultStateMachineTransition({
              id: createStableId(props.isAnyState ? "any-transition" : "transition"),
              fromStateId: props.isAnyState ? undefined : firstState.id,
              toStateId: fallbackTarget.id,
              parameter: props.parameterOptions[0]
            });

            updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
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
        <div key={transition.id} className="space-y-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-zinc-200">{props.isAnyState ? "Any State" : props.node.states.find((state) => state.id === transition.fromStateId)?.name ?? "Missing"} to {props.node.states.find((state) => state.id === transition.toStateId)?.name ?? "Missing"}</div>
              <div className="mt-1 text-[10px] text-zinc-500">{transition.id}</div>
            </div>
            <Button variant="ghost" size="xs" onClick={() => updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => removeTransition(current, transition.id, Boolean(props.isAnyState)))}>
              Remove
            </Button>
          </div>

          <div className={props.isAnyState ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]" : "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px]"}>
            {props.isAnyState ? null : (
              <PropertyField label="From">
                <select
                  value={transition.fromStateId ?? stateOptions[0]?.value ?? ""}
                  onChange={(event) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                      updateTransitionCollections(current, transition.id, false, (entry) => ({ ...entry, fromStateId: event.target.value }))
                    )
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
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                    updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({ ...entry, toStateId: event.target.value }))
                  )
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
              <NumericDragInput
                value={transition.duration}
                step={0.05}
                precision={2}
                min={0}
                onChange={(value) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                    updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({ ...entry, duration: value }))
                  )
                }
              />
            </PropertyField>
          </div>

          <div className="grid gap-2 sm:grid-cols-[132px_minmax(0,1fr)_132px]">
            <PropertyField label="Exit Time">
              <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
                <Checkbox
                  checked={transition.hasExitTime}
                  onCheckedChange={(checked) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                      updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({ ...entry, hasExitTime: Boolean(checked) }))
                    )
                  }
                />
                <span>Enabled</span>
              </label>
            </PropertyField>
            <PropertyField label="Exit Normalized Time">
              <NumericDragInput
                value={transition.exitTime ?? 1}
                step={0.05}
                precision={2}
                min={0}
                onChange={(value) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                    updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({ ...entry, exitTime: value }))
                  )
                }
              />
            </PropertyField>
            <PropertyField label="Interrupt">
              <select
                value={transition.interruptionSource}
                onChange={(event) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                    updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
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
                value={transition.blendCurve}
                onChange={(event) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                    updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
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
                  checked={transition.syncNormalizedTime}
                  onCheckedChange={(checked) =>
                    updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                      updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
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
                variant="ghost"
                size="xs"
                onClick={() => {
                  const nextCondition = buildDefaultTransition(props.parameterOptions[0]);
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                    updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
                      ...entry,
                      conditions: [...entry.conditions, nextCondition],
                    }))
                  );
                }}
              >
                Add Condition
              </Button>
            </div>

            {transition.conditions.length === 0 ? <div className={sectionHintClassName}>No conditions. This transition will fire as soon as its timing gates pass.</div> : null}

            {transition.conditions.map((condition, conditionIndex) => {
              const parameter = props.parameterOptions.find((entry) => entry.id === condition.parameterId);
              const requiresValue = condition.operator !== "set" && parameter?.type !== "trigger";

              return (
                <div key={`${transition.id}-${conditionIndex}`} className="grid gap-2 rounded-2xl bg-white/4 p-2 sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_72px]">
                  <PropertyField label="Parameter">
                    <select
                      value={condition.parameterId}
                      onChange={(event) =>
                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                          updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
                            ...entry,
                            conditions: entry.conditions.map((entryCondition, entryIndex) =>
                              entryIndex === conditionIndex ? { ...entryCondition, parameterId: event.target.value } : entryCondition
                            ),
                          }))
                        )
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
                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                          updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
                            ...entry,
                            conditions: entry.conditions.map((entryCondition, entryIndex) =>
                              entryIndex === conditionIndex ? { ...entryCondition, operator: event.target.value as TransitionOperator } : entryCondition
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
                                updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
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
                              updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
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
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) =>
                          updateTransitionCollections(current, transition.id, Boolean(props.isAnyState), (entry) => ({
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
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatesEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StateMachineNode;
}) {
  const motionOptions = [{ value: "", label: "None (Passthrough)" }, ...props.graph.nodes
    .filter((candidate) => candidate.id !== props.node.id && candidate.kind !== "output")
    .map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.kind})` }))];

  return (
    <div className="space-y-2 rounded-[22px] bg-white/4 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-medium text-zinc-300">States</div>
          <div className="mt-1 text-[11px] leading-5 text-zinc-500">Pick the motion source for each state and define playback offsets here.</div>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            const nextState: StateMachineState = {
              id: createStableId("state"),
              name: `State ${props.node.states.length + 1}`,
              motionNodeId: motionOptions[0]?.value ?? "",
              position: { x: 220 + props.node.states.length * 56, y: 160 + props.node.states.length * 32 },
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

      {props.node.states.length === 0 ? <div className={sectionHintClassName}>Add at least one state to start building the machine.</div> : null}

      {props.node.states.map((state) => (
        <div key={state.id} className="space-y-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-zinc-200">{state.name}</div>
              <div className="mt-1 text-[10px] text-zinc-500">{state.id}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
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

          <div className="grid gap-2 sm:grid-cols-2">
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

          <div className="grid gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)]">
            <PropertyField label="Speed">
              <NumericDragInput
                value={state.speed}
                step={0.05}
                precision={2}
                onChange={(value) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                    ...current,
                    states: current.states.map((entry) => (entry.id === state.id ? { ...entry, speed: value } : entry)),
                  }))
                }
              />
            </PropertyField>
            <PropertyField label="Cycle Offset">
              <NumericDragInput
                value={state.cycleOffset}
                step={0.05}
                precision={2}
                onChange={(value) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                    ...current,
                    states: current.states.map((entry) => (entry.id === state.id ? { ...entry, cycleOffset: value } : entry)),
                  }))
                }
              />
            </PropertyField>
            <PropertyField label="Sync Group">
              <Input
                value={state.syncGroup ?? ""}
                onChange={(event) =>
                  updateStateMachineNode(props.store, props.graph.id, props.node.id, (current) => ({
                    ...current,
                    states: current.states.map((entry) =>
                      entry.id === state.id ? { ...entry, syncGroup: event.target.value.trim() || undefined } : entry
                    ),
                  }))
                }
                placeholder="optional"
                className={editorInputClassName}
              />
            </PropertyField>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StateMachineInspector(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StateMachineNode;
  parameters: ParameterDefinition[];
}) {
  return (
    <div className="space-y-3">
      <div className={sectionHintClassName}>Use clip and blend nodes as motion sources, then wire them into states and transitions here. The overview summarizes the machine; the editable controls below define the actual runtime behavior.</div>
      <StateMachineOverview node={props.node} parameters={props.parameters} />
      <StatesEditor store={props.store} graph={props.graph} node={props.node} />
      <TransitionListEditor title="State Transitions" store={props.store} graph={props.graph} node={props.node} transitions={props.node.transitions} parameterOptions={props.parameters} />
      <TransitionListEditor title="Any State Transitions" store={props.store} graph={props.graph} node={props.node} transitions={props.node.anyStateTransitions} isAnyState parameterOptions={props.parameters} />
    </div>
  );
}
