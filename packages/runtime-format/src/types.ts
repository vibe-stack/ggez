import type {
  Asset,
  BrushNode,
  Entity,
  GroupNode,
  InstancingNode,
  Layer,
  LightNode,
  MaterialRenderSide,
  MeshNode,
  ModelNode,
  PropPhysics,
  PrimitiveNode,
  SceneSettings
} from "@ggez/shared";

export const RUNTIME_SCENE_FORMAT = "web-hammer-engine" as const;
export const CURRENT_RUNTIME_SCENE_VERSION = 6 as const;
export const MIN_RUNTIME_SCENE_VERSION = 4 as const;
export const CURRENT_RUNTIME_WORLD_INDEX_VERSION = 1 as const;

export type RuntimeMaterial = {
  baseColorTexture?: string;
  color: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
  id: string;
  metallicFactor: number;
  metallicRoughnessTexture?: string;
  name: string;
  normalTexture?: string;
  opacity?: number;
  roughnessFactor: number;
  side?: MaterialRenderSide;
  transparent?: boolean;
};

export type RuntimePrimitive = {
  indices: number[];
  material: RuntimeMaterial;
  normals: number[];
  positions: number[];
  uvs: number[];
};

export type RuntimeGeometry = {
  primitives: RuntimePrimitive[];
};

export type RuntimeLodLevel = "mid" | "low";

export type RuntimeGeometryLod = {
  geometry: RuntimeGeometry;
  level: RuntimeLodLevel;
};

export type RuntimeModelLod = {
  assetId: string;
  level: RuntimeLodLevel;
};

export type RuntimeGeometryNode =
  | (BrushNode & { geometry: RuntimeGeometry; lods?: RuntimeGeometryLod[] })
  | (MeshNode & { geometry: RuntimeGeometry; lods?: RuntimeGeometryLod[] })
  | (PrimitiveNode & { geometry: RuntimeGeometry; lods?: RuntimeGeometryLod[] });

export type RuntimeModelNode = ModelNode & {
  lods?: RuntimeModelLod[];
};

export type RuntimeInstancingNode = InstancingNode;

export type RuntimeNode = GroupNode | RuntimeGeometryNode | RuntimeModelNode | RuntimeInstancingNode | LightNode;

export type RuntimeSceneMetadata = {
  exportedAt: string;
  format: typeof RUNTIME_SCENE_FORMAT;
  version: number;
};

export type RuntimeScene = {
  assets: Asset[];
  entities: Entity[];
  layers: Layer[];
  materials: RuntimeMaterial[];
  metadata: RuntimeSceneMetadata;
  nodes: RuntimeNode[];
  settings: SceneSettings;
};

export type RuntimeBundleFile = {
  bytes: Uint8Array;
  mimeType: string;
  path: string;
};

export type RuntimeBundle = {
  files: RuntimeBundleFile[];
  manifest: RuntimeScene;
};

export type RuntimePhysicsDescriptor = {
  node: RuntimeNode;
  nodeId: string;
  physics: PropPhysics;
};

export type RuntimeWorldChunk = {
  bounds: [number, number, number, number, number, number];
  bundleUrl?: string;
  id: string;
  loadDistance?: number;
  manifestUrl?: string;
  tags?: string[];
  unloadDistance?: number;
};

export type RuntimeSharedAssetPack = {
  baseUrl: string;
  id: string;
};

export type RuntimeWorldIndex = {
  chunks: RuntimeWorldChunk[];
  sharedAssets?: RuntimeSharedAssetPack[];
  version: number;
};

export type RuntimeAudioDescriptor = {
  autoPlay: boolean;
  channel: string;
  clip: string;
  distanceModel: string;
  hookId: string;
  loop: boolean;
  maxDistance: number;
  pitch: number;
  position?: { x: number; y: number; z: number };
  refDistance: number;
  rolloffFactor: number;
  spatial: boolean;
  stopEvent?: string;
  targetId: string;
  triggerEvent?: string;
  volume: number;
};

export type WebHammerExportMaterial = RuntimeMaterial;
export type WebHammerExportPrimitive = RuntimePrimitive;
export type WebHammerExportGeometry = RuntimeGeometry;
export type WebHammerLodLevel = RuntimeLodLevel;
export type WebHammerExportGeometryLod = RuntimeGeometryLod;
export type WebHammerExportModelLod = RuntimeModelLod;
export type WebHammerEngineGeometryNode = RuntimeGeometryNode;
export type WebHammerEngineModelNode = RuntimeModelNode;
export type WebHammerEngineInstancingNode = RuntimeInstancingNode;
export type WebHammerEngineNode = RuntimeNode;
export type WebHammerEngineSceneMetadata = RuntimeSceneMetadata;
export type WebHammerEngineScene = RuntimeScene;
export type WebHammerEngineBundleFile = RuntimeBundleFile;
export type WebHammerEngineBundle = RuntimeBundle;
export type WebHammerRuntimePhysicsDescriptor = RuntimePhysicsDescriptor;
