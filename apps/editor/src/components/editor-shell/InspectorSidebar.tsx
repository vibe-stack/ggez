import { useEffect, useState } from "react";
import { vec3, type Asset, type GeometryNode, type Material, type Transform, type Vec3 } from "@web-hammer/shared";
import type { ToolId } from "@web-hammer/tool-system";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { MaterialLibraryPanel } from "@/components/editor-shell/MaterialLibraryPanel";
import { rebaseTransformPivot } from "@/viewport/utils/geometry";
import { cn } from "@/lib/utils";
import type { MeshEditMode } from "@/viewport/editing";

type InspectorSidebarProps = {
  activeRightPanel: "inspector" | "materials";
  activeToolId: ToolId;
  assets: Asset[];
  materials: Material[];
  meshEditMode: MeshEditMode;
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onChangeRightPanel: (panel: "inspector" | "materials") => void;
  onClipSelection: (axis: "x" | "y" | "z") => void;
  onDeleteMaterial: (materialId: string) => void;
  onExtrudeSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onMeshInflate: (factor: number) => void;
  onMirrorSelection: (axis: "x" | "y" | "z") => void;
  onPlaceAsset: (position: Vec3) => void;
  onPlaceEntity: (type: "spawn" | "light") => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: { x: number; y: number }) => void;
  onTranslateSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  selectedAssetId: string;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  selectedNode?: GeometryNode;
  viewportTarget: Vec3;
};

const AXES = ["x", "y", "z"] as const;

