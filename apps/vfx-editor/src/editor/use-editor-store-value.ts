import { useSyncExternalStore } from "react";
import type { VfxEditorStore, VfxEditorTopic } from "@ggez/vfx-editor-core";

export function useEditorStoreValue<T>(
  store: VfxEditorStore,
  selector: () => T,
  topics?: VfxEditorTopic[]
) {
  return useSyncExternalStore(
    (listener: () => void) => store.subscribe(listener, topics),
    selector,
    selector
  );
}
