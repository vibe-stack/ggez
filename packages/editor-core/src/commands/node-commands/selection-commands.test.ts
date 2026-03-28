import { describe, expect, test } from "bun:test";
import { vec3, type GeometryNode } from "@ggez/shared";
import { createSceneDocument } from "../../document/scene-document";
import { createDuplicateNodesCommand, createInstanceNodesCommand } from "./selection-commands";

describe("createInstanceNodesCommand", () => {
  test("duplicates preserve the original position", () => {
    const scene = createSceneDocument();

    scene.addNode({
      data: {
        size: vec3(1, 1, 1),
        role: "prop",
        shape: "cube"
      },
      id: "node:crate",
      kind: "primitive",
      name: "Crate",
      transform: {
        position: vec3(3, 2, -4),
        rotation: vec3(0, 0, 0),
        scale: vec3(1, 1, 1)
      }
    });

    const { command, duplicateIds } = createDuplicateNodesCommand(scene, ["node:crate"], vec3(8, 0, 0));

    command.execute(scene);

    expect(duplicateIds).toHaveLength(1);
    expect(scene.getNode(duplicateIds[0])?.transform.position).toEqual(vec3(3, 2, -4));
  });

  test("creates a parallel instanced group without offsetting the source cluster", () => {
    const scene = createSceneDocument();
    const nodes: GeometryNode[] = [
      {
        data: {},
        id: "node:cluster",
        kind: "group",
        name: "Cluster",
        transform: {
          position: vec3(0, 0, 0),
          rotation: vec3(0, 0, 0),
          scale: vec3(1, 1, 1)
        }
      },
      {
        data: {
          assetId: "asset:model:source",
          path: "crate.glb"
        },
        id: "node:model",
        kind: "model",
        name: "Crate",
        parentId: "node:cluster",
        transform: {
          position: vec3(0, 0, 0),
          rotation: vec3(0, 0, 0),
          scale: vec3(1, 1, 1)
        }
      },
      {
        data: {
          sourceNodeId: "node:model"
        },
        id: "node:model:instance:1",
        kind: "instancing",
        name: "Crate Instance 1",
        parentId: "node:cluster",
        transform: {
          position: vec3(2, 0, 0),
          rotation: vec3(0, 0, 0),
          scale: vec3(1, 1, 1)
        }
      },
      {
        data: {
          sourceNodeId: "node:model"
        },
        id: "node:model:instance:2",
        kind: "instancing",
        name: "Crate Instance 2",
        parentId: "node:cluster",
        transform: {
          position: vec3(4, 0, 0),
          rotation: vec3(0, 0, 0),
          scale: vec3(1, 1, 1)
        }
      }
    ];

    nodes.forEach((node) => {
      scene.addNode(structuredClone(node));
    });

    const { command, instanceIds } = createInstanceNodesCommand(scene, ["node:cluster"], vec3(8, 0, 0));

    command.execute(scene);

    expect(instanceIds).toHaveLength(1);

    const createdGroup = scene.getNode(instanceIds[0]);

    expect(createdGroup?.kind).toBe("group");
    expect(createdGroup?.transform.position).toEqual(vec3(0, 0, 0));

    const createdChildren = Array.from(scene.nodes.values()).filter((node) => node.parentId === createdGroup?.id);

    expect(createdChildren).toHaveLength(3);
    expect(createdChildren.every((node) => node.kind === "instancing")).toBe(true);
    expect(createdChildren.map((node) => node.transform.position.x).sort((left, right) => left - right)).toEqual([0, 2, 4]);
    expect(
      createdChildren.every(
        (node) => node.kind === "instancing" && node.data.sourceNodeId === "node:model"
      )
    ).toBe(true);
  });
});