export function InspectorSidebar({
  activeRightPanel,
  activeToolId,
  assets,
  materials,
  meshEditMode,
  onApplyMaterial,
  onChangeRightPanel,
  onClipSelection,
  onDeleteMaterial,
  onExtrudeSelection,
  onMeshInflate,
  onMirrorSelection,
  onPlaceAsset,
  onPlaceEntity,
  onSelectAsset,
  onSelectMaterial,
  onSetUvScale,
  onTranslateSelection,
  onUpsertMaterial,
  onUpdateNodeTransform,
  selectedAssetId,
  selectedFaceIds,
  selectedMaterialId,
  selectedNode,
  viewportTarget
}: InspectorSidebarProps) {
  const [draftTransform, setDraftTransform] = useState<Transform | undefined>(() =>
    selectedNode ? structuredClone(selectedNode.transform) : undefined
  );

  useEffect(() => {
    setDraftTransform(selectedNode ? structuredClone(selectedNode.transform) : undefined);
  }, [
    selectedNode?.id,
    selectedNode?.transform.position.x,
    selectedNode?.transform.position.y,
    selectedNode?.transform.position.z,
    selectedNode?.transform.rotation.x,
    selectedNode?.transform.rotation.y,
    selectedNode?.transform.rotation.z,
    selectedNode?.transform.scale.x,
    selectedNode?.transform.scale.y,
    selectedNode?.transform.scale.z,
    selectedNode?.transform.pivot?.x,
    selectedNode?.transform.pivot?.y,
    selectedNode?.transform.pivot?.z
  ]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedIsBrush = selectedNode?.kind === "brush";
  const selectedIsMesh = selectedNode?.kind === "mesh";

  const updateDraftAxis = (
    group: "position" | "pivot" | "rotation" | "scale",
    axis: (typeof AXES)[number],
    value: number
  ) => {
    setDraftTransform((current) => {
      if (!current) {
        return current;
      }

      if (group === "pivot") {
        const currentPivot = current.pivot ?? vec3(0, 0, 0);

        return rebaseTransformPivot(current, {
          ...currentPivot,
          [axis]: value
        });
      }

      return {
        ...current,
        [group]: {
          ...current[group],
          [axis]: value
        }
      };
    });
  };

  const commitDraftTransform = () => {
    if (!selectedNode || !draftTransform) {
      return;
    }

    onUpdateNodeTransform(selectedNode.id, draftTransform);
  };

  return (
    <div className="pointer-events-none absolute inset-y-4 right-4 z-20 flex w-80">
      <FloatingPanel className="flex min-h-0 w-full flex-col overflow-hidden">
        <Tabs
          className="flex min-h-0 flex-1 flex-col gap-0"
          onValueChange={(value) => onChangeRightPanel(value as "inspector" | "materials")}
          value={activeRightPanel}
        >
          <div className="px-3 pt-3 pb-2">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-white/5 p-1" variant="default">
              <TabsTrigger className="rounded-lg text-[11px]" value="inspector">
                Inspector
              </TabsTrigger>
              <TabsTrigger className="rounded-lg text-[11px]" value="materials">
                Materials
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="min-h-0 px-3 pb-3" value="inspector">
            <div className="flex h-full min-h-0 flex-col gap-3">
              {selectedNode ? (
                <>
                  <div className="space-y-1 px-1">
                    <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
                      {selectedNode.kind}
                    </div>
                    <div className="text-sm font-medium text-foreground">{selectedNode.name}</div>
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
                      <TransformGroup
                        label="Pivot"
                        onCommit={commitDraftTransform}
                        onUpdate={(axis, value) => updateDraftAxis("pivot", axis, value)}
                        precision={2}
                        step={0.05}
                        values={draftTransform.pivot ?? vec3(0, 0, 0)}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          onClick={() => {
                            if (!selectedNode || !draftTransform) {
                              return;
                            }

                            onUpdateNodeTransform(
                              selectedNode.id,
                              rebaseTransformPivot(draftTransform, undefined),
                              selectedNode.transform
                            );
                          }}
                          size="xs"
                          variant="ghost"
                        >
                          Reset Pivot
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <SectionTitle>Quick Actions</SectionTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Button onClick={() => onTranslateSelection("x", -1)} size="xs" variant="ghost">
                        X-
                      </Button>
                      <Button onClick={() => onTranslateSelection("x", 1)} size="xs" variant="ghost">
                        X+
                      </Button>
                      <Button onClick={() => onTranslateSelection("y", -1)} size="xs" variant="ghost">
                        Y-
                      </Button>
                      <Button onClick={() => onTranslateSelection("y", 1)} size="xs" variant="ghost">
                        Y+
                      </Button>
                      <Button onClick={() => onTranslateSelection("z", -1)} size="xs" variant="ghost">
                        Z-
                      </Button>
                      <Button onClick={() => onTranslateSelection("z", 1)} size="xs" variant="ghost">
                        Z+
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button onClick={() => onMirrorSelection("x")} size="xs" variant="ghost">
                        Mirror X
                      </Button>
                      <Button onClick={() => onMirrorSelection("y")} size="xs" variant="ghost">
                        Mirror Y
                      </Button>
                      <Button onClick={() => onMirrorSelection("z")} size="xs" variant="ghost">
                        Mirror Z
                      </Button>
                    </div>
                  </div>

                  {activeToolId === "clip" ? (
                    <ToolSection title="Clip">
                      <div className="flex flex-wrap gap-1.5">
                        <Button disabled={!selectedIsBrush} onClick={() => onClipSelection("x")} size="xs" variant="ghost">
                          Split X
                        </Button>
                        <Button disabled={!selectedIsBrush} onClick={() => onClipSelection("y")} size="xs" variant="ghost">
                          Split Y
                        </Button>
                        <Button disabled={!selectedIsBrush} onClick={() => onClipSelection("z")} size="xs" variant="ghost">
                          Split Z
                        </Button>
                      </div>
                    </ToolSection>
                  ) : null}

                  {activeToolId === "extrude" ? (
                    <ToolSection title="Extrude">
                      <div className="flex flex-wrap gap-1.5">
                        <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("x", -1)} size="xs" variant="ghost">
                          X-
                        </Button>
                        <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("x", 1)} size="xs" variant="ghost">
                          X+
                        </Button>
                        <Button onClick={() => onExtrudeSelection("y", -1)} size="xs" variant="ghost">
                          Y-
                        </Button>
                        <Button onClick={() => onExtrudeSelection("y", 1)} size="xs" variant="ghost">
                          Y+
                        </Button>
                        <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("z", -1)} size="xs" variant="ghost">
                          Z-
                        </Button>
                        <Button disabled={!selectedIsBrush} onClick={() => onExtrudeSelection("z", 1)} size="xs" variant="ghost">
                          Z+
                        </Button>
                      </div>
                    </ToolSection>
                  ) : null}

                  {activeToolId === "mesh-edit" ? (
                    <ToolSection title="Mesh Edit">
                      <div className="flex flex-wrap gap-1.5">
                        <Button disabled={!selectedIsMesh} onClick={() => onMeshInflate(1.1)} size="xs" variant="ghost">
                          Inflate
                        </Button>
                        <Button disabled={!selectedIsMesh} onClick={() => onMeshInflate(0.9)} size="xs" variant="ghost">
                          Deflate
                        </Button>
                        <Button disabled={!selectedIsMesh} onClick={() => onExtrudeSelection("y", 1)} size="xs" variant="ghost">
                          Raise Top
                        </Button>
                        <Button disabled={!selectedIsMesh} onClick={() => onExtrudeSelection("y", -1)} size="xs" variant="ghost">
                          Lower Top
                        </Button>
                      </div>
                    </ToolSection>
                  ) : null}
                </>
              ) : (
                <div className="px-1 pt-1 text-xs text-foreground/48">Select an object to inspect or edit it.</div>
              )}

              <ToolSection title="Assets">
                <div className="space-y-1">
                  {assets.map((asset) => (
                    <button
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12px] text-foreground/62 transition-colors hover:bg-white/5 hover:text-foreground",
                        selectedAssetId === asset.id && "bg-emerald-500/14 text-emerald-200"
                      )}
                      key={asset.id}
                      onClick={() => onSelectAsset(asset.id)}
                      type="button"
                    >
                      <span className="truncate font-medium">{asset.id.split(":").at(-1)}</span>
                      <span className="ml-2 text-[10px] text-foreground/35">{asset.type}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    onClick={() => onPlaceAsset({ x: viewportTarget.x, y: 0, z: viewportTarget.z })}
                    size="xs"
                    variant="ghost"
                  >
                    Place {selectedAsset?.id.split(":").at(-1) ?? "asset"}
                  </Button>
                  <Button onClick={() => onPlaceEntity("spawn")} size="xs" variant="ghost">
                    Add Spawn
                  </Button>
                  <Button onClick={() => onPlaceEntity("light")} size="xs" variant="ghost">
                    Add Light
                  </Button>
                </div>
              </ToolSection>

            </div>
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 px-3 pb-3" value="materials">
            <MaterialLibraryPanel
              materials={materials}
              onApplyMaterial={onApplyMaterial}
              onDeleteMaterial={onDeleteMaterial}
              onSelectMaterial={onSelectMaterial}
              onSetUvScale={onSetUvScale}
              onUpsertMaterial={onUpsertMaterial}
              selectedFaceIds={activeToolId === "mesh-edit" && meshEditMode === "face" ? selectedFaceIds : []}
              selectedMaterialId={selectedMaterialId}
              selectedNode={selectedNode}
            />
          </TabsContent>
        </Tabs>
      </FloatingPanel>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">{children}</div>;
}

function ToolSection({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function TransformGroup({
  label,
  onCommit,
  onUpdate,
  precision,
  step,
  values
}: {
  label: string;
  onCommit: () => void;
  onUpdate: (axis: (typeof AXES)[number], value: number) => void;
  precision: number;
  step: number;
  values: Vec3;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((axis) => (
          <DragInput
            className="min-w-0"
            compact
            key={axis}
            label={axis.toUpperCase()}
            onChange={(value) => onUpdate(axis, value)}
            onValueCommit={onCommit}
            precision={precision}
            step={step}
            value={values[axis]}
          />
        ))}
      </div>
    </div>
  );
}
