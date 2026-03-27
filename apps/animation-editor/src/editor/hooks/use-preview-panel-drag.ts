import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clampPreviewRect, type PreviewRect } from "../workspace/floating-panel-utils";

export type UsePreviewPanelDragResult = {
  previewRect: PreviewRect;
  beginPreviewInteraction: (mode: "move" | "resize", event: ReactPointerEvent) => void;
  updatePreviewBounds: () => void;
};

export function usePreviewPanelDrag(workspaceRef: React.RefObject<HTMLDivElement | null>): UsePreviewPanelDragResult {
  const [previewRect, setPreviewRect] = useState<PreviewRect>({ x: 16, y: 16, width: 440, height: 420 });
  const previewDragRef = useRef<{
    mode: "move" | "resize";
    pointerX: number;
    pointerY: number;
    rect: PreviewRect;
  } | null>(null);

  const updatePreviewBounds = useCallback(() => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setPreviewRect((current) => {
      const nextRect =
        current.y === 16 && current.x === 16
          ? { ...current, y: Math.max(bounds.height - current.height - 16, 16) }
          : current;
      return clampPreviewRect(nextRect, { width: bounds.width, height: bounds.height });
    });
  }, [workspaceRef]);

  useEffect(() => {
    updatePreviewBounds();
  }, [updatePreviewBounds]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = previewDragRef.current;
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!interaction || !bounds) {
        return;
      }

      const deltaX = event.clientX - interaction.pointerX;
      const deltaY = event.clientY - interaction.pointerY;

      if (interaction.mode === "move") {
        setPreviewRect(
          clampPreviewRect(
            { ...interaction.rect, x: interaction.rect.x + deltaX, y: interaction.rect.y + deltaY },
            { width: bounds.width, height: bounds.height }
          )
        );
        return;
      }

      setPreviewRect(
        clampPreviewRect(
          { ...interaction.rect, width: interaction.rect.width + deltaX, height: interaction.rect.height + deltaY },
          { width: bounds.width, height: bounds.height }
        )
      );
    }

    function handlePointerUp() {
      previewDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [workspaceRef, previewRect]);

  function beginPreviewInteraction(mode: "move" | "resize", event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    previewDragRef.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rect: previewRect,
    };
  }

  return { previewRect, beginPreviewInteraction, updatePreviewBounds };
}
