import { useMemo } from "react";
import {
  Box3,
  BoxGeometry, Color, Float32BufferAttribute, Matrix4,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D, SkinnedMesh, SRGBColorSpace,
  TextureLoader,
  Vector3,
  BufferGeometry,
  SphereGeometry,
  CylinderGeometry,
  ConeGeometry,
  BackSide,
  FrontSide,
  RepeatWrapping
} from "three";
import { createBlockoutTextureDataUri, HIGH_MODEL_LOD_LEVEL, MaterialRenderSide, resolveTransformPivot, type ModelAssetFile, type ModelLodLevel, type Vec3, type WorldLodSettings } from "@ggez/shared";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeletonScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  type DerivedInstancedMesh, type DerivedRenderMesh
} from "@ggez/render-pipeline";
import { toTuple } from "@ggez/shared";
import {
  renderModeUsesPreviewMaterials,
  renderModeUsesRenderableSurfaces, renderModeUsesSolidMaterials,
  type ViewportRenderMode
} from "@/viewport/viewports";
import { applyTextureVariationToStandardMaterial } from "@ggez/three-runtime";
import { applyMaterialLayersToStandardMaterial } from "@ggez/three-runtime";
import { createIndexedGeometry } from "./geometry";
import { Side } from "three";
import { DoubleSide } from "three";


export const previewTextureCache = new Map<string, ReturnType<TextureLoader["load"]>>();
export const modelSceneCache = new Map<string, Object3D>();
export const gltfLoader = new GLTFLoader();
export const mtlLoader = new MTLLoader();
export const modelTextureLoader = new TextureLoader();
export const tempInstanceObject = new Object3D();
export const tempInstanceMatrix = new Matrix4();
export const tempPivotMatrix = new Matrix4();
export const tempInstanceColor = new Color();
export const modelDistanceVector = new Vector3();
export const NOOP_HOVER_END = () => {};
export const NOOP_HOVER_START = (_nodeId: string) => {};

export function applyShadowCastingSide(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => applyShadowCastingSide(entry));
    return material;
  }

  if ("side" in material && material.side === DoubleSide) {
    material.shadowSide = FrontSide;
  } else {
    material.shadowSide = null;
  }

  return material;
}

export function resolvePhysicsColliderProps(physics: DerivedRenderMesh["physics"]) {
  if (!physics) {
    return {};
  }

  return {
    ...(physics.contactSkin !== undefined ? { contactSkin: physics.contactSkin } : {}),
    ...(physics.density !== undefined ? { density: physics.density } : physics.mass !== undefined ? { mass: physics.mass } : {}),
    ...(physics.friction !== undefined ? { friction: physics.friction } : {}),
    ...(physics.restitution !== undefined ? { restitution: physics.restitution } : {}),
    ...(physics.sensor !== undefined ? { sensor: physics.sensor } : {})
  };
}

export function useRenderableGeometry(mesh: DerivedRenderMesh, renderMode: ViewportRenderMode) {
  return useMemo(() => {
    let bufferGeometry: BufferGeometry | undefined;

    if (mesh.surface) {
      bufferGeometry = createIndexedGeometry(
        mesh.surface.positions,
        mesh.surface.indices,
        mesh.surface.uvs,
        mesh.surface.groups,
        mesh.surface.blendLayerWeights,
        mesh.surface.normals,
      );
    } else if (mesh.primitive?.kind === "box") {
      bufferGeometry = new BoxGeometry(...toTuple(mesh.primitive.size));
    } else if (mesh.primitive?.kind === "sphere") {
      bufferGeometry = new SphereGeometry(mesh.primitive.radius, mesh.primitive.widthSegments, mesh.primitive.heightSegments);
    } else if (mesh.primitive?.kind === "cylinder") {
      bufferGeometry = new CylinderGeometry(
        mesh.primitive.radiusTop,
        mesh.primitive.radiusBottom,
        mesh.primitive.height,
        mesh.primitive.radialSegments
      );
    } else if (mesh.primitive?.kind === "cone") {
      bufferGeometry = new ConeGeometry(mesh.primitive.radius, mesh.primitive.height, mesh.primitive.radialSegments);
    }

    if (!bufferGeometry) {
      return undefined;
    }

    if (renderModeUsesRenderableSurfaces(renderMode)) {
      if (!mesh.surface?.normals) {
        bufferGeometry.computeVertexNormals();
      }
    }
    bufferGeometry.computeBoundingBox();
    bufferGeometry.computeBoundingSphere();

    return bufferGeometry;
  }, [mesh.primitive, mesh.surface, renderMode]);
}

