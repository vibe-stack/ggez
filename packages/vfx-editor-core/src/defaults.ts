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
      return { angleDegrees: 16, radius: 0.1 };
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

export function createDefaultVfxEffectDocument(): VfxEffectDocument {
  return {
    version: 1,
    id: "effect:red-smoke-plume",
    name: "Red Smoke Plume",
    graph: {
      id: "graph:main",
      name: "Main",
      nodes: [
        { ...createNodeBase("node:parameter:color", "parameter", "Smoke Tint", -120, -60), parameterId: "param:tint" },
        { ...createNodeBase("node:emitter:smoke", "emitter", "Smoke Volume", 180, 20), emitterId: "emitter:smoke" },
        { ...createNodeBase("node:output", "output", "Effect Output", 500, 20) }
      ],
      edges: [
        { id: "edge:param-smoke", sourceNodeId: "node:parameter:color", targetNodeId: "node:emitter:smoke", label: "parameter" },
        { id: "edge:smoke-output", sourceNodeId: "node:emitter:smoke", targetNodeId: "node:output", label: "render" }
      ]
    },
    parameters: [
      {
        id: "param:tint",
        name: "Smoke Tint",
        type: "color",
        defaultValue: "#ff0000",
        exposed: true
      }
    ],
    events: [],
    emitters: [
      {
        id: "emitter:smoke",
        name: "Smoke Volume",
        simulationDomain: "particle",
        maxParticleCount: 768,
        attributes: {
          density: "float"
        },
        spawnStage: {
          modules: [
            createModule("module:burst", "SpawnBurst", { count: 8, everyEvent: "" }),
            createModule("module:rate", "SpawnRate", { rate: 18, maxAlive: 768 }),
            createModule("module:cone", "SpawnCone", { angleDegrees: 9, radius: 0.14 })
          ]
        },
        initializeStage: {
          modules: [
            createModule("module:set-age", "SetAttribute", { attribute: "lifetime", value: 5.5 }),
            createModule("module:velocity", "VelocityCone", { speedMin: 0.12, speedMax: 0.48, angleDegrees: 11 })
          ]
        },
        updateStage: {
          modules: [
            createModule("module:drag", "Drag", { coefficient: 0.28 }),
            createModule("module:gravity", "GravityForce", { accelerationX: 0, accelerationY: -7, accelerationZ: 0 }),
            createModule("module:curl", "CurlNoiseForce", { strength: 1.35, frequency: 0.55 }),
            createModule("module:color", "ColorOverLife", { curve: "smoke-soft" }),
            createModule("module:size", "SizeOverLife", { curve: "smoke-soft" }),
            createModule("module:alpha", "AlphaOverLife", { curve: "smoke-soft" })
          ]
        },
        deathStage: {
          modules: [
            createModule("module:kill-age", "KillByAge")
          ]
        },
        eventHandlers: [],
        renderers: [
          {
            id: "renderer:smoke",
            name: "Smoke Sprites",
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
            parameterBindings: {
              tint: "param:tint",
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
      allowSorting: false,
      allowRibbons: true,
      allowCollision: true
    },
    preview: {
      loop: true,
      durationSeconds: 6,
      attachMode: "isolated",
      playbackRate: 1
    },
    metadata: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      tags: ["smoke", "red", "volumetric"]
    }
  };
}
