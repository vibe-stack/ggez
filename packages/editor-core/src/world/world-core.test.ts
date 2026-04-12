import { describe, expect, test } from "bun:test";
import { createSeedSceneDocument } from "../document/scene-document";
import { createSceneDocumentSnapshot } from "../document/scene-document";
import { makeTransform, vec3 } from "@ggez/shared";
import { createMoveNodeToDocumentCommand } from "./world-commands";
import { parseWorldPersistenceBundle, serializeWorldPersistenceBundle } from "./persistence";
import { createWorldBundleFromLegacyScene, createWorldEditorCore } from "./world-core";
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
