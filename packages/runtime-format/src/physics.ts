import type { RuntimePhysicsDescriptor, RuntimeScene } from "./types";

export function getRuntimePhysicsDescriptors(scene: Pick<RuntimeScene, "nodes">): RuntimePhysicsDescriptor[] {
  const descriptors: RuntimePhysicsDescriptor[] = [];

  scene.nodes.forEach((node) => {
    if (node.kind === "mesh" && node.data.physics?.enabled) {
      descriptors.push({
        node,
        nodeId: node.id,
        physics: node.data.physics
      });
    }

    if (node.kind === "primitive" && node.data.physics?.enabled) {
      descriptors.push({
        node,
        nodeId: node.id,
        physics: node.data.physics
      });
    }
  });

  return descriptors;
}
