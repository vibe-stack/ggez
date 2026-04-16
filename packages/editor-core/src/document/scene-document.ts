import type {
  Asset,
  AssetID,
  Entity,
  EntityID,
  GeometryNode,
  Layer,
  LayerID,
  Material,
  MaterialID,
  NodeID,
  SceneSettings,
  TextureRecord
} from "@ggez/shared";
import {
  createDefaultSceneSettings,
  isInstancingNode,
  makeTransform,
  MATERIAL_TEXTURE_FIELDS,
  normalizeSceneSettings,
  vec3
} from "@ggez/shared";

export type SceneDocument = {
  nodes: Map<NodeID, GeometryNode>;
  entities: Map<EntityID, Entity>;
  materials: Map<MaterialID, Material>;
  textures: Map<string, TextureRecord>;
  assets: Map<AssetID, Asset>;
  layers: Map<LayerID, Layer>;
  settings: SceneSettings;
  revision: number;
  getNode: (id: NodeID) => GeometryNode | undefined;
  getEntity: (id: EntityID) => Entity | undefined;
  addNode: (node: GeometryNode) => void;
  removeNode: (id: NodeID) => GeometryNode | undefined;
  addEntity: (entity: Entity) => void;
  removeEntity: (id: EntityID) => Entity | undefined;
  removeMaterial: (id: MaterialID) => Material | undefined;
  setMaterial: (material: Material) => void;
  removeTexture: (id: string) => TextureRecord | undefined;
  setTexture: (texture: TextureRecord) => void;
  removeAsset: (id: AssetID) => Asset | undefined;
  setAsset: (asset: Asset) => void;
  setLayer: (layer: Layer) => void;
  setSettings: (settings: SceneSettings) => void;
  touch: () => number;
};

export type SceneDocumentSnapshot = {
  assets: Asset[];
  entities: Entity[];
  layers: Layer[];
  materials: Material[];
  metadata?: {
    projectName?: string;
    projectSlug?: string;
  };
  nodes: GeometryNode[];
  settings: SceneSettings;
  textures: TextureRecord[];
};

type SnapshotCollectionReuseCache<T extends { id: string }> = {
  liveById: Map<string, T>;
  snapshotById: Map<string, T>;
};

type SceneDocumentSnapshotLoadCache = {
  assets: SnapshotCollectionReuseCache<Asset>;
  entities: SnapshotCollectionReuseCache<Entity>;
  layers: SnapshotCollectionReuseCache<Layer>;
  materials: SnapshotCollectionReuseCache<Material>;
  nodes: SnapshotCollectionReuseCache<GeometryNode>;
  settingsClone?: SceneSettings;
  settingsSource?: SceneDocumentSnapshot["settings"];
  textures: SnapshotCollectionReuseCache<TextureRecord>;
};

const sceneDocumentSnapshotLoadCache = new WeakMap<SceneDocument, SceneDocumentSnapshotLoadCache>();

export function createSceneDocument(): SceneDocument {
  const nodes = new Map<NodeID, GeometryNode>();
  const entities = new Map<EntityID, Entity>();
  const materials = new Map<MaterialID, Material>();
  const textures = new Map<string, TextureRecord>();
  const assets = new Map<AssetID, Asset>();
  const layers = new Map<LayerID, Layer>();
  let settings = createDefaultSceneSettings();

  const document: SceneDocument = {
    nodes,
    entities,
    materials,
    textures,
    assets,
    layers,
    get settings() {
      return settings;
    },
    set settings(nextSettings: SceneSettings) {
      settings = nextSettings;
    },
    revision: 0,
    getNode(id) {
      return nodes.get(id);
    },
    getEntity(id) {
      return entities.get(id);
    },
    addNode(node) {
      nodes.set(node.id, node);
      document.touch();
    },
    removeNode(id) {
      const node = nodes.get(id);

      if (!node) {
        return undefined;
      }

      const descendantNodeIds = collectDescendantNodeIds(nodes, id);
      const removedNodeIds = new Set<NodeID>([id, ...descendantNodeIds]);
      const dependentInstanceIds = Array.from(nodes.values())
        .filter((candidate) => isInstancingNode(candidate) && removedNodeIds.has(candidate.data.sourceNodeId))
        .map((candidate) => candidate.id);
      const dependentDescendantIds = dependentInstanceIds.flatMap((instanceNodeId) => collectDescendantNodeIds(nodes, instanceNodeId));
      const descendantEntityIds = collectDescendantEntityIds(nodes, entities, id);
      const dependentEntityIds = dependentInstanceIds.flatMap((instanceNodeId) => collectDescendantEntityIds(nodes, entities, instanceNodeId));

      descendantNodeIds.forEach((nodeId) => {
        nodes.delete(nodeId);
      });
      dependentDescendantIds.forEach((nodeId) => {
        nodes.delete(nodeId);
      });
      dependentInstanceIds.forEach((nodeId) => {
        nodes.delete(nodeId);
      });
      descendantEntityIds.forEach((entityId) => {
        entities.delete(entityId);
      });
      dependentEntityIds.forEach((entityId) => {
        entities.delete(entityId);
      });
      nodes.delete(id);
      document.touch();

      return node;
    },
    addEntity(entity) {
      entities.set(entity.id, entity);
      document.touch();
    },
    removeEntity(id) {
      const entity = entities.get(id);

      if (!entity) {
        return undefined;
      }

      entities.delete(id);
      document.touch();

      return entity;
    },
    removeMaterial(id) {
      const material = materials.get(id);

      if (!material) {
        return undefined;
      }

      materials.delete(id);
      document.touch();

      return material;
    },
    setMaterial(material) {
      materials.set(material.id, material);
      document.touch();
    },
    removeTexture(id) {
      const texture = textures.get(id);

      if (!texture) {
        return undefined;
      }

      textures.delete(id);
      document.touch();

      return texture;
    },
    setTexture(texture) {
      textures.set(texture.id, texture);
      document.touch();
    },
    removeAsset(id) {
      const asset = assets.get(id);

      if (!asset) {
        return undefined;
      }

      assets.delete(id);
      document.touch();

      return asset;
    },
    setAsset(asset) {
      assets.set(asset.id, asset);
      document.touch();
    },
    setLayer(layer) {
      layers.set(layer.id, layer);
      document.touch();
    },
    setSettings(nextSettings) {
      settings = structuredClone(nextSettings);
      document.touch();
    },
    touch() {
      document.revision += 1;
      return document.revision;
    }
  };

  return document;
}