export function usePreviewMaterials(
  mesh: DerivedRenderMesh,
  renderMode: ViewportRenderMode,
  selected: boolean,
  hovered: boolean
) {
  return useMemo(() => {
    if (renderModeUsesPreviewMaterials(renderMode)) {
      const specs = mesh.materials ?? [mesh.material];
      return specs.map((spec) => createPreviewMaterial(spec, mesh.materialLayers, selected, hovered));
    }

    if (renderModeUsesSolidMaterials(renderMode)) {
      const specs = mesh.materials ?? [mesh.material];
      return specs.map((spec) => createSolidSurfaceMaterial(spec, selected, hovered));
    }

    return [];
  }, [hovered, mesh.material, mesh.materialLayers, mesh.materials, renderMode, selected]);
}

export function useInstancedPreviewMaterials(mesh: DerivedRenderMesh, renderMode: ViewportRenderMode) {
  return useMemo(() => {
    const specs = mesh.materials ?? [mesh.material];

    if (renderModeUsesPreviewMaterials(renderMode)) {
      return specs.map((spec) => createPreviewMaterial(spec, mesh.materialLayers, false, false));
    }

    if (renderModeUsesSolidMaterials(renderMode)) {
      return specs.map((spec) => createSolidSurfaceMaterial(spec, false, false, true));
    }

    return specs.map((spec) => new MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      side: resolvePreviewMaterialSide(spec.side),
      toneMapped: false,
      wireframe: true
    }));
  }, [mesh.material, mesh.materialLayers, mesh.materials, renderMode]);
}

export function resolveMeshPivot(mesh: DerivedRenderMesh) {
  return resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });
}

