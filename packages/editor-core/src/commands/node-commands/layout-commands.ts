import { computePolygonNormal, createEditableMeshFromPolygons } from "@ggez/geometry-kernel";
import type { EditableMeshPolygon } from "@ggez/geometry-kernel";
import type { GeometryNode, MeshNode, MetadataValue, Vec3 } from "@ggez/shared";
import { dotVec3, makeTransform, vec3 } from "@ggez/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";
import { createDuplicateNodeId } from "./helpers";

export type BlockoutDirection = "east" | "north" | "south" | "west";
export type BlockoutOpenSide = "bottom" | "east" | "north" | "south" | "top" | "west";

export type BlockoutPlatformSpec = {
  materialId?: string;
  metadata?: Record<string, MetadataValue>;
  name?: string;
  position: Vec3;
  size: Vec3;
  tags?: string[];
};

export type BlockoutRoomSpec = {
  materialId?: string;
  metadata?: Record<string, MetadataValue>;
  name?: string;
  openSides?: BlockoutOpenSide[];
  position: Vec3;
  size: Vec3;
  tags?: string[];
};

export type BlockoutStairSpec = {
  direction?: BlockoutDirection;
  landingDepth?: number;
  materialId?: string;
  metadata?: Record<string, MetadataValue>;
  name?: string;
  position: Vec3;
  stepCount: number;
  stepHeight: number;
  tags?: string[];
  topLandingDepth?: number;
  treadDepth: number;
  width: number;
};

export function createPlaceBlockoutPlatformCommand(
  scene: SceneDocument,
  spec: BlockoutPlatformSpec
): {
  command: Command;
  nodeId: string;
} {
  const nodeId = createDuplicateNodeId(scene, "node:blockout:platform");
  const materialId = spec.materialId ?? "material:blockout:concrete";
  const tags = dedupeTags(["blockout", "platform", ...(spec.tags ?? [])]);
  const metadata = { ...(spec.metadata ?? {}), blockoutKind: "platform" };
  const node = createBlockoutMeshNode({
    id: nodeId,
    materialId,
    metadata,
    mesh: createBoxMesh(spec.size, `${nodeId}:mesh`, materialId),
    name: spec.name ?? "Blockout Platform",
    position: spec.position,
    rotationY: 0,
    tags
  });

  return {
    command: createPlaceNodesCommand("place blockout platform", [node]),
    nodeId
  };
}

export function createPlaceBlockoutRoomCommand(
  scene: SceneDocument,
  spec: BlockoutRoomSpec
): {
  command: Command;
  groupId: string;
  nodeIds: string[];
} {
  const groupId = createDuplicateNodeId(scene, "group:blockout:room");
  const materialId = spec.materialId ?? "material:blockout:concrete";
  const tags = dedupeTags(["blockout", "room", ...(spec.tags ?? [])]);
  const metadata = {
    ...(spec.metadata ?? {}),
    blockoutGroup: groupId,
    blockoutKind: "room",
    blockoutPart: "shell"
  };
  const node = createBlockoutMeshNode({
    id: `${groupId}:shell`,
    materialId,
    metadata,
    mesh: createRoomShellMesh(spec.size, new Set(spec.openSides ?? []), `${groupId}:shell`, materialId),
    name: spec.name ?? "Blockout Room",
    position: spec.position,
    rotationY: 0,
    tags
  });

  return {
    command: createPlaceNodesCommand("place blockout room", [node]),
    groupId,
    nodeIds: [node.id]
  };
}

