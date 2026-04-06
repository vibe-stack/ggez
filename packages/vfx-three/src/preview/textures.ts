import * as THREE from "three";
import type { SpriteTextureDefinition } from "./types";

function drawSmokeCell(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, variant: number) {
  const blobCount = 6 + variant;
  for (let index = 0; index < blobCount; index += 1) {
    const t = variant * 0.73 + index * 1.37;
    const x = originX + tileSize * (0.24 + ((Math.sin(t * 1.21) + 1) * 0.28));
    const y = originY + tileSize * (0.24 + ((Math.cos(t * 0.87) + 1) * 0.26));
    const radius = tileSize * (0.12 + ((Math.sin(t * 0.53) + 1) * 0.08));
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(255,255,255,0.42)");
    gradient.addColorStop(0.34, "rgba(255,255,255,0.22)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.08)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const haze = ctx.createRadialGradient(
    originX + tileSize * 0.5,
    originY + tileSize * 0.52,
    tileSize * 0.08,
    originX + tileSize * 0.5,
    originY + tileSize * 0.52,
    tileSize * 0.48
  );
  haze.addColorStop(0, "rgba(255,255,255,0.16)");
  haze.addColorStop(0.62, "rgba(255,255,255,0.06)");
  haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(originX, originY, tileSize, tileSize);
}

export function makePreviewSpriteCanvas(preset: string): HTMLCanvasElement {
  const atlasGrid = preset === "smoke" ? 2 : 1;
  const size = atlasGrid === 2 ? 256 : 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const center = size / 2;
  ctx.clearRect(0, 0, size, size);

  if (preset === "spark" || preset === "star") {
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center * 0.9);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.42, "rgba(255,255,255,0.4)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, center * 0.82, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(center * 0.28, center);
    ctx.lineTo(center * 1.72, center);
    ctx.moveTo(center, center * 0.28);
    ctx.lineTo(center, center * 1.72);
    ctx.stroke();
  } else if (preset === "smoke") {
    const tileSize = size / 2;
    for (let variant = 0; variant < 4; variant += 1) {
      const cellX = (variant % 2) * tileSize;
      const cellY = Math.floor(variant / 2) * tileSize;
      drawSmokeCell(ctx, cellX, cellY, tileSize, variant);
    }
  } else if (preset === "ring") {
    const gradient = ctx.createRadialGradient(center, center, center * 0.28, center, center, center * 0.7);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, center * 0.74, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === "beam") {
    const gradient = ctx.createLinearGradient(center, 0, center, size);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(center - 10, 0, 20, size);
  } else if (preset === "flame") {
    const gradient = ctx.createRadialGradient(center, center * 0.95, 0, center, center * 0.95, center * 0.92);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.65)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(center, center * 0.12);
    ctx.quadraticCurveTo(size * 0.8, size * 0.45, center, size * 0.95);
    ctx.quadraticCurveTo(size * 0.2, size * 0.45, center, center * 0.12);
    ctx.fill();
  } else {
    const innerStop = preset === "circle-hard" ? 0.48 : 0.35;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(innerStop, "rgba(255,255,255,0.7)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  return canvas;
}

export function makePreviewSpriteTexture(preset: string): SpriteTextureDefinition {
  const canvas = makePreviewSpriteCanvas(preset);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture };
}

export function createPreviewSprite(texture: THREE.Texture, additive: boolean) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  return sprite;
}
