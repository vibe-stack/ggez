import { MATERIAL_TEXTURE_FIELDS, textureReferenceMatches, type Material, type TextureRecord } from "@ggez/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";

export function createUpsertTextureCommand(
  scene: SceneDocument,
  texture: TextureRecord
): Command {
  const before = scene.textures.get(texture.id);
  const next = structuredClone(texture);

  return {
    label: before ? "update texture" : "create texture",
    execute(nextScene) {
      nextScene.setTexture(structuredClone(next));
    },
    undo(nextScene) {
      if (before) {
        nextScene.setTexture(structuredClone(before));
        return;
      }

      nextScene.removeTexture(texture.id);
    }
  };
}

export function createDeleteTextureCommand(
  scene: SceneDocument,
  textureId: string,
  fallbackColor = "#a8aea7"
): Command {
  const texture = scene.textures.get(textureId);

  if (!texture) {
    return {
      label: "delete texture",
      execute() {},
      undo() {}
    };
  }

  const affectedMaterials = Array.from(scene.materials.values())
    .filter((material) =>
      MATERIAL_TEXTURE_FIELDS.some((field) => textureReferenceMatches(material[field], texture))
    )
    .map((material) => ({
      before: structuredClone(material),
      next: removeTextureFromMaterial(material, texture, fallbackColor)
    }));

  return {
    label: "delete texture",
    execute(nextScene) {
      affectedMaterials.forEach(({ next }) => {
        nextScene.setMaterial(structuredClone(next));
      });
      nextScene.removeTexture(textureId);
    },
    undo(nextScene) {
      nextScene.setTexture(structuredClone(texture));
      affectedMaterials.forEach(({ before }) => {
        nextScene.setMaterial(structuredClone(before));
      });
    }
  };
}

function removeTextureFromMaterial(
  material: Material,
  texture: Pick<TextureRecord, "dataUrl" | "id">,
  fallbackColor: string
) {
  const next = structuredClone(material);

  if (textureReferenceMatches(next.colorTexture, texture)) {
    next.colorTexture = undefined;
    next.color = fallbackColor;
  }

  if (textureReferenceMatches(next.normalTexture, texture)) {
    next.normalTexture = undefined;
  }

  if (textureReferenceMatches(next.metalnessTexture, texture)) {
    next.metalnessTexture = undefined;
  }

  if (textureReferenceMatches(next.roughnessTexture, texture)) {
    next.roughnessTexture = undefined;
  }

  return next;
}
