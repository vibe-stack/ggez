import type { ToolId } from "./tool-machine";

export const defaultTools: Array<{ id: ToolId; label: string }> = [
  { id: "select", label: "Select" },
  { id: "transform", label: "Transform" },
  { id: "clip", label: "Clip" },
  { id: "extrude", label: "Extrude" },
  { id: "mesh-edit", label: "Mesh Edit" },
  { id: "brush", label: "Brush" },
  { id: "path-add", label: "Add Path" },
  { id: "path-edit", label: "Edit Path" }
];
