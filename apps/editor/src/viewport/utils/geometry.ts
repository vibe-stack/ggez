import { resolveTransformPivot, vec3, type Transform, type Vec3 } from "@ggez/shared";
import { BufferGeometry, Euler, Float32BufferAttribute, Object3D, Quaternion, Vector3 } from "three";
import type { DerivedSurfaceGroup } from "@ggez/render-pipeline";

export function createIndexedGeometry(
  positions: number[],
  indices?: number[],
  uvs?: number[],
  groups?: DerivedSurfaceGroup[],
  blendLayerWeights?: number[][],
  normals?: number[],
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  if (normals) {
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  }

  if (uvs) {
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }

  blendLayerWeights?.forEach((weights, index) => {
    geometry.setAttribute(`whBlendWeight${index}`, new Float32BufferAttribute(weights, 1));
  });

  const activeBlendAttributeNames = new Set((blendLayerWeights ?? []).map((_, index) => `whBlendWeight${index}`));
  Object.keys(geometry.attributes)
    .filter((attributeName) => attributeName.startsWith("whBlendWeight") && !activeBlendAttributeNames.has(attributeName))
    .forEach((attributeName) => geometry.deleteAttribute(attributeName));
  if (!blendLayerWeights?.length) {
    Object.keys(geometry.attributes)
      .filter((attributeName) => attributeName.startsWith("whBlendWeight"))
      .forEach((attributeName) => geometry.deleteAttribute(attributeName));
  }

  if (indices) {
    geometry.setIndex(indices);
  }

  geometry.clearGroups();
  groups?.forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  });

  return geometry;
}

export function addFaceOffset(origin: Vec3, normal: Vec3, distance: number): Vec3 {
  return vec3(origin.x + normal.x * distance, origin.y + normal.y * distance, origin.z + normal.z * distance);
}

export function objectToTransform(object: Object3D, pivot?: Vec3): Transform {
  return {
    position: vec3(object.position.x, object.position.y, object.position.z),
    pivot: pivot ? vec3(pivot.x, pivot.y, pivot.z) : undefined,
    rotation: vec3(object.rotation.x, object.rotation.y, object.rotation.z),
    scale: vec3(object.scale.x, object.scale.y, object.scale.z)
  };
}

export function rebaseTransformPivot(transform: Transform, nextPivot?: Vec3): Transform {
  const currentPivot = resolveTransformPivot(transform);
  const targetPivot = nextPivot ?? vec3(0, 0, 0);
  const offset = new Vector3(
    targetPivot.x - currentPivot.x,
    targetPivot.y - currentPivot.y,
    targetPivot.z - currentPivot.z
  )
    .multiply(new Vector3(transform.scale.x, transform.scale.y, transform.scale.z))
    .applyEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ"));

  return {
    ...structuredClone(transform),
    pivot:
      Math.abs(targetPivot.x) <= 0.0001 &&
      Math.abs(targetPivot.y) <= 0.0001 &&
      Math.abs(targetPivot.z) <= 0.0001
        ? undefined
        : vec3(targetPivot.x, targetPivot.y, targetPivot.z),
    position: vec3(
      transform.position.x + offset.x,
      transform.position.y + offset.y,
      transform.position.z + offset.z
    )
  };
}

export function composeTransformRotation(baselineRotation: Vec3, rotationDelta: Vec3): Vec3 {
  const baselineQuaternion = new Quaternion().setFromEuler(
    new Euler(baselineRotation.x, baselineRotation.y, baselineRotation.z, "XYZ")
  );
  const deltaQuaternion = new Quaternion().setFromEuler(
    new Euler(rotationDelta.x, rotationDelta.y, rotationDelta.z, "XYZ")
  );
  const composed = deltaQuaternion.multiply(baselineQuaternion);
  const nextRotation = new Euler().setFromQuaternion(composed, "XYZ");

  return vec3(nextRotation.x, nextRotation.y, nextRotation.z);
}

export function worldPointToNodeLocal(point: Vec3, transform: Transform): Vec3 {
  const pivot = resolveTransformPivot(transform);
  const position = new Vector3(transform.position.x, transform.position.y, transform.position.z);
  const quaternion = new Quaternion().setFromEuler(
    new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ")
  );
  const local = new Vector3(point.x, point.y, point.z)
    .sub(position)
    .applyQuaternion(quaternion.invert());

  local.x /= Math.abs(transform.scale.x) <= 0.0001 ? 1 : transform.scale.x;
  local.y /= Math.abs(transform.scale.y) <= 0.0001 ? 1 : transform.scale.y;
  local.z /= Math.abs(transform.scale.z) <= 0.0001 ? 1 : transform.scale.z;
  local.add(new Vector3(pivot.x, pivot.y, pivot.z));

  return vec3(local.x, local.y, local.z);
}

export function nodeLocalPointToWorld(point: Vec3, transform: Transform): Vec3 {
  const pivot = resolveTransformPivot(transform);
  const world = new Vector3(point.x, point.y, point.z)
    .sub(new Vector3(pivot.x, pivot.y, pivot.z))
    .multiply(new Vector3(transform.scale.x, transform.scale.y, transform.scale.z))
    .applyEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ"))
    .add(new Vector3(transform.position.x, transform.position.y, transform.position.z));

  return vec3(world.x, world.y, world.z);
}
