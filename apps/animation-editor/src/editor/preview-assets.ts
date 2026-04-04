import { createRigDefinition, type AnimationClipAsset, type PoseBuffer, type RigDefinition } from "@ggez/anim-core";
import type { ClipReference, SerializableRig } from "@ggez/anim-schema";
import { createClipAssetFromThreeClip } from "@ggez/anim-three";
import { Bone, Matrix4, Quaternion, Skeleton, Vector3, type AnimationClip, type Object3D } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { createConfiguredGLTFLoader } from "./gltf-loader";

const gltfLoader = createConfiguredGLTFLoader();

const fbxLoader = new FBXLoader();

export interface ImportedPreviewClip {
  id: string;
  name: string;
  duration: number;
  source: string;
  sourceFile?: File;
  asset: AnimationClipAsset;
  reference: ClipReference;
}

export interface ImportedCharacterAsset {
  fileName: string;
  scene: Object3D;
  skeleton: Skeleton;
  rig: RigDefinition;
  documentRig: SerializableRig;
  clips: ImportedPreviewClip[];
}

interface LoadedAnimationSource {
  root: Object3D;
  animations: AnimationClip[];
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function slugifyClipId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "clip";
}

function makeUniqueClipId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) {
    existingIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  const uniqueId = `${baseId}-${suffix}`;
  existingIds.add(uniqueId);
  return uniqueId;
}

export function serializeRigDefinition(rig: RigDefinition): SerializableRig {
  return {
    boneNames: [...rig.boneNames],
    parentIndices: Array.from(rig.parentIndices),
    rootBoneIndex: rig.rootBoneIndex,
    bindTranslations: Array.from(rig.bindTranslations),
    bindRotations: Array.from(rig.bindRotations),
    bindScales: Array.from(rig.bindScales),
  };
}

export function createSceneRigFromSkeleton(skeleton: Skeleton): RigDefinition {
  skeleton.bones.forEach((bone) => bone.parent?.updateMatrixWorld(true));

  const boneNames = skeleton.bones.map((bone) => bone.name || `bone-${bone.id}`);
  const parentIndices = skeleton.bones.map((bone) => {
    const parentBone = findNearestAncestorBone(bone.parent);
    if (!parentBone) {
      return -1;
    }

    return skeleton.bones.indexOf(parentBone);
  });
  const rootBoneIndex = Math.max(0, parentIndices.findIndex((parentIndex) => parentIndex < 0));
  const bindTranslations: number[] = [];
  const bindRotations: number[] = [];
  const bindScales: number[] = [];
  const localMatrix = new Matrix4();
  const parentInverseMatrix = new Matrix4();
  const translation = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();

  skeleton.bones.forEach((bone, boneIndex) => {
    bone.updateMatrixWorld(true);
    const parentIndex = parentIndices[boneIndex] ?? -1;
    if (parentIndex >= 0) {
      parentInverseMatrix.copy(skeleton.bones[parentIndex]!.matrixWorld).invert();
      localMatrix.multiplyMatrices(parentInverseMatrix, bone.matrixWorld);
    } else {
      localMatrix.copy(bone.matrixWorld);
    }

    localMatrix.decompose(translation, rotation, scale);
    bindTranslations.push(translation.x, translation.y, translation.z);
    bindRotations.push(rotation.x, rotation.y, rotation.z, rotation.w);
    bindScales.push(scale.x, scale.y, scale.z);
  });

  return createRigDefinition({
    boneNames,
    parentIndices,
    rootBoneIndex,
    bindTranslations,
    bindRotations,
    bindScales,
  });
}

function findTopmostBoneAncestor(bone: Bone): Bone {
  let current: Object3D | null = bone;
  let topmost = bone;

  while (current) {
    if (current instanceof Bone) {
      topmost = current;
    }

    current = current.parent;
  }

  return topmost;
}

