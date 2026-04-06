import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type FloatingPanelPosition = {
  x: number;
  y: number;
};

const PANEL_DEFAULT_X_OFFSET = 16;
const PANEL_DEFAULT_Y_OFFSET = 56;
const PANEL_FALLBACK_WIDTH = 380;
const PANEL_FALLBACK_HEIGHT = 640;

function clampPosition(
  position: FloatingPanelPosition,
  panelSize: { width: number; height: number },
  bounds: { width: number; height: number }
): FloatingPanelPosition {
  return {
    x: Math.min(Math.max(position.x, 16), Math.max(bounds.width - panelSize.width - 16, 16)),
    y: Math.min(Math.max(position.y, 16), Math.max(bounds.height - panelSize.height - 16, 16))
  };
}

export function useCopilotPanelDrag(
  workspaceRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  open: boolean
) {
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);
  const dragRef = useRef<{
    pointerX: number;
    pointerY: number;
    position: FloatingPanelPosition;
  } | null>(null);

  const updateBounds = useCallback(() => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const panelBounds = panelRef.current?.getBoundingClientRect();
    const panelSize = {
      width: panelBounds?.width ?? PANEL_FALLBACK_WIDTH,
      height: panelBounds?.height ?? PANEL_FALLBACK_HEIGHT
    };

    setPosition((current) => {
      const nextPosition = current ?? {
        x: Math.max(bounds.width - panelSize.width - PANEL_DEFAULT_X_OFFSET, 16),
        y: PANEL_DEFAULT_Y_OFFSET
      };
      return clampPosition(nextPosition, panelSize, { width: bounds.width, height: bounds.height });
    });
  }, [panelRef, workspaceRef]);

  useEffect(() => {
    if (!open) {
      return;
    }
    updateBounds();
  }, [open, updateBounds]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = dragRef.current;
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!interaction || !bounds) {
        return;
      }

      const panelBounds = panelRef.current?.getBoundingClientRect();
      const panelSize = {
        width: panelBounds?.width ?? PANEL_FALLBACK_WIDTH,
        height: panelBounds?.height ?? PANEL_FALLBACK_HEIGHT
      };

      setPosition(
        clampPosition(
          {
            x: interaction.position.x + (event.clientX - interaction.pointerX),
            y: interaction.position.y + (event.clientY - interaction.pointerY)
          },
          panelSize,
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
  }, [panelRef, workspaceRef]);

  function beginDrag(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }

    const bounds = workspaceRef.current?.getBoundingClientRect();
    const panelBounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      position: position ?? {
        x: Math.max(bounds.width - (panelBounds?.width ?? PANEL_FALLBACK_WIDTH) - PANEL_DEFAULT_X_OFFSET, 16),
        y: PANEL_DEFAULT_Y_OFFSET
      }
    };
  }

  return {
    copilotPosition: position,
    beginCopilotDrag: beginDrag,
    updateCopilotBounds: updateBounds
  };
}