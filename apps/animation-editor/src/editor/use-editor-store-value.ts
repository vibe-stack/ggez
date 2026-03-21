import { useSyncExternalStore } from "react";
import type { AnimationEditorStore, EditorTopic } from "@ggez/anim-editor-core";

const legacyStoreRevisions = new WeakMap<AnimationEditorStore, number>();

function getStoreRevision(store: AnimationEditorStore): number {
  if (typeof store.getRevision === "function") {
    return store.getRevision();
  }

  return legacyStoreRevisions.get(store) ?? 0;
}

export function useEditorStoreValue<T>(
  store: AnimationEditorStore,
  selector: () => T,
  topics: EditorTopic[] = ["document"]
): T {
  useSyncExternalStore(
    (listener: () => void) =>
      store.subscribe(() => {
        if (typeof store.getRevision !== "function") {
          legacyStoreRevisions.set(store, getStoreRevision(store) + 1);
        }

        listener();
      }, topics),
    () => getStoreRevision(store),
    () => getStoreRevision(store)
  );

  return selector();
}