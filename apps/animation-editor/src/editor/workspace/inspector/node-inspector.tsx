import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEditorStoreValue } from "../../use-editor-store-value";
import { PropertyField, editorInputClassName, editorSelectClassName, sectionHintClassName } from "../shared";
import { Blend1DChildrenEditor, Blend2DChildrenEditor, OrientationWarpLegsEditor, SelectorChildrenEditor, StrideWarpLegsEditor } from "./blend-editors";
import { NumericDragInput, updateTypedNode } from "./shared";
import { StateMachineInspector } from "./state-machine-inspector";

export function NodeInspector(props: { store: AnimationEditorStore }) {
  const state = useEditorStoreValue(props.store, () => props.store.getState(), ["document", "selection", "graphs", "parameters"]);
  const graph = state.document.graphs.find((entry) => entry.id === state.selection.graphId);
  const node = graph?.nodes.find((entry) => entry.id === state.selection.nodeIds[0]);

  function renderSyncGroupField(kind: "clip" | "blend1d" | "blend2d" | "selector" | "subgraph") {
    if (!graph || !node || node.kind !== kind) {
      return null;
    }

    return (
      <PropertyField label="Sync Group">
        <Input
          value={node.syncGroup ?? ""}
          onChange={(event) =>
            updateTypedNode(props.store, graph.id, node.id, kind, (current) => ({
              ...current,
              syncGroup: event.target.value.trim() || undefined,
            }))
          }
          placeholder="optional"
          className={editorInputClassName}
        />
      </PropertyField>
    );
  }

  return (
    <div className="space-y-3">
      <div className="px-1 text-[12px] font-medium text-zinc-300">Inspector</div>
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
                <NumericDragInput
                  value={node.speed}
                  step={0.05}
                  precision={2}
                  onChange={(value) => props.store.updateNode(graph.id, node.id, (current) => ({ ...current, speed: value }))}
                />
              </PropertyField>
              <PropertyField label="Loop">
                <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
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
              <PropertyField label="Translation">
                <ButtonGroup className="grid w-full grid-cols-2">
                  <Button
                    type="button"
                    size="xs"
                    variant={node.inPlace ? "outline" : "default"}
                    className={node.inPlace ? "border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10" : "border-emerald-300/30 bg-emerald-300 text-emerald-950 hover:bg-emerald-200"}
                    onClick={() =>
                      updateTypedNode(props.store, graph.id, node.id, "clip", (current) => ({
                        ...current,
                        inPlace: false,
                      }))
                    }
                  >
                    Root Motion
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={node.inPlace ? "default" : "outline"}
                    className={node.inPlace ? "border-emerald-300/30 bg-emerald-300 text-emerald-950 hover:bg-emerald-200" : "border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"}
                    onClick={() =>
                      updateTypedNode(props.store, graph.id, node.id, "clip", (current) => ({
                        ...current,
                        inPlace: true,
                      }))
                    }
                  >
                    In Place
                  </Button>
                </ButtonGroup>
              </PropertyField>
              {renderSyncGroupField("clip")}
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
              {renderSyncGroupField("blend1d")}
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
              {renderSyncGroupField("blend2d")}
            </>
          ) : null}

          {node.kind === "selector" ? (
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
              <SelectorChildrenEditor store={props.store} graph={graph} node={node} />
              {renderSyncGroupField("selector")}
            </>
          ) : null}

          {node.kind === "orientationWarp" ? (
            <>
              <div className={sectionHintClassName}>Connect a locomotion pose into this node, then drive the warp angle from a float parameter in radians. Legs are stabilized against the pre-warp foot targets.</div>
              <PropertyField label="Angle Parameter">
                <select
                  value={node.angleParameterId}
                  onChange={(event) =>
                    updateTypedNode(props.store, graph.id, node.id, "orientationWarp", (current) => ({
                      ...current,
                      angleParameterId: event.target.value,
                    }))
                  }
                  className={editorSelectClassName}
                >
                  {state.document.parameters.map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <PropertyField label="Weight">
                <NumericDragInput
                  value={node.weight}
                  step={0.05}
                  precision={2}
                  min={0}
                  max={1}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "orientationWarp", (current) => ({
                      ...current,
                      weight: Math.max(0, Math.min(1, value)),
                    }))
                  }
                />
              </PropertyField>
              <PropertyField label="Max Angle (rad)">
                <NumericDragInput
                  value={node.maxAngle}
                  step={0.05}
                  precision={2}
                  min={0.05}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "orientationWarp", (current) => ({
                      ...current,
                      maxAngle: Math.max(0.05, value),
                    }))
                  }
                />
              </PropertyField>
              <PropertyField label="Hip Bone">
                <Input
                  value={node.hipBoneName ?? ""}
                  onChange={(event) =>
                    updateTypedNode(props.store, graph.id, node.id, "orientationWarp", (current) => ({
                      ...current,
                      hipBoneName: event.target.value.trim() || undefined,
                    }))
                  }
                  placeholder="Hips"
                  className={editorInputClassName}
                />
              </PropertyField>
              <PropertyField label="Hip Weight">
                <NumericDragInput
                  value={node.hipWeight}
                  step={0.05}
                  precision={2}
                  min={0}
                  max={1}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "orientationWarp", (current) => ({
                      ...current,
                      hipWeight: Math.max(0, Math.min(1, value)),
                    }))
                  }
                />
              </PropertyField>
              <PropertyField label="Spine Bones">
                <Input
                  value={node.spineBoneNames.join(", ")}
                  onChange={(event) =>
                    updateTypedNode(props.store, graph.id, node.id, "orientationWarp", (current) => ({
                      ...current,
                      spineBoneNames: event.target.value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="Spine, Spine1, Spine2"
                  className={editorInputClassName}
                />
              </PropertyField>
              <PropertyField label="Leg IK">
                <OrientationWarpLegsEditor store={props.store} graph={graph} node={node} />
              </PropertyField>
            </>
          ) : null}

          {node.kind === "strideWarp" ? (
            <>
              <div className={sectionHintClassName}>Connect a locomotion pose into this node, then scale foot spacing to match runtime movement speed. Graph mode expects a float parameter in real movement-speed units and derives scale from that value versus sampled root-motion speed. Do not point it at a normalized blend parameter like a 0..1 walk-run control unless you intentionally want root motion scaled down. Manual mode uses the authored scale and direction.</div>
              <PropertyField label="Evaluation Mode">
                <ButtonGroup className="grid w-full grid-cols-2">
                  <Button
                    type="button"
                    size="xs"
                    variant={node.evaluationMode === "graph" ? "default" : "outline"}
                    className={node.evaluationMode === "graph" ? "border-emerald-300/30 bg-emerald-300 text-emerald-950 hover:bg-emerald-200" : "border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"}
                    onClick={() =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        evaluationMode: "graph",
                      }))
                    }
                  >
                    Graph
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={node.evaluationMode === "manual" ? "default" : "outline"}
                    className={node.evaluationMode === "manual" ? "border-emerald-300/30 bg-emerald-300 text-emerald-950 hover:bg-emerald-200" : "border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"}
                    onClick={() =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        evaluationMode: "manual",
                      }))
                    }
                  >
                    Manual
                  </Button>
                </ButtonGroup>
              </PropertyField>
              {node.evaluationMode === "graph" ? (
                <PropertyField label="Locomotion Speed">
                  <select
                    value={node.locomotionSpeedParameterId ?? ""}
                    onChange={(event) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        locomotionSpeedParameterId: event.target.value,
                      }))
                    }
                    className={editorSelectClassName}
                  >
                    {state.document.parameters.filter((parameter) => parameter.type === "float").map((parameter) => (
                      <option key={parameter.id} value={parameter.id}>
                        {parameter.name}
                      </option>
                    ))}
                  </select>
                </PropertyField>
              ) : (
                <>
                  <PropertyField label="Stride Scale">
                    <NumericDragInput
                      value={node.manualStrideScale}
                      step={0.05}
                      precision={2}
                      min={0.05}
                      onChange={(value) =>
                        updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                          ...current,
                          manualStrideScale: Math.max(0.05, value),
                        }))
                      }
                    />
                  </PropertyField>
                  <div className="grid grid-cols-2 gap-2">
                    <PropertyField label="Direction X">
                      <NumericDragInput
                        value={node.strideDirection.x}
                        step={0.05}
                        precision={2}
                        onChange={(value) =>
                          updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                            ...current,
                            strideDirection: {
                              ...current.strideDirection,
                              x: value,
                            },
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Direction Z">
                      <NumericDragInput
                        value={node.strideDirection.y}
                        step={0.05}
                        precision={2}
                        onChange={(value) =>
                          updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                            ...current,
                            strideDirection: {
                              ...current.strideDirection,
                              y: value,
                            },
                          }))
                        }
                      />
                    </PropertyField>
                  </div>
                </>
              )}
              <PropertyField label="Min Speed Threshold">
                <NumericDragInput
                  value={node.minLocomotionSpeedThreshold}
                  step={0.01}
                  precision={2}
                  min={0}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                      ...current,
                      minLocomotionSpeedThreshold: Math.max(0, value),
                    }))
                  }
                />
              </PropertyField>
              <PropertyField label="Pelvis Bone">
                <Input
                  value={node.pelvisBoneName ?? ""}
                  onChange={(event) =>
                    updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                      ...current,
                      pelvisBoneName: event.target.value.trim() || undefined,
                    }))
                  }
                  placeholder="Hips"
                  className={editorInputClassName}
                />
              </PropertyField>
              <PropertyField label="Pelvis Weight">
                <NumericDragInput
                  value={node.pelvisWeight}
                  step={0.05}
                  precision={2}
                  min={0}
                  max={1}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                      ...current,
                      pelvisWeight: Math.max(0, Math.min(1, value)),
                    }))
                  }
                />
              </PropertyField>
              <PropertyField label="Clamp Result">
                <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
                  <Checkbox
                    checked={node.clampResult}
                    onCheckedChange={(checked) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        clampResult: Boolean(checked),
                      }))
                    }
                  />
                  <span>{node.clampResult ? "Clamp enabled" : "Clamp disabled"}</span>
                </label>
              </PropertyField>
              <div className="grid grid-cols-2 gap-2">
                <PropertyField label="Min Scale">
                  <NumericDragInput
                    value={node.minStrideScale}
                    step={0.05}
                    precision={2}
                    min={0.05}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        minStrideScale: Math.max(0.05, value),
                      }))
                    }
                  />
                </PropertyField>
                <PropertyField label="Max Scale">
                  <NumericDragInput
                    value={node.maxStrideScale}
                    step={0.05}
                    precision={2}
                    min={0.05}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        maxStrideScale: Math.max(0.05, value),
                      }))
                    }
                  />
                </PropertyField>
              </div>
              <PropertyField label="Interp Result">
                <label className="flex h-8 items-center gap-2 rounded-xl bg-white/7 px-2.5 text-[12px] text-zinc-200">
                  <Checkbox
                    checked={node.interpResult}
                    onCheckedChange={(checked) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        interpResult: Boolean(checked),
                      }))
                    }
                  />
                  <span>{node.interpResult ? "Interpolation enabled" : "Interpolation disabled"}</span>
                </label>
              </PropertyField>
              <div className="grid grid-cols-2 gap-2">
                <PropertyField label="Interp Up">
                  <NumericDragInput
                    value={node.interpSpeedIncreasing}
                    step={0.1}
                    precision={2}
                    min={0}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        interpSpeedIncreasing: Math.max(0, value),
                      }))
                    }
                  />
                </PropertyField>
                <PropertyField label="Interp Down">
                  <NumericDragInput
                    value={node.interpSpeedDecreasing}
                    step={0.1}
                    precision={2}
                    min={0}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "strideWarp", (current) => ({
                        ...current,
                        interpSpeedDecreasing: Math.max(0, value),
                      }))
                    }
                  />
                </PropertyField>
              </div>
              <PropertyField label="Foot Definitions">
                <StrideWarpLegsEditor store={props.store} graph={graph} node={node} />
              </PropertyField>
            </>
          ) : null}

          {node.kind === "secondaryDynamics" ? (
            <>
              <div className={sectionHintClassName}>Apply cheap secondary motion to authored chains and collision spheres from the Character view.</div>
              <PropertyField label="Dynamics Profile">
                <select
                  value={node.profileId}
                  onChange={(event) =>
                    updateTypedNode(props.store, graph.id, node.id, "secondaryDynamics", (current) => ({
                      ...current,
                      profileId: event.target.value,
                    }))
                  }
                  className={editorSelectClassName}
                >
                  <option value="">Select profile</option>
                  {state.document.dynamicsProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <PropertyField label="Weight">
                <NumericDragInput
                  value={node.weight}
                  step={0.05}
                  precision={2}
                  min={0}
                  max={1}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "secondaryDynamics", (current) => ({
                      ...current,
                      weight: Math.max(0, Math.min(1, value)),
                    }))
                  }
                />
              </PropertyField>
              <div className="grid grid-cols-3 gap-2">
                <PropertyField label="Damping">
                  <NumericDragInput
                    value={node.dampingScale}
                    step={0.05}
                    precision={2}
                    min={0}
                    max={4}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "secondaryDynamics", (current) => ({
                        ...current,
                        dampingScale: Math.max(0, Math.min(4, value)),
                      }))
                    }
                  />
                </PropertyField>
                <PropertyField label="Stiffness">
                  <NumericDragInput
                    value={node.stiffnessScale}
                    step={0.05}
                    precision={2}
                    min={0}
                    max={4}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "secondaryDynamics", (current) => ({
                        ...current,
                        stiffnessScale: Math.max(0, Math.min(4, value)),
                      }))
                    }
                  />
                </PropertyField>
                <PropertyField label="Gravity">
                  <NumericDragInput
                    value={node.gravityScale}
                    step={0.05}
                    precision={2}
                    min={0}
                    max={4}
                    onChange={(value) =>
                      updateTypedNode(props.store, graph.id, node.id, "secondaryDynamics", (current) => ({
                        ...current,
                        gravityScale: Math.max(0, Math.min(4, value)),
                      }))
                    }
                  />
                </PropertyField>
              </div>
              <PropertyField label="Iterations">
                <NumericDragInput
                  value={node.iterations}
                  step={1}
                  precision={0}
                  min={1}
                  max={12}
                  onChange={(value) =>
                    updateTypedNode(props.store, graph.id, node.id, "secondaryDynamics", (current) => ({
                      ...current,
                      iterations: Math.max(1, Math.min(12, Math.round(value))),
                    }))
                  }
                />
              </PropertyField>
            </>
          ) : null}

          {node.kind === "subgraph" ? (
            <>
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
              {renderSyncGroupField("subgraph")}
            </>
          ) : null}

          {node.kind === "output" ? <div className={sectionHintClassName}>Connect a motion node into the output node to define the graph result.</div> : null}

          {node.kind === "stateMachine" ? <StateMachineInspector store={props.store} graph={graph} node={node} parameters={state.document.parameters} /> : null}
        </div>
      ) : null}
    </div>
  );
}
