import { proxy } from "valtio";

type SceneSessionState = {
  hiddenSceneItemIds: string[];
  lockedSceneItemIds: string[];
  selectedMaterialFaceIds: string[];
  selectedScenePathId?: string;
};

function createInitialSceneSessionState(): SceneSessionState {
  return {
    hiddenSceneItemIds: [],
    lockedSceneItemIds: [],
    selectedMaterialFaceIds: [],
    selectedScenePathId: undefined
  };
}

export const sceneSessionStore = proxy<SceneSessionState>(createInitialSceneSessionState());

export function resetSceneSessionStore() {
  Object.assign(sceneSessionStore, createInitialSceneSessionState());
}
