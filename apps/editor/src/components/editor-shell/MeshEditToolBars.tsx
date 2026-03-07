import type { MeshEditMode } from "@/viewport/editing";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import {
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
  SubdivideIcon,
  TranslateModeIcon,
  VertexModeIcon
} from "@/components/editor-shell/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MeshEditToolBars({
  onBevel,
  onDelete,
  meshEditMode,
  onExtrude,
  onFillFace,
  onDeflate,
  onInflate,
  onInvertNormals,
  onLowerTop,
  onMerge,
  onRaiseTop,
  onSetMeshEditMode,
  onSubdivide,
  onCut,
  onSetTransformMode,
  selectedGeometry,
  selectedMesh,
  transformMode
}: {
  onBevel: () => void;
  onDelete: () => void;
  meshEditMode: MeshEditMode;
  onExtrude: () => void;
  onFillFace: () => void;
  onDeflate: () => void;
  onInflate: () => void;
  onInvertNormals: () => void;
  onLowerTop: () => void;
  onMerge: () => void;
  onRaiseTop: () => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSubdivide: () => void;
  onCut: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  selectedGeometry: boolean;
  selectedMesh: boolean;
  transformMode: "rotate" | "scale" | "translate";
}) {
  return (
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
        <MeshBarButton disabled={!selectedMesh} icon={RaiseTopIcon} onClick={onRaiseTop} tooltip="Raise top" />
        <MeshBarButton disabled={!selectedMesh} icon={LowerTopIcon} onClick={onLowerTop} tooltip="Lower top" />
        <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "edge"} icon={BevelIcon} onClick={onBevel} shortcut="B" tooltip="Bevel" />
      </FloatingPanel>
      <FloatingPanel className="flex h-10 items-center gap-1 p-1.5">
        <MeshBarButton disabled={!selectedGeometry || meshEditMode === "vertex"} icon={ExtrudeIcon} onClick={onExtrude} shortcut="X" tooltip="Extrude" />
        <MeshBarButton disabled={!selectedGeometry || meshEditMode === "vertex"} icon={CutMeshIcon} onClick={onCut} shortcut={meshEditMode === "face" ? "Shift+K" : "K"} tooltip={meshEditMode === "face" ? "Face cut" : "Edge cut"} />
        <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={MergeFacesIcon} onClick={onMerge} shortcut="M" tooltip="Merge faces" />
        <MeshBarButton disabled={!selectedGeometry} icon={FillFaceIcon} onClick={onFillFace} shortcut="Shift+F" tooltip={meshEditMode === "vertex" ? "Fill from vertices" : "Fill from edges"} />
        <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={SubdivideIcon} onClick={onSubdivide} shortcut="D" tooltip="Subdivide face" />
        <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={DeleteFacesIcon} onClick={onDelete} shortcut="Del" tooltip="Delete faces" />
        <MeshBarButton disabled={!selectedGeometry} icon={FlipNormalsIcon} onClick={onInvertNormals} shortcut="N" tooltip="Invert normals" />
      </FloatingPanel>
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