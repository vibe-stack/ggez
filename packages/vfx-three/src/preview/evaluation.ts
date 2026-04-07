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
  if (curve === "flame-rise") {
    const shaped = 1 - Math.pow(1 - clamp01(t), 1.35);
    return lerp(start, end, shaped);
  }
  if (curve === "smoke-soft") {
    return lerp(start, end, Math.pow(clamp01(t), 0.42));
  }
  return lerp(start, end, t);
}

export function evaluatePreviewAlpha(curve: string | undefined, t: number, isSmoke: boolean) {
  if (curve === "flash-fade") {
    return Math.pow(1 - t, 2.2);
  }
  if (curve === "flame-soft") {
    const fadeIn = clamp01(t / 0.08);
    const body = 1 - clamp01((t - 0.18) / 0.72) * 0.18;
    const fadeOut = Math.pow(1 - t, 0.72);
    return clamp01(fadeIn * body * fadeOut);
  }
  if (curve === "smoke-soft" || isSmoke) {
    const fadeIn = clamp01(t / 0.08);
    const body = lerp(1.05, 0.82, clamp01(t));
    const fadeOut = Math.pow(1 - t, 0.82);
    return clamp01(fadeIn * body * fadeOut);
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
  if (curve === "flame-warm") {
    return color
      .clone()
      .lerp(new THREE.Color(0.48, 0.12, 0.02), clamp01(t * 0.55))
      .multiplyScalar(lerp(1.12, 0.52, clamp01(t)));
  }
  if (curve === "smoke-soft" || isSmoke) {
    return color.clone().multiplyScalar(lerp(1.08, 0.62, clamp01(t)));
  }
  return color.clone();
}
