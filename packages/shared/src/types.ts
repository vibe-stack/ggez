export type NodeID = string;
export type EntityID = string;
export type MaterialID = string;
export type AssetID = string;
export type LayerID = string;
export type FaceID = string;
export type VertexID = string;
export type HalfEdgeID = string;
export type PrimitiveShape = "cone" | "cube" | "cylinder" | "sphere";
export type PrimitiveRole = "brush" | "prop";
export type PropBodyType = "dynamic" | "fixed" | "kinematicPosition";
export type PropColliderShape = "ball" | "cone" | "cuboid" | "cylinder" | "trimesh";
export type LightType = "ambient" | "directional" | "hemisphere" | "point" | "spot";
export type EntityType = "npc-spawn" | "player-spawn" | "smart-object";
export type PlayerCameraMode = "fps" | "third-person" | "top-down";

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
  uvOffset?: Vec2;
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
  uvOffset?: Vec2;
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

export type PropPhysics = {
  angularDamping: number;
  bodyType: PropBodyType;
  canSleep: boolean;
  ccd: boolean;
  colliderShape: PropColliderShape;
  contactSkin: number;
  density?: number;
  enabled: boolean;
  friction: number;
  gravityScale: number;
  linearDamping: number;
  lockRotations: boolean;
  lockTranslations: boolean;
  mass?: number;
  restitution: number;
  sensor: boolean;
};

export type PrimitiveNodeData = {
  materialId?: MaterialID;
  physics?: PropPhysics;
  radialSegments?: number;
  role: PrimitiveRole;
  shape: PrimitiveShape;
  size: Vec3;
  uvScale?: Vec2;
};

export type LightNodeData = {
  angle?: number;
  castShadow: boolean;
  color: string;
  decay?: number;
  distance?: number;
  enabled: boolean;
  groundColor?: string;
  intensity: number;
  penumbra?: number;
  target?: Vec3;
  type: LightType;
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

export type PrimitiveNode = GeometryNodeBase & {
  kind: "primitive";
  data: PrimitiveNodeData;
};

export type LightNode = GeometryNodeBase & {
  kind: "light";
  data: LightNodeData;
};

export type GeometryNode = BrushNode | MeshNode | ModelNode | PrimitiveNode | LightNode;

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
  name: string;
  type: EntityType;
  transform: Transform;
  properties: Record<string, string | number | boolean>;
};

export type PlayerSettings = {
  cameraMode: PlayerCameraMode;
  canCrouch: boolean;
  canJump: boolean;
  canRun: boolean;
  crouchHeight: number;
  height: number;
  jumpHeight: number;
  movementSpeed: number;
  runningSpeed: number;
};

export type WorldSettings = {
  ambientColor: string;
  ambientIntensity: number;
  gravity: Vec3;
  physicsEnabled: boolean;
};

export type SceneSettings = {
  player: PlayerSettings;
  world: WorldSettings;
};
