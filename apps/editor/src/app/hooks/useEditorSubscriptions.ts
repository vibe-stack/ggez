import { useEffect } from "react";
import type { EditorCore } from "@ggez/editor-core";

export function useEditorSubscriptions(
  editor: EditorCore,
  setSceneRevision: React.Dispatch<React.SetStateAction<number>>,
  setCommittedSceneRevision: React.Dispatch<React.SetStateAction<number>>,
  setSelectionRevision: React.Dispatch<React.SetStateAction<number>>
) {
  useEffect(() => {
    const unsubscribeScene = editor.events.on("scene:changed", () => {
      setSceneRevision((revision) => revision + 1);
      setCommittedSceneRevision((revision) => revision + 1);
    });
    const unsubscribeSelection = editor.events.on("selection:changed", () => {
      setSelectionRevision((revision) => revision + 1);
    });

    if (editor.selection.ids.length === 0) {
      const firstNode = editor.scene.nodes.values().next().value;

      if (firstNode) {
        editor.select([firstNode.id], "object");
      }
    }

    return () => {
      unsubscribeScene();
      unsubscribeSelection();
    };
  }, [editor, setCommittedSceneRevision, setSceneRevision, setSelectionRevision]);
}
