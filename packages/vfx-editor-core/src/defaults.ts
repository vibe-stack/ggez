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

function createModule(id: string, kind: ModuleInstance["kind"], config: Record<string, unknown> = {}): ModuleInstance {
  return {
    id,
    kind,
    enabled: true,
    config
  };
}

export function createDefaultVfxEffectDocument(): VfxEffectDocument {
  return {
    version: 1,
    id: "effect:muzzle-flash",
    name: "Muzzle Flash",
    graph: {
      id: "graph:main",
      name: "Main",
      nodes: [
        { ...createNodeBase("node:parameter:color", "parameter", "Tint", -120, -110), parameterId: "param:tint" },
        { ...createNodeBase("node:event:fire", "event", "Fire", -120, 90), eventId: "event:fire" },
        { ...createNodeBase("node:emitter:flash", "emitter", "Flash Sprite", 180, -10), emitterId: "emitter:flash" },
        { ...createNodeBase("node:scalability", "scalability", "Scalability", 500, -120) },
        { ...createNodeBase("node:output", "output", "Effect Output", 500, 120) }
      ],
      edges: [
        { id: "edge:param-flash", sourceNodeId: "node:parameter:color", targetNodeId: "node:emitter:flash", label: "parameter" },
        { id: "edge:event-flash", sourceNodeId: "node:event:fire", targetNodeId: "node:emitter:flash", label: "trigger" },
        { id: "edge:flash-output", sourceNodeId: "node:emitter:flash", targetNodeId: "node:output", label: "render" }
      ]
    },
    parameters: [
      {
        id: "param:tint",
        name: "Tint",
        type: "color",
        defaultValue: "#ffcc7a",
        exposed: true
      },
      {
        id: "param:intensity",
        name: "Intensity",
        type: "float",
        defaultValue: 1,
        exposed: true
      }
    ],
    events: [
      {
        id: "event:fire",
        name: "Fire",
        payload: {
          muzzleVelocity: "float3"
        }
      }
    ],
    emitters: [
      {
        id: "emitter:flash",
        name: "Flash Sprite",
        simulationDomain: "particle",
        maxParticleCount: 256,
        attributes: {
          heat: "float"
        },
        spawnStage: {
          modules: [
            createModule("module:burst", "SpawnBurst", { count: 24, everyEvent: "event:fire" }),
            createModule("module:cone", "SpawnCone", { angleDegrees: 14, radius: 0.06 })
          ]
        },
        initializeStage: {
          modules: [
            createModule("module:set-age", "SetAttribute", { attribute: "lifetime", value: 0.12 }),
            createModule("module:velocity", "VelocityCone", { speedMin: 8, speedMax: 22 }),
            createModule("module:inherit", "InheritVelocity", { scale: 0.8 })
          ]
        },
        updateStage: {
          modules: [
            createModule("module:drag", "Drag", { coefficient: 3.4 }),
            createModule("module:color", "ColorOverLife", { curve: "flash-hot" }),
            createModule("module:size", "SizeOverLife", { curve: "flash-expand" }),
            createModule("module:alpha", "AlphaOverLife", { curve: "flash-fade" })
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
            id: "renderer:flash",
            name: "Flash Sprites",
            kind: "sprite",
            template: "SpriteAdditiveMaterial",
            enabled: true,
            material: {
              blendMode: "additive",
              lightingMode: "unlit",
              softParticles: false,
              depthFade: false,
              flipbook: true,
              distortion: false,
              emissive: true,
              facingMode: "full",
              sortMode: "none"
            },
            parameterBindings: {
              tint: "param:tint"
            }
          }
        ],
        sourceBindings: [
          {
            id: "source:muzzle",
            name: "Muzzle Socket",
            kind: "socket",
            sourceId: "socket:muzzle",
            config: {
              inheritRotation: true
            }
          }
        ],
        dataInterfaces: []
      }
    ],
    dataInterfaces: [
      {
        id: "interface:bone",
        name: "Character Socket Binding",
        kind: "bone",
        config: {
          skeletonSource: "preview-character"
        }
      }
    ],
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
      durationSeconds: 2,
      attachMode: "character",
      playbackRate: 1
    },
    metadata: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      tags: ["muzzle", "weapon", "flash"]
    }
  };
}
