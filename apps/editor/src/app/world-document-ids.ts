import type { WorldPersistenceBundle } from "@ggez/editor-core";

export function createUniqueWorldDocumentId(bundle: WorldPersistenceBundle, preferredId: string) {
  let nextId = preferredId;
  let attempt = 2;

  while (bundle.documents[nextId]) {
    nextId = `${preferredId}-${attempt}`;
    attempt += 1;
  }

  return nextId;
}

export function createUniqueWorldPartitionId(bundle: WorldPersistenceBundle, preferredId: string) {
  let nextId = preferredId;
  let attempt = 2;

  while (bundle.partitions[nextId]) {
    nextId = `${preferredId}-${attempt}`;
    attempt += 1;
  }

  return nextId;
}
