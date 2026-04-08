import * as THREE from "three";
import { buildEmitterPreviewConfigs, resolveActiveEmitterIds } from "./extraction";
import { createPreviewGpuSmokeRenderer } from "./smoke-renderer";
import { createPreviewGpuSpriteRenderer } from "./sprite-gpu-renderer";
import { loadPreviewTextureSource } from "./textures";
import {
  GPU_BUFFER_USAGE,
  GPU_MAP_MODE,
  PARTICLE_FLOATS,
  PARTICLE_INDEX,
  PREVIEW_READBACK_BUFFER_COUNT,
  PREVIEW_READBACK_INTERVAL_SECONDS,
  WORKGROUP_SIZE,
  type CreateThreeWebGpuPreviewControllerInput,
  type EmitterPreviewConfig,
  type EmitterReadbackSlot,
  type SmokeRenderResources,
  type SpriteGpuRenderResources,
  type ThreeWebGpuPreviewRuntime,
  type ThreeWebGpuPreviewState
} from "./types";

type RuntimeEntry = {
  accumulator: number;
  config: EmitterPreviewConfig;
  gpu: {
    bindGroup: any;
    particleBuffer: any;
    readBuffers: any[];
    uniformBuffer: any;
  };
  particleData: Float32Array;
  previousAlive: Uint8Array;
  renderMode: "smoke-gpu" | "sprite-gpu";
  requiresReadback: boolean;
  nextSpawnSlot: number;
  smokeSpawnCursor: number;
  smokeStartupRemaining: number;
  smokeRender?: SmokeRenderResources;
  spriteGpuRender?: SpriteGpuRenderResources;
  readbackCooldownSeconds: number;
  readbackSlots: EmitterReadbackSlot[];
  nextReadbackSlot: number;
  lastScheduledReadbackSequence: number;
  lastAppliedReadbackSequence: number;
  lastAppliedReadbackAtSeconds: number;
  dirty: boolean;
};

