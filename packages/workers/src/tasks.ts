export const workerIds = ["geometryWorker", "meshWorker", "navWorker", "exportWorker"] as const;

export type WorkerId = (typeof workerIds)[number];

export type WorkerTask =
  | { worker: "geometryWorker"; task: "brush-rebuild" | "clip" | "triangulation" }
  | { worker: "meshWorker"; task: "triangulation" | "loop-cut" | "bevel" }
  | { worker: "navWorker"; task: "navmesh" }
  | { worker: "exportWorker"; task: "ai-model-generate" | "engine-format" | "gltf" | "usd" | "whmap-load" | "whmap-save" };
