import { compileAnimationEditorDocument } from "@ggez/anim-compiler";
import { copyPose, createPoseBufferFromRig, sampleClipPose } from "@ggez/anim-core";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { createAnimatorInstance } from "@ggez/anim-runtime";
import type { AnimatorInstance } from "@ggez/anim-runtime";
import type { AnimationEditorDocument } from "@ggez/anim-schema";
import { LocateFixed } from "lucide-react";
import {
  ACESFilmicToneMapping,
  Bone,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Object3D } from "three";
import { useEffect, useMemo, useRef } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { applyPoseBufferToSceneBones, preparePreviewObject } from "./preview-assets";
import { createConfiguredGLTFLoader } from "./gltf-loader";
import { useEditorStoreValue } from "./use-editor-store-value";
import type { CharacterPlaybackState } from "./hooks/use-character-playback";
import type { UseEquipmentStateReturn } from "./hooks/use-equipment-state";
import type { EquipmentTransform } from "./character-equipment";

function fitCameraToObject(camera: PerspectiveCamera, controls: OrbitControls, object: Object3D): void {
  const bounds = new Box3().setFromObject(object);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.8;
  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.near = 0.01;
  camera.far = Math.max(1000, distance * 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function setAnimatorParameter(
  animator: AnimatorInstance,
  name: string,
  value: number | boolean,
  type: AnimationEditorDocument["parameters"][number]["type"]
): void {
  if (type === "float") { animator.setFloat(name, Number(value)); return; }
  if (type === "int") { animator.setInt(name, Number(value)); return; }
  if (type === "bool") { animator.setBool(name, Boolean(value)); return; }
  if (value) { animator.trigger(name); }
}

function forceBoneTranslationToBindPose(
  translations: Float32Array,
  bindTranslations: Float32Array,
  boneIndex: number
): void {
  const offset = boneIndex * 3;
  translations[offset] = bindTranslations[offset]!;
  translations[offset + 1] = bindTranslations[offset + 1]!;
  translations[offset + 2] = bindTranslations[offset + 2]!;
}

function addBoneTranslationOffset(
  translations: Float32Array,
  boneIndex: number,
  x: number,
  y: number,
  z: number
): void {
  const offset = boneIndex * 3;
  translations[offset] += x;
  translations[offset + 1] += y;
  translations[offset + 2] += z;
}

function configureGridOpacity(grid: GridHelper, opacity: number): void {
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  materials.forEach((material) => {
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
  });
}

function updateInfiniteGrid(fineGrid: GridHelper, coarseGrid: GridHelper, anchorX: number, anchorZ: number): void {
  const fineStep = 1;
  const coarseStep = 10;
  fineGrid.position.set(Math.round(anchorX / fineStep) * fineStep, 0, Math.round(anchorZ / fineStep) * fineStep);
  coarseGrid.position.set(Math.round(anchorX / coarseStep) * coarseStep, 0.002, Math.round(anchorZ / coarseStep) * coarseStep);
}

function createStudioEnvironment(renderer: WebGLRenderer, scene: Scene): {
  dispose(): void;
} {
  const pmremGenerator = new PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  let disposed = false;
  let pmremDisposed = false;
  let environmentTarget: ReturnType<PMREMGenerator["fromEquirectangular"]> | null = null;

  function disposePmrem() {
    if (!pmremDisposed) {
      pmremGenerator.dispose();
      pmremDisposed = true;
    }
  }

  new HDRLoader().load(
    "/hdr/studio.hdr",
    (texture) => {
      if (disposed) {
        texture.dispose();
        disposePmrem();
        return;
      }

      environmentTarget = pmremGenerator.fromEquirectangular(texture);
      texture.dispose();
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = 0.7;
      disposePmrem();
    },
    undefined,
    () => {
      disposePmrem();
    }
  );

  return {
    dispose() {
      disposed = true;
      scene.environment = null;
      environmentTarget?.dispose();
      disposePmrem();
    },
  };
}

type CharacterViewportProps = {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  playback: CharacterPlaybackState;
  equipment: UseEquipmentStateReturn;
  selectedDynamicsProfileId?: string;
  showDynamicsColliders?: boolean;
};

export function CharacterViewport({ store, character, importedClips, playback, equipment, selectedDynamicsProfileId, showDynamicsColliders = true }: CharacterViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const animatorRef = useRef<AnimatorInstance | null>(null);
  const resetPreviewPositionRef = useRef(0);

  // Scene refs — assigned inside the main setup effect, read by equipment effects
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const orbitsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);

  // Equipment scene objects
  const equipmentMeshesRef = useRef(new Map<string, Object3D>());
  const characterBonesRef = useRef(new Map<string, Bone>());
  const dynamicsColliderMeshesRef = useRef(new Map<string, Mesh>());
  const isDraggingRef = useRef(false);

  // Single shared GLTFLoader instance (created on first render, stable)
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  if (!gltfLoaderRef.current) {
    gltfLoaderRef.current = createConfiguredGLTFLoader();
  }

  // Ref-copies of equipment state — updated every render so render loop is always current
  // without adding equipment deps to the heavy scene effect.
  const equipmentItemsRef = useRef(equipment.items);
  const equipmentSocketsRef = useRef(equipment.sockets);
  const selectedItemIdRef = useRef(equipment.selectedItemId);
  const gizmoModeRef = useRef(equipment.gizmoMode);
  const onTransformUpdateRef = useRef(equipment.updateTransform);
  equipmentItemsRef.current = equipment.items;
  equipmentSocketsRef.current = equipment.sockets;
  selectedItemIdRef.current = equipment.selectedItemId;
  gizmoModeRef.current = equipment.gizmoMode;
  onTransformUpdateRef.current = equipment.updateTransform;

  const document = useEditorStoreValue(store, () => store.getState().document, ["document"]);
  const clipMap = useMemo(
    () => new Map(importedClips.map((clip) => [clip.id, clip])),
    [importedClips]
  );
  const compileResult = useMemo(() => compileAnimationEditorDocument(document), [document]);

  const graphPreview = useMemo(() => {
    if (!character) {
      return { animator: null, error: "Import a rigged character to preview the graph." };
    }
    if (!compileResult.ok || !compileResult.graph) {
      const firstError = compileResult.diagnostics.find((d) => d.severity === "error");
      return {
        animator: null,
        error: firstError?.message ?? "Fix compile errors before graph preview can run.",
      };
    }
    try {
      const clips = compileResult.graph.clipSlots.map((slot) => {
        const clip = clipMap.get(slot.id);
        if (!clip) {
          throw new Error(`Compiled graph references clip "${slot.id}" but no imported animation provides it.`);
        }
        return clip.asset;
      });
      return {
        animator: createAnimatorInstance({ rig: character.rig, graph: compileResult.graph, clips }),
        error: null,
      };
    } catch (error) {
      return {
        animator: null,
        error: error instanceof Error ? error.message : "Failed to create graph preview animator.",
      };
    }
  }, [character, clipMap, compileResult]);

  // Sync animator instance when graph changes
  useEffect(() => {
    if (!character) { animatorRef.current = null; return; }
    if (graphPreview.animator) { animatorRef.current = graphPreview.animator; return; }
    if (!graphPreview.error) { animatorRef.current = null; }
  }, [character, graphPreview.animator, graphPreview.error]);

  // Use a ref for document.parameters so the render loop stays current
  // without requiring a full Three.js scene restart when parameters change.
  const documentParametersRef = useRef(document.parameters);
  documentParametersRef.current = document.parameters;
  const dynamicsProfilesRef = useRef(document.dynamicsProfiles);
  dynamicsProfilesRef.current = document.dynamicsProfiles;
  const selectedDynamicsProfileIdRef = useRef(selectedDynamicsProfileId ?? "");
  selectedDynamicsProfileIdRef.current = selectedDynamicsProfileId ?? "";
  const showDynamicsCollidersRef = useRef(showDynamicsColliders);
  showDynamicsCollidersRef.current = showDynamicsColliders;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    sceneRef.current = scene;
    scene.background = new Color("#060b09");
    const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
    cameraRef.current = camera;
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    orbitsRef.current = controls;
    controls.enableDamping = true;

    // TransformControls for equipment gizmo editing
    const tc = new TransformControls(camera, renderer.domElement);
    transformControlsRef.current = tc;
    tc.setSize(0.8);
    // In Three.js r155+, TransformControls extends Controls (not Object3D).
    // The renderable gizmo lives in tc.getHelper() — add that to the scene.
    scene.add(tc.getHelper());
    tc.addEventListener("dragging-changed", (event) => {
      const dragging = (event as unknown as { value: boolean }).value;
      isDraggingRef.current = dragging;
      controls.enabled = !dragging;
      if (!dragging) {
        // Drag ended → compute local transform relative to socket bone and commit
        const itemId = selectedItemIdRef.current;
        if (!itemId) return;
        const item = equipmentItemsRef.current.find((i) => i.id === itemId);
        if (!item?.socketId) return;
        const socket = equipmentSocketsRef.current.find((s) => s.id === item.socketId);
        if (!socket) return;
        const bone = characterBonesRef.current.get(socket.boneName);
        const mesh = equipmentMeshesRef.current.get(itemId);
        if (!bone || !mesh) return;
        bone.updateWorldMatrix(true, false);
        const invBone = bone.matrixWorld.clone().invert();
        const meshWorld = new Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale);
        const localMat = new Matrix4().multiplyMatrices(invBone, meshWorld);
        const p = new Vector3();
        const q = new Quaternion();
        const s = new Vector3();
        localMat.decompose(p, q, s);
        onTransformUpdateRef.current(itemId, {
          position: [p.x, p.y, p.z],
          rotation: [q.x, q.y, q.z, q.w] as EquipmentTransform["rotation"],
          scale: [s.x, s.y, s.z],
        });
      }
    });

    const studioEnvironment = createStudioEnvironment(renderer, scene);

    const keyLight = new DirectionalLight("#ffd7a3", 2.8);
    keyLight.position.set(3.4, 8.5, 7.2);
    const fillLight = new DirectionalLight("#c6ecff", 1.35);
    fillLight.position.set(-5.5, 4.8, 5.8);
    const rimLight = new DirectionalLight("#ffbf73", 1);
    rimLight.position.set(-2.5, 6.5, -7.5);
    const fineGrid = new GridHelper(240, 120, "#14532d", "#052e16");
    const coarseGrid = new GridHelper(240, 24, "#1f7a4d", "#14532d");
    configureGridOpacity(fineGrid, 0.34);
    configureGridOpacity(coarseGrid, 0.18);
    scene.add(keyLight, fillLight, rimLight, fineGrid, coarseGrid);

    let previewObject: Object3D | null = null;
    let directClipTime = 0;
    let disposed = false;
    const directPose = character ? createPoseBufferFromRig(character.rig) : null;
    const graphDisplayPose = character ? createPoseBufferFromRig(character.rig) : null;

    if (character) {
      previewObject = clone(character.scene);
      if (previewObject) {
        preparePreviewObject(previewObject);
        scene.add(previewObject);
        // Apply bind pose BEFORE the first render so the character always starts
        // from its canonical rest pose regardless of any state carried in the clone.
        if (directPose) {
          applyPoseBufferToSceneBones(directPose, character.rig, previewObject);
        }
        fitCameraToObject(camera, controls, previewObject);
        // Build bone lookup from the cloned scene so equipment can follow bones.
        characterBonesRef.current.clear();
        previewObject.traverse((obj) => {
          if (obj instanceof Bone) {
            characterBonesRef.current.set(obj.name, obj);
          }
        });
      }
    } else {
      camera.position.set(3, 2, 3);
      controls.update();
    }

    function resize() {
      const width = Math.max(mount!.clientWidth, 1);
      const height = Math.max(mount!.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const clock = new Clock();
    let animationFrame = 0;
    let lastMode = playback.modeRef.current;
    let lastAnimator: AnimatorInstance | null = animatorRef.current;
    let hadRootMotion = false;
    let handledResetPreviewPosition = resetPreviewPositionRef.current;
    const previewMotionOffset = new Vector3();

    function translateView(deltaX: number, deltaZ: number) {
      camera.position.x += deltaX;
      camera.position.z += deltaZ;
      controls.target.x += deltaX;
      controls.target.z += deltaZ;
      controls.update();
    }

    function resetPreviewMotion() {
      if (previewMotionOffset.x !== 0 || previewMotionOffset.z !== 0) {
        translateView(-previewMotionOffset.x, -previewMotionOffset.z);
      }

      if (!previewObject) {
        previewMotionOffset.set(0, 0, 0);
        return;
      }

      previewMotionOffset.set(0, 0, 0);
    }

    function renderFrame() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 1 / 24);
      updateInfiniteGrid(fineGrid, coarseGrid, controls.target.x, controls.target.z);

      if (resetPreviewPositionRef.current !== handledResetPreviewPosition) {
        resetPreviewMotion();
        handledResetPreviewPosition = resetPreviewPositionRef.current;
      }

      if (playback.modeRef.current !== lastMode) {
        resetPreviewMotion();
        lastMode = playback.modeRef.current;
        hadRootMotion = false;
      }

      if (previewObject && character) {
        if (playback.modeRef.current === "clip") {
          resetPreviewMotion();
          const clip = clipMap.get(playback.selectedClipIdRef.current);
          if (clip) {
            if (playback.isPlayingRef.current) {
              directClipTime += delta * playback.playbackSpeedRef.current;
            }
            if (directPose) {
              sampleClipPose(clip.asset, character.rig, directClipTime, directPose, true);
              applyPoseBufferToSceneBones(directPose, character.rig, previewObject);
            }
          }
        } else if (animatorRef.current) {
          for (const parameter of documentParametersRef.current) {
            if (parameter.type === "trigger") {
              if (playback.pendingTriggersRef.current.has(parameter.name)) {
                animatorRef.current.trigger(parameter.name);
                playback.pendingTriggersRef.current.delete(parameter.name);
              }
              continue;
            }
            const value = playback.parameterValuesRef.current[parameter.name];
            if (value !== undefined) {
              setAnimatorParameter(animatorRef.current, parameter.name, value, parameter.type);
            }
          }

          if (animatorRef.current !== lastAnimator) {
            resetPreviewMotion();
            lastAnimator = animatorRef.current;
            hadRootMotion = false;
          }

          const hasRootMotion = animatorRef.current.graph.layers.some(
            (layer) => layer.enabled && layer.weight > 0 && layer.rootMotionMode !== "none"
          );
          if (!hasRootMotion && hadRootMotion) {
            resetPreviewMotion();
          }

          const result = animatorRef.current.update(
            playback.isPlayingRef.current ? delta * playback.playbackSpeedRef.current : 0
          );

          if (graphDisplayPose) {
            if (hasRootMotion) {
              const deltaX = result.rootMotion.translation[0] ?? 0;
              previewMotionOffset.y += result.rootMotion.translation[1] ?? 0;
              const deltaZ = result.rootMotion.translation[2] ?? 0;
              previewMotionOffset.x += deltaX;
              previewMotionOffset.z += deltaZ;
              translateView(deltaX, deltaZ);
            }

            copyPose(result.pose, graphDisplayPose);
            forceBoneTranslationToBindPose(
              graphDisplayPose.translations,
              animatorRef.current.rig.bindTranslations,
              animatorRef.current.rig.rootBoneIndex
            );
            if (hasRootMotion) {
              addBoneTranslationOffset(
                graphDisplayPose.translations,
                animatorRef.current.rig.rootBoneIndex,
                previewMotionOffset.x,
                previewMotionOffset.y,
                previewMotionOffset.z
              );
            }
            applyPoseBufferToSceneBones(graphDisplayPose, animatorRef.current.rig, previewObject);
            hadRootMotion = hasRootMotion;
          }
        }
      }

      // ── Equipment positioning ────────────────────────────────────────────
      const eqItems = equipmentItemsRef.current;
      const eqSockets = equipmentSocketsRef.current;
      const selectedId = selectedItemIdRef.current;
      const activeDynamicsProfile = dynamicsProfilesRef.current.find((profile) => profile.id === selectedDynamicsProfileIdRef.current)
        ?? dynamicsProfilesRef.current[0]
        ?? null;

      for (const item of eqItems) {
        const mesh = equipmentMeshesRef.current.get(item.id);
        if (!mesh) continue;

        if (!item.enabled || !item.socketId) {
          mesh.visible = false;
          continue;
        }

        const eqSocket = eqSockets.find((s) => s.id === item.socketId);
        const bone = eqSocket ? characterBonesRef.current.get(eqSocket.boneName) : null;

        if (!eqSocket || !bone) {
          mesh.visible = false;
          continue;
        }

        mesh.visible = true;

        // While dragging the selected item TC controls the mesh; skip override
        if (item.id === selectedId && isDraggingRef.current) continue;

        // Compute world = boneWorld * localOffset
        bone.updateWorldMatrix(true, false);
        const localMatrix = new Matrix4().compose(
          new Vector3(...item.transform.position),
          new Quaternion().fromArray(item.transform.rotation),
          new Vector3(...item.transform.scale)
        );
        const worldMatrix = new Matrix4().multiplyMatrices(bone.matrixWorld, localMatrix);
        worldMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      }

      for (const collider of activeDynamicsProfile?.sphereColliders ?? []) {
        const mesh = dynamicsColliderMeshesRef.current.get(collider.id);
        const bone = characterBonesRef.current.get(collider.boneName);
        if (!mesh || !bone || !collider.enabled || !showDynamicsCollidersRef.current) {
          if (mesh) {
            mesh.visible = false;
          }
          continue;
        }

        const bonePosition = new Vector3();
        const boneRotation = new Quaternion();
        bone.getWorldPosition(bonePosition);
        bone.getWorldQuaternion(boneRotation);
        const offset = new Vector3(collider.offset.x, collider.offset.y, collider.offset.z).applyQuaternion(boneRotation);
        mesh.visible = true;
        mesh.position.copy(bonePosition.add(offset));
      }

      for (const [colliderId, mesh] of dynamicsColliderMeshesRef.current) {
        if (!showDynamicsCollidersRef.current || !activeDynamicsProfile?.sphereColliders.some((collider) => collider.id === colliderId && collider.enabled)) {
          mesh.visible = false;
        }
      }

      // ── TransformControls: attach/detach and keep mode in sync ───────────
      if (tc) {
        const selId = selectedItemIdRef.current;
        if (selId) {
          const selMesh = equipmentMeshesRef.current.get(selId);
          if (selMesh && tc.object !== selMesh) tc.attach(selMesh);
          else if (!selMesh && tc.object) tc.detach();
        } else if (tc.object) {
          tc.detach();
        }
        if (tc.object) tc.setMode(gizmoModeRef.current);
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      // Clear scene refs so equipment effect guards work correctly
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      orbitsRef.current = null;
      if (transformControlsRef.current) {
        transformControlsRef.current.dispose();
        transformControlsRef.current = null;
      }
      characterBonesRef.current.clear();
      equipmentMeshesRef.current.clear();
      dynamicsColliderMeshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else {
          mesh.material.dispose();
        }
      });
      dynamicsColliderMeshesRef.current.clear();
      controls.dispose();
      scene.environment = null;
      studioEnvironment.dispose();
      renderer.dispose();
      mount.innerHTML = "";
    };
    // clipMap reference changes when importedClips changes → restarts the scene correctly
    // character changes → restarts the scene with new model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, clipMap]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const activeProfile = document.dynamicsProfiles.find((profile) => profile.id === (selectedDynamicsProfileId ?? ""))
      ?? document.dynamicsProfiles[0]
      ?? null;
    const activeColliders = new Map((activeProfile?.sphereColliders ?? []).filter((collider) => collider.enabled).map((collider) => [collider.id, collider]));

    for (const [colliderId, mesh] of dynamicsColliderMeshesRef.current) {
      if (!activeColliders.has(colliderId)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else {
          mesh.material.dispose();
        }
        dynamicsColliderMeshesRef.current.delete(colliderId);
      }
    }

    activeColliders.forEach((collider, colliderId) => {
      const existing = dynamicsColliderMeshesRef.current.get(colliderId);
      if (existing) {
        const currentGeometry = existing.geometry as SphereGeometry;
        const currentRadius = currentGeometry.parameters.radius as number;
        if (Math.abs(currentRadius - collider.radius) > 1e-6) {
          existing.geometry.dispose();
          existing.geometry = new SphereGeometry(collider.radius, 18, 14);
        }
        return;
      }

      const mesh = new Mesh(
        new SphereGeometry(collider.radius, 18, 14),
        new MeshBasicMaterial({
          color: "#f59e0b",
          transparent: true,
          opacity: 0.48,
          wireframe: true,
          depthWrite: false
        })
      );
      mesh.renderOrder = 6;
      scene.add(mesh);
      dynamicsColliderMeshesRef.current.set(colliderId, mesh);
    });
  }, [character, document.dynamicsProfiles, selectedDynamicsProfileId, showDynamicsColliders]);

  // Equipment loading effect — syncs GLB meshes into the live scene.
  // Depends on `character` so it re-runs (and reloads all meshes) when the scene restarts.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const loader = gltfLoaderRef.current!;
    const currentIds = new Set(equipment.items.map((i) => i.id));

    // Remove meshes for items no longer in the list
    for (const [id, mesh] of equipmentMeshesRef.current) {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        equipmentMeshesRef.current.delete(id);
      }
    }

    // Load GLBs for new items
    for (const item of equipment.items) {
      if (equipmentMeshesRef.current.has(item.id)) continue;
      const file = equipment.filesRef.current.get(item.id);
      if (!file) continue;

      const url = URL.createObjectURL(file);
      const capturedId = item.id;

      loader
        .loadAsync(url)
        .then((gltf) => {
          URL.revokeObjectURL(url);
          const s = sceneRef.current;
          if (!s) return; // scene was torn down while loading
          if (!equipmentItemsRef.current.find((i) => i.id === capturedId)) return; // item removed
          gltf.scene.visible = false; // render loop will position and show it
          s.add(gltf.scene);
          equipmentMeshesRef.current.set(capturedId, gltf.scene);
        })
        .catch(() => URL.revokeObjectURL(url));
    }
  }, [equipment.items, character]); // character dep ensures reload when scene is recreated

  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" />
      <button
        type="button"
        onClick={() => {
          resetPreviewPositionRef.current += 1;
        }}
        className="pointer-events-auto absolute top-3 left-3 z-10 inline-flex h-9 items-center rounded-full bg-black/65 px-3 text-[12px] font-medium text-zinc-100 shadow-lg ring-1 ring-white/10 transition hover:bg-black/80"
      >
        <LocateFixed className="mr-2 size-4" />
        Reset Position
      </button>
    </div>
  );
}
