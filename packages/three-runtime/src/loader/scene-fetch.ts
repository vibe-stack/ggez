import { isRuntimeBundle, isRuntimeScene, parseRuntimeScene } from "@ggez/runtime-format";
import type { WebHammerEngineBundle, WebHammerEngineScene } from "../types";

export function isWebHammerEngineScene(value: unknown): value is WebHammerEngineScene {
  return isRuntimeScene(value);
}

export function isWebHammerEngineBundle(value: unknown): value is WebHammerEngineBundle {
  return isRuntimeBundle(value);
}

export function parseWebHammerEngineScene(text: string): WebHammerEngineScene {
  return parseRuntimeScene(text);
}

export async function fetchWebHammerEngineScene(url: string, init?: RequestInit): Promise<WebHammerEngineScene> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch engine scene: ${response.status} ${response.statusText}`);
  }

  return parseWebHammerEngineScene(await response.text());
}
