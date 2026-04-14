import type { Brush, EditableMesh, EditableMeshMaterialLayer } from "@ggez/shared";
import { isBrushNode, isMeshNode } from "@ggez/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";

export function createSetBrushDataCommand(
  scene: SceneDocument,
  nodeId: string,
  nextData: Brush,
  beforeData?: Brush
): Command {
  const node = scene.getNode(nodeId);

  if (!node || !isBrushNode(node)) {
    return {
      label: "set brush",
      execute() {},
      undo() {}
    };
  }

  const before = structuredClone(beforeData ?? node.data);
  const next = structuredClone(nextData);

  return {
    label: "set brush",
    execute(nextScene) {
      const nextNode = nextScene.getNode(nodeId);

      if (!nextNode || !isBrushNode(nextNode)) {
        return;
      }

      nextNode.data = structuredClone(next);
      nextScene.touch();
    },
    undo(nextScene) {
      const nextNode = nextScene.getNode(nodeId);

      if (!nextNode || !isBrushNode(nextNode)) {
        return;
      }

      nextNode.data = structuredClone(before);
      nextScene.touch();
    }
  };
}

export function createSetMeshDataCommand(
  scene: SceneDocument,
  nodeId: string,
  nextData: EditableMesh,
  beforeData?: EditableMesh
): Command {
  const node = scene.getNode(nodeId);

  if (!node || !isMeshNode(node)) {
    return {
      label: "set mesh",
      execute() {},
      undo() {}
    };
  }

  const before = structuredClone(beforeData ?? node.data);
  const next = structuredClone(nextData);

  return {
    label: "set mesh",
    execute(nextScene) {
      const nextNode = nextScene.getNode(nodeId);

      if (!nextNode || !isMeshNode(nextNode)) {
        return;
      }

      nextNode.data = structuredClone(next);
      nextScene.touch();
    },
    undo(nextScene) {
      const nextNode = nextScene.getNode(nodeId);

      if (!nextNode || !isMeshNode(nextNode)) {
        return;
      }

      nextNode.data = structuredClone(before);
      nextScene.touch();
    }
  };
}

export function createSetMeshMaterialLayersCommand(
  scene: SceneDocument,
  nodeId: string,
  nextLayers: EditableMeshMaterialLayer[] | undefined,
  beforeLayers?: EditableMeshMaterialLayer[] | undefined,
): Command {
  const node = scene.getNode(nodeId);

  if (!node || !isMeshNode(node)) {
    return {
      label: "set mesh material layers",
      execute() {},
      undo() {},
    };
  }

  const before = structuredClone(beforeLayers ?? node.data.materialLayers);
  const next = structuredClone(nextLayers);

  return {
    label: "set mesh material layers",
    execute(nextScene) {
      const nextNode = nextScene.getNode(nodeId);

      if (!nextNode || !isMeshNode(nextNode)) {
        return;
      }

      nextNode.data = {
        ...structuredClone(nextNode.data),
        materialBlend: undefined,
        materialLayers: structuredClone(next),
      };
      nextScene.touch();
    },
    undo(nextScene) {
      const nextNode = nextScene.getNode(nodeId);

      if (!nextNode || !isMeshNode(nextNode)) {
        return;
      }

      nextNode.data = {
        ...structuredClone(nextNode.data),
        materialBlend: undefined,
        materialLayers: structuredClone(before),
      };
      nextScene.touch();
    },
  };
}