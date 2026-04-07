import type { CompiledVfxEffect, EmitterDocument, VfxEffectDocument } from "@ggez/vfx-schema";
import * as THREE from "three";
import type { EmitterPreviewConfig } from "./types";
import { MAX_PREVIEW_PARTICLES_PER_EMITTER, MAX_PREVIEW_SMOKE_PARTICLES_PER_EMITTER } from "./types";

const PREVIEW_VELOCITY_SCALE = 0.04;
const PREVIEW_GRAVITY_SCALE = 0.1;

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readInitializeSetAttributeNumber(emitter: EmitterDocument, attribute: string): number | undefined {
  const module = emitter.initializeStage.modules.find(
    (entry) => entry.kind === "SetAttribute" && entry.config.attribute === attribute
  );
  return readOptionalNumber(module?.config.value);
}

export function resolveActiveEmitterIds(document: VfxEffectDocument): Set<string> | null {
  const { graph } = document;
  const outputNodes = graph.nodes.filter((node) => node.kind === "output");
  if (outputNodes.length === 0) {
    return null;
  }

  const visited = new Set<string>();
  const queue = outputNodes.map((node) => node.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);

    for (const edge of graph.edges) {
      if (edge.targetNodeId === nodeId && !visited.has(edge.sourceNodeId)) {
        queue.push(edge.sourceNodeId);
      }
    }
  }

  const activeEmitterIds = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === "emitter" && visited.has(node.id)) {
      activeEmitterIds.add(node.emitterId);
    }
  }

  return activeEmitterIds;
}

function readHexColor(document: VfxEffectDocument, emitter: EmitterDocument): THREE.Color {
  const renderer = emitter.renderers.find((entry) => entry.enabled);
  const tintBinding = typeof renderer?.parameterBindings.tint === "string" ? renderer.parameterBindings.tint : undefined;
  const parameter = tintBinding
    ? document.parameters.find((entry) => entry.id === tintBinding && entry.type === "color")
    : undefined;

  const fallbackHex = renderer?.template === "SpriteSmokeMaterial" ? "#8d98a6" : "#ffffff";
  const hex = typeof parameter?.defaultValue === "string" ? parameter.defaultValue : fallbackHex;

  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color(fallbackHex);
  }
}

function readTextureId(emitter: EmitterDocument) {
  const renderer = emitter.renderers.find((entry) => entry.enabled);
  const boundTexture = typeof renderer?.parameterBindings._texture === "string" ? renderer.parameterBindings._texture : undefined;
  if (boundTexture && !boundTexture.startsWith("param:")) {
    return boundTexture;
  }

  switch (renderer?.template) {
    case "SpriteSmokeMaterial":
      return "smoke";
    case "BeamMaterial":
    case "RibbonTrailMaterial":
      return "beam";
    case "DistortionMaterial":
      return "ring";
    case "SpriteAdditiveMaterial":
      return "spark";
    default:
      return "circle-soft";
  }
}

function readFlipbookSettings(emitter: EmitterDocument, textureId: string) {
  const renderer = emitter.renderers.find((entry) => entry.enabled);
  const authored = renderer?.flipbookSettings;
  const defaultSmokeAtlas = textureId === "smoke";
  const rows = authored?.rows ?? (defaultSmokeAtlas ? 2 : 1);
  const cols = authored?.cols ?? (defaultSmokeAtlas ? 2 : 1);

  return {
    enabled: authored?.enabled ?? defaultSmokeAtlas,
    rows,
    cols,
    fps: authored?.fps ?? (defaultSmokeAtlas ? 5 : 12),
    looping: authored?.looping ?? true,
    playbackMode: authored?.playbackMode ?? "particle-age"
  } as const;
}

