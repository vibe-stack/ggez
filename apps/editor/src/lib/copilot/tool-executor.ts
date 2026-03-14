import type { EditorCore } from "@web-hammer/editor-core";
import {
  createAssignMaterialCommand,
  createAssignMaterialToBrushesCommand,
  createDeleteSelectionCommand,
  createDuplicateNodesCommand,
  createExtrudeBrushNodesCommand,
  createGroupSelectionCommand,
  createMirrorNodesCommand,
  createOffsetBrushFaceCommand,
  createPlaceBlockoutPlatformCommand,
  createPlaceBlockoutRoomCommand,
  createPlaceBlockoutStairCommand,
  createPlaceBrushNodeCommand,
  createPlaceEntityCommand,
  createPlaceLightNodeCommand,
  createPlacePrimitiveNodeCommand,
  createSetNodeTransformCommand,
  createSetSceneSettingsCommand,
  createSetUvScaleCommand,
  createSplitBrushNodesCommand,
  createTranslateNodesCommand,
  createUpsertMaterialCommand
} from "@web-hammer/editor-core";
import { createAxisAlignedBrushFromBounds } from "@web-hammer/geometry-kernel";
import { makeTransform, vec3 } from "@web-hammer/shared";
import type { Material, SceneSettings } from "@web-hammer/shared";
import {
  createDefaultEntity,
  createDefaultLightData,
  createLightNodeLabel,
  createPrimitiveNodeData,
  createPrimitiveNodeLabel
} from "@/lib/authoring";
import type { CopilotToolCall, CopilotToolResult } from "./types";

type Args = Record<string, unknown>;

function num(args: Args, key: string, fallback = 0): number {
  const v = args[key];
  return typeof v === "number" ? v : fallback;
}

function str(args: Args, key: string, fallback = ""): string {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
}

function strArray(args: Args, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data });
}

function fail(error: string): string {
  return JSON.stringify({ success: false, error });
}

export function executeTool(editor: EditorCore, toolCall: CopilotToolCall): CopilotToolResult {
  const { name, args } = toolCall;

  try {
    const result = executeToolInner(editor, name, args);
    return { callId: toolCall.id, name, result };
  } catch (error) {
    return {
      callId: toolCall.id,
      name,
      result: fail(error instanceof Error ? error.message : "Unknown error")
    };
  }
}

