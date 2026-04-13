import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  Object3D,
  PointLight,
  SpotLight
} from "three";
import type { WebHammerEngineNode } from "../types";

const DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE = 2048;
const DEFAULT_DIRECTIONAL_SHADOW_BIAS = -0.00015;
const DEFAULT_DIRECTIONAL_SHADOW_NORMAL_BIAS = 0.03;

export function applyDefaultShadowSettings(light: DirectionalLight | PointLight | SpotLight) {
  if (!light.castShadow) {
    return;
  }

  light.shadow.mapSize.width = DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE;
  light.shadow.mapSize.height = DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE;
  light.shadow.bias = DEFAULT_DIRECTIONAL_SHADOW_BIAS;

  if ("normalBias" in light.shadow) {
    light.shadow.normalBias = DEFAULT_DIRECTIONAL_SHADOW_NORMAL_BIAS;
  }
}

export function createThreeLight(node: Extract<WebHammerEngineNode, { kind: "light" }>) {
  if (!node.data.enabled) {
    return undefined;
  }

  switch (node.data.type) {
    case "ambient": {
      return new AmbientLight(node.data.color, node.data.intensity);
    }
    case "hemisphere": {
      return new HemisphereLight(node.data.color, node.data.groundColor ?? "#0f1721", node.data.intensity);
    }
    case "point": {
      const light = new PointLight(node.data.color, node.data.intensity, node.data.distance ?? 0, node.data.decay ?? 2);
      light.castShadow = node.data.castShadow;
      applyDefaultShadowSettings(light);
      return light;
    }
    case "directional": {
      const group = new Group();
      const light = new DirectionalLight(node.data.color, node.data.intensity);
      const target = new Object3D();
      light.castShadow = node.data.castShadow;
      applyDefaultShadowSettings(light);
      target.position.set(0, 0, -6);
      group.add(target);
      group.add(light);
      light.target = target;
      return group;
    }
    case "spot": {
      const group = new Group();
      const light = new SpotLight(
        node.data.color,
        node.data.intensity,
        node.data.distance,
        node.data.angle,
        node.data.penumbra,
        node.data.decay
      );
      const target = new Object3D();
      light.castShadow = node.data.castShadow;
      applyDefaultShadowSettings(light);
      target.position.set(0, 0, -6);
      group.add(target);
      group.add(light);
      light.target = target;
      return group;
    }
    default:
      return undefined;
  }
}
