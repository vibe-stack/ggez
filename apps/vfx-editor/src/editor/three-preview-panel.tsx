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
import { Pause, Play, RotateCcw } from "lucide-react";
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
  burstCount: number;
  rate: number;
  spreadRadians: number;
  speedMin: number;
  speedMax: number;
  drag: number;
  gravity: number;
  lifetime: number;
  sizeStart: number;
  sizeEnd: number;
  color: THREE.Color;
  additive: boolean;
  maxParticleCount: number;
};

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readHexColor(document: VfxEffectDocument, emitter: EmitterDocument): THREE.Color {
  const boundColor = emitter.renderers.flatMap((r) => Object.values(r.parameterBindings))[0];
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
    const burstCount = emitter.spawnStage.modules
      .filter((m) => m.kind === "SpawnBurst")
      .reduce((sum, m) => sum + readNumber(m.config.count, 18), 0);
    const rate = emitter.spawnStage.modules
      .filter((m) => m.kind === "SpawnRate")
      .reduce((sum, m) => sum + readNumber(m.config.rate, 0), 0);
    const spreadDeg = emitter.spawnStage.modules.find((m) => m.kind === "SpawnCone")?.config.angleDegrees;
    const velocityCone = emitter.initializeStage.modules.find((m) => m.kind === "VelocityCone");
    const drag = emitter.updateStage.modules.find((m) => m.kind === "Drag");
    const gravity = emitter.updateStage.modules.find((m) => m.kind === "GravityForce");
    const lifetimeModule = emitter.initializeStage.modules.find(
      (m) => m.kind === "SetAttribute" && m.config.attribute === "lifetime"
    );
    const firstRenderer = emitter.renderers.find((r) => r.enabled);
    const isSmoke = firstRenderer?.template === "SpriteSmokeMaterial";

    return {
      emitterId: emitter.id,
      burstCount: Math.max(0, Math.round(burstCount)),
      rate: Math.max(0, rate),
      spreadRadians: (readNumber(spreadDeg, 16) * Math.PI) / 180,
      speedMin: readNumber(velocityCone?.config.speedMin, 60) * 0.04,
      speedMax: readNumber(velocityCone?.config.speedMax, 180) * 0.04,
      drag: readNumber(drag?.config.coefficient, 2.8),
      gravity: readNumber(gravity?.config.accelerationY, 120) * 0.04,
      lifetime: readNumber(lifetimeModule?.config.value, 0.42),
      sizeStart: isSmoke ? 0.55 : 0.4,
      sizeEnd: isSmoke ? 1.1 : 0.05,
      color: readHexColor(document, emitter),
      additive: firstRenderer?.material.blendMode !== "alpha",
      maxParticleCount: Math.min(compiledEmitter?.capacity ?? emitter.maxParticleCount, 800)
    };
  });
}

// ─── CPU particle state ───────────────────────────────────────────────────────

type Particle = {
  emitterId: string;
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
};

function spawnParticle(cfg: EmitterPreviewConfig): Particle {
  const angle = -Math.PI * 0.5 + (Math.random() * 2 - 1) * cfg.spreadRadians;
  const azimuth = Math.random() * Math.PI * 2;
  const speed = cfg.speedMin + Math.random() * Math.max(0, cfg.speedMax - cfg.speedMin);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  return {
    emitterId: cfg.emitterId,
    x: (Math.random() - 0.5) * 0.12,
    y: (Math.random() - 0.5) * 0.12,
    z: (Math.random() - 0.5) * 0.12,
    vx: cosA * Math.cos(azimuth) * speed,
    vy: sinA * speed,
    vz: cosA * Math.sin(azimuth) * speed,
    age: 0,
    lifetime: cfg.lifetime * (0.8 + Math.random() * 0.5),
    sizeStart: cfg.sizeStart * (0.75 + Math.random() * 0.5),
    sizeEnd: cfg.sizeEnd,
    rotation: Math.random() * Math.PI * 2
  };
}