export function buildEmitterPreviewConfigs(
  document: VfxEffectDocument,
  compiledEffect: CompiledVfxEffect | undefined,
  activeEmitterIds: Set<string> | null
): EmitterPreviewConfig[] {
  const emitters = (activeEmitterIds ? document.emitters.filter((entry) => activeEmitterIds.has(entry.id)) : document.emitters)
    .filter((emitter) => emitter.renderers.some((renderer) => renderer.enabled));

  return emitters.slice(0, 6).map((emitter) => {
    const compiledEmitter = compiledEffect?.emitters.find((entry) => entry.id === emitter.id);
    const burstModules = emitter.spawnStage.modules.filter((module) => module.kind === "SpawnBurst");
    const startupBurstCount = burstModules
      .filter((module) => typeof module.config.everyEvent !== "string" || module.config.everyEvent.length === 0)
      .reduce((sum, module) => sum + readNumber(module.config.count, 18), 0);
    const eventBursts = burstModules
      .filter((module) => typeof module.config.everyEvent === "string" && module.config.everyEvent.length > 0)
      .map((module) => ({
        eventId: String(module.config.everyEvent),
        count: Math.max(1, Math.round(readNumber(module.config.count, 6)))
      }));
    const rate = emitter.spawnStage.modules
      .filter((module) => module.kind === "SpawnRate")
      .reduce((sum, module) => sum + readNumber(module.config.rate, 0), 0);
    const spawnCone = emitter.spawnStage.modules.find((module) => module.kind === "SpawnCone");
    const spreadDegrees = spawnCone?.config.angleDegrees;
    const velocityCone = emitter.initializeStage.modules.find((module) => module.kind === "VelocityCone");
    const drag = emitter.updateStage.modules.find((module) => module.kind === "Drag");
    const gravity = emitter.updateStage.modules.find((module) => module.kind === "GravityForce");
    const orbit = emitter.updateStage.modules.find((module) => module.kind === "OrbitTarget");
    const curl = emitter.updateStage.modules.find((module) => module.kind === "CurlNoiseForce");
    const sizeOverLife = emitter.updateStage.modules.find((module) => module.kind === "SizeOverLife");
    const alphaOverLife = emitter.updateStage.modules.find((module) => module.kind === "AlphaOverLife");
    const colorOverLife = emitter.updateStage.modules.find((module) => module.kind === "ColorOverLife");
    const lifetime = readInitializeSetAttributeNumber(emitter, "lifetime");
    const authoredSize = readInitializeSetAttributeNumber(emitter, "size");
    const deathEventIds = emitter.deathStage.modules
      .filter((module) => module.kind === "SendEvent")
      .map((module) => module.config.eventId)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const firstRenderer = emitter.renderers.find((renderer) => renderer.enabled);
    const isSmoke = firstRenderer?.template === "SpriteSmokeMaterial";
    const textureId = readTextureId(emitter);
    const flipbook = readFlipbookSettings(emitter, textureId);
    const isFlame = textureId === "flame";
    const isSpark = textureId === "spark" || textureId === "star";
    const hasVelocityCone = Boolean(velocityCone);
    const defaultSizeStart = isSmoke ? 0.42 : isFlame ? 0.18 : isSpark ? 0.06 : 0.16;
    const defaultSizeEnd = isSmoke ? 2.6 : isFlame ? 0.92 : isSpark ? 0.02 : 0.045;
    const authoredPreviewSize = authoredSize !== undefined ? Math.max(0.001, authoredSize * 0.01) : undefined;
    const sizeStart = authoredPreviewSize ?? defaultSizeStart;
    const sizeEnd = authoredPreviewSize !== undefined
      ? (sizeOverLife ? sizeStart * (defaultSizeEnd / Math.max(defaultSizeStart, 0.0001)) : sizeStart)
      : defaultSizeEnd;

    return {
      emitterId: emitter.id,
      startupBurstCount: Math.max(0, Math.round(startupBurstCount)),
      eventBursts,
      deathEventIds,
      rate: Math.max(0, rate),
      spreadRadians: (readNumber(spreadDegrees, 16) * Math.PI) / 180,
      spawnRadius: readNumber(spawnCone?.config.radius, isSmoke ? 0.08 : 0.22) * 6,
      spawnOffsetX: readNumber(spawnCone?.config.offsetX, 0) * 6,
      spawnOffsetY: readNumber(spawnCone?.config.offsetY, 0) * 6,
      spawnOffsetZ: readNumber(spawnCone?.config.offsetZ, 0) * 6,
      spawnRandomX: readNumber(spawnCone?.config.randomX, 0) * 6,
      spawnRandomY: readNumber(spawnCone?.config.randomY, 0) * 6,
      spawnRandomZ: readNumber(spawnCone?.config.randomZ, 0) * 6,
      speedMin: readNumber(velocityCone?.config.speedMin, 0) * PREVIEW_VELOCITY_SCALE,
      speedMax: readNumber(velocityCone?.config.speedMax, hasVelocityCone ? readNumber(velocityCone?.config.speedMin, 0) : 0) * PREVIEW_VELOCITY_SCALE,
      drag: readNumber(drag?.config.coefficient, 2.8),
      gravity: readNumber(gravity?.config.accelerationY, 0) * PREVIEW_GRAVITY_SCALE,
      upwardDrift: 0,
      orbitRadius: readNumber(orbit?.config.radius, 0) * 1.4,
      orbitAngularSpeed: readNumber(orbit?.config.angularSpeed, 0),
      curlStrength: readNumber(curl?.config.strength, 0),
      lifetime: lifetime ?? 0.42,
      sizeStart,
      sizeEnd,
      sizeCurve: typeof sizeOverLife?.config.curve === "string" ? sizeOverLife.config.curve : undefined,
      alphaCurve: typeof alphaOverLife?.config.curve === "string" ? alphaOverLife.config.curve : undefined,
      colorCurve: typeof colorOverLife?.config.curve === "string" ? colorOverLife.config.curve : undefined,
      color: readHexColor(document, emitter),
      additive: firstRenderer?.material.blendMode !== "alpha",
      maxParticleCount: Math.min(
        compiledEmitter?.capacity ?? emitter.maxParticleCount,
        isSmoke ? MAX_PREVIEW_SMOKE_PARTICLES_PER_EMITTER : MAX_PREVIEW_PARTICLES_PER_EMITTER
      ),
      isSmoke,
      textureId,
      flipbook
    };
  });
}
