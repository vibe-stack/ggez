import { memo } from "react";
import type { GridSnapValue } from "@ggez/render-pipeline";
import type { BrushShape, EntityType, LightType, Material, PrimitiveShape } from "@ggez/shared";
import type { ToolId } from "@ggez/tool-system";
import { AnimatePresence, motion } from "motion/react";
import { CreationToolBar } from "@/components/editor-shell/CreationToolBar";
import { MeshEditToolBars } from "@/components/editor-shell/MeshEditToolBars";
import { PhysicsPlaybackControl } from "@/components/editor-shell/PhysicsPlaybackControl";
import { PrimaryToolBar } from "@/components/editor-shell/PrimaryToolBar";
import { RenderModeControl } from "@/components/editor-shell/RenderModeControl";
import { SnapControl } from "@/components/editor-shell/SnapControl";
import { ViewModeControl } from "@/components/editor-shell/ViewModeControl";
import type { MeshEditMode } from "@/viewport/editing";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";
import type { ViewModeId, ViewportRenderMode } from "@/viewport/viewports";

type ToolPaletteProps = {
  activeBrushShape: BrushShape;
  aiModelPlacementActive: boolean;
  activeToolId: ToolId;
  currentSnapSize: GridSnapValue;
  gridSnapValues: readonly GridSnapValue[];
  materialPaintBrushOpacity: number;
  materialPaintMode?: "erase" | "paint" | null;
  materials: Material[];
  meshEditMode: MeshEditMode;
  onMeshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
  onInvertSelectionNormals: () => void;
  onLowerTop: () => void;
  onPausePhysics: () => void;
  onImportGlb: () => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceBlockoutOpenRoom: () => void;
  onPlaceBlockoutPlatform: () => void;
  onPlaceBlockoutRoom: () => void;
  onPlaceBlockoutStairs: () => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onPlayPhysics: () => void;
  onRaiseTop: () => void;
  onSelectMaterial: (materialId: string) => void;
  onSetMaterialPaintBrushOpacity: (value: number) => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onStartAiModelPlacement: () => void;
  onSelectBrushShape: (shape: BrushShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onSetToolId: (toolId: ToolId) => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetRenderMode: (renderMode: ViewportRenderMode) => void;
  onSetViewMode: (viewMode: ViewModeId) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  renderMode: ViewportRenderMode;
  selectedMaterialId: string;
  sculptMode?: "deflate" | "inflate" | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  selectedGeometry: boolean;
  selectedMesh: boolean;
  snapEnabled: boolean;
  tools: Array<{ id: ToolId; label: string }>;
  transformMode: "rotate" | "scale" | "translate";
  viewMode: ViewModeId;
};

function ToolPaletteInner({
  activeBrushShape,
  aiModelPlacementActive,
  activeToolId,
  currentSnapSize,
  gridSnapValues,
  materialPaintBrushOpacity,
  materialPaintMode,
  materials,
  meshEditMode,
  onMeshEditToolbarAction,
  onInvertSelectionNormals,
  onLowerTop,
  onPausePhysics,
  onImportGlb,
  onPlaceEntity,
  onPlaceLight,
  onPlaceBlockoutOpenRoom,
  onPlaceBlockoutPlatform,
  onPlaceBlockoutRoom,
  onPlaceBlockoutStairs,
  onPlaceProp,
  onPlayPhysics,
  onRaiseTop,
  onSelectMaterial,
  onSetMaterialPaintBrushOpacity,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onStartAiModelPlacement,
  onSelectBrushShape,
  onSetMeshEditMode,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onSetToolId,
  onSetTransformMode,
  onSetRenderMode,
  onSetViewMode,
  physicsPlayback,
  renderMode,
  selectedMaterialId,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  selectedGeometry,
  selectedMesh,
  snapEnabled,
  transformMode,
  tools,
  viewMode
}: ToolPaletteProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      <div className="flex items-stretch gap-3">
        <RenderModeControl currentRenderMode={renderMode} onSetRenderMode={onSetRenderMode} />
        <ViewModeControl currentViewMode={viewMode} onSetViewMode={onSetViewMode} />
        <PrimaryToolBar activeToolId={activeToolId} onSetToolId={onSetToolId} tools={tools} />
        <SnapControl currentSnapSize={currentSnapSize} gridSnapValues={gridSnapValues} onSetSnapEnabled={onSetSnapEnabled} onSetSnapSize={onSetSnapSize} snapEnabled={snapEnabled} />
        <PhysicsPlaybackControl mode={physicsPlayback} onPause={onPausePhysics} onPlay={onPlayPhysics} onStop={onStopPhysics} />
      </div>
      <AnimatePresence initial={false}>
        {activeToolId === "brush" ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <CreationToolBar
              activeBrushShape={activeBrushShape}
              aiModelPlacementActive={aiModelPlacementActive}
              activeToolId={activeToolId}
              disabled={physicsPlayback !== "stopped"}
              onImportGlb={onImportGlb}
              onPlaceEntity={onPlaceEntity}
              onPlaceLight={onPlaceLight}
              onPlaceBlockoutOpenRoom={onPlaceBlockoutOpenRoom}
              onPlaceBlockoutPlatform={onPlaceBlockoutPlatform}
              onPlaceBlockoutRoom={onPlaceBlockoutRoom}
              onPlaceBlockoutStairs={onPlaceBlockoutStairs}
              onPlaceProp={onPlaceProp}
              onStartAiModelPlacement={onStartAiModelPlacement}
              onSelectBrushShape={onSelectBrushShape}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {activeToolId === "mesh-edit" ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <MeshEditToolBars
              onArc={() => onMeshEditToolbarAction("arc")}
              onBevel={() => onMeshEditToolbarAction("bevel")}
              onCut={() => onMeshEditToolbarAction("cut")}
              onDelete={() => onMeshEditToolbarAction("delete")}
              onEraseMaterial={() => onMeshEditToolbarAction("erase-material")}
              onExtrude={() => onMeshEditToolbarAction("extrude")}
              meshEditMode={meshEditMode}
              onFillFace={() => onMeshEditToolbarAction("fill-face")}
              onDeflate={() => onMeshEditToolbarAction("deflate")}
              onInflate={() => onMeshEditToolbarAction("inflate")}
              onInvertNormals={() => onMeshEditToolbarAction("invert-normals")}
              onLowerTop={onLowerTop}
              onMerge={() => onMeshEditToolbarAction("merge")}
              onPaintMaterial={() => onMeshEditToolbarAction("paint-material")}
              onRaiseTop={onRaiseTop}
              onSelectMaterial={onSelectMaterial}
              onSetSculptBrushRadius={onSetSculptBrushRadius}
              onSetSculptBrushStrength={onSetSculptBrushStrength}
              onSetMaterialPaintBrushOpacity={onSetMaterialPaintBrushOpacity}
              onSetMeshEditMode={onSetMeshEditMode}
              onSubdivide={() => onMeshEditToolbarAction("subdivide")}
              onSetTransformMode={onSetTransformMode}
              materialPaintBrushOpacity={materialPaintBrushOpacity}
              materialPaintMode={materialPaintMode}
              materials={materials}
              sculptMode={sculptMode}
              sculptBrushRadius={sculptBrushRadius}
              sculptBrushStrength={sculptBrushStrength}
              selectedMaterialId={selectedMaterialId}
              selectedGeometry={selectedGeometry}
              selectedMesh={selectedMesh}
              transformMode={transformMode}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const ToolPalette = memo(ToolPaletteInner, areToolPalettePropsEqual);

function areToolPalettePropsEqual(previous: ToolPaletteProps, next: ToolPaletteProps) {
  return (
    previous.activeBrushShape === next.activeBrushShape &&
    previous.aiModelPlacementActive === next.aiModelPlacementActive &&
    previous.activeToolId === next.activeToolId &&
    previous.currentSnapSize === next.currentSnapSize &&
    previous.gridSnapValues === next.gridSnapValues &&
    previous.materialPaintBrushOpacity === next.materialPaintBrushOpacity &&
    previous.materialPaintMode === next.materialPaintMode &&
    previous.materials === next.materials &&
    previous.meshEditMode === next.meshEditMode &&
    previous.physicsPlayback === next.physicsPlayback &&
    previous.renderMode === next.renderMode &&
    previous.selectedMaterialId === next.selectedMaterialId &&
    previous.sculptMode === next.sculptMode &&
    previous.sculptBrushRadius === next.sculptBrushRadius &&
    previous.sculptBrushStrength === next.sculptBrushStrength &&
    previous.selectedGeometry === next.selectedGeometry &&
    previous.selectedMesh === next.selectedMesh &&
    previous.snapEnabled === next.snapEnabled &&
    previous.tools === next.tools &&
    previous.transformMode === next.transformMode &&
    previous.viewMode === next.viewMode
  );
}
