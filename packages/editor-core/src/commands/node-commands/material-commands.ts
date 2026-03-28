import type { Brush, EditableMesh, Face, Material, PrimitiveNodeData, Vec2 } from "@ggez/shared";
import { isBrushNode, isMeshNode, isPrimitiveNode } from "@ggez/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";

export type MaterialTarget = {
  faceIds?: string[];
  nodeId: string;
};

export function createUpsertMaterialCommand(scene: SceneDocument, material: Material): Command {
  const before = scene.materials.get(material.id);
  const next = structuredClone(material);

  return {
    label: before ? "update material" : "create material",
    execute(nextScene) {
      nextScene.setMaterial(structuredClone(next));
    },
    undo(nextScene) {
      if (before) {
        nextScene.setMaterial(structuredClone(before));
        return;
      }

      nextScene.removeMaterial(material.id);
    }
  };
}

export function createDeleteMaterialCommand(
  scene: SceneDocument,
  materialId: string,
  fallbackMaterialId: string
): Command {
  const material = scene.materials.get(materialId);

  if (!material) {
    return {
      label: "delete material",
      execute() {},
      undo() {}
    };
  }

  const affectedNodes: Array<{
    before: Brush | EditableMesh | PrimitiveNodeData;
    kind: "brush" | "mesh" | "primitive";
    next: Brush | EditableMesh | PrimitiveNodeData;
    nodeId: string;
  }> = [];

  Array.from(scene.nodes.values()).forEach((node) => {
      if (isBrushNode(node)) {
        affectedNodes.push({
          before: structuredClone(node.data),
          kind: "brush",
          nodeId: node.id,
          next: {
            ...structuredClone(node.data),
            faces: node.data.faces.map((face) =>
              face.materialId === materialId
                ? {
                    ...face,
                    materialId: fallbackMaterialId
                  }
                : structuredClone(face)
            )
          } satisfies Brush
        });
        return;
      }

      if (isMeshNode(node)) {
        affectedNodes.push({
          before: structuredClone(node.data),
          kind: "mesh",
          nodeId: node.id,
          next: {
            ...structuredClone(node.data),
            faces: node.data.faces.map((face) =>
              face.materialId === materialId
                ? {
                    ...face,
                    materialId: fallbackMaterialId
                  }
                : structuredClone(face)
            )
          } satisfies EditableMesh
        });
        return;
      }

      if (isPrimitiveNode(node) && node.data.materialId === materialId) {
        affectedNodes.push({
          before: structuredClone(node.data),
          kind: "primitive",
          nodeId: node.id,
          next: {
            ...structuredClone(node.data),
            materialId: fallbackMaterialId
          } satisfies PrimitiveNodeData
        });
      }
    });

  return {
    label: "delete material",
    execute(nextScene) {
      affectedNodes.forEach((entry) => {
        const node = nextScene.getNode(entry.nodeId);

        if (node && isBrushNode(node) && entry.kind === "brush") {
          node.data = structuredClone(entry.next as Brush);
          nextScene.touch();
        }

        if (node && isMeshNode(node) && entry.kind === "mesh") {
          node.data = structuredClone(entry.next as EditableMesh);
          nextScene.touch();
        }

        if (node && isPrimitiveNode(node) && entry.kind === "primitive") {
          node.data = structuredClone(entry.next as PrimitiveNodeData);
          nextScene.touch();
        }
      });

      nextScene.removeMaterial(materialId);
    },
    undo(nextScene) {
      nextScene.setMaterial(structuredClone(material));

      affectedNodes.forEach((entry) => {
        const node = nextScene.getNode(entry.nodeId);

        if (node && isBrushNode(node) && entry.kind === "brush") {
          node.data = structuredClone(entry.before as Brush);
          nextScene.touch();
        }

        if (node && isMeshNode(node) && entry.kind === "mesh") {
          node.data = structuredClone(entry.before as EditableMesh);
          nextScene.touch();
        }

        if (node && isPrimitiveNode(node) && entry.kind === "primitive") {
          node.data = structuredClone(entry.before as PrimitiveNodeData);
          nextScene.touch();
        }
      });
    }
  };
}

export function createAssignMaterialCommand(
  scene: SceneDocument,
  targets: MaterialTarget[],
  materialId: string
): Command {
  const snapshots = targets
    .map((target) =>
      buildPrimitiveMutationSnapshot(scene, target, (data) => ({
        ...data,
        materialId
      })) ??
      buildFaceMutationSnapshot(scene, target, (face) => ({
        ...face,
        materialId
      }))
    )
    .filter((snapshot): snapshot is FaceMutationSnapshot => Boolean(snapshot));

  return createFaceMutationCommand("assign material", snapshots);
}

export function createSetUvScaleCommand(
  scene: SceneDocument,
  targets: MaterialTarget[],
  uvScale: Vec2
): Command {
  const snapshots = targets
    .map((target) =>
      buildPrimitiveMutationSnapshot(scene, target, (data) => ({
        ...data,
        uvScale: { x: uvScale.x, y: uvScale.y }
      })) ??
      buildFaceMutationSnapshot(scene, target, (face) =>
        clearExplicitUvs({
          ...face,
          uvScale: { x: uvScale.x, y: uvScale.y }
        })
      )
    )
    .filter((snapshot): snapshot is FaceMutationSnapshot => Boolean(snapshot));

  return createFaceMutationCommand("set uv scale", snapshots);
}

