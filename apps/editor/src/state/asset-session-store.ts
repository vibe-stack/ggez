import { proxy } from "valtio";
import type { ModelLodLevel } from "@ggez/shared";

type AssetSessionState = {
  pendingAssetLodUpload: {
    assetId: string;
    level: ModelLodLevel;
  } | null;
};

function createInitialAssetSessionState(): AssetSessionState {
  return {
    pendingAssetLodUpload: null
  };
}

export const assetSessionStore = proxy<AssetSessionState>(createInitialAssetSessionState());

export function resetAssetSessionStore() {
  Object.assign(assetSessionStore, createInitialAssetSessionState());
}