export function resolveIntersectedIds(intersections: Array<{ instanceId?: number; object: Object3D }>) {
  const ids: string[] = [];
  const seen = new Set<string>();

  intersections.forEach((intersection) => {
    const id =
      typeof intersection.instanceId === "number"
        ? resolveInstancedNodeIdFromObject(intersection.object, intersection.instanceId)
        : resolveSceneObjectIdFromObject(intersection.object);

    if (!id || seen.has(id)) {
      return;
    }

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

export function resolveSceneObjectIdFromObject(object: Object3D | null) {
  let current: Object3D | null = object;

  while (current) {
    if (current.name.startsWith("node:")) {
      return current.name.slice(5);
    }

    if (current.name.startsWith("entity:")) {
      return current.name.slice(7);
    }

    current = current.parent;
  }

  return undefined;
}

export function resolveInstancedNodeIdFromObject(object: Object3D | null, instanceId: number) {
  let current: Object3D | null = object;

  while (current) {
    const instanceNodeIds = (current.userData.webHammer as { instanceNodeIds?: string[] } | undefined)?.instanceNodeIds;

    if (Array.isArray(instanceNodeIds)) {
      return instanceNodeIds[instanceId];
    }

    current = current.parent;
  }

  return undefined;
}

export function createPreviewMaterial(
  spec: DerivedRenderMesh["material"],
  layers: DerivedRenderMesh["materialLayers"] | undefined,
  selected: boolean,
  hovered: boolean,
) {
  const colorTexture = resolvePreviewColorTexture(spec);
  const normalTexture = spec.normalTexture ? loadTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadTexture(spec.roughnessTexture, false) : undefined;
  const transparent = spec.transparent ?? false;
  const opacity = transparent ? spec.opacity ?? 1 : 1;

  const material = new MeshStandardMaterial({
    color: colorTexture ? "#ffffff" : hovered && !selected ? "#d8f4f0" : spec.color,
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : spec.emissiveColor ?? "#000000",
    emissiveIntensity: selected ? 0.08 : hovered ? 0.1 : spec.emissiveIntensity ?? 0,
    flatShading: spec.flatShaded,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    opacity,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    side: resolvePreviewMaterialSide(spec.side),
    transparent,
    wireframe: spec.wireframe,
    ...(colorTexture ? { map: colorTexture } : {}),
    ...(metalnessTexture ? { metalnessMap: metalnessTexture } : {}),
    ...(normalTexture ? { normalMap: normalTexture } : {}),
    ...(roughnessTexture ? { roughnessMap: roughnessTexture } : {})
  });

  applyMaterialLayersToStandardMaterial(material, layers?.map((layer) => ({
    color: layer.material.color,
    map: resolvePreviewColorTexture(layer.material),
    metalness: layer.material.metalness,
    metalnessMap: layer.material.metalnessTexture ? loadTexture(layer.material.metalnessTexture, false) : undefined,
    opacity: layer.opacity,
    roughness: layer.material.roughness,
    roughnessMap: layer.material.roughnessTexture ? loadTexture(layer.material.roughnessTexture, false) : undefined,
  })));
  applyTextureVariationToStandardMaterial(material, spec.textureVariation);
  applyShadowCastingSide(material);
  return material;
}

function resolvePreviewColorTexture(spec: DerivedRenderMesh["material"]) {
  if (spec.colorTexture) {
    return loadTexture(spec.colorTexture, true);
  }

  if (spec.category === "blockout") {
    return loadTexture(
      createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018),
      true,
    );
  }

  return undefined;
}

export function createSolidSurfaceMaterial(
  spec: DerivedRenderMesh["material"],
  selected: boolean,
  hovered: boolean,
  useInstanceColors = false
) {
  const material = new MeshStandardMaterial({
    color: useInstanceColors ? "#ffffff" : hovered && !selected ? "#d8f4f0" : "#d9e1e8",
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : "#000000",
    emissiveIntensity: selected ? 0.08 : hovered ? 0.08 : 0,
    flatShading: spec.flatShaded,
    metalness: 0.04,
    roughness: 0.88,
    side: resolvePreviewMaterialSide(spec.side)
  });

  applyShadowCastingSide(material);
  return material;
}

export function createSolidModelMaterial(material: Mesh["material"], selected: boolean, hovered: boolean) {
  if (Array.isArray(material)) {
    return material.map((entry) => createSolidSingleModelMaterial(entry, selected, hovered));
  }

  return createSolidSingleModelMaterial(material, selected, hovered);
}

export function createSolidSingleModelMaterial(material: Mesh["material"], selected: boolean, hovered: boolean) {
  const nextMaterial = new MeshStandardMaterial({
    color: hovered && !selected ? "#d8f4f0" : "#d9e1e8",
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : "#000000",
    emissiveIntensity: selected ? 0.08 : hovered ? 0.08 : 0,
    metalness: 0.04,
    roughness: 0.88,
    side: material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial ? material.side : DoubleSide
  });

  applyShadowCastingSide(nextMaterial);
  return nextMaterial;
}

export function resolvePreviewMaterialSide(side?: MaterialRenderSide): Side {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

export function disposePreviewMaterial(material: MeshStandardMaterial) {
  material.dispose();
}

export function disposeOwnedMaterial(material: Mesh["material"]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

export function loadTexture(source: string, isColor: boolean) {
  const cacheKey = `${isColor ? "color" : "data"}:${source}`;
  const cached = previewTextureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const texture = new TextureLoader().load(source);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  if (isColor) {
    texture.colorSpace = SRGBColorSpace;
  }

  previewTextureCache.set(cacheKey, texture);

  return texture;
}

export function resolveViewDirection(yaw: number, pitch: number, target: Vector3) {
  return target.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function computeBatchCenter(batch: DerivedInstancedMesh) {
  if (batch.instances.length === 0) {
    return { x: 0, y: 0, z: 0 } satisfies Vec3;
  }

  const total = batch.instances.reduce(
    (accumulator, instance) => ({
      x: accumulator.x + instance.position.x,
      y: accumulator.y + instance.position.y,
      z: accumulator.z + instance.position.z
    }),
    { x: 0, y: 0, z: 0 } satisfies Vec3
  );

  return {
    x: total.x / batch.instances.length,
    y: total.y / batch.instances.length,
    z: total.z / batch.instances.length
  } satisfies Vec3;
}

export function createPrimaryModelFile(mesh: DerivedRenderMesh): ModelAssetFile | undefined {
  if (!mesh.modelPath) {
    return undefined;
  }

  return {
    format: mesh.modelFormat === "obj" ? "obj" : mesh.modelFormat === "gltf" ? "gltf" : "glb",
    level: HIGH_MODEL_LOD_LEVEL,
    materialMtlText: mesh.modelMtlText,
    path: mesh.modelPath,
    texturePath: mesh.modelTexturePath
  };
}

export function resolveEditorModelLodLevel(files: ModelAssetFile[] | undefined, lodSettings: WorldLodSettings, distance: number): ModelLodLevel {
  if (!lodSettings.enabled) {
    return HIGH_MODEL_LOD_LEVEL;
  }

  let resolvedLevel: ModelLodLevel = HIGH_MODEL_LOD_LEVEL;

  [...lodSettings.levels]
    .sort((left, right) => left.distance - right.distance)
    .forEach((level) => {
      if (distance >= level.distance && files?.some((file) => file.level === level.id)) {
        resolvedLevel = level.id;
      }
    });

  return resolvedLevel;
}


export async function loadModelTexture(path: string) {
  const cached = previewTextureCache.get(path);

  if (cached) {
    return cached;
  }

  const texture = await modelTextureLoader.loadAsync(path);
  texture.colorSpace = SRGBColorSpace;
  previewTextureCache.set(path, texture);
  return texture;
}

export function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern =
    /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
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

export function computeModelBounds(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  return {
    center: { x: center.x, y: center.y, z: center.z },
    size: {
      x: Math.max(size.x, 0.001),
      y: Math.max(size.y, 0.001),
      z: Math.max(size.z, 0.001)
    }
  };
}

export function buildModelParts(scene: Object3D | undefined, _center: { x: number; y: number; z: number }, renderMode: ViewportRenderMode) {
  if (!scene) {
    return [] as Array<{
      disposeGeometry?: boolean;
      geometry: BufferGeometry;
      key: string;
      localMatrix: Matrix4;
      material: Mesh["material"];
      ownedMaterial?: boolean;
    }>;
  }

  const root = cloneModelSceneGraph(scene);
  root.updateMatrixWorld(true);

  const parts: Array<{
    disposeGeometry?: boolean;
    geometry: BufferGeometry;
    key: string;
    localMatrix: Matrix4;
    material: Mesh["material"];
    ownedMaterial?: boolean;
  }> = [];
  let partIndex = 0;

  root.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) {
      return;
    }

    const geometry = child instanceof SkinnedMesh ? bakeSkinnedMeshGeometry(child) : child.geometry;

    parts.push({
      disposeGeometry: child instanceof SkinnedMesh,
      geometry,
      key: `${partIndex}:${child.name || "mesh"}`,
      localMatrix: child.matrixWorld.clone(),
      material: renderModeUsesSolidMaterials(renderMode) ? createSolidModelMaterial(child.material, false, false) : child.material,
      ownedMaterial: renderModeUsesSolidMaterials(renderMode)
    });
    partIndex += 1;
  });

  return parts;
}

export function cloneModelSceneGraph(scene: Object3D) {
  const clone = cloneSkeletonScene(scene);
  clone.updateMatrixWorld(true);
  return clone;
}

export function bakeSkinnedMeshGeometry(mesh: SkinnedMesh) {
  const sourceGeometry = mesh.geometry;
  const positionAttribute = sourceGeometry.getAttribute("position");
  const bakedGeometry = sourceGeometry.clone();
  const bakedPositions = new Float32Array(positionAttribute.count * 3);
  const bakedVertex = new Vector3();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    mesh.getVertexPosition(index, bakedVertex);
    bakedPositions[index * 3] = bakedVertex.x;
    bakedPositions[index * 3 + 1] = bakedVertex.y;
    bakedPositions[index * 3 + 2] = bakedVertex.z;
  }

  bakedGeometry.setAttribute("position", new Float32BufferAttribute(bakedPositions, 3));
  bakedGeometry.deleteAttribute("skinIndex");
  bakedGeometry.deleteAttribute("skinWeight");
  bakedGeometry.deleteAttribute("normal");
  bakedGeometry.computeVertexNormals();
  bakedGeometry.computeBoundingBox();
  bakedGeometry.computeBoundingSphere();

  return bakedGeometry;
}

export function disposeOwnedSceneMaterials(scene: Object3D | undefined) {
  if (!scene) {
    return;
  }

  scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    disposeOwnedMaterial(child.material);
  });
}