import type { GridSnapValue } from "@web-hammer/render-pipeline";
import type { EntityType, LightType, PrimitiveShape } from "@web-hammer/shared";
import type { ToolId } from "@web-hammer/tool-system";
import { AnimatePresence, motion } from "motion/react";
import { CreationToolBar } from "@/components/editor-shell/CreationToolBar";
import { MeshEditToolBars } from "@/components/editor-shell/MeshEditToolBars";
import { PhysicsPlaybackControl } from "@/components/editor-shell/PhysicsPlaybackControl";
import { PrimaryToolBar } from "@/components/editor-shell/PrimaryToolBar";
import { SnapControl } from "@/components/editor-shell/SnapControl";
import { ViewModeControl } from "@/components/editor-shell/ViewModeControl";
import type { MeshEditMode } from "@/viewport/editing";
import type { ViewModeId } from "@/viewport/viewports";

type ToolPaletteProps = {
  activeBrushShape: PrimitiveShape;
  activeToolId: ToolId;
  currentSnapSize: GridSnapValue;
  gridSnapValues: readonly GridSnapValue[];
  meshEditMode: MeshEditMode;
  onMeshEditToolbarAction: (action: "arc" | "bevel" | "cut" | "delete" | "extrude" | "fill-face" | "invert-normals" | "merge" | "subdivide") => void;
  onInvertSelectionNormals: () => void;
  onLowerTop: () => void;
  onPausePhysics: () => void;
  onMeshInflate: (factor: number) => void;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onPlayPhysics: () => void;
  onRaiseTop: () => void;
  onSelectBrushShape: (shape: PrimitiveShape) => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetSnapEnabled: (enabled: boolean) => void;
  onSetSnapSize: (snapSize: GridSnapValue) => void;
  onStopPhysics: () => void;
  onSetToolId: (toolId: ToolId) => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onSetViewMode: (viewMode: ViewModeId) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  selectedGeometry: boolean;
  selectedMesh: boolean;
  snapEnabled: boolean;
  tools: Array<{ id: ToolId; label: string }>;
  transformMode: "rotate" | "scale" | "translate";
  viewMode: ViewModeId;
};

export function ToolPalette({
  activeBrushShape,
  activeToolId,
  currentSnapSize,
  gridSnapValues,
  meshEditMode,
  onMeshEditToolbarAction,
  onInvertSelectionNormals,
  onLowerTop,
  onPausePhysics,
  onMeshInflate,
  onPlaceEntity,
  onPlaceLight,
  onPlaceProp,
  onPlayPhysics,
  onRaiseTop,
  onSelectBrushShape,
  onSetMeshEditMode,
  onSetSnapEnabled,
  onSetSnapSize,
  onStopPhysics,
  onSetToolId,
  onSetTransformMode,
  onSetViewMode,
  physicsPlayback,
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
              activeToolId={activeToolId}
              disabled={physicsPlayback !== "stopped"}
              onPlaceEntity={onPlaceEntity}
              onPlaceLight={onPlaceLight}
              onPlaceProp={onPlaceProp}
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
              onExtrude={() => onMeshEditToolbarAction("extrude")}
              meshEditMode={meshEditMode}
              onFillFace={() => onMeshEditToolbarAction("fill-face")}
              onDeflate={() => onMeshInflate(0.9)}
              onInflate={() => onMeshInflate(1.1)}
              onInvertNormals={() => onMeshEditToolbarAction("invert-normals")}
              onLowerTop={onLowerTop}
              onMerge={() => onMeshEditToolbarAction("merge")}
              onRaiseTop={onRaiseTop}
              onSetMeshEditMode={onSetMeshEditMode}
              onSubdivide={() => onMeshEditToolbarAction("subdivide")}
              onSetTransformMode={onSetTransformMode}
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
