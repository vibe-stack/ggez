import { createEditableMeshFromPolygons } from "@web-hammer/geometry-kernel";
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
  MeshNode,
  ModelNode,
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

  const detailMesh: MeshNode = {
    id: "node:mesh:placeholder-detail",
    kind: "mesh",
    name: "Placeholder Detail",
    transform: makeTransform(vec3(-5, 1.25, -2)),
    data: createEditableMeshFromPolygons([
      {
        id: "face:mesh:base",
        positions: [
          vec3(-1.4, 0, -1.4),
          vec3(1.4, 0, -1.4),
          vec3(1.4, 0, 1.4),
          vec3(-1.4, 0, 1.4)
        ]
      },
      {
        id: "face:mesh:front",
        positions: [vec3(-1.4, 0, -1.4), vec3(1.4, 0, -1.4), vec3(0, 2.4, 0)]
      },
      {
        id: "face:mesh:right",
        positions: [vec3(1.4, 0, -1.4), vec3(1.4, 0, 1.4), vec3(0, 2.4, 0)]
      },
      {
        id: "face:mesh:back",
        positions: [vec3(1.4, 0, 1.4), vec3(-1.4, 0, 1.4), vec3(0, 2.4, 0)]
      },
      {
        id: "face:mesh:left",
        positions: [vec3(-1.4, 0, 1.4), vec3(-1.4, 0, -1.4), vec3(0, 2.4, 0)]
      }
    ])
  };

  const sampleModel: ModelNode = {
    id: "node:model:crate",
    kind: "model",
    name: "Crate Prop",
    transform: makeTransform(vec3(4, 1.1, 2)),
    data: {
      assetId: "asset:model:crate",
      path: "/assets/models/crate.glb"
    }
  };

  document.nodes.set(blockoutBrush.id, blockoutBrush);
  document.nodes.set(detailMesh.id, detailMesh);
  document.nodes.set(sampleModel.id, sampleModel);

  document.entities.set("entity:player-start", {
    id: "entity:player-start",
    type: "spawn",
    transform: makeTransform(vec3(0, 1, 0)),
    properties: {
      team: "player",
      enabled: true
    }
  });

  document.layers.set("layer:default", {
    id: "layer:default",
    name: "Default",
    visible: true,
    locked: false
  });

  document.assets.set("asset:model:crate", {
    id: "asset:model:crate",
    type: "model",
    path: "/assets/models/crate.glb",
    metadata: {
      source: "placeholder"
    }
  });

  document.revision = 1;

  return document;
}
