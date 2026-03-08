import type { Asset, GeometryNode, PrimitiveNode, Vec3 } from "@web-hammer/shared";
import { isPrimitiveNode, vec3 } from "@web-hammer/shared";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Vector3 } from "three";

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

export type ModelBounds = {
  center: Vec3;
  size: Vec3;
};

export type ModelFormat = "glb" | "obj";

export async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Failed to load ${file.name}.`));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function analyzeModelSource(input: {
  format?: ModelFormat;
  path: string;
}): Promise<ModelBounds> {
  const model =
    input.format === "obj"
      ? await objLoader.loadAsync(input.path)
      : (await gltfLoader.loadAsync(input.path)).scene;
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());

  return {
    center: vec3(center.x, center.y, center.z),
    size: vec3(
      Math.max(size.x, 0.001),
      Math.max(size.y, 0.001),
      Math.max(size.z, 0.001)
    )
  };
}

export function createModelAsset(input: {
  center: Vec3;
  format?: ModelFormat;
  name: string;
  path: string;
  size: Vec3;
  source: "ai" | "import" | "placeholder";
  prompt?: string;
  texturePath?: string;
}) {
  return {
    id: `asset:model:${slugify(input.name)}:${crypto.randomUUID()}`,
    metadata: {
      modelFormat: input.format ?? "glb",
      nativeCenterX: input.center.x,
      nativeCenterY: input.center.y,
      nativeCenterZ: input.center.z,
      nativeSizeX: input.size.x,
      nativeSizeY: input.size.y,
      nativeSizeZ: input.size.z,
      previewColor: input.source === "ai" ? "#9fd0b1" : "#7f8ea3",
      prompt: input.prompt ?? "",
      source: input.source,
      texturePath: input.texturePath ?? ""
    },
    path: input.path,
    type: "model"
  } satisfies Asset;
}

export function resolveModelBoundsFromAsset(asset: Asset | undefined): ModelBounds | undefined {
  if (!asset || asset.type !== "model") {
    return undefined;
  }

  const {
    nativeCenterX,
    nativeCenterY,
    nativeCenterZ,
    nativeSizeX,
    nativeSizeY,
    nativeSizeZ
  } = asset.metadata;

  if (
    typeof nativeCenterX !== "number" ||
    typeof nativeCenterY !== "number" ||
    typeof nativeCenterZ !== "number" ||
    typeof nativeSizeX !== "number" ||
    typeof nativeSizeY !== "number" ||
    typeof nativeSizeZ !== "number"
  ) {
    return undefined;
  }

  return {
    center: vec3(nativeCenterX, nativeCenterY, nativeCenterZ),
    size: vec3(nativeSizeX, nativeSizeY, nativeSizeZ)
  };
}

export function resolveModelFitScale(targetBounds: Vec3, modelBounds: ModelBounds) {
  return Math.max(
    0.001,
    Math.min(
      targetBounds.x / modelBounds.size.x,
      targetBounds.y / modelBounds.size.y,
      targetBounds.z / modelBounds.size.z
    )
  );
}

export function resolvePrimitiveNodeBounds(node: GeometryNode) {
  if (!isPrimitiveNode(node)) {
    return undefined;
  }

  return vec3(
    Math.abs(node.data.size.x * node.transform.scale.x),
    Math.abs(node.data.size.y * node.transform.scale.y),
    Math.abs(node.data.size.z * node.transform.scale.z)
  );
}

export function createAiModelPlaceholder(position: Vec3): Pick<PrimitiveNode, "data" | "name" | "transform"> {
  return {
    data: {
      materialId: "material:flat:steel",
      role: "prop",
      shape: "cube",
      size: vec3(2, 2, 2)
    },
    name: "AI Object Draft",
    transform: {
      pivot: undefined,
      position: vec3(position.x, position.y + 1, position.z),
      rotation: vec3(0, 0, 0),
      scale: vec3(1, 1, 1)
    }
  };
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
}
