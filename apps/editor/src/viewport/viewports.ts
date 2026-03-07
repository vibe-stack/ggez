import {
  createOrthographicViewportState,
  createViewportState,
  type ViewportState
} from "@web-hammer/render-pipeline";
import { addVec3, subVec3, vec3, type Vec3 } from "@web-hammer/shared";

export type ViewportPaneId = "perspective" | "top" | "front" | "side";
export type ViewModeId = "3d-only" | "split-top" | "split-front" | "split-side" | "quad";
export type ViewportRenderMode = "lit" | "wireframe";
export type ConstructionPlane = "xy" | "xz" | "yz";

export type ViewModePreset =
  | {
      id: "3d-only";
      label: string;
      layout: "single";
      shortLabel: string;
    }
  | {
      id: "split-top" | "split-front" | "split-side";
      label: string;
      layout: "split";
      secondaryPaneId: Exclude<ViewportPaneId, "perspective">;
      shortLabel: string;
    }
  | {
      id: "quad";
      label: string;
      layout: "quad";
      shortLabel: string;
    };

export const viewportPaneIds: ViewportPaneId[] = ["perspective", "top", "front", "side"];

export const viewportPaneDefinitions: Record<
  ViewportPaneId,
  {
    id: ViewportPaneId;
    label: string;
    plane: ConstructionPlane;
    renderMode: ViewportRenderMode;
    shortLabel: string;
  }
> = {
  perspective: {
    id: "perspective",
    label: "3D View",
    plane: "xz",
    renderMode: "lit",
    shortLabel: "3D"
  },
  top: {
    id: "top",
    label: "Top",
    plane: "xz",
    renderMode: "wireframe",
    shortLabel: "Top"
  },
  front: {
    id: "front",
    label: "Front",
    plane: "xy",
    renderMode: "wireframe",
    shortLabel: "Front"
  },
  side: {
    id: "side",
    label: "Side",
    plane: "yz",
    renderMode: "wireframe",
    shortLabel: "Side"
  }
};

export const viewModePresets: ViewModePreset[] = [
  {
    id: "3d-only",
    label: "3D only",
    layout: "single",
    shortLabel: "3D Only"
  },
  {
    id: "split-top",
    label: "2-Split, left 3D, right top",
    layout: "split",
    secondaryPaneId: "top",
    shortLabel: "2-Split Top"
  },
  {
    id: "split-front",
    label: "2-Split, left 3D, right front",
    layout: "split",
    secondaryPaneId: "front",
    shortLabel: "2-Split Front"
  },
  {
    id: "split-side",
    label: "2-Split, left 3D, right side",
    layout: "split",
    secondaryPaneId: "side",
    shortLabel: "2-Split Side"
  },
  {
    id: "quad",
    label: "4-Split, top/front/3D/side",
    layout: "quad",
    shortLabel: "4-Split"
  }
];

export function getViewModePreset(viewModeId: ViewModeId) {
  return viewModePresets.find((preset) => preset.id === viewModeId) ?? viewModePresets[0];
}

export function resolveVisibleViewportPaneIds(viewModeId: ViewModeId): ViewportPaneId[] {
  const preset = getViewModePreset(viewModeId);

  if (preset.layout === "single") {
    return ["perspective"];
  }

  if (preset.layout === "split") {
    return ["perspective", preset.secondaryPaneId];
  }

  return ["perspective", "top", "front", "side"];
}

export function createEditorViewports() {
  return {
    perspective: createViewportState(),
    top: createOrthographicViewportState(
      {
        position: vec3(0, 96, 0),
        target: vec3(0, 0, 0),
        up: vec3(0, 0, -1),
        zoom: 10
      }
    ),
    front: createOrthographicViewportState(
      {
        position: vec3(0, 40, 96),
        target: vec3(0, 40, 0),
        up: vec3(0, 1, 0),
        zoom: 9
      }
    ),
    side: createOrthographicViewportState(
      {
        position: vec3(96, 40, 0),
        target: vec3(0, 40, 0),
        up: vec3(0, 1, 0),
        zoom: 9
      }
    )
  } satisfies Record<ViewportPaneId, ViewportState>;
}

export function focusViewportOnPoint(viewport: ViewportState, point: Vec3) {
  const orbitOffset = subVec3(viewport.camera.position, viewport.camera.target);

  viewport.camera.target = vec3(point.x, point.y, point.z);
  viewport.camera.position = addVec3(point, orbitOffset);
}
