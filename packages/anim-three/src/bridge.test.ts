import { describe, expect, it } from "bun:test";
import { createPoseBufferFromRig } from "@ggez/anim-core";
import { AnimationClip, AnimationMixer, Bone, LoopOnce, Matrix4, Object3D, QuaternionKeyframeTrack, Skeleton, Vector3, VectorKeyframeTrack } from "three";
import { applyPoseBufferToSkeleton, createClipAssetFromThreeClip, createRigFromSkeleton } from "./bridge";

describe("@ggez/anim-three", () => {
  it("creates a rig definition from a three skeleton", () => {
    const root = new Bone();
    root.name = "root";
    const child = new Bone();
    child.name = "child";
    root.add(child);
    const skeleton = new Skeleton([root, child]);

    const rig = createRigFromSkeleton(skeleton);

    expect(rig.boneNames).toEqual(["root", "child"]);
    expect(Array.from(rig.parentIndices)).toEqual([-1, 0]);
  });

  it("imports clip tracks from a three animation clip", () => {
    const root = new Bone();
    root.name = "root";
    const skeleton = new Skeleton([root]);
    const clip = new AnimationClip("Walk", 1, [
      new VectorKeyframeTrack(".bones[root].position", [0, 1], [0, 0, 0, 1, 0, 0]),
      new QuaternionKeyframeTrack(".bones[root].quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
    ]);

    const asset = createClipAssetFromThreeClip(clip, skeleton);

    expect(asset.tracks).toHaveLength(1);
    expect(asset.rootBoneIndex).toBe(0);
    expect(Array.from(asset.tracks[0]!.translationValues ?? [])).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("prefers hips as the imported root-motion bone when present", () => {
    const root = new Bone();
    root.name = "Armature";
    const hips = new Bone();
    hips.name = "mixamorigHips";
    const spine = new Bone();
    spine.name = "mixamorigSpine";
    root.add(hips);
    hips.add(spine);

    const skeleton = new Skeleton([root, hips, spine]);
    const clip = new AnimationClip("Walk", 1, [
      new VectorKeyframeTrack(".bones[mixamorigHips].position", [0, 1], [0, 1, 0, 0.8, 1, 0.4]),
      new QuaternionKeyframeTrack(".bones[mixamorigSpine].quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
    ]);

    const asset = createClipAssetFromThreeClip(clip, skeleton);

    expect(asset.rootBoneIndex).toBe(1);
  });

  it("applies a pose without mutating skeleton bind inverses", () => {
    const root = new Bone();
    root.name = "root";
    const child = new Bone();
    child.name = "child";
    root.add(child);

    const skeleton = new Skeleton([root, child]);
    root.updateMatrixWorld(true);
    skeleton.calculateInverses();

    const originalInverse = skeleton.boneInverses[0]!.clone();
    const rig = createRigFromSkeleton(skeleton);
    const pose = createPoseBufferFromRig(rig);

    pose.translations[0] = 1;
    pose.translations[1] = 2;
    pose.translations[2] = 3;

    applyPoseBufferToSkeleton(pose, skeleton);

    expect(root.position.toArray()).toEqual([1, 2, 3]);
    expect(skeleton.boneInverses[0]!.equals(originalInverse)).toBe(true);
    expect(root.matrixWorld.equals(new Matrix4())).toBe(false);
  });

  it("applies canonical pose buffers through helper nodes without collapsing the rig", () => {
    const root = new Bone();
    root.name = "root";
    const helper = new Object3D();
    helper.position.set(0, 10, 0);
    const child = new Bone();
    child.name = "child";
    child.position.set(0, 5, 0);
    root.add(helper);
    helper.add(child);

    const skeleton = new Skeleton([root, child]);
    root.updateMatrixWorld(true);
    skeleton.calculateInverses();

    const rig = createRigFromSkeleton(skeleton);
    const pose = createPoseBufferFromRig(rig);

    applyPoseBufferToSkeleton(pose, skeleton);
    root.updateMatrixWorld(true);

    expect(child.position.toArray().map((value) => Number(value.toFixed(3)))).toEqual([0, 5, 0]);
    expect(child.getWorldPosition(new Vector3()).toArray().map((value) => Number(value.toFixed(3)))).toEqual([0, 15, 0]);
  });

  it("derives bind pose from bone inverses instead of the current animated pose", () => {
    const root = new Bone();
    root.name = "root";
    root.position.set(0, 10, 0);

    const child = new Bone();
    child.name = "child";
    child.position.set(0, 5, 0);
    root.add(child);

    const skeleton = new Skeleton([root, child]);
    root.updateMatrixWorld(true);
    skeleton.calculateInverses();

    root.position.set(100, 200, 300);
    child.position.set(7, 8, 9);

    const rig = createRigFromSkeleton(skeleton);

    expect(Array.from(rig.bindTranslations)).toEqual([0, 10, 0, 0, 5, 0]);
  });

  it("keeps root bind transforms relative to non-bone parents", () => {
    const parent = new Object3D();
    parent.scale.setScalar(0.01);

    const root = new Bone();
    root.name = "root";
    root.position.set(0, 54, 0);
    parent.add(root);

    const skeleton = new Skeleton([root]);
    parent.updateMatrixWorld(true);
    skeleton.calculateInverses();

    const rig = createRigFromSkeleton(skeleton);

    expect(Array.from(rig.bindTranslations).map((value) => Number(value.toFixed(3)))).toEqual([0, 0.54, 0]);
  });

  it("normalizes root translation tracks out of scaled non-bone parent space", () => {
    const parent = new Object3D();
    parent.scale.setScalar(0.01);

    const root = new Bone();
    root.name = "root";
    parent.add(root);

    const skeleton = new Skeleton([root]);
    const clip = new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack(".bones[root].position", [0, 1], [0, 54, 0, 0, 55, 0]),
    ]);

    const asset = createClipAssetFromThreeClip(clip, skeleton);

    expect(Array.from(asset.tracks[0]!.translationValues ?? []).map((value) => Number(value.toFixed(3)))).toEqual([0, 0.54, 0, 0, 0.55, 0]);
  });

  it("collapses helper-node transforms between bones into child track space", () => {
    const root = new Bone();
    root.name = "root";
    const helper = new Object3D();
    helper.position.set(0, 10, 0);
    const child = new Bone();
    child.name = "child";
    root.add(helper);
    helper.add(child);

    const skeleton = new Skeleton([root, child]);
    root.updateMatrixWorld(true);
    skeleton.calculateInverses();
    const rig = createRigFromSkeleton(skeleton);
    const clip = new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack(".bones[child].position", [0, 1], [0, 5, 0, 0, 6, 0]),
    ]);

    const asset = createClipAssetFromThreeClip(clip, skeleton);

    expect(Array.from(rig.parentIndices)).toEqual([-1, 0]);
    expect(Array.from(rig.bindTranslations).map((value) => Number(value.toFixed(3)))).toEqual([0, 0, 0, 0, 10, 0]);
    expect(Array.from(asset.tracks[0]!.translationValues ?? []).map((value) => Number(value.toFixed(3)))).toEqual([0, 15, 0, 0, 16, 0]);
  });

  it("bakes animated helper-node transforms into canonical bone tracks", () => {
    const root = new Bone();
    root.name = "root";
    const helper = new Object3D();
    helper.name = "helper";
    helper.position.set(0, 10, 0);
    const child = new Bone();
    child.name = "child";
    child.position.set(0, 5, 0);
    root.add(helper);
    helper.add(child);

    const skeleton = new Skeleton([root, child]);
    const clip = new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack("helper.position", [0, 1], [0, 10, 0, 0, 20, 0]),
    ]);

    const bindingRoot = new Object3D();
    bindingRoot.add(root);
    (bindingRoot as Object3D & { skeleton?: Skeleton }).skeleton = skeleton;
    const mixer = new AnimationMixer(bindingRoot);
    const action = mixer.clipAction(clip, bindingRoot);
    action.setLoop(LoopOnce, 0);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(1);

    expect(helper.position.toArray().map((value) => Number(value.toFixed(3)))).toEqual([0, 20, 0]);

    const asset = createClipAssetFromThreeClip(clip, skeleton);

    expect(asset.tracks).toHaveLength(1);
    expect(asset.tracks[0]!.boneIndex).toBe(1);
    expect(Array.from(asset.tracks[0]!.translationValues ?? []).map((value) => Number(value.toFixed(3)))).toEqual([0, 15, 0, 0, 25, 0]);
  });

  it("restores the source skeleton pose after baking a clip", () => {
    const root = new Bone();
    root.name = "root";
    const helper = new Object3D();
    helper.name = "helper";
    helper.position.set(0, 10, 0);
    const child = new Bone();
    child.name = "child";
    child.position.set(0, 5, 0);
    root.add(helper);
    helper.add(child);

    const skeleton = new Skeleton([root, child]);
    root.updateMatrixWorld(true);
    skeleton.calculateInverses();
    const before = child.getWorldPosition(new Vector3()).toArray().map((value) => Number(value.toFixed(3)));

    const clip = new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack("helper.position", [0, 1], [0, 10, 0, 0, 20, 0]),
    ]);

    createClipAssetFromThreeClip(clip, skeleton);

    root.updateMatrixWorld(true);
    skeleton.update();
    const after = child.getWorldPosition(new Vector3()).toArray().map((value) => Number(value.toFixed(3)));

    expect(after).toEqual(before);
  });
});
