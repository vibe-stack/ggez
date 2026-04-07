import type { EffectGraphNode, ModuleInstance, VfxEffectDocument } from "@ggez/vfx-schema";

function nowIso() {
  return new Date().toISOString();
}

function createNodeBase<K extends EffectGraphNode["kind"]>(id: string, kind: K, name: string, x: number, y: number) {
  return {
    id,
    kind,
    name,
    position: { x, y }
  };
}

export function getDefaultModuleConfig(kind: ModuleInstance["kind"]): Record<string, unknown> {
  switch (kind) {
    case "AlphaOverLife":
      return { curve: "flash-fade", bias: 1 };
    case "Attractor":
      return { strength: 1, radius: 1 };
    case "CollisionBounce":
      return { restitution: 0.6, friction: 0.1 };
    case "CollisionQuery":
      return { interfaceId: "", radius: 0.1 };
    case "ColorOverLife":
      return { curve: "flash-hot", bias: 1 };
    case "CurlNoiseForce":
      return { strength: 1, frequency: 1 };
    case "Drag":
      return { coefficient: 2.8 };
    case "GravityForce":
      return { accelerationX: 0, accelerationY: 120, accelerationZ: 0 };
    case "InheritVelocity":
      return { scale: 1 };
    case "KillByDistance":
      return { maxDistance: 10 };
    case "OrbitTarget":
      return { radius: 1, angularSpeed: 1 };
    case "RandomRange":
      return { min: 0, max: 1, output: "sample" };
    case "SendEvent":
      return { eventId: "", when: "on-death" };
    case "SetAttribute":
      return { attribute: "lifetime", value: 0.42 };
    case "SizeOverLife":
      return { curve: "flash-expand", bias: 1 };
    case "SpawnBurst":
      return { count: 24, everyEvent: "" };
    case "SpawnCone":
      return {
        angleDegrees: 16,
        radius: 0.1,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        randomX: 0,
        randomY: 0,
        randomZ: 0
      };
    case "SpawnFromBone":
      return { boneId: "" };
    case "SpawnFromMeshSurface":
      return { meshId: "" };
    case "SpawnFromSpline":
      return { splineId: "" };
    case "SpawnRate":
      return { rate: 24, maxAlive: 500 };
    case "VelocityCone":
      return { speedMin: 8, speedMax: 22, angleDegrees: 16 };
    case "KillByAge":
    case "ReceiveEvent":
    case "RibbonLink":
      return {};
  }
}

function createModule(id: string, kind: ModuleInstance["kind"], config: Record<string, unknown> = {}): ModuleInstance {
  return {
    id,
    kind,
    enabled: true,
    config: {
      ...getDefaultModuleConfig(kind),
      ...config
    }
  };
}

export function createBlankVfxEffectDocument(): VfxEffectDocument {
  return {
    version: 1,
    id: "effect:blank",
    name: "Blank Effect",
    graph: {
      id: "graph:main",
      name: "Main",
      nodes: [
        { ...createNodeBase("node:output", "output", "Effect Output", 320, 120) }
      ],
      edges: []
    },
    parameters: [],
    events: [],
    emitters: [],
    dataInterfaces: [],
    subgraphs: [],
    scalability: {
      tier: "high",
      maxActiveInstances: 16,
      preferredTierByDeviceClass: {},
      fallbacks: []
    },
    budgets: {
      maxParticles: 4096,
      maxSpawnPerFrame: 128,
      allowSorting: true,
      allowRibbons: true,
      allowCollision: true
    },
    preview: {
      loop: true,
      durationSeconds: 4,
      attachMode: "isolated",
      playbackRate: 1,
      backgroundColor: "#080e0c"
    },
    metadata: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      tags: ["blank"]
    }
  };
}

