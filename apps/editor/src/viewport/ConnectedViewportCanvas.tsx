import { ViewportCanvas } from "@/viewport/ViewportCanvas";
import { useViewportCanvasBindings } from "@/viewport/hooks/useViewportCanvasBindings";
import type { ConnectedViewportCanvasProps } from "@/viewport/types";

export function ConnectedViewportCanvas(props: ConnectedViewportCanvasProps) {
  const bindings = useViewportCanvasBindings(props.viewportId);

  return <ViewportCanvas {...bindings} {...props} />;
}
