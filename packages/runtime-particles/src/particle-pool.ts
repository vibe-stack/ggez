import { vec3, type Vec3 } from "@ggez/shared";
import type { Particle, ParticleEmitterState, ResolvedEmitterConfig } from "./types";

export function createEmitterState(emitterId: string, config: ResolvedEmitterConfig, origin: Vec3): ParticleEmitterState {
  return {
    active: true,
    config,
    emitterId,
    origin,
    particles: [],
    timeSinceEmission: 0
  };
}

export function updateEmitter(state: ParticleEmitterState, deltaSeconds: number): void {
  let aliveCount = state.particles.length;

  for (let i = aliveCount - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.age += deltaSeconds;

    if (p.age >= p.lifetime) {
      aliveCount -= 1;
      state.particles[i] = state.particles[aliveCount];
      continue;
    }

    p.velocity.x += state.config.gravity.x * deltaSeconds;
    p.velocity.y += state.config.gravity.y * deltaSeconds;
    p.velocity.z += state.config.gravity.z * deltaSeconds;

    p.position.x += p.velocity.x * deltaSeconds;
    p.position.y += p.velocity.y * deltaSeconds;
    p.position.z += p.velocity.z * deltaSeconds;
  }

  state.particles.length = aliveCount;

  if (!state.active) {
    return;
  }

  if (state.config.burst > 0) {
    const count = Math.min(state.config.burst, state.config.maxParticles - aliveCount);

    for (let i = 0; i < count; i += 1) {
      state.particles.push(spawnParticle(state.config, state.origin));
    }

    state.active = false;
    return;
  }

  state.timeSinceEmission += deltaSeconds;
  const interval = 1 / Math.max(0.001, state.config.emissionRate);

  while (state.timeSinceEmission >= interval && state.particles.length < state.config.maxParticles) {
    state.particles.push(spawnParticle(state.config, state.origin));
    state.timeSinceEmission -= interval;
  }
}

export function spawnParticle(config: ResolvedEmitterConfig, origin: Vec3): Particle {
  const speed = config.speed + (Math.random() - 0.5) * 2 * config.speedVariance;
  const lifetime = Math.max(0.01, config.lifetime + (Math.random() - 0.5) * 2 * config.lifetimeVariance);
  const direction = randomConeDirection(config.direction, config.spread);

  return {
    age: 0,
    lifetime,
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed }
  };
}

function randomConeDirection(baseDirection: Vec3, spread: number): Vec3 {
  const len = Math.sqrt(baseDirection.x * baseDirection.x + baseDirection.y * baseDirection.y + baseDirection.z * baseDirection.z);

  if (spread <= 0) {
    if (len < 0.0001) {
      return vec3(0, 1, 0);
    }

    return vec3(baseDirection.x / len, baseDirection.y / len, baseDirection.z / len);
  }

  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * spread;
  const sinPhi = Math.sin(phi);

  const localX = sinPhi * Math.cos(theta);
  const localY = Math.cos(phi);
  const localZ = sinPhi * Math.sin(theta);

  const up = len < 0.0001
    ? vec3(0, 1, 0)
    : vec3(baseDirection.x / len, baseDirection.y / len, baseDirection.z / len);

  const arbitrary = Math.abs(up.y) < 0.999 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const right = normalize(cross(arbitrary, up));
  const forward = cross(up, right);

  return normalize(vec3(
    right.x * localX + up.x * localY + forward.x * localZ,
    right.y * localX + up.y * localY + forward.y * localZ,
    right.z * localX + up.z * localY + forward.z * localZ
  ));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function normalize(v: Vec3): Vec3 {
  const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  if (l < 0.0001) {
    return vec3(0, 1, 0);
  }

  return vec3(v.x / l, v.y / l, v.z / l);
}
