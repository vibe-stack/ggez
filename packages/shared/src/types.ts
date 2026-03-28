export type NodeID = string;
export type EntityID = string;
export type MaterialID = string;
export type AssetID = string;
export type LayerID = string;
export type FaceID = string;
export type VertexID = string;
export type HalfEdgeID = string;
export type MetadataValue = string | number | boolean;
export type GameplayValue = string | number | boolean | null | GameplayObject | GameplayValue[];
export type PrimitiveShape = "cone" | "cube" | "cylinder" | "sphere";
export type BrushShape = PrimitiveShape | "custom-polygon" | "plane" | "ramp" | "stairs";
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

export type GameplayObject = {
  [key: string]: GameplayValue;
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
  uvs?: Vec2[];
};

export type EditableMesh = {
  vertices: EditableMeshVertex[];
  halfEdges: EditableMeshHalfEdge[];
  faces: EditableMeshFace[];
  physics?: PropPhysics;
  role?: PrimitiveRole;
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

export type InstancingNodeData = {
  sourceNodeId: NodeID;
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
  hooks?: SceneHook[];
  id: NodeID;
  name: string;
  metadata?: Record<string, MetadataValue>;
  parentId?: NodeID;
  tags?: string[];
  transform: Transform;
};

export type GroupNode = GeometryNodeBase & {
  kind: "group";
  data: Record<string, never>;
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

export type InstancingNode = GeometryNodeBase & {
  kind: "instancing";
  data: InstancingNodeData;
};

export type LightNode = GeometryNodeBase & {
  kind: "light";
  data: LightNodeData;
};

export type GeometryNode = BrushNode | GroupNode | MeshNode | ModelNode | PrimitiveNode | InstancingNode | LightNode;

export type Asset = {
  id: AssetID;
  type: "audio" | "material" | "model" | "prefab";
  path: string;
  metadata: Record<string, MetadataValue>;
};

export type MaterialCategory = "blockout" | "custom" | "flat";

export type MaterialRenderSide = "back" | "double" | "front";

export type TextureKind = "color" | "normal" | "metalness" | "roughness";

export type TextureSource = "ai" | "import" | "upload";

export type TextureRecord = {
  id: string;
  createdAt: string;
  dataUrl: string;
  kind: TextureKind;
  mimeType?: string;
  model?: string;
  name: string;
  prompt?: string;
  size?: number;
  source: TextureSource;
};

export type Material = {
  id: MaterialID;
  name: string;
  category?: MaterialCategory;
  color: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
  opacity?: number;
  side?: MaterialRenderSide;
  transparent?: boolean;
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
  hooks?: SceneHook[];
  id: EntityID;
  name: string;
  parentId?: NodeID;
  type: EntityType;
  transform: Transform;
  properties: Record<string, MetadataValue>;
};

export type SceneHook = {
  config: GameplayObject;
  enabled?: boolean;
  id: string;
  type: string;
};

export type SceneEventDefinition = {
  category?: string;
  custom?: boolean;
  description?: string;
  id: string;
  name: string;
  scope?: "entity-local" | "player" | "world" | "global" | "mission" | "custom";
};

export type ScenePathDefinition = {
  id: string;
  loop?: boolean;
  name: string;
  points: Vec3[];
};

export type PlayerSettings = {
  cameraMode: PlayerCameraMode;
  canCrouch: boolean;
  canInteract: boolean;
  canJump: boolean;
  canRun: boolean;
  crouchHeight: number;
  height: number;
  interactKey: string;
  jumpHeight: number;
  movementSpeed: number;
  runningSpeed: number;
};

export type SceneSkyboxFormat = "hdr" | "image";

export type SceneSkyboxSettings = {
  affectsLighting: boolean;
  blur: number;
  enabled: boolean;
  format: SceneSkyboxFormat;
  intensity: number;
  lightingIntensity: number;
  name: string;
  source: string;
};

export type WorldLodSettings = {
  bakedAt?: string;
  enabled: boolean;
  lowDetailRatio: number;
  midDetailRatio: number;
};

export type WorldSettings = {
  ambientColor: string;
  ambientIntensity: number;
  fogColor: string;
  fogFar: number;
  fogNear: number;
  gravity: Vec3;
  lod: WorldLodSettings;
  physicsEnabled: boolean;
  skybox: SceneSkyboxSettings;
};

export type SceneSettings = {
  events?: SceneEventDefinition[];
  paths?: ScenePathDefinition[];
  player: PlayerSettings;
  world: WorldSettings;
};
