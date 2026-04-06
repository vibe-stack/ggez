export type PreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clampPreviewRect(rect: PreviewRect, bounds: { width: number; height: number }): PreviewRect {
  const width = Math.min(Math.max(rect.width, 360), Math.max(bounds.width - 32, 360));
  const height = Math.min(Math.max(rect.height, 280), Math.max(bounds.height - 32, 280));

  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 16), Math.max(bounds.width - width - 16, 16)),
    y: Math.min(Math.max(rect.y, 16), Math.max(bounds.height - height - 16, 16))
  };
}
