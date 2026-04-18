import { createContext, useContext, type ReactNode } from "react";
import type { TransformAxis } from "@ggez/editor-core";
import type {
  Brush,
  EditableMesh,
  EditableMeshMaterialLayer,
  Entity,
  EntityType,
  GeometryNode,
  LightNodeData,
  LightType,
  Material,
  ModelLodLevel,
  ModelReference,
  PrimitiveNodeData,
  SceneSettings,
  TextureRecord,
  Transform,
  Vec2
} from "@ggez/shared";
import type { PrimitiveShape } from "@ggez/shared";
import type { MeshEditToolbarActionRequest } from "@/viewport/types";

export type EditorHistoryActions = {
  canRedo: boolean;
  canUndo: boolean;
  redo: () => void;
  undo: () => void;
};

export type EditorActionDomains = {
  aiActions: {
    cancelPlacement: () => void;
    generateModel: () => void;
    startPlacement: () => void;
    updatePrompt: (prompt: string) => void;
  };
  assetActions: {
    applyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
    assignAssetLod: (assetId: string, level: ModelLodLevel) => void;
    clearAssetLod: (assetId: string, level: ModelLodLevel) => void;
    deleteAsset: (assetId: string) => void;
    deleteMaterial: (materialId: string) => void;
    deleteTexture: (textureId: string) => void;
    dropImportGlb: (files: File[], clientX: number, clientY: number, canvasRect: DOMRect) => void;
    focusAssetNodes: (assetId: string) => void;
    importAsset: () => void;
    insertAsset: (assetId: string) => void;
    selectAsset: (assetId: string) => void;
    selectMaterial: (materialId: string) => void;
    setUvOffset: (scope: "faces" | "object", faceIds: string[], uvOffset: Vec2) => void;
    setUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => void;
    upsertMaterial: (material: Material) => void;
    upsertTexture: (texture: TextureRecord) => void;
  };
  fileActions: {
    createBrush: () => void;
    exportEngine: () => void;
    exportGltf: () => void;
    exportSceneDocument: () => void;
    importGlb: () => void;
    importSceneDocument: () => void;
    loadWhmap: () => void;
    newFile: () => void;
    saveWhmap: () => void;
  };
  history: EditorHistoryActions;
  physicsActions: {
    pause: () => void;
    play: () => void;
  };
  placementActions: {
    placeAiModelPlaceholder: (position: { x: number; y: number; z: number }) => void;
    placeAsset: (position: { x: number; y: number; z: number }) => void;
    placeBlockoutOpenRoom: () => void;
    placeBlockoutPlatform: () => void;
    placeBlockoutRoom: () => void;
    placeBlockoutStairs: () => void;
    placeBrush: (brush: Brush, transform: Transform) => void;
    placeEntity: (type: EntityType) => void;
    placeInstancingNodes: (sourceNodeId: string, transforms: Transform[]) => void;
    placeLight: (type: LightType) => void;
    placeMeshNode: (mesh: EditableMesh, transform: Transform, name: string) => void;
    placePrimitiveNode: (data: PrimitiveNodeData, transform: Transform, name: string) => void;
    placeProp: (shape: PrimitiveShape) => void;
  };
  sceneActions: {
    commitMeshMaterialLayers: (
      nodeId: string,
      layers: EditableMeshMaterialLayer[] | undefined,
      beforeLayers?: EditableMeshMaterialLayer[] | undefined
    ) => void;
    commitMeshTopology: (nodeId: string, mesh: EditableMesh) => void;
    meshEditToolbarAction: (action: MeshEditToolbarActionRequest["kind"]) => void;
    previewBrushData: (nodeId: string, brush: Brush) => void;
    previewEntityTransform: (entityId: string, transform: Transform) => void;
    previewMeshData: (nodeId: string, mesh: EditableMesh) => void;
    previewNodeTransform: (nodeId: string, transform: Transform) => void;
    splitBrushAtCoordinate: (nodeId: string, axis: TransformAxis, coordinate: number) => void;
    updateBrushData: (nodeId: string, brush: Brush, beforeBrush?: Brush) => void;
    updateEntityHooks: (
      entityId: string,
      hooks: NonNullable<Entity["hooks"]>,
      beforeHooks?: NonNullable<Entity["hooks"]>
    ) => void;
    updateEntityProperties: (entityId: string, properties: Record<string, string | number | boolean>) => void;
    updateEntityTransform: (entityId: string, transform: Transform, beforeTransform?: Transform) => void;
    updateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
    updateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData | ModelReference) => void;
    updateNodeHooks: (
      nodeId: string,
      hooks: NonNullable<GeometryNode["hooks"]>,
      beforeHooks?: NonNullable<GeometryNode["hooks"]>
    ) => void;
    updateNodeTransform: (nodeId: string, transform: Transform, beforeTransform?: Transform) => void;
    updateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  };
  selectionActions: {
    clearSelection: () => void;
    clipSelection: (axis: TransformAxis) => void;
    deleteSelection: () => void;
    duplicateSelection: () => void;
    extrudeSelection: (axis: TransformAxis, direction: -1 | 1) => void;
    focusNode: (nodeId: string) => void;
    groupSelection: () => void;
    invertSelectionNormals: () => void;
    mirrorSelection: (axis: TransformAxis) => void;
    selectNodes: (nodeIds: string[]) => void;
    toggleSceneItemLock: (itemId: string) => void;
    toggleSceneItemVisibility: (itemId: string) => void;
    translateSelection: (axis: TransformAxis, direction: -1 | 1) => void;
  };
};

const EditorActionDomainsContext = createContext<EditorActionDomains | null>(null);

export function EditorActionDomainsProvider({
  children,
  value
}: {
  children: ReactNode;
  value: EditorActionDomains;
}) {
  return <EditorActionDomainsContext.Provider value={value}>{children}</EditorActionDomainsContext.Provider>;
}

export function useEditorActionDomains() {
  const value = useContext(EditorActionDomainsContext);

  if (!value) {
    throw new Error("useEditorActionDomains must be used within an EditorActionDomainsProvider.");
  }

  return value;
}
