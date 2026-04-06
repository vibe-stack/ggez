import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clampPreviewRect, type PreviewRect } from "../floating-panel-utils";

export type UsePreviewPanelDragResult = {
  previewRect: PreviewRect;
  beginPreviewInteraction: (mode: "move" | "resize", event: ReactPointerEvent) => void;
  updatePreviewBounds: () => void;
};

export function usePreviewPanelDrag(workspaceRef: React.RefObject<HTMLDivElement | null>): UsePreviewPanelDragResult {
  const [previewRect, setPreviewRect] = useState<PreviewRect>({ x: 24, y: 24, width: 480, height: 420 });
  const dragRef = useRef<{
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
        current.x === 24 && current.y === 24
          ? { ...current, x: Math.max(bounds.width - current.width - 24, 24), y: 24 }
          : current;
      return clampPreviewRect(nextRect, { width: bounds.width, height: bounds.height });
    });
  }, [workspaceRef]);

  useEffect(() => {
    updatePreviewBounds();
  }, [updatePreviewBounds]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!drag || !bounds) {
        return;
      }

      const deltaX = event.clientX - drag.pointerX;
      const deltaY = event.clientY - drag.pointerY;

      if (drag.mode === "move") {
        setPreviewRect(
          clampPreviewRect(
            {
              ...drag.rect,
              x: drag.rect.x + deltaX,
              y: drag.rect.y + deltaY
            },
            { width: bounds.width, height: bounds.height }
          )
        );
        return;
      }

      setPreviewRect(
        clampPreviewRect(
          {
            ...drag.rect,
            width: drag.rect.width + deltaX,
            height: drag.rect.height + deltaY
          },
          { width: bounds.width, height: bounds.height }
        )
      );
    }

    function handlePointerUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [workspaceRef]);

  function beginPreviewInteraction(mode: "move" | "resize", event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    dragRef.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rect: previewRect
    };
  }

  return {
    previewRect,
    beginPreviewInteraction,
    updatePreviewBounds
  };
}