const COMPUTE_SHADER_CODE = /* wgsl */ `
struct Particle {
  position : vec4f,
  velocity : vec4f,
  timing : vec4f,
  extra : vec4f,
  misc : vec4f,
}

struct SimParams {
  sim0 : vec4f,
  sim1 : vec4f,
  spawn0 : vec4f,
  spawn1 : vec4f,
  spawnOffset : vec4f,
  spawnRandom : vec4f,
  spawnMeta : vec4u,
}

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> params : SimParams;

fn maxf(a: f32, b: f32) -> f32 {
  return select(b, a, a > b);
}

fn hash01(value: u32) -> f32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  let result = (word >> 22u) ^ word;
  return f32(result & 0x00ffffffu) / 16777215.0;
}

fn signedHash(value: u32) -> f32 {
  return hash01(value) * 2.0 - 1.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let index = gid.x;
  if (index >= params.spawnMeta.z) {
    return;
  }

  if (params.spawnMeta.y > 0u) {
    let spawnDistance = (index + params.spawnMeta.z - params.spawnMeta.x) % params.spawnMeta.z;
    if (spawnDistance < params.spawnMeta.y) {
      let baseSeed = index ^ params.spawnMeta.x ^ u32(params.sim1.w * 4096.0 + 1.0);
      let angle = 1.57079632679 + signedHash(baseSeed ^ 0x9e3779b9u) * params.spawn0.x;
      let azimuth = hash01(baseSeed ^ 0x85ebca6bu) * 6.28318530718;
      let speed = params.spawn0.y + hash01(baseSeed ^ 0xc2b2ae35u) * max(0.0, params.spawn0.z - params.spawn0.y);
      let radius = params.spawn0.w * hash01(baseSeed ^ 0x27d4eb2fu);
      let radialAngle = hash01(baseSeed ^ 0x165667b1u) * 6.28318530718;
      let frameCount = max(params.spawn1.w, 1.0);
      var spawnOffset = params.spawnOffset.xyz;
      spawnOffset = spawnOffset + vec3f(cos(radialAngle) * radius, 0.0, sin(radialAngle) * radius);
      spawnOffset = spawnOffset + vec3f(
        signedHash(baseSeed ^ 0xd3a2646cu) * params.spawnRandom.x,
        signedHash(baseSeed ^ 0x8d12eac7u) * params.spawnRandom.y,
        signedHash(baseSeed ^ 0x4f1bbcddu) * params.spawnRandom.z
      );
      let cosA = cos(angle);
      let sinA = sin(angle);
      let velocity = vec3f(
        cosA * cos(azimuth) * speed,
        sinA * speed + params.sim0.w * 0.12,
        cosA * sin(azimuth) * speed
      );
      let lifetime = params.spawn1.x * (0.82 + hash01(baseSeed ^ 0xa24baed4u) * 0.42);
      let sizeStart = params.spawn1.y * (0.76 + hash01(baseSeed ^ 0x9fb21c65u) * 0.36);
      let frame = select(0.0, floor(hash01(baseSeed ^ 0xe6546b64u) * frameCount), params.spawnMeta.w > 0u);

      var spawned : Particle;
      spawned.position = vec4f(spawnOffset, 1.0);
      spawned.velocity = vec4f(velocity, 0.0);
      spawned.timing = vec4f(0.0, lifetime, sizeStart, params.spawn1.z);
      spawned.extra = vec4f(0.0, 0.0, 1.0, frame);
      spawned.misc = vec4f(hash01(baseSeed ^ 0x7f4a7c15u) * 1000.0, 0.0, 0.0, 0.0);
      particles[index] = spawned;
      return;
    }
  }

  var particle = particles[index];
  if (particle.extra.z < 0.5) {
    return;
  }

  let dt = params.sim0.x;
  var age = particle.timing.x + dt;
  if (age >= particle.timing.y) {
    particle.timing.x = age;
    particle.extra.z = 0.0;
    particles[index] = particle;
    return;
  }

  var position = particle.position.xyz;
  var velocity = particle.velocity.xyz;

  if (params.sim1.x > 0.0 || abs(params.sim1.y) > 0.0001) {
    let dx = position.x;
    let dz = position.z;
    let radius = maxf(0.0001, sqrt(dx * dx + dz * dz));
    let tangentX = -dz / radius;
    let tangentZ = dx / radius;
    let targetRadius = maxf(params.sim1.x, 0.08);
    let radialError = radius - targetRadius;
    let orbitForce = params.sim1.y * maxf(params.sim1.x, 0.12) * 0.85;
    velocity.x = velocity.x + (tangentX * orbitForce - (dx / radius) * radialError * 3.2) * dt;
    velocity.z = velocity.z + (tangentZ * orbitForce - (dz / radius) * radialError * 3.2) * dt;
  }

  if (params.sim1.z > 0.0) {
    let phase = particle.misc.x + age * 3.2;
    velocity.x = velocity.x + sin(phase + position.z * 2.5) * params.sim1.z * 0.02 * dt;
    velocity.y = velocity.y + cos(phase * 0.65 + position.x * 1.6) * params.sim1.z * 0.012 * dt;
    velocity.z = velocity.z + sin(phase * 1.17 + position.y * 1.8) * params.sim1.z * 0.02 * dt;
  }

  let dragFactor = maxf(0.0, 1.0 - params.sim0.y * dt);
  velocity = velocity * dragFactor;
  velocity.y = velocity.y - params.sim0.z * dt + params.sim0.w * dt;
  position = position + velocity * dt;

  particle.position = vec4f(position, 1.0);
  particle.velocity = vec4f(velocity, 0.0);
  particle.timing.x = age;
  particle.extra.x = particle.extra.x + particle.extra.y * dt;

  particles[index] = particle;
}
`;

function scaleConfig(config: EmitterPreviewConfig, uniformScale: number | undefined): EmitterPreviewConfig {
  const scale = Math.max(0.0001, uniformScale ?? 1);

  return {
    ...config,
    orbitRadius: config.orbitRadius * scale,
    sizeEnd: config.sizeEnd * scale,
    sizeStart: config.sizeStart * scale,
    spawnOffsetX: config.spawnOffsetX * scale,
    spawnOffsetY: config.spawnOffsetY * scale,
    spawnOffsetZ: config.spawnOffsetZ * scale,
    spawnRadius: config.spawnRadius * scale,
    spawnRandomX: config.spawnRandomX * scale,
    spawnRandomY: config.spawnRandomY * scale,
    spawnRandomZ: config.spawnRandomZ * scale
  };
}

