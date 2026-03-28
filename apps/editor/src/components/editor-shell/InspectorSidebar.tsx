import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { BellRing, Cable, FolderTree, Globe2, SlidersHorizontal, SwatchBook, User } from "lucide-react";
import {
  type EditableMesh,
  isInstancingNode,
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
  type TextureRecord,
  type Transform,
  type Vec3
} from "@ggez/shared";
import type { ToolId } from "@ggez/tool-system";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { EventsPanel, HooksPanel, PathsPanel } from "@/components/editor-shell/GameplayPanels";
import { MaterialLibraryPanel } from "@/components/editor-shell/MaterialLibraryPanel";
import { SceneHierarchyPanel } from "@/components/editor-shell/SceneHierarchyPanel";
import { rebaseTransformPivot } from "@/viewport/utils/geometry";
import { readFileAsDataUrl } from "@/lib/model-assets";
import { cn } from "@/lib/utils";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import type { RightPanelId } from "@/state/ui-store";

type InspectorSidebarProps = {
  activeRightPanel: RightPanelId | null;
  activeToolId: ToolId;
  assets: Array<{ id: string; path: string; type: string }>;
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  entities: Entity[];
  hiddenSceneItemIds: string[];
  lockedSceneItemIds: string[];
  materials: Material[];
  meshEditMode: MeshEditMode;
  nodes: GeometryNode[];
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onChangeRightPanel: (panel: RightPanelId | null) => void;
  onClipSelection: (axis: "x" | "y" | "z") => void;
  onDeleteMaterial: (materialId: string) => void;
  onDeleteTexture: (textureId: string) => void;
  onExtrudeSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onFocusNode: (nodeId: string) => void;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onMirrorSelection: (axis: "x" | "y" | "z") => void;
  onPlaceAsset: (position: Vec3) => void;
  onSelectAsset: (assetId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectScenePath: (pathId: string | undefined) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetToolId: (toolId: ToolId) => void;
  onToggleSceneItemLock: (itemId: string) => void;
  onToggleSceneItemVisibility: (itemId: string) => void;
  onSetUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: { x: number; y: number }) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: { x: number; y: number }) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onTranslateSelection: (axis: "x" | "y" | "z", direction: -1 | 1) => void;
  onUpsertMaterial: (material: Material) => void;
  onUpsertTexture: (texture: TextureRecord) => void;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
  onUpdateEntityHooks: (entityId: string, hooks: NonNullable<Entity["hooks"]>, beforeHooks?: NonNullable<Entity["hooks"]>) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
  onUpdateNodeHooks: (nodeId: string, hooks: NonNullable<GeometryNode["hooks"]>, beforeHooks?: NonNullable<GeometryNode["hooks"]>) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
  selectedScenePathId?: string;
  selectionEnabled: boolean;
  selectedAssetId: string;
  selectedEntity?: Entity;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  selectedNode?: GeometryNode;
  selectedNodeIds: string[];
  textures: TextureRecord[];
  viewportTarget: Vec3;
};

const AXES = ["x", "y", "z"] as const;
const RIGHT_PANEL_TAB_TRIGGER_CLASS =
  "!h-12 !gap-0.5 !px-0 !py-1 !text-foreground/70 data-active:!bg-emerald-500/14 data-active:!text-emerald-300 [&_svg]:size-3.5 [&_svg]:shrink-0 data-active:[&_svg]:!text-emerald-300";
const RIGHT_PANEL_TAB_LABEL_CLASS =
  "!text-[7px] !leading-none !font-medium !tracking-normal !text-foreground/50 data-active:!text-emerald-300";

function inferSkyboxFormat(file: File): SceneSettings["world"]["skybox"]["format"] {
  return file.name.toLowerCase().endsWith(".hdr") ? "hdr" : "image";
}

