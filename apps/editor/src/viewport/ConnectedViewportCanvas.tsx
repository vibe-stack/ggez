import { memo } from "react";
import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import { useViewportCanvasBindings } from "@/viewport/hooks/useViewportCanvasBindings";
import type { ConnectedViewportCanvasProps } from "@/viewport/types";

function ConnectedViewportCanvasComponent(props: ConnectedViewportCanvasProps) {
  const bindings = useViewportCanvasBindings(props.viewportId);

  return <ViewportCanvas {...bindings} {...props} />;
}

export const ConnectedViewportCanvas = memo(ConnectedViewportCanvasComponent, (previous, next) => {
  return (
    previous.renderScene === next.renderScene &&
    previous.sceneSettings === next.sceneSettings &&
    previous.selectedEntity === next.selectedEntity &&
    previous.selectedNode === next.selectedNode &&
    previous.instanceBrushSourceTransform === next.instanceBrushSourceTransform &&
    previous.viewportId === next.viewportId &&
    previous.viewportPlane === next.viewportPlane &&
    haveSameStringArray(previous.hiddenSceneItemIds, next.hiddenSceneItemIds) &&
    haveSameStringArray(previous.selectedNodeIds, next.selectedNodeIds) &&
    haveSameNodeArray(previous.selectedNodes, next.selectedNodes)
  );
});

function haveSameStringArray(previous: string[] | undefined, next: string[] | undefined) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next || previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }

  return true;
}

function haveSameNodeArray(
  previous: ConnectedViewportCanvasProps["selectedNodes"],
  next: ConnectedViewportCanvasProps["selectedNodes"]
) {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }

  return true;
}
