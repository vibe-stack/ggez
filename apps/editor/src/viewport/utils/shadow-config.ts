import {
  Box3,
  Euler,
  Matrix4,
  Object3D,
  OrthographicCamera,
  Vector2,
  Vector3,
  type DirectionalLight,
  type PointLight,
  type SpotLight
} from "three";

const directionalShadowBounds = new Box3();
const directionalShadowSize = new Vector3();
const directionalShadowCenter = new Vector3();
const directionalShadowMin = new Vector3();
const directionalShadowMax = new Vector3();
const directionalShadowCorner = new Vector3();
const directionalShadowViewMatrix = new Matrix4();
const resolvedLightTarget = new Vector3();
const resolvedLightForward = new Vector3();
const resolvedLightEuler = new Euler();
const resolvedShadowTarget = new Vector3();
const resolvedShadowTargetLightSpace = new Vector3();

const DEFAULT_DIRECTIONAL_SHADOW_RADIUS = 64;
const DEFAULT_DIRECTIONAL_SHADOW_FAR = 180;
const DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE = 1024;
const MAX_DIRECTIONAL_SHADOW_MAP_SIZE = 2048;
const DIRECTIONAL_SHADOW_BIAS = -0.00015;
const DIRECTIONAL_SHADOW_NORMAL_BIAS = 0.03;
const DIRECTIONAL_SHADOW_CONFIG_EPSILON = 0.001;
const DIRECTIONAL_SHADOW_DEPTH_PADDING = 8;
const DIRECTIONAL_SHADOW_PLANE_PADDING = 4;
const DIRECTIONAL_TARGET_FALLBACK_DISTANCE = 6;
const DIRECTIONAL_MAX_SHADOW_RADIUS = 196;
const DIRECTIONAL_VSM_SHADOW_RADIUS = 1.25;
const DIRECTIONAL_VSM_SHADOW_BLUR_SAMPLES = 4;

export const VSM_SHADOW_RADIUS = 4;
export const VSM_SHADOW_BLUR_SAMPLES = 8;
export const POINT_LIGHT_SHADOW_MAP_SIZE = 256;
export const SPOT_LIGHT_SHADOW_MAP_SIZE = 512;

export type DirectionalShadowConfig = {
  bias: number;
  far: number;
  mapSize: number;
  normalBias: number;
  radius: number;
};

export type ShadowBiasConfig = {
  shadowBias?: number;
  shadowBlurRadius?: number;
  shadowBlurSamples?: number;
  shadowMapSize?: number;
  shadowNormalBias?: number;
};

type ShadowCastingLight = DirectionalLight | PointLight | SpotLight;

export function createDefaultDirectionalShadowConfig(): DirectionalShadowConfig {
  return {
    bias: DIRECTIONAL_SHADOW_BIAS,
    far: DEFAULT_DIRECTIONAL_SHADOW_FAR,
    mapSize: DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE,
    normalBias: DIRECTIONAL_SHADOW_NORMAL_BIAS,
    radius: DEFAULT_DIRECTIONAL_SHADOW_RADIUS
  };
}

export function resolveDirectionalShadowConfig(root: Object3D | null): DirectionalShadowConfig {
  if (!root) {
    return createDefaultDirectionalShadowConfig();
  }

  root.updateMatrixWorld(true);
  directionalShadowBounds.setFromObject(root);

  if (directionalShadowBounds.isEmpty()) {
    return createDefaultDirectionalShadowConfig();
  }

  directionalShadowBounds.getSize(directionalShadowSize);

  const radius = Math.max(
    DEFAULT_DIRECTIONAL_SHADOW_RADIUS,
    directionalShadowSize.x * 0.75,
    directionalShadowSize.z * 0.75,
    directionalShadowSize.y
  );
  const far = Math.max(DEFAULT_DIRECTIONAL_SHADOW_FAR, directionalShadowSize.length() * 2.5);
  const biasScale = radius / DEFAULT_DIRECTIONAL_SHADOW_RADIUS;
  const mapSize = Math.min(
    MAX_DIRECTIONAL_SHADOW_MAP_SIZE,
    Math.max(DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE, Math.ceil((DEFAULT_DIRECTIONAL_SHADOW_MAP_SIZE * biasScale) / 256) * 256)
  );

  return {
    bias: DIRECTIONAL_SHADOW_BIAS * biasScale,
    far,
    mapSize,
    normalBias: DIRECTIONAL_SHADOW_NORMAL_BIAS * biasScale,
    radius
  };
}