function findNearestAncestorBone(object: Object3D | null): Bone | null {
  let current = object;

  while (current) {
    if (current instanceof Bone) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

function hasCanonicalParentSpaceConversion(bone: Bone): boolean {
  const effectiveParentBone = findNearestAncestorBone(bone.parent);
  return (!effectiveParentBone && Boolean(bone.parent)) || (effectiveParentBone !== null && effectiveParentBone !== bone.parent);
}

function collectBoneHierarchy(rootBone: Bone, ordered: Bone[], visited: Set<Bone>): void {
  if (visited.has(rootBone)) {
    return;
  }

  visited.add(rootBone);
  ordered.push(rootBone);

  rootBone.children.forEach((child) => {
    if (child instanceof Bone) {
      collectBoneHierarchy(child, ordered, visited);
    }
  });
}

function expandSkeletonBones(skeleton: Skeleton): Bone[] {
  const ordered: Bone[] = [];
  const visited = new Set<Bone>();
  const rootBones = new Set<Bone>();

  skeleton.bones.forEach((bone) => {
    if (bone) {
      rootBones.add(findTopmostBoneAncestor(bone));
    }
  });

  rootBones.forEach((rootBone) => collectBoneHierarchy(rootBone, ordered, visited));

  return ordered.length > 0 ? ordered : skeleton.bones.filter((bone): bone is Bone => Boolean(bone));
}

export function findPrimarySkeleton(root: Object3D): Skeleton | null {
  root.updateMatrixWorld(true);

  let bestBones: Bone[] | null = null;
  const boneInversesByBone = new Map<Bone, Matrix4>();

  root.traverse((child) => {
    const candidate = child as Object3D & {
      isSkinnedMesh?: boolean;
      skeleton?: Skeleton;
    };

    if (candidate.isSkinnedMesh && candidate.skeleton) {
      candidate.skeleton.bones.forEach((bone, boneIndex) => {
        const inverse = candidate.skeleton?.boneInverses[boneIndex];
        if (bone && inverse && !boneInversesByBone.has(bone)) {
          boneInversesByBone.set(bone, inverse.clone());
        }
      });

      const expandedBones = expandSkeletonBones(candidate.skeleton);

      if (!bestBones || expandedBones.length > bestBones.length) {
        bestBones = expandedBones;
      }
    }
  });

  const resolvedBones: Bone[] = bestBones ?? [];

  if (resolvedBones.length === 0) {
    return null;
  }

  const boneInverses = resolvedBones.map((bone) => boneInversesByBone.get(bone)?.clone() ?? bone.matrixWorld.clone().invert());
  return new Skeleton(resolvedBones, boneInverses);
}

export function preparePreviewObject(root: Object3D): void {
  root.traverse((child) => {
    const candidate = child as Object3D & {
      frustumCulled?: boolean;
      isMesh?: boolean;
      isSkinnedMesh?: boolean;
    };

    if (candidate.isSkinnedMesh || candidate.isMesh) {
      candidate.frustumCulled = false;
    }
  });
}

export function applyPoseBufferToSceneBones(pose: PoseBuffer, rig: RigDefinition, root: Object3D): void {
  const bonesByName = new Map<string, Bone[]>();
  const parentInverseMatrix = new Matrix4();
  const composedMatrix = new Matrix4();
  const worldTranslation = new Vector3();
  const worldRotation = new Quaternion();
  const worldScale = new Vector3();
  const localTranslation = new Vector3();
  const localRotation = new Quaternion();
  const localScale = new Vector3();

  root.traverse((child) => {
    if (!(child instanceof Bone)) {
      return;
    }

    const matches = bonesByName.get(child.name);
    if (matches) {
      matches.push(child);
      return;
    }

    bonesByName.set(child.name, [child]);
  });

  const updatedRoots = new Set<Bone>();

  rig.boneNames.forEach((boneName, boneIndex) => {
    const matchingBones = bonesByName.get(boneName);
    if (!matchingBones || matchingBones.length === 0) {
      return;
    }

    const vectorOffset = boneIndex * 3;
    const quaternionOffset = boneIndex * 4;

    matchingBones.forEach((bone) => {
      if (hasCanonicalParentSpaceConversion(bone) && bone.parent) {
        const effectiveParentBone = findNearestAncestorBone(bone.parent);
        if (effectiveParentBone) {
          effectiveParentBone.updateMatrixWorld(true);
          parentInverseMatrix.copy(bone.parent.matrixWorld).invert().multiply(effectiveParentBone.matrixWorld);
        } else {
          bone.parent.updateMatrixWorld(true);
          parentInverseMatrix.copy(bone.parent.matrixWorld).invert();
        }

        worldTranslation.set(
          pose.translations[vectorOffset]!,
          pose.translations[vectorOffset + 1]!,
          pose.translations[vectorOffset + 2]!
        );
        worldRotation.set(
          pose.rotations[quaternionOffset]!,
          pose.rotations[quaternionOffset + 1]!,
          pose.rotations[quaternionOffset + 2]!,
          pose.rotations[quaternionOffset + 3]!
        );
        worldScale.set(
          pose.scales[vectorOffset]!,
          pose.scales[vectorOffset + 1]!,
          pose.scales[vectorOffset + 2]!
        );
        composedMatrix.compose(worldTranslation, worldRotation, worldScale);
        composedMatrix.premultiply(parentInverseMatrix);
        composedMatrix.decompose(localTranslation, localRotation, localScale);
        bone.position.copy(localTranslation);
        bone.quaternion.copy(localRotation);
        bone.scale.copy(localScale);
      } else {
        bone.position.set(
          pose.translations[vectorOffset]!,
          pose.translations[vectorOffset + 1]!,
          pose.translations[vectorOffset + 2]!
        );
        bone.quaternion.set(
          pose.rotations[quaternionOffset]!,
          pose.rotations[quaternionOffset + 1]!,
          pose.rotations[quaternionOffset + 2]!,
          pose.rotations[quaternionOffset + 3]!
        );
        bone.scale.set(
          pose.scales[vectorOffset]!,
          pose.scales[vectorOffset + 1]!,
          pose.scales[vectorOffset + 2]!
        );
      }
      bone.updateMatrix();
      updatedRoots.add(findTopmostBoneAncestor(bone));
    });
  });

  updatedRoots.forEach((rootBone) => rootBone.updateMatrixWorld(true));
}

function readRigTranslation(rig: RigDefinition, boneIndex: number, out: Vector3): Vector3 {
  const offset = boneIndex * 3;
  return out.set(rig.bindTranslations[offset] ?? 0, rig.bindTranslations[offset + 1] ?? 0, rig.bindTranslations[offset + 2] ?? 0);
}

function readRigRotation(rig: RigDefinition, boneIndex: number, out: Quaternion): Quaternion {
  const offset = boneIndex * 4;
  return out.set(
    rig.bindRotations[offset] ?? 0,
    rig.bindRotations[offset + 1] ?? 0,
    rig.bindRotations[offset + 2] ?? 0,
    rig.bindRotations[offset + 3] ?? 1
  );
}

function readRigScale(rig: RigDefinition, boneIndex: number, out: Vector3): Vector3 {
  const offset = boneIndex * 3;
  return out.set(rig.bindScales[offset] ?? 1, rig.bindScales[offset + 1] ?? 1, rig.bindScales[offset + 2] ?? 1);
}

function normalizeRigBoneName(name: string): string {
  return name.trim().toLowerCase().replace(/_\d+$/, "");
}

function hasNumericBoneSuffix(name: string): boolean {
  return /_\d+$/.test(name.trim());
}

function getRigBoneExternalChildCount(rig: RigDefinition, boneIndex: number): number {
  const familyName = normalizeRigBoneName(rig.boneNames[boneIndex] ?? "");
  let count = 0;

  rig.parentIndices.forEach((parentIndex, childIndex) => {
    if (parentIndex !== boneIndex) {
      return;
    }

    if (normalizeRigBoneName(rig.boneNames[childIndex] ?? "") !== familyName) {
      count += 1;
    }
  });

  return count;
}

function getRigBoneLocalActivity(rig: RigDefinition, boneIndex: number): number {
  const translationOffset = boneIndex * 3;
  const rotationOffset = boneIndex * 4;
  const scaleOffset = boneIndex * 3;
  const tx = rig.bindTranslations[translationOffset] ?? 0;
  const ty = rig.bindTranslations[translationOffset + 1] ?? 0;
  const tz = rig.bindTranslations[translationOffset + 2] ?? 0;
  const qx = rig.bindRotations[rotationOffset] ?? 0;
  const qy = rig.bindRotations[rotationOffset + 1] ?? 0;
  const qz = rig.bindRotations[rotationOffset + 2] ?? 0;
  const qw = rig.bindRotations[rotationOffset + 3] ?? 1;
  const sx = rig.bindScales[scaleOffset] ?? 1;
  const sy = rig.bindScales[scaleOffset + 1] ?? 1;
  const sz = rig.bindScales[scaleOffset + 2] ?? 1;
  const translationActivity = Math.hypot(tx, ty, tz);
  const rotationActivity = Math.acos(Math.min(1, Math.abs(qw))) * 2 + Math.hypot(qx, qy, qz);
  const scaleActivity = Math.hypot(sx - 1, sy - 1, sz - 1);
  return translationActivity + rotationActivity + scaleActivity;
}

function buildRigBoneLookup(rig: RigDefinition) {
  const exactIndices = new Map<string, number>();
  const familyIndices = new Map<string, number[]>();

  rig.boneNames.forEach((boneName, boneIndex) => {
    exactIndices.set(boneName.trim().toLowerCase(), boneIndex);

    const familyName = normalizeRigBoneName(boneName);
    const family = familyIndices.get(familyName);
    if (family) {
      family.push(boneIndex);
      return;
    }

    familyIndices.set(familyName, [boneIndex]);
  });

  function resolveIndex(requestedBoneName: string): number | undefined {
    const normalizedRequestedName = requestedBoneName.trim().toLowerCase();
    const family = familyIndices.get(normalizeRigBoneName(requestedBoneName)) ?? [];

    if (family.length === 0) {
      return exactIndices.get(normalizedRequestedName);
    }

    if (family.length === 1) {
      return family[0];
    }

    if (hasNumericBoneSuffix(requestedBoneName)) {
      return exactIndices.get(normalizedRequestedName) ?? family[0];
    }

    return [...family].sort((left, right) => {
      const leftExternalChildren = getRigBoneExternalChildCount(rig, left);
      const rightExternalChildren = getRigBoneExternalChildCount(rig, right);
      if (leftExternalChildren !== rightExternalChildren) {
        return rightExternalChildren - leftExternalChildren;
      }

      const leftActivity = getRigBoneLocalActivity(rig, left);
      const rightActivity = getRigBoneLocalActivity(rig, right);
      if (Math.abs(leftActivity - rightActivity) > 1e-5) {
        return rightActivity - leftActivity;
      }

      const leftName = rig.boneNames[left] ?? "";
      const rightName = rig.boneNames[right] ?? "";
      const leftIsUnsuffixed = !hasNumericBoneSuffix(leftName);
      const rightIsUnsuffixed = !hasNumericBoneSuffix(rightName);
      if (leftIsUnsuffixed !== rightIsUnsuffixed) {
        return leftIsUnsuffixed ? -1 : 1;
      }

      return left - right;
    })[0];
  }

  return {
    resolveIndex,
  };
}

function computeRigScaleRatio(sourceRig: RigDefinition, targetRig: RigDefinition): number {
  const sourceLookup = buildRigBoneLookup(sourceRig);
  const targetLookup = buildRigBoneLookup(targetRig);
  const sourceTranslation = new Vector3();
  const targetTranslation = new Vector3();
  const ratios: number[] = [];
  const visitedPairs = new Set<string>();

  sourceRig.boneNames.forEach((boneName) => {
    const sourceBoneIndex = sourceLookup.resolveIndex(boneName);
    const targetBoneIndex = targetLookup.resolveIndex(boneName);
    if (targetBoneIndex === undefined) {
      return;
    }
    if (sourceBoneIndex === undefined) {
      return;
    }

    const pairKey = `${sourceBoneIndex}:${targetBoneIndex}`;
    if (visitedPairs.has(pairKey)) {
      return;
    }
    visitedPairs.add(pairKey);

    if ((sourceRig.parentIndices[sourceBoneIndex] ?? -1) < 0 || (targetRig.parentIndices[targetBoneIndex] ?? -1) < 0) {
      return;
    }

    const sourceLength = readRigTranslation(sourceRig, sourceBoneIndex, sourceTranslation).length();
    const targetLength = readRigTranslation(targetRig, targetBoneIndex, targetTranslation).length();
    if (sourceLength > 1e-5 && targetLength > 1e-5) {
      ratios.push(targetLength / sourceLength);
    }
  });

  if (ratios.length === 0) {
    return 1;
  }

  ratios.sort((left, right) => left - right);
  return ratios[Math.floor(ratios.length / 2)] ?? 1;
}

export function retargetClipAssetToRig(sourceAsset: AnimationClipAsset, sourceRig: RigDefinition, targetRig: RigDefinition): AnimationClipAsset {
  const sourceLookup = buildRigBoneLookup(sourceRig);
  const targetLookup = buildRigBoneLookup(targetRig);
  const translationScaleRatio = computeRigScaleRatio(sourceRig, targetRig);
  const sourceBindTranslation = new Vector3();
  const targetBindTranslation = new Vector3();
  const sourceBindRotation = new Quaternion();
  const targetBindRotation = new Quaternion();
  const inverseSourceBindRotation = new Quaternion();
  const sourceRotation = new Quaternion();
  const targetRotation = new Quaternion();
  const sourceBindScale = new Vector3();
  const targetBindScale = new Vector3();

  const tracks = sourceAsset.tracks.flatMap((track) => {
    const boneName = sourceRig.boneNames[track.boneIndex];
    if (!boneName) {
      return [];
    }

    const sourceReferenceBoneIndex = sourceLookup.resolveIndex(boneName) ?? track.boneIndex;
    const targetBoneIndex = targetLookup.resolveIndex(boneName);
    if (targetBoneIndex === undefined) {
      return [];
    }

    const nextTrack: AnimationClipAsset["tracks"][number] = { boneIndex: targetBoneIndex };

    if (track.translationTimes && track.translationValues) {
      readRigTranslation(sourceRig, sourceReferenceBoneIndex, sourceBindTranslation);
      readRigTranslation(targetRig, targetBoneIndex, targetBindTranslation);
      const nextValues = new Float32Array(track.translationValues.length);

      for (let index = 0; index < track.translationValues.length; index += 3) {
        nextValues[index] = targetBindTranslation.x + (track.translationValues[index]! - sourceBindTranslation.x) * translationScaleRatio;
        nextValues[index + 1] = targetBindTranslation.y + (track.translationValues[index + 1]! - sourceBindTranslation.y) * translationScaleRatio;
        nextValues[index + 2] = targetBindTranslation.z + (track.translationValues[index + 2]! - sourceBindTranslation.z) * translationScaleRatio;
      }

      nextTrack.translationTimes = new Float32Array(track.translationTimes);
      nextTrack.translationValues = nextValues;
    }

    if (track.rotationTimes && track.rotationValues) {
      readRigRotation(sourceRig, sourceReferenceBoneIndex, sourceBindRotation);
      readRigRotation(targetRig, targetBoneIndex, targetBindRotation);
      inverseSourceBindRotation.copy(sourceBindRotation).invert();
      const nextValues = new Float32Array(track.rotationValues.length);

      for (let index = 0; index < track.rotationValues.length; index += 4) {
        sourceRotation.set(
          track.rotationValues[index]!,
          track.rotationValues[index + 1]!,
          track.rotationValues[index + 2]!,
          track.rotationValues[index + 3]!
        );
        targetRotation.copy(targetBindRotation).multiply(inverseSourceBindRotation).multiply(sourceRotation).normalize();
        nextValues[index] = targetRotation.x;
        nextValues[index + 1] = targetRotation.y;
        nextValues[index + 2] = targetRotation.z;
        nextValues[index + 3] = targetRotation.w;
      }

      nextTrack.rotationTimes = new Float32Array(track.rotationTimes);
      nextTrack.rotationValues = nextValues;
    }

    if (track.scaleTimes && track.scaleValues) {
      readRigScale(sourceRig, sourceReferenceBoneIndex, sourceBindScale);
      readRigScale(targetRig, targetBoneIndex, targetBindScale);
      const nextValues = new Float32Array(track.scaleValues.length);

      for (let index = 0; index < track.scaleValues.length; index += 3) {
        nextValues[index] = targetBindScale.x * (track.scaleValues[index]! / (sourceBindScale.x || 1));
        nextValues[index + 1] = targetBindScale.y * (track.scaleValues[index + 1]! / (sourceBindScale.y || 1));
        nextValues[index + 2] = targetBindScale.z * (track.scaleValues[index + 2]! / (sourceBindScale.z || 1));
      }

      nextTrack.scaleTimes = new Float32Array(track.scaleTimes);
      nextTrack.scaleValues = nextValues;
    }

    return [nextTrack];
  });

  const sourceRootBoneName = sourceAsset.rootBoneIndex === undefined ? undefined : sourceRig.boneNames[sourceAsset.rootBoneIndex];
  const targetRootBoneIndex = sourceRootBoneName ? targetLookup.resolveIndex(sourceRootBoneName) : undefined;

  return {
    ...sourceAsset,
    rootBoneIndex: targetRootBoneIndex,
    tracks: tracks.sort((left, right) => left.boneIndex - right.boneIndex),
  };
}

async function loadAnimationSource(file: File): Promise<LoadedAnimationSource> {
  const extension = getFileExtension(file.name);
  const url = URL.createObjectURL(file);

  try {
    if (extension === "glb" || extension === "gltf") {
      const result = await gltfLoader.loadAsync(url);
      return {
        root: result.scene,
        animations: result.animations,
      };
    }

    if (extension === "fbx") {
      const result = await fbxLoader.loadAsync(url);
      return {
        root: result,
        animations: result.animations,
      };
    }

    throw new Error(`Unsupported file type ".${extension || "unknown"}". Use .glb, .gltf, or .fbx.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildImportedClips(
  animations: AnimationClip[],
  skeleton: Skeleton,
  sourceFile: File,
  fileName: string,
  existingIds: Set<string>,
  targetRig?: RigDefinition
): ImportedPreviewClip[] {
  const sourceRig = createSceneRigFromSkeleton(skeleton);

  return animations.map((clip) => {
    const clipId = makeUniqueClipId(slugifyClipId(clip.name || fileName.replace(/\.[^.]+$/, "")), existingIds);
    const rawAsset = createClipAssetFromThreeClip(clip, skeleton);
    const asset = targetRig ? retargetClipAssetToRig(rawAsset, sourceRig, targetRig) : rawAsset;

    return {
      id: clipId,
      name: clip.name || clipId,
      duration: clip.duration,
      source: fileName,
      sourceFile,
      asset: {
        ...asset,
        id: clipId,
        name: clip.name || clipId,
      },
      reference: {
        id: clipId,
        name: clip.name || clipId,
        duration: clip.duration,
        source: fileName,
      },
    };
  });
}

export async function importCharacterFile(
  file: File,
  existingClipIds: Iterable<string> = []
): Promise<ImportedCharacterAsset> {
  const source = await loadAnimationSource(file);
  const skeleton = findPrimarySkeleton(source.root);

  if (!skeleton) {
    throw new Error(`"${file.name}" does not contain a skinned skeleton. Import a rigged GLB/FBX character.`);
  }

  const rig = createSceneRigFromSkeleton(skeleton);
  const clips = buildImportedClips(source.animations, skeleton, file, file.name, new Set(existingClipIds), rig);

  return {
    fileName: file.name,
    scene: source.root,
    skeleton,
    rig,
    documentRig: serializeRigDefinition(rig),
    clips,
  };
}

export async function importAnimationFiles(
  files: File[],
  targetRig: RigDefinition,
  targetSkeleton: Skeleton,
  existingClipIds: Iterable<string> = []
): Promise<ImportedPreviewClip[]> {
  const ids = new Set(existingClipIds);
  const imported: ImportedPreviewClip[] = [];

  for (const file of files) {
    const source = await loadAnimationSource(file);
    const sourceSkeleton = findPrimarySkeleton(source.root) ?? targetSkeleton;
    imported.push(...buildImportedClips(source.animations, sourceSkeleton, file, file.name, ids, targetRig));
  }

  return imported;
}
