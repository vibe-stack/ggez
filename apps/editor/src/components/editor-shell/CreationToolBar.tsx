import type { BrushShape, EntityType, LightType, PrimitiveShape } from "@ggez/shared";
import type { ComponentType, ReactNode } from "react";
import { PackagePlus, Sparkles } from "lucide-react";
import {
  AmbientLightIcon,
  ConePrimitiveIcon,
  CrateIcon,
  CubePrimitiveIcon,
  CylinderPrimitiveIcon,
  DirectionalLightIcon,
  HemisphereLightIcon,
  NpcSpawnIcon,
  PlanePrimitiveIcon,
  PlayerSpawnIcon,
  PointLightIcon,
  SmartObjectIcon,
  SpherePrimitiveIcon,
  SpotLightIcon
} from "@/components/editor-shell/icons";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ToolId } from "@ggez/tool-system";
import type { BrushToolMode, InstanceBrushSourceOption } from "@/viewport/types";

export function CreationToolBar({
  activeBrushShape,
  brushToolMode,
  aiModelPlacementActive,
  activeToolId,
  disabled = false,
  instanceBrushDensity,
  instanceBrushRandomness,
  instanceBrushSize,
  instanceBrushSourceNodeId,
  instanceBrushSourceOptions,
  onImportGlb,
  onPlaceEntity,
  onPlaceLight,
  onPlaceBlockoutOpenRoom,
  onPlaceBlockoutPlatform,
  onPlaceBlockoutRoom,
  onPlaceBlockoutStairs,
  onPlaceProp,
  onSelectInstanceBrush,
  onStartAiModelPlacement,
  onSelectBrushShape,
  onSetInstanceBrushDensity,
  onSetInstanceBrushRandomness,
  onSetInstanceBrushSize,
  onSetInstanceBrushSourceNodeId
}: {
  activeBrushShape: BrushShape;
  brushToolMode: BrushToolMode;
  aiModelPlacementActive: boolean;
  activeToolId: ToolId;
  disabled?: boolean;
  instanceBrushDensity: number;
  instanceBrushRandomness: number;
  instanceBrushSize: number;
  instanceBrushSourceNodeId: string;
  instanceBrushSourceOptions: InstanceBrushSourceOption[];
  onImportGlb: () => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceBlockoutOpenRoom: () => void;
  onPlaceBlockoutPlatform: () => void;
  onPlaceBlockoutRoom: () => void;
  onPlaceBlockoutStairs: () => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onSelectInstanceBrush: () => void;
  onStartAiModelPlacement: () => void;
  onSelectBrushShape: (shape: BrushShape) => void;
  onSetInstanceBrushDensity: (value: number) => void;
  onSetInstanceBrushRandomness: (value: number) => void;
  onSetInstanceBrushSize: (value: number) => void;
  onSetInstanceBrushSourceNodeId: (nodeId: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-end gap-2">
        <CreationGroup label="Brush">
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "cube"}
            disabled={disabled}
            icon={CubePrimitiveIcon}
            label="Cube Brush"
            onClick={() => onSelectBrushShape("cube")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "custom-polygon"}
            disabled={disabled}
            icon={CustomPolygonBrushIcon}
            label="Custom Polygon Brush"
            onClick={() => onSelectBrushShape("custom-polygon")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "plane"}
            disabled={disabled}
            icon={PlanePrimitiveIcon}
            label="Plane Brush"
            onClick={() => onSelectBrushShape("plane")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "sphere"}
            disabled={disabled}
            icon={SpherePrimitiveIcon}
            label="Sphere Brush"
            onClick={() => onSelectBrushShape("sphere")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "stairs"}
            disabled={disabled}
            icon={StairBrushIcon}
            label="Stairs Brush"
            onClick={() => onSelectBrushShape("stairs")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "ramp"}
            disabled={disabled}
            icon={RampBrushIcon}
            label="Ramp Brush"
            onClick={() => onSelectBrushShape("ramp")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "cylinder"}
            disabled={disabled}
            icon={CylinderPrimitiveIcon}
            label="Cylinder Brush"
            onClick={() => onSelectBrushShape("cylinder")}
          />
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "create" && activeBrushShape === "cone"}
            disabled={disabled}
            icon={ConePrimitiveIcon}
            label="Cone Brush"
            onClick={() => onSelectBrushShape("cone")}
          />
        </CreationGroup>

        <CreationGroup label="Props">
          <CreationButton disabled={disabled} icon={CrateIcon} label="Crate Prop" onClick={() => onPlaceProp("cube")} />
          <CreationButton disabled={disabled} icon={CylinderPrimitiveIcon} label="Cylinder Prop" onClick={() => onPlaceProp("cylinder")} />
          <CreationButton disabled={disabled} icon={ConePrimitiveIcon} label="Cone Prop" onClick={() => onPlaceProp("cone")} />
          <CreationButton disabled={disabled} icon={SpherePrimitiveIcon} label="Sphere Prop" onClick={() => onPlaceProp("sphere")} />
        </CreationGroup>

        <CreationGroup label="Models">
          <CreationButton
            active={activeToolId === "brush" && brushToolMode === "instance"}
            disabled={disabled}
            icon={ScatterBrushIcon}
            label="Instance Brush"
            onClick={onSelectInstanceBrush}
          />
          <CreationButton disabled={disabled} icon={PackagePlus} label="Import GLB" onClick={onImportGlb} />
          <CreationButton
            active={aiModelPlacementActive}
            disabled={disabled}
            icon={Sparkles}
            label="Generate 3D"
            onClick={onStartAiModelPlacement}
          />
        </CreationGroup>

        <CreationGroup label="Entities">
          <CreationButton disabled={disabled} icon={PlayerSpawnIcon} label="Player Spawn" onClick={() => onPlaceEntity("player-spawn")} />
          <CreationButton disabled={disabled} icon={NpcSpawnIcon} label="NPC Spawn" onClick={() => onPlaceEntity("npc-spawn")} />
          <CreationButton disabled={disabled} icon={SmartObjectIcon} label="Smart Object" onClick={() => onPlaceEntity("smart-object")} />
          <CreationButton disabled={disabled} icon={Sparkles} label="VFX Object" onClick={() => onPlaceEntity("vfx-object")} />
        </CreationGroup>

        <CreationGroup label="Lights">
          <CreationButton disabled={disabled} icon={PointLightIcon} label="Point Light" onClick={() => onPlaceLight("point")} />
          <CreationButton disabled={disabled} icon={DirectionalLightIcon} label="Directional Light" onClick={() => onPlaceLight("directional")} />
          <CreationButton disabled={disabled} icon={HemisphereLightIcon} label="Hemisphere Light" onClick={() => onPlaceLight("hemisphere")} />
          <CreationButton disabled={disabled} icon={SpotLightIcon} label="Spot Light" onClick={() => onPlaceLight("spot")} />
          <CreationButton disabled={disabled} icon={AmbientLightIcon} label="Ambient Light" onClick={() => onPlaceLight("ambient")} />
        </CreationGroup>

        <CreationGroup label="Blockout">
          <CreationButton disabled={disabled} icon={BlockoutPlatformIcon} label="Open Platform" onClick={onPlaceBlockoutPlatform} />
          <CreationButton disabled={disabled} icon={RoomShellIcon} label="Closed Room" onClick={onPlaceBlockoutRoom} />
          <CreationButton disabled={disabled} icon={OpenRoomIcon} label="Open Room" onClick={onPlaceBlockoutOpenRoom} />
          <CreationButton disabled={disabled} icon={StairBlockoutIcon} label="Blockout Stairs" onClick={onPlaceBlockoutStairs} />
        </CreationGroup>
      </div>

      {brushToolMode === "instance" ? (
        <FloatingPanel className="flex min-w-105 items-center gap-3 p-2">
          <DragInput
            className="w-37.5"
            compact
            disabled={disabled}
            label="Size"
            min={0.25}
            onChange={onSetInstanceBrushSize}
            precision={2}
            step={0.1}
            value={instanceBrushSize}
          />
          <DragInput
            className="w-37.5"
            compact
            disabled={disabled}
            label="Density"
            max={64}
            min={1}
            onChange={(value) => onSetInstanceBrushDensity(Math.max(1, Math.round(value)))}
            precision={0}
            step={1}
            value={instanceBrushDensity}
          />
          <DragInput
            className="w-37.5"
            compact
            disabled={disabled}
            label="Randomness"
            max={1}
            min={0}
            onChange={onSetInstanceBrushRandomness}
            precision={2}
            step={0.05}
            value={instanceBrushRandomness}
          />
          <div className="h-8 w-px bg-white/8" />
          <div className="flex min-w-60 flex-col gap-1">
            <span className="px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/48">
              Object To Instance
            </span>
            <Select onValueChange={(value) => onSetInstanceBrushSourceNodeId(value ?? "")} value={instanceBrushSourceNodeId}>
              <SelectTrigger className="h-9 rounded-xl border-white/10 bg-white/5 text-sm">
                <SelectValue placeholder={instanceBrushSourceOptions.length > 0 ? "Select source object" : "Place an object first"} />
              </SelectTrigger>
              <SelectContent>
                {instanceBrushSourceOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FloatingPanel>
      ) : null}
    </div>
  );
}

