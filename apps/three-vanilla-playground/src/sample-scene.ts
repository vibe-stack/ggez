import type { WebHammerEngineScene, WebHammerExportMaterial } from "@ggez/three-runtime";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, Float32BufferAttribute } from "three";

const skyboxTexture = createSkyboxTexture("#f6d7a4", "#8ab6ff", "#fff8e6");
const checkerTexture = createCheckerTexture("#f0e3c8", "#d8b881");
const crackleSound = createCrackleWavDataUrl();
const clickSound = createClickWavDataUrl();

export function createSampleScene(): WebHammerEngineScene {
  const matSand: WebHammerExportMaterial = {
    baseColorTexture: checkerTexture,
    color: "#c8b07e",
    id: "mat:sand",
    metallicFactor: 0,
    name: "Sand",
    roughnessFactor: 0.88,
    side: "double"
  };
  const matConcrete: WebHammerExportMaterial = {
    color: "#a8aea7",
    id: "mat:concrete",
    metallicFactor: 0,
    name: "Concrete",
    roughnessFactor: 1
  };
  const matSteel: WebHammerExportMaterial = {
    color: "#7f8ea3",
    id: "mat:steel",
    metallicFactor: 0.18,
    name: "Steel",
    roughnessFactor: 0.58
  };
  const matTeal: WebHammerExportMaterial = {
    color: "#6ed5c0",
    id: "mat:teal",
    metallicFactor: 0,
    name: "Teal",
    roughnessFactor: 0.82
  };
  const matOrange: WebHammerExportMaterial = {
    color: "#f69036",
    id: "mat:orange",
    metallicFactor: 0,
    name: "Orange",
    roughnessFactor: 0.92
  };
  const matCharcoal: WebHammerExportMaterial = {
    color: "#4e5564",
    id: "mat:charcoal",
    metallicFactor: 0,
    name: "Charcoal",
    roughnessFactor: 0.8
  };
  const matMint: WebHammerExportMaterial = {
    color: "#7ed8bc",
    id: "mat:mint",
    metallicFactor: 0,
    name: "Mint",
    roughnessFactor: 0.9
  };

  function prim(id: string, name: string, mat: WebHammerExportMaterial, shape: "box" | "cylinder" | "cone" | "sphere", size: [number, number, number], pos: [number, number, number], opts?: {
    hooks?: WebHammerEngineScene["nodes"][0]["hooks"];
    parentId?: string;
    physics?: WebHammerEngineScene["nodes"][0] extends { data: infer D } ? (D extends { physics?: infer P } ? P : never) : never;
    role?: "brush" | "prop";
    rotation?: [number, number, number];
    segments?: number;
  }): WebHammerEngineScene["nodes"][0] {
    let geom: BufferGeometry;

    if (shape === "box") {
      geom = new BoxGeometry(size[0], size[1], size[2]);
    } else if (shape === "cylinder") {
      geom = new CylinderGeometry(size[0] / 2, size[0] / 2, size[1], opts?.segments ?? 12);
    } else if (shape === "cone") {
      geom = new ConeGeometry(size[0] / 2, size[1], opts?.segments ?? 4);
    } else {
      geom = new SphereGeometry(size[0] / 2, opts?.segments ?? 12, 8);
    }

    return {
      data: {
        materialId: mat.id,
        physics: opts?.physics,
        radialSegments: opts?.segments,
        role: opts?.role ?? "brush",
        shape: shape === "box" ? "cube" : shape,
        size: { x: size[0], y: size[1], z: size[2] },
        uvScale: { x: 1, y: 1 }
      },
      geometry: geometryFromPrimitive(geom, mat),
      hooks: opts?.hooks,
      id,
      kind: "primitive",
      name,
      parentId: opts?.parentId,
      transform: {
        position: { x: pos[0], y: pos[1], z: pos[2] },
        rotation: { x: opts?.rotation?.[0] ?? 0, y: opts?.rotation?.[1] ?? 0, z: opts?.rotation?.[2] ?? 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    } as WebHammerEngineScene["nodes"][0];
  }

  function group(id: string, name: string, pos: [number, number, number], hooks?: WebHammerEngineScene["nodes"][0]["hooks"], parentId?: string): WebHammerEngineScene["nodes"][0] {
    return {
      data: {},
      hooks,
      id,
      kind: "group",
      name,
      parentId,
      transform: {
        position: { x: pos[0], y: pos[1], z: pos[2] },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    } as WebHammerEngineScene["nodes"][0];
  }

  function light(id: string, name: string, type: string, pos: [number, number, number], opts: Record<string, unknown> = {}): WebHammerEngineScene["nodes"][0] {
    return {
      data: {
        castShadow: opts.castShadow ?? false,
        color: opts.color ?? "#ffffff",
        decay: opts.decay,
        distance: opts.distance,
        enabled: true,
        intensity: opts.intensity ?? 1,
        type,
        ...(type === "spot" ? { angle: opts.angle, penumbra: opts.penumbra } : {})
      },
      id,
      kind: "light",
      name,
      parentId: opts.parentId as string | undefined,
      transform: {
        position: { x: pos[0], y: pos[1], z: pos[2] },
        rotation: { x: (opts.rotX as number) ?? 0, y: (opts.rotY as number) ?? 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    } as WebHammerEngineScene["nodes"][0];
  }

  const dynamicPhysics = {
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

  const fireHook = (hookId: string) => ({
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
    id: hookId,
    type: "particle_emitter"
  });

  return {
    assets: [],
    entities: [
      {
        id: "e:spawn",
        name: "Player Spawn",
        properties: {},
        transform: { position: { x: 0, y: 0.5, z: 8 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        type: "player-spawn"
      },
      {
        id: "e:goal",
        name: "Goal",
        properties: { label: "Secret Trophy" },
        transform: { position: { x: 0, y: 1, z: -10.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        type: "smart-object"
      }
    ],
    layers: [{ id: "layer:default", locked: false, name: "Default", visible: true }],
    materials: [matSand, matConcrete, matSteel, matTeal, matOrange, matCharcoal, matMint],
    metadata: {
      exportedAt: new Date().toISOString(),
      format: "web-hammer-engine",
      version: 4
    },
    nodes: [
      // === GROUND ===
      prim("n:floor", "Ground Floor", matSand, "box", [24, 0.5, 24], [0, -0.25, 0]),

      // === WALLS ===
      prim("n:wall-n", "Wall North", matConcrete, "box", [24, 4, 0.5], [0, 2, -12]),
      prim("n:wall-s", "Wall South", matConcrete, "box", [24, 4, 0.5], [0, 2, 12]),
      prim("n:wall-e", "Wall East", matConcrete, "box", [0.5, 4, 24], [12, 2, 0]),
      prim("n:wall-w", "Wall West", matConcrete, "box", [0.5, 4, 24], [-12, 2, 0]),

      // === STEPPING PLATFORMS ===
      prim("n:step-1", "Step 1", matTeal, "box", [2, 0.4, 2], [-6, 0.5, 6]),
      prim("n:step-2", "Step 2", matTeal, "box", [2, 0.4, 2], [-6, 1.2, 3.5]),
      prim("n:step-3", "Step 3", matTeal, "box", [2, 0.4, 2], [-6, 1.9, 1]),

      // === UPPER BRIDGE ===
      prim("n:bridge", "Upper Bridge", matSteel, "box", [6, 0.3, 2.5], [-2, 2.5, 1]),
      prim("n:rail-l", "Rail Left", matCharcoal, "box", [6, 0.7, 0.12], [-2, 3.0, -0.15]),
      prim("n:rail-r", "Rail Right", matCharcoal, "box", [6, 0.7, 0.12], [-2, 3.0, 2.15]),

      // === TOWER ===
      prim("n:tower-base", "Tower Base", matConcrete, "box", [4, 3, 4], [4, 1.5, -4]),
      prim("n:tower-top", "Tower Top", matOrange, "box", [5, 0.5, 5], [4, 3.25, -4]),
      prim("n:tower-p1", "Pillar NW", matSteel, "cylinder", [0.3, 2, 0.3], [2.2, 4.5, -5.8], { segments: 8 }),
      prim("n:tower-p2", "Pillar NE", matSteel, "cylinder", [0.3, 2, 0.3], [5.8, 4.5, -5.8], { segments: 8 }),
      prim("n:tower-p3", "Pillar SW", matSteel, "cylinder", [0.3, 2, 0.3], [2.2, 4.5, -2.2], { segments: 8 }),
      prim("n:tower-p4", "Pillar SE", matSteel, "cylinder", [0.3, 2, 0.3], [5.8, 4.5, -2.2], { segments: 8 }),
      prim("n:tower-roof", "Tower Roof", matCharcoal, "cone", [6, 1.5, 6], [4, 5.75, -4], { segments: 4 }),

      // === ELEVATOR ===
      group("n:elevator", "Elevator", [8, 0.2, 4], [
        {
          config: { active: false, loop: false, pathId: "path:elevator", speed: 0.4, stopAtEnd: true },
          enabled: true,
          id: "hook:elev:path",
          type: "path_mover"
        },
        {
          config: { cooldown: 0, filters: ["player"], fireOnce: false, shape: "box", size: [2.8, 1.5, 2.8] },
          enabled: true,
          id: "hook:elev:trigger",
          type: "trigger_volume"
        },
        {
          config: {
            actions: [{ event: "path.start", target: "n:elevator", type: "emit" }],
            trigger: { event: "trigger.enter", fromEntity: "n:elevator", once: false }
          },
          enabled: true,
          id: "hook:elev:seq",
          type: "sequence"
        }
      ]),
      prim("n:elev-pad", "Elevator Pad", matTeal, "box", [2.4, 0.3, 2.4], [0, 0, 0], { parentId: "n:elevator" }),
      prim("n:elev-post", "Elevator Post", matSteel, "cylinder", [0.4, 1, 0.4], [0, -0.5, 0], { parentId: "n:elevator", segments: 8 }),

      // === DOOR ===
      group("n:door", "Sliding Door", [0, 1.2, -8], [
        { config: { initialState: "closed" }, enabled: true, id: "hook:door:open", type: "openable" },
        {
          config: {
            duration: 0.8,
            targets: { closed: { position: [0, 1.2, -8] }, open: { position: [2.5, 1.2, -8] } }
          },
          enabled: true,
          id: "hook:door:mover",
          type: "mover"
        }
      ]),
      prim("n:door-panel", "Door Panel", matCharcoal, "box", [2, 2.4, 0.2], [0, 0, 0], { parentId: "n:door" }),
      group("n:door-zone", "Door Trigger", [0, 1, -6.5], [
        { config: { cooldown: 0, shape: "box", size: [3, 2, 3] }, enabled: true, id: "hook:dz:trigger", type: "trigger_volume" },
        {
          config: {
            actions: [{ event: "open.requested", target: "n:door", type: "emit" }],
            trigger: { event: "trigger.enter", fromEntity: "n:door-zone", once: false }
          },
          enabled: true,
          id: "hook:dz:seq",
          type: "sequence"
        }
      ]),
      // door sparks + click
      group("n:door-fx", "Door FX", [0, 2.4, -8], [
        {
          config: {
            autoplay: false, burst: 15, direction: [0, 1, 0], endColor: "#888888", endOpacity: 0, endSize: 0.15,
            gravity: [0, -4, 0], lifetime: 0.5, lifetimeVariance: 0.2, maxParticles: 20, speed: 3, speedVariance: 1.5,
            spread: 1.2, startColor: "#ffaa44", startOpacity: 0.8, startSize: 0.06, triggerEvent: "open.started"
          },
          enabled: true,
          id: "hook:door:sparks",
          type: "particle_emitter"
        },
        {
          config: { src: clickSound, triggerEvent: "open.started", volume: 0.7 },
          enabled: true,
          id: "hook:door:sound",
          type: "audio_emitter"
        }
      ]),
      prim("n:frame-l", "Frame Left", matConcrete, "box", [0.4, 2.4, 0.6], [-1.3, 1.2, -8]),
      prim("n:frame-r", "Frame Right", matConcrete, "box", [0.4, 2.4, 0.6], [1.3, 1.2, -8]),
      prim("n:frame-t", "Frame Top", matConcrete, "box", [3, 0.4, 0.6], [0, 2.6, -8]),

      // === SECRET ROOM ===
      prim("n:secret-floor", "Secret Floor", matMint, "box", [6, 0.1, 4], [0, -0.2, -10.5]),
      prim("n:trophy", "Trophy", matTeal, "sphere", [0.8, 0.8, 0.8], [0, 0.75, -10.5], { segments: 12 }),

      // === TORCHES ===
      group("n:torch-a", "Torch A", [-8, 1.8, -8], [
        fireHook("hook:ta:fire"),
        { config: { autoplay: true, loop: true, spatial: true, src: crackleSound, volume: 0.25 }, enabled: true, id: "hook:ta:audio", type: "audio_emitter" }
      ]),
      prim("n:ta-stick", "Torch Stick A", matCharcoal, "cylinder", [0.12, 1.8, 0.12], [0, -0.9, 0], { parentId: "n:torch-a", segments: 6 }),
      light("n:ta-light", "Torch Light A", "point", [0, 0.2, 0], { color: "#ff9933", decay: 1.5, distance: 10, intensity: 6, parentId: "n:torch-a" }),

      group("n:torch-b", "Torch B", [8, 1.8, -8], [
        fireHook("hook:tb:fire"),
        { config: { autoplay: true, loop: true, spatial: true, src: crackleSound, volume: 0.25 }, enabled: true, id: "hook:tb:audio", type: "audio_emitter" }
      ]),
      prim("n:tb-stick", "Torch Stick B", matCharcoal, "cylinder", [0.12, 1.8, 0.12], [0, -0.9, 0], { parentId: "n:torch-b", segments: 6 }),
      light("n:tb-light", "Torch Light B", "point", [0, 0.2, 0], { color: "#ff9933", decay: 1.5, distance: 10, intensity: 6, parentId: "n:torch-b" }),

      // === DUST ===
      group("n:dust", "Ambient Dust", [0, 1, 0], [
        {
          config: {
            autoplay: true, blending: "normal", direction: [0, 0.3, 0], emissionRate: 2, endColor: "#bbbbbb",
            endOpacity: 0, endSize: 0.4, gravity: [0, 0.1, 0], lifetime: 6, lifetimeVariance: 2,
            maxParticles: 20, speed: 0.1, speedVariance: 0.05, spread: 1.5, startColor: "#cccccc",
            startOpacity: 0.12, startSize: 0.06
          },
          enabled: true,
          id: "hook:dust",
          type: "particle_emitter"
        }
      ]),

      // === DYNAMIC CRATES ===
      prim("n:crate-1", "Crate 1", matOrange, "box", [0.8, 0.8, 0.8], [-3, 0.5, 5], { physics: dynamicPhysics, role: "prop" }),
      prim("n:crate-2", "Crate 2", matOrange, "box", [0.8, 0.8, 0.8], [-2, 0.5, 5.5], { physics: dynamicPhysics, role: "prop" }),
      prim("n:crate-3", "Crate 3", matOrange, "box", [0.8, 0.8, 0.8], [-2.5, 1.3, 5.2], { physics: dynamicPhysics, role: "prop" }),
      prim("n:barrel", "Barrel", matSteel, "cylinder", [0.7, 1.4, 0.7], [6, 0.7, 6], {
        physics: { ...dynamicPhysics, colliderShape: "cylinder" as const },
        role: "prop",
        segments: 12
      }),

      // === DECORATIVE ===
      prim("n:pil-1", "Pillar NW", matConcrete, "cylinder", [0.6, 3, 0.6], [-9, 1.5, -9], { segments: 10 }),
      prim("n:pil-2", "Pillar NE", matConcrete, "cylinder", [0.6, 3, 0.6], [9, 1.5, -9], { segments: 10 }),
      prim("n:ramp", "Ramp", matConcrete, "box", [2.4, 0.3, 4], [-6, 0.6, -3], { rotation: [0.35, 0, 0] }),

      // === LIGHTS ===
      light("n:key-light", "Key Spot", "spot", [6, 10, 8], {
        angle: 0.6, castShadow: true, color: "#ffeedd", decay: 1.2,
        distance: 30, intensity: 30, penumbra: 0.4, rotX: -0.8, rotY: 0.5
      }),
      light("n:fill", "Fill Light", "point", [-8, 6, 4], { color: "#ccddff", distance: 40, intensity: 4 })
    ],
    settings: {
      paths: [
        {
          id: "path:elevator",
          loop: false,
          name: "Elevator Path",
          points: [
            { x: 8, y: 0.2, z: 4 },
            { x: 8, y: 3.2, z: 4 }
          ]
        }
      ],
      player: {
        cameraMode: "third-person",
        canCrouch: true,
        canJump: true,
        canRun: true,
        crouchHeight: 1.2,
        height: 1.8,
        jumpHeight: 1.2,
        movementSpeed: 5,
        runningSpeed: 8
      },
      world: {
        ambientColor: "#fff4de",
        ambientIntensity: 0.35,
        fogColor: "#d4cfc5",
        fogFar: 50,
        fogNear: 15,
        gravity: { x: 0, y: -9.81, z: 0 },
        lod: { enabled: false, lowDetailRatio: 0.22, midDetailRatio: 0.52 },
        physicsEnabled: true,
        skybox: {
          affectsLighting: false,
          blur: 0,
          enabled: true,
          format: "image",
          intensity: 1,
          lightingIntensity: 1,
          name: "sky",
          source: skyboxTexture
        }
      }
    }
  };
}

export async function resolveSampleAssetPath(path: string) {
  return path;
}

function geometryFromPrimitive(geometry: BufferGeometry, material: WebHammerExportMaterial) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();

  const exportGeometry = {
    primitives: [
      {
        indices: index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: position.count }, (_, value) => value),
        material,
        normals: Array.from(normal.array as ArrayLike<number>),
        positions: Array.from(position.array as ArrayLike<number>),
        uvs: uv ? Array.from(uv.array as ArrayLike<number>) : []
      }
    ]
  };

  geometry.dispose();
  return exportGeometry;
}

function createCheckerTexture(a: string, b: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="${a}" />
      <rect width="64" height="64" fill="${b}" />
      <rect x="64" y="64" width="64" height="64" fill="${b}" />
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createSkyboxTexture(horizon: string, zenith: string, sun: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${zenith}" />
          <stop offset="58%" stop-color="${horizon}" />
          <stop offset="100%" stop-color="#5f7cbb" />
        </linearGradient>
        <radialGradient id="sun" cx="50%" cy="36%" r="18%">
          <stop offset="0%" stop-color="${sun}" stop-opacity="0.98" />
          <stop offset="45%" stop-color="${sun}" stop-opacity="0.45" />
          <stop offset="100%" stop-color="${sun}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="2048" height="1024" fill="url(#sky)" />
      <rect width="2048" height="1024" fill="url(#sun)" />
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createCrackleWavDataUrl(): string {
  const sampleRate = 22050;
  const duration = 2;
  const numSamples = sampleRate * duration;
  const dataBytes = numSamples * 2;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < numSamples; i += 1) {
    const burst = Math.random() < 0.03 ? (Math.random() - 0.5) * 0.6 : 0;
    const hiss = (Math.random() - 0.5) * 0.08;
    const sample = Math.max(-1, Math.min(1, burst + hiss));
    view.setInt16(headerSize + i * 2, sample * 32767, true);
  }

  return `data:audio/wav;base64,${toBase64(new Uint8Array(buffer))}`;
}

function createClickWavDataUrl(): string {
  const sampleRate = 22050;
  const numSamples = 2200;
  const dataBytes = numSamples * 2;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 18);
    const tone = Math.sin(t * 2 * Math.PI * 180) * 0.5 + (Math.random() - 0.5) * 0.3;
    const sample = Math.max(-1, Math.min(1, tone * envelope));
    view.setInt16(headerSize + i * 2, sample * 32767, true);
  }

  return `data:audio/wav;base64,${toBase64(new Uint8Array(buffer))}`;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}