export function createPlaceBlockoutStairCommand(
  scene: SceneDocument,
  spec: BlockoutStairSpec
): {
  command: Command;
  groupId: string;
  nodeIds: string[];
  topLandingCenter: Vec3;
} {
  const direction = spec.direction ?? "north";
  const groupId = createDuplicateNodeId(scene, "group:blockout:stairs");
  const materialId = spec.materialId ?? "material:blockout:concrete";
  const landingDepth = Math.max(0.25, spec.landingDepth ?? spec.treadDepth * 1.25);
  const topLandingDepth = Math.max(0.25, spec.topLandingDepth ?? landingDepth);
  const totalRise = spec.stepCount * spec.stepHeight;
  const totalRun = spec.stepCount * spec.treadDepth;
  const tags = dedupeTags(["blockout", "connector", "stairs", ...(spec.tags ?? [])]);
  const metadata = {
    ...(spec.metadata ?? {}),
    blockoutDirection: direction,
    blockoutGroup: groupId,
    blockoutKind: "stairs",
    blockoutPart: "connector",
    blockoutRise: totalRise,
    blockoutRun: totalRun,
    blockoutSteps: spec.stepCount
  };
  const node = createBlockoutMeshNode({
    id: `${groupId}:mesh`,
    materialId,
    metadata,
    mesh: createStairMesh(
      {
        landingDepth,
        stepCount: spec.stepCount,
        stepHeight: spec.stepHeight,
        topLandingDepth,
        treadDepth: spec.treadDepth,
        width: spec.width
      },
      `${groupId}:mesh`,
      materialId
    ),
    name: spec.name ?? "Blockout Stairs",
    position: spec.position,
    rotationY: resolveDirectionRotation(direction),
    tags
  });

  return {
    command: createPlaceNodesCommand("place blockout stairs", [node]),
    groupId,
    nodeIds: [node.id],
    topLandingCenter: addHorizontalOffset(
      spec.position,
      direction,
      landingDepth * 0.5 + totalRun + topLandingDepth * 0.5,
      totalRise
    )
  };
}

function createBlockoutMeshNode(input: {
  id: string;
  materialId: string;
  metadata: Record<string, MetadataValue>;
  mesh: MeshNode["data"];
  name: string;
  position: Vec3;
  rotationY: number;
  tags: string[];
}): MeshNode {
  const transform = makeTransform(structuredClone(input.position));
  transform.rotation.y = input.rotationY;

  return {
    data: input.mesh,
    id: input.id,
    kind: "mesh",
    metadata: structuredClone(input.metadata),
    name: input.name,
    tags: [...input.tags],
    transform
  };
}

function createBoxMesh(size: Vec3, idPrefix: string, materialId: string) {
  const halfX = Math.max(0.05, Math.abs(size.x) * 0.5);
  const halfY = Math.max(0.05, Math.abs(size.y) * 0.5);
  const halfZ = Math.max(0.05, Math.abs(size.z) * 0.5);
  const polygons: EditableMeshPolygon[] = [
    createOrientedPolygon(
      `${idPrefix}:bottom`,
      [
        vec3(-halfX, -halfY, -halfZ),
        vec3(halfX, -halfY, -halfZ),
        vec3(halfX, -halfY, halfZ),
        vec3(-halfX, -halfY, halfZ)
      ],
      vec3(0, -1, 0)
    ),
    createOrientedPolygon(
      `${idPrefix}:top`,
      [
        vec3(-halfX, halfY, -halfZ),
        vec3(-halfX, halfY, halfZ),
        vec3(halfX, halfY, halfZ),
        vec3(halfX, halfY, -halfZ)
      ],
      vec3(0, 1, 0)
    ),
    createOrientedPolygon(
      `${idPrefix}:west`,
      [
        vec3(-halfX, -halfY, -halfZ),
        vec3(-halfX, -halfY, halfZ),
        vec3(-halfX, halfY, halfZ),
        vec3(-halfX, halfY, -halfZ)
      ],
      vec3(-1, 0, 0)
    ),
    createOrientedPolygon(
      `${idPrefix}:east`,
      [
        vec3(halfX, -halfY, -halfZ),
        vec3(halfX, halfY, -halfZ),
        vec3(halfX, halfY, halfZ),
        vec3(halfX, -halfY, halfZ)
      ],
      vec3(1, 0, 0)
    ),
    createOrientedPolygon(
      `${idPrefix}:north`,
      [
        vec3(-halfX, -halfY, -halfZ),
        vec3(-halfX, halfY, -halfZ),
        vec3(halfX, halfY, -halfZ),
        vec3(halfX, -halfY, -halfZ)
      ],
      vec3(0, 0, -1)
    ),
    createOrientedPolygon(
      `${idPrefix}:south`,
      [
        vec3(-halfX, -halfY, halfZ),
        vec3(halfX, -halfY, halfZ),
        vec3(halfX, halfY, halfZ),
        vec3(-halfX, halfY, halfZ)
      ],
      vec3(0, 0, 1)
    )
  ];

  return applyMaterialToMesh(createEditableMeshFromPolygons(polygons), polygons, materialId);
}