export function InspectorSidebar({
  activeRightPanel,
  activeToolId,
  assets,
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  entities,
  hiddenSceneItemIds,
  lockedSceneItemIds,
  materials,
  meshEditMode,
  nodes,
  onApplyMaterial,
  onChangeRightPanel,
  onClipSelection,
  onDeleteMaterial,
  onDeleteTexture,
  onExtrudeSelection,
  onFocusNode,
  onMeshEditToolbarAction,
  onMirrorSelection,
  onPlaceAsset,
  onSelectAsset,
  onSelectMaterial,
  onSelectScenePath,
  onSelectNodes,
  onSetToolId,
  onToggleSceneItemLock,
  onToggleSceneItemVisibility,
  onSetUvOffset,
  onSetUvScale,
  onTranslateSelection,
  onUpsertMaterial,
  onUpsertTexture,
  onUpdateEntityProperties,
  onUpdateEntityHooks,
  onUpdateEntityTransform,
  onUpdateMeshData,
  onUpdateNodeData,
  onUpdateNodeHooks,
  onUpdateNodeTransform,
  onUpdateSceneSettings,
  sceneSettings,
  selectedScenePathId,
  selectionEnabled,
  selectedAssetId,
  selectedEntity,
  selectedFaceIds,
  selectedMaterialId,
  selectedNode,
  selectedNodeIds,
  textures,
  viewportTarget
}: InspectorSidebarProps) {
  const selectedTarget = selectedNode ?? selectedEntity;
  const [draftTransform, setDraftTransform] = useState<Transform | undefined>(() =>
    selectedTarget ? structuredClone(selectedTarget.transform) : undefined
  );
  const [sceneSection, setSceneSection] = useState<"hierarchy" | "paths">("hierarchy");
  const [draftWorldSettings, setDraftWorldSettings] = useState(() => structuredClone(sceneSettings.world));
  const [draftPlayerSettings, setDraftPlayerSettings] = useState(() => structuredClone(sceneSettings.player));
  const draftTransformRef = useRef(draftTransform);
  const draftWorldSettingsRef = useRef(draftWorldSettings);
  const draftPlayerSettingsRef = useRef(draftPlayerSettings);
  const sceneSettingsRef = useRef(sceneSettings);
  const selectedNodeRef = useRef(selectedNode);
  const selectedEntityRef = useRef(selectedEntity);
  const selectedTargetRef = useRef(selectedTarget);

  const setDraftTransformState = (
    value: Transform | undefined | ((current: Transform | undefined) => Transform | undefined)
  ) => {
    setDraftTransform((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftTransformRef.current = next;
      return next;
    });
  };

  const setDraftWorldSettingsState = (
    value:
      | SceneSettings["world"]
      | ((current: SceneSettings["world"]) => SceneSettings["world"])
  ) => {
    setDraftWorldSettings((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftWorldSettingsRef.current = next;
      return next;
    });
  };

  const setDraftPlayerSettingsState = (
    value:
      | SceneSettings["player"]
      | ((current: SceneSettings["player"]) => SceneSettings["player"])
  ) => {
    setDraftPlayerSettings((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftPlayerSettingsRef.current = next;
      return next;
    });
  };

  sceneSettingsRef.current = sceneSettings;
  selectedNodeRef.current = selectedNode;
  selectedEntityRef.current = selectedEntity;
  selectedTargetRef.current = selectedTarget;

  useEffect(() => {
    const nextDraftTransform = selectedTarget ? structuredClone(selectedTarget.transform) : undefined;
    draftTransformRef.current = nextDraftTransform;
    setDraftTransform(nextDraftTransform);
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
    const nextWorldSettings = structuredClone(sceneSettings.world);
    const nextPlayerSettings = structuredClone(sceneSettings.player);
    draftWorldSettingsRef.current = nextWorldSettings;
    draftPlayerSettingsRef.current = nextPlayerSettings;
    setDraftWorldSettings(nextWorldSettings);
    setDraftPlayerSettings(nextPlayerSettings);
  }, [sceneSettings]);

  const selectedIsBrush = selectedNode?.kind === "brush";
  const selectedIsInstancing = selectedNode ? isInstancingNode(selectedNode) : false;
  const selectedIsMesh = selectedNode?.kind === "mesh";
  const selectedMeshNode = selectedNode?.kind === "mesh" ? selectedNode : undefined;
  const selectedInstancingNode = selectedNode && isInstancingNode(selectedNode) ? selectedNode : undefined;
  const selectedPrimitive = selectedNode && isPrimitiveNode(selectedNode) ? selectedNode : undefined;
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

  const commitWorldSettings = () => {
    const currentSceneSettings = sceneSettingsRef.current;

    onUpdateSceneSettings(
      {
        ...currentSceneSettings,
        world: structuredClone(draftWorldSettingsRef.current)
      },
      currentSceneSettings
    );
  };

  const commitWorldSettingsDraft = (nextWorldSettings: SceneSettings["world"]) => {
    setDraftWorldSettingsState(nextWorldSettings);
    onUpdateSceneSettings(
      {
        ...sceneSettingsRef.current,
        world: structuredClone(nextWorldSettings)
      },
      sceneSettingsRef.current
    );
  };

  const handleSkyboxFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const nextSource = await readFileAsDataUrl(file);
    const nextWorldSettings = {
      ...draftWorldSettingsRef.current,
      skybox: {
        ...draftWorldSettingsRef.current.skybox,
        enabled: true,
        format: inferSkyboxFormat(file),
        name: file.name,
        source: nextSource
      }
    };

    commitWorldSettingsDraft(nextWorldSettings);
  };

  const handleRemoveSkybox = () => {
    commitWorldSettingsDraft({
      ...draftWorldSettingsRef.current,
      skybox: {
        ...draftWorldSettingsRef.current.skybox,
        enabled: false,
        name: "",
        source: ""
      }
    });
  };

  const commitPlayerSettings = () => {
    const currentSceneSettings = sceneSettingsRef.current;

    onUpdateSceneSettings(
      {
        ...currentSceneSettings,
        player: structuredClone(draftPlayerSettingsRef.current)
      },
      currentSceneSettings
    );
  };

  const handleTabClick = (panel: RightPanelId) => {
    if (activeRightPanel === panel) {
      onChangeRightPanel(null);
    } else {
      onChangeRightPanel(panel);
    }
  };

  const collapsed = activeRightPanel === null;

  return (
    <div className={cn(
      "pointer-events-none absolute right-4 top-4 z-20 flex w-88 max-h-[calc(100%-7rem)]",
      collapsed ? "h-auto" : "h-[clamp(26rem,58vh,42rem)]"
    )}>
      <FloatingPanel className="flex min-h-0 w-full flex-col overflow-hidden">
        <Tabs
          className="flex min-h-0 flex-1 flex-col gap-0"
          onValueChange={(value) => onChangeRightPanel(value as RightPanelId)}
          value={activeRightPanel ?? ""}
        >
          <div className={cn("px-3 pt-3", collapsed ? "pb-3" : "pb-2")}>
            <TabsList className="!grid !h-14 !w-full !grid-cols-7 !items-stretch rounded-xl bg-white/5 p-0.5" variant="default">
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="scene" onClick={() => handleTabClick("scene")}>
                <FolderTree />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>Scene</span>
              </TabsTrigger>
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="world" onClick={() => handleTabClick("world")}>
                <Globe2 />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>World</span>
              </TabsTrigger>
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="player" onClick={() => handleTabClick("player")}>
                <User />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>Player</span>
              </TabsTrigger>
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="inspector" onClick={() => handleTabClick("inspector")}>
                <SlidersHorizontal />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>Inspect</span>
              </TabsTrigger>
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="hooks" onClick={() => handleTabClick("hooks")}>
                <Cable />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>Hooks</span>
              </TabsTrigger>
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="events" onClick={() => handleTabClick("events")}>
                <BellRing />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>Events</span>
              </TabsTrigger>
              <TabsTrigger className={cn(RIGHT_PANEL_TAB_TRIGGER_CLASS, "!flex-col")} value="materials" onClick={() => handleTabClick("materials")}>
                <SwatchBook />
                <span className={RIGHT_PANEL_TAB_LABEL_CLASS}>Mats</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="scene">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="grid grid-cols-2 gap-1.5 px-1">
                <Button
                  className={cn(sceneSection === "hierarchy" && "bg-emerald-500/18 text-emerald-200")}
                  onClick={() => setSceneSection("hierarchy")}
                  size="xs"
                  variant="ghost"
                >
                  Hierarchy
                </Button>
                <Button
                  className={cn(sceneSection === "paths" && "bg-emerald-500/18 text-emerald-200")}
                  onClick={() => setSceneSection("paths")}
                  size="xs"
                  variant="ghost"
                >
                  Paths
                </Button>
              </div>
              {sceneSection === "hierarchy" ? (
                <div className="min-h-0 flex-1">
                  <SceneHierarchyPanel
                    effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
                    effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
                    entities={entities}
                    hiddenSceneItemIds={hiddenSceneItemIds}
                    interactive={selectionEnabled}
                    lockedSceneItemIds={lockedSceneItemIds}
                    nodes={nodes}
                    onFocusNode={onFocusNode}
                    onSelectNodes={onSelectNodes}
                    onToggleSceneItemLock={onToggleSceneItemLock}
                    onToggleSceneItemVisibility={onToggleSceneItemVisibility}
                    selectedNodeIds={selectedNodeIds}
                  />
                </div>
              ) : (
                <ScrollArea className="h-full pr-1">
                  <PathsPanel
                    activeToolId={activeToolId}
                    onSelectScenePath={onSelectScenePath}
                    onSetToolId={onSetToolId}
                    onUpdateSceneSettings={onUpdateSceneSettings}
                    sceneSettings={sceneSettings}
                    selectedPathId={selectedScenePathId}
                  />
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="world">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-4 px-1 pb-1">
                <ToolSection title="Physics">
                  <BooleanField
                    label="Physics Enabled"
                    onCheckedChange={(checked) => setDraftWorldSettingsState((current) => ({ ...current, physicsEnabled: checked }))}
                    checked={draftWorldSettings.physicsEnabled}
                  />
                  <TransformGroup
                    label="Gravity"
                    onCommit={commitWorldSettings}
                    onUpdate={(axis, value) =>
                      setDraftWorldSettingsState((current) => ({
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
                    onChange={(value) => setDraftWorldSettingsState((current) => ({ ...current, ambientColor: value }))}
                    value={draftWorldSettings.ambientColor}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Intensity"
                    onChange={(value) => setDraftWorldSettingsState((current) => ({ ...current, ambientIntensity: value }))}
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.ambientIntensity}
                  />
                </ToolSection>

                <ToolSection title="LOD Bake">
                  <BooleanField
                    label="Bake Runtime LODs"
                    onCheckedChange={(checked) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          enabled: checked
                        }
                      }))
                    }
                    checked={draftWorldSettings.lod.enabled}
                  />
                  <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
                    Runtime bundle export keeps the authored mesh as high detail and generates `mid` + `low` variants from
                    these ratios. Games choose the switch distances at load time.
                  </div>
                  <DragInput
                    className="w-full"
                    compact
                    label="Mid Detail"
                    max={0.95}
                    min={0.1}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          midDetailRatio: Math.max(Math.max(0.1, value), current.lod.lowDetailRatio)
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.02}
                    value={draftWorldSettings.lod.midDetailRatio}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Low Detail"
                    max={draftWorldSettings.lod.midDetailRatio}
                    min={0.05}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          lowDetailRatio: Math.min(current.lod.midDetailRatio, Math.max(0.05, value))
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.02}
                    value={draftWorldSettings.lod.lowDetailRatio}
                  />
                  <div className="rounded-xl bg-white/3 px-3 py-2 text-[11px] text-foreground/60">
                    There is no separate editor bake step. The runtime export writes the baked LOD tiers into the bundle.
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save LOD Settings
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="Skybox">
                  <BooleanField
                    label="Enabled"
                    onCheckedChange={(checked) =>
                      commitWorldSettingsDraft({
                        ...draftWorldSettings,
                        skybox: {
                          ...draftWorldSettings.skybox,
                          enabled: checked
                        }
                      })
                    }
                    checked={draftWorldSettings.skybox.enabled}
                  />
                  <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
                    HDRs are best when you want image-based lighting. Leave `Affect Lighting` off to use the skybox as backdrop only.
                  </div>
                  <Input
                    accept=".hdr,image/*"
                    className="h-9 rounded-xl border-white/8 bg-white/5 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:font-medium"
                    onChange={(event) => {
                      void handleSkyboxFileChange(event);
                    }}
                    type="file"
                  />
                  <div className="rounded-xl bg-white/3 px-3 py-2 text-xs text-foreground/72">
                    {draftWorldSettings.skybox.name || "No skybox selected"}
                  </div>
                  <BooleanField
                    label="Affect Lighting"
                    onCheckedChange={(checked) =>
                      commitWorldSettingsDraft({
                        ...draftWorldSettings,
                        skybox: {
                          ...draftWorldSettings.skybox,
                          affectsLighting: checked
                        }
                      })
                    }
                    checked={draftWorldSettings.skybox.affectsLighting}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Backdrop Intensity"
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        skybox: {
                          ...current.skybox,
                          intensity: Math.max(0, value)
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.skybox.intensity}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Lighting Intensity"
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        skybox: {
                          ...current.skybox,
                          lightingIntensity: Math.max(0, value)
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.skybox.lightingIntensity}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Blur"
                    max={1}
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        skybox: {
                          ...current.skybox,
                          blur: Math.max(0, Math.min(1, value))
                        }
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.05}
                    value={draftWorldSettings.skybox.blur}
                  />
                  <div className="flex justify-end gap-2">
                    <Button disabled={!draftWorldSettings.skybox.source} onClick={handleRemoveSkybox} size="xs" variant="ghost">
                      Remove Skybox
                    </Button>
                    <Button onClick={commitWorldSettings} size="xs" variant="ghost">
                      Save Skybox
                    </Button>
                  </div>
                </ToolSection>

                <ToolSection title="Fog">
                  <ColorField
                    label="Fog Color"
                    onChange={(value) => setDraftWorldSettingsState((current) => ({ ...current, fogColor: value }))}
                    value={draftWorldSettings.fogColor}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Near"
                    min={0}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        fogNear: Math.max(0, Math.min(value, current.fogFar - 0.01)),
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={0.5}
                    value={draftWorldSettings.fogNear}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Far"
                    min={0.01}
                    onChange={(value) =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        fogFar: Math.max(value, current.fogNear + 0.01),
                      }))
                    }
                    onValueCommit={commitWorldSettings}
                    precision={2}
                    step={1}
                    value={draftWorldSettings.fogFar}
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
                          setDraftPlayerSettingsState((current) => ({ ...current, cameraMode: value }));
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
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, height: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.height}
                  />
                  <DragInput
                    className="w-full"
                    compact
                    label="Move Speed"
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, movementSpeed: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.1}
                    value={draftPlayerSettings.movementSpeed}
                  />
                  <BooleanField
                    label="Allow Run"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canRun: checked };
                      setDraftPlayerSettingsState(nextPlayer);
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
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, runningSpeed: value }))}
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
                      setDraftPlayerSettingsState(nextPlayer);
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
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, jumpHeight: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.jumpHeight}
                  />
                  <BooleanField
                    label="Allow Crouch"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canCrouch: checked };
                      setDraftPlayerSettingsState(nextPlayer);
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
                    onChange={(value) => setDraftPlayerSettingsState((current) => ({ ...current, crouchHeight: value }))}
                    onValueCommit={commitPlayerSettings}
                    precision={2}
                    step={0.05}
                    value={draftPlayerSettings.crouchHeight}
                  />
                </ToolSection>

                <ToolSection title="Interaction">
                  <BooleanField
                    label="Allow Interact"
                    onCheckedChange={(checked) => {
                      const nextPlayer = { ...draftPlayerSettings, canInteract: checked };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
                    checked={draftPlayerSettings.canInteract ?? true}
                  />
                  <InteractKeyField
                    value={draftPlayerSettings.interactKey ?? "KeyE"}
                    onChange={(code) => {
                      const nextPlayer = { ...draftPlayerSettings, interactKey: code };
                      setDraftPlayerSettingsState(nextPlayer);
                      onUpdateSceneSettings(
                        {
                          ...sceneSettings,
                          player: nextPlayer
                        },
                        sceneSettings
                      );
                    }}
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
                    {selectedMeshNode ? (
                      <MeshPhysicsInspector
                        node={selectedMeshNode}
                        onUpdateMeshData={onUpdateMeshData}
                      />
                    ) : null}
                    {selectedInstancingNode ? <InstancingInspector node={selectedInstancingNode} /> : null}
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
                          <Button disabled={!selectedIsMesh} onClick={() => onMeshEditToolbarAction("inflate")} size="xs" variant="ghost">
                            Inflate
                          </Button>
                          <Button disabled={!selectedIsMesh} onClick={() => onMeshEditToolbarAction("deflate")} size="xs" variant="ghost">
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

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="hooks">
            <ScrollArea className="h-full pr-1">
              <HooksPanel
                entities={entities}
                nodes={nodes}
                onUpdateEntityHooks={onUpdateEntityHooks}
                onUpdateNodeHooks={onUpdateNodeHooks}
                sceneSettings={sceneSettings}
                selectedEntity={selectedEntity}
                selectedNode={selectedNode}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1 px-3 pb-3" value="events">
            <ScrollArea className="h-full pr-1">
              <EventsPanel onUpdateSceneSettings={onUpdateSceneSettings} sceneSettings={sceneSettings} />
            </ScrollArea>
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 px-3 pb-3" value="materials">
            <MaterialLibraryPanel
              materials={materials}
              onApplyMaterial={onApplyMaterial}
              onDeleteMaterial={onDeleteMaterial}
              onDeleteTexture={onDeleteTexture}
              onSelectMaterial={onSelectMaterial}
              onSetUvOffset={onSetUvOffset}
              onSetUvScale={onSetUvScale}
              onUpdateMeshData={onUpdateMeshData}
              onUpsertMaterial={onUpsertMaterial}
              onUpsertTexture={onUpsertTexture}
              selectedFaceIds={activeToolId === "mesh-edit" && meshEditMode === "face" ? selectedFaceIds : []}
              selectedMaterialId={selectedMaterialId}
              selectedNode={selectedNode}
              textures={textures}
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
        <PropPhysicsFields
          physics={node.data.physics}
          onChange={(physics) => updateData({ ...node.data, physics })}
        />
      ) : null}
    </ToolSection>
  );
}

