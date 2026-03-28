import fs from "fs";
import { resolveSceneGraph } from "../packages/shared/dist/index.js";

const scene = JSON.parse(
  fs.readFileSync("/Users/fairhat/Repositories/web-hammer/samples/aone/src/scenes/untitled-scene/scene.runtime.json", "utf8")
);
const sceneGraph = resolveSceneGraph(scene.nodes, scene.entities);
const ids = new Set(["node:group:copy:1"]);
scene.nodes.forEach((node) => {
  if (node.parentId === "node:group:copy:1" || node.id === "node:group:copy:1") {
    ids.add(node.id);
  }
  if (/blockout|cylinder|room/i.test(node.name)) {
    ids.add(node.id);
  }
});
const rows = scene.nodes
  .filter((node) => ids.has(node.id))
  .map((node) => ({
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId ?? null,
    world: sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform,
    local: node.transform
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify(rows, null, 2));