export function createCampfireVfxEffectDocument(): VfxEffectDocument {
  return {
    version: 1,
    id: "effect:campfire",
    name: "Campfire",
    graph: {
      id: "graph:main",
      name: "Main",
      nodes: [
        { ...createNodeBase("node:parameter:flame-core", "parameter", "Core Flame Tint", -220, -150), parameterId: "param:flame-core" },
        { ...createNodeBase("node:parameter:flame-outer", "parameter", "Outer Flame Tint", -220, -50), parameterId: "param:flame-outer" },
        { ...createNodeBase("node:parameter:ember", "parameter", "Ember Tint", -220, 50), parameterId: "param:ember" },
        { ...createNodeBase("node:parameter:smoke", "parameter", "Smoke Tint", -220, 150), parameterId: "param:smoke" },
        { ...createNodeBase("node:emitter:flame-core", "emitter", "Flame Core", 60, -150), emitterId: "emitter:flame-core" },
        { ...createNodeBase("node:emitter:flame-outer", "emitter", "Flame Shell", 60, -40), emitterId: "emitter:flame-outer" },
        { ...createNodeBase("node:emitter:embers", "emitter", "Embers", 60, 70), emitterId: "emitter:embers" },
        { ...createNodeBase("node:emitter:smoke", "emitter", "Smoke", 60, 180), emitterId: "emitter:smoke" },
        { ...createNodeBase("node:output", "output", "Effect Output", 420, 20) }
      ],
      edges: [
        { id: "edge:param-core", sourceNodeId: "node:parameter:flame-core", targetNodeId: "node:emitter:flame-core", label: "parameter" },
        { id: "edge:param-outer", sourceNodeId: "node:parameter:flame-outer", targetNodeId: "node:emitter:flame-outer", label: "parameter" },
        { id: "edge:param-ember", sourceNodeId: "node:parameter:ember", targetNodeId: "node:emitter:embers", label: "parameter" },
        { id: "edge:param-smoke", sourceNodeId: "node:parameter:smoke", targetNodeId: "node:emitter:smoke", label: "parameter" },
        { id: "edge:core-output", sourceNodeId: "node:emitter:flame-core", targetNodeId: "node:output", label: "render" },
        { id: "edge:outer-output", sourceNodeId: "node:emitter:flame-outer", targetNodeId: "node:output", label: "render" },
        { id: "edge:embers-output", sourceNodeId: "node:emitter:embers", targetNodeId: "node:output", label: "render" },
        { id: "edge:smoke-output", sourceNodeId: "node:emitter:smoke", targetNodeId: "node:output", label: "render" }
      ]
    },
    parameters: [
      {
        id: "param:flame-core",
        name: "Core Flame Tint",
        type: "color",
        defaultValue: "#ffd56a",
        exposed: true
      },
      {
        id: "param:flame-outer",
        name: "Outer Flame Tint",
        type: "color",
        defaultValue: "#ff5a24",
        exposed: true
      },
      {
        id: "param:ember",
        name: "Ember Tint",
        type: "color",
        defaultValue: "#fff7e8",
        exposed: true
      },
      {
        id: "param:smoke",
        name: "Smoke Tint",
        type: "color",
        defaultValue: "#5d5a53",
        exposed: true
      }
    ],
    events: [],
    emitters: [
      {
        id: "emitter:flame-core",
        name: "Flame Core",
        simulationDomain: "particle",
        // Dense core: rapid refresh keeps the hot column visually solid
        maxParticleCount: 220,
        attributes: {
          heat: "float"
        },
        spawnStage: {
          modules: [
            createModule("module:core-burst", "SpawnBurst", { count: 22, everyEvent: "" }),
            createModule("module:core-rate", "SpawnRate", { rate: 60, maxAlive: 220 }),
            // Very tight base — fire originates at a point
            createModule("module:core-cone", "SpawnCone", { angleDegrees: 5, radius: 0.018 })
          ]
        },
        initializeStage: {
          modules: [
            // Short lifetime: 0.5 s forces rapid turnover and keeps the flame column from hanging
            createModule("module:core-life", "SetAttribute", { attribute: "lifetime", value: 0.52 }),
            // Real flame rises quickly (2–5 m/s); strong initial impulse is bled away by drag below
            createModule("module:core-velocity", "VelocityCone", { speedMin: 2.2, speedMax: 5.0, angleDegrees: 4 })
          ]
        },
        updateStage: {
          modules: [
            // High drag => velocity decays exponentially → classic "flame slows as it rises" silhouette
            createModule("module:core-drag", "Drag", { coefficient: 4.5 }),
            // Slight net downward pull (buoyancy mostly cancels gravity in real fire)
            createModule("module:core-gravity", "GravityForce", { accelerationX: 0, accelerationY: -1.2, accelerationZ: 0 }),
            // Strong, high-frequency curl for organic flicker and roll
            createModule("module:core-curl", "CurlNoiseForce", { strength: 0.65, frequency: 1.4 }),
            createModule("module:core-color", "ColorOverLife", { curve: "flame-hot" }),
            // Blooms outward as it rises then pinches at tip
            createModule("module:core-size", "SizeOverLife", { curve: "flame-bloom" }),
            createModule("module:core-alpha", "AlphaOverLife", { curve: "flame-core-fade" })
          ]
        },
        deathStage: {
          modules: [createModule("module:core-kill-age", "KillByAge")]
        },
        eventHandlers: [],
        renderers: [
          {
            id: "renderer:flame-core",
            name: "Flame Core Renderer",
            kind: "sprite",
            template: "SpriteAdditiveMaterial",
            enabled: true,
            material: {
              blendMode: "additive",
              lightingMode: "unlit",
              softParticles: false,
              depthFade: false,
              flipbook: false,
              distortion: false,
              emissive: true,
              facingMode: "full",
              sortMode: "none"
            },
            flipbookSettings: {
              enabled: false,
              rows: 1,
              cols: 1,
              fps: 12,
              looping: true,
              playbackMode: "particle-age"
            },
            parameterBindings: {
              tint: "param:flame-core",
              _texture: "flame"
            }
          }
        ],
        sourceBindings: [],
        dataInterfaces: []
      },
      {
        id: "emitter:flame-outer",
        name: "Flame Shell",
        simulationDomain: "particle",
        // Outer envelope: wider, softer, more turbulent than the core
        maxParticleCount: 260,
        attributes: {
          heat: "float"
        },
        spawnStage: {
          modules: [
            createModule("module:outer-burst", "SpawnBurst", { count: 14, everyEvent: "" }),
            createModule("module:outer-rate", "SpawnRate", { rate: 42, maxAlive: 260 }),
            // Slightly wider base ring around the core
            createModule("module:outer-cone", "SpawnCone", { angleDegrees: 13, radius: 0.055 })
          ]
        },
        initializeStage: {
          modules: [
            // Slightly longer than core so the envelope lingers after the flash
            createModule("module:outer-life", "SetAttribute", { attribute: "lifetime", value: 0.72 }),
            createModule("module:outer-velocity", "VelocityCone", { speedMin: 1.4, speedMax: 3.4, angleDegrees: 10 })
          ]
        },
        updateStage: {
          modules: [
            createModule("module:outer-drag", "Drag", { coefficient: 3.8 }),
            createModule("module:outer-gravity", "GravityForce", { accelerationX: 0, accelerationY: -0.9, accelerationZ: 0 }),
            // Stronger curl + lower frequency = large slow roiling on the outside
            createModule("module:outer-curl", "CurlNoiseForce", { strength: 0.95, frequency: 0.95 }),
            createModule("module:outer-color", "ColorOverLife", { curve: "flame-orange" }),
            // Outer particles bloom wider and fade sooner — gives the hazy fringe
            createModule("module:outer-size", "SizeOverLife", { curve: "flame-bloom-wide" }),
            createModule("module:outer-alpha", "AlphaOverLife", { curve: "flame-outer-fade" })
          ]
        },
        deathStage: {
          modules: [createModule("module:outer-kill-age", "KillByAge")]
        },
        eventHandlers: [],
        renderers: [
          {
            id: "renderer:flame-outer",
            name: "Flame Shell Renderer",
            kind: "sprite",
            template: "SpriteAdditiveMaterial",
            enabled: true,
            material: {
              blendMode: "additive",
              lightingMode: "unlit",
              softParticles: false,
              depthFade: false,
              flipbook: false,
              distortion: false,
              emissive: true,
              facingMode: "full",
              sortMode: "none"
            },
            flipbookSettings: {
              enabled: false,
              rows: 1,
              cols: 1,
              fps: 12,
              looping: true,
              playbackMode: "particle-age"
            },
            parameterBindings: {
              tint: "param:flame-outer",
              _texture: "flame"
            }
          }
        ],
        sourceBindings: [],
        dataInterfaces: []
      },
      {
        id: "emitter:embers",
        name: "Embers",
        simulationDomain: "particle",
        // Fewer embers but each one traces a believable ballistic arc
        maxParticleCount: 55,
        attributes: {
          spark: "float"
        },
        spawnStage: {
          modules: [
            createModule("module:ember-burst", "SpawnBurst", { count: 3, everyEvent: "" }),
            // Occasional sparks — campfires don't spray embers constantly
            createModule("module:ember-rate", "SpawnRate", { rate: 4.5, maxAlive: 55 }),
            // Wide cone: embers fly out at all angles from the fuel bed
            createModule("module:ember-cone", "SpawnCone", { angleDegrees: 55, radius: 0.05 })
          ]
        },
        initializeStage: {
          modules: [
            // Long life: embers arc high, tumble, and cool before dying
            createModule("module:ember-life", "SetAttribute", { attribute: "lifetime", value: 2.6 }),
            // High initial speed; gravity will carve the arc
            createModule("module:ember-velocity", "VelocityCone", { speedMin: 3.5, speedMax: 8.0, angleDegrees: 40 })
          ]
        },
        updateStage: {
          modules: [
            // Light drag — sparks are tiny but buoyancy provides a little lift
            createModule("module:ember-drag", "Drag", { coefficient: 0.55 }),
            // Near real-world gravity so the parabolic arc looks correct
            createModule("module:ember-gravity", "GravityForce", { accelerationX: 0, accelerationY: -9.4, accelerationZ: 0 }),
            // Tiny high-frequency wiggle — embers tumble erratically in the thermal column
            createModule("module:ember-curl", "CurlNoiseForce", { strength: 0.08, frequency: 3.2 }),
            createModule("module:ember-alpha", "AlphaOverLife", { curve: "ember-glow-fade" })
          ]
        },
        deathStage: {
          modules: [createModule("module:ember-kill-age", "KillByAge")]
        },
        eventHandlers: [],
        renderers: [
          {
            id: "renderer:embers",
            name: "Ember Renderer",
            kind: "sprite",
            template: "SpriteAdditiveMaterial",
            enabled: true,
            material: {
              blendMode: "additive",
              lightingMode: "unlit",
              softParticles: false,
              depthFade: false,
              flipbook: false,
              distortion: false,
              emissive: true,
              facingMode: "full",
              sortMode: "none"
            },
            flipbookSettings: {
              enabled: false,
              rows: 1,
              cols: 1,
              fps: 12,
              looping: true,
              playbackMode: "particle-age"
            },
            parameterBindings: {
              tint: "param:ember",
              _texture: "spark"
            }
          }
        ],
        sourceBindings: [],
        dataInterfaces: []
      },
      {
        id: "emitter:smoke",
        name: "Smoke",
        simulationDomain: "particle",
        maxParticleCount: 768,
        attributes: {
          density: "float"
        },
        spawnStage: {
          modules: [
            createModule("module:smoke-burst", "SpawnBurst", { count: 4, everyEvent: "" }),
            createModule("module:smoke-rate", "SpawnRate", { rate: 8.5, maxAlive: 768 }),
            createModule("module:smoke-cone", "SpawnCone", { angleDegrees: 7, radius: 0.09 })
          ]
        },
        initializeStage: {
          modules: [
            createModule("module:smoke-life", "SetAttribute", { attribute: "lifetime", value: 6.6 }),
            createModule("module:smoke-velocity", "VelocityCone", { speedMin: 0.08, speedMax: 0.26, angleDegrees: 9 })
          ]
        },
        updateStage: {
          modules: [
            createModule("module:smoke-drag", "Drag", { coefficient: 0.18 }),
            createModule("module:smoke-gravity", "GravityForce", { accelerationX: 0, accelerationY: -4, accelerationZ: 0 }),
            createModule("module:smoke-curl", "CurlNoiseForce", { strength: 0.65, frequency: 0.38 }),
            createModule("module:smoke-color", "ColorOverLife", { curve: "smoke-soft" }),
            createModule("module:smoke-size", "SizeOverLife", { curve: "smoke-soft" }),
            createModule("module:smoke-alpha", "AlphaOverLife", { curve: "smoke-soft" })
          ]
        },
        deathStage: {
          modules: [createModule("module:smoke-kill-age", "KillByAge")]
        },
        eventHandlers: [],
        renderers: [
          {
            id: "renderer:smoke",
            name: "Smoke Renderer",
            kind: "sprite",
            template: "SpriteSmokeMaterial",
            enabled: true,
            material: {
              blendMode: "alpha",
              lightingMode: "unlit",
              softParticles: true,
              depthFade: true,
              flipbook: true,
              distortion: false,
              emissive: false,
              facingMode: "full",
              sortMode: "back-to-front"
            },
            flipbookSettings: {
              enabled: true,
              rows: 2,
              cols: 2,
              fps: 5,
              looping: true,
              playbackMode: "particle-age"
            },
            parameterBindings: {
              tint: "param:smoke",
              _texture: "smoke"
            }
          }
        ],
        sourceBindings: [],
        dataInterfaces: []
      }
    ],
    dataInterfaces: [],
    subgraphs: [],
    scalability: {
      tier: "high",
      maxActiveInstances: 24,
      preferredTierByDeviceClass: {
        desktop: "high",
        handheld: "medium"
      },
      fallbacks: [
        {
          id: "fallback:capacity",
          tier: "medium",
          action: "reduce-capacity",
          value: 128
        },
        {
          id: "fallback:sort",
          tier: "low",
          action: "clamp-spawn",
          value: 12
        }
      ]
    },
    budgets: {
      maxParticles: 4096,
      maxSpawnPerFrame: 128,
      allowSorting: true,
      allowRibbons: true,
      allowCollision: true
    },
    preview: {
      loop: true,
      durationSeconds: 4,
      attachMode: "isolated",
      playbackRate: 1,
      backgroundColor: "#080e0c"
    },
    metadata: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      tags: ["campfire", "fire", "smoke", "embers"]
    }
  };
}

export function createDefaultVfxEffectDocument(): VfxEffectDocument {
  return createBlankVfxEffectDocument();
}
