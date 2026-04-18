import { describe, expect, test } from "bun:test";
import { createEditableMeshFromPolygons } from "@ggez/geometry-kernel";
import { createSeedSceneDocument } from "../document/scene-document";
import { createSceneDocumentSnapshot } from "../document/scene-document";
import { makeTransform, vec3 } from "@ggez/shared";
import { createAssignMaterialCommand } from "../commands/node-commands/material-commands";
import { createMoveNodeToDocumentCommand } from "./world-commands";
import { parseWorldPersistenceBundle, serializeWorldPersistenceBundle } from "./persistence";
import {
  createSceneEditorAdapter,
  createWorldBundleFromLegacyScene,
  createWorldEditorCore,
  flattenWorldBundle,
  normalizeWorldPersistenceBundle
} from "./world-core";
import type { AuthoringDocumentSnapshot, WorldPersistenceBundle } from "./types";

describe("world authoring core", () => {
  test("upgrades a legacy scene snapshot into a world bundle", () => {
    const scene = createSeedSceneDocument();
    scene.addNode({
      data: {},
      id: "node:legacy",
      kind: "group",
      name: "Legacy Root",
      transform: makeTransform(vec3(4, 2, 1))
    });

    const bundle = createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(scene));
    const roundTrip = parseWorldPersistenceBundle(serializeWorldPersistenceBundle(bundle));

    expect(Object.keys(roundTrip.documents)).toEqual(["document:main"]);
    expect(roundTrip.manifest.partitions).toHaveLength(1);
    expect(roundTrip.documents["document:main"].nodes.some((node) => node.id === "node:legacy")).toBeTrue();
  });

  test("moves a node across documents and preserves undo redo", () => {
    const bundle = createTwoDocumentWorldBundle();
    const world = createWorldEditorCore(bundle);

    world.execute(
      createMoveNodeToDocumentCommand(
        {
          documentId: "document:a",
          kind: "node",
          nodeId: "node:a"
        },
        "document:b"
      )
    );

    expect(world.getDocumentSnapshot("document:a")?.nodes.some((node) => node.id === "node:a")).toBeFalse();
    expect(world.getDocumentSnapshot("document:b")?.nodes.some((node) => node.id === "node:a")).toBeTrue();

    world.undo();
    expect(world.getDocumentSnapshot("document:a")?.nodes.some((node) => node.id === "node:a")).toBeTrue();
    expect(world.getDocumentSnapshot("document:b")?.nodes.some((node) => node.id === "node:a")).toBeFalse();

    world.redo();
    expect(world.getDocumentSnapshot("document:a")?.nodes.some((node) => node.id === "node:a")).toBeFalse();
    expect(world.getDocumentSnapshot("document:b")?.nodes.some((node) => node.id === "node:a")).toBeTrue();
  });

  test("updates document mount transform without replacing the whole world", () => {
    const bundle = createTwoDocumentWorldBundle();
    const world = createWorldEditorCore(bundle);

    world.updateDocumentMountTransform(
      "document:b",
      makeTransform(vec3(48, 0, -12))
    );

    expect(world.getDocumentSnapshot("document:b")?.metadata.mount.transform.position).toEqual(vec3(48, 0, -12));
    expect(world.getDocumentSummaries().find((document) => document.documentId === "document:b")?.mount.transform.position).toEqual(
      vec3(48, 0, -12)
    );
  });

  test("normalizes legacy embedded material textures when creating world bundles", () => {
    const scene = createSeedSceneDocument();
    scene.setMaterial({
      color: "#ffffff",
      colorTexture: "data:image/png;base64,AAAA",
      id: "material:test",
      name: "Test"
    });

    const bundle = createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(scene));
    const document = bundle.documents["document:main"];

    expect(document.textures).toHaveLength(1);
    expect(document.materials.find((material) => material.id === "material:test")?.colorTexture).toBe("texture:material:test:colorTexture");
  });

  test("normalizes legacy embedded material textures when importing world bundles", () => {
    const bundle = normalizeWorldPersistenceBundle(createTwoDocumentWorldBundle());
    const target = bundle.documents["document:a"];
    target.materials.push({
      color: "#ffffff",
      colorTexture: "data:image/png;base64,BBBB",
      id: "material:legacy",
      name: "Legacy"
    });

    const world = createWorldEditorCore(bundle);
    const imported = world.getDocumentSnapshot("document:a");

    expect(imported?.textures).toHaveLength(1);
    expect(imported?.materials.find((material) => material.id === "material:legacy")?.colorTexture).toBe("texture:material:legacy:colorTexture");
  });

  test("namespaces material texture references when flattening world bundles", () => {
    const bundle = createTwoDocumentWorldBundle();
    bundle.documents["document:a"].materials.push({
      color: "#ffffff",
      colorTexture: "texture:wall",
      id: "material:wall",
      name: "Wall"
    });
    bundle.documents["document:a"].textures.push({
      dataUrl: "data:image/png;base64,AAAA",
      id: "texture:wall",
      name: "Wall"
    });

    const flattened = flattenWorldBundle(bundle);

    expect(flattened.materials.find((material) => material.id === "document:a::material:wall")?.colorTexture).toBe(
      "document:a::texture:wall"
    );
    expect(flattened.textures.find((texture) => texture.id === "document:a::texture:wall")?.dataUrl).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  test("reuses untouched node snapshots and live nodes on committed edits", () => {
    const scene = createSeedSceneDocument();
    scene.addNode({
      data: {},
      id: "node:a",
      kind: "group",
      name: "Node A",
      transform: makeTransform(vec3(1, 0, 0))
    });
    scene.addNode({
      data: {},
      id: "node:b",
      kind: "group",
      name: "Node B",
      transform: makeTransform(vec3(2, 0, 0))
    });

    const world = createWorldEditorCore(createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(scene)));
    const adapter = createSceneEditorAdapter(world);
    const beforeSnapshot = world.getDocumentSnapshotRef("document:main");
    const beforeLiveDocument = world.getDocument("document:main");

    adapter.execute({
      execute(nextScene) {
        const node = nextScene.getNode("node:a");

        if (!node) {
          return;
        }

        node.transform = makeTransform(vec3(8, 0, 0));
        nextScene.touch();
      },
      label: "transform node",
      undo() {}
    });

    const afterSnapshot = world.getDocumentSnapshotRef("document:main");
    const afterLiveDocument = world.getDocument("document:main");

    expect(afterSnapshot?.nodes.find((node) => node.id === "node:b")).toBe(beforeSnapshot?.nodes.find((node) => node.id === "node:b"));
    expect(afterLiveDocument?.nodes.get("node:b")).toBe(beforeLiveDocument?.nodes.get("node:b"));
    expect(afterSnapshot?.nodes.find((node) => node.id === "node:a")).not.toBe(beforeSnapshot?.nodes.find((node) => node.id === "node:a"));
    expect(afterLiveDocument?.nodes.get("node:a")?.transform.position).toEqual(vec3(8, 0, 0));
  });

  test("reuses untouched flattened world nodes on active document transform edits", () => {
    const scene = createSeedSceneDocument();
    scene.addNode({
      data: {},
      id: "node:a",
      kind: "group",
      name: "Node A",
      transform: makeTransform(vec3(1, 0, 0))
    });
    scene.addNode({
      data: {},
      id: "node:b",
      kind: "group",
      name: "Node B",
      transform: makeTransform(vec3(2, 0, 0))
    });

    const world = createWorldEditorCore(createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(scene)));
    const adapter = createSceneEditorAdapter(world);
    const beforeFlattened = world.getFlattenedSceneSnapshot({
      activeDocumentId: "document:main",
      activeDocumentOverride: adapter.scene,
      includeLoadedOnly: true
    });

    adapter.execute({
      execute(nextScene) {
        const node = nextScene.getNode("node:a");

        if (!node) {
          return;
        }

        node.transform = makeTransform(vec3(5, 0, 0));
        nextScene.touch();
      },
      label: "transform node",
      undo() {}
    });

    const afterFlattened = world.getFlattenedSceneSnapshot({
      activeDocumentId: "document:main",
      activeDocumentOverride: adapter.scene,
      includeLoadedOnly: true
    });

    expect(afterFlattened.nodes.find((node) => node.id === "document:main::node:b")).toBe(
      beforeFlattened.nodes.find((node) => node.id === "document:main::node:b")
    );
    expect(afterFlattened.nodes.find((node) => node.id === "document:main::node:a")).not.toBe(
      beforeFlattened.nodes.find((node) => node.id === "document:main::node:a")
    );
  });

  test("persists assigned mesh materials into committed document snapshots", () => {
    const scene = createSeedSceneDocument();
    scene.addNode({
      data: createEditableMeshFromPolygons([
        {
          id: "face:mesh:test",
          materialId: "material:blockout:concrete",
          positions: [
            vec3(-1, 0, -1),
            vec3(1, 0, -1),
            vec3(1, 0, 1),
            vec3(-1, 0, 1)
          ]
        }
      ]),
      id: "node:mesh:test",
      kind: "mesh",
      name: "Test Mesh",
      transform: makeTransform(vec3(0, 0, 0))
    });

    const world = createWorldEditorCore(createWorldBundleFromLegacyScene(createSceneDocumentSnapshot(scene)));
    const adapter = createSceneEditorAdapter(world);

    adapter.execute(createAssignMaterialCommand(adapter.scene, [{ nodeId: "node:mesh:test" }], "material:blockout:orange"));

    const committedNode = world.getDocumentSnapshotRef("document:main")?.nodes.find((node) => node.id === "node:mesh:test");
    const exportedNode = adapter.exportSnapshot().nodes.find((node) => node.id === "node:mesh:test");

    expect(committedNode && "data" in committedNode ? committedNode.data.faces[0]?.materialId : undefined).toBe("material:blockout:orange");
    expect(exportedNode && "data" in exportedNode ? exportedNode.data.faces[0]?.materialId : undefined).toBe("material:blockout:orange");
  });
});