function MeshPhysicsInspector({
  node,
  onUpdateMeshData
}: {
  node: Extract<GeometryNode, { kind: "mesh" }>;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
}) {
  const physics = node.data.physics;

  return (
    <ToolSection title="Mesh Physics">
      <BooleanField
        label="Enabled"
        onCheckedChange={(checked) => {
          if (checked) {
            onUpdateMeshData(
              node.id,
              {
                ...node.data,
                physics: physics ?? createDefaultMeshPhysics()
              },
              node.data
            );
            return;
          }

          onUpdateMeshData(
            node.id,
            {
              ...node.data,
              physics: undefined
            },
            node.data
          );
        }}
        checked={Boolean(physics)}
      />

      {physics ? (
        <PropPhysicsFields
          physics={physics}
          onChange={(nextPhysics) =>
            onUpdateMeshData(
              node.id,
              { ...node.data, physics: nextPhysics },
              node.data
            )
          }
        />
      ) : (
        <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/52">
          Enable physics to simulate this mesh at runtime.
        </div>
      )}
    </ToolSection>
  );
}

function InstancingInspector({
  node
}: {
  node: Extract<GeometryNode, { kind: "instancing" }>;
}) {
  return (
    <ToolSection title="Instancing">
      <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
        This node instances <span className="font-mono text-foreground/72">{node.data.sourceNodeId}</span>. Only transform
        values are editable here.
      </div>
    </ToolSection>
  );
}

