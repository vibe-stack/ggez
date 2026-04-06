import * as THREE from "three";
import { buildEmitterPreviewConfigs, resolveActiveEmitterIds } from "./extraction";
import { evaluatePreviewAlpha, evaluatePreviewColor, evaluatePreviewSize } from "./evaluation";
import { createPreviewThreeScene } from "./scene";
import { createPreviewSprite, makePreviewSpriteTexture } from "./textures";
import {
  GPU_BUFFER_USAGE,
  GPU_MAP_MODE,
  PARTICLE_FLOATS,
  PARTICLE_INDEX,
  WORKGROUP_SIZE,
  type CreateThreeWebGpuPreviewControllerInput,
  type EmitterPreviewConfig,
  type EmitterPreviewEntry,
  type ThreeWebGpuPreviewController,
  type ThreeWebGpuPreviewState
} from "./types";

const COMPUTE_SHADER_CODE = /* wgsl */ `
struct Particle {
  position : vec4f,
  velocity : vec4f,
  meta : vec4f,
  extra : vec4f,
  misc : vec4f,
}

struct SimParams {
  deltaTime : f32,
  drag : f32,
  gravity : f32,
  upwardDrift : f32,
  orbitRadius : f32,
  orbitAngularSpeed : f32,
  curlStrength : f32,
  maxParticles : u32,
}

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> params : SimParams;

fn maxf(a: f32, b: f32) -> f32 {
  return select(b, a, a > b);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let index = gid.x;
  if (index >= params.maxParticles) {
    return;
  }

  var particle = particles[index];
  if (particle.extra.z < 0.5) {
    return;
  }

  let dt = params.deltaTime;
  var age = particle.meta.x + dt;
  if (age >= particle.meta.y) {
    particle.meta.x = age;
    particle.extra.z = 0.0;
    particles[index] = particle;
    return;
  }

  var position = particle.position.xyz;
  var velocity = particle.velocity.xyz;

  if (params.orbitRadius > 0.0 || abs(params.orbitAngularSpeed) > 0.0001) {
    let dx = position.x;
    let dz = position.z;
    let radius = maxf(0.0001, sqrt(dx * dx + dz * dz));
    let tangentX = -dz / radius;
    let tangentZ = dx / radius;
    let targetRadius = maxf(params.orbitRadius, 0.08);
    let radialError = radius - targetRadius;
    let orbitForce = params.orbitAngularSpeed * maxf(params.orbitRadius, 0.12) * 0.85;
    velocity.x = velocity.x + (tangentX * orbitForce - (dx / radius) * radialError * 3.2) * dt;
    velocity.z = velocity.z + (tangentZ * orbitForce - (dz / radius) * radialError * 3.2) * dt;
  }

  if (params.curlStrength > 0.0) {
    let phase = particle.misc.x + age * 3.2;
    velocity.x = velocity.x + sin(phase + position.z * 2.5) * params.curlStrength * 0.02 * dt;
    velocity.y = velocity.y + cos(phase * 0.65 + position.x * 1.6) * params.curlStrength * 0.012 * dt;
    velocity.z = velocity.z + sin(phase * 1.17 + position.y * 1.8) * params.curlStrength * 0.02 * dt;
  }

  let dragFactor = maxf(0.0, 1.0 - params.drag * dt);
  velocity = velocity * dragFactor;
  velocity.y = velocity.y - params.gravity * dt + params.upwardDrift * dt;
  position = position + velocity * dt;

  particle.position = vec4f(position, 1.0);
  particle.velocity = vec4f(velocity, 0.0);
  particle.meta.x = age;
  particle.extra.x = particle.extra.x + particle.extra.y * dt;

  particles[index] = particle;
}
`;

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

  target[offset + PARTICLE_INDEX.positionX] = origin.x + (ringRadius > 0 ? radialX * ringJitter : (Math.random() - 0.5) * 0.12);
  target[offset + PARTICLE_INDEX.positionY] = origin.y + (Math.random() - 0.5) * (cfg.isSmoke ? 0.08 : 0.12);
  target[offset + PARTICLE_INDEX.positionZ] = origin.z + (ringRadius > 0 ? radialZ * ringJitter : (Math.random() - 0.5) * 0.12);
  target[offset + PARTICLE_INDEX.velocityX] =
    cosA * Math.cos(azimuth) * speed * (ringRadius > 0 ? 0.18 : 1) + tangentX * tangentialSpeed + radialX * radialSpeed;
  target[offset + PARTICLE_INDEX.velocityY] = sinA * speed * (ringRadius > 0 ? 0.14 : 1) + cfg.upwardDrift * 0.12;
  target[offset + PARTICLE_INDEX.velocityZ] =
    cosA * Math.sin(azimuth) * speed * (ringRadius > 0 ? 0.18 : 1) + tangentZ * tangentialSpeed + radialZ * radialSpeed;
  target[offset + PARTICLE_INDEX.age] = 0;
  target[offset + PARTICLE_INDEX.lifetime] = cfg.lifetime * (0.8 + Math.random() * 0.5);
  target[offset + PARTICLE_INDEX.sizeStart] = cfg.sizeStart * (0.75 + Math.random() * 0.5);
  target[offset + PARTICLE_INDEX.sizeEnd] = cfg.sizeEnd;
  target[offset + PARTICLE_INDEX.rotation] = Math.random() * Math.PI * 2;
  target[offset + PARTICLE_INDEX.rotationSpeed] =
    (cfg.isSmoke ? 0.22 : 1.7) * (0.6 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1);
  target[offset + PARTICLE_INDEX.alive] = 1;
  target[offset + PARTICLE_INDEX.frame] = cfg.texturePreset === "smoke" ? Math.floor(Math.random() * 4) : 0;
  target[offset + PARTICLE_INDEX.seed] = Math.random() * 1000;
}

