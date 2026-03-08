import { useEffect, useState } from "react";
import {
  isLightNode,
  isPrimitiveNode,
  vec3,
  type Entity,
  type GeometryNode,
  type LightNodeData,
  type Material,
  type PropBodyType,
  type PropColliderShape,
  type PrimitiveNodeData,
  type SceneSettings,
  type Transform,
  type Vec3
} from "@web-hammer/shared";
import type { ToolId } from "@web-hammer/tool-system";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { MaterialLibraryPanel } from "@/components/editor-shell/MaterialLibraryPanel";
import { SceneHierarchyPanel } from "@/components/editor-shell/SceneHierarchyPanel";
import { rebaseTransformPivot } from "@/viewport/utils/geometry";
import { cn } from "@/lib/utils";
import type { MeshEditMode } from "@/viewport/editing";
import type { RightPanelId } from "@/state/ui-store";

type InspectorSidebarProps = {
  activeRightPanel: RightPanelId;
  activeToolId: ToolId;
  assets: Array<{ id: string; path: string; type: string }>;
  entities: Entity[];
  materials: Material[];
  meshEditMode: MeshEditMode;
  nodes: GeometryNode[];
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onChangeRightPanel: (panel: RightPanelId) => void;
  onClipSelection: (axis: "x" | "y" | "z") => void;
  onDeleteMaterial: (materialId: string) => void;
  onExtrudeSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onFocusNode: (nodeId: string) => void;
  onMeshInflate: (factor: number) => void;
  onMirrorSelection: (axis: "x" | "y" | "z") => void;
  onPlaceAsset: (position: Vec3) => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: { x: number; y: number }) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: { x: number; y: number }) => void;
  onTranslateSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
  selectionEnabled: boolean;
  selectedAssetId: string;
  selectedEntity?: Entity;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  selectedNode?: GeometryNode;
  selectedNodeId?: string;
  viewportTarget: Vec3;
};

const AXES = ["x", "y", "z"] as const;

