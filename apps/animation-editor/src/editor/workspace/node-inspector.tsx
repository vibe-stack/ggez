import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { ParameterDefinition } from "@ggez/anim-schema";
import { Input } from "@/components/ui/input";
import { useEditorStoreValue } from "../use-editor-store-value";
import { PropertyField, StudioSection, editorInputClassName, editorSelectClassName, sectionHintClassName } from "./shared";

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
              <div className={sectionHintClassName}>Connect clip nodes into this blend node on the canvas to author thresholds.</div>
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
            <div className={sectionHintClassName}>
              State machine data already exists in the schema and compiler. The editor can grow here without changing runtime contracts.
            </div>
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