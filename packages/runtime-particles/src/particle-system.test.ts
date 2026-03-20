import { describe, expect, test } from "bun:test";
import { vec3 } from "@ggez/shared";
import { createEmitterState, updateEmitter, spawnParticle } from "./particle-pool";
import { createParticleSystem } from "./particle-system";
import type { ResolvedEmitterConfig } from "./types";

function defaultConfig(overrides: Partial<ResolvedEmitterConfig> = {}): ResolvedEmitterConfig {
  return {
    billboard: true,
    blending: "additive",
    burst: 0,
    direction: vec3(0, 1, 0),
    emissionRate: 10,
    endColor: [1, 1, 1],
    endOpacity: 0,
    endSize: 0,
    gravity: vec3(0, -9.8, 0),
    lifetime: 2,
    lifetimeVariance: 0,
    maxParticles: 100,
    speed: 5,
    speedVariance: 0,
    spread: 0,
    startColor: [1, 1, 1],
    startOpacity: 1,
    startSize: 0.1,
    texture: "",
    ...overrides
  };
}

describe("ParticlePool", () => {
  test("spawns particles at emission rate", () => {
    const config = defaultConfig({ emissionRate: 10 });
    const state = createEmitterState("test", config, vec3(0, 0, 0));

    updateEmitter(state, 1);

    expect(state.particles.length).toBe(10);
  });

  test("particles age and die", () => {
    const config = defaultConfig({ emissionRate: 100, lifetime: 0.5, lifetimeVariance: 0 });
    const state = createEmitterState("test", config, vec3(0, 0, 0));

    updateEmitter(state, 0.1);
    expect(state.particles.length).toBeGreaterThan(0);

    updateEmitter(state, 0.5);

    const aliveFromFirstBatch = state.particles.filter((p) => p.age >= 0.6).length;
    expect(aliveFromFirstBatch).toBe(0);
  });

  test("particles move with velocity and gravity", () => {
    const config = defaultConfig({
      direction: vec3(0, 1, 0),
      emissionRate: 10,
      gravity: vec3(0, -10, 0),
      lifetime: 5,
      lifetimeVariance: 0,
      speed: 10,
      speedVariance: 0,
      spread: 0
    });
    const state = createEmitterState("test", config, vec3(0, 0, 0));

    updateEmitter(state, 0.1);
    expect(state.particles.length).toBeGreaterThan(0);

    updateEmitter(state, 0.5);

    const movedParticle = state.particles.find((p) => p.age > 0.4);
    expect(movedParticle).toBeDefined();
    expect(movedParticle!.position.y).toBeGreaterThan(0);
    expect(movedParticle!.velocity.y).toBeLessThan(10);
  });

  test("respects maxParticles limit", () => {
    const config = defaultConfig({ emissionRate: 1000, maxParticles: 5 });
    const state = createEmitterState("test", config, vec3(0, 0, 0));

    updateEmitter(state, 1);

    expect(state.particles.length).toBeLessThanOrEqual(5);
  });

  test("burst mode emits all at once then stops", () => {
    const config = defaultConfig({ burst: 20, emissionRate: 0 });
    const state = createEmitterState("test", config, vec3(0, 0, 0));

    updateEmitter(state, 0.016);

    expect(state.particles.length).toBe(20);
    expect(state.active).toBe(false);

    const countAfterBurst = state.particles.length;
    updateEmitter(state, 0.016);

    expect(state.particles.length).toBeLessThanOrEqual(countAfterBurst);
  });

  test("spawnParticle creates particle at origin", () => {
    const config = defaultConfig();
    const origin = vec3(5, 10, 15);
    const particle = spawnParticle(config, origin);

    expect(particle.position.x).toBe(5);
    expect(particle.position.y).toBe(10);
    expect(particle.position.z).toBe(15);
    expect(particle.age).toBe(0);
    expect(particle.lifetime).toBeGreaterThan(0);
  });

  test("in-place mutation does not create new vec3 objects", () => {
    const config = defaultConfig({
      emissionRate: 10,
      gravity: vec3(0, -10, 0),
      lifetime: 5,
      lifetimeVariance: 0,
      speed: 10,
      speedVariance: 0,
      spread: 0
    });
    const state = createEmitterState("test", config, vec3(0, 0, 0));

    updateEmitter(state, 1);
    expect(state.particles.length).toBeGreaterThan(0);

    const posRef = state.particles[0].position;
    const velRef = state.particles[0].velocity;

    updateEmitter(state, 0.1);

    expect(state.particles[0].position).toBe(posRef);
    expect(state.particles[0].velocity).toBe(velRef);
  });
});