function spawnParticleData(cfg: EmitterPreviewConfig, target: Float32Array, particleIndex: number, origin = new THREE.Vector3()) {
  const offset = particleIndex * PARTICLE_FLOATS;
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

  target[offset + PARTICLE_INDEX.positionX] =
    origin.x + cfg.spawnOffsetX + (ringRadius > 0 ? radialX * ringJitter : 0) + (Math.random() * 2 - 1) * cfg.spawnRandomX;
  target[offset + PARTICLE_INDEX.positionY] =
    origin.y + cfg.spawnOffsetY + (Math.random() * 2 - 1) * cfg.spawnRandomY;
  target[offset + PARTICLE_INDEX.positionZ] =
    origin.z + cfg.spawnOffsetZ + (ringRadius > 0 ? radialZ * ringJitter : 0) + (Math.random() * 2 - 1) * cfg.spawnRandomZ;
  target[offset + PARTICLE_INDEX.velocityX] =
    cosA * Math.cos(azimuth) * speed * (ringRadius > 0 ? 0.18 : 1) + tangentX * tangentialSpeed + radialX * radialSpeed;
  target[offset + PARTICLE_INDEX.velocityY] = sinA * speed * (ringRadius > 0 ? 0.14 : 1) + cfg.upwardDrift * 0.12;
  target[offset + PARTICLE_INDEX.velocityZ] =
    cosA * Math.sin(azimuth) * speed * (ringRadius > 0 ? 0.18 : 1) + tangentZ * tangentialSpeed + radialZ * radialSpeed;
  target[offset + PARTICLE_INDEX.age] = 0;
  target[offset + PARTICLE_INDEX.lifetime] = cfg.lifetime * (0.8 + Math.random() * 0.5);
  target[offset + PARTICLE_INDEX.sizeStart] = cfg.sizeStart * (0.75 + Math.random() * 0.5);
  target[offset + PARTICLE_INDEX.sizeEnd] = cfg.sizeEnd;
  target[offset + PARTICLE_INDEX.rotation] = 0;
  target[offset + PARTICLE_INDEX.rotationSpeed] = 0;
  target[offset + PARTICLE_INDEX.alive] = 1;
  target[offset + PARTICLE_INDEX.frame] =
    cfg.isSmoke && cfg.flipbook.enabled && cfg.flipbook.rows * cfg.flipbook.cols > 1
      ? Math.floor(Math.random() * Math.max(1, cfg.flipbook.rows * cfg.flipbook.cols))
      : 0;
  target[offset + PARTICLE_INDEX.seed] = Math.random() * 1000;
}

