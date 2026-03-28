import {
  createEditableMeshFromPolygons,
  type EditableMeshPolygon
} from "@ggez/geometry-kernel";
import {
  vec2,
  vec3,
  type Vec3,
  type PrimitiveNodeData,
  type MeshNode,
  type PrimitiveNode
} from "@ggez/shared";
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry
} from "three";

export function convertPrimitiveNodeToMeshNode(node: PrimitiveNode): MeshNode {
  return {
    id: node.id,
    kind: "mesh",
    name: node.name,
    transform: structuredClone(node.transform),
    data: createEditableMeshFromPrimitive(node)
  };
}

export function createEditableMeshFromPrimitiveData(data: PrimitiveNodeData, idPrefix = "primitive") {
  return createEditableMeshFromPrimitive({
    data,
    id: idPrefix,
    kind: "primitive",
    name: idPrefix,
    transform: {
      position: vec3(0, 0, 0),
      rotation: vec3(0, 0, 0),
      scale: vec3(1, 1, 1)
    }
  });
}

export function createEditableMeshFromPlane(size: Vec3, idPrefix = "plane", materialId = "material:blockout:orange") {
  return createEditableMeshFromPolygons(createPlanePolygons(idPrefix, size, materialId));
}

function createEditableMeshFromPrimitive(node: PrimitiveNode) {
  if (node.data.shape === "cube") {
    return attachPropMetadata(
      createEditableMeshFromPolygons(
        createBoxPolygons(node)
      ),
      node
    );
  }

  const geometry =
    node.data.shape === "sphere"
      ? new SphereGeometry(
          Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5,
          Math.max(8, node.data.radialSegments ?? 24),
          Math.max(6, Math.floor((node.data.radialSegments ?? 24) * 0.75))
        )
      : node.data.shape === "cylinder"
        ? new CylinderGeometry(
            Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5,
            Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5,
            Math.abs(node.data.size.y),
            Math.max(8, node.data.radialSegments ?? 24)
          )
        : new ConeGeometry(
            Math.max(Math.abs(node.data.size.x), Math.abs(node.data.size.z)) * 0.5,
            Math.abs(node.data.size.y),
            Math.max(8, node.data.radialSegments ?? 24)
          );

  try {
    return attachPropMetadata(
      createEditableMeshFromPolygons(
        createTrianglePolygons(node, geometry)
      ),
      node
    );
  } finally {
    geometry.dispose();
  }
}

function createBoxPolygons(node: PrimitiveNode): EditableMeshPolygon[] {
  const halfX = Math.abs(node.data.size.x) * 0.5;
  const halfY = Math.abs(node.data.size.y) * 0.5;
  const halfZ = Math.abs(node.data.size.z) * 0.5;
  const materialId = node.data.materialId;

  return [
    {
      id: `${node.id}:face:right`,
      materialId,
      positions: [
        vec3(halfX, -halfY, -halfZ),
        vec3(halfX, halfY, -halfZ),
        vec3(halfX, halfY, halfZ),
        vec3(halfX, -halfY, halfZ)
      ]
    },
    {
      id: `${node.id}:face:left`,
      materialId,
      positions: [
        vec3(-halfX, -halfY, halfZ),
        vec3(-halfX, halfY, halfZ),
        vec3(-halfX, halfY, -halfZ),
        vec3(-halfX, -halfY, -halfZ)
      ]
    },
    {
      id: `${node.id}:face:top`,
      materialId,
      positions: [
        vec3(-halfX, halfY, -halfZ),
        vec3(-halfX, halfY, halfZ),
        vec3(halfX, halfY, halfZ),
        vec3(halfX, halfY, -halfZ)
      ]
    },
    {
      id: `${node.id}:face:bottom`,
      materialId,
      positions: [
        vec3(-halfX, -halfY, halfZ),
        vec3(-halfX, -halfY, -halfZ),
        vec3(halfX, -halfY, -halfZ),
        vec3(halfX, -halfY, halfZ)
      ]
    },
    {
      id: `${node.id}:face:front`,
      materialId,
      positions: [
        vec3(-halfX, -halfY, halfZ),
        vec3(halfX, -halfY, halfZ),
        vec3(halfX, halfY, halfZ),
        vec3(-halfX, halfY, halfZ)
      ]
    },
    {
      id: `${node.id}:face:back`,
      materialId,
      positions: [
        vec3(halfX, -halfY, -halfZ),
        vec3(-halfX, -halfY, -halfZ),
        vec3(-halfX, halfY, -halfZ),
        vec3(halfX, halfY, -halfZ)
      ]
    }
  ];
}

function createPlanePolygons(idPrefix: string, size: Vec3, materialId?: string): EditableMeshPolygon[] {
  const halfX = Math.abs(size.x) * 0.5;
  const halfZ = Math.abs(size.z) * 0.5;

  return [
    {
      id: `${idPrefix}:face:top`,
      materialId,
      positions: [
        vec3(-halfX, 0, -halfZ),
        vec3(-halfX, 0, halfZ),
        vec3(halfX, 0, halfZ),
        vec3(halfX, 0, -halfZ)
      ]
    }
  ];
}

function createTrianglePolygons(
  node: PrimitiveNode,
  geometry: BoxGeometry | ConeGeometry | CylinderGeometry | SphereGeometry
): EditableMeshPolygon[] {
  const nonIndexed = geometry.toNonIndexed();
  const positions = nonIndexed.getAttribute("position");
  const uvAttribute = nonIndexed.getAttribute("uv");
  const polygons: EditableMeshPolygon[] = [];

  for (let index = 0; index < positions.count; index += 3) {
    polygons.push({
      id: `${node.id}:face:${index / 3}`,
      materialId: node.data.materialId,
      positions: [
        vec3(
          positions.getX(index),
          positions.getY(index),
          positions.getZ(index)
        ),
        vec3(
          positions.getX(index + 1),
          positions.getY(index + 1),
          positions.getZ(index + 1)
        ),
        vec3(
          positions.getX(index + 2),
          positions.getY(index + 2),
          positions.getZ(index + 2)
        )
      ],
      uvs: uvAttribute
        ? [
            vec2(uvAttribute.getX(index), uvAttribute.getY(index)),
            vec2(uvAttribute.getX(index + 1), uvAttribute.getY(index + 1)),
            vec2(uvAttribute.getX(index + 2), uvAttribute.getY(index + 2))
          ]
        : undefined
    });
  }

  nonIndexed.dispose();

  return polygons;
}

function attachPropMetadata(
  mesh: MeshNode["data"],
  node: PrimitiveNode
) {
  if (node.data.role !== "prop") {
    return mesh;
  }

  return {
    ...mesh,
    physics: structuredClone(node.data.physics),
    role: node.data.role
  };
}
