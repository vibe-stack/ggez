import * as THREE from "three";
import type { PreviewFlipbookFrameBounds, PreviewTextureSource, SpriteTextureDefinition } from "./types";

const BUILTIN_PREVIEW_TEXTURES = new Set(["circle-soft", "circle-hard", "ring", "spark", "smoke", "star", "flame", "beam"]);
const previewTextureSourceCache = new Map<string, Promise<PreviewTextureSource>>();
const previewFrameBoundsCache = new Map<string, PreviewFlipbookFrameBounds[]>();
const DEFAULT_FRAME_BOUNDS: PreviewFlipbookFrameBounds = {
  uvOffsetX: 0,
  uvOffsetY: 0,
  uvScaleX: 1,
  uvScaleY: 1,
  quadOffsetX: 0,
  quadOffsetY: 0,
  quadScaleX: 1,
  quadScaleY: 1
};

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

export function isBuiltInPreviewTexture(textureId: string) {
  return BUILTIN_PREVIEW_TEXTURES.has(textureId);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load preview texture "${src}".`));
    image.src = src;
    if (image.complete && image.naturalWidth > 0) {
      resolve(image);
    }
  });
}

export function loadPreviewTextureSource(textureId: string): Promise<PreviewTextureSource> {
  const cached = previewTextureSourceCache.get(textureId);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    if (isBuiltInPreviewTexture(textureId)) {
      const canvas = makePreviewSpriteCanvas(textureId);
      return {
        key: textureId,
        source: canvas,
        width: canvas.width,
        height: canvas.height
      };
    }

    const image = await loadImageElement(textureId);
    return {
      key: textureId,
      source: image,
      width: Math.max(1, image.naturalWidth || image.width),
      height: Math.max(1, image.naturalHeight || image.height)
    };
  })();

  previewTextureSourceCache.set(textureId, pending);
  return pending;
}

export function createPreviewSpriteTextureFromSource(source: PreviewTextureSource): SpriteTextureDefinition {
  const texture =
    source.source instanceof HTMLCanvasElement
      ? new THREE.CanvasTexture(source.source)
      : new THREE.Texture(source.source as THREE.Texture["image"]);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture };
}

export function resolvePreviewFlipbookFrameBounds(
  source: PreviewTextureSource,
  rows: number,
  cols: number
): PreviewFlipbookFrameBounds[] {
  const resolvedRows = Math.max(1, Math.floor(rows));
  const resolvedCols = Math.max(1, Math.floor(cols));
  const cacheKey = `${source.key}:${resolvedCols}x${resolvedRows}`;
  const cached = previewFrameBoundsCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  if (typeof document === "undefined") {
    const fallback = Array.from({ length: resolvedRows * resolvedCols }, () => ({ ...DEFAULT_FRAME_BOUNDS }));
    previewFrameBoundsCache.set(cacheKey, fallback);
    return fallback;
  }

  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    const fallback = Array.from({ length: resolvedRows * resolvedCols }, () => ({ ...DEFAULT_FRAME_BOUNDS }));
    previewFrameBoundsCache.set(cacheKey, fallback);
    return fallback;
  }

  ctx.clearRect(0, 0, source.width, source.height);
  ctx.drawImage(source.source, 0, 0, source.width, source.height);
  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  const alphaThreshold = 8;
  const bounds: PreviewFlipbookFrameBounds[] = [];

  for (let row = 0; row < resolvedRows; row += 1) {
    const cellTop = Math.floor((row * source.height) / resolvedRows);
    const cellBottom = Math.floor(((row + 1) * source.height) / resolvedRows);

    for (let col = 0; col < resolvedCols; col += 1) {
      const cellLeft = Math.floor((col * source.width) / resolvedCols);
      const cellRight = Math.floor(((col + 1) * source.width) / resolvedCols);
      const cellWidth = Math.max(1, cellRight - cellLeft);
      const cellHeight = Math.max(1, cellBottom - cellTop);
      let minX = cellRight;
      let maxX = cellLeft - 1;
      let minY = cellBottom;
      let maxY = cellTop - 1;

      for (let y = cellTop; y < cellBottom; y += 1) {
        const rowOffset = y * source.width * 4;
        for (let x = cellLeft; x < cellRight; x += 1) {
          if (pixels[rowOffset + x * 4 + 3] >= alphaThreshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        bounds.push({
          uvOffsetX: cellLeft / source.width,
          uvOffsetY: 1 - (cellBottom / source.height),
          uvScaleX: cellWidth / source.width,
          uvScaleY: cellHeight / source.height,
          quadOffsetX: 0,
          quadOffsetY: 0,
          quadScaleX: 1,
          quadScaleY: 1
        });
        continue;
      }

      minX = Math.max(cellLeft, minX - 1);
      maxX = Math.min(cellRight - 1, maxX + 1);
      minY = Math.max(cellTop, minY - 1);
      maxY = Math.min(cellBottom - 1, maxY + 1);

      const trimmedWidth = Math.max(1, maxX - minX + 1);
      const trimmedHeight = Math.max(1, maxY - minY + 1);
      const trimmedCenterX = ((minX + maxX + 1) * 0.5 - cellLeft) / cellWidth;
      const trimmedCenterYFromTop = ((minY + maxY + 1) * 0.5 - cellTop) / cellHeight;

      bounds.push({
        uvOffsetX: minX / source.width,
        uvOffsetY: 1 - ((maxY + 1) / source.height),
        uvScaleX: trimmedWidth / source.width,
        uvScaleY: trimmedHeight / source.height,
        quadOffsetX: trimmedCenterX - 0.5,
        quadOffsetY: 0.5 - trimmedCenterYFromTop,
        quadScaleX: trimmedWidth / cellWidth,
        quadScaleY: trimmedHeight / cellHeight
      });
    }
  }

  previewFrameBoundsCache.set(cacheKey, bounds);
  return bounds;
}

export function makePreviewSpriteTexture(preset: string): SpriteTextureDefinition {
  return createPreviewSpriteTextureFromSource({
    key: preset,
    source: makePreviewSpriteCanvas(preset),
    width: preset === "smoke" ? 256 : 128,
    height: preset === "smoke" ? 256 : 128
  });
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
