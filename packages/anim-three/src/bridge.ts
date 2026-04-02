import type { AnimationClipAsset, PoseBuffer } from "@ggez/anim-core";
import { createRigDefinition } from "@ggez/anim-core";
import type { AnimatorInstance } from "@ggez/anim-runtime";
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  LoopOnce,
  Matrix4,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  Vector3,
  VectorKeyframeTrack
} from "three";

function resolveTrackBoneName(trackName: string): string | undefined {
  const bracketMatch = trackName.match(/\.bones\[(.+?)\]\.(position|quaternion|scale)$/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  const simpleMatch = trackName.match(/^(.+)\.(position|quaternion|scale)$/);
  return simpleMatch?.[1];
}

function hasNonBoneTrackTargets(clip: AnimationClip, skeleton: Skeleton): boolean {
  const boneNames = new Set(skeleton.bones.map((bone) => bone.name));
  return clip.tracks.some((track) => {
    const targetName = resolveTrackBoneName(track.name);
    return !targetName || !boneNames.has(targetName);
  });
}

function getBoneDepth(skeleton: Skeleton, boneIndex: number): number {
  let depth = 0;
  let current: Object3D | null = skeleton.bones[boneIndex] ?? null;
  while (current?.parent) {
    if (current.parent instanceof Bone) {
      depth += 1;
    }
    current = current.parent;
  }
  return depth;
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

function hasCanonicalParentSpaceConversion(bone: Bone): boolean {
  const effectiveParentBone = findNearestAncestorBone(bone.parent);
  return (!effectiveParentBone && Boolean(bone.parent)) || (effectiveParentBone !== null && effectiveParentBone !== bone.parent);
}

function getBoneParentSpaceTransform(bone: Bone): Matrix4 | null {
  const directParent = bone.parent;
  if (!directParent) {
    return null;
  }

  directParent.updateMatrixWorld(true);
  const effectiveParentBone = findNearestAncestorBone(directParent);
  if (!effectiveParentBone) {
    return directParent.matrixWorld.clone();
  }

  if (effectiveParentBone === directParent) {
    return null;
  }

  effectiveParentBone.updateMatrixWorld(true);
  return effectiveParentBone.matrixWorld.clone().invert().multiply(directParent.matrixWorld);
}

function findTopmostAncestor(object: Object3D): Object3D {
  let current: Object3D = object;

  while (current.parent) {
    current = current.parent;
  }

  return current;
}

function readCanonicalBoneLocalMatrix(bone: Bone, out: Matrix4): Matrix4 {
  bone.updateMatrixWorld(true);
  const parentBone = findNearestAncestorBone(bone.parent);
  if (!parentBone) {
    return out.copy(bone.matrixWorld);
  }

  parentBone.updateMatrixWorld(true);
  return out.copy(parentBone.matrixWorld).invert().multiply(bone.matrixWorld);
}

function collectClipSampleTimes(clip: AnimationClip): number[] {
  const times = new Set<number>();
  times.add(0);
  if (clip.duration > 0) {
    times.add(clip.duration);
  }

  clip.tracks.forEach((track) => {
    track.times.forEach((time) => times.add(time));
  });

  return Array.from(times).sort((left, right) => left - right);
}

function areTripletsUniform(values: number[], epsilon = 1e-4): boolean {
  if (values.length <= 3) {
    return true;
  }

  const baseX = values[0] ?? 0;
  const baseY = values[1] ?? 0;
  const baseZ = values[2] ?? 0;

  for (let index = 3; index < values.length; index += 3) {
    if (
      Math.abs((values[index] ?? 0) - baseX) > epsilon ||
      Math.abs((values[index + 1] ?? 0) - baseY) > epsilon ||
      Math.abs((values[index + 2] ?? 0) - baseZ) > epsilon
    ) {
      return false;
    }
  }

  return true;
}

function areQuaternionsUniform(values: number[], epsilon = 1e-4): boolean {
  if (values.length <= 4) {
    return true;
  }

  const baseX = values[0] ?? 0;
  const baseY = values[1] ?? 0;
  const baseZ = values[2] ?? 0;
  const baseW = values[3] ?? 1;

  for (let index = 4; index < values.length; index += 4) {
    const dot = Math.abs(
      baseX * (values[index] ?? 0) +
      baseY * (values[index + 1] ?? 0) +
      baseZ * (values[index + 2] ?? 0) +
      baseW * (values[index + 3] ?? 1)
    );
    if (1 - dot > epsilon) {
      return false;
    }
  }

  return true;
}

function isTripletDifferentFromBind(values: number[], bindX: number, bindY: number, bindZ: number, epsilon = 1e-4): boolean {
  for (let index = 0; index < values.length; index += 3) {
    if (
      Math.abs((values[index] ?? 0) - bindX) > epsilon ||
      Math.abs((values[index + 1] ?? 0) - bindY) > epsilon ||
      Math.abs((values[index + 2] ?? 0) - bindZ) > epsilon
    ) {
      return true;
    }
  }

  return false;
}

function isQuaternionDifferentFromBind(values: number[], bindX: number, bindY: number, bindZ: number, bindW: number, epsilon = 1e-4): boolean {
  for (let index = 0; index < values.length; index += 4) {
    const dot = Math.abs(
      bindX * (values[index] ?? 0) +
      bindY * (values[index + 1] ?? 0) +
      bindZ * (values[index + 2] ?? 0) +
      bindW * (values[index + 3] ?? 1)
    );
    if (1 - dot > epsilon) {
      return true;
    }
  }

  return false;
}

function createBakedClipAssetFromScene(clip: AnimationClip, skeleton: Skeleton): AnimationClipAsset {
  const root = findTopmostAncestor(skeleton.bones[0]!);
  const wrapper = new Object3D();
  wrapper.add(root);
  const rig = createRigFromSkeleton(skeleton);
  const times = collectClipSampleTimes(clip);
  const matrix = new Matrix4();
  const translation = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const snapshots = new Map<Object3D, { position: Vector3; quaternion: Quaternion; scale: Vector3 }>();

  root.traverse((object) => {
    snapshots.set(object, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    });
  });

  const bindingRoot = wrapper as Object3D & { skeleton?: Skeleton };
  const previousSkeleton = bindingRoot.skeleton;
  bindingRoot.skeleton = skeleton;

  const bakedTracks = new Map<number, AnimationClipAsset["tracks"][number]>();
  const mixer = new AnimationMixer(wrapper);
  const action = mixer.clipAction(clip, wrapper);
  action.setLoop(LoopOnce, 0);
  action.clampWhenFinished = true;
  action.play();

  try {
    const sampledTranslations = Array.from({ length: skeleton.bones.length }, () => [] as number[]);
    const sampledRotations = Array.from({ length: skeleton.bones.length }, () => [] as number[]);
    const sampledScales = Array.from({ length: skeleton.bones.length }, () => [] as number[]);

    times.forEach((time) => {
      mixer.setTime(time);
      wrapper.updateMatrixWorld(true);

      skeleton.bones.forEach((bone, boneIndex) => {
        readCanonicalBoneLocalMatrix(bone, matrix).decompose(translation, rotation, scale);
        sampledTranslations[boneIndex]!.push(translation.x, translation.y, translation.z);
        sampledRotations[boneIndex]!.push(rotation.x, rotation.y, rotation.z, rotation.w);
        sampledScales[boneIndex]!.push(scale.x, scale.y, scale.z);
      });
    });

    sampledTranslations.forEach((translationValues, boneIndex) => {
      const track: AnimationClipAsset["tracks"][number] = { boneIndex };
      const translationOffset = boneIndex * 3;
      const rotationOffset = boneIndex * 4;
      const scaleOffset = boneIndex * 3;
      const rotationValues = sampledRotations[boneIndex]!;
      const scaleValues = sampledScales[boneIndex]!;

      if (
        isTripletDifferentFromBind(
          translationValues,
          rig.bindTranslations[translationOffset] ?? 0,
          rig.bindTranslations[translationOffset + 1] ?? 0,
          rig.bindTranslations[translationOffset + 2] ?? 0
        )
      ) {
        track.translationTimes = areTripletsUniform(translationValues) ? Float32Array.from([0]) : Float32Array.from(times);
        track.translationValues = areTripletsUniform(translationValues)
          ? Float32Array.from(translationValues.slice(0, 3))
          : Float32Array.from(translationValues);
      }

      if (
        isQuaternionDifferentFromBind(
          rotationValues,
          rig.bindRotations[rotationOffset] ?? 0,
          rig.bindRotations[rotationOffset + 1] ?? 0,
          rig.bindRotations[rotationOffset + 2] ?? 0,
          rig.bindRotations[rotationOffset + 3] ?? 1
        )
      ) {
        track.rotationTimes = areQuaternionsUniform(rotationValues) ? Float32Array.from([0]) : Float32Array.from(times);
        track.rotationValues = areQuaternionsUniform(rotationValues)
          ? Float32Array.from(rotationValues.slice(0, 4))
          : Float32Array.from(rotationValues);
      }

      if (
        isTripletDifferentFromBind(
          scaleValues,
          rig.bindScales[scaleOffset] ?? 1,
          rig.bindScales[scaleOffset + 1] ?? 1,
          rig.bindScales[scaleOffset + 2] ?? 1
        )
      ) {
        track.scaleTimes = areTripletsUniform(scaleValues) ? Float32Array.from([0]) : Float32Array.from(times);
        track.scaleValues = areTripletsUniform(scaleValues)
          ? Float32Array.from(scaleValues.slice(0, 3))
          : Float32Array.from(scaleValues);
      }

      if (track.translationTimes || track.rotationTimes || track.scaleTimes) {
        bakedTracks.set(boneIndex, track);
      }
    });

    return {
      id: clip.name,
      name: clip.name,
      duration: clip.duration,
      rootBoneIndex: inferClipRootBoneIndex(skeleton, bakedTracks),
      tracks: Array.from(bakedTracks.values()).sort((left, right) => left.boneIndex - right.boneIndex),
    };
  } finally {
    action.stop();
    mixer.stopAllAction();
    mixer.uncacheClip(clip);
    mixer.uncacheRoot(wrapper);

    snapshots.forEach((snapshot, object) => {
      object.position.copy(snapshot.position);
      object.quaternion.copy(snapshot.quaternion);
      object.scale.copy(snapshot.scale);
      object.updateMatrix();
    });
    root.updateMatrixWorld(true);
    skeleton.update();
    root.traverse((object) => {
      const candidate = object as Object3D & { isSkinnedMesh?: boolean; skeleton?: Skeleton };
      if (candidate.isSkinnedMesh && candidate.skeleton === skeleton) {
        candidate.skeleton.update();
      }
    });
    wrapper.remove(root);

    if (previousSkeleton) {
      bindingRoot.skeleton = previousSkeleton;
    } else {
      delete bindingRoot.skeleton;
    }
  }
}

function scoreRootMotionBoneName(name: string): number {
  const normalized = name.toLowerCase();

  if (normalized.includes("hips")) {
    return 400;
  }
  if (normalized.includes("pelvis")) {
    return 320;
  }
  if (normalized === "root") {
    return 240;
  }
  if (normalized.includes("root")) {
    return 180;
  }
  if (normalized.includes("armature")) {
    return 60;
  }
  return 0;
}

function estimateTranslationTravel(values: Float32Array | undefined): number {
  if (!values || values.length < 6) {
    return 0;
  }

  let maxDistance = 0;
  const startX = values[0] ?? 0;
  const startY = values[1] ?? 0;
  const startZ = values[2] ?? 0;

  for (let index = 3; index < values.length; index += 3) {
    const dx = (values[index] ?? 0) - startX;
    const dy = (values[index + 1] ?? 0) - startY;
    const dz = (values[index + 2] ?? 0) - startZ;
    maxDistance = Math.max(maxDistance, Math.hypot(dx, dy, dz));
  }

  return maxDistance;
}

function inferClipRootBoneIndex(
  skeleton: Skeleton,
  tracksByBone: Map<number, AnimationClipAsset["tracks"][number]>
): number | undefined {
  const candidates = Array.from(tracksByBone.values()).filter(
    (track) => track.translationTimes && track.translationValues && track.translationValues.length >= 3
  );

  if (candidates.length === 0) {
    return undefined;
  }

  const rankedCandidates = candidates
    .map((track) => {
      const bone = skeleton.bones[track.boneIndex];
      const name = bone?.name || "";
      return {
        boneIndex: track.boneIndex,
        nameScore: scoreRootMotionBoneName(name),
        travel: estimateTranslationTravel(track.translationValues),
        depth: getBoneDepth(skeleton, track.boneIndex)
      };
    })
    .sort((left, right) => {
      if (left.nameScore !== right.nameScore) {
        return right.nameScore - left.nameScore;
      }
      if (left.travel !== right.travel) {
        return right.travel - left.travel;
      }
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.boneIndex - right.boneIndex;
    });

  return rankedCandidates[0]?.boneIndex;
}

export function createRigFromSkeleton(skeleton: Skeleton) {
  skeleton.bones.forEach((bone) => bone.parent?.updateMatrixWorld(true));
  const boneNames = skeleton.bones.map((bone) => bone.name || `bone-${bone.id}`);
  const parentIndices = skeleton.bones.map((bone) => {
    const parentBone = findNearestAncestorBone(bone.parent);
    if (!parentBone) {
      return -1;
    }

    return skeleton.bones.indexOf(parentBone);
  });
  const rootBoneIndex = parentIndices.findIndex((parentIndex) => parentIndex < 0);
  const hasBoneInverses = skeleton.boneInverses.length === skeleton.bones.length && skeleton.boneInverses.every((inverse) => inverse);
  const bindTranslations: number[] = [];
  const bindRotations: number[] = [];
  const bindScales: number[] = [];

  if (hasBoneInverses) {
    const inverseParentMatrix = new Matrix4();
    const localBindMatrix = new Matrix4();
    const bindTranslation = new Vector3();
    const bindRotation = new Quaternion();
    const bindScale = new Vector3();
    const bindWorldMatrices = skeleton.bones.map((_, boneIndex) => skeleton.boneInverses[boneIndex]!.clone().invert());

    skeleton.bones.forEach((bone, boneIndex) => {
      const parentIndex = parentIndices[boneIndex] ?? -1;
      if (parentIndex >= 0) {
        inverseParentMatrix.copy(bindWorldMatrices[parentIndex]!).invert();
        localBindMatrix.multiplyMatrices(inverseParentMatrix, bindWorldMatrices[boneIndex]!);
      } else {
        localBindMatrix.copy(bindWorldMatrices[boneIndex]!);
      }

      localBindMatrix.decompose(bindTranslation, bindRotation, bindScale);
      bindTranslations.push(bindTranslation.x, bindTranslation.y, bindTranslation.z);
      bindRotations.push(bindRotation.x, bindRotation.y, bindRotation.z, bindRotation.w);
      bindScales.push(bindScale.x, bindScale.y, bindScale.z);
    });
  } else {
    skeleton.bones.forEach((bone) => {
      bindTranslations.push(bone.position.x, bone.position.y, bone.position.z);
      bindRotations.push(bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w);
      bindScales.push(bone.scale.x, bone.scale.y, bone.scale.z);
    });
  }

  return createRigDefinition({
    boneNames,
    parentIndices,
    rootBoneIndex: Math.max(0, rootBoneIndex),
    bindTranslations,
    bindRotations,
    bindScales
  });
}

export function createClipAssetFromThreeClip(clip: AnimationClip, skeleton: Skeleton): AnimationClipAsset {
  if (skeleton.bones.length > 0 && hasNonBoneTrackTargets(clip, skeleton)) {
    return createBakedClipAssetFromScene(clip, skeleton);
  }

  const boneIndexByName = new Map(skeleton.bones.map((bone, index) => [bone.name, index]));
  const tracksByBone = new Map<number, AnimationClipAsset["tracks"][number]>();
  const parentTransformPosition = new Vector3();
  const parentTransformRotation = new Quaternion();
  const parentTransformScale = new Vector3();
  const transformedPosition = new Vector3();
  const transformedRotation = new Quaternion();

  function ensureBoneTrack(boneIndex: number) {
    let track = tracksByBone.get(boneIndex);
    if (!track) {
      track = { boneIndex };
      tracksByBone.set(boneIndex, track);
    }
    return track;
  }

  clip.tracks.forEach((track) => {
    const boneName = resolveTrackBoneName(track.name);
    if (!boneName) {
      return;
    }

    const boneIndex = boneIndexByName.get(boneName);
    if (boneIndex === undefined) {
      return;
    }

    const boneTrack = ensureBoneTrack(boneIndex);
    if (track instanceof VectorKeyframeTrack) {
      if (track.name.endsWith(".position")) {
        boneTrack.translationTimes = Float32Array.from(track.times);
        const parentTransform = getBoneParentSpaceTransform(skeleton.bones[boneIndex]!);
        if (!parentTransform) {
          boneTrack.translationValues = Float32Array.from(track.values);
        } else {
          parentTransform.decompose(parentTransformPosition, parentTransformRotation, parentTransformScale);
          const nextValues = new Float32Array(track.values.length);
          for (let index = 0; index < track.values.length; index += 3) {
            transformedPosition.set(track.values[index]!, track.values[index + 1]!, track.values[index + 2]!).applyMatrix4(parentTransform);
            nextValues[index] = transformedPosition.x;
            nextValues[index + 1] = transformedPosition.y;
            nextValues[index + 2] = transformedPosition.z;
          }
          boneTrack.translationValues = nextValues;
        }
      } else if (track.name.endsWith(".scale")) {
        boneTrack.scaleTimes = Float32Array.from(track.times);
        const parentTransform = getBoneParentSpaceTransform(skeleton.bones[boneIndex]!);
        if (!parentTransform) {
          boneTrack.scaleValues = Float32Array.from(track.values);
        } else {
          parentTransform.decompose(parentTransformPosition, parentTransformRotation, parentTransformScale);
          const nextValues = new Float32Array(track.values.length);
          for (let index = 0; index < track.values.length; index += 3) {
            nextValues[index] = track.values[index]! * parentTransformScale.x;
            nextValues[index + 1] = track.values[index + 1]! * parentTransformScale.y;
            nextValues[index + 2] = track.values[index + 2]! * parentTransformScale.z;
          }
          boneTrack.scaleValues = nextValues;
        }
      }
    } else if (track instanceof QuaternionKeyframeTrack) {
      boneTrack.rotationTimes = Float32Array.from(track.times);
      const parentTransform = getBoneParentSpaceTransform(skeleton.bones[boneIndex]!);
      if (!parentTransform) {
        boneTrack.rotationValues = Float32Array.from(track.values);
      } else {
        parentTransform.decompose(parentTransformPosition, parentTransformRotation, parentTransformScale);
        const nextValues = new Float32Array(track.values.length);
        for (let index = 0; index < track.values.length; index += 4) {
          transformedRotation
            .copy(parentTransformRotation)
            .multiply(
              new Quaternion(
                track.values[index]!,
                track.values[index + 1]!,
                track.values[index + 2]!,
                track.values[index + 3]!
              )
            )
            .normalize();
          nextValues[index] = transformedRotation.x;
          nextValues[index + 1] = transformedRotation.y;
          nextValues[index + 2] = transformedRotation.z;
          nextValues[index + 3] = transformedRotation.w;
        }
        boneTrack.rotationValues = nextValues;
      }
    }
  });

  return {
    id: clip.name,
    name: clip.name,
    duration: clip.duration,
    rootBoneIndex: inferClipRootBoneIndex(skeleton, tracksByBone),
    tracks: Array.from(tracksByBone.values()).sort((left, right) => left.boneIndex - right.boneIndex)
  };
}

export function applyPoseBufferToSkeleton(pose: PoseBuffer, skeleton: Skeleton): void {
  const parentInverseMatrix = new Matrix4();
  const composedMatrix = new Matrix4();
  const worldTranslation = new Vector3();
  const worldRotation = new Quaternion();
  const worldScale = new Vector3();
  const localTranslation = new Vector3();
  const localRotation = new Quaternion();
  const localScale = new Vector3();
  const updatedRoots = new Set<Bone>();

  skeleton.bones.forEach((bone, boneIndex) => {
    const vectorOffset = boneIndex * 3;
    const quaternionOffset = boneIndex * 4;

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

  updatedRoots.forEach((rootBone) => rootBone.updateMatrixWorld(true));
  skeleton.update();
}

export function applyPoseToSkeleton(animator: AnimatorInstance, skeleton: Skeleton): void {
  applyPoseBufferToSkeleton(animator.outputPose, skeleton);
}

export function createThreeAnimatorBridge(animator: AnimatorInstance, skeleton: Skeleton) {
  return {
    animator,
    skeleton,
    update(deltaTime: number) {
      const result = animator.update(deltaTime);
      applyPoseToSkeleton(animator, skeleton);
      return result;
    }
  };
}