function createRoomShellMesh(size: Vec3, openSides: Set<BlockoutOpenSide>, idPrefix: string, materialId: string) {
  const halfWidth = Math.max(0.5, Math.abs(size.x) * 0.5);
  const depth = Math.max(1, Math.abs(size.z));
  const halfDepth = depth * 0.5;
  const height = Math.max(1, Math.abs(size.y));
  const polygons: EditableMeshPolygon[] = [];

  if (!openSides.has("bottom")) {
    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:floor`,
        [
          vec3(-halfWidth, 0, -halfDepth),
          vec3(-halfWidth, 0, halfDepth),
          vec3(halfWidth, 0, halfDepth),
          vec3(halfWidth, 0, -halfDepth)
        ],
        vec3(0, 1, 0)
      )
    );
  }

  if (!openSides.has("top")) {
    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:ceiling`,
        [
          vec3(-halfWidth, height, -halfDepth),
          vec3(halfWidth, height, -halfDepth),
          vec3(halfWidth, height, halfDepth),
          vec3(-halfWidth, height, halfDepth)
        ],
        vec3(0, -1, 0)
      )
    );
  }

  if (!openSides.has("west")) {
    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:wall:west`,
        [
          vec3(-halfWidth, 0, -halfDepth),
          vec3(-halfWidth, height, -halfDepth),
          vec3(-halfWidth, height, halfDepth),
          vec3(-halfWidth, 0, halfDepth)
        ],
        vec3(1, 0, 0)
      )
    );
  }

  if (!openSides.has("east")) {
    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:wall:east`,
        [
          vec3(halfWidth, 0, -halfDepth),
          vec3(halfWidth, 0, halfDepth),
          vec3(halfWidth, height, halfDepth),
          vec3(halfWidth, height, -halfDepth)
        ],
        vec3(-1, 0, 0)
      )
    );
  }

  if (!openSides.has("north")) {
    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:wall:north`,
        [
          vec3(-halfWidth, 0, -halfDepth),
          vec3(halfWidth, 0, -halfDepth),
          vec3(halfWidth, height, -halfDepth),
          vec3(-halfWidth, height, -halfDepth)
        ],
        vec3(0, 0, 1)
      )
    );
  }

  if (!openSides.has("south")) {
    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:wall:south`,
        [
          vec3(-halfWidth, 0, halfDepth),
          vec3(-halfWidth, height, halfDepth),
          vec3(halfWidth, height, halfDepth),
          vec3(halfWidth, 0, halfDepth)
        ],
        vec3(0, 0, -1)
      )
    );
  }

  return applyMaterialToMesh(createEditableMeshFromPolygons(polygons), polygons, materialId);
}

