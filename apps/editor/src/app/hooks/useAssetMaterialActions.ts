import { type ChangeEvent, type RefObject } from "react";
import { Plane, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import {
  createAssignMaterialCommand,
  createDeleteAssetCommand,
  createDeleteMaterialCommand,
  createDeleteTextureCommand,
  createPlaceModelNodeCommand,
  createPlacePrimitiveNodeCommand,
  createReplaceNodesCommand,
  createSetUvOffsetCommand,
  createSetUvScaleCommand,
  createUpsertAssetCommand,
  createUpsertMaterialCommand,
  createUpsertTextureCommand,
  type EditorCore
} from "@ggez/editor-core";
import {
  buildModelLodLevelOrder,
  createSerializedModelAssetFiles,
  HIGH_MODEL_LOD_LEVEL,
  isPrimitiveNode,
  resolveModelAssetFiles,
  resolveModelFormat,
  snapVec3,
  vec2,
  vec3,
  type Asset,
  type ModelAssetFile,
  type ModelLodLevel,
  type ModelNode,
  type Material,
  type TextureRecord,
  type Vec2,
  type Vec3,
  type WorldLodLevelDefinition
} from "@ggez/shared";
import type { WorkerJob } from "@ggez/workers";
import type { ModelAssetLibraryItem } from "@/lib/model-assets";
import type { ExportWorkerRequest, ExportWorkerResponse } from "@/app/hooks/useExportWorker";
import { assetSessionStore } from "@/state/asset-session-store";
import { uiStore } from "@/state/ui-store";
import { toolSessionStore } from "@/state/tool-session-store";
import {
  analyzeModelSource,
  createAiModelPlaceholder,
  createModelAsset,
  dedupeModelFiles,
  inferModelLodLevelFromFileName,
  readFileAsDataUrl,
  resolveImportedModelAssetName,
  resolveModelAssetName,
  resolveModelFitScale,
  resolvePrimitiveNodeBounds
} from "@/lib/model-assets";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import type { ObjectGenerationResponse } from "@/lib/object-generation-contract";

export function useAssetMaterialActions({
  editor,
  enqueueWorkerJob,
  focusNode,
  glbImportInputRef,
  modelAssets,
  modelLodInputRef,
  runWorkerRequest
}: {
  editor: EditorCore;
  enqueueWorkerJob: (label: string, task: WorkerJob["task"], durationMs?: number) => void;
  focusNode: (nodeId: string) => void;
  glbImportInputRef: RefObject<HTMLInputElement | null>;
  modelAssets: ModelAssetLibraryItem[];
  modelLodInputRef: RefObject<HTMLInputElement | null>;
  runWorkerRequest: (request: ExportWorkerRequest, label: string) => Promise<ExportWorkerResponse>;
}) {
  const resolveActiveViewportState = () => uiStore.viewports[uiStore.activeViewportId];

  const resolvePlacementTarget = () => {
    const activeViewportState = resolveActiveViewportState();
    return snapVec3(activeViewportState.camera.target, resolveViewportSnapSize(activeViewportState));
  };

  const placeAssetAtPosition = (assetId: string, position: Vec3) => {
    const snapped = snapVec3(position, resolveViewportSnapSize(resolveActiveViewportState()));
    const asset = editor.scene.assets.get(assetId);

    if (!asset || asset.type !== "model") {
      return;
    }

    const label = resolveModelAssetName(asset) || "Model Prop";
    const { command, nodeId } = createPlaceModelNodeCommand(editor.scene, vec3(snapped.x, 1.1, snapped.z), {
      data: {
        assetId: asset.id,
        path: asset.path
      },
      name: label
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    uiStore.selectedAssetId = asset.id;
    enqueueWorkerJob("Asset placement", { task: "triangulation", worker: "geometryWorker" }, 650);
  };

  const handlePlaceAsset = (position: Vec3) => {
    if (!uiStore.selectedAssetId) {
      return;
    }

    placeAssetAtPosition(uiStore.selectedAssetId, position);
  };

  const handleInsertAsset = (assetId: string) => {
    placeAssetAtPosition(assetId, resolvePlacementTarget());
  };

  const handleImportGlb = () => {
    glbImportInputRef.current?.click();
  };

  const handleDropGlbFiles = async (files: File[], clientX: number, clientY: number, canvasRect: DOMRect) => {
    if (files.length === 0) {
      return;
    }

    try {
      const resolvedFiles = await resolveImportedModelFiles(files, editor.scene.settings.world.lod.levels);
      const primaryFile = resolvedFiles.find((entry) => entry.level === HIGH_MODEL_LOD_LEVEL) ?? resolvedFiles[0];

      if (!primaryFile) {
        return;
      }

      const bounds = await analyzeModelSource({
        format: primaryFile.format,
        path: primaryFile.path
      });
      const name = resolveImportedModelAssetName(files);
      const asset = createModelAsset({
        center: bounds.center,
        files: resolvedFiles,
        format: primaryFile.format,
        name,
        path: primaryFile.path,
        size: bounds.size,
        source: "import"
      });

      const activeViewport = uiStore.viewports[uiStore.activeViewportId];
      const dropPosition = unprojectDropToGroundPlane(clientX, clientY, canvasRect, activeViewport);
      const snappedPosition = snapVec3(dropPosition, resolveViewportSnapSize(activeViewport));
      const { command, nodeId } = createPlaceModelNodeCommand(
        editor.scene,
        {
          position: vec3(snappedPosition.x, snappedPosition.y, snappedPosition.z),
          rotation: vec3(0, 0, 0),
          scale: vec3(1, 1, 1)
        },
        {
          data: {
            assetId: asset.id,
            path: asset.path
          },
          name
        }
      );

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(command);
      editor.select([nodeId], "object");
      uiStore.selectedAssetId = asset.id;
      uiStore.rightPanel = "assets";
      enqueueWorkerJob("GLB drop import", { task: "triangulation", worker: "geometryWorker" }, 650);
    } catch {
      // silently ignore drop errors
    }
  };

  const handleGlbFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    try {
      const resolvedFiles = await resolveImportedModelFiles(files, editor.scene.settings.world.lod.levels);
      const primaryFile = resolvedFiles.find((entry) => entry.level === HIGH_MODEL_LOD_LEVEL) ?? resolvedFiles[0];

      if (!primaryFile) {
        return;
      }

      const bounds = await analyzeModelSource({
        format: primaryFile.format,
        path: primaryFile.path
      });
      const name = resolveImportedModelAssetName(files);
      const asset = createModelAsset({
        center: bounds.center,
        files: resolvedFiles,
        format: primaryFile.format,
        name,
        path: primaryFile.path,
        size: bounds.size,
        source: "import"
      });
      const fitScale = resolveModelFitScale(vec3(2, 2, 2), bounds);
      const target = resolvePlacementTarget();
      const { command, nodeId } = createPlaceModelNodeCommand(
        editor.scene,
        {
          position: vec3(target.x, target.y + 1, target.z),
          rotation: vec3(0, 0, 0),
          scale: vec3(fitScale, fitScale, fitScale)
        },
        {
          data: {
            assetId: asset.id,
            path: asset.path
          },
          name
        }
      );

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(command);
      editor.select([nodeId], "object");
      uiStore.selectedAssetId = asset.id;
      uiStore.rightPanel = "assets";
      enqueueWorkerJob("GLB import", { task: "triangulation", worker: "geometryWorker" }, 650);
    } finally {
      event.target.value = "";
    }
  };

  const handleAssignAssetLod = (assetId: string, level: ModelLodLevel) => {
    assetSessionStore.pendingAssetLodUpload = { assetId, level };
    modelLodInputRef.current?.click();
  };

  const handleClearAssetLod = (assetId: string, level: ModelLodLevel) => {
    if (level === HIGH_MODEL_LOD_LEVEL) {
      return;
    }

    const asset = editor.scene.assets.get(assetId);

    if (!asset || asset.type !== "model") {
      return;
    }

    const nextFiles = dedupeModelFiles(resolveModelAssetFiles(asset).filter((file) => file.level !== level));
    const nextAsset = updateModelAssetFiles(asset, nextFiles);

    editor.execute(createUpsertAssetCommand(editor.scene, nextAsset));
  };

  const handleAssetLodFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const pendingUpload = assetSessionStore.pendingAssetLodUpload;

    assetSessionStore.pendingAssetLodUpload = null;

    if (!file || !pendingUpload) {
      event.target.value = "";
      return;
    }

    try {
      const asset = editor.scene.assets.get(pendingUpload.assetId);

      if (!asset || asset.type !== "model") {
        return;
      }

      const path = await readFileAsDataUrl(file);
      const format = resolveImportedModelFormat(file.name);
      const nextFiles = dedupeModelFiles([
        ...resolveModelAssetFiles(asset).filter((entry) => entry.level !== pendingUpload.level),
        {
          format,
          level: pendingUpload.level,
          path
        } satisfies ModelAssetFile
      ]);

      const bounds =
        pendingUpload.level === HIGH_MODEL_LOD_LEVEL
          ? await analyzeModelSource({ format, path })
          : undefined;
      const nextAsset = updateModelAssetFiles(asset, nextFiles, bounds);

      editor.execute(createUpsertAssetCommand(editor.scene, nextAsset));
      uiStore.selectedAssetId = nextAsset.id;
      uiStore.rightPanel = "assets";
    } finally {
      event.target.value = "";
    }
  };

  const handleArmAiModelPlacement = () => {
    const aiModelDraft = toolSessionStore.aiModelDraft;

    if (aiModelDraft?.nodeId && editor.scene.getNode(aiModelDraft.nodeId)) {
      editor.select([aiModelDraft.nodeId], "object");
      toolSessionStore.activeToolId = "transform";
      toolSessionStore.transformMode = "scale";
      toolSessionStore.aiModelPlacementArmed = false;
      return;
    }

    toolSessionStore.aiModelPlacementArmed = true;
    toolSessionStore.aiModelDraft = aiModelDraft
      ? {
          ...aiModelDraft,
          error: undefined
        }
      : aiModelDraft;
    toolSessionStore.activeToolId = "brush";
  };

  const handleCancelAiModelPlacement = () => {
    toolSessionStore.aiModelPlacementArmed = false;
    toolSessionStore.aiModelDraft = null;
  };

  const handleUpdateAiModelPrompt = (prompt: string) => {
    toolSessionStore.aiModelDraft = toolSessionStore.aiModelDraft
      ? {
          ...toolSessionStore.aiModelDraft,
          error: undefined,
          prompt
        }
      : toolSessionStore.aiModelDraft;
  };

  const handlePlaceAiModelPlaceholder = (position: Vec3) => {
    const placeholder = createAiModelPlaceholder(position);
    const { command, nodeId } = createPlacePrimitiveNodeCommand(editor.scene, placeholder.transform, {
      data: placeholder.data,
      name: placeholder.name
    });

    editor.execute(command);
    editor.select([nodeId], "object");
    toolSessionStore.aiModelPlacementArmed = false;
    toolSessionStore.activeToolId = "transform";
    toolSessionStore.transformMode = "scale";
    toolSessionStore.aiModelDraft = {
      error: undefined,
      nodeId,
      prompt: toolSessionStore.aiModelDraft?.prompt ?? ""
    };
    enqueueWorkerJob("AI proxy placement", { task: "triangulation", worker: "geometryWorker" }, 500);
  };

  const queueAiModelGeneration = async (nodeId: string, prompt: string) => {
    try {
      const payload = await runWorkerRequest(
        {
          kind: "ai-model-generate",
          prompt
        },
        "Generate AI 3D"
      );

      if (typeof payload !== "string") {
        throw new Error("Invalid AI model response.");
      }

      const parsed = JSON.parse(payload) as ObjectGenerationResponse;

      if (!parsed.asset) {
        throw new Error("Missing AI model payload.");
      }

      const generated = parsed.asset;
      const bounds = await analyzeModelSource({
        format: "obj",
        path: generated.modelDataUrl
      });
      const asset = createModelAsset({
        center: bounds.center,
        format: "obj",
        materialMtlText: generated.materialMtlText,
        name: generated.name,
        path: generated.modelDataUrl,
        prompt: generated.prompt,
        size: bounds.size,
        source: "ai",
        texturePath: generated.textureDataUrl
      });
      const latestNode = editor.scene.getNode(nodeId);

      if (!latestNode || !isPrimitiveNode(latestNode)) {
        return;
      }

      const targetBounds = resolvePrimitiveNodeBounds(latestNode) ?? vec3(2, 2, 2);
      const fitScale = resolveModelFitScale(targetBounds, bounds);
      const replacement: ModelNode = {
        id: latestNode.id,
        kind: "model",
        name: generated.name,
        transform: {
          ...structuredClone(latestNode.transform),
          scale: vec3(fitScale, fitScale, fitScale)
        },
        data: {
          assetId: asset.id,
          path: asset.path
        }
      };

      editor.execute(createUpsertAssetCommand(editor.scene, asset));
      editor.execute(createReplaceNodesCommand(editor.scene, [replacement], "generate ai model"));
      if (editor.selection.ids.includes(replacement.id)) {
        editor.select([replacement.id], "object");
      }
      uiStore.selectedAssetId = asset.id;
      uiStore.rightPanel = "assets";
      enqueueWorkerJob("AI model generation", { task: "triangulation", worker: "geometryWorker" }, 700);
    } catch (error) {
      toolSessionStore.aiModelDraft = {
        error: error instanceof Error ? error.message : "Failed to generate model.",
        nodeId,
        prompt
      };
    }
  };

  const handleGenerateAiModel = async () => {
    const aiModelDraft = toolSessionStore.aiModelDraft;

    if (!aiModelDraft || aiModelDraft.prompt.trim().length === 0) {
      return;
    }

    const { nodeId, prompt } = aiModelDraft;
    const node = editor.scene.getNode(nodeId);

    if (!node || !isPrimitiveNode(node)) {
      toolSessionStore.aiModelDraft = aiModelDraft
        ? {
            ...aiModelDraft,
            error: "Proxy cube is missing."
          }
        : aiModelDraft;
      return;
    }

    toolSessionStore.aiModelDraft = null;
    toolSessionStore.aiModelPlacementArmed = false;
    void queueAiModelGeneration(nodeId, prompt.trim());
  };

  const handleApplyMaterial = (materialId: string, scope: "faces" | "object", faceIds: string[]) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createAssignMaterialCommand(editor.scene, targets, materialId));
  };

  const handleSetMaterialUvScale = (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createSetUvScaleCommand(editor.scene, targets, vec2(uvScale.x, uvScale.y)));
    enqueueWorkerJob("UV update", { task: "triangulation", worker: "geometryWorker" }, 450);
  };

  const handleSetMaterialUvOffset = (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => {
    if (editor.selection.ids.length === 0) {
      return;
    }

    const targets =
      scope === "faces" && faceIds.length > 0
        ? editor.selection.ids.slice(0, 1).map((nodeId) => ({ faceIds, nodeId }))
        : editor.selection.ids.map((nodeId) => ({ nodeId }));

    editor.execute(createSetUvOffsetCommand(editor.scene, targets, vec2(uvOffset.x, uvOffset.y)));
    enqueueWorkerJob("UV update", { task: "triangulation", worker: "geometryWorker" }, 450);
  };

  const handleUpsertMaterial = (material: Material) => {
    editor.execute(createUpsertMaterialCommand(editor.scene, material));
    uiStore.selectedMaterialId = material.id;
    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
  };

  const handleUpsertTexture = (texture: TextureRecord) => {
    editor.execute(createUpsertTextureCommand(editor.scene, texture));
  };

  const handleDeleteTexture = (textureId: string) => {
    editor.execute(createDeleteTextureCommand(editor.scene, textureId));
    enqueueWorkerJob("Texture library update", { task: "triangulation", worker: "geometryWorker" }, 250);
  };

  const handleDeleteMaterial = (materialId: string) => {
    const fallbackMaterial = Array.from(editor.scene.materials.values()).find((material) => material.id !== materialId);

    if (!fallbackMaterial) {
      return;
    }

    editor.execute(createDeleteMaterialCommand(editor.scene, materialId, fallbackMaterial.id));

    if (uiStore.selectedMaterialId === materialId) {
      uiStore.selectedMaterialId = fallbackMaterial.id;
    }

    enqueueWorkerJob("Material library update", { task: "triangulation", worker: "geometryWorker" }, 350);
  };

  const handleSelectAsset = (assetId: string) => {
    uiStore.selectedAssetId = assetId;
  };

  const handleFocusAssetNodes = (assetId: string) => {
    const assetEntry = modelAssets.find((item) => item.asset.id === assetId);

    if (!assetEntry || assetEntry.nodeIds.length === 0) {
      return;
    }

    uiStore.selectedAssetId = assetId;
    editor.select(assetEntry.nodeIds, "object");
    focusNode(assetEntry.nodeIds[0]);
  };

  const handleDeleteAsset = (assetId: string) => {
    const assetEntry = modelAssets.find((item) => item.asset.id === assetId);

    if (!assetEntry || assetEntry.usageCount > 0) {
      return;
    }

    editor.execute(createDeleteAssetCommand(editor.scene, assetId));

    if (uiStore.selectedAssetId === assetId) {
      const nextSelectedAsset = modelAssets.find((item) => item.asset.id !== assetId);
      uiStore.selectedAssetId = nextSelectedAsset?.asset.id ?? "";
    }
  };

  const handleSelectMaterial = (materialId: string) => {
    uiStore.selectedMaterialId = materialId;
  };

  return {
    aiActions: {
      cancelPlacement: handleCancelAiModelPlacement,
      generateModel: handleGenerateAiModel,
      startPlacement: handleArmAiModelPlacement,
      updatePrompt: handleUpdateAiModelPrompt
    },
    assetActions: {
      applyMaterial: handleApplyMaterial,
      assignAssetLod: handleAssignAssetLod,
      clearAssetLod: handleClearAssetLod,
      deleteAsset: handleDeleteAsset,
      deleteMaterial: handleDeleteMaterial,
      deleteTexture: handleDeleteTexture,
      dropImportGlb: handleDropGlbFiles,
      focusAssetNodes: handleFocusAssetNodes,
      importAsset: handleImportGlb,
      insertAsset: handleInsertAsset,
      selectAsset: handleSelectAsset,
      selectMaterial: handleSelectMaterial,
      setUvOffset: handleSetMaterialUvOffset,
      setUvScale: handleSetMaterialUvScale,
      upsertMaterial: handleUpsertMaterial,
      upsertTexture: handleUpsertTexture
    },
    fileInputHandlers: {
      handleAssetLodFileChange,
      handleGlbFileChange
    },
    placementActions: {
      placeAiModelPlaceholder: handlePlaceAiModelPlaceholder,
      placeAsset: handlePlaceAsset
    }
  };
}

