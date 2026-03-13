import { createMachine } from "xstate";

export type ToolId = "select" | "transform" | "brush" | "clip" | "extrude" | "mesh-edit" | "path-add" | "path-edit";

export const defaultToolId: ToolId = "select";

export type ToolSession = {
  toolId: ToolId;
  machine: ReturnType<typeof createToolMachine>;
};

export function createToolMachine(toolId: ToolId) {
  return createMachine({
    id: `tool:${toolId}`,
    initial: "idle",
    states: {
      idle: {
        on: {
          HOVER: "hover",
          DRAG_START: "drag"
        }
      },
      hover: {
        on: {
          DRAG_START: "drag",
          LEAVE: "idle"
        }
      },
      drag: {
        on: {
          COMMIT: "commit",
          CANCEL: "cancel"
        }
      },
      commit: {
        always: "idle"
      },
      cancel: {
        always: "idle"
      }
    }
  });
}

export function createToolSession(toolId: ToolId): ToolSession {
  return {
    toolId,
    machine: createToolMachine(toolId)
  };
}