function collectDescendantNodeIds(nodes: Map<NodeID, GeometryNode>, parentId: NodeID): NodeID[] {
  const descendants: NodeID[] = [];
  const queue = Array.from(nodes.values())
    .filter((node) => node.parentId === parentId)
    .map((node) => node.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    descendants.push(nodeId);

    nodes.forEach((node) => {
      if (node.parentId === nodeId) {
        queue.push(node.id);
      }
    });
  }

  return descendants;
}

function collectDescendantEntityIds(
  nodes: Map<NodeID, GeometryNode>,
  entities: Map<EntityID, Entity>,
  parentId: NodeID
): EntityID[] {
  const validParentIds = new Set<NodeID>([parentId, ...collectDescendantNodeIds(nodes, parentId)]);

  return Array.from(entities.values())
    .filter((entity) => entity.parentId && validParentIds.has(entity.parentId))
    .map((entity) => entity.id);
}

export function createSceneDocumentSnapshot(scene: SceneDocument): SceneDocumentSnapshot {
  ensureSceneTextureLibrary(scene);

  return {
    assets: Array.from(scene.assets.values(), (asset) => structuredClone(asset)),
    entities: Array.from(scene.entities.values(), (entity) => structuredClone(entity)),
    layers: Array.from(scene.layers.values(), (layer) => structuredClone(layer)),
    materials: Array.from(scene.materials.values(), (material) => structuredClone(material)),
    nodes: Array.from(scene.nodes.values(), (node) => structuredClone(node)),
    settings: structuredClone(scene.settings),
    textures: Array.from(scene.textures.values(), (texture) => structuredClone(texture))
  };
}

export function normalizeSceneDocumentSnapshot(snapshot: SceneDocumentSnapshot): SceneDocumentSnapshot {
  const scene = createSceneDocument();
  loadSceneDocumentSnapshot(scene, snapshot);
  return createSceneDocumentSnapshot(scene);
}

export function loadSceneDocumentSnapshot(scene: SceneDocument, snapshot: SceneDocumentSnapshot) {
  const cache = getSceneDocumentSnapshotLoadCache(scene);

  syncSnapshotCollection(scene.nodes, snapshot.nodes, cache.nodes);
  syncSnapshotCollection(scene.entities, snapshot.entities, cache.entities);
  syncSnapshotCollection(scene.materials, snapshot.materials, cache.materials);
  syncSnapshotCollection(scene.textures, snapshot.textures ?? [], cache.textures);
  syncSnapshotCollection(scene.assets, snapshot.assets, cache.assets);
  syncSnapshotCollection(scene.layers, snapshot.layers, cache.layers);
  scene.settings =
    cache.settingsSource === snapshot.settings && cache.settingsClone
      ? cache.settingsClone
      : structuredClone(normalizeSceneSettings(snapshot.settings ?? createDefaultSceneSettings()));
  cache.settingsSource = snapshot.settings;
  cache.settingsClone = scene.settings;
  ensureSceneTextureLibrary(scene);

  scene.touch();
}

function createSnapshotCollectionReuseCache<T extends { id: string }>(): SnapshotCollectionReuseCache<T> {
  return {
    liveById: new Map(),
    snapshotById: new Map()
  };
}

function getSceneDocumentSnapshotLoadCache(scene: SceneDocument): SceneDocumentSnapshotLoadCache {
  const cached = sceneDocumentSnapshotLoadCache.get(scene);

  if (cached) {
    return cached;
  }

  const nextCache: SceneDocumentSnapshotLoadCache = {
    assets: createSnapshotCollectionReuseCache(),
    entities: createSnapshotCollectionReuseCache(),
    layers: createSnapshotCollectionReuseCache(),
    materials: createSnapshotCollectionReuseCache(),
    nodes: createSnapshotCollectionReuseCache(),
    textures: createSnapshotCollectionReuseCache()
  };

  sceneDocumentSnapshotLoadCache.set(scene, nextCache);
  return nextCache;
}

