import { useEffect, useRef, useState } from "react";
import {
  isInstancingNode,
  isLightNode,
  isPrimitiveNode,
  vec3,
  type EditableMesh,
  type Entity,
  type GeometryNode,
  type LightNodeData,
  type PrimitiveNodeData,
  type SceneSettings,
  type Transform,
  type Vec3
} from "@ggez/shared";
import type { ToolId } from "@ggez/tool-system";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { rebaseTransformPivot } from "@/viewport/utils/geometry";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import {
  EntityInspector,
  InstancingInspector,
  LightInspector,
  MeshPhysicsInspector,
  PrimitiveInspector
} from "./NodeInspectors";
import { SectionTitle, ToolSection, TransformGroup } from "./InspectorFields";

const AXES = ["x", "y", "z"] as const;

export type InspectPanelProps = {
  activeToolId: ToolId;
  meshEditMode: MeshEditMode;
  onClipSelection: (axis: "x" | "y" | "z") => void;
  onExtrudeSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onMirrorSelection: (axis: "x" | "y" | "z") => void;
  onTranslateSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onUpdateEntityHooks: (
    entityId: string,
    hooks: NonNullable<Entity["hooks"]>,
    beforeHooks?: NonNullable<Entity["hooks"]>
  ) => void;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
  onUpdateEntityTransform: (
    entityId: string,
    transform: Transform,
    beforeTransform?: Transform
  ) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
  onUpdateNodeHooks: (
    nodeId: string,
    hooks: NonNullable<GeometryNode["hooks"]>,
    beforeHooks?: NonNullable<GeometryNode["hooks"]>
  ) => void;
  onUpdateNodeTransform: (
    nodeId: string,
    transform: Transform,
    beforeTransform?: Transform
  ) => void;
  selectedEntity?: Entity;
  selectedFaceIds: string[];
  selectedNode?: GeometryNode;
  selectedNodeIds: string[];
  viewportTarget: Vec3;
};