export function createSetUvOffsetCommand(
  scene: SceneDocument,
  targets: MaterialTarget[],
  uvOffset: Vec2
): Command {
  const snapshots = targets
    .map((target) =>
      buildFaceMutationSnapshot(scene, target, (face) =>
        clearExplicitUvs({
          ...face,
          uvOffset: { x: uvOffset.x, y: uvOffset.y }
        })
      )
    )
    .filter((snapshot): snapshot is FaceMutationSnapshot => Boolean(snapshot));

  return createFaceMutationCommand("set uv offset", snapshots);
}

function clearExplicitUvs(face: Face | EditableMesh["faces"][number]) {
  if ("halfEdge" in face) {
    return {
      ...face,
      uvs: undefined
    } satisfies EditableMesh["faces"][number];
  }

  return face;
}

type FaceMutationSnapshot =
  | {
      before: Face[];
      faceIds?: string[];
      kind: "brush";
      next: Face[];
      nodeId: string;
    }
  | {
      before: EditableMesh["faces"];
      faceIds?: string[];
      kind: "mesh";
      next: EditableMesh["faces"];
      nodeId: string;
    }
  | {
      before: PrimitiveNodeData;
      kind: "primitive";
      next: PrimitiveNodeData;
      nodeId: string;
    };

function buildFaceMutationSnapshot(
  scene: SceneDocument,
  target: MaterialTarget,
  mutate: (face: Face | EditableMesh["faces"][number]) => Face | EditableMesh["faces"][number]
): FaceMutationSnapshot | undefined {
  const node = scene.getNode(target.nodeId);
  const faceSet = target.faceIds ? new Set(target.faceIds) : undefined;

  if (node && isBrushNode(node)) {
    const sourceFaces = resolveBrushFaces(node.data.faces, node.data.planes, target.nodeId);

    return {
      before: structuredClone(node.data.faces),
      faceIds: target.faceIds,
      kind: "brush",
      next: sourceFaces.map((face) =>
        !faceSet || faceSet.has(face.id) ? (mutate(face) as Face) : structuredClone(face)
      ),
      nodeId: target.nodeId
    };
  }

  if (node && isMeshNode(node)) {
    return {
      before: structuredClone(node.data.faces),
      faceIds: target.faceIds,
      kind: "mesh",
      next: node.data.faces.map((face) =>
        !faceSet || faceSet.has(face.id) ? (mutate(face) as EditableMesh["faces"][number]) : structuredClone(face)
      ),
      nodeId: target.nodeId
    };
  }

  return undefined;
}

function buildPrimitiveMutationSnapshot(
  scene: SceneDocument,
  target: MaterialTarget,
  mutate: (data: PrimitiveNodeData) => PrimitiveNodeData
): FaceMutationSnapshot | undefined {
  const node = scene.getNode(target.nodeId);

  if (!node || !isPrimitiveNode(node) || target.faceIds?.length) {
    return undefined;
  }

  return {
    before: structuredClone(node.data),
    kind: "primitive",
    next: mutate(structuredClone(node.data)),
    nodeId: target.nodeId
  };
}

function resolveBrushFaces(existingFaces: Face[], planes: Brush["planes"], nodeId: string): Face[] {
  if (existingFaces.length >= planes.length) {
    return existingFaces;
  }

  return planes.map((plane, index) => ({
    id: existingFaces[index]?.id ?? `face:${nodeId}:${index}`,
    materialId: existingFaces[index]?.materialId,
    plane,
    uvOffset: existingFaces[index]?.uvOffset,
    uvScale: existingFaces[index]?.uvScale,
    vertexIds: existingFaces[index]?.vertexIds ?? []
  }));
}

function createFaceMutationCommand(label: string, snapshots: FaceMutationSnapshot[]): Command {
  return {
    label,
    execute(nextScene) {
      snapshots.forEach((snapshot) => {
        const node = nextScene.getNode(snapshot.nodeId);

        if (node && isBrushNode(node) && snapshot.kind === "brush") {
          node.data.faces = structuredClone(snapshot.next);
          nextScene.touch();
        }

        if (node && isMeshNode(node) && snapshot.kind === "mesh") {
          node.data.faces = structuredClone(snapshot.next);
          nextScene.touch();
        }

        if (node && isPrimitiveNode(node) && snapshot.kind === "primitive") {
          node.data = structuredClone(snapshot.next);
          nextScene.touch();
        }
      });
    },
    undo(nextScene) {
      snapshots.forEach((snapshot) => {
        const node = nextScene.getNode(snapshot.nodeId);

        if (node && isBrushNode(node) && snapshot.kind === "brush") {
          node.data.faces = structuredClone(snapshot.before);
          nextScene.touch();
        }

        if (node && isMeshNode(node) && snapshot.kind === "mesh") {
          node.data.faces = structuredClone(snapshot.before);
          nextScene.touch();
        }

        if (node && isPrimitiveNode(node) && snapshot.kind === "primitive") {
          node.data = structuredClone(snapshot.before);
          nextScene.touch();
        }
      });
    }
  };
}
