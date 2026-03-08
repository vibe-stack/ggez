import type {
  BrushNode,
  Entity,
  LightNode,
  MeshNode,
  ModelNode,
  PrimitiveNode,
  Transform,
  Vec3
} from "@web-hammer/shared";
import { vec3 } from "@web-hammer/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";
import { createDuplicateNodeId } from "./helpers";

export function createPlaceModelNodeCommand(
  scene: SceneDocument,
  positionOrTransform: Vec3 | Transform,
  model: Pick<ModelNode, "data" | "name">
): {
  command: Command;
  nodeId: string;
} {
  const nodeId = createDuplicateNodeId(scene, "node:model:placed");
  const transform =
    "position" in positionOrTransform
      ? structuredClone(positionOrTransform)
      : {
          position: positionOrTransform,
          rotation: vec3(0, 0, 0),
          scale: vec3(1, 1, 1)
        };
  const node: ModelNode = {
    id: nodeId,
    kind: "model",
    name: model.name,
    transform,
    data: structuredClone(model.data)
  };

  return {
    command: {
      label: "place asset",
      execute(nextScene) {
        nextScene.addNode(structuredClone(node));
      },
      undo(nextScene) {
        nextScene.removeNode(node.id);
      }
    },
    nodeId
  };
}

export function createPlaceEntityCommand(entity: Entity): Command {
  return {
    label: "place entity",
    execute(scene) {
      scene.addEntity(structuredClone(entity));
    },
    undo(scene) {
      scene.removeEntity(entity.id);
    }
  };
}

export function createPlacePrimitiveNodeCommand(
  scene: SceneDocument,
  transform: Transform,
  primitive: Pick<PrimitiveNode, "data" | "name">
): {
  command: Command;
  nodeId: string;
} {
  const nodeId = createDuplicateNodeId(scene, `node:${primitive.data.role}:${primitive.data.shape}`);
  const node: PrimitiveNode = {
    id: nodeId,
    kind: "primitive",
    name: primitive.name,
    transform: structuredClone(transform),
    data: structuredClone(primitive.data)
  };

  return {
    command: {
      label: `place ${primitive.data.role}`,
      execute(nextScene) {
        nextScene.addNode(structuredClone(node));
      },
      undo(nextScene) {
        nextScene.removeNode(node.id);
      }
    },
    nodeId
  };
}

export function createPlaceMeshNodeCommand(
  scene: SceneDocument,
  transform: Transform,
  mesh: Pick<MeshNode, "data" | "name">
): {
  command: Command;
  nodeId: string;
} {
  const nodeId = createDuplicateNodeId(scene, "node:mesh:placed");
  const node: MeshNode = {
    id: nodeId,
    kind: "mesh",
    name: mesh.name,
    transform: structuredClone(transform),
    data: structuredClone(mesh.data)
  };

  return {
    command: {
      label: "place mesh",
      execute(nextScene) {
        nextScene.addNode(structuredClone(node));
      },
      undo(nextScene) {
        nextScene.removeNode(node.id);
      }
    },
    nodeId
  };
}

export function createPlaceLightNodeCommand(
  scene: SceneDocument,
  transform: Transform,
  light: Pick<LightNode, "data" | "name">
): {
  command: Command;
  nodeId: string;
} {
  const nodeId = createDuplicateNodeId(scene, `node:light:${light.data.type}`);
  const node: LightNode = {
    id: nodeId,
    kind: "light",
    name: light.name,
    transform: structuredClone(transform),
    data: structuredClone(light.data)
  };

  return {
    command: {
      label: "place light",
      execute(nextScene) {
        nextScene.addNode(structuredClone(node));
      },
      undo(nextScene) {
        nextScene.removeNode(node.id);
      }
    },
    nodeId
  };
}
