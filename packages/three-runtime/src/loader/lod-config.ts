import type { WorldLodSettings } from "@ggez/shared";
import type { WebHammerSceneLodOptions } from "./types";

export function resolveConfiguredSceneLodLevels(
  lod: WebHammerSceneLodOptions | undefined,
  worldLod: WorldLodSettings | undefined
) {
  if (Array.isArray(lod?.levels) && lod.levels.length > 0) {
    return [...lod.levels]
      .filter((level) => typeof level.level === "string" && level.level.length > 0)
      .sort((left, right) => left.distance - right.distance);
  }

  if (typeof lod?.midDistance === "number" || typeof lod?.lowDistance === "number") {
    const midDistance = Math.max(0, lod?.midDistance ?? 10);
    const lowDistance = Math.max(midDistance + 0.01, lod?.lowDistance ?? 30);

    return [
      { distance: midDistance, level: "mid" },
      { distance: lowDistance, level: "low" }
    ];
  }

  if (!worldLod?.enabled) {
    return undefined;
  }

  return [...worldLod.levels]
    .filter((level) => typeof level.id === "string" && level.id.length > 0)
    .sort((left, right) => left.distance - right.distance)
    .map((level) => ({
      distance: level.distance,
      level: level.id
    }));
}
