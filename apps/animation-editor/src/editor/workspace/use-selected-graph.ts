import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { useEditorStoreValue } from "../use-editor-store-value";

export function useSelectedGraph(store: AnimationEditorStore) {
  return useEditorStoreValue(
    store,
    () => {
      const state = store.getState();
      return state.document.graphs.find((graph) => graph.id === state.selection.graphId) ?? state.document.graphs[0]!;
    },
    ["graphs", "selection"]
  );
}