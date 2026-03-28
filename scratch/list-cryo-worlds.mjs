import fs from "fs";
import { resolveSceneGraph } from "../packages/shared/dist/index.js";

const scene = JSON.parse(
  fs.readFileSync("/Users/fairhat/Repositories/web-hammer/samples/aone/src/scenes/untitled-scene/scene.runtime.json", "utf8")
);
const sceneGraph = resolveSceneGraph(scene.nodes, scene.entities);
const rows = scene.nodes
  .filter(
    (node) =>
      (node.kind === "model" && String(node.data?.assetId ?? "").includes("cryo-chamber")) ||
      (node.kind === "instancing" && String(node.data?.sourceNodeId ?? "").includes("node:model:placed"))
  )
  .map((node) => ({
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId ?? null,
    local: node.transform,
    world: sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform
  }))
  .sort((left, right) => {
    const dz = (left.world.position.z ?? 0) - (right.world.position.z ?? 0);
    if (Math.abs(dz) > 0.0001) {
      return dz;
    }
    return (left.world.position.x ?? 0) - (right.world.position.x ?? 0);
  });

console.log(JSON.stringify(rows, null, 2));
