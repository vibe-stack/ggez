import type {
  Asset,
  AssetID,
  EntityID,
  Material,
  MaterialID,
  MetadataValue,
  NodeID,
  TextureRecord,
  Transform,
  Vec3
} from "@ggez/shared";
import type { SceneDocumentSnapshot } from "../document/scene-document";
import type { SelectionMode } from "../selection/selection";

export type DocumentID = string;
export type PartitionID = string;
export type CrossDocumentRefID = string;

export type Bounds3 = {
  max: Vec3;
  min: Vec3;
};

export type WorldNodeHandle = {
  documentId: DocumentID;
  kind: "node";
  nodeId: NodeID;
};

export type WorldEntityHandle = {
  documentId: DocumentID;
  entityId: EntityID;
  kind: "entity";
};

export type WorldSubObjectHandle = {
  documentId: DocumentID;
  kind: "edge" | "face" | "vertex";
  nodeId: NodeID;
  targetId: string;
};

export type WorldDocumentHandle = {
  documentId: DocumentID;
  kind: "document";
};

export type WorldPartitionHandle = {
  kind: "partition";
  partitionId: PartitionID;
};

export type WorldSelectionHandle =
  | WorldDocumentHandle
  | WorldEntityHandle
  | WorldNodeHandle
  | WorldPartitionHandle
  | WorldSubObjectHandle;

export type WorldSelectionSnapshot = {
  handles: WorldSelectionHandle[];
  mode: SelectionMode;
  revision: number;
};

export type Ownership =
  | {
      documentId: DocumentID;
      kind: "document";
      target: "asset" | "entity" | "layer" | "material" | "node" | "settings" | "texture";
    }
  | {
      id: string;
      kind: "shared";
      target: "asset" | "material" | "texture";
    };

export type CrossDocumentRefTarget =
  | WorldEntityHandle
  | WorldNodeHandle
  | { assetId: AssetID; kind: "shared-asset" }
  | { materialId: MaterialID; kind: "shared-material" }
  | { kind: "shared-texture"; textureId: TextureRecord["id"] };

export type CrossDocumentRef = {
  id: CrossDocumentRefID;
  metadata?: Record<string, MetadataValue>;
  relation: "attachment" | "instance-source" | "partition-membership" | "reference";
  required?: boolean;
  source: WorldEntityHandle | WorldNodeHandle;
  target: CrossDocumentRefTarget;
};

export type DocumentMount = {
  parent?: WorldNodeHandle;
  transform: Transform;
};

export type AuthoringDocumentMetadata = {
  documentId: DocumentID;
  mount: DocumentMount;
  name: string;
  partitionIds: PartitionID[];
  path: string;
  slug: string;
  tags: string[];
};

export type AuthoringDocumentSnapshot = SceneDocumentSnapshot & {
  crossDocumentRefs: CrossDocumentRef[];
  documentId: DocumentID;
  metadata: AuthoringDocumentMetadata;
  version: 1;
};

export type StreamingPartitionMember =
  | { documentId: DocumentID; kind: "document" }
  | WorldEntityHandle
  | WorldNodeHandle;

export type StreamingPartition = {
  bounds?: Bounds3;
  id: PartitionID;
  loadDistance?: number;
  members: StreamingPartitionMember[];
  metadata?: Record<string, MetadataValue>;
  name: string;
  path: string;
  tags: string[];
  unloadDistance?: number;
  version: 1;
};

export type WorkingSetState = {
  activeDocumentId?: DocumentID;
  backgroundDocumentIds: DocumentID[];
  loadedDocumentIds: DocumentID[];
  mode: "scene" | "world";
  pinnedDocumentIds: DocumentID[];
};

export type WorldManifestDocument = {
  bounds?: Bounds3;
  id: DocumentID;
  mount: DocumentMount;
  name: string;
  partitionIds: PartitionID[];
  path: string;
  slug: string;
  tags: string[];
};

export type WorldManifestPartition = {
  bounds?: Bounds3;
  documentIds: DocumentID[];
  id: PartitionID;
  name: string;
  path: string;
  tags: string[];
};

export type WorldManifest = {
  activeDocumentId?: DocumentID;
  metadata?: {
    projectName?: string;
    projectSlug?: string;
  };
  partitions: WorldManifestPartition[];
  version: 1;
};

export type SharedWorldResources = {
  assets: Asset[];
  materials: Material[];
  textures: TextureRecord[];
  version: 1;
};

export type WorldPersistenceBundle = {
  documents: Record<DocumentID, AuthoringDocumentSnapshot>;
  manifest: WorldManifest;
  partitions: Record<PartitionID, StreamingPartition>;
  sharedAssets: SharedWorldResources;
  version: 1;
};

export type WorldManifestFileSet = {
  documents: Record<string, AuthoringDocumentSnapshot>;
  partitions: Record<string, StreamingPartition>;
  sharedAssets: SharedWorldResources;
  world: WorldManifest;
};

export type WorldValidationIssue = {
  code:
    | "document-missing"
    | "document-not-loaded"
    | "duplicate-document"
    | "duplicate-partition"
    | "invalid-mount-target"
    | "invalid-partition-membership"
    | "missing-partition"
    | "missing-reference-target";
  message: string;
  severity: "error" | "warning";
};

export type DocumentSpatialIndexEntry = {
  bounds: Bounds3;
  handle: WorldEntityHandle | WorldNodeHandle;
};

export type PartitionSpatialIndexEntry = {
  bounds: Bounds3;
  partitionId: PartitionID;
};

export type WorldTransactionDocumentChange = {
  after?: AuthoringDocumentSnapshot;
  before?: AuthoringDocumentSnapshot;
  documentId: DocumentID;
};

export type WorldTransactionPartitionChange = {
  after?: StreamingPartition;
  before?: StreamingPartition;
  partitionId: PartitionID;
};

export type WorldTransaction = {
  crossDocumentRefsAfter?: CrossDocumentRef[];
  crossDocumentRefsBefore?: CrossDocumentRef[];
  documentChanges: WorldTransactionDocumentChange[];
  label: string;
  manifestAfter?: WorldManifest;
  manifestBefore?: WorldManifest;
  partitionChanges: WorldTransactionPartitionChange[];
  selectionAfter?: WorldSelectionSnapshot;
  selectionBefore?: WorldSelectionSnapshot;
  sharedAssetsAfter?: SharedWorldResources;
  sharedAssetsBefore?: SharedWorldResources;
  timestamp: string;
  workingSetAfter?: WorkingSetState;
  workingSetBefore?: WorkingSetState;
};

export type WorldCommand = {
  execute: (world: {
    createTransaction: (input: Omit<WorldTransaction, "timestamp">) => WorldTransaction;
    exportBundle: () => WorldPersistenceBundle;
    getSelectionSnapshot: () => WorldSelectionSnapshot;
    getWorkingSet: () => WorkingSetState;
  }) => WorldTransaction | undefined;
  label: string;
};
