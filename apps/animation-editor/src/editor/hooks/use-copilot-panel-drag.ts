import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampFloatingPanelPosition,
  COPILOT_PANEL_DEFAULT_X_OFFSET,
  COPILOT_PANEL_DEFAULT_Y_OFFSET,
  COPILOT_PANEL_FALLBACK_HEIGHT,
  COPILOT_PANEL_FALLBACK_WIDTH,
  type FloatingPanelPosition,
} from "../workspace/floating-panel-utils";

export type UseCopilotPanelDragResult = {
  copilotPosition: FloatingPanelPosition | null;
  beginCopilotDrag: (event: ReactPointerEvent) => void;
  updateCopilotBounds: () => void;
};

export function useCopilotPanelDrag(
  workspaceRef: React.RefObject<HTMLDivElement | null>,
  copilotPanelRef: React.RefObject<HTMLDivElement | null>,
  copilotOpen: boolean
): UseCopilotPanelDragResult {
  const [copilotPosition, setCopilotPosition] = useState<FloatingPanelPosition | null>(null);
  const copilotDragRef = useRef<{
    pointerX: number;
    pointerY: number;
    position: FloatingPanelPosition;
  } | null>(null);

  const updateCopilotBounds = useCallback(() => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const panelBounds = copilotPanelRef.current?.getBoundingClientRect();
    const panelSize = {
      width: panelBounds?.width ?? COPILOT_PANEL_FALLBACK_WIDTH,
      height: panelBounds?.height ?? COPILOT_PANEL_FALLBACK_HEIGHT,
    };

    setCopilotPosition((current) => {
      const nextPosition =
        current ?? {
          x: Math.max(bounds.width - panelSize.width - COPILOT_PANEL_DEFAULT_X_OFFSET, 16),
          y: COPILOT_PANEL_DEFAULT_Y_OFFSET,
        };

      return clampFloatingPanelPosition(nextPosition, panelSize, { width: bounds.width, height: bounds.height });
    });
  }, [workspaceRef, copilotPanelRef]);

  useEffect(() => {
    if (!copilotOpen) {
      return;
    }

    updateCopilotBounds();
  }, [copilotOpen, updateCopilotBounds]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = copilotDragRef.current;
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!interaction || !bounds) {
        return;
      }

      const panelBounds = copilotPanelRef.current?.getBoundingClientRect();
      const panelSize = {
        width: panelBounds?.width ?? COPILOT_PANEL_FALLBACK_WIDTH,
        height: panelBounds?.height ?? COPILOT_PANEL_FALLBACK_HEIGHT,
      };
      const deltaX = event.clientX - interaction.pointerX;
      const deltaY = event.clientY - interaction.pointerY;

      setCopilotPosition(
        clampFloatingPanelPosition(
          { x: interaction.position.x + deltaX, y: interaction.position.y + deltaY },
          panelSize,
          { width: bounds.width, height: bounds.height }
        )
      );
    }

    function handlePointerUp() {
      copilotDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [workspaceRef, copilotPanelRef]);

  function beginCopilotDrag(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }

    const bounds = workspaceRef.current?.getBoundingClientRect();
    const panelBounds = copilotPanelRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fallbackPosition = {
      x: Math.max(bounds.width - (panelBounds?.width ?? COPILOT_PANEL_FALLBACK_WIDTH) - COPILOT_PANEL_DEFAULT_X_OFFSET, 16),
      y: COPILOT_PANEL_DEFAULT_Y_OFFSET,
    };

    copilotDragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      position: copilotPosition ?? fallbackPosition,
    };
  }

  return { copilotPosition, beginCopilotDrag, updateCopilotBounds };
}