export function InspectPanel({
  activeToolId,
  meshEditMode,
  onClipSelection,
  onExtrudeSelection,
  onMeshEditToolbarAction,
  onMirrorSelection,
  onTranslateSelection,
  onUpdateEntityTransform,
  onUpdateEntityProperties,
  onUpdateMeshData,
  onUpdateNodeData,
  onUpdateNodeTransform,
  selectedEntity,
  selectedFaceIds,
  selectedNode,
  selectedNodeIds
}: InspectPanelProps) {
  const selectedTarget = selectedNode ?? selectedEntity;
  const [draftTransform, setDraftTransform] = useState<Transform | undefined>(() =>
    selectedTarget ? structuredClone(selectedTarget.transform) : undefined
  );
  const draftTransformRef = useRef(draftTransform);
  const selectedNodeRef = useRef(selectedNode);
  const selectedEntityRef = useRef(selectedEntity);
  const selectedTargetRef = useRef(selectedTarget);

  selectedNodeRef.current = selectedNode;
  selectedEntityRef.current = selectedEntity;
  selectedTargetRef.current = selectedTarget;

  const setDraftTransformState = (
    value: Transform | undefined | ((current: Transform | undefined) => Transform | undefined)
  ) => {
    setDraftTransform((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftTransformRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    const next = selectedTarget ? structuredClone(selectedTarget.transform) : undefined;
    draftTransformRef.current = next;
    setDraftTransform(next);
  }, [
    selectedTarget?.id,
    selectedTarget?.transform.position.x,
    selectedTarget?.transform.position.y,
    selectedTarget?.transform.position.z,
    selectedTarget?.transform.rotation.x,
    selectedTarget?.transform.rotation.y,
    selectedTarget?.transform.rotation.z,
    selectedTarget?.transform.scale.x,
    selectedTarget?.transform.scale.y,
    selectedTarget?.transform.scale.z,
    selectedTarget?.transform.pivot?.x,
    selectedTarget?.transform.pivot?.y,
    selectedTarget?.transform.pivot?.z
  ]);

  const selectedIsBrush = selectedNode?.kind === "brush";
  const selectedIsInstancing = selectedNode ? isInstancingNode(selectedNode) : false;
  const selectedIsMesh = selectedNode?.kind === "mesh";
  const selectedMeshNode = selectedNode?.kind === "mesh" ? selectedNode : undefined;
  const selectedInstancingNode =
    selectedNode && isInstancingNode(selectedNode) ? selectedNode : undefined;
  const selectedPrimitive =
    selectedNode && isPrimitiveNode(selectedNode) ? selectedNode : undefined;
  const selectedLight = selectedNode && isLightNode(selectedNode) ? selectedNode : undefined;

  const updateDraftAxis = (
    group: "position" | "pivot" | "rotation" | "scale",
    axis: (typeof AXES)[number],
    value: number
  ) => {
    setDraftTransformState((current) => {
      if (!current) {
        return current;
      }

      if (group === "pivot") {
        const currentPivot = current.pivot ?? vec3(0, 0, 0);
        return rebaseTransformPivot(current, { ...currentPivot, [axis]: value });
      }

      return { ...current, [group]: { ...current[group], [axis]: value } };
    });
  };

  const commitDraftTransform = () => {
    const currentTarget = selectedTargetRef.current;
    const currentNode = selectedNodeRef.current;
    const currentEntity = selectedEntityRef.current;
    const currentDraftTransform = draftTransformRef.current;

    if (!currentTarget || !currentDraftTransform) {
      return;
    }

    if (currentNode) {
      onUpdateNodeTransform(
        currentNode.id,
        isInstancingNode(currentNode)
          ? {
              position: structuredClone(currentDraftTransform.position),
              rotation: structuredClone(currentDraftTransform.rotation),
              scale: structuredClone(currentDraftTransform.scale)
            }
          : currentDraftTransform
      );
      return;
    }

    if (currentEntity) {
      onUpdateEntityTransform(currentEntity.id, currentDraftTransform, currentEntity.transform);
    }
  };

  return (
    <ScrollArea className="h-full pr-1">
      <div className="space-y-4 px-1 pb-1">
        {selectedTarget ? (
          <>
            <div className="space-y-1">
              <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
                {"kind" in selectedTarget ? selectedTarget.kind : selectedTarget.type}
              </div>
              <div className="text-sm font-medium text-foreground">{selectedTarget.name}</div>
            </div>

            {draftTransform ? (
              <div className="space-y-3">
                <TransformGroup
                  label="Position"
                  onCommit={commitDraftTransform}
                  onUpdate={(axis, value) => updateDraftAxis("position", axis, value)}
                  precision={2}
                  step={0.05}
                  values={draftTransform.position}
                />
                {"kind" in selectedTarget ? (
                  <>
                    <TransformGroup
                      label="Rotation"
                      onCommit={commitDraftTransform}
                      onUpdate={(axis, value) => updateDraftAxis("rotation", axis, value)}
                      precision={1}
                      step={0.25}
                      values={draftTransform.rotation}
                    />
                    <TransformGroup
                      label="Scale"
                      onCommit={commitDraftTransform}
                      onUpdate={(axis, value) => updateDraftAxis("scale", axis, value)}
                      precision={2}
                      step={0.05}
                      values={draftTransform.scale}
                    />
                    {!selectedIsInstancing ? (
                      <TransformGroup
                        label="Pivot"
                        onCommit={commitDraftTransform}
                        onUpdate={(axis, value) => updateDraftAxis("pivot", axis, value)}
                        precision={2}
                        step={0.05}
                        values={draftTransform.pivot ?? vec3(0, 0, 0)}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            <ToolSection title="Quick Actions">
              <div className="flex flex-wrap gap-1.5">
                {AXES.map((axis) => (
                  <>
                    <Button
                      key={`${axis}-`}
                      onClick={() => onTranslateSelection(axis, -1)}
                      size="xs"
                      variant="ghost"
                    >
                      {axis.toUpperCase()}-
                    </Button>
                    <Button
                      key={`${axis}+`}
                      onClick={() => onTranslateSelection(axis, 1)}
                      size="xs"
                      variant="ghost"
                    >
                      {axis.toUpperCase()}+
                    </Button>
                  </>
                ))}
              </div>
              {"kind" in selectedTarget ? (
                <div className="flex flex-wrap gap-1.5">
                  {AXES.map((axis) => (
                    <Button
                      key={`mirror-${axis}`}
                      onClick={() => onMirrorSelection(axis)}
                      size="xs"
                      variant="ghost"
                    >
                      Mirror {axis.toUpperCase()}
                    </Button>
                  ))}
                </div>
              ) : null}
            </ToolSection>

            {selectedPrimitive ? (
              <PrimitiveInspector node={selectedPrimitive} onUpdateNodeData={onUpdateNodeData} />
            ) : null}
            {selectedMeshNode ? (
              <MeshPhysicsInspector node={selectedMeshNode} onUpdateMeshData={onUpdateMeshData} />
            ) : null}
            {selectedInstancingNode ? (
              <InstancingInspector node={selectedInstancingNode} />
            ) : null}
            {selectedLight ? (
              <LightInspector node={selectedLight} onUpdateNodeData={onUpdateNodeData} />
            ) : null}
            {selectedEntity ? (
              <EntityInspector
                entity={selectedEntity}
                onUpdateEntityProperties={onUpdateEntityProperties}
              />
            ) : null}

            {activeToolId === "clip" ? (
              <ToolSection title="Clip">
                <div className="flex flex-wrap gap-1.5">
                  {AXES.map((axis) => (
                    <Button
                      disabled={!selectedIsBrush}
                      key={axis}
                      onClick={() => onClipSelection(axis)}
                      size="xs"
                      variant="ghost"
                    >
                      Split {axis.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </ToolSection>
            ) : null}

            {activeToolId === "extrude" ? (
              <ToolSection title="Extrude">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    disabled={!selectedIsBrush}
                    onClick={() => onExtrudeSelection("x", -1)}
                    size="xs"
                    variant="ghost"
                  >
                    X-
                  </Button>
                  <Button
                    disabled={!selectedIsBrush}
                    onClick={() => onExtrudeSelection("x", 1)}
                    size="xs"
                    variant="ghost"
                  >
                    X+
                  </Button>
                  <Button onClick={() => onExtrudeSelection("y", -1)} size="xs" variant="ghost">
                    Y-
                  </Button>
                  <Button onClick={() => onExtrudeSelection("y", 1)} size="xs" variant="ghost">
                    Y+
                  </Button>
                  <Button
                    disabled={!selectedIsBrush}
                    onClick={() => onExtrudeSelection("z", -1)}
                    size="xs"
                    variant="ghost"
                  >
                    Z-
                  </Button>
                  <Button
                    disabled={!selectedIsBrush}
                    onClick={() => onExtrudeSelection("z", 1)}
                    size="xs"
                    variant="ghost"
                  >
                    Z+
                  </Button>
                </div>
              </ToolSection>
            ) : null}

            {activeToolId === "mesh-edit" ? (
              <ToolSection title="Mesh Edit">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    disabled={!selectedIsMesh}
                    onClick={() => onMeshEditToolbarAction("inflate")}
                    size="xs"
                    variant="ghost"
                  >
                    Inflate
                  </Button>
                  <Button
                    disabled={!selectedIsMesh}
                    onClick={() => onMeshEditToolbarAction("deflate")}
                    size="xs"
                    variant="ghost"
                  >
                    Deflate
                  </Button>
                  <Button
                    disabled={!selectedIsMesh}
                    onClick={() => onExtrudeSelection("y", 1)}
                    size="xs"
                    variant="ghost"
                  >
                    Raise Top
                  </Button>
                  <Button
                    disabled={!selectedIsMesh}
                    onClick={() => onExtrudeSelection("y", -1)}
                    size="xs"
                    variant="ghost"
                  >
                    Lower Top
                  </Button>
                </div>
              </ToolSection>
            ) : null}
          </>
        ) : (
          <div className="pt-1 text-xs text-foreground/48">Select an object to inspect it.</div>
        )}
      </div>
    </ScrollArea>
  );
}
