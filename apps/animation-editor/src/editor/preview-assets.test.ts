import { createPoseBufferFromRig, sampleClipPose } from "@ggez/anim-core";
import { createClipAssetFromThreeClip, createRigFromSkeleton } from "@ggez/anim-three";
import { readFile } from "node:fs/promises";
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BufferGeometry,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Vector3,
  VectorKeyframeTrack
} from "three";
import { applyPoseBufferToSceneBones, findPrimarySkeleton, importAnimationFiles, importCharacterFile, retargetClipAssetToRig } from "./preview-assets";

declare const describe: (name: string, body: () => void) => void;
declare const it: (name: string, body: () => void) => void;
declare const expect: (value: unknown) => {
  not: {
    toBeNull(): void;
  };
  toEqual(expected: unknown): void;
};

if (!globalThis.ProgressEvent) {
  class TestProgressEvent extends Event implements ProgressEvent<EventTarget> {
    readonly lengthComputable: boolean;
    readonly loaded: number;
    readonly total: number;

    constructor(type: string, init: ProgressEventInit = {}) {
      super(type);
      this.lengthComputable = init.lengthComputable ?? false;
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  }

  globalThis.ProgressEvent = TestProgressEvent as typeof ProgressEvent;
}

function createSkinnedMesh(name: string, skeleton: Skeleton): SkinnedMesh {
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
  mesh.name = name;
  mesh.skeleton = skeleton;
  return mesh;
}

function roundTuple(values: number[]): number[] {
  return values.map((value) => Number(value.toFixed(3)));
}

function readWorldTransform(object: Object3D) {
  return {
    position: roundTuple(object.getWorldPosition(new Vector3()).toArray()),
    rotation: roundTuple(object.getWorldQuaternion(new Quaternion()).toArray()),
  };
}

function createScaledRigScene() {
  const scene = new Object3D();
  const armature = new Object3D();
  armature.position.set(4, 3, -2);
  armature.rotation.set(-Math.PI / 2, Math.PI / 6, 0);
  armature.scale.setScalar(0.01);
  scene.add(armature);

  const hips = new Bone();
  hips.name = "mixamorigHips";
  hips.position.set(0, 54, 0);

  const upperLegHelper = new Object3D();
  upperLegHelper.position.set(3, -20, 1);
  upperLegHelper.rotation.set(0, 0, Math.PI / 5);

  const upperLeg = new Bone();
  upperLeg.name = "mixamorigLeftUpLeg";
  upperLeg.position.set(0, -22, 0);

  const lowerLegHelper = new Object3D();
  lowerLegHelper.position.set(0, -18, 2);
  lowerLegHelper.rotation.set(Math.PI / 7, 0, 0);

  const lowerLeg = new Bone();
  lowerLeg.name = "mixamorigLeftLeg";
  lowerLeg.position.set(0, -24, 0);

  armature.add(hips);
  hips.add(upperLegHelper);
  upperLegHelper.add(upperLeg);
  upperLeg.add(lowerLegHelper);
  lowerLegHelper.add(lowerLeg);

  const skeleton = new Skeleton([hips, upperLeg, lowerLeg]);
  const mesh = createSkinnedMesh("BodyMesh", skeleton);
  scene.add(mesh);
  scene.updateMatrixWorld(true);
  skeleton.calculateInverses();

  return { scene, skeleton, mesh, hips, upperLeg, lowerLeg };
}

describe("findPrimarySkeleton", () => {
  it("reconstructs the full armature when a skinned mesh exposes only a partial bone list", () => {
    const hips = new Bone();
    hips.name = "mixamorigHips";
    const spine = new Bone();
    spine.name = "mixamorigSpine";
    const spine1 = new Bone();
    spine1.name = "mixamorigSpine1";
    const spine2 = new Bone();
    spine2.name = "mixamorigSpine2";
    const neck = new Bone();
    neck.name = "mixamorigNeck";
    const head = new Bone();
    head.name = "mixamorigHead";
    const leftArm = new Bone();
    leftArm.name = "mixamorigLeftArm";
    const leftForeArm = new Bone();
    leftForeArm.name = "mixamorigLeftForeArm";

    hips.add(spine);
    spine.add(spine1);
    spine1.add(spine2);
    spine2.add(neck, leftArm);
    neck.add(head);
    leftArm.add(leftForeArm);

    const root = new Object3D();
    const partialSkeleton = new Skeleton([head, neck, spine2]);
    root.add(hips);
    root.add(createSkinnedMesh("HeadMesh", partialSkeleton));

    const resolved = findPrimarySkeleton(root);

    expect(resolved).not.toBeNull();
    expect(resolved?.bones.map((bone) => bone.name)).toEqual([
      "mixamorigHips",
      "mixamorigSpine",
      "mixamorigSpine1",
      "mixamorigSpine2",
      "mixamorigNeck",
      "mixamorigHead",
      "mixamorigLeftArm",
      "mixamorigLeftForeArm",
    ]);
  });

  it("applies poses to every matching armature in the scene", () => {
    const root = new Object3D();

    function createArmature(prefix: string) {
      const hips = new Bone();
      hips.name = "mixamorigHips";
      const spine = new Bone();
      spine.name = "mixamorigSpine";
      hips.add(spine);
      root.add(hips);
      root.add(createSkinnedMesh(prefix, new Skeleton([hips, spine])));
      return { hips, spine };
    }

    const first = createArmature("FirstMesh");
    const second = createArmature("SecondMesh");
    const skeleton = findPrimarySkeleton(root);

    expect(skeleton).not.toBeNull();

    const rig = createRigFromSkeleton(skeleton!);
    const pose = createPoseBufferFromRig(rig);
    pose.translations[0] = 5;
    pose.translations[1] = 6;
    pose.translations[2] = 7;
    pose.translations[3] = 1;
    pose.translations[4] = 2;
    pose.translations[5] = 3;

    applyPoseBufferToSceneBones(pose, rig, root);

    expect(first.hips.position.toArray()).toEqual([5, 6, 7]);
    expect(second.hips.position.toArray()).toEqual([5, 6, 7]);
    expect(first.spine.position.toArray()).toEqual([1, 2, 3]);
    expect(second.spine.position.toArray()).toEqual([1, 2, 3]);
  });

  it("preserves original bone inverses when rebuilding a full skeleton from a partial mesh skeleton", () => {
    const hips = new Bone();
    hips.name = "mixamorigHips";
    hips.position.set(0, 10, 0);
    const spine = new Bone();
    spine.name = "mixamorigSpine";
    spine.position.set(0, 5, 0);
    hips.add(spine);

    const bindSkeleton = new Skeleton([hips, spine]);
    hips.updateMatrixWorld(true);
    bindSkeleton.calculateInverses();
    const originalHipsInverse = bindSkeleton.boneInverses[0]!.clone();
    const originalSpineInverse = bindSkeleton.boneInverses[1]!.clone();

    hips.position.set(50, 60, 70);
    spine.position.set(7, 8, 9);
    hips.updateMatrixWorld(true);

    const root = new Object3D();
    root.add(hips);
    root.add(createSkinnedMesh("BodyMesh", new Skeleton([spine], [originalSpineInverse.clone()])));
    root.add(createSkinnedMesh("FullMesh", new Skeleton([hips, spine], [originalHipsInverse.clone(), originalSpineInverse.clone()])));

    const resolved = findPrimarySkeleton(root);

    expect(resolved).not.toBeNull();
    expect(resolved?.boneInverses[0]?.equals(originalHipsInverse)).toEqual(true);
    expect(resolved?.boneInverses[1]?.equals(originalSpineInverse)).toEqual(true);
    expect(Array.from(createRigFromSkeleton(resolved!).bindTranslations)).toEqual([0, 10, 0, 0, 5, 0]);
    expect(hips.matrixWorld.equals(new Matrix4())).toEqual(false);
  });

  it("retargets translation tracks to the target rig scale", () => {
    const sourceRig = {
      boneNames: ["Hips", "Spine"],
      parentIndices: Int16Array.from([-1, 0]),
      rootBoneIndex: 0,
      bindTranslations: Float32Array.from([0, 0, 0, 0, 54, 0]),
      bindRotations: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1]),
      bindScales: Float32Array.from([1, 1, 1, 1, 1, 1]),
    };
    const targetRig = {
      boneNames: ["Hips", "Spine"],
      parentIndices: Int16Array.from([-1, 0]),
      rootBoneIndex: 0,
      bindTranslations: Float32Array.from([0, 0, 0, 0, 0.54, 0]),
      bindRotations: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1]),
      bindScales: Float32Array.from([1, 1, 1, 1, 1, 1]),
    };
    const sourceAsset = {
      id: "idle",
      name: "Idle",
      duration: 1,
      rootBoneIndex: 0,
      tracks: [
        {
          boneIndex: 1,
          translationTimes: Float32Array.from([0, 1]),
          translationValues: Float32Array.from([0, 54, 0, 0, 55, 0]),
        },
      ],
    };

    const retargeted = retargetClipAssetToRig(sourceAsset, sourceRig, targetRig);
    const roundedValues = Array.from(retargeted.tracks[0]!.translationValues ?? []).map((value) => Number(value.toFixed(3)));

    expect(roundedValues).toEqual([0, 0.54, 0, 0, 0.55, 0]);
  });

  it("matches Three animation output for rigs with scaled armatures and helper nodes", () => {
    const native = createScaledRigScene();
    const imported = createScaledRigScene();
    const clip = new AnimationClip("Walk", 1, [
      new VectorKeyframeTrack(".bones[mixamorigHips].position", [0, 1], [0, 54, 0, 6, 58, -4]),
      new QuaternionKeyframeTrack(
        ".bones[mixamorigHips].quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, 0.258819, 0, 0.965926]
      ),
      new VectorKeyframeTrack(".bones[mixamorigLeftUpLeg].position", [0, 1], [0, -22, 0, 2, -18, 3]),
      new QuaternionKeyframeTrack(
        ".bones[mixamorigLeftUpLeg].quaternion",
        [0, 1],
        [0, 0, 0, 1, 0.382683, 0, 0, 0.92388]
      ),
      new QuaternionKeyframeTrack(
        ".bones[mixamorigLeftLeg].quaternion",
        [0, 1],
        [0, 0, 0, 1, -0.309017, 0, 0, 0.951057]
      ),
    ]);

    const mixer = new AnimationMixer(native.mesh);
    const action = mixer.clipAction(clip, native.mesh);
    action.play();
    mixer.setTime(0.5);
    native.scene.updateMatrixWorld(true);

    const rig = createRigFromSkeleton(imported.skeleton);
    const asset = createClipAssetFromThreeClip(clip, imported.skeleton);
    const pose = createPoseBufferFromRig(rig);
    sampleClipPose(asset, rig, 0.5, pose, true);
    applyPoseBufferToSceneBones(pose, rig, imported.scene);
    imported.scene.updateMatrixWorld(true);

    expect(readWorldTransform(imported.hips)).toEqual(readWorldTransform(native.hips));
    expect(readWorldTransform(imported.upperLeg)).toEqual(readWorldTransform(native.upperLeg));
    expect(readWorldTransform(imported.lowerLeg)).toEqual(readWorldTransform(native.lowerLeg));
  });

  it("reapplies the extracted rig bind pose without collapsing helper-node rigs", () => {
    const original = createScaledRigScene();
    const importedScene = original.scene.clone(true);
    const importedSkeleton = findPrimarySkeleton(importedScene);

    expect(importedSkeleton).not.toBeNull();

    const rig = createRigFromSkeleton(importedSkeleton!);
    const pose = createPoseBufferFromRig(rig);
    applyPoseBufferToSceneBones(pose, rig, importedScene);
    importedScene.updateMatrixWorld(true);

    const importedHips = importedScene.getObjectByName("mixamorigHips")!;
    const importedUpperLeg = importedScene.getObjectByName("mixamorigLeftUpLeg")!;
    const importedLowerLeg = importedScene.getObjectByName("mixamorigLeftLeg")!;

    expect(readWorldTransform(importedHips)).toEqual(readWorldTransform(original.hips));
    expect(readWorldTransform(importedUpperLeg)).toEqual(readWorldTransform(original.upperLeg));
    expect(readWorldTransform(importedLowerLeg)).toEqual(readWorldTransform(original.lowerLeg));
  });

  it("maps animation-only Mixamo tracks onto duplicated carrier bones", async () => {
    const characterPath = new URL("../../../../samples/sample-glbs/broken.glb", import.meta.url);
    const animationPath = new URL("../../../../samples/sample-glbs/broken-idle.glb", import.meta.url);
    const characterFile = new File([await readFile(characterPath)], "broken.glb", { type: "model/gltf-binary" });
    const animationFile = new File([await readFile(animationPath)], "broken-idle.glb", { type: "model/gltf-binary" });

    const character = await importCharacterFile(characterFile);
    const clips = await importAnimationFiles([animationFile], character.rig, character.skeleton);
    const idleClip = clips[0];
    const trackBoneNames = idleClip?.asset.tracks.map((track) => character.rig.boneNames[track.boneIndex]);
    const rootBoneName = idleClip?.asset.rootBoneIndex === undefined ? undefined : character.rig.boneNames[idleClip.asset.rootBoneIndex];

    expect(rootBoneName).toEqual("mixamorigHips_1");
    expect(trackBoneNames?.includes("mixamorigHips_1")).toEqual(true);
    expect(trackBoneNames?.includes("mixamorigLeftUpLeg_1")).toEqual(true);
    expect(trackBoneNames?.includes("mixamorigLeftLeg_1")).toEqual(true);
    expect(trackBoneNames?.includes("mixamorigLeftFoot_1")).toEqual(true);
    expect(trackBoneNames?.includes("mixamorigHips")).toEqual(false);
    expect(trackBoneNames?.includes("mixamorigLeftUpLeg")).toEqual(false);
    expect(trackBoneNames?.includes("mixamorigLeftLeg")).toEqual(false);
    expect(trackBoneNames?.includes("mixamorigLeftFoot")).toEqual(false);
  });
});
