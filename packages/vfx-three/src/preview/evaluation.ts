import * as THREE from "three";

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function lerp(left: number, right: number, t: number) {
  return left + (right - left) * t;
}

export function evaluatePreviewSize(curve: string | undefined, t: number, start: number, end: number) {
  if (curve === "flash-expand") {
    return lerp(start, end, 1 - Math.pow(1 - t, 3));
  }
  if (curve === "smoke-soft") {
    return lerp(start, end, Math.sqrt(clamp01(t)));
  }
  return lerp(start, end, t);
}

export function evaluatePreviewAlpha(curve: string | undefined, t: number, isSmoke: boolean) {
  if (curve === "flash-fade") {
    return Math.pow(1 - t, 2.2);
  }
  if (curve === "smoke-soft" || isSmoke) {
    const fadeIn = clamp01(t / 0.14);
    const fadeOut = Math.pow(1 - t, 1.35);
    return clamp01(fadeIn * fadeOut);
  }
  return 1 - t;
}

export function evaluatePreviewColor(color: THREE.Color, curve: string | undefined, t: number, isSmoke: boolean) {
  if (curve === "flash-hot") {
    const hot = new THREE.Color(1, 1, 1);
    if (t < 0.22) {
      return hot.lerp(color.clone(), t / 0.22);
    }
    return color.clone().multiplyScalar(lerp(1, 0.45, clamp01((t - 0.22) / 0.78)));
  }
  if (curve === "smoke-soft" || isSmoke) {
    return color.clone().lerp(new THREE.Color(0.24, 0.28, 0.32), clamp01(t * 0.7));
  }
  return color.clone();
}