export function InspectorSidebar({
  activeRightPanel,
  activeToolId,
  assets,
  entities,
  materials,
  meshEditMode,
  nodes,
  onApplyMaterial,
  onChangeRightPanel,
  onClipSelection,
  onDeleteMaterial,
  onExtrudeSelection,
  onFocusNode,
  onMeshInflate,
  onMirrorSelection,
  onPlaceAsset,
  onSelectAsset,
  onSelectMaterial,
  onSelectNodes,
  onSetUvOffset,
  onSetUvScale,
  onTranslateSelection,
  onUpsertMaterial,
  onUpdateEntityProperties,
  onUpdateEntityTransform,
  onUpdateNodeData,
  onUpdateNodeTransform,
  onUpdateSceneSettings,
  sceneSettings,
  selectionEnabled,
  selectedAssetId,
  selectedEntity,
  selectedFaceIds,
  selectedMaterialId,
  selectedNode,
  selectedNodeId,
  viewportTarget
}: InspectorSidebarProps) {
  const selectedTarget = selectedNode ?? selectedEntity;
  const [draftTransform, setDraftTransform] = useState<Transform | undefined>(() =>
    selectedTarget ? structuredClone(selectedTarget.transform) : undefined
  );
  const [draftWorldSettings, setDraftWorldSettings] = useState(() => structuredClone(sceneSettings.world));
  const [draftPlayerSettings, setDraftPlayerSettings] = useState(() => structuredClone(sceneSettings.player));

  useEffect(() => {
    setDraftTransform(selectedTarget ? structuredClone(selectedTarget.transform) : undefined);
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

  useEffect(() => {
    setDraftWorldSettings(structuredClone(sceneSettings.world));
    setDraftPlayerSettings(structuredClone(sceneSettings.player));
  }, [sceneSettings]);

  const selectedIsBrush = selectedNode?.kind === "brush";
  const selectedIsMesh = selectedNode?.kind === "mesh";
  const selectedPrimitive = selectedNode && isPrimitiveNode(selectedNode) ? selectedNode : undefined;
  const selectedLight = selectedNode && isLightNode(selectedNode) ? selectedNode : undefined;

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
    if (!selectedTarget || !draftTransform) {
      return;
    }

    if (selectedNode) {
      onUpdateNodeTransform(selectedNode.id, draftTransform);
      return;
    }

    if (selectedEntity) {
      onUpdateEntityTransform(selectedEntity.id, draftTransform, selectedEntity.transform);
    }
  };

  const commitWorldSettings = () => {
    onUpdateSceneSettings(
      {
        ...sceneSettings,
        world: structuredClone(draftWorldSettings)
      },
      sceneSettings
    );
  };

  const commitPlayerSettings = () => {
    onUpdateSceneSettings(
      {
        ...sceneSettings,
        player: structuredClone(draftPlayerSettings)
      },
      sceneSettings
    );
  };

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 flex h-[clamp(26rem,58vh,42rem)] w-[22rem] max-h-[calc(100%-7rem)]">
      <FloatingPanel className="flex min-h-0 w-full flex-col overflow-hidden">
        <Tabs
          className="flex min-h-0 flex-1 flex-col gap-0"
          onValueChange={(value) => onChangeRightPanel(value as RightPanelId)}
          value={activeRightPanel}
        >
          <div className="px-3 pt-3 pb-2">
            <TabsList className="grid w-full grid-cols-5 rounded-xl bg-white/5 p-1" variant="default">
              <TabsTrigger className="rounded-lg px-1 text-[10px]" value="scene">
                Scene
              </TabsTrigger>
              <TabsTrigger className="rounded-lg px-1 text-[10px]" value="world">
                World
              </TabsTrigger>
              <TabsTrigger className="rounded-lg px-1 text-[10px]" value="player">
                Player
              </TabsTrigger>
              <TabsTrigger className="rounded-lg px-1 text-[10px]" value="inspector">
                Inspect
              </TabsTrigger>
              <TabsTrigger className="rounded-lg px-1 text-[10px]" value="materials">
                Mats
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="scene">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="min-h-0 flex-1">
                <SceneHierarchyPanel
                  entities={entities}
                  interactive={selectionEnabled}
                  nodes={nodes}
                  onFocusNode={onFocusNode}
                  onSelectNodes={onSelectNodes}
                  selectedNodeId={selectedNodeId}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="world">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-4 px-1 pb-1">
                <ToolSection title="Physics">
                  <BooleanField
                    label="Physics Enabled"
                    onCheckedChange={(checked) => setDraftWorldSettings((current) => ({ ...current, physicsEnabled: checked }))}
                    checked={draftWorldSettings.physicsEnabled}
                  />
                  <TransformGroup
                    label="Gravity"
                    onCommit={commitWorldSettings}
                    onUpdate={(axis, value) =>
                      setDraftWorldSettings((current) => ({
                        ...current,
                        gravity: {
                          ...current.gravity,
                          [axis]: value
                        }
                      }))
                    }
                    precision={2}
                    step={0.1}
                    values={draftWorldSettings.gravity}
                  />
                  <div className="flex justify-end">
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save World Settings
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="Ambient">
                  <ColorField
                    label="Ambient Color"
                    onChange={(value) => setDraftWorldSettings((current) => ({ ...current, ambientColor: value }))}
                    value={draftWorldSettings.ambientColor}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Intensity"
                    onChange={(value) => setDraftWorldSettings((current) => ({ ...current, ambientIntensity: value }))}
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.ambientIntensity}
                  />
                </ToolSection>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="player">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-4 px-1 pb-1">
                <ToolSection title="Camera">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      ["fps", "FPS"],
                      ["third-person", "3rd Person"],
                      ["top-down", "Top Down"]
                    ] as const).map(([value, label]) => (
                      <Button
                        className={cn(draftPlayerSettings.cameraMode === value && "bg-emerald-500/18 text-emerald-200")}
                        key={value}
                        onClick={() => {
                          setDraftPlayerSettings((current) => ({ ...current, cameraMode: value }));
                          onUpdateSceneSettings(
                            {
                              ...sceneSettings,
                              player: {
                                ...sceneSettings.player,
                                cameraMode: value
                              }
                            },
                            sceneSettings
                          );
                        }}
                        size="xs"
                        variant="ghost"
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </ToolSection>

                <ToolSection title="Movement">
                  <DragInput
                    className="w-full"
                    compact
                    label="Height"
                    onChange={(value) => setDraftPlayerSettings((current) => ({ ...current, height: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.height}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Move Speed"
                    onChange={(value) => setDraftPlayerSettings((current) => ({ ...current, movementSpeed: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.1}
                    value={draftPlayerSettings.movementSpeed}
                  />
                  <BooleanField
                    label="Allow Run"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canRun: checked };
                      setDraftPlayerSettings(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canRun}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Run Speed"
                    onChange={(value) => setDraftPlayerSettings((current) => ({ ...current, runningSpeed: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.1}
                    value={draftPlayerSettings.runningSpeed}
                  />
                </ToolSection>

                <ToolSection title="Traversal">
                  <BooleanField
                    label="Allow Jump"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canJump: checked };
                      setDraftPlayerSettings(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canJump}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Jump Height"
                    onChange={(value) => setDraftPlayerSettings((current) => ({ ...current, jumpHeight: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.jumpHeight}
                  />
                  <BooleanField
                    label="Allow Crouch"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canCrouch: checked };
                      setDraftPlayerSettings(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canCrouch}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Crouch Height"
                    onChange={(value) => setDraftPlayerSettings((current) => ({ ...current, crouchHeight: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.crouchHeight}
                  />
                </ToolSection>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="inspector">
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
                            <TransformGroup
                              label="Pivot"
                              onCommit={commitDraftTransform}
                              onUpdate={(axis, value) => updateDraftAxis("pivot", axis, value)}
                              precision={2}
                              step={0.05}
                              values={draftTransform.pivot ?? vec3(0, 0, 0)}
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <ToolSection title="Quick Actions">
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
                      {"kind" in selectedTarget ? (
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
                      ) : null}
                    </ToolSection>

                    {selectedPrimitive ? (
                      <PrimitiveInspector node={selectedPrimitive} onUpdateNodeData={onUpdateNodeData} />
                    ) : null}
                    {selectedLight ? <LightInspector node={selectedLight} onUpdateNodeData={onUpdateNodeData} /> : null}
                    {selectedEntity ? (
                      <EntityInspector entity={selectedEntity} onUpdateEntityProperties={onUpdateEntityProperties} />
                    ) : null}

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
                  <div className="pt-1 text-xs text-foreground/48">Select an object to inspect it.</div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 px-3 pb-3" value="materials">
            <MaterialLibraryPanel
              materials={materials}
              onApplyMaterial={onApplyMaterial}
              onDeleteMaterial={onDeleteMaterial}
              onSelectMaterial={onSelectMaterial}
              onSetUvOffset={onSetUvOffset}
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

function PrimitiveInspector({
  node,
  onUpdateNodeData
}: {
  node: Extract<GeometryNode, { kind: "primitive" }>;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
}) {
  const updateData = (next: PrimitiveNodeData) => onUpdateNodeData(node.id, next);

  return (
    <ToolSection title={node.data.role === "prop" ? "Prop" : "Primitive"}>
      <div className="grid grid-cols-3 gap-1.5">
        <DragInput
          className="min-w-0"
          compact
          label="W"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, x: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.x}
        />
        <DragInput
          className="min-w-0"
          compact
          label="H"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, y: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.y}
        />
        <DragInput
          className="min-w-0"
          compact
          label="D"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, z: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.z}
        />
      </div>

      {node.data.role === "prop" && node.data.physics ? (
        <div className="space-y-2">
          <SectionTitle>Physics</SectionTitle>
          <BooleanField
            label="Physics Enabled"
            onCheckedChange={(checked) => updateData({ ...node.data, physics: { ...node.data.physics!, enabled: checked } })}
            checked={node.data.physics.enabled}
          />
          <EnumGrid
            activeValue={node.data.physics.bodyType}
            entries={[
              { label: "Static", value: "fixed" },
              { label: "Dynamic", value: "dynamic" },
              { label: "Kinematic", value: "kinematicPosition" }
            ]}
            onSelect={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, bodyType: value as PropBodyType } })}
          />
          <EnumGrid
            activeValue={node.data.physics.colliderShape}
            entries={[
              { label: "Cuboid", value: "cuboid" },
              { label: "Ball", value: "ball" },
              { label: "Cylinder", value: "cylinder" },
              { label: "Cone", value: "cone" },
              { label: "Trimesh", value: "trimesh" }
            ]}
            onSelect={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, colliderShape: value as PropColliderShape } })}
          />
          <NumberField label="Mass" onChange={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, mass: value } })} value={node.data.physics.mass ?? 1} />
          <NumberField label="Density" onChange={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, density: value } })} value={node.data.physics.density ?? 0} />
          <NumberField label="Friction" onChange={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, friction: value } })} value={node.data.physics.friction} />
          <NumberField label="Restitution" onChange={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, restitution: value } })} value={node.data.physics.restitution} />
          <NumberField label="Gravity Scale" onChange={(value) => updateData({ ...node.data, physics: { ...node.data.physics!, gravityScale: value } })} value={node.data.physics.gravityScale} />
          <BooleanField
            label="Sensor"
            onCheckedChange={(checked) => updateData({ ...node.data, physics: { ...node.data.physics!, sensor: checked } })}
            checked={node.data.physics.sensor}
          />
          <BooleanField
            label="CCD"
            onCheckedChange={(checked) => updateData({ ...node.data, physics: { ...node.data.physics!, ccd: checked } })}
            checked={node.data.physics.ccd}
          />
          <BooleanField
            label="Lock Rotations"
            onCheckedChange={(checked) => updateData({ ...node.data, physics: { ...node.data.physics!, lockRotations: checked } })}
            checked={node.data.physics.lockRotations}
          />
          <BooleanField
            label="Lock Translations"
            onCheckedChange={(checked) => updateData({ ...node.data, physics: { ...node.data.physics!, lockTranslations: checked } })}
            checked={node.data.physics.lockTranslations}
          />
        </div>
      ) : null}
    </ToolSection>
  );
}

