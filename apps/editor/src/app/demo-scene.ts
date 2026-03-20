import { createSeedSceneDocument } from "@ggez/editor-core";
import { vec3, type GeometryNode, type Entity } from "@ggez/shared";

export function createDemoSceneDocument() {
  const doc = createSeedSceneDocument();

  const mat = {
    charcoal: "material:flat:charcoal",
    concrete: "material:blockout:concrete",
    mint: "material:blockout:mint",
    orange: "material:blockout:orange",
    sand: "material:flat:sand",
    steel: "material:flat:steel",
    teal: "material:flat:teal"
  };

  function addPrim(id: string, name: string, opts: {
    materialId: string;
    parentId?: string;
    physics?: GeometryNode extends { data: infer D } ? (D extends { physics?: infer P } ? P : never) : never;
    position: [number, number, number];
    role?: "brush" | "prop";
    rotation?: [number, number, number];
    segments?: number;
    shape: "cone" | "cube" | "cylinder" | "sphere";
    size: [number, number, number];
  }) {
    doc.addNode({
      data: {
        materialId: opts.materialId,
        physics: opts.physics,
        radialSegments: opts.segments,
        role: opts.role ?? "brush",
        shape: opts.shape,
        size: vec3(opts.size[0], opts.size[1], opts.size[2])
      },
      id,
      kind: "primitive",
      name,
      parentId: opts.parentId,
      transform: {
        position: vec3(opts.position[0], opts.position[1], opts.position[2]),
        rotation: vec3(opts.rotation?.[0] ?? 0, opts.rotation?.[1] ?? 0, opts.rotation?.[2] ?? 0),
        scale: vec3(1, 1, 1)
      }
    } as GeometryNode);
  }

  function addGroup(id: string, name: string, position: [number, number, number], hooks?: GeometryNode["hooks"], parentId?: string) {
    doc.addNode({
      data: {},
      hooks,
      id,
      kind: "group",
      name,
      parentId,
      transform: {
        position: vec3(position[0], position[1], position[2]),
        rotation: vec3(0, 0, 0),
        scale: vec3(1, 1, 1)
      }
    } as GeometryNode);
  }

  function addLight(id: string, name: string, opts: {
    angle?: number;
    castShadow?: boolean;
    color: string;
    decay?: number;
    distance?: number;
    intensity: number;
    parentId?: string;
    penumbra?: number;
    position: [number, number, number];
    rotation?: [number, number, number];
    type: "ambient" | "directional" | "hemisphere" | "point" | "spot";
  }) {
    doc.addNode({
      data: {
        angle: opts.angle,
        castShadow: opts.castShadow ?? false,
        color: opts.color,
        decay: opts.decay,
        distance: opts.distance,
        enabled: true,
        intensity: opts.intensity,
        penumbra: opts.penumbra,
        type: opts.type
      },
      id,
      kind: "light",
      name,
      parentId: opts.parentId,
      transform: {
        position: vec3(opts.position[0], opts.position[1], opts.position[2]),
        rotation: vec3(opts.rotation?.[0] ?? 0, opts.rotation?.[1] ?? 0, opts.rotation?.[2] ?? 0),
        scale: vec3(1, 1, 1)
      }
    } as GeometryNode);
  }

  function addEntity(id: string, name: string, type: Entity["type"], position: [number, number, number], props: Record<string, string | number | boolean> = {}) {
    doc.addEntity({
      id,
      name,
      properties: props,
      transform: {
        position: vec3(position[0], position[1], position[2]),
        rotation: vec3(0, 0, 0),
        scale: vec3(1, 1, 1)
      },
      type
    });
  }

  // === GROUND ===
  addPrim("n:floor", "Ground Floor", {
    materialId: mat.sand, position: [0, -0.25, 0], shape: "cube", size: [24, 0.5, 24]
  });

  // === WALLS ===
  addPrim("n:wall-n", "Wall North", {
    materialId: mat.concrete, position: [0, 2, -12], shape: "cube", size: [24, 4, 0.5]
  });
  addPrim("n:wall-s", "Wall South", {
    materialId: mat.concrete, position: [0, 2, 12], shape: "cube", size: [24, 4, 0.5]
  });
  addPrim("n:wall-e", "Wall East", {
    materialId: mat.concrete, position: [12, 2, 0], shape: "cube", size: [0.5, 4, 24]
  });
  addPrim("n:wall-w", "Wall West", {
    materialId: mat.concrete, position: [-12, 2, 0], shape: "cube", size: [0.5, 4, 24]
  });

  // === STEPPING PLATFORMS ===
  addPrim("n:step-1", "Step 1", {
    materialId: mat.teal, position: [-6, 0.5, 6], shape: "cube", size: [2, 0.4, 2]
  });
  addPrim("n:step-2", "Step 2", {
    materialId: mat.teal, position: [-6, 1.2, 3.5], shape: "cube", size: [2, 0.4, 2]
  });
  addPrim("n:step-3", "Step 3", {
    materialId: mat.teal, position: [-6, 1.9, 1], shape: "cube", size: [2, 0.4, 2]
  });

  // === UPPER BRIDGE ===
  addPrim("n:bridge", "Upper Bridge", {
    materialId: mat.steel, position: [-2, 2.5, 1], shape: "cube", size: [6, 0.3, 2.5]
  });
  addPrim("n:bridge-rail-l", "Bridge Rail L", {
    materialId: mat.charcoal, position: [-2, 3.0, -0.15], shape: "cube", size: [6, 0.7, 0.12]
  });
  addPrim("n:bridge-rail-r", "Bridge Rail R", {
    materialId: mat.charcoal, position: [-2, 3.0, 2.15], shape: "cube", size: [6, 0.7, 0.12]
  });

  // === TOWER ===
  addPrim("n:tower-base", "Tower Base", {
    materialId: mat.concrete, position: [4, 1.5, -4], shape: "cube", size: [4, 3, 4]
  });
  addPrim("n:tower-top", "Tower Top Platform", {
    materialId: mat.orange, position: [4, 3.25, -4], shape: "cube", size: [5, 0.5, 5]
  });
  addPrim("n:tower-pillar-1", "Tower Pillar NW", {
    materialId: mat.steel, position: [2.2, 4.5, -5.8], shape: "cylinder", size: [0.3, 2, 0.3], segments: 8
  });
  addPrim("n:tower-pillar-2", "Tower Pillar NE", {
    materialId: mat.steel, position: [5.8, 4.5, -5.8], shape: "cylinder", size: [0.3, 2, 0.3], segments: 8
  });
  addPrim("n:tower-pillar-3", "Tower Pillar SW", {
    materialId: mat.steel, position: [2.2, 4.5, -2.2], shape: "cylinder", size: [0.3, 2, 0.3], segments: 8
  });
  addPrim("n:tower-pillar-4", "Tower Pillar SE", {
    materialId: mat.steel, position: [5.8, 4.5, -2.2], shape: "cylinder", size: [0.3, 2, 0.3], segments: 8
  });
  addPrim("n:tower-roof", "Tower Roof", {
    materialId: mat.charcoal, position: [4, 5.75, -4], shape: "cone", size: [6, 1.5, 6], segments: 4
  });

  // === ELEVATOR ===
  addGroup("n:elevator", "Elevator", [8, 0.2, 4], [
    {
      config: {
        active: false,
        loop: false,
        pathId: "path:elevator",
        reverse: false,
        speed: 0.4,
        stopAtEnd: true
      },
      enabled: true,
      id: "hook:elevator:path",
      type: "path_mover"
    },
    {
      config: {
        cooldown: 0,
        filters: ["player"],
        fireOnce: false,
        shape: "box",
        size: [2.8, 1.5, 2.8]
      },
      enabled: true,
      id: "hook:elevator:trigger",
      type: "trigger_volume"
    },
    {
      config: {
        actions: [
          { event: "path.start", target: "n:elevator", type: "emit" }
        ],
        trigger: { event: "trigger.enter", fromEntity: "n:elevator", once: false }
      },
      enabled: true,
      id: "hook:elevator:seq",
      type: "sequence"
    }
  ]);
  addPrim("n:elevator-pad", "Elevator Pad", {
    materialId: mat.teal, parentId: "n:elevator", position: [0, 0, 0], shape: "cube", size: [2.4, 0.3, 2.4]
  });
  addPrim("n:elevator-post", "Elevator Post", {
    materialId: mat.steel, parentId: "n:elevator", position: [0, -0.5, 0], shape: "cylinder", size: [0.4, 1, 0.4], segments: 8
  });

  // === SLIDING DOOR + SECRET ROOM ===
  addGroup("n:door", "Sliding Door", [0, 1.2, -8], [
    {
      config: { initialState: "closed" },
      enabled: true,
      id: "hook:door:open",
      type: "openable"
    },
    {
      config: {
        duration: 0.8,
        targets: {
          closed: { position: [0, 1.2, -8] },
          open: { position: [2.5, 1.2, -8] }
        }
      },
      enabled: true,
      id: "hook:door:mover",
      type: "mover"
    }
  ]);
  addPrim("n:door-panel", "Door Panel", {
    materialId: mat.charcoal, parentId: "n:door", position: [0, 0, 0], shape: "cube", size: [2, 2.4, 0.2]
  });

  // Door trigger zone
  addGroup("n:door-zone", "Door Trigger Zone", [0, 1, -6.5], [
    {
      config: {
        cooldown: 0,
        shape: "box",
        size: [3, 2, 3]
      },
      enabled: true,
      id: "hook:door:trigger",
      type: "trigger_volume"
    },
    {
      config: {
        actions: [
          { event: "open.requested", target: "n:door", type: "emit" }
        ],
        trigger: { event: "trigger.enter", fromEntity: "n:door-zone", once: false }
      },
      enabled: true,
      id: "hook:door:seq",
      type: "sequence"
    }
  ]);

  // Door frame
  addPrim("n:door-frame-l", "Door Frame L", {
    materialId: mat.concrete, position: [-1.3, 1.2, -8], shape: "cube", size: [0.4, 2.4, 0.6]
  });
  addPrim("n:door-frame-r", "Door Frame R", {
    materialId: mat.concrete, position: [1.3, 1.2, -8], shape: "cube", size: [0.4, 2.4, 0.6]
  });
  addPrim("n:door-frame-t", "Door Frame Top", {
    materialId: mat.concrete, position: [0, 2.6, -8], shape: "cube", size: [3, 0.4, 0.6]
  });

  // Secret room behind wall
  addPrim("n:secret-floor", "Secret Room Floor", {
    materialId: mat.mint, position: [0, -0.2, -10.5], shape: "cube", size: [6, 0.1, 4]
  });
  addPrim("n:secret-trophy", "Trophy", {
    materialId: mat.teal, position: [0, 0.75, -10.5], shape: "sphere", size: [0.8, 0.8, 0.8], segments: 12
  });

  // === TORCH A (fire + audio + light) ===
  addGroup("n:torch-a", "Torch A", [-8, 1.8, -8], [
    {
      config: {
        autoplay: true,
        blending: "additive",
        direction: [0, 1, 0],
        emissionRate: 20,
        endColor: "#ff2200",
        endOpacity: 0,
        endSize: 0.3,
        gravity: [0, 2, 0],
        lifetime: 0.8,
        lifetimeVariance: 0.3,
        maxParticles: 40,
        speed: 0.5,
        speedVariance: 0.3,
        spread: 0.5,
        startColor: "#ffcc44",
        startOpacity: 0.9,
        startSize: 0.1
      },
      enabled: true,
      id: "hook:torch-a:fire",
      type: "particle_emitter"
    },
    {
      config: { autoplay: true, loop: true, spatial: true, volume: 0.2 },
      enabled: true,
      id: "hook:torch-a:audio",
      type: "audio_emitter"
    }
  ]);
  addPrim("n:torch-a-stick", "Torch Stick A", {
    materialId: mat.charcoal, parentId: "n:torch-a", position: [0, -0.9, 0],
    shape: "cylinder", size: [0.12, 1.8, 0.12], segments: 6
  });
  addLight("n:torch-a-light", "Torch Light A", {
    color: "#ff9933", decay: 1.5, distance: 10, intensity: 6,
    parentId: "n:torch-a", position: [0, 0.2, 0], type: "point"
  });

  // === TORCH B ===
  addGroup("n:torch-b", "Torch B", [8, 1.8, -8], [
    {
      config: {
        autoplay: true,
        blending: "additive",
        direction: [0, 1, 0],
        emissionRate: 20,
        endColor: "#ff2200",
        endOpacity: 0,
        endSize: 0.3,
        gravity: [0, 2, 0],
        lifetime: 0.8,
        lifetimeVariance: 0.3,
        maxParticles: 40,
        speed: 0.5,
        speedVariance: 0.3,
        spread: 0.5,
        startColor: "#ffcc44",
        startOpacity: 0.9,
        startSize: 0.1
      },
      enabled: true,
      id: "hook:torch-b:fire",
      type: "particle_emitter"
    },
    {
      config: { autoplay: true, loop: true, spatial: true, volume: 0.2 },
      enabled: true,
      id: "hook:torch-b:audio",
      type: "audio_emitter"
    }
  ]);
  addPrim("n:torch-b-stick", "Torch Stick B", {
    materialId: mat.charcoal, parentId: "n:torch-b", position: [0, -0.9, 0],
    shape: "cylinder", size: [0.12, 1.8, 0.12], segments: 6
  });
  addLight("n:torch-b-light", "Torch Light B", {
    color: "#ff9933", decay: 1.5, distance: 10, intensity: 6,
    parentId: "n:torch-b", position: [0, 0.2, 0], type: "point"
  });

  // === AMBIENT DUST ===
  addGroup("n:dust", "Ambient Dust", [0, 1, 0], [
    {
      config: {
        autoplay: true,
        blending: "normal",
        direction: [0, 0.3, 0],
        emissionRate: 2,
        endColor: "#bbbbbb",
        endOpacity: 0,
        endSize: 0.4,
        gravity: [0, 0.1, 0],
        lifetime: 6,
        lifetimeVariance: 2,
        maxParticles: 20,
        speed: 0.1,
        speedVariance: 0.05,
        spread: 1.5,
        startColor: "#cccccc",
        startOpacity: 0.12,
        startSize: 0.06
      },
      enabled: true,
      id: "hook:dust",
      type: "particle_emitter"
    }
  ]);

  // === DYNAMIC CRATES ===
  const cratePhysics = {
    angularDamping: 0.3,
    bodyType: "dynamic" as const,
    canSleep: true,
    ccd: false,
    colliderShape: "cuboid" as const,
    contactSkin: 0,
    enabled: true,
    friction: 0.6,
    gravityScale: 1,
    linearDamping: 0.1,
    lockRotations: false,
    lockTranslations: false,
    restitution: 0.15,
    sensor: false
  };
  addPrim("n:crate-1", "Crate 1", {
    materialId: mat.orange, physics: cratePhysics,
    position: [-3, 0.5, 5], role: "prop", shape: "cube", size: [0.8, 0.8, 0.8]
  });
  addPrim("n:crate-2", "Crate 2", {
    materialId: mat.orange, physics: cratePhysics,
    position: [-2, 0.5, 5.5], role: "prop", shape: "cube", size: [0.8, 0.8, 0.8]
  });
  addPrim("n:crate-3", "Crate 3", {
    materialId: mat.orange, physics: cratePhysics,
    position: [-2.5, 1.3, 5.2], role: "prop", shape: "cube", size: [0.8, 0.8, 0.8]
  });

  // === BARREL ===
  addPrim("n:barrel", "Dynamic Barrel", {
    materialId: mat.steel,
    physics: { ...cratePhysics, colliderShape: "cylinder" as const },
    position: [6, 0.7, 6], role: "prop", shape: "cylinder", size: [0.7, 1.4, 0.7], segments: 12
  });

  // === DECORATIVE PILLARS ===
  addPrim("n:pillar-1", "Pillar NW", {
    materialId: mat.concrete, position: [-9, 1.5, -9], shape: "cylinder", size: [0.6, 3, 0.6], segments: 10
  });
  addPrim("n:pillar-2", "Pillar NE", {
    materialId: mat.concrete, position: [9, 1.5, -9], shape: "cylinder", size: [0.6, 3, 0.6], segments: 10
  });

  // === RAMP ===
  addPrim("n:ramp", "Ramp", {
    materialId: mat.concrete, position: [-6, 0.6, -3],
    rotation: [0.35, 0, 0], shape: "cube", size: [2.4, 0.3, 4]
  });

  // === LIGHTS ===
  addLight("n:key-light", "Key Spot Light", {
    angle: 0.6, castShadow: true, color: "#ffeedd", decay: 1.2,
    distance: 30, intensity: 30, penumbra: 0.4,
    position: [6, 10, 8], rotation: [-0.8, 0.5, 0], type: "spot"
  });
  addLight("n:fill-light", "Fill Light", {
    color: "#ccddff", distance: 40, intensity: 4,
    position: [-8, 6, 4], type: "point"
  });

  // === ENTITIES ===
  addEntity("e:spawn", "Player Spawn", "player-spawn", [0, 0.5, 8]);
  addEntity("e:goal", "Goal Marker", "smart-object", [0, 1, -10.5], { label: "Goal", reward: 100 });

  // === PATHS ===
  doc.settings.paths = [
    {
      id: "path:elevator",
      loop: false,
      name: "Elevator Path",
      points: [
        vec3(8, 0.2, 4),
        vec3(8, 3.2, 4)
      ]
    }
  ];

  doc.settings.world.physicsEnabled = true;
  doc.settings.world.fogColor = "#d4cfc5";
  doc.settings.world.fogNear = 15;
  doc.settings.world.fogFar = 50;
  doc.settings.world.ambientColor = "#fff4de";
  doc.settings.world.ambientIntensity = 0.35;

  doc.settings.player = {
    cameraMode: "third-person",
    canCrouch: true,
    canJump: true,
    canRun: true,
    crouchHeight: 1.2,
    height: 1.8,
    jumpHeight: 1.2,
    movementSpeed: 5,
    runningSpeed: 8
  };

  return doc;
}
