import type { Asset } from "@ggez/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";

export function createUpsertAssetCommand(
  scene: SceneDocument,
  asset: Asset
): Command {
  const before = scene.assets.get(asset.id);
  const nextAsset = structuredClone(asset);
  const beforeAsset = before ? structuredClone(before) : undefined;

  return {
    label: beforeAsset ? "update asset" : "add asset",
    execute(nextScene) {
      nextScene.setAsset(structuredClone(nextAsset));
    },
    undo(nextScene) {
      if (beforeAsset) {
        nextScene.setAsset(structuredClone(beforeAsset));
        return;
      }

      nextScene.assets.delete(nextAsset.id);
      nextScene.touch();
    }
  };
}

export function createDeleteAssetCommand(
  scene: SceneDocument,
  assetId: string
): Command {
  const before = scene.assets.get(assetId);
  const beforeAsset = before ? structuredClone(before) : undefined;

  return {
    label: "delete asset",
    execute(nextScene) {
      nextScene.removeAsset(assetId);
    },
    undo(nextScene) {
      if (!beforeAsset) {
        return;
      }

      nextScene.setAsset(structuredClone(beforeAsset));
    }
  };
}