function LightInspector({
  node,
  onUpdateNodeData
}: {
  node: Extract<GeometryNode, { kind: "light" }>;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
}) {
  const updateData = (next: LightNodeData) => onUpdateNodeData(node.id, next);

  return (
    <ToolSection title="Light">
      <BooleanField
        label="Enabled"
        onCheckedChange={(checked) => updateData({ ...node.data, enabled: checked })}
        checked={node.data.enabled}
      />
      <ColorField label="Color" onChange={(value) => updateData({ ...node.data, color: value })} value={node.data.color} />
      <NumberField label="Intensity" onChange={(value) => updateData({ ...node.data, intensity: value })} value={node.data.intensity} />
      {node.data.type === "point" || node.data.type === "spot" ? (
        <>
          <NumberField label="Distance" onChange={(value) => updateData({ ...node.data, distance: value })} value={node.data.distance ?? 0} />
          <NumberField label="Decay" onChange={(value) => updateData({ ...node.data, decay: value })} value={node.data.decay ?? 1} />
        </>
      ) : null}
      {node.data.type === "spot" ? (
        <>
          <NumberField label="Angle" onChange={(value) => updateData({ ...node.data, angle: value })} value={node.data.angle ?? Math.PI / 6} />
          <NumberField label="Penumbra" onChange={(value) => updateData({ ...node.data, penumbra: value })} value={node.data.penumbra ?? 0.35} />
        </>
      ) : null}
      {node.data.type === "hemisphere" ? (
        <ColorField
          label="Ground Color"
          onChange={(value) => updateData({ ...node.data, groundColor: value })}
          value={node.data.groundColor ?? "#0f1721"}
        />
      ) : null}
      <BooleanField
        label="Cast Shadow"
        onCheckedChange={(checked) => updateData({ ...node.data, castShadow: checked })}
        checked={node.data.castShadow}
      />
    </ToolSection>
  );
}