describe("ParticleSystem", () => {
  test("creates and manages emitters", () => {
    const system = createParticleSystem();

    system.start([
      {
        config: { autoplay: true, emissionRate: 10, lifetime: 1, maxParticles: 50 },
        enabled: true,
        hookId: "hook:particle:1",
        targetId: "node:fire"
      }
    ]);

    system.update(0.5, () => vec3(0, 0, 0));
    const states = system.getEmitterStates();

    expect(states.size).toBe(1);
    const emitter = states.get("hook:particle:1");
    expect(emitter).toBeDefined();
    expect(emitter!.particles.length).toBeGreaterThan(0);

    system.dispose();
  });

  test("disabled hooks are skipped", () => {
    const system = createParticleSystem();

    system.start([
      {
        config: { autoplay: true, emissionRate: 10 },
        enabled: false,
        hookId: "hook:particle:1",
        targetId: "node:smoke"
      }
    ]);

    const states = system.getEmitterStates();
    expect(states.size).toBe(0);

    system.dispose();
  });

  test("non-autoplay emitters start inactive", () => {
    const system = createParticleSystem();

    system.start([
      {
        config: { autoplay: false, emissionRate: 10, lifetime: 1 },
        enabled: true,
        hookId: "hook:particle:1",
        targetId: "node:explosion"
      }
    ]);

    system.update(1, () => vec3(0, 0, 0));
    const states = system.getEmitterStates();
    const emitter = states.get("hook:particle:1");

    expect(emitter).toBeDefined();
    expect(emitter!.particles.length).toBe(0);

    system.dispose();
  });

  test("handleEvent activates emitters on matching trigger", () => {
    const system = createParticleSystem();

    system.start([
      {
        config: { autoplay: false, emissionRate: 50, lifetime: 2, triggerEvent: "explode" },
        enabled: true,
        hookId: "hook:particle:1",
        targetId: "node:bomb"
      }
    ]);

    system.update(0.5, () => vec3(0, 0, 0));
    expect(system.getEmitterStates().get("hook:particle:1")!.particles.length).toBe(0);

    system.handleEvent("explode");
    system.update(0.5, () => vec3(0, 0, 0));

    expect(system.getEmitterStates().get("hook:particle:1")!.particles.length).toBeGreaterThan(0);

    system.dispose();
  });

  test("handleEvent stops emitters on matching stop event", () => {
    const system = createParticleSystem();

    system.start([
      {
        config: { autoplay: true, emissionRate: 50, lifetime: 10, stopEvent: "quench" },
        enabled: true,
        hookId: "hook:particle:1",
        targetId: "node:fire"
      }
    ]);

    system.update(0.5, () => vec3(0, 0, 0));
    expect(system.getEmitterStates().get("hook:particle:1")!.active).toBe(true);

    system.handleEvent("quench");
    expect(system.getEmitterStates().get("hook:particle:1")!.active).toBe(false);

    system.dispose();
  });

  test("host callbacks are invoked", () => {
    const created: string[] = [];
    const updated: string[] = [];
    const destroyed: string[] = [];

    const system = createParticleSystem({
      createEmitter: (id) => created.push(id),
      destroyEmitter: (id) => destroyed.push(id),
      updateEmitter: (id) => updated.push(id)
    });

    system.start([
      {
        config: { autoplay: true, emissionRate: 10 },
        enabled: true,
        hookId: "hook:particle:1",
        targetId: "node:fx"
      }
    ]);

    expect(created).toEqual(["hook:particle:1"]);

    system.update(0.1, () => vec3(0, 0, 0));
    expect(updated).toEqual(["hook:particle:1"]);

    system.dispose();
    expect(destroyed).toEqual(["hook:particle:1"]);
  });
});