// ─── Sprite texture ────────────────────────────────────────────────────────────

function makeSpriteTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
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
  const [burstVersion, setBurstVersion] = useState(0);

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
          burstCount: config.burstCount,
          color: config.color.getHexString(),
          drag: config.drag,
          gravity: config.gravity,
          lifetime: config.lifetime,
          maxParticleCount: config.maxParticleCount,
          rate: config.rate,
          sizeEnd: config.sizeEnd,
          sizeStart: config.sizeStart,
          speedMax: config.speedMax,
          speedMin: config.speedMin,
          spreadRadians: config.spreadRadians
        }))
      ),
    [emitterConfigs]
  );

  // Unique key to force a particle burst reset on compile/emitter change
  const burstKey = `${burstVersion}-${compileResult?.id ?? "none"}-${selectedEmitterId ?? ""}`;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const emitterConfigsRef = useRef(emitterConfigs);
  emitterConfigsRef.current = emitterConfigs;
  const setParticleCountRef = useRef(setParticleCount);
  setParticleCountRef.current = setParticleCount;
  const burstKeyRef = useRef(burstKey);
  burstKeyRef.current = burstKey;
  const emitterConfigKeyRef = useRef(emitterConfigKey);
  emitterConfigKeyRef.current = emitterConfigKey;

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

    // Sprite texture shared across all emitters
    const spriteTexture = makeSpriteTexture();

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

      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: spriteTexture }
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

      return { emitterId: cfg.emitterId, points, geometry, posAttr, colorAttr, sizeAttr, maxCount, additive: cfg.additive };
    }

    function rebuildMeshes() {
      // Remove old
      for (const em of emitterMeshes) {
        scene.remove(em.points);
        em.geometry.dispose();
        (em.points.material as THREE.Material).dispose();
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
    let previousBurstKey = burstKeyRef.current;
    let previousEmitterConfigKey = emitterConfigKeyRef.current;
    let lastTime = performance.now();

    function triggerBurst() {
      for (const cfg of emitterConfigsRef.current) {
        const budget = Math.min(cfg.maxParticleCount, 300);
        const existing = particles.filter((p) => p.emitterId === cfg.emitterId).length;
        const count = Math.min(cfg.burstCount, Math.max(1, budget - existing));
        for (let i = 0; i < count; i++) {
          particles.push(spawnParticle(cfg));
        }
      }
    }

    triggerBurst();

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
        triggerBurst();
      }

      // Burst on key change
      if (burstKeyRef.current !== previousBurstKey) {
        previousBurstKey = burstKeyRef.current;
        particles.length = 0;
        accumulators.clear();
        rebuildMeshes();
        triggerBurst();
      }

      const playing = isPlayingRef.current;

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
          const cfg = configs.find((c) => c.emitterId === p.emitterId);
          if (!cfg) {
            particles.splice(i, 1);
            continue;
          }

          p.age += dt;
          if (p.age >= p.lifetime) {
            particles.splice(i, 1);
            continue;
          }

          const dragF = Math.max(0, 1 - cfg.drag * dt);
          p.vx *= dragF;
          p.vy = p.vy * dragF - cfg.gravity * dt;
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
          const alpha = (1 - life) * (1 - life * 0.4);
          const size = p.sizeStart + (p.sizeEnd - p.sizeStart) * life;

          em.posAttr.setXYZ(i, p.x, p.y, p.z);
          em.colorAttr.setXYZW(i, cfg.color.r, cfg.color.g, cfg.color.b, alpha);
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
      }
      spriteTexture.dispose();
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-400/8 px-2.5 py-1 text-[11px] text-emerald-100 transition hover:border-emerald-300/35"
          onClick={() => setIsPlaying((c) => !c)}
        >
          {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-white/20"
          onClick={() => setBurstVersion((c) => c + 1)}
        >
          <RotateCcw className="size-3" />
          <span>Burst</span>
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