function PropPhysicsFields({
  physics,
  onChange
}: {
  physics: NonNullable<PrimitiveNodeData["physics"]>;
  onChange: (physics: NonNullable<PrimitiveNodeData["physics"]>) => void;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>Physics</SectionTitle>
      <BooleanField
        label="Physics Enabled"
        onCheckedChange={(checked) => onChange({ ...physics, enabled: checked })}
        checked={physics.enabled}
      />
      <EnumGrid
        activeValue={physics.bodyType}
        entries={[
          { label: "Static", value: "fixed" },
          { label: "Dynamic", value: "dynamic" },
          { label: "Kinematic", value: "kinematicPosition" }
        ]}
        onSelect={(value) => onChange({ ...physics, bodyType: value as PropBodyType })}
      />
      <EnumGrid
        activeValue={physics.colliderShape}
        entries={[
          { label: "Cuboid", value: "cuboid" },
          { label: "Ball", value: "ball" },
          { label: "Cylinder", value: "cylinder" },
          { label: "Cone", value: "cone" },
          { label: "Trimesh", value: "trimesh" }
        ]}
        onSelect={(value) => onChange({ ...physics, colliderShape: value as PropColliderShape })}
      />
      <NumberField label="Mass" onChange={(value) => onChange({ ...physics, mass: value })} value={physics.mass ?? 1} />
      <NumberField label="Density" onChange={(value) => onChange({ ...physics, density: value })} value={physics.density ?? 0} />
      <NumberField label="Friction" onChange={(value) => onChange({ ...physics, friction: value })} value={physics.friction} />
      <NumberField label="Restitution" onChange={(value) => onChange({ ...physics, restitution: value })} value={physics.restitution} />
      <NumberField label="Gravity Scale" onChange={(value) => onChange({ ...physics, gravityScale: value })} value={physics.gravityScale} />
      <BooleanField
        label="Sensor"
        onCheckedChange={(checked) => onChange({ ...physics, sensor: checked })}
        checked={physics.sensor}
      />
      <BooleanField
        label="CCD"
        onCheckedChange={(checked) => onChange({ ...physics, ccd: checked })}
        checked={physics.ccd}
      />
      <BooleanField
        label="Lock Rotations"
        onCheckedChange={(checked) => onChange({ ...physics, lockRotations: checked })}
        checked={physics.lockRotations}
      />
      <BooleanField
        label="Lock Translations"
        onCheckedChange={(checked) => onChange({ ...physics, lockTranslations: checked })}
        checked={physics.lockTranslations}
      />
    </div>
  );
}

function createDefaultMeshPhysics(): NonNullable<PrimitiveNodeData["physics"]> {
  return {
    angularDamping: 0.8,
    bodyType: "fixed",
    canSleep: true,
    ccd: false,
    colliderShape: "trimesh",
    contactSkin: 0,
    density: undefined,
    enabled: true,
    friction: 0.8,
    gravityScale: 1,
    linearDamping: 0.7,
    lockRotations: false,
    lockTranslations: false,
    mass: 1,
    restitution: 0.05,
    sensor: false
  };
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

function InteractKeyField({
  value,
  onChange
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onChange(event.code);
      setListening(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [listening, onChange]);

  const displayLabel = value.replace(/^Key/, "").replace(/^Digit/, "");

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/3 px-3 py-2">
      <span className="text-xs text-foreground/72">Interact Key</span>
      <Button
        className={cn(listening && "bg-emerald-500/18 text-emerald-200")}
        onClick={() => setListening((current) => !current)}
        size="xs"
        variant="ghost"
      >
        {listening ? "Press a key..." : displayLabel}
      </Button>
    </div>
  );
}

function startCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
