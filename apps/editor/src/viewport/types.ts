import type { EdgeBevelProfile } from "@web-hammer/geometry-kernel";
import type { DerivedRenderScene, ViewportState } from "@web-hammer/render-pipeline";
import type { Brush, EditableMesh, GeometryNode, Transform, Vec3 } from "@web-hammer/shared";
import type { ToolId } from "@web-hammer/tool-system";
import type { BrushExtrudeHandle, MeshEditMode, MeshExtrudeHandle } from "@/viewport/editing";
import type { Plane, Vector2 } from "three";

export type MeshEditToolbarAction =
  | "bevel"
  | "cut"
  | "delete"
  | "extrude"
  | "fill-face"
  | "invert-normals"
  | "merge"
  | "subdivide";

export type MeshEditToolbarActionRequest = {
  id: number;
  kind: MeshEditToolbarAction;
};

export type ViewportCanvasProps = {
  activeToolId: ToolId;
  meshEditMode: MeshEditMode;
  meshEditToolbarAction?: MeshEditToolbarActionRequest;
  onClearSelection: () => void;
  onCommitMeshTopology: (nodeId: string, mesh: EditableMesh) => void;
  onFocusNode: (nodeId: string) => void;
  onPlaceAsset: (position: { x: number; y: number; z: number }) => void;
  onPlaceBrush: (brush: Brush, transform: Transform) => void;
  onPreviewBrushData: (nodeId: string, brush: Brush) => void;
  onPreviewMeshData: (nodeId: string, mesh: EditableMesh) => void;
  onPreviewNodeTransform: (nodeId: string, transform: Transform) => void;
  onSelectMaterialFaces: (faceIds: string[]) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSplitBrushAtCoordinate: (nodeId: string, axis: "x" | "y" | "z", coordinate: number) => void;
  onUpdateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  onUpdateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
  renderScene: DerivedRenderScene;
  selectedNode?: GeometryNode;
  selectedNodeIds: string[];
  selectedNodes: GeometryNode[];
  transformMode: "rotate" | "scale" | "translate";
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

export type BrushCreateState =
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      currentPoint: Vec3;
      stage: "base";
    }
  | {
      anchor: Vec3;
      basis: BrushCreateBasis;
      depth: number;
      dragPlane: Plane;
      height: number;
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

export type FaceSubdivisionState = {
  baseMesh: EditableMesh;
  cuts: number;
  faceId: string;
  previewMesh: EditableMesh;
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
      axisLock?: "x" | "y" | "z";
      baseBrush: Brush;
      baseMesh: EditableMesh;
      dragPlane: Plane;
      handle: MeshExtrudeHandle;
      kind: "brush-mesh";
      nodeId: string;
      normal: Vec3;
      previewMesh: EditableMesh;
      startPoint: Vec3;
    }
  | {
      amount: number;
      axisLock?: "x" | "y" | "z";
      baseMesh: EditableMesh;
      dragPlane: Plane;
      handle: MeshExtrudeHandle;
      kind: "mesh";
      nodeId: string;
      normal: Vec3;
      previewMesh: EditableMesh;
      startPoint: Vec3;
    };