export function areDirectionalShadowConfigsEqual(a: DirectionalShadowConfig, b: DirectionalShadowConfig) {
  return (
    Math.abs(a.bias - b.bias) < DIRECTIONAL_SHADOW_CONFIG_EPSILON &&
    Math.abs(a.far - b.far) < DIRECTIONAL_SHADOW_CONFIG_EPSILON &&
    a.mapSize === b.mapSize &&
    Math.abs(a.normalBias - b.normalBias) < DIRECTIONAL_SHADOW_CONFIG_EPSILON &&
    Math.abs(a.radius - b.radius) < DIRECTIONAL_SHADOW_CONFIG_EPSILON
  );
}

export function applySoftVsmShadowConfig(light: ShadowCastingLight, mapSize: number, config: ShadowBiasConfig = {}) {
  const resolvedMapSize = Math.max(128, Math.round((config.shadowMapSize ?? mapSize) / 128) * 128);

  if (light.shadow.mapSize.x !== resolvedMapSize || light.shadow.mapSize.y !== resolvedMapSize) {
    light.shadow.mapSize.set(resolvedMapSize, resolvedMapSize);
  }

  light.shadow.bias = config.shadowBias ?? DIRECTIONAL_SHADOW_BIAS;
  light.shadow.normalBias = config.shadowNormalBias ?? DIRECTIONAL_SHADOW_NORMAL_BIAS;
  light.shadow.radius = config.shadowBlurRadius ?? VSM_SHADOW_RADIUS;
  light.shadow.blurSamples = Math.max(1, Math.round(config.shadowBlurSamples ?? VSM_SHADOW_BLUR_SAMPLES));
  light.shadow.needsUpdate = true;
}

export function resolveLightTargetPosition(
  position: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number },
  target?: { x: number; y: number; z: number },
  fallbackDistance = DIRECTIONAL_TARGET_FALLBACK_DISTANCE
) {
  if (target) {
    return {
      x: target.x,
      y: target.y,
      z: target.z
    };
  }

  resolvedLightEuler.set(rotation.x, rotation.y, rotation.z, "XYZ");
  resolvedLightForward.set(0, 0, -fallbackDistance).applyEuler(resolvedLightEuler);
  resolvedLightTarget.set(position.x, position.y, position.z).add(resolvedLightForward);

  return {
    x: resolvedLightTarget.x,
    y: resolvedLightTarget.y,
    z: resolvedLightTarget.z
  };
}

export function applyDirectionalShadowConfig(light: DirectionalLight, config: DirectionalShadowConfig) {
  const shadowCamera = light.shadow.camera as OrthographicCamera;

  shadowCamera.near = 0.5;
  shadowCamera.far = config.far;
  shadowCamera.left = -config.radius;
  shadowCamera.right = config.radius;
  shadowCamera.top = config.radius;
  shadowCamera.bottom = -config.radius;
  shadowCamera.updateProjectionMatrix();

  light.shadow.bias = config.bias;
  light.shadow.normalBias = config.normalBias;
  applySoftVsmShadowConfig(light, config.mapSize, {
    shadowBias: config.bias,
    shadowNormalBias: config.normalBias
  });
}

