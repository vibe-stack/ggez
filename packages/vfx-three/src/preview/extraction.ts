import type { CompiledVfxEffect, EmitterDocument, VfxEffectDocument } from "@ggez/vfx-schema";
import * as THREE from "three";
import type { EmitterPreviewConfig } from "./types";
import { MAX_PREVIEW_PARTICLES_PER_EMITTER } from "./types";

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const candidateIds = emitter.renderers.flatMap((rendererEntry) => {
    const ids: string[] = [];
    if (typeof rendererEntry.parameterBindings.tint === "string") {
      ids.push(rendererEntry.parameterBindings.tint);
    }
    Object.values(rendererEntry.parameterBindings).forEach((value) => {
      if (typeof value === "string" && value.startsWith("param:")) {
        ids.push(value);
      }
    });
    return ids;
  });

  const boundColor = candidateIds.find((id) => document.parameters.some((parameter) => parameter.id === id && parameter.type === "color"));
  const parameter = boundColor
    ? document.parameters.find((entry) => entry.id === boundColor && entry.type === "color")
    : document.parameters.find((entry) => entry.type === "color");

  const fallbackHex = renderer?.template === "SpriteSmokeMaterial" ? "#8d98a6" : "#ffd6a2";
  const hex = typeof parameter?.defaultValue === "string" ? parameter.defaultValue : fallbackHex;

  try {
    const color = new THREE.Color(hex);
    return renderer?.template === "SpriteSmokeMaterial"
      ? color.clone().lerp(new THREE.Color("#8794a5"), 0.55)
      : color;
  } catch {
    return new THREE.Color(fallbackHex);
  }
}

function readTexturePreset(emitter: EmitterDocument) {
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
    const lifetimeModule = emitter.initializeStage.modules.find(
      (module) => module.kind === "SetAttribute" && module.config.attribute === "lifetime"
    );
    const deathEventIds = emitter.deathStage.modules
      .filter((module) => module.kind === "SendEvent")
      .map((module) => module.config.eventId)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const firstRenderer = emitter.renderers.find((renderer) => renderer.enabled);
    const isSmoke = firstRenderer?.template === "SpriteSmokeMaterial";

    return {
      emitterId: emitter.id,
      startupBurstCount: Math.max(0, Math.round(startupBurstCount)),
      eventBursts,
      deathEventIds,
      rate: Math.max(0, rate),
      spreadRadians: (readNumber(spreadDegrees, 16) * Math.PI) / 180,
      spawnRadius: readNumber(spawnCone?.config.radius, isSmoke ? 0.08 : 0.22) * 6,
      speedMin: readNumber(velocityCone?.config.speedMin, 60) * 0.04,
      speedMax: readNumber(velocityCone?.config.speedMax, 180) * 0.04,
      drag: readNumber(drag?.config.coefficient, 2.8),
      gravity: readNumber(gravity?.config.accelerationY, 120) * 0.04,
      upwardDrift: isSmoke ? 0.7 : 0.12,
      orbitRadius: readNumber(orbit?.config.radius, 0) * 1.4,
      orbitAngularSpeed: readNumber(orbit?.config.angularSpeed, 0),
      curlStrength: readNumber(curl?.config.strength, 0),
      lifetime: readNumber(lifetimeModule?.config.value, 0.42),
      sizeStart: isSmoke ? 0.82 : 0.16,
      sizeEnd: isSmoke ? 2.35 : 0.045,
      sizeCurve: typeof sizeOverLife?.config.curve === "string" ? sizeOverLife.config.curve : undefined,
      alphaCurve: typeof alphaOverLife?.config.curve === "string" ? alphaOverLife.config.curve : undefined,
      colorCurve: typeof colorOverLife?.config.curve === "string" ? colorOverLife.config.curve : undefined,
      color: readHexColor(document, emitter),
      additive: firstRenderer?.material.blendMode !== "alpha",
      maxParticleCount: Math.min(compiledEmitter?.capacity ?? emitter.maxParticleCount, MAX_PREVIEW_PARTICLES_PER_EMITTER),
      isSmoke,
      texturePreset: readTexturePreset(emitter)
    };
  });
}
