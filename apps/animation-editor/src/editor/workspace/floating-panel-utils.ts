export type PreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FloatingPanelPosition = {
  x: number;
  y: number;
};

export const COPILOT_PANEL_DEFAULT_X_OFFSET = 16;
export const COPILOT_PANEL_DEFAULT_Y_OFFSET = 48;
export const COPILOT_PANEL_FALLBACK_WIDTH = 352;
export const COPILOT_PANEL_FALLBACK_HEIGHT = 560;

export function clampPreviewRect(rect: PreviewRect, bounds: { width: number; height: number }): PreviewRect {
  const width = Math.min(Math.max(rect.width, 360), Math.max(bounds.width - 32, 360));
  const height = Math.min(Math.max(rect.height, 280), Math.max(bounds.height - 32, 280));

  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 16), Math.max(bounds.width - width - 16, 16)),
    y: Math.min(Math.max(rect.y, 16), Math.max(bounds.height - height - 16, 16)),
  };
}

export function clampFloatingPanelPosition(
  position: FloatingPanelPosition,
  panelSize: { width: number; height: number },
  bounds: { width: number; height: number }
): FloatingPanelPosition {
  return {
    x: Math.min(Math.max(position.x, 16), Math.max(bounds.width - panelSize.width - 16, 16)),
    y: Math.min(Math.max(position.y, 16), Math.max(bounds.height - panelSize.height - 16, 16)),
  };
}