async function resolveImportedModelFiles(files: File[], configuredLevels: WorldLodLevelDefinition[]) {
  const resolvedEntries = await Promise.all(
    files.map(async (file) => ({
      file,
      format: resolveImportedModelFormat(file.name),
      path: await readFileAsDataUrl(file)
    }))
  );
  const filesByLevel = new Map<ModelLodLevel, ModelAssetFile>();
  const availableLevels = buildModelLodLevelOrder([HIGH_MODEL_LOD_LEVEL, ...configuredLevels.map((level) => level.id)]);

  resolvedEntries.forEach((entry, index) => {
    const inferredLevel = inferModelLodLevelFromFileName(entry.file.name);
    const exactLevelMatch = configuredLevels.find((level) => entry.file.name.toLowerCase().includes(level.id.toLowerCase()));
    const desiredLevel = exactLevelMatch?.id ?? inferredLevel;
    const fallbackLevel = availableLevels.find((level) => !filesByLevel.has(level));
    const level = filesByLevel.has(desiredLevel) ? fallbackLevel ?? desiredLevel : desiredLevel;

    filesByLevel.set(level, {
      format: entry.format,
      level,
      path: entry.path
    });

    if (index === 0 && !filesByLevel.has(HIGH_MODEL_LOD_LEVEL)) {
      filesByLevel.set(HIGH_MODEL_LOD_LEVEL, {
        format: entry.format,
        level: HIGH_MODEL_LOD_LEVEL,
        path: entry.path
      });
    }
  });

  if (!filesByLevel.has(HIGH_MODEL_LOD_LEVEL)) {
    const firstFile = filesByLevel.values().next().value;

    if (firstFile) {
      filesByLevel.set(HIGH_MODEL_LOD_LEVEL, {
        ...firstFile,
        level: HIGH_MODEL_LOD_LEVEL
      });
    }
  }

  return dedupeModelFiles(Array.from(filesByLevel.values()));
}

