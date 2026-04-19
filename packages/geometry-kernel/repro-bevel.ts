import { createEditableMeshFromPolygons, bevelEditableMeshEdges, validateEditableMesh } from "./src/index.ts";
import { vec3 } from "@ggez/shared";

const cube = createEditableMeshFromPolygons([
  { id: "front", positions: [vec3(0,0,1), vec3(0,1,1), vec3(1,1,1), vec3(1,0,1)], vertexIds: ["e","h","g","f"] },
  { id: "back", positions: [vec3(0,0,0), vec3(1,0,0), vec3(1,1,0), vec3(0,1,0)], vertexIds: ["a","b","c","d"] },
  { id: "left", positions: [vec3(0,0,0), vec3(0,1,0), vec3(0,1,1), vec3(0,0,1)], vertexIds: ["a","d","h","e"] },
  { id: "right", positions: [vec3(1,0,0), vec3(1,0,1), vec3(1,1,1), vec3(1,1,0)], vertexIds: ["b","f","g","c"] },
  { id: "bottom", positions: [vec3(0,0,0), vec3(0,0,1), vec3(1,0,1), vec3(1,0,0)], vertexIds: ["a","e","f","b"] },
  { id: "top", positions: [vec3(0,1,0), vec3(1,1,0), vec3(1,1,1), vec3(0,1,1)], vertexIds: ["d","c","g","h"] }
]);

const result = bevelEditableMeshEdges(cube, [["e","f"]], 0.2, 2, "flat");
console.log(JSON.stringify({ ok: !!result, validation: result ? validateEditableMesh(result) : null, faceCount: result?.faces.length, vertexCount: result?.vertices.length }, null, 2));