function syncSnapshotCollection<T extends { id: string }>(
  target: Map<string, T>,
  snapshotValues: T[],
  cache: SnapshotCollectionReuseCache<T>
) {
  const nextLiveById = new Map<string, T>();
  const nextSnapshotById = new Map<string, T>();

  target.clear();

  snapshotValues.forEach((snapshotValue) => {
    const nextValue =
      cache.snapshotById.get(snapshotValue.id) === snapshotValue
        ? cache.liveById.get(snapshotValue.id) ?? structuredClone(snapshotValue)
        : structuredClone(snapshotValue);

    target.set(snapshotValue.id, nextValue);
    nextLiveById.set(snapshotValue.id, nextValue);
    nextSnapshotById.set(snapshotValue.id, snapshotValue);
  });

  cache.liveById = nextLiveById;
  cache.snapshotById = nextSnapshotById;
}

export function createSeedSceneDocument(): SceneDocument {
  const document = createSceneDocument();

  document.layers.set("layer:default", {
    id: "layer:default",
    name: "Default",
    visible: true,
    locked: false
  });
  document.settings = createDefaultSceneSettings();

  document.materials.set("material:blockout:orange", {
    id: "material:blockout:orange",
    name: "Blockout Orange",
    category: "blockout",
    color: "#f69036",
    edgeColor: "#fff5df",
    edgeThickness: 0.018,
    metalness: 0,
    roughness: 0.95
  });

  document.materials.set("material:blockout:concrete", {
    id: "material:blockout:concrete",
    name: "Blockout Concrete",
    category: "blockout",
    color: "#a8aea7",
    edgeColor: "#f5f7f2",
    edgeThickness: 0.016,
    metalness: 0,
    roughness: 1
  });

  document.materials.set("material:blockout:mint", {
    id: "material:blockout:mint",
    name: "Blockout Mint",
    category: "blockout",
    color: "#7ed8bc",
    edgeColor: "#f2fff8",
    edgeThickness: 0.017,
    metalness: 0,
    roughness: 0.9
  });

  document.materials.set("material:flat:orange", {
    id: "material:flat:orange",
    name: "Flat Orange",
    category: "flat",
    color: "#f69036",
    metalness: 0,
    roughness: 0.92
  });

  document.materials.set("material:flat:teal", {
    id: "material:flat:teal",
    name: "Flat Teal",
    category: "flat",
    color: "#6ed5c0",
    metalness: 0,
    roughness: 0.82
  });

  document.materials.set("material:flat:steel", {
    id: "material:flat:steel",
    name: "Flat Steel",
    category: "flat",
    color: "#7f8ea3",
    metalness: 0.18,
    roughness: 0.58
  });

  document.materials.set("material:flat:sand", {
    id: "material:flat:sand",
    name: "Flat Sand",
    category: "flat",
    color: "#c8b07e",
    metalness: 0,
    roughness: 0.88
  });

  document.materials.set("material:flat:charcoal", {
    id: "material:flat:charcoal",
    name: "Flat Charcoal",
    category: "flat",
    color: "#4e5564",
    metalness: 0,
    roughness: 0.8
  });

  document.revision = 1;

  return document;
}

type TextureField = (typeof MATERIAL_TEXTURE_FIELDS)[number];

const TEXTURE_KIND_BY_FIELD: Record<TextureField, TextureRecord["kind"]> = {
  colorTexture: "color",
  metalnessTexture: "metalness",
  normalTexture: "normal",
  roughnessTexture: "roughness"
};

export function ensureSceneTextureLibrary(scene: SceneDocument) {
  const textureByDataUrl = new Map(
    Array.from(scene.textures.values(), (texture) => [texture.dataUrl, texture] as const)
  );

  for (const material of scene.materials.values()) {
    for (const field of MATERIAL_TEXTURE_FIELDS) {
      const reference = material[field];

      if (!reference) {
        continue;
      }

      const existingTexture = scene.textures.get(reference) ?? textureByDataUrl.get(reference);

      if (existingTexture) {
        material[field] = existingTexture.id;
        continue;
      }

      if (!reference.startsWith("data:")) {
        continue;
      }

      const texture: TextureRecord = {
        createdAt: new Date().toISOString(),
        dataUrl: reference,
        id: `texture:${material.id}:${field}`,
        kind: TEXTURE_KIND_BY_FIELD[field],
        name: `${material.name} ${formatTextureKind(TEXTURE_KIND_BY_FIELD[field])}`,
        source: "import"
      };

      scene.textures.set(texture.id, texture);
      textureByDataUrl.set(texture.dataUrl, texture);
      material[field] = texture.id;
    }
  }
}

function formatTextureKind(kind: TextureRecord["kind"]) {
  switch (kind) {
    case "color":
      return "Color";
    case "metalness":
      return "Metalness";
    case "normal":
      return "Normal";
    case "roughness":
      return "Roughness";
  }
}
