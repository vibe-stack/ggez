import type { DerivedRenderMesh } from "@ggez/render-pipeline";
import {
  convexHull,
} from "crashcat";
import { createAuthoredColliderShape } from "./authored-collider-shapes";
import { createTriangleMeshShape } from "./triangle-mesh-shape";
import {
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3
} from "three";

export function buildAutoColliderShapeFromObject(
  mesh: DerivedRenderMesh,
  object: Object3D,
  instanceNodeId?: string
) {
  const authoredShape = createAuthoredColliderShape(mesh);

  if (authoredShape) {
    return authoredShape;
  }

  object.updateMatrixWorld(true);

  const bodyTransformInverse = new Matrix4().copy(createBodyTransformMatrix(mesh)).invert();
  const childMatrix = new Matrix4();
  const instanceMatrix = new Matrix4();
  const localPosition = new Vector3();
  const pivot = mesh.pivot ?? { x: 0, y: 0, z: 0 };
  const positions: number[] = [];
  const indices: number[] = [];

  object.traverse((child) => {
    if (!(child instanceof Mesh || child instanceof InstancedMesh)) {
      return;
    }

    if (!child.visible) {
      return;
    }

    const position = child.geometry.getAttribute("position");

    if (!position) {
      return;
    }

    if (child instanceof InstancedMesh) {
      const resolvedInstanceIndex = resolveInstancedMeshIndex(child, instanceNodeId);

      if (resolvedInstanceIndex < 0) {
        return;
      }

      child.getMatrixAt(resolvedInstanceIndex, instanceMatrix);
      childMatrix.copy(bodyTransformInverse).multiply(child.matrixWorld).multiply(instanceMatrix);
    } else {
      childMatrix.copy(bodyTransformInverse).multiply(child.matrixWorld);
    }

    const baseIndex = positions.length / 3;

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      localPosition
        .set(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex))
        .applyMatrix4(childMatrix);
      positions.push(
        localPosition.x - pivot.x,
        localPosition.y - pivot.y,
        localPosition.z - pivot.z
      );
    }

    const index = child.geometry.getIndex();

    if (index) {
      for (let indexOffset = 0; indexOffset < index.count; indexOffset += 1) {
        indices.push(baseIndex + index.getX(indexOffset));
      }

      return;
    }

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      indices.push(baseIndex + vertexIndex);
    }
  });

  if (positions.length < 9 || indices.length < 3) {
    return undefined;
  }

  if (mesh.physics?.colliderShape !== "trimesh") {
    return convexHull.create({ density: mesh.physics?.density, positions });
  }

  return createTriangleMeshShape({ indices, positions });
}

function resolveInstancedMeshIndex(mesh: InstancedMesh, instanceNodeId?: string) {
  if (!instanceNodeId) {
    return mesh.count > 0 ? 0 : -1;
  }

  const instanceNodeIds = (mesh.userData.webHammer as { instanceNodeIds?: string[] } | undefined)?.instanceNodeIds;

  if (!Array.isArray(instanceNodeIds)) {
    return -1;
  }

  return instanceNodeIds.indexOf(instanceNodeId);
}

function createBodyTransformMatrix(mesh: Pick<DerivedRenderMesh, "position" | "rotation" | "scale">) {
  return new Matrix4().compose(
    new Vector3(mesh.position.x, mesh.position.y, mesh.position.z),
    new Quaternion().setFromEuler(new Euler(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z)),
    new Vector3(1, 1, 1)
  );
}