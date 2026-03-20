import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Object3D
} from "three";
import type { ParticleEmitterState, ResolvedEmitterConfig } from "./types";

export type ThreeParticleHost = {
  addEmitter: (emitterId: string, config: ResolvedEmitterConfig) => void;
  dispose: () => void;
  removeEmitter: (emitterId: string) => void;
  update: (emitters: ReadonlyMap<string, ParticleEmitterState>) => void;
};

type EmitterRenderState = {
  config: ResolvedEmitterConfig;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  points: Points;
};

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aAge;
  attribute float aLifetime;
  uniform float uStartSize;
  uniform float uEndSize;
  varying float vProgress;

  void main() {
    vProgress = clamp(aAge / max(aLifetime, 0.001), 0.0, 1.0);
    float size = mix(uStartSize, uEndSize, vProgress);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uStartColor;
  uniform vec3 uEndColor;
  uniform float uStartOpacity;
  uniform float uEndOpacity;
  varying float vProgress;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));

    if (dist > 0.5) {
      discard;
    }

    vec3 color = mix(uStartColor, uEndColor, vProgress);
    float opacity = mix(uStartOpacity, uEndOpacity, vProgress);
    float edge = smoothstep(0.5, 0.3, dist);
    gl_FragColor = vec4(color, opacity * edge);
  }
`;

export function createThreeParticleHost(parent: Object3D): ThreeParticleHost {
  const renderStates = new Map<string, EmitterRenderState>();

  function createRenderState(emitterId: string, config: ResolvedEmitterConfig): EmitterRenderState {
    const maxParticles = config.maxParticles;
    const geometry = new BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    const ages = new Float32Array(maxParticles);
    const lifetimes = new Float32Array(maxParticles);

    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aAge", new BufferAttribute(ages, 1));
    geometry.setAttribute("aLifetime", new BufferAttribute(lifetimes, 1));
    geometry.setDrawRange(0, 0);

    const material = new ShaderMaterial({
      blending: config.blending === "additive" ? AdditiveBlending : NormalBlending,
      depthWrite: false,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        uEndColor: { value: new Color(config.endColor[0], config.endColor[1], config.endColor[2]) },
        uEndOpacity: { value: config.endOpacity },
        uEndSize: { value: config.endSize },
        uStartColor: { value: new Color(config.startColor[0], config.startColor[1], config.startColor[2]) },
        uStartOpacity: { value: config.startOpacity },
        uStartSize: { value: config.startSize }
      },
      vertexShader: PARTICLE_VERTEX_SHADER
    });

    const points = new Points(geometry, material);
    points.name = `particles:${emitterId}`;
    points.frustumCulled = false;

    return { config, geometry, material, points };
  }

  return {
    addEmitter(emitterId, config) {
      const existing = renderStates.get(emitterId);

      if (existing) {
        parent.remove(existing.points);
        existing.geometry.dispose();
        existing.material.dispose();
      }

      const state = createRenderState(emitterId, config);
      renderStates.set(emitterId, state);
      parent.add(state.points);
    },

    dispose() {
      renderStates.forEach((state) => {
        parent.remove(state.points);
        state.geometry.dispose();
        state.material.dispose();
      });

      renderStates.clear();
    },

    removeEmitter(emitterId) {
      const state = renderStates.get(emitterId);

      if (state) {
        parent.remove(state.points);
        state.geometry.dispose();
        state.material.dispose();
        renderStates.delete(emitterId);
      }
    },

    update(emitters) {
      emitters.forEach((emitterState, emitterId) => {
        const render = renderStates.get(emitterId);

        if (!render) {
          return;
        }

        const { particles } = emitterState;
        const positionsAttr = render.geometry.getAttribute("position") as BufferAttribute;
        const agesAttr = render.geometry.getAttribute("aAge") as BufferAttribute;
        const lifetimesAttr = render.geometry.getAttribute("aLifetime") as BufferAttribute;
        const count = Math.min(particles.length, render.config.maxParticles);

        for (let i = 0; i < count; i += 1) {
          const p = particles[i];
          positionsAttr.array[i * 3] = p.position.x;
          positionsAttr.array[i * 3 + 1] = p.position.y;
          positionsAttr.array[i * 3 + 2] = p.position.z;
          (agesAttr.array as Float32Array)[i] = p.age;
          (lifetimesAttr.array as Float32Array)[i] = p.lifetime;
        }

        positionsAttr.needsUpdate = true;
        agesAttr.needsUpdate = true;
        lifetimesAttr.needsUpdate = true;
        render.geometry.setDrawRange(0, count);
      });
    }
  };
}
