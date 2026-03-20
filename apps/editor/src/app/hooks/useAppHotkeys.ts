import { useEffect } from "react";
import type { EditorCore, TransformAxis } from "@ggez/editor-core";
import type { MeshEditMode } from "@/viewport/editing";
import type { ToolId } from "@ggez/tool-system";

type UseAppHotkeysOptions = {
  activeToolId: ToolId;
  editor: EditorCore;
  enabled?: boolean;
  handleDeleteSelection: () => void;
  handleDuplicateSelection: () => void;
  handleInstanceSelection: () => void;
  handleGroupSelection: () => void;
  handleInvertSelectionNormals: () => void;
  handleRedo: () => void;
  handleToggleCopilot: () => void;
  handleToggleLogicViewer: () => void;
  handleTranslateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  handleUndo: () => void;
  setActiveToolId: (toolId: ToolId) => void;
  setMeshEditMode: (mode: MeshEditMode) => void;
  setTransformMode: (mode: "rotate" | "scale" | "translate") => void;
};

export function useAppHotkeys({
  activeToolId,
  editor,
  enabled = true,
  handleDeleteSelection,
  handleDuplicateSelection,
  handleInstanceSelection,
  handleGroupSelection,
  handleInvertSelectionNormals,
  handleRedo,
  handleToggleCopilot,
  handleToggleLogicViewer,
  handleTranslateSelection,
  handleUndo,
  setActiveToolId,
  setMeshEditMode,
  setTransformMode
}: UseAppHotkeysOptions) {
  const blocksSceneSelectionEdits = activeToolId === "mesh-edit" || activeToolId === "path-add" || activeToolId === "path-edit";

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (modifier && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        handleToggleLogicViewer();
        return;
      }

      if (modifier && event.key.toLowerCase() === "l") {
        event.preventDefault();
        handleToggleCopilot();
        return;
      }

      if (modifier && event.key.toLowerCase() === "d" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === "i" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleInstanceSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === "g" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleGroupSelection();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleDeleteSelection();
        return;
      }

      if (event.key.toLowerCase() === "n" && !blocksSceneSelectionEdits) {
        event.preventDefault();
        handleInvertSelectionNormals();
        return;
      }

      if (event.key === "1") {
        setActiveToolId("select");
        return;
      }

      if (event.key === "2") {
        setActiveToolId("transform");
        return;
      }

      if (event.key === "3") {
        setActiveToolId("clip");
        return;
      }

      if (event.key === "4") {
        setActiveToolId("extrude");
        return;
      }

      if (event.key === "5") {
        setActiveToolId("mesh-edit");
        return;
      }

      if (event.key === "6") {
        setActiveToolId("brush");
        return;
      }

      if (event.key === "7") {
        setActiveToolId("path-add");
        return;
      }

      if (event.key === "8") {
        setActiveToolId("path-edit");
        return;
      }

      if (event.key.toLowerCase() === "+" && !blocksSceneSelectionEdits) {
        setActiveToolId("brush");
        return;
      }

      if (activeToolId !== "transform" && activeToolId !== "mesh-edit") {
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setTransformMode("translate");
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setTransformMode("rotate");
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setTransformMode("scale");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        setMeshEditMode("vertex");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setMeshEditMode("edge");
        return;
      }

      if (activeToolId === "mesh-edit" && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setMeshEditMode("face");
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleTranslateSelection("x", -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleTranslateSelection("x", 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        handleTranslateSelection("z", -1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleTranslateSelection("z", 1);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        handleTranslateSelection("y", 1);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        handleTranslateSelection("y", -1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeToolId,
    blocksSceneSelectionEdits,
    editor,
    enabled,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleInstanceSelection,
    handleGroupSelection,
    handleInvertSelectionNormals,
    handleRedo,
    handleToggleCopilot,
    handleToggleLogicViewer,
    handleTranslateSelection,
    handleUndo,
    setActiveToolId,
    setMeshEditMode,
    setTransformMode
  ]);
}