export async function createThreeWebGpuPreviewRuntime(
  input: CreateThreeWebGpuPreviewControllerInput
): Promise<ThreeWebGpuPreviewRuntime> {
  const device = ((input.renderer as unknown as { backend?: { device?: any } }).backend?.device);
  const context = input.renderer.domElement.getContext("webgpu") as any;
  if (!device) {
    throw new Error("Failed to access the underlying WebGPU device from the provided Three WebGPURenderer.");
  }
  if (!context) {
    throw new Error("Failed to access the canvas WebGPU context from the provided Three WebGPURenderer.");
  }

  const smokeRenderer = await createPreviewGpuSmokeRenderer({ device, renderer: input.renderer });
  const spriteGpuRenderer = await createPreviewGpuSpriteRenderer({ device, renderer: input.renderer });
  const shaderModule = device.createShaderModule({ code: COMPUTE_SHADER_CODE, label: "vfx-preview-sim" });
  const computePipeline = await device.createComputePipelineAsync({
    label: "vfx-preview-sim-pipeline",
    layout: "auto",
    compute: {
      module: shaderModule,
      entryPoint: "main"
    }
  });

  let disposed = false;
  let currentState: ThreeWebGpuPreviewState | null = null;
  let previousResetVersion = -1;
  let previousFireVersion = -1;
  let previousConfigKey = "";
  let elapsedPreviewSeconds = 0;
  let rebuildVersion = 0;
  const entries = new Map<string, RuntimeEntry>();

  function resolveOrigin() {
    const position = currentState?.world?.position;
    return new THREE.Vector3(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0);
  }

  function destroyEntry(entry: RuntimeEntry) {
    if (entry.smokeRender) {
      smokeRenderer.destroyEmitterResources(entry.smokeRender);
    }
    if (entry.spriteGpuRender) {
      spriteGpuRenderer.destroyEmitterResources(entry.spriteGpuRender);
    }
    entry.gpu.particleBuffer.destroy();
    entry.gpu.readBuffers.forEach((buffer) => buffer.destroy());
    entry.gpu.uniformBuffer.destroy();
  }

  async function rebuildEntries(configs: EmitterPreviewConfig[]) {
    const nextRebuildVersion = rebuildVersion + 1;
    rebuildVersion = nextRebuildVersion;
    const resolvedTextures = await Promise.all(
      configs.map(async (config) => ({
        config,
        textureSource: await loadPreviewTextureSource(config.textureId)
      }))
    );

    if (disposed || rebuildVersion !== nextRebuildVersion) {
      return;
    }

    entries.forEach((entry) => destroyEntry(entry));
    entries.clear();

    for (const { config, textureSource } of resolvedTextures) {
      const renderMode = config.isSmoke ? "smoke-gpu" : "sprite-gpu";
      const requiresReadback = config.deathEventIds.length > 0;
      const particleData = new Float32Array(config.maxParticleCount * PARTICLE_FLOATS);
      const particleBuffer = device.createBuffer({
        label: `vfx-preview-particles-${config.emitterId}`,
        size: particleData.byteLength,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC | GPU_BUFFER_USAGE.COPY_DST
      });
      const readbackSlots = requiresReadback
        ? Array.from({ length: PREVIEW_READBACK_BUFFER_COUNT }, (_, index) => ({
            buffer: device.createBuffer({
              label: `vfx-preview-read-${config.emitterId}-${index}`,
              size: particleData.byteLength,
              usage: GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.MAP_READ
            }),
            pending: false,
            sequence: 0
          }))
        : [];
      const uniformBuffer = device.createBuffer({
        label: `vfx-preview-uniform-${config.emitterId}`,
        size: 112,
        usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST
      });
      const bindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: particleBuffer } },
          { binding: 1, resource: { buffer: uniformBuffer } }
        ]
      });

      entries.set(config.emitterId, {
        accumulator: 0,
        config,
        gpu: { bindGroup, particleBuffer, readBuffers: readbackSlots.map((slot) => slot.buffer), uniformBuffer },
        particleData,
        previousAlive: new Uint8Array(config.maxParticleCount),
        renderMode,
        requiresReadback,
        nextSpawnSlot: 0,
        smokeSpawnCursor: 0,
        smokeStartupRemaining: config.startupBurstCount,
        smokeRender: renderMode === "smoke-gpu" ? smokeRenderer.createEmitterResources(config, particleBuffer, textureSource) : undefined,
        spriteGpuRender: renderMode === "sprite-gpu" ? spriteGpuRenderer.createEmitterResources(config, particleBuffer, textureSource) : undefined,
        readbackCooldownSeconds: 0,
        readbackSlots,
        nextReadbackSlot: 0,
        lastScheduledReadbackSequence: 0,
        lastAppliedReadbackSequence: 0,
        lastAppliedReadbackAtSeconds: 0,
        dirty: true
      });
    }

    resetSimulation();
  }

  function getFreeParticleSlots(entry: RuntimeEntry, desiredCount: number) {
    const slots: number[] = [];
    for (let index = 0; index < desiredCount; index += 1) {
      slots.push(entry.nextSpawnSlot);
      entry.nextSpawnSlot = (entry.nextSpawnSlot + 1) % entry.config.maxParticleCount;
    }
    return slots;
  }

  function spawnIntoEmitter(entry: RuntimeEntry, count: number, origin = resolveOrigin()) {
    const resolvedCount = entry.config.isSmoke ? Math.max(count * 3, 6) : count;
    const slots = getFreeParticleSlots(entry, resolvedCount);
    for (const slot of slots) {
      spawnParticleData(entry.config, entry.particleData, slot, origin);
      entry.previousAlive[slot] = 1;
      entry.dirty = true;
    }
  }

  function emitEvent(eventId: string, origin = resolveOrigin()) {
    for (const entry of entries.values()) {
      const count = entry.config.eventBursts
        .filter((burst) => burst.eventId === eventId)
        .reduce((sum, burst) => sum + burst.count, 0);
      if (count > 0) {
        spawnIntoEmitter(entry, count, origin);
      }
    }
  }

  function triggerStartupBursts() {
    const origin = resolveOrigin();
    for (const entry of entries.values()) {
      if (entry.config.startupBurstCount > 0) {
        spawnIntoEmitter(entry, entry.config.startupBurstCount, origin);
      }
    }
  }

  function fireManualBurst() {
    if (!currentState) {
      return;
    }

    if (currentState.selectedEventId) {
      emitEvent(currentState.selectedEventId);
      return;
    }

    for (const entry of entries.values()) {
      entry.smokeStartupRemaining += entry.config.startupBurstCount;
      if (entry.config.startupBurstCount > 0) {
        spawnIntoEmitter(entry, entry.config.startupBurstCount);
      }
      entry.config.eventBursts.forEach((burst) => emitEvent(burst.eventId));
    }
  }

  function resetSimulation() {
    elapsedPreviewSeconds = 0;
    for (const entry of entries.values()) {
      entry.particleData.fill(0);
      entry.previousAlive.fill(0);
      entry.accumulator = 0;
      entry.readbackCooldownSeconds = 0;
      entry.nextReadbackSlot = 0;
      entry.nextSpawnSlot = 0;
      entry.smokeSpawnCursor = 0;
      entry.smokeStartupRemaining = entry.config.startupBurstCount;
      entry.lastScheduledReadbackSequence = 0;
      entry.lastAppliedReadbackSequence = 0;
      entry.lastAppliedReadbackAtSeconds = 0;
      entry.readbackSlots.forEach((slot) => {
        slot.pending = false;
        slot.sequence = 0;
      });
      entry.dirty = true;
    }
    triggerStartupBursts();
  }

  function processReadback(entry: RuntimeEntry, copy: ArrayBuffer, sequence: number, resolvedAtSeconds: number) {
    if (sequence <= entry.lastAppliedReadbackSequence) {
      return;
    }

    const next = new Float32Array(copy);
    const smokeBursts: Array<{ eventId: string; origin: THREE.Vector3 }> = [];

    for (let index = 0; index < entry.config.maxParticleCount; index += 1) {
      const offset = index * PARTICLE_FLOATS;
      const nextAlive = next[offset + PARTICLE_INDEX.alive] > 0.5 ? 1 : 0;
      const previousAlive = entry.previousAlive[index] ?? 0;
      if (previousAlive === 1 && nextAlive === 0) {
        const origin = new THREE.Vector3(
          next[offset + PARTICLE_INDEX.positionX],
          next[offset + PARTICLE_INDEX.positionY],
          next[offset + PARTICLE_INDEX.positionZ]
        );
        entry.config.deathEventIds.forEach((eventId) => {
          smokeBursts.push({ eventId, origin });
        });
      }
      entry.previousAlive[index] = nextAlive;
    }

    entry.particleData.set(next);
    entry.lastAppliedReadbackSequence = sequence;
    entry.lastAppliedReadbackAtSeconds = resolvedAtSeconds;
    smokeBursts.forEach((burst) => emitEvent(burst.eventId, burst.origin));
  }

  function dispatchCompute(entry: RuntimeEntry, deltaTime: number, spawnStart = 0, spawnCount = 0, nowSeconds = 0) {
    const params = new ArrayBuffer(112);
    const floatView = new Float32Array(params);
    const uintView = new Uint32Array(params);
    floatView[0] = deltaTime;
    floatView[1] = entry.config.drag;
    floatView[2] = entry.config.gravity;
    floatView[3] = entry.config.upwardDrift;
    floatView[4] = entry.config.orbitRadius;
    floatView[5] = entry.config.orbitAngularSpeed;
    floatView[6] = entry.config.curlStrength;
    floatView[7] = nowSeconds;
    floatView[8] = entry.config.spreadRadians;
    floatView[9] = entry.config.speedMin;
    floatView[10] = entry.config.speedMax;
    floatView[11] = entry.config.spawnRadius;
    floatView[12] = entry.config.lifetime;
    floatView[13] = entry.config.sizeStart;
    floatView[14] = entry.config.sizeEnd;
    floatView[15] = Math.max(1, entry.config.flipbook.rows * entry.config.flipbook.cols);
    floatView[16] = entry.config.spawnOffsetX;
    floatView[17] = entry.config.spawnOffsetY;
    floatView[18] = entry.config.spawnOffsetZ;
    floatView[19] = 0;
    floatView[20] = entry.config.spawnRandomX;
    floatView[21] = entry.config.spawnRandomY;
    floatView[22] = entry.config.spawnRandomZ;
    floatView[23] = 0;
    uintView[24] = spawnStart;
    uintView[25] = spawnCount;
    uintView[26] = entry.config.maxParticleCount;
    uintView[27] = entry.renderMode === "smoke-gpu" ? 1 : 0;
    device.queue.writeBuffer(entry.gpu.uniformBuffer, 0, params);

    if (entry.dirty) {
      device.queue.writeBuffer(
        entry.gpu.particleBuffer,
        0,
        entry.particleData.buffer,
        entry.particleData.byteOffset,
        entry.particleData.byteLength
      );
      entry.dirty = false;
    }

    const encoder = device.createCommandEncoder({ label: `vfx-preview-dispatch-${entry.config.emitterId}` });
    const pass = encoder.beginComputePass();
    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, entry.gpu.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(entry.config.maxParticleCount / WORKGROUP_SIZE));
    pass.end();

    if (!entry.requiresReadback) {
      device.queue.submit([encoder.finish()]);
      return;
    }

    entry.readbackCooldownSeconds = Math.max(0, entry.readbackCooldownSeconds - deltaTime);
    const selectedSlot = entry.readbackSlots[entry.nextReadbackSlot];
    const canScheduleReadback = entry.readbackCooldownSeconds <= 0 && selectedSlot && !selectedSlot.pending;

    if (canScheduleReadback) {
      const readbackSequence = entry.lastScheduledReadbackSequence + 1;
      entry.lastScheduledReadbackSequence = readbackSequence;
      selectedSlot.sequence = readbackSequence;
      encoder.copyBufferToBuffer(entry.gpu.particleBuffer, 0, selectedSlot.buffer, 0, entry.particleData.byteLength);
      selectedSlot.pending = true;
      entry.nextReadbackSlot = (entry.nextReadbackSlot + 1) % entry.readbackSlots.length;
      entry.readbackCooldownSeconds = PREVIEW_READBACK_INTERVAL_SECONDS;
    }

    device.queue.submit([encoder.finish()]);

    if (canScheduleReadback && selectedSlot) {
      selectedSlot.buffer.mapAsync(GPU_MAP_MODE.READ).then(() => {
        if (disposed) {
          return;
        }
        const copy = selectedSlot.buffer.getMappedRange().slice(0);
        selectedSlot.buffer.unmap();
        selectedSlot.pending = false;
        processReadback(entry, copy, selectedSlot.sequence, performance.now() / 1000);
      }).catch(() => {
        selectedSlot.pending = false;
      });
    }
  }

  function updateState(next: ThreeWebGpuPreviewState) {
    currentState = next;
    const activeEmitterIds = resolveActiveEmitterIds(next.document);
    const effectiveActiveIds = next.soloSelected && next.selectedEmitterId ? new Set([next.selectedEmitterId]) : activeEmitterIds;
    const configs = buildEmitterPreviewConfigs(next.document, next.compileResult, effectiveActiveIds)
      .map((config) => scaleConfig(config, next.world?.uniformScale));
    const configKey = JSON.stringify(configs.map((config) => ({
      emitterId: config.emitterId,
      startupBurstCount: config.startupBurstCount,
      eventBursts: config.eventBursts,
      deathEventIds: config.deathEventIds,
      rate: config.rate,
      drag: config.drag,
      gravity: config.gravity,
      upwardDrift: config.upwardDrift,
      spawnOffsetX: config.spawnOffsetX,
      spawnOffsetY: config.spawnOffsetY,
      spawnOffsetZ: config.spawnOffsetZ,
      spawnRandomX: config.spawnRandomX,
      spawnRandomY: config.spawnRandomY,
      spawnRandomZ: config.spawnRandomZ,
      orbitRadius: config.orbitRadius,
      orbitAngularSpeed: config.orbitAngularSpeed,
      curlStrength: config.curlStrength,
      lifetime: config.lifetime,
      sizeStart: config.sizeStart,
      sizeEnd: config.sizeEnd,
      additive: config.additive,
      color: config.color.getHexString(),
      textureId: config.textureId,
      flipbook: config.flipbook,
      maxParticleCount: config.maxParticleCount,
      uniformScale: next.world?.uniformScale ?? 1
    })));

    if (configKey !== previousConfigKey) {
      previousConfigKey = configKey;
      void rebuildEntries(configs);
    }

    if ((next.resetVersion ?? 0) !== previousResetVersion) {
      previousResetVersion = next.resetVersion ?? 0;
      resetSimulation();
    }

    if ((next.fireVersion ?? 0) !== previousFireVersion) {
      previousFireVersion = next.fireVersion ?? 0;
      fireManualBurst();
    }
  }

  return {
    update(next) {
      updateState(next);
    },
    step(deltaSeconds, nowSeconds) {
      if (disposed || currentState?.isPlaying === false) {
        return;
      }

      elapsedPreviewSeconds += deltaSeconds;
      const previewDurationSeconds = currentState?.document.preview.durationSeconds ?? 0;
      const shouldLoop = currentState?.document.preview.loop === true && previewDurationSeconds > 0;
      if (shouldLoop && elapsedPreviewSeconds >= previewDurationSeconds) {
        resetSimulation();
      }

      for (const entry of entries.values()) {
        const sustainableRate = Math.min(
          entry.config.rate,
          (entry.config.maxParticleCount / Math.max(entry.config.lifetime, 0.001)) * 0.82
        );
        entry.accumulator += sustainableRate * deltaSeconds;
        let scheduledSpawnCount = Math.floor(entry.accumulator);
        entry.accumulator -= scheduledSpawnCount;

        if (entry.smokeStartupRemaining > 0) {
          const startupChunk = Math.min(entry.smokeStartupRemaining, 10);
          scheduledSpawnCount += startupChunk;
          entry.smokeStartupRemaining -= startupChunk;
        }

        const resolvedSpawnCount = Math.min(scheduledSpawnCount, entry.config.maxParticleCount);
        const spawnStart = entry.smokeSpawnCursor;
        entry.smokeSpawnCursor = (entry.smokeSpawnCursor + resolvedSpawnCount) % entry.config.maxParticleCount;
        dispatchCompute(entry, deltaSeconds, spawnStart, resolvedSpawnCount, nowSeconds);
      }
    },
    renderToCurrentTexture(nowSeconds) {
      if (disposed) {
        return;
      }

      const smokeEntries: Array<{ config: EmitterPreviewConfig; smokeRender: NonNullable<RuntimeEntry["smokeRender"]> }> = [];
      const spriteGpuEntries: Array<{ config: EmitterPreviewConfig; spriteGpuRender: NonNullable<RuntimeEntry["spriteGpuRender"]>; instanceCount: number }> = [];
      let totalParticles = 0;

      for (const entry of entries.values()) {
        if (entry.renderMode === "smoke-gpu" && entry.smokeRender) {
          smokeEntries.push({ config: entry.config, smokeRender: entry.smokeRender });
        } else if (entry.renderMode === "sprite-gpu" && entry.spriteGpuRender) {
          spriteGpuEntries.push({ config: entry.config, spriteGpuRender: entry.spriteGpuRender, instanceCount: entry.config.maxParticleCount });
        }

        totalParticles += Math.min(entry.config.maxParticleCount, Math.round(entry.config.rate * entry.config.lifetime + entry.config.startupBurstCount));
      }

      input.onParticleCountChange?.(totalParticles);
      const targetView = context.getCurrentTexture().createView();
      smokeRenderer.render(input.camera, targetView, smokeEntries, nowSeconds);
      spriteGpuRenderer.render(input.camera, targetView, spriteGpuEntries, nowSeconds);
    },
    dispose() {
      disposed = true;
      entries.forEach((entry) => destroyEntry(entry));
      smokeRenderer.dispose();
      spriteGpuRenderer.dispose();
    }
  };
}