function CreationGroup({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="pl-2 text-[9px] font-medium tracking-[0.2em] text-foreground/34 uppercase">{label}</div>
      <FloatingPanel className="flex h-10 items-center gap-1 p-1.5">{children}</FloatingPanel>
    </div>
  );
}

function CreationButton({
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onClick
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(
              "size-7 rounded-xl text-foreground/58 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
              active && "bg-emerald-500/18 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
            )}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-[11px] font-medium text-foreground">{label}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function BlockoutPlatformIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5 15.5h14v3H5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M8 15.5v-3m8 3v-3" opacity="0.42" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M7 9.5h10" opacity="0.28" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function RoomShellIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6.5 7.5h11v10h-11z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M9.5 17.5v-4h5v4" opacity="0.38" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="M8 10.5h8" opacity="0.28" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

function OpenRoomIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6.5 7.5h11v10h-11z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M10 17.5h4" opacity="0.22" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M17.5 12h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function StairBlockoutIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 17h4v-3h4v-3h4V8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M6 17h12" opacity="0.32" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function ScatterBrushIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="8" cy="8" fill="currentColor" opacity="0.92" r="1.8" />
      <circle cx="15.5" cy="9.5" fill="currentColor" opacity="0.72" r="1.5" />
      <circle cx="10" cy="15" fill="currentColor" opacity="0.58" r="1.35" />
      <circle cx="17" cy="15.5" fill="currentColor" opacity="0.88" r="1.7" />
      <path d="M5.5 18.5c2.6-2.3 4.9-3.5 7-3.5 2.1 0 4.1.8 6 2.4" opacity="0.36" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function CustomPolygonBrushIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 6.5l10 2.5-3 8.5-9-2.5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <circle cx="7" cy="6.5" fill="currentColor" r="1.3" />
      <circle cx="17" cy="9" fill="currentColor" r="1.3" />
      <circle cx="14" cy="17.5" fill="currentColor" r="1.3" />
      <circle cx="5" cy="15" fill="currentColor" r="1.3" />
    </svg>
  );
}

function StairBrushIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5.5 17.5h4v-3h4v-3h4v-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M5.5 17.5V8.5" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M5.5 17.5h12" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function RampBrushIcon(props: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5.5 17.5 Q8 17.5 17.5 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M5.5 17.5V8.5" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M5.5 17.5h12" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}
