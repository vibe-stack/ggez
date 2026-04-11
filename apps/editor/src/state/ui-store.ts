import { proxy } from "valtio";
import type { ViewportState } from "@ggez/render-pipeline";
import { createEditorViewports, type ViewModeId, type ViewportPaneId, type ViewportRenderMode } from "@/viewport/viewports";

export type ViewportQuality = 0.5 | 0.75 | 1 | 1.5;
export type RightPanelId = "assets" | "events" | "hooks" | "inspector" | "materials" | "player" | "scene" | "world";

type UiStore = {
  activeViewportId: ViewportPaneId;
  copilotPanelOpen: boolean;
  logicViewerOpen: boolean;
  rightPanel: RightPanelId | null;
  renderMode: ViewportRenderMode;
  selectedAssetId: string;
  selectedMaterialId: string;
  viewMode: ViewModeId;
  viewportQuality: ViewportQuality;
  viewports: Record<ViewportPaneId, ViewportState>;
};

export const uiStore = proxy<UiStore>({
  activeViewportId: "perspective",
  copilotPanelOpen: false,
  logicViewerOpen: false,
  rightPanel: null,
  renderMode: "preview",
  selectedAssetId: "",
  selectedMaterialId: "material:blockout:concrete",
  viewMode: "3d-only",
  viewportQuality: 0.5,
  viewports: createEditorViewports()
});
