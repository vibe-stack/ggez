import type { Vec3 } from "@ggez/shared";

export type ParticleEmitterConfig = {
  billboard?: boolean;
  blending?: "additive" | "normal";
  burst?: number;
  direction?: Vec3;
  emissionRate?: number;
  endColor?: string;
  endOpacity?: number;
  endSize?: number;
  gravity?: Vec3;
  lifetime?: number;
  lifetimeVariance?: number;
  maxParticles?: number;
  speed?: number;
  speedVariance?: number;
  spread?: number;
  startColor?: string;
  startOpacity?: number;
  startSize?: number;
  texture?: string;
};

export type Particle = {
  age: number;
  lifetime: number;
  position: Vec3;
  velocity: Vec3;
};

export type ParticleEmitterState = {
  active: boolean;
  config: ResolvedEmitterConfig;
  emitterId: string;
  origin: Vec3;
  particles: Particle[];
  timeSinceEmission: number;
};

export type ResolvedEmitterConfig = {
  billboard: boolean;
  blending: "additive" | "normal";
  burst: number;
  direction: Vec3;
  emissionRate: number;
  endColor: [number, number, number];
  endOpacity: number;
  endSize: number;
  gravity: Vec3;
  lifetime: number;
  lifetimeVariance: number;
  maxParticles: number;
  speed: number;
  speedVariance: number;
  spread: number;
  startColor: [number, number, number];
  startOpacity: number;
  startSize: number;
  texture: string;
};
