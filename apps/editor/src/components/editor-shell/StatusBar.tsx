import type { GridSnapValue, ViewportState } from "@ggez/render-pipeline";
import type { BrushShape, GeometryNode } from "@ggez/shared";
import type { WorkerJob } from "@ggez/workers";
import { JobStatus } from "@/components/editor-shell/JobStatus";
import type { MeshEditMode } from "@/viewport/editing";
import type { ViewportPaneId } from "@/viewport/viewports";

type StatusBarProps = {
  activeBrushShape: BrushShape;
  activeToolLabel: string;
  activeViewportId: ViewportPaneId;
  gridSnapValues: readonly GridSnapValue[];
  jobs: WorkerJob[];
  meshEditMode: MeshEditMode;
  selectedNode?: GeometryNode;
  viewModeLabel: string;
  viewport: ViewportState;
};

export function StatusBar({
  activeBrushShape,
  activeToolLabel,
  activeViewportId,
  gridSnapValues,
  jobs,
  meshEditMode,
  selectedNode,
  viewModeLabel,
  viewport
}: StatusBarProps) {
  const snapText = viewport.grid.enabled ? `snap ${viewport.grid.snapSize}` : `snap off (${viewport.grid.snapSize})`;
  const focusText = selectedNode
    ? `focus ${selectedNode.name} @ ${selectedNode.transform.position.x}, ${selectedNode.transform.position.y}, ${selectedNode.transform.position.z}`
    : "focus none";
  const interactionHint =
    activeToolLabel === "Brush"
      ? resolveBrushInteractionHint(activeBrushShape)
      : activeToolLabel === "Mesh Edit" && meshEditMode === "vertex"
        ? "click select / Shift-drag marquee / G move / R rotate / S scale / M merge / Shift+F fill"
      : activeToolLabel === "Mesh Edit" && meshEditMode === "edge"
        ? "click select / Shift-drag marquee / A arc / drag radius / wheel segments / K cut / B bevel / M merge"
        : activeToolLabel === "Mesh Edit" && meshEditMode === "face"
          ? "click select / Shift-drag marquee / Delete faces / M merge / N invert normals"
      : "click select / double-click focus / Shift-drag marquee / empty click clear";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-8 items-center justify-between gap-4 overflow-hidden bg-[linear-gradient(180deg,rgba(5,11,10,0),rgba(5,11,10,0.82))] px-4 text-[10px] tracking-[0.06em] text-foreground/55">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span>tool {activeToolLabel.toLowerCase()}</span>
        {activeToolLabel === "Mesh Edit" ? (
          <>
            <span className="text-foreground/25">/</span>
            <span>{meshEditMode} mode</span>
          </>
        ) : null}
      </div>
      <JobStatus jobs={jobs} />
    </div>
  );
}

function resolveBrushInteractionHint(shape: BrushShape) {
  if (shape === "custom-polygon") {
    return "click plane / click points / Enter close / move extrude / click commit / Esc cancel";
  }

  if (shape === "plane") {
    return "click anchor / move for base / click commit / Esc cancel";
  }

  if (shape === "stairs") {
    return "click anchor / move for base / wheel rotate / click lock / move height / wheel steps / click commit / Esc cancel";
  }

  if (shape === "ramp") {
    return "click anchor / move for base / click lock / move for height / wheel arc segments / click commit / Esc cancel";
  }

  if (shape === "sphere") {
    return "click center / move for radius / click commit / Esc cancel";
  }

  if (shape === "cylinder" || shape === "cone") {
    return "click base center / move for radius / click lock / move for height / click commit / Esc cancel";
  }

  return "click anchor / move for base / click lock / move for height / click commit / Esc cancel";
}
