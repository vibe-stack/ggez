import type { CompiledVfxEffect, RendererFlipbookSettings, VfxEffectDocument } from "@ggez/vfx-schema";
import type * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";

export type ThreeWebGpuPreviewState = {
  document: VfxEffectDocument;
  compileResult?: CompiledVfxEffect;
  selectedEmitterId?: string;
  soloSelected?: boolean;
  isPlaying?: boolean;
  selectedEventId?: string;
  resetVersion?: number;
  fireVersion?: number;
  world?: {
    position?: { x: number; y: number; z: number };
    uniformScale?: number;
  };
};

export type ThreeWebGpuPreviewSummary = {
  hasOutput: boolean;
  activeCount: number;
  renderableCount: number;
  totalCount: number;
  allShown: boolean;
};

export type CreateThreeWebGpuPreviewControllerInput = {
  renderer: WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  presentationMode?: "overlay-gpu" | "scene-sprites";
  onParticleCountChange?: (count: number) => void;
  /** Called each frame before rendering — use this to update OrbitControls etc. */
  onBeforeRender?: () => void;
};

export type ThreeWebGpuPreviewController = {
  update(next: ThreeWebGpuPreviewState): void;
  dispose(): void;
};

export type ThreeWebGpuPreviewRuntime = {
  update(next: ThreeWebGpuPreviewState): void;
  step(deltaSeconds: number, nowSeconds: number): void;
  renderToCurrentTexture(nowSeconds: number): void;
  dispose(): void;
};

export type EmitterPreviewConfig = {
  emitterId: string;
  startupBurstCount: number;
  eventBursts: Array<{ eventId: string; count: number }>;
  deathEventIds: string[];
  rate: number;
  spreadRadians: number;
  spawnRadius: number;
  spawnOffsetX: number;
  spawnOffsetY: number;
  spawnOffsetZ: number;
  spawnRandomX: number;
  spawnRandomY: number;
  spawnRandomZ: number;
  speedMin: number;
  speedMax: number;
  drag: number;
  gravity: number;
  upwardDrift: number;
  orbitRadius: number;
  orbitAngularSpeed: number;
  curlStrength: number;
  lifetime: number;
  sizeStart: number;
  sizeEnd: number;
  sizeCurve?: string;
  alphaCurve?: string;
  colorCurve?: string;
  color: THREE.Color;
  emissiveColor: THREE.Color;
  emissiveIntensity: number;
  additive: boolean;
  maxParticleCount: number;
  isSmoke: boolean;
  textureId: string;
  flipbook: RendererFlipbookSettings;
};

export type PreviewTextureSource = {
  key: string;
  source: CanvasImageSource;
  width: number;
  height: number;
};

export type PreviewFlipbookFrameBounds = {
  uvOffsetX: number;
  uvOffsetY: number;
  uvScaleX: number;
  uvScaleY: number;
  quadOffsetX: number;
  quadOffsetY: number;
  quadScaleX: number;
  quadScaleY: number;
};

export type SpriteTextureDefinition = {
  texture: THREE.Texture;
};

export type SmokeRenderResources = {
  bindGroup: any;
  emitterUniformBuffer: any;
  texture: any;
  textureView: any;
  sampler: any;
};

export type SpriteGpuRenderResources = {
  bindGroup: any;
  emitterUniformBuffer: any;
  texture: any;
  textureView: any;
  sampler: any;
  blendMode: "additive" | "alpha";
};

export type EmitterGpuResources = {
  bindGroup: any;
  particleBuffer: any;
  readBuffers: any[];
  uniformBuffer: any;
};

export type EmitterReadbackSlot = {
  buffer: any;
  pending: boolean;
  sequence: number;
};

export type EmitterPreviewEntry = {
  accumulator: number;
  config: EmitterPreviewConfig;
  gpu: EmitterGpuResources;
  particleData: Float32Array;
  previousAlive: Uint8Array;
  renderMode: "smoke-gpu" | "sprite-gpu" | "sprite-fallback";
  requiresReadback: boolean;
  nextSpawnSlot: number;
  smokeSpawnCursor: number;
  smokeStartupRemaining: number;
  smokeRender?: SmokeRenderResources;
  spriteGpuRender?: SpriteGpuRenderResources;
  sprites: THREE.Sprite[];
  texture: THREE.Texture;
  readbackCooldownSeconds: number;
  readbackSlots: EmitterReadbackSlot[];
  nextReadbackSlot: number;
  lastScheduledReadbackSequence: number;
  lastAppliedReadbackSequence: number;
  lastAppliedReadbackAtSeconds: number;
  dirty: boolean;
};

export const PARTICLE_FLOATS = 20;
export const WORKGROUP_SIZE = 64;
export const MAX_PREVIEW_PARTICLES_PER_EMITTER = 192;
export const MAX_PREVIEW_SMOKE_PARTICLES_PER_EMITTER = 640;
export const PREVIEW_READBACK_INTERVAL_SECONDS = 1 / 15;
export const PREVIEW_READBACK_BUFFER_COUNT = 3;
export const SMOKE_ATLAS_GRID = 2;
export const GPU_BUFFER_USAGE = globalThis.GPUBufferUsage as any;
export const GPU_MAP_MODE = globalThis.GPUMapMode as any;

export const PARTICLE_INDEX = {
  positionX: 0,
  positionY: 1,
  positionZ: 2,
  velocityX: 4,
  velocityY: 5,
  velocityZ: 6,
  age: 8,
  lifetime: 9,
  sizeStart: 10,
  sizeEnd: 11,
  rotation: 12,
  rotationSpeed: 13,
  alive: 14,
  frame: 15,
  seed: 16
} as const;
