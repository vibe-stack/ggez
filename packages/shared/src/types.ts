export type NodeID = string;
export type EntityID = string;
export type MaterialID = string;
export type AssetID = string;
export type LayerID = string;
export type FaceID = string;
export type VertexID = string;
export type HalfEdgeID = string;

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Vec2 = {
  x: number;
  y: number;
};

export type Transform = {
  position: Vec3;
  pivot?: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type Plane = {
  normal: Vec3;
  distance: number;
};

export type Face = {
  id: FaceID;
  plane: Plane;
  vertexIds: VertexID[];
  materialId?: MaterialID;
  uvScale?: Vec2;
};

export type Brush = {
  planes: Plane[];
  faces: Face[];
  previewSize: Vec3;
};

export type EditableMeshVertex = {
  id: VertexID;
  position: Vec3;
};

export type EditableMeshHalfEdge = {
  id: HalfEdgeID;
  vertex: VertexID;
  twin?: HalfEdgeID;
  next?: HalfEdgeID;
  face?: FaceID;
};

export type EditableMeshFace = {
  id: FaceID;
  halfEdge: HalfEdgeID;
  materialId?: MaterialID;
  uvScale?: Vec2;
};

export type EditableMesh = {
  vertices: EditableMeshVertex[];
  halfEdges: EditableMeshHalfEdge[];
  faces: EditableMeshFace[];
};

export type ModelReference = {
  assetId: AssetID;
  path: string;
};

export type GeometryNodeBase = {
  id: NodeID;
  name: string;
  transform: Transform;
};

export type BrushNode = GeometryNodeBase & {
  kind: "brush";
  data: Brush;
};

export type MeshNode = GeometryNodeBase & {
  kind: "mesh";
  data: EditableMesh;
};

export type ModelNode = GeometryNodeBase & {
  kind: "model";
  data: ModelReference;
};

export type GeometryNode = BrushNode | MeshNode | ModelNode;

export type Asset = {
  id: AssetID;
  type: "model" | "material" | "prefab";
  path: string;
  metadata: Record<string, string | number | boolean>;
};

export type MaterialCategory = "blockout" | "custom" | "flat";

export type Material = {
  id: MaterialID;
  name: string;
  category?: MaterialCategory;
  color: string;
  colorTexture?: string;
  edgeColor?: string;
  edgeThickness?: number;
  metalness?: number;
  metalnessTexture?: string;
  normalTexture?: string;
  path?: string;
  roughness?: number;
  roughnessTexture?: string;
};

export type Layer = {
  id: LayerID;
  name: string;
  visible: boolean;
  locked: boolean;
};

export type Entity = {
  id: EntityID;
  type: string;
  transform: Transform;
  properties: Record<string, string | number | boolean>;
};