function createTwoDocumentWorldBundle(): WorldPersistenceBundle {
  const sceneA = createSeedSceneDocument();
  sceneA.addNode({
    data: {},
    id: "node:a",
    kind: "group",
    name: "Document A Root",
    transform: makeTransform(vec3(1, 0, 0))
  });

  const sceneB = createSeedSceneDocument();
  sceneB.addNode({
    data: {},
    id: "node:b",
    kind: "group",
    name: "Document B Root",
    transform: makeTransform(vec3(10, 0, 0))
  });

  const documentA = createDocumentSnapshot("document:a", "Document A", createSceneDocumentSnapshot(sceneA));
  const documentB = createDocumentSnapshot("document:b", "Document B", createSceneDocumentSnapshot(sceneB));

  return {
    documents: {
      [documentA.documentId]: documentA,
      [documentB.documentId]: documentB
    },
    manifest: {
      activeDocumentId: documentA.documentId,
      metadata: {
        projectName: "World Test",
        projectSlug: "world-test"
      },
      partitions: [
        {
          documentIds: [documentA.documentId],
          id: "partition:a",
          name: "Partition A",
          path: "/partitions/partition:a.json",
          tags: []
        },
        {
          documentIds: [documentB.documentId],
          id: "partition:b",
          name: "Partition B",
          path: "/partitions/partition:b.json",
          tags: []
        }
      ],
      version: 1
    },
    partitions: {
      "partition:a": {
        id: "partition:a",
        members: [{ documentId: documentA.documentId, kind: "document" }],
        name: "Partition A",
        path: "/partitions/partition:a.json",
        tags: [],
        version: 1
      },
      "partition:b": {
        id: "partition:b",
        members: [{ documentId: documentB.documentId, kind: "document" }],
        name: "Partition B",
        path: "/partitions/partition:b.json",
        tags: [],
        version: 1
      }
    },
    sharedAssets: {
      assets: [],
      materials: [],
      textures: [],
      version: 1
    },
    version: 1
  };
}

function createDocumentSnapshot(documentId: string, name: string, snapshot: ReturnType<typeof createSceneDocumentSnapshot>): AuthoringDocumentSnapshot {
  return {
    ...snapshot,
    crossDocumentRefs: [],
    documentId,
    metadata: {
      documentId,
      mount: {
        transform: makeTransform()
      },
      name,
      partitionIds: [`partition:${documentId.slice(-1)}`],
      path: `/documents/${documentId}.json`,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      tags: []
    },
    version: 1
  };
}
