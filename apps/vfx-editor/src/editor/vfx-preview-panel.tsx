import type { CompiledVfxEffect, EmitterDocument, VfxEffectDocument } from "@ggez/vfx-schema";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Particle = {
  additive: boolean;
  age: number;
  alpha: number;
  angularVelocity: number;
  color: [number, number, number];
  distortion: boolean;
  emitterId: string;
  lifetime: number;
  rotation: number;
  size: number;
  trail: boolean;
  trailPoints: Array<{ x: number; y: number }>;
  type: "mesh" | "sprite";
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type EmitterPreviewConfig = {
  additive: boolean;
  burstCount: number;
  color: [number, number, number];
  distortion: boolean;
  drag: number;
  emitterId: string;
  gravity: number;
  lifetime: number;
  maxParticleCount: number;
  particleType: "mesh" | "sprite";
  rate: number;
  sizeEnd: number;
  sizeStart: number;
  spawnOffsetX: number;
  spawnOffsetY: number;
  spawnOffsetZ: number;
  spawnRandomX: number;
  spawnRandomY: number;
  spawnRandomZ: number;
  speedMax: number;
  speedMin: number;
  spreadRadians: number;
  trail: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readHexColor(document: VfxEffectDocument, emitter: EmitterDocument): [number, number, number] {
  const boundColor = emitter.renderers.flatMap((renderer) => Object.values(renderer.parameterBindings))[0];
  const parameter = boundColor
    ? document.parameters.find((entry) => entry.id === boundColor && entry.type === "color")
    : document.parameters.find((entry) => entry.type === "color");

  const value = typeof parameter?.defaultValue === "string" ? parameter.defaultValue : "#34d399";
  const hex = value.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((segment) => `${segment}${segment}`).join("") : hex.padEnd(6, "0").slice(0, 6);
  const int = Number.parseInt(normalized, 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;
  return [r, g, b];
}

function buildEmitterPreviewConfigs(
  document: VfxEffectDocument,
  compiledEffect: CompiledVfxEffect | undefined,
  selectedEmitterId?: string,
  soloSelectedEmitter?: boolean
): EmitterPreviewConfig[] {
  const activeEmitters = (soloSelectedEmitter && selectedEmitterId
    ? document.emitters.filter((emitter) => emitter.id === selectedEmitterId)
    : document.emitters
  )
    .filter((emitter) => emitter.renderers.some((renderer) => renderer.enabled))
    .slice(0, 4);

  return activeEmitters.map((emitter) => {
    const compiledEmitter = compiledEffect?.emitters.find((entry) => entry.id === emitter.id);
    const burstCount = emitter.spawnStage.modules
      .filter((module) => module.kind === "SpawnBurst")
      .reduce((sum, module) => sum + readNumber(module.config.count, 18), 0);
    const rate = emitter.spawnStage.modules
      .filter((module) => module.kind === "SpawnRate")
      .reduce((sum, module) => sum + readNumber(module.config.rate, 0), 0);
    const spawnCone = emitter.spawnStage.modules.find((module) => module.kind === "SpawnCone");
    const spreadDegrees = spawnCone?.config.angleDegrees;
    const velocityCone = emitter.initializeStage.modules.find((module) => module.kind === "VelocityCone");
    const drag = emitter.updateStage.modules.find((module) => module.kind === "Drag");
    const gravity = emitter.updateStage.modules.find((module) => module.kind === "GravityForce");
    const sizeOverLife = emitter.updateStage.modules.find((module) => module.kind === "SizeOverLife");
    const lifetimeModule = emitter.initializeStage.modules.find(
      (module) => module.kind === "SetAttribute" && module.config.attribute === "lifetime"
    );
    const sizeModule = emitter.initializeStage.modules.find(
      (module) => module.kind === "SetAttribute" && module.config.attribute === "size"
    );
    const firstRenderer = emitter.renderers.find((renderer) => renderer.enabled);
    const trail = emitter.renderers.some((renderer) => renderer.kind === "ribbon");
    const distortion = emitter.renderers.some((renderer) => renderer.kind === "distortion");
    const particleType = firstRenderer?.kind === "mesh" ? "mesh" : "sprite";
    const defaultSizeStart = particleType === "mesh" ? 9 : firstRenderer?.template === "SpriteSmokeMaterial" ? 22 : 16;
    const defaultSizeEnd = particleType === "mesh" ? 2 : firstRenderer?.template === "SpriteSmokeMaterial" ? 42 : 8;
    const authoredSize = readOptionalNumber(sizeModule?.config.value);
    const sizeStart = authoredSize ?? defaultSizeStart;
    const sizeEnd = authoredSize !== undefined
      ? (sizeOverLife ? sizeStart * (defaultSizeEnd / Math.max(defaultSizeStart, 0.0001)) : sizeStart)
      : defaultSizeEnd;

    return {
      emitterId: emitter.id,
      burstCount: Math.max(0, Math.round(burstCount)),
      rate: Math.max(0, rate),
      spreadRadians: (readNumber(spreadDegrees, 16) * Math.PI) / 180,
      spawnOffsetX: readNumber(spawnCone?.config.offsetX, 0) * 24,
      spawnOffsetY: readNumber(spawnCone?.config.offsetY, 0) * 24,
      spawnOffsetZ: readNumber(spawnCone?.config.offsetZ, 0),
      spawnRandomX: readNumber(spawnCone?.config.randomX, 0) * 24,
      spawnRandomY: readNumber(spawnCone?.config.randomY, 0) * 24,
      spawnRandomZ: readNumber(spawnCone?.config.randomZ, 0),
      speedMin: readNumber(velocityCone?.config.speedMin, 0),
      speedMax: readNumber(velocityCone?.config.speedMax, velocityCone ? readNumber(velocityCone?.config.speedMin, 0) : 0),
      drag: readNumber(drag?.config.coefficient, 2.8),
      gravity: readNumber(gravity?.config.accelerationY, 0),
      lifetime: readNumber(lifetimeModule?.config.value, 0.42),
      sizeStart,
      sizeEnd,
      color: readHexColor(document, emitter),
      additive: firstRenderer?.material.blendMode !== "alpha",
      distortion,
      trail,
      particleType,
      maxParticleCount: compiledEmitter?.capacity ?? emitter.maxParticleCount
    };
  });
}

function spawnParticle(config: EmitterPreviewConfig, origin: { x: number; y: number }): Particle {
  const angle = (-Math.PI / 2) + (Math.random() * 2 - 1) * config.spreadRadians;
  const speed = config.speedMin + Math.random() * Math.max(0, config.speedMax - config.speedMin);
  const sizeJitter = 0.75 + Math.random() * 0.6;

  return {
    emitterId: config.emitterId,
    x: origin.x + config.spawnOffsetX + (Math.random() * 2 - 1) * config.spawnRandomX,
    y: origin.y + config.spawnOffsetY + (Math.random() * 2 - 1) * config.spawnRandomY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: 0,
    lifetime: config.lifetime * (0.85 + Math.random() * 0.4),
    size: config.sizeStart * sizeJitter,
    rotation: Math.random() * Math.PI * 2,
    angularVelocity: (Math.random() * 2 - 1) * 4.5,
    alpha: 1,
    color: config.color,
    additive: config.additive,
    distortion: config.distortion,
    trail: config.trail,
    type: config.particleType,
    trailPoints: [{ x: origin.x, y: origin.y }]
  };
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0c1210");
  gradient.addColorStop(1, "#090a0d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const grid = 28;
  for (let x = 0; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
}

export function VfxPreviewPanel(props: {
  document: VfxEffectDocument;
  compileResult?: CompiledVfxEffect;
  selectedEmitterId?: string;
}) {
  const { document, compileResult, selectedEmitterId } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soloSelectedEmitter, setSoloSelectedEmitter] = useState(false);
  const [burstVersion, setBurstVersion] = useState(0);
  const [particleCount, setParticleCount] = useState(0);

  const previewConfigs = useMemo(
    () => buildEmitterPreviewConfigs(document, compileResult, selectedEmitterId, soloSelectedEmitter),
    [compileResult, document, selectedEmitterId, soloSelectedEmitter]
  );

  useEffect(() => {
    setBurstVersion((current) => current + 1);
  }, [compileResult, selectedEmitterId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || previewConfigs.length === 0) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const canvasElement = canvas;
    const containerElement = container;
    const context = ctx;

    let rafId = 0;
    let lastTime = performance.now();
    let loopElapsed = 0;
    let previousBurstVersion = burstVersion;
    const particles: Particle[] = [];
    const spawnAccumulators = new Map<string, number>();

    function resizeCanvas() {
      const bounds = containerElement.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
      }
    }

    function getAnchor(width: number, height: number) {
      return { x: width * 0.5, y: height * 0.52 };
    }

    function triggerBurst(anchor: { x: number; y: number }) {
      previewConfigs.forEach((config) => {
        const budget = Math.min(config.maxParticleCount, 240);
        const count = Math.min(config.burstCount, Math.max(1, budget - particles.filter((particle) => particle.emitterId === config.emitterId).length));
        for (let index = 0; index < count; index += 1) {
          particles.push(spawnParticle(config, anchor));
        }
      });
    }

    function drawParticle(particle: Particle) {
      const life = clamp(particle.age / particle.lifetime, 0, 1);
      const alpha = particle.alpha * (1 - life);
      const size = particle.size * (1 - life) + (particle.type === "mesh" ? 2 : 10) * life;
      const [r, g, b] = particle.color;
      const fill = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;

      if (particle.trail && particle.trailPoints.length > 1) {
        context.save();
        context.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha * 0.45})`;
        context.lineWidth = Math.max(1, size * 0.22);
        context.beginPath();
        particle.trailPoints.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        context.stroke();
        context.restore();
      }

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.globalCompositeOperation = particle.additive ? "lighter" : "source-over";

      if (particle.type === "mesh") {
        context.fillStyle = fill;
        context.beginPath();
        context.moveTo(0, -size);
        context.lineTo(size * 0.75, 0);
        context.lineTo(0, size);
        context.lineTo(-size * 0.75, 0);
        context.closePath();
        context.fill();
      } else {
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(2, size));
        gradient.addColorStop(0, fill);
        gradient.addColorStop(0.42, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha * 0.48})`);
        gradient.addColorStop(1, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, Math.max(2, size), 0, Math.PI * 2);
        context.fill();
      }

      if (particle.distortion) {
        context.strokeStyle = `rgba(255,255,255,${alpha * 0.16})`;
        context.lineWidth = Math.max(1, size * 0.18);
        context.beginPath();
        context.arc(0, 0, size * 1.3, 0, Math.PI * 2);
        context.stroke();
      }

      context.restore();
    }

    function frame(now: number) {
      resizeCanvas();
      const width = canvasElement.width;
      const height = canvasElement.height;
      const dt = Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;
      loopElapsed += dt;

      const anchor = getAnchor(width, height);
      if (previousBurstVersion !== burstVersion) {
        previousBurstVersion = burstVersion;
        particles.length = 0;
        triggerBurst(anchor);
        loopElapsed = 0;
      }

      if (isPlaying) {
        previewConfigs.forEach((config) => {
          const currentAccumulator = spawnAccumulators.get(config.emitterId) ?? 0;
          const nextAccumulator = currentAccumulator + config.rate * dt;
          const spawnCount = Math.floor(nextAccumulator);
          spawnAccumulators.set(config.emitterId, nextAccumulator - spawnCount);

          for (let index = 0; index < spawnCount; index += 1) {
            if (particles.length >= config.maxParticleCount) {
              break;
            }
            particles.push(spawnParticle(config, anchor));
          }
        });

        if (document.preview.loop && loopElapsed >= document.preview.durationSeconds) {
          particles.length = 0;
          triggerBurst(anchor);
          loopElapsed = 0;
        }

        for (let index = particles.length - 1; index >= 0; index -= 1) {
          const particle = particles[index]!;
          const config = previewConfigs.find((entry) => entry.emitterId === particle.emitterId);
          if (!config) {
            particles.splice(index, 1);
            continue;
          }

          particle.age += dt;
          particle.vx *= Math.max(0, 1 - config.drag * dt);
          particle.vy = particle.vy * Math.max(0, 1 - config.drag * 0.32 * dt) + config.gravity * dt;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.rotation += particle.angularVelocity * dt;

          particle.trailPoints.push({ x: particle.x, y: particle.y });
          if (particle.trailPoints.length > 8) {
            particle.trailPoints.shift();
          }

          if (particle.age >= particle.lifetime) {
            particles.splice(index, 1);
          }
        }
      }

      setParticleCount(particles.length);

      drawBackdrop(context, width, height);
      particles.forEach(drawParticle);

      rafId = window.requestAnimationFrame(frame);
    }

    resizeCanvas();
    triggerBurst(getAnchor(canvasElement.width, canvasElement.height));
    rafId = window.requestAnimationFrame(frame);

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(containerElement);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [burstVersion, document.preview.durationSeconds, document.preview.loop, isPlaying, previewConfigs]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-400/8 px-2.5 py-1 text-[11px] text-emerald-100 hover:border-emerald-300/35 transition"
          onClick={() => setIsPlaying((current) => !current)}
        >
          {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-white/20 transition"
          onClick={() => setBurstVersion((current) => current + 1)}
        >
          <RotateCcw className="size-3" />
          <span>Burst</span>
        </button>
        <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-white/20 bg-transparent accent-emerald-400"
            checked={soloSelectedEmitter}
            onChange={(event) => setSoloSelectedEmitter(event.target.checked)}
          />
          <span>Solo</span>
        </label>
        <span className="ml-auto text-[11px] text-zinc-600">{particleCount}</span>
      </div>
      {/* Graph is not evaluated here — this is a live simulation of all document emitters */}
      <div className="shrink-0 border-b border-white/6 bg-amber-500/5 px-3 py-1.5 text-[10px] leading-snug text-amber-300/60">
        All document emitters · graph wiring not applied
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1">
        {previewConfigs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-600">
            Add an emitter with a renderer to preview.
          </div>
        ) : (
          <canvas ref={canvasRef} className="block h-full w-full" />
        )}
      </div>
    </div>
  );
}
