import { Eraser, Paintbrush } from "lucide-react";
import type { Material } from "@ggez/shared";
import type { MeshEditMode } from "@/viewport/editing";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import {
  ArcEdgeIcon,
  BevelIcon,
  CutMeshIcon,
  DeleteFacesIcon,
  DeflateIcon,
  EdgeModeIcon,
  FaceModeIcon,
  ExtrudeIcon,
  FillFaceIcon,
  FlipNormalsIcon,
  InflateIcon,
  LowerTopIcon,
  MergeFacesIcon,
  RaiseTopIcon,
  RotateModeIcon,
  ScaleModeIcon,
  SmoothBrushIcon,
  SubdivideIcon,
  TranslateModeIcon,
  VertexModeIcon
} from "@/components/editor-shell/icons";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MeshEditToolBars({
  onArc,
  onBevel,
  onDelete,
  onEraseMaterial,
  meshEditMode,
  onExtrude,
  onFillFace,
  onDeflate,
  onInflate,
  onInvertNormals,
  onLowerTop,
  onMerge,
  onPaintMaterial,
  onRaiseTop,
  onSelectMaterial,
  onSetMeshEditMode,
  onSetMaterialPaintBrushOpacity,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onSmooth,
  onSubdivide,
  onCut,
  onSetTransformMode,
  materialPaintBrushOpacity,
  materialPaintMode,
  materials,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  selectedMaterialId,
  selectedGeometry,
  selectedMesh,
  transformMode
}: {
  onArc: () => void;
  onBevel: () => void;
  onDelete: () => void;
  onEraseMaterial: () => void;
  meshEditMode: MeshEditMode;
  onExtrude: () => void;
  onFillFace: () => void;
  onDeflate: () => void;
  onInflate: () => void;
  onInvertNormals: () => void;
  onLowerTop: () => void;
  onMerge: () => void;
  onPaintMaterial: () => void;
  onRaiseTop: () => void;
  onSelectMaterial: (materialId: string) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetMaterialPaintBrushOpacity: (value: number) => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onSmooth: () => void;
  onSubdivide: () => void;
  onCut: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  materialPaintBrushOpacity: number;
  materialPaintMode?: "erase" | "paint" | null;
  materials: Material[];
  sculptMode?: "deflate" | "inflate" | "smooth" | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  selectedMaterialId: string;
  selectedGeometry: boolean;
  selectedMesh: boolean;
  transformMode: "rotate" | "scale" | "translate";
}) {
  const mergeTooltip =
    meshEditMode === "face" ? "Merge faces" : meshEditMode === "edge" ? "Merge edges" : "Merge vertices";
  const brushPanelVisible = Boolean(sculptMode || materialPaintMode);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-stretch gap-2">
        <FloatingPanel className="flex h-10 items-center gap-1 p-1.5">
          <MeshBarButton active={meshEditMode === "vertex"} icon={VertexModeIcon} onClick={() => onSetMeshEditMode("vertex")} shortcut="V" tooltip="Vertex mode" />
          <MeshBarButton active={meshEditMode === "edge"} icon={EdgeModeIcon} onClick={() => onSetMeshEditMode("edge")} shortcut="E" tooltip="Edge mode" />
          <MeshBarButton active={meshEditMode === "face"} icon={FaceModeIcon} onClick={() => onSetMeshEditMode("face")} shortcut="F" tooltip="Face mode" />
        </FloatingPanel>
        <FloatingPanel className="flex h-10 items-center gap-1 p-1.5">
          <MeshBarButton active={transformMode === "translate"} disabled={!selectedGeometry} icon={TranslateModeIcon} onClick={() => onSetTransformMode("translate")} shortcut="G" tooltip="Translate" />
          <MeshBarButton active={transformMode === "rotate"} disabled={!selectedGeometry} icon={RotateModeIcon} onClick={() => onSetTransformMode("rotate")} shortcut="R" tooltip="Rotate" />
          <MeshBarButton active={transformMode === "scale"} disabled={!selectedGeometry} icon={ScaleModeIcon} onClick={() => onSetTransformMode("scale")} shortcut="S" tooltip="Scale" />
          <div className="mx-0.5 h-5 w-px bg-white/8" />
          <MeshBarButton disabled={!selectedMesh} icon={InflateIcon} onClick={onInflate} tooltip="Inflate" />
          <MeshBarButton disabled={!selectedMesh} icon={DeflateIcon} onClick={onDeflate} tooltip="Deflate" />
          <MeshBarButton active={sculptMode === "smooth"} disabled={!selectedMesh} icon={SmoothBrushIcon} onClick={onSmooth} tooltip="Smooth" />
          <MeshBarButton active={materialPaintMode === "paint"} disabled={!selectedMesh} icon={Paintbrush} onClick={onPaintMaterial} tooltip="Paint material" />
          <MeshBarButton active={materialPaintMode === "erase"} disabled={!selectedMesh} icon={Eraser} onClick={onEraseMaterial} tooltip="Erase material paint" />
          <MeshBarButton disabled={!selectedMesh} icon={RaiseTopIcon} onClick={onRaiseTop} tooltip="Raise top" />
          <MeshBarButton disabled={!selectedMesh} icon={LowerTopIcon} onClick={onLowerTop} tooltip="Lower top" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "edge"} icon={ArcEdgeIcon} onClick={onArc} shortcut="A" tooltip="Arc" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "edge"} icon={BevelIcon} onClick={onBevel} shortcut="B" tooltip="Bevel" />
        </FloatingPanel>
        <FloatingPanel className="flex h-10 items-center gap-1 p-1.5">
          <MeshBarButton disabled={!selectedGeometry || meshEditMode === "vertex"} icon={ExtrudeIcon} onClick={onExtrude} shortcut="X" tooltip="Extrude" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode === "vertex"} icon={CutMeshIcon} onClick={onCut} shortcut={meshEditMode === "face" ? "Shift+K" : "K"} tooltip={meshEditMode === "face" ? "Face cut" : "Edge cut"} />
          <MeshBarButton disabled={!selectedGeometry} icon={MergeFacesIcon} onClick={onMerge} shortcut="M" tooltip={mergeTooltip} />
          <MeshBarButton disabled={!selectedGeometry} icon={FillFaceIcon} onClick={onFillFace} shortcut="Shift+F" tooltip={meshEditMode === "vertex" ? "Fill from vertices" : "Fill from edges"} />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={SubdivideIcon} onClick={onSubdivide} shortcut="D" tooltip="Subdivide face" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={DeleteFacesIcon} onClick={onDelete} shortcut="Del" tooltip="Delete faces" />
          <MeshBarButton disabled={!selectedGeometry} icon={FlipNormalsIcon} onClick={onInvertNormals} shortcut="N" tooltip="Invert normals" />
        </FloatingPanel>
      </div>
      {brushPanelVisible ? (
        <FloatingPanel className="flex min-w-[320px] items-center gap-3 p-2">
          <DragInput
            className="w-37.5"
            compact
            disabled={!selectedMesh}
            label="Size"
            min={0.25}
            onChange={onSetSculptBrushRadius}
            precision={2}
            step={0.02}
            value={sculptBrushRadius}
          />
          <DragInput
            className="w-37.5"
            compact
            disabled={!selectedMesh}
            label="Strength"
            min={0.01}
            onChange={onSetSculptBrushStrength}
            precision={3}
            step={0.005}
            value={sculptBrushStrength}
          />
          {materialPaintMode ? (
            <>
              <div className="h-8 w-px bg-white/8" />
              <DragInput
                className="w-37.5"
                compact
                disabled={!selectedMesh}
                label="Blend"
                max={1}
                min={0.05}
                onChange={onSetMaterialPaintBrushOpacity}
                precision={2}
                step={0.02}
                value={materialPaintBrushOpacity}
              />
              <div className="flex min-w-55 flex-col gap-1">
                <span className="px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/48">
                  Overlay Material
                </span>
                <Select onValueChange={(value) => {
                  if (value) {
                    onSelectMaterial(value);
                  }
                }} value={selectedMaterialId}>
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-white/5 text-sm">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
        </FloatingPanel>
      ) : null}
    </div>
  );
}

function MeshBarButton({
  active = false,
  disabled = false,
  icon: Icon,
  onClick,
  shortcut,
  tooltip
}: {
  active?: boolean;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  shortcut?: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(
              "size-7 rounded-xl text-foreground/58 transition-colors hover:text-foreground",
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
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-medium text-foreground">{tooltip}</span>
          {shortcut ? <span className="text-foreground/45">{shortcut}</span> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
