import type { SceneDocumentSnapshot } from "../document/scene-document";
import { createWorldBundleFromLegacyScene } from "./world-core";
import type { AuthoringDocumentSnapshot, WorldManifestFileSet, WorldPersistenceBundle } from "./types";

type PersistedWorldContainer =
  | {
      files: Record<string, unknown>;
      format: "whmap";
      version: 2;
    }
  | {
      format: "whmap";
      scene: SceneDocumentSnapshot;
      version: 1;
    };

type PersistedDocumentContainer =
  | {
      document: AuthoringDocumentSnapshot;
      format: "whdoc";
      version: 1;
    }
  | {
      format: "whdoc";
      scene: SceneDocumentSnapshot;
      version: 0;
    };

export function createWorldManifestFileSet(bundle: WorldPersistenceBundle): WorldManifestFileSet {
  const documents = Object.fromEntries(
    Object.values(bundle.documents).map((document) => [document.metadata.path, structuredClone(document)])
  );
  const partitions = Object.fromEntries(
    Object.values(bundle.partitions).map((partition) => [partition.path, structuredClone(partition)])
  );

  return {
    documents,
    partitions,
    sharedAssets: structuredClone(bundle.sharedAssets),
    world: structuredClone(bundle.manifest)
  };
}

export function serializeWorldPersistenceBundle(bundle: WorldPersistenceBundle): string {
  const fileSet = createWorldManifestFileSet(bundle);
  const files: Record<string, unknown> = {
    "/shared-assets.json": fileSet.sharedAssets,
    "/world.json": fileSet.world,
    ...fileSet.documents,
    ...fileSet.partitions
  };

  return JSON.stringify(
    {
      files,
      format: "whmap",
      version: 2
    } satisfies PersistedWorldContainer,
    null,
    2
  );
}

export function parseWorldPersistenceBundle(text: string): WorldPersistenceBundle {
  const parsed = JSON.parse(text) as PersistedWorldContainer;

  if (parsed.format !== "whmap") {
    throw new Error("Invalid world container.");
  }

  if (parsed.version === 1) {
    return createWorldBundleFromLegacyScene(parsed.scene);
  }

  const world = parsed.files["/world.json"];
  const sharedAssets = parsed.files["/shared-assets.json"];

  if (!world || !sharedAssets) {
    throw new Error("World container is missing /world.json or /shared-assets.json.");
  }

  const documents = Object.entries(parsed.files)
    .filter(([path]) => path.startsWith("/documents/"))
    .reduce<WorldPersistenceBundle["documents"]>((result, [path, value]) => {
      const document = structuredClone(value) as WorldPersistenceBundle["documents"][string];
      result[document.documentId] = {
        ...document,
        metadata: {
          ...document.metadata,
          path
        }
      };
      return result;
    }, {});

  const partitions = Object.entries(parsed.files)
    .filter(([path]) => path.startsWith("/partitions/"))
    .reduce<WorldPersistenceBundle["partitions"]>((result, [path, value]) => {
      const partition = structuredClone(value) as WorldPersistenceBundle["partitions"][string];
      result[partition.id] = {
        ...partition,
        path
      };
      return result;
    }, {});

  return {
    documents,
    manifest: structuredClone(world) as WorldPersistenceBundle["manifest"],
    partitions,
    sharedAssets: structuredClone(sharedAssets) as WorldPersistenceBundle["sharedAssets"],
    version: 1
  };
}

export function serializeAuthoringDocumentSnapshot(document: AuthoringDocumentSnapshot): string {
  return JSON.stringify(
    {
      document,
      format: "whdoc",
      version: 1
    } satisfies PersistedDocumentContainer,
    null,
    2
  );
}

export function parseAuthoringDocumentSnapshot(text: string): AuthoringDocumentSnapshot {
  const parsed = JSON.parse(text) as PersistedDocumentContainer;

  if (parsed.format !== "whdoc") {
    throw new Error("Invalid document container.");
  }

  if (parsed.version === 0) {
    return createDocumentSnapshotFromLegacyScene(parsed.scene);
  }

  return structuredClone(parsed.document);
}

export function createDocumentSnapshotFromLegacyScene(
  snapshot: SceneDocumentSnapshot,
  options: {
    documentId?: string;
    name?: string;
    path?: string;
    partitionId?: string;
    slug?: string;
  } = {}
): AuthoringDocumentSnapshot {
  const documentId = options.documentId ?? "document:main";
  const partitionId = options.partitionId ?? "partition:main";
  const name = options.name ?? snapshot.metadata?.projectName ?? "Imported Scene";
  const slug = options.slug ?? snapshot.metadata?.projectSlug ?? "imported-scene";

  return {
    ...structuredClone(snapshot),
    crossDocumentRefs: [],
    documentId,
    metadata: {
      documentId,
      mount: {
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      name,
      partitionIds: [partitionId],
      path: options.path ?? `/documents/${documentId}.json`,
      slug,
      tags: ["imported"]
    },
    version: 1
  };
}
