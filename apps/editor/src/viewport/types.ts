import type { EdgeBevelProfile } from "@ggez/geometry-kernel";
import type { DerivedRenderScene, ViewportState } from "@ggez/render-pipeline";
import type {
  BrushShape,
  Brush,
  EditableMesh,
  Entity,
  GeometryNode,
  PrimitiveNodeData,
  SceneSettings,
  Transform,
  Vec3
} from "@ggez/shared";
import type { ToolId } from "@ggez/tool-system";
import type { BrushExtrudeHandle, MeshEditMode, MeshExtrudeHandle } from "@/viewport/editing";
import type { ConstructionPlane, ViewportPaneId, ViewportRenderMode } from "@/viewport/viewports";
import type { Plane, Vector2 } from "three";

export type MeshEditToolbarAction =
  | "arc"
  | "bevel"
  | "cut"
  | "delete"
  | "extrude"
  | "fill-face"
  | "inflate"
  | "invert-normals"
  | "merge"
  | "deflate"
  | "subdivide";

export type MeshEditToolbarActionRequest = {
  id: number;
  kind: MeshEditToolbarAction;
};

export type ViewportCanvasProps = {
  activeBrushShape: BrushShape;
  aiModelPlacementArmed: boolean;
  activeToolId: ToolId;
  dprScale: number;
  hiddenSceneItemIds?: string[];
  isActiveViewport: boolean;
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  onActivateViewport: (viewportId: ViewportPaneId) => void;
  onClearSelection: () => void;
  onCommitMeshTopology: (nodeId: string, mesh: EditableMesh) => void;
  onFocusNode: (nodeId: string) => void;
  onPlaceAsset: (position: { x: number; y: number; z: number }) => void;
  onPlaceAiModelPlaceholder: (position: Vec3) => void;
  onPlaceBrush: (brush: Brush, transform: Transform) => void;
  onPlaceMeshNode: (mesh: EditableMesh, transform: Transform, name: string) => void;
  onPlacePrimitiveNode: (data: PrimitiveNodeData, transform: Transform, name: string) => void;
  onPreviewBrushData: (nodeId: string, brush: Brush) => void;
  onPreviewEntityTransform: (entityId: string, transform: Transform) => void;
  onPreviewMeshData: (nodeId: string, mesh: EditableMesh) => void;
  onPreviewNodeTransform: (nodeId: string, transform: Transform) => void;
  onSculptModeChange: (mode: "deflate" | "inflate" | null) => void;
  onSelectScenePath: (pathId: string | undefined) => void;
  onSelectMaterialFaces: (faceIds: string[]) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSetToolId: (toolId: ToolId) => void;
  onSplitBrushAtCoordinate: (nodeId: string, axis: "x" | "y" | "z", coordinate: number) => void;
  onUpdateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
  onUpdateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  onViewportChange: (viewportId: ViewportPaneId, viewport: ViewportState) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderScene: DerivedRenderScene;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selectedScenePathId?: string;
  selectedEntity?: Entity;
  selectedNode?: GeometryNode;
  selectedNodeIds: string[];
  selectedNodes: GeometryNode[];
  transformMode: "rotate" | "scale" | "translate";
  viewportId: ViewportPaneId;
  viewportPlane: ConstructionPlane;
  viewport: ViewportState;
};

export type MarqueeState = {
  active: boolean;
  current: Vector2;
  origin: Vector2;
};

export type BrushCreateBasis = {
  normal: Vec3;
  u: Vec3;
  v: Vec3;
};

export type BrushCreatePlacement =
  | {
      brush: Brush;
      kind: "brush";
      transform: Transform;
    }
  | {
      kind: "mesh";
      mesh: EditableMesh;
      name: string;
      transform: Transform;
    }
  | {
      kind: "primitive";
      name: string;
      primitive: PrimitiveNodeData;
      transform: Transform;
    };

export type BrushCreateState =
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      shape: "cube";
      stage: "base";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      shape: "plane";
      stage: "base";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      depth: number;
      dragPlane: Plane;
      height: number;
      shape: "cube";
      stage: "height";
      startPoint: Vec3;
      width: number;
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      radius: number;
      shape: "sphere";
      stage: "radius";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      radius: number;
      shape: "cone" | "cylinder";
      stage: "base";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      dragPlane: Plane;
      height: number;
      radius: number;
      shape: "cone" | "cylinder";
      stage: "height";
      startPoint: Vec3;
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      points: Vec3[];
      shape: "custom-polygon";
      stage: "outline";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      dragPlane: Plane;
      height: number;
      points: Vec3[];
      shape: "custom-polygon";
      stage: "height";
      startPoint: Vec3;
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      rotationSteps: number;
      shape: "stairs";
      stage: "base";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      depth: number;
      dragPlane: Plane;
      height: number;
      rotationSteps: number;
      shape: "stairs";
      stage: "height";
      startPoint: Vec3;
      stepCount: number;
      width: number;
    }
  | {
      anchor: Vec3;
      arcSegments: number;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      shape: "ramp";
      stage: "base";
    }
  | {
      anchor: Vec3;
      arcSegments: number;
      basis: BrushCreateBasis;
      depth: number;
      dragPlane: Plane;
      height: number;
      shape: "ramp";
      stage: "height";
      startPoint: Vec3;
      width: number;
    };

export type BevelState = {
  baseMesh: EditableMesh;
  dragDirection: Vec3;
  dragPlane: Plane;
  edges: Array<[string, string]>;
  profile: EdgeBevelProfile;
  previewMesh: EditableMesh;
  startPoint: Vec3;
  steps: number;
  width: number;
};

export type ArcState = {
  baseMesh: EditableMesh;
  dragDirection: Vec3;
  dragPlane: Plane;
  edges: Array<[string, string]>;
  offset: number;
  previewMesh: EditableMesh;
  segments: number;
  startPoint: Vec3;
};

export type FaceSubdivisionState = {
  baseMesh: EditableMesh;
  cuts: number;
  faceId: string;
};

export type LastMeshEditAction =
  | {
      amount: number;
      direction?: Vec3;
      handleKind: "edge" | "face";
      kind: "extrude";
    }
  | {
      kind: "subobject-transform";
      mode: MeshEditMode;
      rotationDelta: Vec3;
      scaleFactor: Vec3;
      translation: Vec3;
    };

export type ExtrudeGestureState =
  | {
      amount: number;
  amountSign: 1 | -1;
      axisLock?: "x" | "y" | "z";
      baseBrush: Brush;
      dragPlane: Plane;
      handle: BrushExtrudeHandle;
      kind: "brush";
      nodeId: string;
      normal: Vec3;
      previewBrush: Brush;
      startPoint: Vec3;
    }
  | {
      amount: number;
      amountSign: 1 | -1;
      axisLock?: "x" | "y" | "z";
      baseBrush: Brush;
      baseMesh: EditableMesh;
      dragPlane: Plane;
      faceIds?: string[];
      handle: MeshExtrudeHandle;
      kind: "brush-mesh";
      nodeId: string;
      normal: Vec3;
      previewMesh: EditableMesh;
      startPoint: Vec3;
    }
  | {
      amount: number;
      amountSign: 1 | -1;
      axisLock?: "x" | "y" | "z";
      baseMesh: EditableMesh;
      dragPlane: Plane;
      faceIds?: string[];
      handle: MeshExtrudeHandle;
      kind: "mesh";
      nodeId: string;
      normal: Vec3;
      previewMesh: EditableMesh;
      startPoint: Vec3;
    };
