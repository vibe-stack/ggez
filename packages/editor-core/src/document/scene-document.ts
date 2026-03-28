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
import { createDefaultSceneSettings, isInstancingNode, makeTransform, normalizeSceneSettings, vec3 } from "@ggez/shared";

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

export function loadSceneDocumentSnapshot(scene: SceneDocument, snapshot: SceneDocumentSnapshot) {
  scene.nodes.clear();
  scene.entities.clear();
  scene.materials.clear();
  scene.textures.clear();
  scene.assets.clear();
  scene.layers.clear();

  snapshot.nodes.forEach((node) => {
    scene.nodes.set(node.id, structuredClone(node));
  });
  snapshot.entities.forEach((entity) => {
    scene.entities.set(entity.id, structuredClone(entity));
  });
  snapshot.materials.forEach((material) => {
    scene.materials.set(material.id, structuredClone(material));
  });
  snapshot.textures?.forEach((texture) => {
    scene.textures.set(texture.id, structuredClone(texture));
  });
  snapshot.assets.forEach((asset) => {
    scene.assets.set(asset.id, structuredClone(asset));
  });
  snapshot.layers.forEach((layer) => {
    scene.layers.set(layer.id, structuredClone(layer));
  });
  scene.settings = structuredClone(normalizeSceneSettings(snapshot.settings ?? createDefaultSceneSettings()));
  ensureSceneTextureLibrary(scene);

  scene.touch();
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

const TEXTURE_FIELDS = [
  "colorTexture",
  "normalTexture",
  "metalnessTexture",
  "roughnessTexture"
] as const;

type TextureField = (typeof TEXTURE_FIELDS)[number];

const TEXTURE_KIND_BY_FIELD: Record<TextureField, TextureRecord["kind"]> = {
  colorTexture: "color",
  metalnessTexture: "metalness",
  normalTexture: "normal",
  roughnessTexture: "roughness"
};

export function ensureSceneTextureLibrary(scene: SceneDocument) {
  const existingDataUrls = new Set(
    Array.from(scene.textures.values(), (texture) => texture.dataUrl)
  );

  for (const material of scene.materials.values()) {
    for (const field of TEXTURE_FIELDS) {
      const dataUrl = material[field];

      if (!dataUrl || existingDataUrls.has(dataUrl)) {
        continue;
      }

      const texture: TextureRecord = {
        createdAt: new Date().toISOString(),
        dataUrl,
        id: `texture:${material.id}:${field}`,
        kind: TEXTURE_KIND_BY_FIELD[field],
        name: `${material.name} ${formatTextureKind(TEXTURE_KIND_BY_FIELD[field])}`,
        source: "import"
      };

      scene.textures.set(texture.id, texture);
      existingDataUrls.add(dataUrl);
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
