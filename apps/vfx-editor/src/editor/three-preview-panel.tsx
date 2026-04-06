/**
 * Three.js WebGL VFX Preview Panel
 *
 * Runs a real Three.js WebGLRenderer so you see the same blending, additive
 * layers, and per-emitter colours that will appear in your game — not a
 * hand-rolled 2-D approximation.
 *
 * The simulation is still CPU-side (matching the compiled effect's module
 * parameters) because the GPU compute back-end hasn't landed yet, but every
 * particle is drawn through Three.js with the correct THREE.AdditiveBlending /
 * THREE.NormalBlending so blend-mode behaviour is accurate.
 *
 * Graph evaluation: only emitters whose graph node has a path → output node
 * are shown.  If there is no output node in the graph, all emitters are shown
 * (safe default while you're building the graph).
 */

import type { CompiledVfxEffect, EmitterDocument, VfxEffectDocument } from "@ggez/vfx-schema";
import { Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ─── Graph evaluation ────────────────────────────────────────────────────────

/**
 * Walk backwards from every output node and collect the emitter IDs whose
 * graph nodes are reachable.  Returns `null` if there is no output node,
 * which means "show everything".
 */
function resolveActiveEmitterIds(document: VfxEffectDocument): Set<string> | null {
  const { graph } = document;
  const outputNodes = graph.nodes.filter((n) => n.kind === "output");
  if (outputNodes.length === 0) {
    return null; // no output node → show all emitters
  }

  // BFS backwards from every output node
  const visited = new Set<string>();
  const queue: string[] = outputNodes.map((n) => n.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const edge of graph.edges) {
      if (edge.targetNodeId === nodeId && !visited.has(edge.sourceNodeId)) {
        queue.push(edge.sourceNodeId);
      }
    }
  }

  // Collect emitter IDs from reachable emitter nodes
  const activeEmitterIds = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === "emitter" && visited.has(node.id)) {
      activeEmitterIds.add(node.emitterId);
    }
  }
  return activeEmitterIds;
}

// ─── Emitter config extraction ───────────────────────────────────────────────