export function fitDirectionalShadowToScene(
  light: DirectionalLight,
  root: Object3D | null,
  targetPosition?: { x: number; y: number; z: number },
  shadowRadius?: number,
  config: ShadowBiasConfig = {}
) {
  const fallbackConfig = root ? resolveDirectionalShadowConfig(root) : createDefaultDirectionalShadowConfig();

  if (!root) {
    applyDirectionalShadowConfig(light, fallbackConfig);
    return;
  }

  root.updateMatrixWorld(true);
  directionalShadowBounds.setFromObject(root);

  if (directionalShadowBounds.isEmpty()) {
    applyDirectionalShadowConfig(light, fallbackConfig);
    return;
  }

  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);
  light.shadow.updateMatrices(light);

  const shadowCamera = light.shadow.camera as OrthographicCamera;
  directionalShadowViewMatrix.copy(shadowCamera.matrixWorldInverse);
  directionalShadowMin.set(Infinity, Infinity, Infinity);
  directionalShadowMax.set(-Infinity, -Infinity, -Infinity);

  for (let x = 0; x <= 1; x += 1) {
    for (let y = 0; y <= 1; y += 1) {
      for (let z = 0; z <= 1; z += 1) {
        directionalShadowCorner.set(
          x === 0 ? directionalShadowBounds.min.x : directionalShadowBounds.max.x,
          y === 0 ? directionalShadowBounds.min.y : directionalShadowBounds.max.y,
          z === 0 ? directionalShadowBounds.min.z : directionalShadowBounds.max.z
        );
        directionalShadowCorner.applyMatrix4(directionalShadowViewMatrix);
        directionalShadowMin.min(directionalShadowCorner);
        directionalShadowMax.max(directionalShadowCorner);
      }
    }
  }

  directionalShadowBounds.getSize(directionalShadowSize);

  if (targetPosition) {
    resolvedShadowTarget.set(targetPosition.x, targetPosition.y, targetPosition.z);
  } else {
    directionalShadowBounds.getCenter(directionalShadowCenter);
    resolvedShadowTarget.copy(directionalShadowCenter);
  }

  resolvedShadowTargetLightSpace.copy(resolvedShadowTarget).applyMatrix4(directionalShadowViewMatrix);

  const resolvedRadius = Math.min(
    DIRECTIONAL_MAX_SHADOW_RADIUS,
    Math.max(
      shadowRadius ?? DEFAULT_DIRECTIONAL_SHADOW_RADIUS,
      DEFAULT_DIRECTIONAL_SHADOW_RADIUS * 0.5,
      directionalShadowSize.y * 0.5
    )
  );
  const planePadding = Math.max(DIRECTIONAL_SHADOW_PLANE_PADDING, resolvedRadius * 0.06);
  const depthPadding = Math.max(DIRECTIONAL_SHADOW_DEPTH_PADDING, directionalShadowSize.length() * 0.05);
  const biasScale = resolvedRadius / DEFAULT_DIRECTIONAL_SHADOW_RADIUS;

  shadowCamera.left = resolvedShadowTargetLightSpace.x - resolvedRadius - planePadding;
  shadowCamera.right = resolvedShadowTargetLightSpace.x + resolvedRadius + planePadding;
  shadowCamera.bottom = resolvedShadowTargetLightSpace.y - resolvedRadius - planePadding;
  shadowCamera.top = resolvedShadowTargetLightSpace.y + resolvedRadius + planePadding;
  shadowCamera.near = Math.max(0.5, -directionalShadowMax.z - depthPadding);
  shadowCamera.far = Math.max(shadowCamera.near + 1, -directionalShadowMin.z + depthPadding, fallbackConfig.far);
  shadowCamera.updateProjectionMatrix();

  light.shadow.bias = config.shadowBias ?? DIRECTIONAL_SHADOW_BIAS * biasScale;
  light.shadow.normalBias = config.shadowNormalBias ?? DIRECTIONAL_SHADOW_NORMAL_BIAS * biasScale;
  light.shadow.radius = config.shadowBlurRadius ?? DIRECTIONAL_VSM_SHADOW_RADIUS;
  light.shadow.blurSamples = Math.max(1, Math.round(config.shadowBlurSamples ?? DIRECTIONAL_VSM_SHADOW_BLUR_SAMPLES));
  const resolvedMapSize = Math.max(128, Math.round((config.shadowMapSize ?? fallbackConfig.mapSize) / 128) * 128);
  light.shadow.mapSize.set(resolvedMapSize, resolvedMapSize);
  light.shadow.needsUpdate = true;
}