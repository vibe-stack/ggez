import { proxy } from "valtio";
import type { ViewportState } from "@web-hammer/render-pipeline";
import { createEditorViewports, type ViewModeId, type ViewportPaneId } from "@/viewport/viewports";

export type ViewportQuality = 0.5 | 0.75 | 1 | 1.5;

type UiStore = {
  activeViewportId: ViewportPaneId;
  rightPanel: "inspector" | "materials" | "scene";
  selectedAssetId: string;
  selectedMaterialId: string;
  viewMode: ViewModeId;
  viewportQuality: ViewportQuality;
  viewports: Record<ViewportPaneId, ViewportState>;
};

export const uiStore = proxy<UiStore>({
  activeViewportId: "perspective",
  rightPanel: "scene",
  selectedAssetId: "asset:model:crate",
  selectedMaterialId: "material:blockout:orange",
  viewMode: "3d-only",
  viewportQuality: 0.5,
  viewports: createEditorViewports()
});