type EmitterPreviewConfig = {
  emitterId: string;
  startupBurstCount: number;
  eventBursts: Array<{ eventId: string; count: number }>;
  deathEventIds: string[];
  rate: number;
  spreadRadians: number;
  spawnRadius: number;
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
  additive: boolean;
  maxParticleCount: number;
  isSmoke: boolean;
  texturePreset: string;
};

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readHexColor(document: VfxEffectDocument, emitter: EmitterDocument): THREE.Color {
  const candidateIds = emitter.renderers.flatMap((renderer) => {
    const ids: string[] = [];
    if (typeof renderer.parameterBindings.tint === "string") {
      ids.push(renderer.parameterBindings.tint);
    }
    Object.values(renderer.parameterBindings).forEach((value) => {
      if (typeof value === "string" && value.startsWith("param:")) {
        ids.push(value);
      }
    });
    return ids;
  });
  const boundColor = candidateIds.find((id) => document.parameters.some((parameter) => parameter.id === id && parameter.type === "color"));
  const parameter = boundColor
    ? document.parameters.find((p) => p.id === boundColor && p.type === "color")
    : document.parameters.find((p) => p.type === "color");
  const hex = typeof parameter?.defaultValue === "string" ? parameter.defaultValue : "#34d399";
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color("#34d399");
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
      return "beam";
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

function buildEmitterConfigs(
  document: VfxEffectDocument,
  compiledEffect: CompiledVfxEffect | undefined,
  activeEmitterIds: Set<string> | null
): EmitterPreviewConfig[] {
  const emitters = (activeEmitterIds
    ? document.emitters.filter((e) => activeEmitterIds.has(e.id))
    : document.emitters)
    .filter((emitter) => emitter.renderers.some((renderer) => renderer.enabled));

  return emitters.slice(0, 6).map((emitter) => {
    const compiledEmitter = compiledEffect?.emitters.find((e) => e.id === emitter.id);
    const burstModules = emitter.spawnStage.modules.filter((m) => m.kind === "SpawnBurst");
    const startupBurstCount = burstModules
      .filter((module) => typeof module.config.everyEvent !== "string" || module.config.everyEvent.length === 0)
      .reduce((sum, module) => sum + readNumber(module.config.count, 18), 0);
    const eventBursts = burstModules
      .filter((module) => typeof module.config.everyEvent === "string" && module.config.everyEvent.length > 0)
      .map((module) => ({ eventId: String(module.config.everyEvent), count: Math.max(1, Math.round(readNumber(module.config.count, 6))) }));
    const rate = emitter.spawnStage.modules
      .filter((m) => m.kind === "SpawnRate")
      .reduce((sum, m) => sum + readNumber(m.config.rate, 0), 0);
    const spawnCone = emitter.spawnStage.modules.find((m) => m.kind === "SpawnCone");
    const spreadDeg = spawnCone?.config.angleDegrees;
    const velocityCone = emitter.initializeStage.modules.find((m) => m.kind === "VelocityCone");
    const drag = emitter.updateStage.modules.find((m) => m.kind === "Drag");
    const gravity = emitter.updateStage.modules.find((m) => m.kind === "GravityForce");
    const orbit = emitter.updateStage.modules.find((m) => m.kind === "OrbitTarget");
    const curl = emitter.updateStage.modules.find((m) => m.kind === "CurlNoiseForce");
    const sizeOverLife = emitter.updateStage.modules.find((m) => m.kind === "SizeOverLife");
    const alphaOverLife = emitter.updateStage.modules.find((m) => m.kind === "AlphaOverLife");
    const colorOverLife = emitter.updateStage.modules.find((m) => m.kind === "ColorOverLife");
    const lifetimeModule = emitter.initializeStage.modules.find(
      (m) => m.kind === "SetAttribute" && m.config.attribute === "lifetime"
    );
    const deathEventIds = emitter.deathStage.modules
      .filter((module) => module.kind === "SendEvent")
      .map((module) => module.config.eventId)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const firstRenderer = emitter.renderers.find((r) => r.enabled);
    const isSmoke = firstRenderer?.template === "SpriteSmokeMaterial";

    return {
      emitterId: emitter.id,
      startupBurstCount: Math.max(0, Math.round(startupBurstCount)),
      eventBursts,
      deathEventIds,
      rate: Math.max(0, rate),
      spreadRadians: (readNumber(spreadDeg, 16) * Math.PI) / 180,
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
      sizeStart: isSmoke ? 0.55 : 0.4,
      sizeEnd: isSmoke ? 1.1 : 0.05,
      sizeCurve: typeof sizeOverLife?.config.curve === "string" ? sizeOverLife.config.curve : undefined,
      alphaCurve: typeof alphaOverLife?.config.curve === "string" ? alphaOverLife.config.curve : undefined,
      colorCurve: typeof colorOverLife?.config.curve === "string" ? colorOverLife.config.curve : undefined,
      color: readHexColor(document, emitter),
      additive: firstRenderer?.material.blendMode !== "alpha",
      maxParticleCount: Math.min(compiledEmitter?.capacity ?? emitter.maxParticleCount, 800)
      ,isSmoke,
      texturePreset: readTexturePreset(emitter)
    };
  });
}

// ─── CPU particle state ───────────────────────────────────────────────────────

type Particle = {
  emitterId: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  sizeStart: number;
  sizeEnd: number;
  rotation: number;
  seed: number;
};

function spawnParticle(cfg: EmitterPreviewConfig, origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): Particle {
  const angle = Math.PI * 0.5 + (Math.random() * 2 - 1) * cfg.spreadRadians;
  const azimuth = Math.random() * Math.PI * 2;
  const speed = cfg.speedMin + Math.random() * Math.max(0, cfg.speedMax - cfg.speedMin);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const ringRadius = Math.max(cfg.orbitRadius, cfg.spawnRadius, 0);
  const ringTheta = Math.random() * Math.PI * 2;
  const ringJitter = ringRadius > 0 ? ringRadius * (0.78 + Math.random() * 0.44) : 0;
  const radialX = Math.cos(ringTheta);
  const radialZ = Math.sin(ringTheta);
  const tangentX = -radialZ;
  const tangentZ = radialX;
  const tangentialSpeed = ringRadius > 0 ? Math.max(speed * 0.4, cfg.orbitAngularSpeed * Math.max(ringJitter, 0.12)) : 0;
  const radialSpeed = ringRadius > 0 ? (Math.random() * 2 - 1) * speed * 0.16 : 0;

  return {
    emitterId: cfg.emitterId,
    centerX: origin.x,
    centerY: origin.y,
    centerZ: origin.z,
    x: origin.x + (ringRadius > 0 ? radialX * ringJitter : (Math.random() - 0.5) * 0.12),
    y: origin.y + (Math.random() - 0.5) * (cfg.isSmoke ? 0.08 : 0.12),
    z: origin.z + (ringRadius > 0 ? radialZ * ringJitter : (Math.random() - 0.5) * 0.12),
    vx:
      cosA * Math.cos(azimuth) * speed * (ringRadius > 0 ? 0.18 : 1) + tangentX * tangentialSpeed + radialX * radialSpeed,
    vy: sinA * speed * (ringRadius > 0 ? 0.14 : 1) + cfg.upwardDrift * 0.12,
    vz:
      cosA * Math.sin(azimuth) * speed * (ringRadius > 0 ? 0.18 : 1) + tangentZ * tangentialSpeed + radialZ * radialSpeed,
    age: 0,
    lifetime: cfg.lifetime * (0.8 + Math.random() * 0.5),
    sizeStart: cfg.sizeStart * (0.75 + Math.random() * 0.5),
    sizeEnd: cfg.sizeEnd,
    rotation: Math.random() * Math.PI * 2
    ,seed: Math.random() * 1000
  };
}

// ─── Sprite texture ────────────────────────────────────────────────────────────

function makeSpriteTexture(preset: string): THREE.Texture {
  const size = 128;
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
    for (const blob of [
      [0.42, 0.42, 0.26],
      [0.6, 0.44, 0.24],
      [0.48, 0.62, 0.28],
      [0.34, 0.56, 0.2]
    ]) {
      const [x, y, radius] = blob;
      const gradient = ctx.createRadialGradient(size * x, size * y, 0, size * x, size * y, size * radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.42)");
      gradient.addColorStop(0.55, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(size * x, size * y, size * radius, 0, Math.PI * 2);
      ctx.fill();
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

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function lerp(left: number, right: number, t: number) {
  return left + (right - left) * t;
}

function evaluateSize(curve: string | undefined, t: number, start: number, end: number) {
  if (curve === "flash-expand") {
    return lerp(start, end, 1 - Math.pow(1 - t, 3));
  }
  if (curve === "smoke-soft") {
    return lerp(start, end, Math.sqrt(clamp01(t)));
  }
  return lerp(start, end, t);
}

function evaluateAlpha(curve: string | undefined, t: number, isSmoke: boolean) {
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

function evaluateColor(color: THREE.Color, curve: string | undefined, t: number, isSmoke: boolean) {
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

// ─── Preview component ────────────────────────────────────────────────────────

export function ThreePreviewPanel(props: {
  document: VfxEffectDocument;
  compileResult?: CompiledVfxEffect;
  selectedEmitterId?: string;
}) {
  const { document, compileResult, selectedEmitterId } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soloSelected, setSoloSelected] = useState(false);
  const [particleCount, setParticleCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [fireVersion, setFireVersion] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [payloadValues, setPayloadValues] = useState<Record<string, string>>({});

  // Reset payload values when the selected event changes
  const prevEventIdRef = useRef(selectedEventId);
  if (prevEventIdRef.current !== selectedEventId) {
    prevEventIdRef.current = selectedEventId;
    // Will be handled below with useEffect-like logic via a key reset
  }

  const activeEmitterIds = useMemo(() => resolveActiveEmitterIds(document), [document]);

  const effectiveActiveIds = useMemo(
    () => (soloSelected && selectedEmitterId ? new Set([selectedEmitterId]) : activeEmitterIds),
    [soloSelected, selectedEmitterId, activeEmitterIds]
  );

  const emitterConfigs = useMemo(
    () => buildEmitterConfigs(document, compileResult, effectiveActiveIds),
    [document, compileResult, effectiveActiveIds]
  );

  const emitterConfigKey = useMemo(
    () =>
      JSON.stringify(
        emitterConfigs.map((config) => ({
          emitterId: config.emitterId,
          additive: config.additive,
          startupBurstCount: config.startupBurstCount,
          eventBursts: config.eventBursts,
          deathEventIds: config.deathEventIds,
          color: config.color.getHexString(),
          curlStrength: config.curlStrength,
          drag: config.drag,
          gravity: config.gravity,
          lifetime: config.lifetime,
          maxParticleCount: config.maxParticleCount,
          orbitAngularSpeed: config.orbitAngularSpeed,
          orbitRadius: config.orbitRadius,
          rate: config.rate,
          spawnRadius: config.spawnRadius,
          sizeEnd: config.sizeEnd,
          sizeStart: config.sizeStart,
          speedMax: config.speedMax,
          speedMin: config.speedMin,
          spreadRadians: config.spreadRadians,
          texturePreset: config.texturePreset,
          upwardDrift: config.upwardDrift
        }))
      ),
    [emitterConfigs]
  );

  const resetKey = `${resetVersion}-${compileResult?.id ?? "none"}-${selectedEmitterId ?? ""}`;

  // Which emitter IDs should participate in the next manual burst.
  // If an event is selected, only emitters with a SpawnBurst that listens to it.
  // Otherwise ("all events" / no selection) every emitter fires.
  const burstFilteredConfigs = useMemo(() => {
    if (!selectedEventId) return emitterConfigs;
    return emitterConfigs.filter((cfg) => {
      const emitter = document.emitters.find((e) => e.id === cfg.emitterId);
      if (!emitter) return false;
      return emitter.spawnStage.modules.some(
        (m) => m.kind === "SpawnBurst" && m.config.everyEvent === selectedEventId
      );
    });
  }, [emitterConfigs, selectedEventId, document.emitters]);

  const burstFilteredConfigsRef = useRef(burstFilteredConfigs);
  burstFilteredConfigsRef.current = burstFilteredConfigs;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const emitterConfigsRef = useRef(emitterConfigs);
  emitterConfigsRef.current = emitterConfigs;
  const setParticleCountRef = useRef(setParticleCount);
  setParticleCountRef.current = setParticleCount;
  const resetKeyRef = useRef(resetKey);
  resetKeyRef.current = resetKey;
  const fireVersionRef = useRef(fireVersion);
  fireVersionRef.current = fireVersion;
  const selectedEventIdRef = useRef(selectedEventId);
  selectedEventIdRef.current = selectedEventId;
  const emitterConfigKeyRef = useRef(emitterConfigKey);
  emitterConfigKeyRef.current = emitterConfigKey;

  useEffect(() => {
    setResetVersion((current) => current + 1);
  }, [compileResult, selectedEmitterId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Three.js scene setup ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 200);
    camera.position.set(0, 2.5, 7);
    camera.lookAt(0, 1, 0);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 30;
    controls.update();

    // Grid floor
    const gridHelper = new THREE.GridHelper(8, 16, 0x1a2b1a, 0x111a11);
    scene.add(gridHelper);

    // Ambient soft fill
    scene.add(new THREE.AmbientLight(0x0a1a0f, 2));

    // ── Per-emitter Three.js Points objects ──
    type EmitterMesh = {
      emitterId: string;
      points: THREE.Points;
      geometry: THREE.BufferGeometry;
      posAttr: THREE.BufferAttribute;
      colorAttr: THREE.BufferAttribute;
      sizeAttr: THREE.BufferAttribute;
      maxCount: number;
      additive: boolean;
      texture: THREE.Texture;
    };

    const emitterMeshes: EmitterMesh[] = [];

    function buildEmitterMesh(cfg: EmitterPreviewConfig): EmitterMesh {
      const maxCount = cfg.maxParticleCount;
      const positions = new Float32Array(maxCount * 3);
      const colors = new Float32Array(maxCount * 4);
      const sizes = new Float32Array(maxCount);

      const geometry = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      const colorAttr = new THREE.BufferAttribute(colors, 4);
      const sizeAttr = new THREE.BufferAttribute(sizes, 1);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      sizeAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", posAttr);
      geometry.setAttribute("color", colorAttr);
      geometry.setAttribute("size", sizeAttr);
      geometry.setDrawRange(0, 0);

      const texture = makeSpriteTexture(cfg.texturePreset);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture }
        },
        vertexShader: /* glsl */ `
          attribute float size;
          attribute vec4 color;
          varying vec4 vColor;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          varying vec4 vColor;
          void main() {
            float alpha = texture2D(map, gl_PointCoord).r;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vColor.rgb * vColor.a * alpha, vColor.a * alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      return { emitterId: cfg.emitterId, points, geometry, posAttr, colorAttr, sizeAttr, maxCount, additive: cfg.additive, texture };
    }

    function rebuildMeshes() {
      // Remove old
      for (const em of emitterMeshes) {
        scene.remove(em.points);
        em.geometry.dispose();
        (em.points.material as THREE.Material).dispose();
        em.texture.dispose();
      }
      emitterMeshes.length = 0;

      // Build new
      for (const cfg of emitterConfigsRef.current) {
        emitterMeshes.push(buildEmitterMesh(cfg));
      }
    }

    rebuildMeshes();

    // ── CPU particle pool ──
    const particles: Particle[] = [];
    const accumulators = new Map<string, number>();
    let previousResetKey = resetKeyRef.current;
    let previousFireVersion = fireVersionRef.current;
    let previousEmitterConfigKey = emitterConfigKeyRef.current;
    let lastTime = performance.now();

    function spawnConfigBurst(cfg: EmitterPreviewConfig, count: number, origin?: { x: number; y: number; z: number }) {
      const budget = Math.min(cfg.maxParticleCount, 300);
      const existing = particles.filter((p) => p.emitterId === cfg.emitterId).length;
      const spawnCount = Math.min(count, Math.max(0, budget - existing));
      for (let i = 0; i < spawnCount; i++) {
        particles.push(spawnParticle(cfg, origin));
      }
    }

    function triggerStartupBursts() {
      const configs = emitterConfigsRef.current;
      for (const cfg of configs) {
        if (cfg.startupBurstCount > 0) {
          spawnConfigBurst(cfg, cfg.startupBurstCount);
        }
      }
    }

    function emitEvent(eventId: string, origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
      const configs = emitterConfigsRef.current;
      for (const cfg of configs) {
        const count = cfg.eventBursts
          .filter((eventBurst) => eventBurst.eventId === eventId)
          .reduce((sum, eventBurst) => sum + eventBurst.count, 0);
        if (count > 0) {
          spawnConfigBurst(cfg, count, origin);
        }
      }
    }

    function fireManualBurst() {
      const eventId = selectedEventIdRef.current;
      if (eventId) {
        emitEvent(eventId);
        return;
      }

      const configs = burstFilteredConfigsRef.current;
      for (const cfg of configs) {
        if (cfg.startupBurstCount > 0) {
          spawnConfigBurst(cfg, cfg.startupBurstCount);
        }
        cfg.eventBursts.forEach((eventBurst) => emitEvent(eventBurst.eventId));
      }
    }

    triggerStartupBursts();

    // Resize observer
    let width = 0;
    let height = 0;

    function resize() {
      const bounds = mount!.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // Camera slow orbit — removed; user controls via OrbitControls

    // ── RAF loop ────────────────────────────────────────────────────────────
    let rafId = 0;

    function frame(now: number) {
      rafId = requestAnimationFrame(frame);

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const configs = emitterConfigsRef.current;

      if (emitterConfigKeyRef.current !== previousEmitterConfigKey) {
        previousEmitterConfigKey = emitterConfigKeyRef.current;
        particles.length = 0;
        accumulators.clear();
        rebuildMeshes();
        triggerStartupBursts();
      }

      if (resetKeyRef.current !== previousResetKey) {
        previousResetKey = resetKeyRef.current;
        particles.length = 0;
        accumulators.clear();
        rebuildMeshes();
        triggerStartupBursts();
      }

      if (fireVersionRef.current !== previousFireVersion) {
        previousFireVersion = fireVersionRef.current;
        fireManualBurst();
      }

      const playing = isPlayingRef.current;
      const configByEmitterId = new Map(configs.map((cfg) => [cfg.emitterId, cfg]));

      if (playing) {
        // Spawn by rate
        for (const cfg of configs) {
          const acc = (accumulators.get(cfg.emitterId) ?? 0) + cfg.rate * dt;
          const n = Math.floor(acc);
          accumulators.set(cfg.emitterId, acc - n);
          for (let i = 0; i < n; i++) {
            if (particles.filter((p) => p.emitterId === cfg.emitterId).length < cfg.maxParticleCount) {
              particles.push(spawnParticle(cfg));
            }
          }
        }

        // Simulate
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i]!;
          const cfg = configByEmitterId.get(p.emitterId);
          if (!cfg) {
            particles.splice(i, 1);
            continue;
          }

          p.age += dt;
          if (p.age >= p.lifetime) {
            cfg.deathEventIds.forEach((eventId) => emitEvent(eventId, { x: p.x, y: p.y, z: p.z }));
            particles.splice(i, 1);
            continue;
          }

          if (cfg.orbitRadius > 0 || cfg.orbitAngularSpeed !== 0) {
            const dx = p.x - p.centerX;
            const dz = p.z - p.centerZ;
            const radius = Math.max(0.0001, Math.hypot(dx, dz));
            const tangentX = -dz / radius;
            const tangentZ = dx / radius;
            const radialError = radius - Math.max(cfg.orbitRadius, 0.08);
            const orbitForce = cfg.orbitAngularSpeed * Math.max(cfg.orbitRadius, 0.12) * 0.85;
            p.vx += (tangentX * orbitForce - (dx / radius) * radialError * 3.2) * dt;
            p.vz += (tangentZ * orbitForce - (dz / radius) * radialError * 3.2) * dt;
          }

          if (cfg.curlStrength > 0) {
            const phase = p.seed + p.age * 3.2;
            p.vx += Math.sin(phase + p.z * 2.5) * cfg.curlStrength * 0.02 * dt;
            p.vy += Math.cos(phase * 0.65 + p.x * 1.6) * cfg.curlStrength * 0.012 * dt;
            p.vz += Math.sin(phase * 1.17 + p.y * 1.8) * cfg.curlStrength * 0.02 * dt;
          }

          const dragF = Math.max(0, 1 - cfg.drag * dt);
          p.vx *= dragF;
          p.vy = p.vy * dragF - cfg.gravity * dt + cfg.upwardDrift * dt;
          p.vz *= dragF;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
        }
      }

      controls.update();

      setParticleCountRef.current(particles.length);

      // Write GPU buffers
      for (const em of emitterMeshes) {
        const emParticles = particles.filter((p) => p.emitterId === em.emitterId);
        const cfg = configs.find((c) => c.emitterId === em.emitterId);
        if (!cfg) {
          em.geometry.setDrawRange(0, 0);
          continue;
        }

        const count = Math.min(emParticles.length, em.maxCount);
        for (let i = 0; i < count; i++) {
          const p = emParticles[i]!;
          const life = Math.min(p.age / p.lifetime, 1);
          const alpha = evaluateAlpha(cfg.alphaCurve, life, cfg.isSmoke);
          const size = evaluateSize(cfg.sizeCurve, life, p.sizeStart, p.sizeEnd);
          const color = evaluateColor(cfg.color, cfg.colorCurve, life, cfg.isSmoke);

          em.posAttr.setXYZ(i, p.x, p.y, p.z);
          em.colorAttr.setXYZW(i, color.r, color.g, color.b, alpha);
          em.sizeAttr.setX(i, Math.max(0.01, size));
        }

        if (count > 0) {
          em.posAttr.needsUpdate = true;
          em.colorAttr.needsUpdate = true;
          em.sizeAttr.needsUpdate = true;
        }
        em.geometry.setDrawRange(0, count);
      }

      renderer.render(scene, camera);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      for (const em of emitterMeshes) {
        scene.remove(em.points);
        em.geometry.dispose();
        (em.points.material as THREE.Material).dispose();
        em.texture.dispose();
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
    // Re-run only when the component mounts/unmounts — internal state synced via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync isPlaying via ref — no useEffect needed, done inline above
  // burstKey is also synced inline via ref

  const hasOutput = document.graph.nodes.some((n) => n.kind === "output");
  const activeCount = effectiveActiveIds?.size ?? document.emitters.length;
  const renderableCount = emitterConfigs.length;
  const totalCount = document.emitters.length;
  const allShown = !effectiveActiveIds || effectiveActiveIds.size === totalCount;

  const events = document.events;
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const payloadKeys = selectedEvent ? Object.keys(selectedEvent.payload) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/8 px-3 py-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-400/8 px-2.5 py-1 text-[11px] text-emerald-100 transition hover:border-emerald-300/35"
          onClick={() => setIsPlaying((c) => !c)}
        >
          {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>

        {/* Event fire section */}
        <div className="flex items-center gap-1">
          <select
            className="h-6.5 rounded-lg border border-white/10 bg-black/30 px-1.5 text-[11px] text-zinc-300 outline-none transition hover:border-white/20 focus:border-white/20"
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setPayloadValues({});
            }}
          >
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <button
            type="button"
            title={selectedEventId ? `Fire "${selectedEvent?.name ?? selectedEventId}"` : "Fire all burst emitters"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-emerald-300/30 hover:text-emerald-200"
            onClick={() => setFireVersion((c) => c + 1)}
          >
            <Zap className="size-3" />
            <span>Fire</span>
          </button>
        </div>

        <button
          type="button"
          title="Reset simulation"
          className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2 py-1 text-[11px] text-zinc-600 transition hover:border-white/16 hover:text-zinc-400"
          onClick={() => setResetVersion((c) => c + 1)}
        >
          <RotateCcw className="size-3" />
        </button>

        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            className="accent-emerald-400"
            checked={soloSelected}
            onChange={(e) => setSoloSelected(e.target.checked)}
          />
          <span>Solo</span>
        </label>
        <span className="ml-auto text-[11px] text-zinc-600">{particleCount}</span>
      </div>

      {/* Payload fields for the selected event */}
      {payloadKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/6 bg-black/15 px-3 py-2">
          <span className="shrink-0 text-[10px] text-zinc-600">Payload</span>
          {payloadKeys.map((key) => (
            <label key={key} className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">{key}</span>
              <span className="text-[10px] text-zinc-700">{selectedEvent?.payload[key]}</span>
              <input
                type="text"
                className="h-6 w-20 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-zinc-200 outline-none focus:border-white/20"
                placeholder="0"
                value={payloadValues[key] ?? ""}
                onChange={(e) => setPayloadValues((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      {/* Graph status */}
      <div
        className={`shrink-0 border-b px-3 py-1.5 text-[10px] leading-snug ${
          hasOutput && !allShown
            ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300/60"
            : hasOutput
              ? "border-emerald-400/10 bg-emerald-400/4 text-emerald-300/45"
              : "border-amber-500/12 bg-amber-500/5 text-amber-300/55"
        }`}
      >
        {hasOutput
          ? allShown
            ? `Graph: all ${totalCount} emitter${totalCount === 1 ? "" : "s"} connected to output`
            : `Graph: ${activeCount} of ${totalCount} emitter${totalCount === 1 ? "" : "s"} connected to output`
          : "Graph: no output node — showing all emitters. Connect emitters → output to filter."}
        {` · renderable in preview: ${renderableCount}`}
      </div>

      {/* Three.js canvas mount */}
      <div ref={mountRef} className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl bg-[#080e0c]">
        {emitterConfigs.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-600">
            {hasOutput && activeCount === 0
              ? "No emitters connected to the output node."
              : activeCount > 0
                ? "Connected emitters need at least one enabled renderer to appear in preview."
                : "Add an emitter with a renderer to preview."}
          </div>
        )}
      </div>
    </div>
  );
}