export function createStairMesh(
  spec: {
    landingDepth: number;
    stepCount: number;
    stepHeight: number;
    topLandingDepth: number;
    treadDepth: number;
    width: number;
  },
  idPrefix: string,
  materialId: string
) {
  const totalRun = spec.stepCount * spec.treadDepth;
  const totalRise = spec.stepCount * spec.stepHeight;
  const baseThickness = Math.max(0.2, Math.abs(spec.stepHeight));
  const startX = -spec.landingDepth * 0.5;
  const profile: Array<{ x: number; y: number }> = [
    { x: startX, y: -baseThickness },
    { x: startX, y: 0 },
    { x: spec.landingDepth * 0.5, y: 0 }
  ];

  for (let stepIndex = 1; stepIndex <= spec.stepCount; stepIndex += 1) {
    profile.push({
      x: spec.landingDepth * 0.5 + (stepIndex - 1) * spec.treadDepth,
      y: stepIndex * spec.stepHeight
    });
    profile.push({
      x: spec.landingDepth * 0.5 + stepIndex * spec.treadDepth,
      y: stepIndex * spec.stepHeight
    });
  }

  profile.push({
    x: spec.landingDepth * 0.5 + totalRun + spec.topLandingDepth,
    y: totalRise
  });
  profile.push({
    x: spec.landingDepth * 0.5 + totalRun + spec.topLandingDepth,
    y: -baseThickness
  });

  const outline = compactProfile(profile);

  const halfWidth = spec.width * 0.5;
  const polygons: EditableMeshPolygon[] = [
    createOrientedPolygon(
      `${idPrefix}:cap:front`,
      outline.map((point) => vec3(point.x, point.y, -halfWidth)),
      vec3(0, 0, -1)
    ),
    createOrientedPolygon(
      `${idPrefix}:cap:back`,
      outline.map((point) => vec3(point.x, point.y, halfWidth)),
      vec3(0, 0, 1)
    )
  ];

  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];

    polygons.push(
      createOrientedPolygon(
        `${idPrefix}:side:${index}`,
        [
          vec3(current.x, current.y, -halfWidth),
          vec3(current.x, current.y, halfWidth),
          vec3(next.x, next.y, halfWidth),
          vec3(next.x, next.y, -halfWidth)
        ],
        quadNormalFromEdge(current, next)
      )
    );
  }

  return applyMaterialToMesh(createEditableMeshFromPolygons(polygons), polygons, materialId);
}

function quadNormalFromEdge(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const edge = vec3(end.x - start.x, end.y - start.y, 0);
  return vec3(-edge.y, edge.x, 0);
}

function compactProfile(points: Array<{ x: number; y: number }>, epsilon = 0.0001) {
  return points.reduce<Array<{ x: number; y: number }>>((collection, point) => {
    const previous = collection[collection.length - 1];

    if (previous && Math.abs(previous.x - point.x) <= epsilon && Math.abs(previous.y - point.y) <= epsilon) {
      return collection;
    }

    collection.push(point);
    return collection;
  }, []);
}

function applyMaterialToMesh(mesh: MeshNode["data"], polygons: EditableMeshPolygon[], defaultMaterialId: string) {
  mesh.faces.forEach((face, index) => {
    face.materialId = polygons[index]?.materialId ?? defaultMaterialId;
  });
  return mesh;
}

function createPlaceNodesCommand(label: string, nodes: GeometryNode[]): Command {
  return {
    label,
    execute(nextScene) {
      nodes.forEach((node) => {
        nextScene.addNode(structuredClone(node));
      });
    },
    undo(nextScene) {
      nodes.forEach((node) => {
        nextScene.removeNode(node.id);
      });
    }
  };
}

function createOrientedPolygon(id: string, positions: Vec3[], desiredNormal: Vec3): EditableMeshPolygon {
  const normal = computePolygonNormal(positions);

  return {
    id,
    positions: dotVec3(normal, desiredNormal) >= 0 ? positions : positions.slice().reverse()
  };
}

function addHorizontalOffset(origin: Vec3, direction: BlockoutDirection, amount: number, yOffset: number) {
  const offset = resolveDirectionOffset(direction, amount);
  return vec3(origin.x + offset.x, origin.y + yOffset, origin.z + offset.z);
}

function resolveDirectionOffset(direction: BlockoutDirection, amount: number) {
  if (direction === "east") {
    return vec3(amount, 0, 0);
  }

  if (direction === "west") {
    return vec3(-amount, 0, 0);
  }

  if (direction === "south") {
    return vec3(0, 0, amount);
  }

  return vec3(0, 0, -amount);
}

function resolveDirectionRotation(direction: BlockoutDirection) {
  if (direction === "east") {
    return 0;
  }

  if (direction === "south") {
    return Math.PI * 0.5;
  }

  if (direction === "west") {
    return Math.PI;
  }

  return -Math.PI * 0.5;
}

function dedupeTags(tags: string[]) {
  return Array.from(new Set(tags));
}
