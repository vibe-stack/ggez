import type {
  Asset,
  AssetID,
  BrushNode,
  Entity,
  EntityID,
  GeometryNode,
  Layer,
  LayerID,
  Material,
  MaterialID,
  NodeID
} from "@web-hammer/shared";
import { makeTransform, vec3 } from "@web-hammer/shared";

export type SceneDocument = {
  nodes: Map<NodeID, GeometryNode>;
  entities: Map<EntityID, Entity>;
  materials: Map<MaterialID, Material>;
  assets: Map<AssetID, Asset>;
  layers: Map<LayerID, Layer>;
  revision: number;
  getNode: (id: NodeID) => GeometryNode | undefined;
  getEntity: (id: EntityID) => Entity | undefined;
  addNode: (node: GeometryNode) => void;
  removeNode: (id: NodeID) => GeometryNode | undefined;
  addEntity: (entity: Entity) => void;
  removeEntity: (id: EntityID) => Entity | undefined;
  setMaterial: (material: Material) => void;
  setAsset: (asset: Asset) => void;
  setLayer: (layer: Layer) => void;
  touch: () => number;
};

export type SceneDocumentSnapshot = {
  assets: Asset[];
  entities: Entity[];
  layers: Layer[];
  materials: Material[];
  nodes: GeometryNode[];
};

export function createSceneDocument(): SceneDocument {
  const nodes = new Map<NodeID, GeometryNode>();
  const entities = new Map<EntityID, Entity>();
  const materials = new Map<MaterialID, Material>();
  const assets = new Map<AssetID, Asset>();
  const layers = new Map<LayerID, Layer>();

  const document: SceneDocument = {
    nodes,
    entities,
    materials,
    assets,
    layers,
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
    setMaterial(material) {
      materials.set(material.id, material);
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
    touch() {
      document.revision += 1;
      return document.revision;
    }
  };

  return document;
}

export function createSceneDocumentSnapshot(scene: SceneDocument): SceneDocumentSnapshot {
  return {
    assets: Array.from(scene.assets.values(), (asset) => structuredClone(asset)),
    entities: Array.from(scene.entities.values(), (entity) => structuredClone(entity)),
    layers: Array.from(scene.layers.values(), (layer) => structuredClone(layer)),
    materials: Array.from(scene.materials.values(), (material) => structuredClone(material)),
    nodes: Array.from(scene.nodes.values(), (node) => structuredClone(node))
  };
}

export function loadSceneDocumentSnapshot(scene: SceneDocument, snapshot: SceneDocumentSnapshot) {
  scene.nodes.clear();
  scene.entities.clear();
  scene.materials.clear();
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
  snapshot.assets.forEach((asset) => {
    scene.assets.set(asset.id, structuredClone(asset));
  });
  snapshot.layers.forEach((layer) => {
    scene.layers.set(layer.id, structuredClone(layer));
  });

  scene.touch();
}

export function createSeedSceneDocument(): SceneDocument {
  const document = createSceneDocument();

  const blockoutBrush: BrushNode = {
    id: "node:brush:blockout-room",
    kind: "brush",
    name: "Blockout Room",
    transform: makeTransform(vec3(0, 1.5, 0)),
    data: {
      previewSize: vec3(8, 3, 8),
      planes: [
        { normal: vec3(1, 0, 0), distance: 4 },
        { normal: vec3(-1, 0, 0), distance: 4 },
        { normal: vec3(0, 1, 0), distance: 1.5 },
        { normal: vec3(0, -1, 0), distance: 1.5 },
        { normal: vec3(0, 0, 1), distance: 4 },
        { normal: vec3(0, 0, -1), distance: 4 }
      ],
      faces: []
    }
  };

  document.nodes.set(blockoutBrush.id, blockoutBrush);

  document.layers.set("layer:default", {
    id: "layer:default",
    name: "Default",
    visible: true,
    locked: false
  });

  document.materials.set("material:blockout:orange", {
    id: "material:blockout:orange",
    name: "Blockout Orange",
    color: "#f69036"
  });

  document.materials.set("material:detail:teal", {
    id: "material:detail:teal",
    name: "Detail Teal",
    color: "#6ed5c0"
  });

  document.materials.set("material:prop:steel", {
    id: "material:prop:steel",
    name: "Prop Steel",
    color: "#7f8ea3"
  });

  document.assets.set("asset:model:crate", {
    id: "asset:model:crate",
    type: "model",
    path: "/assets/models/crate.glb",
    metadata: {
      previewColor: "#7f8ea3",
      source: "placeholder"
    }
  });

  document.assets.set("asset:model:barrel", {
    id: "asset:model:barrel",
    type: "model",
    path: "/assets/models/barrel.glb",
    metadata: {
      previewColor: "#9a684d",
      source: "placeholder"
    }
  });

  document.revision = 1;

  return document;
}