function executeToolInner(editor: EditorCore, name: string, args: Args): string {
  const scene = editor.scene;

  switch (name) {
    // ── Placement ─────────────────────────────────────────────
    case "place_blockout_room": {
      const { command, groupId, nodeIds } = createPlaceBlockoutRoomCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        size: vec3(num(args, "sizeX", 10), num(args, "sizeY", 4), num(args, "sizeZ", 10)),
        openSides: strArray(args, "openSides") as Array<"bottom" | "east" | "north" | "south" | "top" | "west">,
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ groupId, nodeIds });
    }

    case "place_blockout_platform": {
      const { command, nodeId } = createPlaceBlockoutPlatformCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        size: vec3(num(args, "sizeX", 8), num(args, "sizeY", 0.5), num(args, "sizeZ", 8)),
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_blockout_stairs": {
      const { command, groupId, nodeIds, topLandingCenter } = createPlaceBlockoutStairCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        stepCount: num(args, "stepCount", 10),
        stepHeight: num(args, "stepHeight", 0.2),
        treadDepth: num(args, "treadDepth", 0.3),
        width: num(args, "width", 2),
        direction: (str(args, "direction") || "north") as "east" | "north" | "south" | "west",
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ groupId, nodeIds, topLandingCenter });
    }

    case "place_primitive": {
      const role = str(args, "role", "brush") as "brush" | "prop";
      const shape = str(args, "shape", "cube") as "cone" | "cube" | "cylinder" | "sphere";
      const size = vec3(num(args, "sizeX", 2), num(args, "sizeY", shape === "cylinder" || shape === "cone" ? 3 : 2), num(args, "sizeZ", 2));
      const data = createPrimitiveNodeData(role, shape, size);
      const matId = str(args, "materialId");
      if (matId) {
        data.materialId = matId;
      }
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const label = str(args, "name") || createPrimitiveNodeLabel(role, shape);
      const { command, nodeId } = createPlacePrimitiveNodeCommand(scene, transform, { data, name: label });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_brush": {
      const halfX = num(args, "sizeX", 4) * 0.5;
      const halfY = num(args, "sizeY", 3) * 0.5;
      const halfZ = num(args, "sizeZ", 4) * 0.5;
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const brushData = createAxisAlignedBrushFromBounds({
        x: { min: -halfX, max: halfX },
        y: { min: -halfY, max: halfY },
        z: { min: -halfZ, max: halfZ }
      });
      const { command, nodeId } = createPlaceBrushNodeCommand(scene, transform, {
        data: brushData,
        name: str(args, "name") || "Brush"
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_light": {
      const lightType = str(args, "type", "point") as "ambient" | "directional" | "hemisphere" | "point" | "spot";
      const data = createDefaultLightData(lightType);
      data.castShadow = false;

      if (args.color && typeof args.color === "string") {
        data.color = args.color;
      }

      if (typeof args.intensity === "number") {
        data.intensity = args.intensity;
      }

      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const label = str(args, "name") || createLightNodeLabel(lightType);
      const { command, nodeId } = createPlaceLightNodeCommand(scene, transform, { data, name: label });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_entity": {
      const entityType = str(args, "type", "player-spawn") as "npc-spawn" | "player-spawn" | "smart-object";
      const entityCount = Array.from(scene.entities.values()).filter((e) => e.type === entityType).length;
      const entity = createDefaultEntity(entityType, vec3(num(args, "x"), num(args, "y"), num(args, "z")), entityCount);

      if (str(args, "name")) {
        entity.name = str(args, "name");
      }

      const command = createPlaceEntityCommand(entity);
      editor.execute(command);
      return ok({ entityId: entity.id });
    }

    // ── Transform ─────────────────────────────────────────────
    case "translate_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      const delta = vec3(num(args, "dx"), num(args, "dy"), num(args, "dz"));
      const command = createTranslateNodesCommand(nodeIds, delta);
      editor.execute(command);
      return ok({});
    }

    case "set_node_transform": {
      const nodeId = str(args, "nodeId");
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));

      if (typeof args.rotationX === "number") transform.rotation.x = args.rotationX as number;
      if (typeof args.rotationY === "number") transform.rotation.y = args.rotationY as number;
      if (typeof args.rotationZ === "number") transform.rotation.z = args.rotationZ as number;
      if (typeof args.scaleX === "number") transform.scale.x = args.scaleX as number;
      if (typeof args.scaleY === "number") transform.scale.y = args.scaleY as number;
      if (typeof args.scaleZ === "number") transform.scale.z = args.scaleZ as number;

      const command = createSetNodeTransformCommand(scene, nodeId, transform);
      editor.execute(command);
      return ok({});
    }

    case "duplicate_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      const offset = vec3(num(args, "offsetX"), num(args, "offsetY"), num(args, "offsetZ"));
      const { command, duplicateIds } = createDuplicateNodesCommand(scene, nodeIds, offset);
      editor.execute(command);
      return ok({ duplicateIds });
    }

    case "mirror_nodes": {
      const command = createMirrorNodesCommand(strArray(args, "nodeIds"), str(args, "axis", "x") as "x" | "y" | "z");
      editor.execute(command);
      return ok({});
    }

    case "delete_nodes": {
      const command = createDeleteSelectionCommand(scene, strArray(args, "ids"));
      editor.execute(command);
      return ok({});
    }

    // ── Brush ─────────────────────────────────────────────────
    case "split_brush": {
      const { command, splitIds } = createSplitBrushNodesCommand(
        scene,
        strArray(args, "nodeIds"),
        str(args, "axis", "x") as "x" | "y" | "z"
      );
      editor.execute(command);
      return ok({ splitIds });
    }

    case "extrude_brush": {
      const command = createExtrudeBrushNodesCommand(
        scene,
        strArray(args, "nodeIds"),
        str(args, "axis", "y") as "x" | "y" | "z",
        num(args, "amount", 1),
        (String(args.direction ?? "1") === "-1" ? -1 : 1) as -1 | 1
      );
      editor.execute(command);
      return ok({});
    }

    case "offset_brush_face": {
      const command = createOffsetBrushFaceCommand(
        scene,
        str(args, "nodeId"),
        str(args, "axis", "y") as "x" | "y" | "z",
        str(args, "side", "max") as "max" | "min",
        num(args, "amount")
      );
      editor.execute(command);
      return ok({});
    }

    case "assign_material_to_brushes": {
      const command = createAssignMaterialToBrushesCommand(scene, strArray(args, "nodeIds"), str(args, "materialId"));
      editor.execute(command);
      return ok({});
    }

    // ── Materials ─────────────────────────────────────────────
    case "create_material": {
      const materialName = str(args, "name", "Custom Material");
      const slug = materialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const id = str(args, "id") || `material:custom:${slug}`;
      const material: Material = {
        id,
        name: materialName,
        color: str(args, "color", "#808080"),
        category: (str(args, "category") || "custom") as "blockout" | "custom" | "flat",
        metalness: num(args, "metalness", 0),
        roughness: num(args, "roughness", 0.8)
      };
      const command = createUpsertMaterialCommand(scene, material);
      editor.execute(command);
      return ok({ materialId: id });
    }

    case "assign_material": {
      const targets = (args.targets as Array<{ nodeId: string; faceIds?: string[] }>) ?? [];
      const materialId = str(args, "materialId");
      const command = createAssignMaterialCommand(scene, targets, materialId);
      editor.execute(command);
      return ok({});
    }

    case "set_uv_scale": {
      const targets = (args.targets as Array<{ nodeId: string; faceIds?: string[] }>) ?? [];
      const uvScale = { x: num(args, "scaleX", 1), y: num(args, "scaleY", 1) };
      const command = createSetUvScaleCommand(scene, targets, uvScale);
      editor.execute(command);
      return ok({});
    }

    // ── Scene management ──────────────────────────────────────
    case "group_nodes": {
      const result = createGroupSelectionCommand(scene, strArray(args, "ids"));

      if (!result) {
        return fail("No valid nodes to group");
      }

      editor.execute(result.command);
      return ok({ groupId: result.groupId });
    }

    case "select_nodes": {
      editor.select(strArray(args, "ids"), "object");
      return ok({});
    }

    case "clear_selection": {
      editor.clearSelection();
      return ok({});
    }

    case "undo": {
      editor.undo();
      return ok({});
    }

    case "set_scene_settings": {
      const current = scene.settings;
      const next: SceneSettings = structuredClone(current);

      if (typeof args.gravityX === "number" || typeof args.gravityY === "number" || typeof args.gravityZ === "number") {
        next.world.gravity = vec3(
          num(args, "gravityX", current.world.gravity.x),
          num(args, "gravityY", current.world.gravity.y),
          num(args, "gravityZ", current.world.gravity.z)
        );
      }

      if (typeof args.physicsEnabled === "boolean") next.world.physicsEnabled = args.physicsEnabled;
      if (typeof args.ambientColor === "string") next.world.ambientColor = args.ambientColor as string;
      if (typeof args.ambientIntensity === "number") next.world.ambientIntensity = args.ambientIntensity;
      if (typeof args.fogColor === "string") next.world.fogColor = args.fogColor as string;
      if (typeof args.fogNear === "number") next.world.fogNear = args.fogNear;
      if (typeof args.fogFar === "number") next.world.fogFar = args.fogFar;
      if (typeof args.cameraMode === "string") next.player.cameraMode = args.cameraMode as "fps" | "third-person" | "top-down";
      if (typeof args.playerHeight === "number") next.player.height = args.playerHeight;
      if (typeof args.movementSpeed === "number") next.player.movementSpeed = args.movementSpeed;
      if (typeof args.jumpHeight === "number") next.player.jumpHeight = args.jumpHeight;

      const command = createSetSceneSettingsCommand(scene, next);
      editor.execute(command);
      return ok({});
    }

    // ── Read-only queries ─────────────────────────────────────
    case "list_nodes": {
      const nodes = Array.from(scene.nodes.values()).map((n) => ({
        id: n.id,
        name: n.name,
        kind: n.kind,
        position: n.transform.position,
        tags: n.tags
      }));
      return JSON.stringify({ nodes });
    }

    case "list_entities": {
      const entities = Array.from(scene.entities.values()).map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        position: e.transform.position
      }));
      return JSON.stringify({ entities });
    }

    case "list_materials": {
      const materials = Array.from(scene.materials.values()).map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        category: m.category
      }));
      return JSON.stringify({ materials });
    }

    case "get_node_details": {
      const node = scene.getNode(str(args, "nodeId"));

      if (!node) {
        return fail("Node not found");
      }

      return JSON.stringify({
        id: node.id,
        name: node.name,
        kind: node.kind,
        transform: node.transform,
        tags: node.tags,
        metadata: node.metadata
      });
    }

    case "get_scene_settings": {
      return JSON.stringify(scene.settings);
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}