function EntityInspector({
  entity,
  onUpdateEntityProperties
}: {
  entity: Entity;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
}) {
  const updateProperty = (key: string, value: string | number | boolean) => {
    onUpdateEntityProperties(entity.id, {
      ...entity.properties,
      [key]: value
    });
  };

  return (
    <ToolSection title="Properties">
      {Object.entries(entity.properties).map(([key, value]) =>
        typeof value === "boolean" ? (
          <BooleanField key={key} label={startCase(key)} onCheckedChange={(checked) => updateProperty(key, checked)} checked={value} />
        ) : typeof value === "number" ? (
          <NumberField key={key} label={startCase(key)} onChange={(next) => updateProperty(key, next)} value={value} />
        ) : (
          <TextField key={key} label={startCase(key)} onChange={(next) => updateProperty(key, next)} value={value} />
        )
      )}
    </ToolSection>
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

function EnumGrid({
  activeValue,
  entries,
  onSelect
}: {
  activeValue: string;
  entries: Array<{ label: string; value: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {entries.map((entry) => (
        <Button
          className={cn(activeValue === entry.value && "bg-emerald-500/18 text-emerald-200")}
          key={entry.value}
          onClick={() => onSelect(entry.value)}
          size="xs"
          variant="ghost"
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}

function BooleanField({
  checked,
  label,
  onCheckedChange
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/3 px-3 py-2">
      <span className="text-xs text-foreground/72">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-[0.16em] text-foreground/36 uppercase">
          {checked ? "On" : "Off"}
        </span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

function NumberField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <DragInput
      className="w-full"
      compact
      label={label}
      onChange={onChange}
      onValueCommit={() => undefined}
      precision={2}
      step={0.05}
      value={value}
    />
  );
}

function TextField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">{label}</div>
      <Input className="h-9 rounded-xl border-white/8 bg-white/5 text-xs" onChange={(event) => onChange(event.target.value)} value={value} />
    </div>
  );
}

function ColorField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/3 px-3 py-2">
      <span className="text-xs text-foreground/72">{label}</span>
      <Input
        className="h-8 flex-1 rounded-lg border-white/8 bg-white/5 text-xs"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </div>
  );
}

function startCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
