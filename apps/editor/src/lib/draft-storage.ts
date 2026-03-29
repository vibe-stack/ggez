import type { SceneDocumentSnapshot } from "@ggez/editor-core";

const DATABASE_NAME = "web-hammer-editor-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = "trident:active";

export type StoredSceneEditorDraft = {
  projectName: string;
  projectSlug: string;
  projectSlugDirty: boolean;
  snapshot: SceneDocumentSnapshot;
  updatedAt: number;
  version: 1;
};

export async function loadStoredSceneEditorDraft(): Promise<StoredSceneEditorDraft | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ACTIVE_DRAFT_KEY);

    request.onsuccess = () => {
      database.close();
      const result = request.result as StoredSceneEditorDraft | undefined;
      resolve(result?.version === 1 ? result : null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Failed to load the Trident draft."));
    };
  });
}

export async function saveSceneEditorDraft(draft: StoredSceneEditorDraft): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Failed to save the Trident draft."));
    };

    store.put(draft, ACTIVE_DRAFT_KEY);
  });
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open the Trident draft database."));
  });
}