function resolveImportedModelFormat(fileName: string) {
  return resolveModelFormat(undefined, fileName);
}

function updateModelAssetFiles(
  asset: Asset,
  files: ModelAssetFile[],
  bounds?: Awaited<ReturnType<typeof analyzeModelSource>>
): Asset {
  const nextFiles = dedupeModelFiles(files);
  const primaryFile = nextFiles.find((file) => file.level === HIGH_MODEL_LOD_LEVEL) ?? nextFiles[0];

  if (!primaryFile) {
    return structuredClone(asset);
  }

  return {
    ...structuredClone(asset),
    metadata: {
      ...structuredClone(asset.metadata),
      ...(bounds
        ? {
            nativeCenterX: bounds.center.x,
            nativeCenterY: bounds.center.y,
            nativeCenterZ: bounds.center.z,
            nativeSizeX: bounds.size.x,
            nativeSizeY: bounds.size.y,
            nativeSizeZ: bounds.size.z
          }
        : {}),
      materialMtlText: primaryFile.materialMtlText ?? "",
      modelFiles: createSerializedModelAssetFiles(nextFiles),
      modelFormat: primaryFile.format,
      texturePath: primaryFile.texturePath ?? ""
    },
    path: primaryFile.path
  };
}

function unprojectDropToGroundPlane(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  viewport: import("@ggez/render-pipeline").ViewportState
): import("@ggez/shared").Vec3 {
  const elevation = viewport.grid.elevation;

  if (viewport.projection === "perspective") {
    const camera = new PerspectiveCamera(
      viewport.camera.fov,
      canvasRect.width / canvasRect.height,
      viewport.camera.near,
      viewport.camera.far
    );

    camera.position.set(viewport.camera.position.x, viewport.camera.position.y, viewport.camera.position.z);
    camera.lookAt(viewport.camera.target.x, viewport.camera.target.y, viewport.camera.target.z);
    camera.updateMatrixWorld();

    const ndc = new Vector2(
      ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -(((clientY - canvasRect.top) / canvasRect.height) * 2 - 1)
    );

    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, camera);

    const groundPlane = new Plane(new Vector3(0, 1, 0), -elevation);
    const hitPoint = new Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);

    if (hit) {
      return vec3(hitPoint.x, elevation, hitPoint.z);
    }
  }

  // Fallback: use camera target XZ
  return vec3(viewport.camera.target.x, elevation, viewport.camera.target.z);
}
