import type { Asset, MaterialRenderSide, Transform, Vec3 } from "@ggez/shared";
import {
  BackSide,
  DoubleSide,
  Euler,
  FrontSide,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3
} from "three";
import type { WebHammerEngineNode, WebHammerExportMaterial } from "../types";

export function applyTransform(object: Object3D, transform: Transform) {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

const tempPivotMatrix = new Matrix4();
const tempInstancePosition = new Vector3();
const tempInstanceQuaternion = new Quaternion();
const tempInstanceScale = new Vector3();

export function composeGeometryInstanceMatrix(transform: Transform, pivot: Vec3) {
  return composeTransformMatrix(transform).multiply(
    tempPivotMatrix.makeTranslation(-pivot.x, -pivot.y, -pivot.z)
  );
}

export function composeTransformMatrix(transform: Transform) {
  tempInstancePosition.set(transform.position.x, transform.position.y, transform.position.z);
  tempInstanceQuaternion.setFromEuler(new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ"));
  tempInstanceScale.set(transform.scale.x, transform.scale.y, transform.scale.z);

  return new Matrix4().compose(tempInstancePosition, tempInstanceQuaternion, tempInstanceScale);
}

export function resolveMaterialSide(side?: WebHammerExportMaterial["side"] | MaterialRenderSide) {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

export function resolveModelFormat(format: unknown, path?: string): "gltf" | "obj" {
  if (typeof format === "string" && format.toLowerCase() === "obj") {
    return "obj";
  }

  return path?.toLowerCase().endsWith(".obj") ? "obj" : "gltf";
}

export function readAssetString(asset: Asset | undefined, key: string) {
  const value = asset?.metadata[key];
  return typeof value === "string" ? value : undefined;
}

export function readAssetVec3(asset: Asset | undefined, keyPrefix: "nativeCenter" | "nativeSize") {
  const x = asset?.metadata[`${keyPrefix}X`];
  const y = asset?.metadata[`${keyPrefix}Y`];
  const z = asset?.metadata[`${keyPrefix}Z`];

  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    return undefined;
  }

  return { x, y, z };
}

export function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern = /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap
    ? normalized
    : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}

export function isJsonGltfPath(path: string) {
  return stripUrlSearchAndHash(path).toLowerCase().endsWith(".gltf");
}

export function resolveAssetBasePath(path: string) {
  if (typeof window !== "undefined") {
    return new URL(".", new URL(path, window.location.href)).toString();
  }

  const normalizedPath = stripUrlSearchAndHash(path);
  const slashIndex = normalizedPath.lastIndexOf("/");
  return slashIndex >= 0 ? normalizedPath.slice(0, slashIndex + 1) : "";
}

export function stripUrlSearchAndHash(path: string) {
  const searchIndex = path.search(/[?#]/);
  return searchIndex >= 0 ? path.slice(0, searchIndex) : path;
}

export function computeInstancedBatchCenter(
  instances: Array<Extract<WebHammerEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof import("@ggez/shared").resolveSceneGraph>
) {
  if (instances.length === 0) {
    return new Vector3();
  }

  const center = new Vector3();

  instances.forEach((instance) => {
    const transform = sceneGraph.nodeWorldTransforms.get(instance.id) ?? instance.transform;
    center.x += transform.position.x;
    center.y += transform.position.y;
    center.z += transform.position.z;
  });

  center.multiplyScalar(1 / instances.length);
  return center;
}

export function extractPhysics(node: WebHammerEngineNode) {
  if (node.kind === "primitive") {
    return node.data.physics;
  }

  if (node.kind === "mesh") {
    return node.data.physics;
  }

  return undefined;
}

export function findPrimaryLight(object: Object3D) {
  let resolved: Object3D | undefined;

  object.traverse((child) => {
    if (!resolved && "isLight" in child && child.isLight) {
      resolved = child;
    }
  });

  return resolved;
}
