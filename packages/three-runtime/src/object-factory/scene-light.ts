import {
  AmbientLight,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  Object3D,
  PointLight,
  Quaternion,
  SpotLight,
  Vector3
} from "three";
import type { WebHammerEngineNode } from "../types";

const DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE = 2048;
const DEFAULT_DIRECTIONAL_SHADOW_BIAS = -0.00015;
const DEFAULT_DIRECTIONAL_SHADOW_NORMAL_BIAS = 0.03;
const DEFAULT_LIGHT_TARGET_DISTANCE = 6;
const localTargetVector = new Vector3();
const lightRotationEuler = new Euler();
const lightRotationQuaternion = new Quaternion();

function resolveLocalLightTarget(node: Extract<WebHammerEngineNode, { kind: "light" }>) {
  if (!node.data.target) {
    return new Vector3(0, 0, -DEFAULT_LIGHT_TARGET_DISTANCE);
  }

  localTargetVector.set(
    node.data.target.x - node.transform.position.x,
    node.data.target.y - node.transform.position.y,
    node.data.target.z - node.transform.position.z
  );

  lightRotationEuler.set(node.transform.rotation.x, node.transform.rotation.y, node.transform.rotation.z, "XYZ");
  lightRotationQuaternion.setFromEuler(lightRotationEuler).invert();
  localTargetVector.applyQuaternion(lightRotationQuaternion);
  localTargetVector.set(
    node.transform.scale.x === 0 ? localTargetVector.x : localTargetVector.x / node.transform.scale.x,
    node.transform.scale.y === 0 ? localTargetVector.y : localTargetVector.y / node.transform.scale.y,
    node.transform.scale.z === 0 ? localTargetVector.z : localTargetVector.z / node.transform.scale.z
  );

  return localTargetVector.clone();
}

export function applyDefaultShadowSettings(
  light: DirectionalLight | PointLight | SpotLight,
  shadow: { shadowBias?: number; shadowNormalBias?: number } = {}
) {
  if (!light.castShadow) {
    return;
  }

  light.shadow.mapSize.width = DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE;
  light.shadow.mapSize.height = DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE;
  light.shadow.bias = shadow.shadowBias ?? DEFAULT_DIRECTIONAL_SHADOW_BIAS;

  if ("normalBias" in light.shadow) {
    light.shadow.normalBias = shadow.shadowNormalBias ?? DEFAULT_DIRECTIONAL_SHADOW_NORMAL_BIAS;
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
      applyDefaultShadowSettings(light, node.data);
      return light;
    }
    case "directional": {
      const group = new Group();
      const light = new DirectionalLight(node.data.color, node.data.intensity);
      const target = new Object3D();
      light.castShadow = node.data.castShadow;
      applyDefaultShadowSettings(light, node.data);
      light.userData.webHammerShadow = {
        bias: node.data.shadowBias,
        normalBias: node.data.shadowNormalBias
      };
      target.position.copy(resolveLocalLightTarget(node));
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
      applyDefaultShadowSettings(light, node.data);
      target.position.copy(resolveLocalLightTarget(node));
      group.add(target);
      group.add(light);
      light.target = target;
      return group;
    }
    default:
      return undefined;
  }
}
