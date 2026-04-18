import type { SceneSkyboxSettings, SceneToneMapping } from "@ggez/shared";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CineonToneMapping,
  Color,
  EquirectangularReflectionMapping,
  Fog,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";
import type { ToneMapping } from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import type { WebHammerEngineScene } from "../types";
import type { WebHammerSceneLoaderOptions } from "./types";

const textureLoader = new TextureLoader();
const hdrLoader = new HDRLoader();

type AppliedWorldSettingsState = {
  requestId: number;
  skyboxTexture?: Texture;
};

const APPLIED_WORLD_SETTINGS_KEY = "__webHammerWorldSettings";

export function resolveWebHammerToneMapping(mode: SceneToneMapping | undefined): ToneMapping {
  switch (mode) {
    case "none":
      return NoToneMapping;
    case "linear":
      return LinearToneMapping;
    case "reinhard":
      return ReinhardToneMapping;
    case "cineon":
      return CineonToneMapping;
    case "neutral":
      return NeutralToneMapping;
    case "aces":
    default:
      return ACESFilmicToneMapping;
  }
}

export async function applyWebHammerWorldSettings(
  target: Scene,
  engineScene: Pick<WebHammerEngineScene, "settings">,
  options: Pick<WebHammerSceneLoaderOptions, "applyToRenderer" | "resolveAssetUrl"> = {}
) {
  const state = getAppliedWorldSettingsState(target);
  state.requestId += 1;
  disposeAppliedSkybox(target, state);

  if (options.applyToRenderer) {
    options.applyToRenderer.toneMapping = resolveWebHammerToneMapping(engineScene.settings.world.toneMapping);
  }

  const { fogColor, fogFar, fogNear } = engineScene.settings.world;
  target.fog = fogFar > fogNear ? new Fog(new Color(fogColor), fogNear, fogFar) : null;

  const skybox = engineScene.settings.world.skybox;

  if (!skybox.enabled || !skybox.source) {
    return;
  }

  const requestId = state.requestId;

  try {
    const resolvedPath = options.resolveAssetUrl
      ? await options.resolveAssetUrl({
          kind: "skybox",
          path: skybox.source,
          skybox
        })
      : skybox.source;
    const texture = await loadSkyboxTexture(resolvedPath, skybox);

    if (getAppliedWorldSettingsState(target).requestId !== requestId) {
      texture.dispose();
      return;
    }

    target.background = texture;
    target.backgroundBlurriness = skybox.blur;
    target.backgroundIntensity = skybox.intensity;
    target.environment = skybox.affectsLighting ? texture : null;
    target.environmentIntensity = skybox.affectsLighting ? skybox.lightingIntensity : 1;
    state.skyboxTexture = texture;
  } catch {
    if (getAppliedWorldSettingsState(target).requestId === requestId) {
      disposeAppliedSkybox(target, state);
    }
  }
}

export function clearWebHammerWorldSettings(target: Scene) {
  const state = getAppliedWorldSettingsState(target);
  state.requestId += 1;
  disposeAppliedSkybox(target, state);
  target.fog = null;
}

export const applyRuntimeWorldSettingsToThreeScene = applyWebHammerWorldSettings;
export const clearRuntimeWorldSettingsFromThreeScene = clearWebHammerWorldSettings;

export function createWorldAmbientLight(engineScene: WebHammerEngineScene) {
  const { ambientColor, ambientIntensity } = engineScene.settings.world;

  if (ambientIntensity <= 0) {
    return undefined;
  }

  const light = new AmbientLight(ambientColor, ambientIntensity);
  light.name = "World Ambient";
  light.userData.webHammer = {
    source: "world-settings"
  };

  return light;
}

function getAppliedWorldSettingsState(target: Scene): AppliedWorldSettingsState {
  const userData = target.userData as Record<string, AppliedWorldSettingsState | undefined>;
  const existing = userData[APPLIED_WORLD_SETTINGS_KEY];

  if (existing) {
    return existing;
  }

  const created: AppliedWorldSettingsState = {
    requestId: 0
  };
  userData[APPLIED_WORLD_SETTINGS_KEY] = created;
  return created;
}

function disposeAppliedSkybox(target: Scene, state: AppliedWorldSettingsState) {
  if (state.skyboxTexture) {
    if (target.background === state.skyboxTexture) {
      target.background = null;
    }

    if (target.environment === state.skyboxTexture) {
      target.environment = null;
    }

    state.skyboxTexture.dispose();
    state.skyboxTexture = undefined;
  }

  target.backgroundBlurriness = 0;
  target.backgroundIntensity = 1;
  target.environmentIntensity = 1;
}

async function loadSkyboxTexture(path: string, skybox: SceneSkyboxSettings) {
  const texture = skybox.format === "hdr"
    ? await hdrLoader.loadAsync(path).catch((error) => {
        throw new Error(`Failed to load HDR skybox from ${path}.`, { cause: error });
      })
    : await textureLoader.loadAsync(path).catch((error) => {
        throw new Error(`Failed to load skybox image from ${path}.`, { cause: error });
      });

  texture.mapping = EquirectangularReflectionMapping;

  if (skybox.format === "image") {
    texture.colorSpace = SRGBColorSpace;
  }

  return texture;
}