export async function createThreeWebGpuPreviewController(
  input: CreateThreeWebGpuPreviewControllerInput
): Promise<ThreeWebGpuPreviewController> {
  const device = ((input.renderer as unknown as { backend?: { device?: any } }).backend?.device);
  if (!device) {
    throw new Error("Failed to access the underlying WebGPU device from the provided Three WebGPURenderer.");
  }

  const previewScene = createPreviewThreeScene({ mount: input.mount, renderer: input.renderer });
  const shaderModule = device.createShaderModule({ code: COMPUTE_SHADER_CODE, label: "vfx-preview-sim" });
  const computePipeline = device.createComputePipeline({
    label: "vfx-preview-sim-pipeline",
    layout: "auto",
    compute: {
      module: shaderModule,
      entryPoint: "main"
    }
  });

  let disposed = false;
  let rafId = 0;
  let lastTime = performance.now();
  let currentState: ThreeWebGpuPreviewState | null = null;
  let previousResetVersion = -1;
  let previousFireVersion = -1;
  let previousConfigKey = "";
  const entries = new Map<string, EmitterPreviewEntry>();

  previewScene.resize();
  const resizeObserver = new ResizeObserver(() => previewScene.resize());
  resizeObserver.observe(input.mount);

  function destroyEntry(entry: EmitterPreviewEntry) {
    entry.sprites.forEach((sprite) => {
      previewScene.scene.remove(sprite);
      sprite.material.dispose();
    });
    entry.texture.dispose();
    entry.gpu.particleBuffer.destroy();
    entry.gpu.readBuffer.destroy();
    entry.gpu.uniformBuffer.destroy();
  }

  function rebuildEntries(configs: EmitterPreviewConfig[]) {
    entries.forEach((entry) => destroyEntry(entry));
    entries.clear();

    for (const config of configs) {
      const texture = makePreviewSpriteTexture(config.texturePreset).texture;
      const sprites: THREE.Sprite[] = [];
      for (let index = 0; index < config.maxParticleCount; index += 1) {
        const sprite = createPreviewSprite(texture, config.additive);
        previewScene.scene.add(sprite);
        sprites.push(sprite);
      }

      const particleData = new Float32Array(config.maxParticleCount * PARTICLE_FLOATS);
      const particleBuffer = device.createBuffer({
        label: `vfx-preview-particles-${config.emitterId}`,
        size: particleData.byteLength,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC | GPU_BUFFER_USAGE.COPY_DST
      });
      const readBuffer = device.createBuffer({
        label: `vfx-preview-read-${config.emitterId}`,
        size: particleData.byteLength,
        usage: GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.MAP_READ
      });
      const uniformBuffer = device.createBuffer({
        label: `vfx-preview-uniform-${config.emitterId}`,
        size: 32,
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
        gpu: { bindGroup, particleBuffer, readBuffer, uniformBuffer },
        particleData,
        previousAlive: new Uint8Array(config.maxParticleCount),
        sprites,
        texture,
        readbackPending: false,
        dirty: true
      });
    }
  }

  function getFreeParticleSlots(entry: EmitterPreviewEntry, desiredCount: number) {
    const result: number[] = [];
    for (let index = 0; index < entry.config.maxParticleCount && result.length < desiredCount; index += 1) {
      const offset = index * PARTICLE_FLOATS + PARTICLE_INDEX.alive;
      if (entry.particleData[offset] < 0.5) {
        result.push(index);
      }
    }
    return result;
  }

  function spawnIntoEmitter(entry: EmitterPreviewEntry, count: number, origin = new THREE.Vector3()) {
    const resolvedCount = entry.config.isSmoke ? Math.max(count * 3, 6) : count;
    const slots = getFreeParticleSlots(entry, resolvedCount);
    for (const slot of slots) {
      spawnParticleData(entry.config, entry.particleData, slot, origin);
      entry.previousAlive[slot] = 1;
      entry.dirty = true;
    }
  }

  function emitEvent(eventId: string, origin = new THREE.Vector3()) {
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
    for (const entry of entries.values()) {
      if (entry.config.startupBurstCount > 0) {
        spawnIntoEmitter(entry, entry.config.startupBurstCount);
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
      if (entry.config.startupBurstCount > 0) {
        spawnIntoEmitter(entry, entry.config.startupBurstCount);
      }
      entry.config.eventBursts.forEach((burst) => emitEvent(burst.eventId));
    }
  }

  function resetSimulation() {
    for (const entry of entries.values()) {
      entry.particleData.fill(0);
      entry.previousAlive.fill(0);
      entry.accumulator = 0;
      entry.dirty = true;
    }
    triggerStartupBursts();
  }

  function updateSprites(entry: EmitterPreviewEntry) {
    let livingCount = 0;
    for (let index = 0; index < entry.config.maxParticleCount; index += 1) {
      const offset = index * PARTICLE_FLOATS;
      const sprite = entry.sprites[index]!;
      const alive = entry.particleData[offset + PARTICLE_INDEX.alive] > 0.5;
      const material = sprite.material as THREE.SpriteMaterial;
      if (!alive) {
        sprite.visible = false;
        material.opacity = 0;
        continue;
      }

      livingCount += 1;
      const age = entry.particleData[offset + PARTICLE_INDEX.age];
      const lifetime = Math.max(0.0001, entry.particleData[offset + PARTICLE_INDEX.lifetime]);
      const life = Math.min(age / lifetime, 1);
      const alpha = evaluatePreviewAlpha(entry.config.alphaCurve, life, entry.config.isSmoke);
      const size = evaluatePreviewSize(
        entry.config.sizeCurve,
        life,
        entry.particleData[offset + PARTICLE_INDEX.sizeStart],
        entry.particleData[offset + PARTICLE_INDEX.sizeEnd]
      );
      const color = evaluatePreviewColor(entry.config.color, entry.config.colorCurve, life, entry.config.isSmoke);

      sprite.visible = true;
      sprite.position.set(
        entry.particleData[offset + PARTICLE_INDEX.positionX],
        entry.particleData[offset + PARTICLE_INDEX.positionY],
        entry.particleData[offset + PARTICLE_INDEX.positionZ]
      );
      sprite.scale.setScalar(Math.max(0.01, size));
      material.color.copy(color);
      material.opacity = alpha;
      material.rotation = entry.particleData[offset + PARTICLE_INDEX.rotation];
    }
    return livingCount;
  }

  function processReadback(entry: EmitterPreviewEntry, copy: ArrayBuffer) {
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
    smokeBursts.forEach((burst) => emitEvent(burst.eventId, burst.origin));
  }

  function dispatchCompute(entry: EmitterPreviewEntry, deltaTime: number) {
    const params = new ArrayBuffer(32);
    const floatView = new Float32Array(params);
    const uintView = new Uint32Array(params);
    floatView[0] = deltaTime;
    floatView[1] = entry.config.drag;
    floatView[2] = entry.config.gravity;
    floatView[3] = entry.config.upwardDrift;
    floatView[4] = entry.config.orbitRadius;
    floatView[5] = entry.config.orbitAngularSpeed;
    floatView[6] = entry.config.curlStrength;
    uintView[7] = entry.config.maxParticleCount;
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

    if (!entry.readbackPending) {
      encoder.copyBufferToBuffer(entry.gpu.particleBuffer, 0, entry.gpu.readBuffer, 0, entry.particleData.byteLength);
      entry.readbackPending = true;
    }

    device.queue.submit([encoder.finish()]);

    if (entry.readbackPending) {
      entry.gpu.readBuffer.mapAsync(GPU_MAP_MODE.READ).then(() => {
        if (disposed) {
          return;
        }
        const copy = entry.gpu.readBuffer.getMappedRange().slice(0);
        entry.gpu.readBuffer.unmap();
        entry.readbackPending = false;
        processReadback(entry, copy);
      }).catch(() => {
        entry.readbackPending = false;
      });
    }
  }

  function updateState(next: ThreeWebGpuPreviewState) {
    currentState = next;
    const activeEmitterIds = resolveActiveEmitterIds(next.document);
    const effectiveActiveIds = next.soloSelected && next.selectedEmitterId ? new Set([next.selectedEmitterId]) : activeEmitterIds;
    const configs = buildEmitterPreviewConfigs(next.document, next.compileResult, effectiveActiveIds);
    const configKey = JSON.stringify(configs.map((config) => ({
      emitterId: config.emitterId,
      startupBurstCount: config.startupBurstCount,
      eventBursts: config.eventBursts,
      deathEventIds: config.deathEventIds,
      rate: config.rate,
      drag: config.drag,
      gravity: config.gravity,
      upwardDrift: config.upwardDrift,
      orbitRadius: config.orbitRadius,
      orbitAngularSpeed: config.orbitAngularSpeed,
      curlStrength: config.curlStrength,
      lifetime: config.lifetime,
      sizeStart: config.sizeStart,
      sizeEnd: config.sizeEnd,
      additive: config.additive,
      color: config.color.getHexString(),
      texturePreset: config.texturePreset,
      maxParticleCount: config.maxParticleCount
    })));

    if (configKey !== previousConfigKey) {
      previousConfigKey = configKey;
      rebuildEntries(configs);
      resetSimulation();
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

  function tick(now: number) {
    if (disposed) {
      return;
    }

    rafId = window.requestAnimationFrame(tick);
    const deltaTime = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (currentState?.isPlaying !== false) {
      for (const entry of entries.values()) {
        entry.accumulator += entry.config.rate * deltaTime;
        const spawnCount = Math.floor(entry.accumulator);
        entry.accumulator -= spawnCount;
        if (spawnCount > 0) {
          spawnIntoEmitter(entry, spawnCount);
        }
        dispatchCompute(entry, deltaTime);
      }
    }

    previewScene.controls.update();

    let totalParticles = 0;
    for (const entry of entries.values()) {
      totalParticles += updateSprites(entry);
    }
    input.onParticleCountChange?.(totalParticles);

    input.renderer.render(previewScene.scene, previewScene.camera);
  }

  rafId = window.requestAnimationFrame(tick);

  return {
    update(next) {
      updateState(next);
    },
    resize() {
      previewScene.resize();
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      previewScene.dispose();
      entries.forEach((entry) => destroyEntry(entry));
    }
  };
}
