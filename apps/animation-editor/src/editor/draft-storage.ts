const DATABASE_NAME = "web-hammer-animation-editor-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = "animation-editor:active";

export type StoredAnimationEditorDraft = {
  archive: Blob;
  projectName: string;
  projectSlug: string;
  projectSlugDirty: boolean;
  updatedAt: number;
  version: 1;
};

export async function loadStoredAnimationEditorDraft(): Promise<StoredAnimationEditorDraft | null> {
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
      const result = request.result as StoredAnimationEditorDraft | undefined;
      resolve(result?.version === 1 ? result : null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Failed to load the Animation Studio draft."));
    };
  });
}

export async function saveAnimationEditorDraft(draft: StoredAnimationEditorDraft): Promise<void> {
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
      reject(transaction.error ?? new Error("Failed to save the Animation Studio draft."));
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
    request.onerror = () => reject(request.error ?? new Error("Failed to open the Animation Studio draft database."));
  });
}