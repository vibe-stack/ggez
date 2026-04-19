import { describe, expect, test } from "bun:test";
import { createEditableMeshFromPolygons } from "@ggez/geometry-kernel";
import { createDerivedRenderSceneCache, deriveRenderScene, deriveRenderSceneCached } from "./derived-scene";
import { makeTransform, vec3, type Entity, type GeometryNode, type Material } from "@ggez/shared";

describe("deriveRenderScene", () => {
  test("applies parent transforms to child meshes, groups, and entities", () => {
    const material: Material = {
      color: "#ffffff",
      id: "material:test",
      name: "Test"
    };
    const nodes: GeometryNode[] = [
      {
        data: {},
        id: "node:group",
        kind: "group",
        name: "Group",
        transform: {
          position: vec3(4, 0, 2),
          rotation: vec3(0, Math.PI / 2, 0),
          scale: vec3(2, 2, 2)
        }
      },
      {
        data: {
          materialId: material.id,
          role: "prop",
          shape: "cube",
          size: vec3(1, 1, 1)
        },
        id: "node:cube",
        kind: "primitive",
        name: "Cube",
        parentId: "node:group",
        transform: makeTransform(vec3(1, 0, 0))
      }
    ];
    const entities: Entity[] = [
      {
        id: "entity:spawn",
        name: "Spawn",
        parentId: "node:group",
        properties: {},
        transform: makeTransform(vec3(0, 0, 3)),
        type: "player-spawn"
      }
    ];

    const scene = deriveRenderScene(nodes, entities, [material]);
    const mesh = scene.meshes[0]!;
    const group = scene.groups[0]!;
    const entity = scene.entityMarkers[0]!;

    expect(group.position.x).toBeCloseTo(4, 5);
    expect(group.position.z).toBeCloseTo(2, 5);
    expect(mesh.position.x).toBeCloseTo(4, 5);
    expect(mesh.position.z).toBeCloseTo(0, 5);
    expect(entity.position.x).toBeCloseTo(10, 5);
    expect(entity.position.z).toBeCloseTo(2, 5);
    expect(scene.nodeTransforms.get("node:cube")?.position.z).toBeCloseTo(0, 5);
  });

  test("batches instancing nodes separately from source meshes", () => {
    const nodes: GeometryNode[] = [
      {
        data: {
          role: "prop",
          shape: "cube",
          size: vec3(1, 1, 1)
        },
        id: "node:source",
        kind: "primitive",
        name: "Source Cube",
        transform: makeTransform(vec3(0, 0, 0))
      },
      {
        data: {
          sourceNodeId: "node:source"
        },
        id: "node:instance",
        kind: "instancing",
        name: "Source Cube Instance",
        transform: {
          position: vec3(4, 0, 2),
          rotation: vec3(0, Math.PI / 4, 0),
          scale: vec3(2, 2, 2)
        }
      }
    ];

    const scene = deriveRenderScene(nodes, []);

    expect(scene.meshes).toHaveLength(1);
    expect(scene.instancedMeshes).toHaveLength(1);
    expect(scene.instancedMeshes[0]?.sourceNodeId).toBe("node:source");
    expect(scene.instancedMeshes[0]?.instances[0]?.nodeId).toBe("node:instance");
    expect(scene.instancedMeshes[0]?.instances[0]?.position.x).toBeCloseTo(4, 5);
    expect(scene.boundsCenter.x).toBeCloseTo(2, 5);
  });

  test("keeps imported model instances in instanced batches", () => {
    const nodes: GeometryNode[] = [
      {
        data: {
          assetId: "asset:model:source",
          path: "crate.glb"
        },
        id: "node:model-source",
        kind: "model",
        name: "Model Source",
        transform: makeTransform(vec3(0, 0, 0))
      },
      {
        data: {
          sourceNodeId: "node:model-source"
        },
        id: "node:model-instance",
        kind: "instancing",
        name: "Model Source Instance",
        transform: {
          position: vec3(6, 1, -2),
          rotation: vec3(0, Math.PI / 6, 0),
          scale: vec3(1.5, 1.5, 1.5)
        }
      }
    ];

    const scene = deriveRenderScene(nodes, [], [], [
      {
        id: "asset:model:source",
        metadata: {
          modelFormat: "glb",
          nativeCenterX: 0,
          nativeCenterY: 0.5,
          nativeCenterZ: 0,
          nativeSizeX: 2,
          nativeSizeY: 2,
          nativeSizeZ: 2
        },
        path: "crate.glb",
        type: "model"
      }
    ]);

    expect(scene.instancedMeshes).toHaveLength(1);
    expect(scene.instancedMeshes[0]?.mesh.modelPath).toBe("crate.glb");
    expect(scene.instancedMeshes[0]?.instances[0]?.nodeId).toBe("node:model-instance");
  });

  test("resolves texture library ids to concrete material texture sources", () => {
    const material: Material = {
      color: "#ffffff",
      colorTexture: "texture:brick:color",
      id: "material:brick",
      name: "Brick"
    };
    const nodes: GeometryNode[] = [
      {
        data: {
          materialId: material.id,
          role: "prop",
          shape: "cube",
          size: vec3(1, 1, 1)
        },
        id: "node:brick",
        kind: "primitive",
        name: "Brick Cube",
        transform: makeTransform(vec3(0, 0, 0))
      }
    ];

    const scene = deriveRenderScene(nodes, [], [material], [], [
      {
        createdAt: "2026-04-13T00:00:00.000Z",
        dataUrl: "data:image/png;base64,AAAA",
        id: "texture:brick:color",
        kind: "color",
        name: "Brick Color",
        source: "import"
      }
    ]);

    expect(scene.meshes[0]?.material.colorTexture).toBe("data:image/png;base64,AAAA");
  });

  test("reuses cached derived mesh geometry for transform-only updates", () => {
    const cache = createDerivedRenderSceneCache();
    const baseNode: GeometryNode = {
      data: {
        role: "prop",
        shape: "cube",
        size: vec3(1, 1, 1)
      },
      id: "node:cube",
      kind: "primitive",
      name: "Cube",
      transform: makeTransform(vec3(0, 0, 0))
    };

    const firstScene = deriveRenderSceneCached([baseNode], [], [], [], cache);
    const movedScene = deriveRenderSceneCached(
      [
        {
          ...baseNode,
          transform: makeTransform(vec3(4, 2, -1))
        }
      ],
      [],
      [],
      [],
      cache
    );

    expect(movedScene.meshes[0]?.primitive).toBe(firstScene.meshes[0]?.primitive);
    expect(movedScene.meshes[0]?.position).toEqual(vec3(4, 2, -1));
  });

  test("projects rotated planar UVs for mesh faces", () => {
    const mesh = createEditableMeshFromPolygons([
      {
        id: "face:quad",
        positions: [
          vec3(0, 0, 0),
          vec3(1, 0, 0),
          vec3(1, 1, 0),
          vec3(0, 1, 0)
        ]
      }
    ]);

    mesh.faces[0] = {
      ...mesh.faces[0]!,
      uvRotation: Math.PI / 2
    };

    const scene = deriveRenderScene([
      {
        data: mesh,
        id: "node:mesh",
        kind: "mesh",
        name: "Rotated UV Mesh",
        transform: makeTransform(vec3(0, 0, 0))
      }
    ]);
    const uvs = scene.meshes[0]?.surface?.uvs;

    expect(uvs).toHaveLength(8);
    expect(uvs?.[0]).toBeCloseTo(0, 5);
    expect(uvs?.[1]).toBeCloseTo(0, 5);
    expect(uvs?.[2]).toBeCloseTo(0, 5);
    expect(uvs?.[3]).toBeCloseTo(1, 5);
    expect(uvs?.[4]).toBeCloseTo(-1, 5);
    expect(uvs?.[5]).toBeCloseTo(1, 5);
    expect(uvs?.[6]).toBeCloseTo(-1, 5);
    expect(uvs?.[7]).toBeCloseTo(0, 5);
  });
});
