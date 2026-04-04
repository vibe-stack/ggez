import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { EditorGraph } from "@ggez/anim-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PropertyField, editorInputClassName, sectionHintClassName } from "../shared";
import { NumericDragInput, updateTypedNode } from "./shared";
import type { Blend1DNode, Blend2DNode, OrientationWarpNode, SelectorNode, StrideWarpNode } from "./types";

export function Blend1DChildrenEditor(props: {
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
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, label: event.target.value } : entry)),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Threshold">
              <NumericDragInput
                value={child.threshold}
                step={0.05}
                precision={2}
                onChange={(value) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend1d", (current) => ({
                    ...current,
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, threshold: value } : entry)),
                  }))
                }
              />
            </PropertyField>
          </div>
        );
      })}
    </div>
  );
}

export function Blend2DChildrenEditor(props: {
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
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, label: event.target.value } : entry)),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="X">
              <NumericDragInput
                value={child.x}
                step={0.05}
                precision={2}
                onChange={(value) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend2d", (current) => ({
                    ...current,
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, x: value } : entry)),
                  }))
                }
              />
            </PropertyField>
            <PropertyField label="Y">
              <NumericDragInput
                value={child.y}
                step={0.05}
                precision={2}
                onChange={(value) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "blend2d", (current) => ({
                    ...current,
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, y: value } : entry)),
                  }))
                }
              />
            </PropertyField>
          </div>
        );
      })}
    </div>
  );
}

export function SelectorChildrenEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: SelectorNode;
}) {
  if (props.node.children.length === 0) {
    return <div className={sectionHintClassName}>Connect motion nodes into this selector to create options, then assign integer values here.</div>;
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
                  updateTypedNode(props.store, props.graph.id, props.node.id, "selector", (current) => ({
                    ...current,
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, label: event.target.value } : entry)),
                  }))
                }
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Value">
              <NumericDragInput
                value={child.value}
                step={1}
                precision={0}
                onChange={(value) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "selector", (current) => ({
                    ...current,
                    children: current.children.map((entry) => (entry.nodeId === child.nodeId ? { ...entry, value: Math.trunc(value) } : entry)),
                  }))
                }
              />
            </PropertyField>
          </div>
        );
      })}
    </div>
  );
}

export function OrientationWarpLegsEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: OrientationWarpNode;
}) {
  return (
    <div className="space-y-2">
      {props.node.legs.length === 0 ? (
        <div className={sectionHintClassName}>Add leg chains here so the warp stage preserves animated foot placement after twisting the hips/spine.</div>
      ) : null}

      {props.node.legs.map((leg, legIndex) => (
        <div key={`${leg.upperBoneName}-${legIndex}`} className="space-y-2 border border-white/8 bg-black/20 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <PropertyField label="Upper Bone">
              <Input
                value={leg.upperBoneName}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "orientationWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, upperBoneName: event.target.value } : entry)),
                  }))
                }
                placeholder="LeftUpLeg"
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Lower Bone">
              <Input
                value={leg.lowerBoneName}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "orientationWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, lowerBoneName: event.target.value } : entry)),
                  }))
                }
                placeholder="LeftLeg"
                className={editorInputClassName}
              />
            </PropertyField>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_84px_auto] gap-2">
            <PropertyField label="Foot Bone">
              <Input
                value={leg.footBoneName}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "orientationWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, footBoneName: event.target.value } : entry)),
                  }))
                }
                placeholder="LeftFoot"
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Weight">
              <NumericDragInput
                value={leg.weight}
                step={0.05}
                precision={2}
                min={0}
                max={1}
                onChange={(value) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "orientationWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, weight: Math.max(0, Math.min(1, value)) } : entry)),
                  }))
                }
              />
            </PropertyField>
            <div className="flex items-end">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-8 border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"
                onClick={() =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "orientationWarp", (current) => ({
                    ...current,
                    legs: current.legs.filter((_, index) => index !== legIndex),
                  }))
                }
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        size="xs"
        variant="outline"
        className="border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"
        onClick={() =>
          updateTypedNode(props.store, props.graph.id, props.node.id, "orientationWarp", (current) => ({
            ...current,
            legs: [
              ...current.legs,
              {
                upperBoneName: "",
                lowerBoneName: "",
                footBoneName: "",
                weight: 1,
              },
            ],
          }))
        }
      >
        Add Leg Chain
      </Button>
    </div>
  );
}

export function StrideWarpLegsEditor(props: {
  store: AnimationEditorStore;
  graph: EditorGraph;
  node: StrideWarpNode;
}) {
  return (
    <div className="space-y-2">
      {props.node.legs.length === 0 ? (
        <div className={sectionHintClassName}>Add foot definitions here so the node can extend or compress locomotion stride against authored leg chains.</div>
      ) : null}

      {props.node.legs.map((leg, legIndex) => (
        <div key={`${leg.upperBoneName}-${legIndex}`} className="space-y-2 border border-white/8 bg-black/20 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <PropertyField label="Upper Bone">
              <Input
                value={leg.upperBoneName}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "strideWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, upperBoneName: event.target.value } : entry)),
                  }))
                }
                placeholder="LeftUpLeg"
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Lower Bone">
              <Input
                value={leg.lowerBoneName}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "strideWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, lowerBoneName: event.target.value } : entry)),
                  }))
                }
                placeholder="LeftLeg"
                className={editorInputClassName}
              />
            </PropertyField>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_84px_auto] gap-2">
            <PropertyField label="Foot Bone">
              <Input
                value={leg.footBoneName}
                onChange={(event) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "strideWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, footBoneName: event.target.value } : entry)),
                  }))
                }
                placeholder="LeftFoot"
                className={editorInputClassName}
              />
            </PropertyField>
            <PropertyField label="Weight">
              <NumericDragInput
                value={leg.weight}
                step={0.05}
                precision={2}
                min={0}
                max={1}
                onChange={(value) =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "strideWarp", (current) => ({
                    ...current,
                    legs: current.legs.map((entry, index) => (index === legIndex ? { ...entry, weight: Math.max(0, Math.min(1, value)) } : entry)),
                  }))
                }
              />
            </PropertyField>
            <div className="flex items-end">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-8 border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"
                onClick={() =>
                  updateTypedNode(props.store, props.graph.id, props.node.id, "strideWarp", (current) => ({
                    ...current,
                    legs: current.legs.filter((_, index) => index !== legIndex),
                  }))
                }
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        size="xs"
        variant="outline"
        className="border-white/10 bg-white/6 text-zinc-300 hover:bg-white/10"
        onClick={() =>
          updateTypedNode(props.store, props.graph.id, props.node.id, "strideWarp", (current) => ({
            ...current,
            legs: [
              ...current.legs,
              {
                upperBoneName: "",
                lowerBoneName: "",
                footBoneName: "",
                weight: 1,
              },
            ],
          }))
        }
      >
        Add Foot Definition
      </Button>
    </div>
  );
}
