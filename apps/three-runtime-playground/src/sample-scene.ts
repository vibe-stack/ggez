import type { WebHammerEngineScene, WebHammerExportMaterial } from "@ggez/three-runtime";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute } from "three";

const checkerTexture = createCheckerTexture("#f0e3c8", "#d8b881");
const skyboxTexture = createSkyboxTexture("#f6d7a4", "#8ab6ff", "#fff8e6");
const SAMPLE_MODEL_PATH = "sample:model:spire";

export function createSampleScene(): WebHammerEngineScene {
  const floorMaterial: WebHammerExportMaterial = {
    baseColorTexture: checkerTexture,
    color: "#f0e3c8",
    id: "material:sample:floor",
    metallicFactor: 0,
    name: "Floor",
    roughnessFactor: 0.92,
    side: "double"
  };
  const propMaterial: WebHammerExportMaterial = {
    color: "#7d8794",
    id: "material:sample:prop",
    metallicFactor: 0.18,
    name: "Prop Steel",
    roughnessFactor: 0.48
  };

  return {
    assets: [
      {
        id: "asset:model:sample-spire",
        metadata: {
          modelFormat: "glb",
          nativeCenterX: 0,
          nativeCenterY: 0.75,
          nativeCenterZ: 0,
          nativeSizeX: 0.9,
          nativeSizeY: 1.5,
          nativeSizeZ: 0.9,
          previewColor: "#9fd2ff"
        },
        path: SAMPLE_MODEL_PATH,
        type: "model"
      }
    ],
    entities: [
      {
        id: "entity:sample:spawn",
        name: "Spawn",
        properties: {
          team: "blue"
        },
        transform: {
          position: { x: 1.6, y: 0.5, z: 6.4 },
          rotation: { x: 0, y: 0.25, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        type: "player-spawn"
      }
    ],
    layers: [
      {
        id: "layer:default",
        locked: false,
        name: "Default",
        visible: true
      }
    ],
    materials: [floorMaterial, propMaterial],
    metadata: {
      exportedAt: new Date("2026-03-11T10:00:00.000Z").toISOString(),
      format: "web-hammer-engine",
      version: 4
    },
    nodes: [
      {
        data: {
          materialId: floorMaterial.id,
          role: "brush",
          shape: "cube",
          size: { x: 16, y: 0.8, z: 16 },
          uvScale: { x: 4, y: 4 }
        },
        geometry: geometryFromPrimitive(new BoxGeometry(16, 0.8, 16), floorMaterial),
        hooks: [
          {
            config: {
              autoPlay: true,
              clip: "sample:wind",
              loop: true,
              spatial: false,
              volume: 0.12
            },
            enabled: true,
            id: "hook:sample:floor:wind",
            type: "audio_emitter"
          }
        ],
        id: "node:sample:floor",
        kind: "primitive",
        name: "Floor",
        transform: {
          position: { x: 0, y: -0.4, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          materialId: propMaterial.id,
          physics: {
            angularDamping: 0.4,
            bodyType: "dynamic",
            canSleep: true,
            ccd: false,
            colliderShape: "cylinder",
            contactSkin: 0,
            enabled: true,
            friction: 0.7,
            gravityScale: 1,
            linearDamping: 0.15,
            lockRotations: false,
            lockTranslations: false,
            restitution: 0.1,
            sensor: false
          },
          radialSegments: 18,
          role: "prop",
          shape: "cylinder",
          size: { x: 1.4, y: 2.4, z: 1.4 }
        },
        geometry: geometryFromPrimitive(new CylinderGeometry(0.7, 0.7, 2.4, 18), propMaterial),
        id: "node:sample:barrel",
        kind: "primitive",
        name: "Dynamic Barrel",
        transform: {
          position: { x: 2.2, y: 1.2, z: -0.4 },
          rotation: { x: 0, y: 0.35, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {},
        hooks: [
          {
            config: {
              active: true,
              loop: true,
              pathId: "sample:spire-loop",
              reverse: false,
              speed: 0.14,
              stopAtEnd: false
            },
            enabled: true,
            id: "hook:sample:spire:path",
            type: "path_mover"
          },
          {
            config: {
              tags: ["demo", "moving"]
            },
            enabled: true,
            id: "hook:sample:spire:tags",
            type: "tags"
          },
          {
            config: {
              autoPlay: true,
              clip: "sample:machinery",
              distanceModel: "inverse",
              loop: true,
              maxDistance: 25,
              pitch: 1,
              refDistance: 2,
              rolloffFactor: 1.5,
              spatial: true,
              volume: 0.3
            },
            enabled: true,
            id: "hook:sample:spire:audio",
            type: "audio_emitter"
          }
        ],
        id: "node:sample:spire-group",
        kind: "group",
        name: "Spire Cluster",
        transform: {
          position: { x: -2.8, y: 0, z: -1.5 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          materialId: propMaterial.id,
          radialSegments: 4,
          role: "brush",
          shape: "cone",
          size: { x: 2.2, y: 3.1, z: 2.2 }
        },
        geometry: geometryFromPrimitive(new ConeGeometry(1.1, 3.1, 4), propMaterial),
        id: "node:sample:spire-base",
        kind: "primitive",
        name: "Spire Base",
        parentId: "node:sample:spire-group",
        transform: {
          position: { x: 0, y: 1.55, z: 0 },
          rotation: { x: 0, y: 0.78, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          assetId: "asset:model:sample-spire",
          path: SAMPLE_MODEL_PATH
        },
        id: "node:sample:model",
        kind: "model",
        name: "Inserted GLB",
        parentId: "node:sample:spire-group",
        transform: {
          position: { x: 0, y: 3.1, z: 0 },
          rotation: { x: 0, y: -0.3, z: 0 },
          scale: { x: 1.3, y: 1.3, z: 1.3 }
        }
      },
      {
        data: {},
        hooks: [
          {
            config: {
              initialState: "closed",
              mode: "slide"
            },
            enabled: true,
            id: "hook:sample:door:openable",
            type: "openable"
          },
          {
            config: {
              duration: 1.1,
              kind: "lerp_transform",
              targets: {
                closed: {
                  position: [4.8, 1.1, 2.2]
                },
                open: {
                  position: [6.8, 1.1, 2.2]
                }
              }
            },
            enabled: true,
            id: "hook:sample:door:mover",
            type: "mover"
          },
          {
            config: {
              clip: "sample:door-slide",
              distanceModel: "inverse",
              maxDistance: 20,
              pitch: 1,
              refDistance: 1,
              rolloffFactor: 2,
              spatial: true,
              triggerEvent: "open.started",
              volume: 0.8
            },
            enabled: true,
            id: "hook:sample:door:audio",
            type: "audio_emitter"
          }
        ],
        id: "node:sample:door-root",
        kind: "group",
        name: "Sliding Door",
        transform: {
          position: { x: 4.8, y: 1.1, z: 2.2 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          materialId: propMaterial.id,
          role: "prop",
          shape: "cube",
          size: { x: 1.2, y: 2.2, z: 0.28 }
        },
        geometry: geometryFromPrimitive(new BoxGeometry(1.2, 2.2, 0.28), propMaterial),
        id: "node:sample:door-panel",
        kind: "primitive",
        name: "Door Panel",
        parentId: "node:sample:door-root",
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {},
        hooks: [
          {
            config: {
              active: false,
              loop: false,
              pathId: "sample:platform-route",
              reverse: false,
              speed: 0.55,
              stopAtEnd: true
            },
            enabled: true,
            id: "hook:sample:platform:path",
            type: "path_mover"
          },
          {
            config: {
              cooldown: 0,
              filters: ["player"],
              fireOnce: true,
              shape: "box",
              size: [2.6, 1.4, 2.6]
            },
            enabled: true,
            id: "hook:sample:platform:trigger",
            type: "trigger_volume"
          },
          {
            config: {
              clip: "sample:chime",
              distanceModel: "inverse",
              maxDistance: 30,
              pitch: 1,
              refDistance: 2,
              rolloffFactor: 1,
              spatial: true,
              triggerEvent: "trigger.enter",
              volume: 0.5
            },
            enabled: true,
            id: "hook:sample:platform:audio",
            type: "audio_emitter"
          },
          {
            config: {
              actions: [
                {
                  event: "path.start",
                  payload: null,
                  target: "node:sample:platform-root",
                  type: "emit"
                }
              ],
              trigger: {
                event: "trigger.enter",
                fromEntity: "node:sample:platform-root",
                once: true
              }
            },
            enabled: true,
            id: "hook:sample:platform:sequence",
            type: "sequence"
          }
        ],
        id: "node:sample:platform-root",
        kind: "group",
        name: "Moving Platform",
        transform: {
          position: { x: 1.6, y: 0.45, z: 3.8 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          materialId: propMaterial.id,
          role: "brush",
          shape: "cube",
          size: { x: 2.6, y: 0.3, z: 2.6 }
        },
        geometry: geometryFromPrimitive(new BoxGeometry(2.6, 0.3, 2.6), propMaterial),
        id: "node:sample:platform-top",
        kind: "primitive",
        name: "Platform Top",
        parentId: "node:sample:platform-root",
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          materialId: propMaterial.id,
          radialSegments: 12,
          role: "brush",
          shape: "cylinder",
          size: { x: 0.3, y: 0.9, z: 0.3 }
        },
        geometry: geometryFromPrimitive(new CylinderGeometry(0.15, 0.15, 0.9, 12), propMaterial),
        id: "node:sample:platform-pillar",
        kind: "primitive",
        name: "Platform Pillar",
        parentId: "node:sample:platform-root",
        transform: {
          position: { x: 0, y: -0.6, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      },
      {
        data: {
          angle: 0.55,
          castShadow: true,
          color: "#ffe1aa",
          decay: 1.2,
          distance: 28,
          enabled: true,
          intensity: 34,
          penumbra: 0.38,
          type: "spot"
        },
        id: "node:sample:key-light",
        kind: "light",
        name: "Key Light",
        transform: {
          position: { x: 5, y: 9, z: 6 },
          rotation: { x: -0.9, y: 0.72, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      }
    ],
    settings: {
      paths: [
        {
          id: "sample:spire-loop",
          loop: true,
          name: "Spire Loop",
          points: [
            { x: -2.8, y: 0, z: -1.5 },
            { x: -1.25, y: 0, z: -0.4 },
            { x: -2.8, y: 0, z: 0.95 },
            { x: -4.35, y: 0, z: -0.4 },
            { x: -2.8, y: 0, z: -1.5 }
          ]
        },
        {
          id: "sample:platform-route",
          loop: false,
          name: "Platform Route",
          points: [
            { x: 1.6, y: 0.45, z: 3.8 },
            { x: 1.6, y: 1.3, z: 1.8 },
            { x: 4.2, y: 1.3, z: 1.8 },
            { x: 4.2, y: 0.45, z: 3.8 }
          ]
        }
      ],
      player: {
        cameraMode: "third-person",
        canCrouch: true,
        canInteract: true,
        canJump: true,
        canRun: true,
        crouchHeight: 1.2,
        height: 1.8,
        interactKey: "KeyE",
        jumpHeight: 1.1,
        movementSpeed: 4.5,
        runningSpeed: 7
      },
      world: {
        ambientColor: "#fff4de",
        ambientIntensity: 0.42,
        fogColor: "#ebe2d0",
        fogFar: 70,
        fogNear: 22,
        gravity: { x: 0, y: -9.81, z: 0 },
        lod: {
          bakedAt: "2026-03-15T12:00:00.000Z",
          enabled: true,
          lowDetailRatio: 0.22,
          midDetailRatio: 0.52
        },
        physicsEnabled: true,
        skybox: {
          affectsLighting: false,
          blur: 0,
          enabled: true,
          format: "image",
          intensity: 1,
          lightingIntensity: 1,
          name: "sample-sky.svg",
          source: skyboxTexture
        }
      }
    }
  };
}

const sampleAudioCache = new Map<string, string>();

export async function resolveSampleAssetPath(path: string) {
  if (path === SAMPLE_MODEL_PATH) {
    return createSampleGltfDataUrl();
  }

  if (path.startsWith("sample:")) {
    const cached = sampleAudioCache.get(path);
    if (cached) return cached;

    const url = generateSampleAudio(path);
    if (url) {
      sampleAudioCache.set(path, url);
      return url;
    }
  }

  return path;
}

function generateSampleAudio(clipId: string): string | undefined {
  switch (clipId) {
    case "sample:wind":          return generateWind(4, 0.25);
    case "sample:rain":          return generateRain(3, 0.2);
    case "sample:water-stream":  return generateWaterStream(3, 0.2);
    case "sample:ambient-hum":   return generateHum(2, 0.15, 90);
    case "sample:machinery":     return generateHum(3, 0.2, 60);
    case "sample:door-slide":    return generateSweep(140, 80, 0.6, 0.3);
    case "sample:chime":         return generateChime(880, 1.2, 0.35);
    case "sample:footstep":      return generateImpact(60, 0.08, 0.4);
    case "sample:click":         return generateImpact(2000, 0.025, 0.3);
    case "sample:alarm":         return generateSweep(600, 1200, 1.5, 0.2);
    case "sample:explosion":     return generateExplosion(1.2, 0.4);
    case "sample:pickup":        return generatePickup(0.4, 0.3);
    default:                     return undefined;
  }
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

function createSampleGltfDataUrl() {
  const positions = new Float32Array([
    0, 1.5, 0,
    -0.45, 0, 0.45,
    0.45, 0, 0.45,

    0, 1.5, 0,
    0.45, 0, 0.45,
    0.45, 0, -0.45,

    0, 1.5, 0,
    0.45, 0, -0.45,
    -0.45, 0, -0.45,

    0, 1.5, 0,
    -0.45, 0, -0.45,
    -0.45, 0, 0.45
  ]);
  const normals = new Float32Array([
    0, 0.4, 0.9,
    0, 0.4, 0.9,
    0, 0.4, 0.9,

    0.9, 0.4, 0,
    0.9, 0.4, 0,
    0.9, 0.4, 0,

    0, 0.4, -0.9,
    0, 0.4, -0.9,
    0, 0.4, -0.9,

    -0.9, 0.4, 0,
    -0.9, 0.4, 0,
    -0.9, 0.4, 0
  ]);

  const positionView = new Uint8Array(positions.buffer);
  const normalView = new Uint8Array(normals.buffer);
  const merged = new Uint8Array(positionView.byteLength + normalView.byteLength);
  merged.set(positionView, 0);
  merged.set(normalView, positionView.byteLength);

  const gltf = {
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 12,
        max: [0.45, 1.5, 0.45],
        min: [-0.45, 0, -0.45],
        type: "VEC3"
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 12,
        type: "VEC3"
      }
    ],
    asset: {
      generator: "three-runtime-playground",
      version: "2.0"
    },
    bufferViews: [
      {
        buffer: 0,
        byteLength: positionView.byteLength,
        byteOffset: 0
      },
      {
        buffer: 0,
        byteLength: normalView.byteLength,
        byteOffset: positionView.byteLength
      }
    ],
    buffers: [
      {
        byteLength: merged.byteLength,
        uri: `data:application/octet-stream;base64,${toBase64(merged)}`
      }
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.66, 0.84, 1, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.48
        }
      }
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              NORMAL: 1,
              POSITION: 0
            },
            material: 0
          }
        ]
      }
    ],
    nodes: [
      {
        mesh: 0
      }
    ],
    scene: 0,
    scenes: [
      {
        nodes: [0]
      }
    ]
  };

  return `data:model/gltf+json;charset=UTF-8,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

// ---------------------------------------------------------------------------
//  Procedural audio generators — all produce mono 16-bit WAV data URLs.
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 22050;

function encodeWav(samples: Float32Array): string {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
  }

  return `data:audio/wav;base64,${toBase64(new Uint8Array(buffer))}`;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function fade(i: number, total: number, fadeMs = 20): number {
  const fadeSamples = (SAMPLE_RATE * fadeMs) / 1000;
  return Math.min(1, i / fadeSamples) * Math.min(1, (total - i) / fadeSamples);
}

// Seeded PRNG for deterministic noise.
function prng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1;
  };
}

/** Wind — layered filtered noise with slow amplitude modulation. */
function generateWind(duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const noise = prng(42);

  // Generate raw noise then low-pass filter by averaging.
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = noise();

  // Simple moving-average low-pass (window = 60 ≈ ~370 Hz cutoff).
  const window = 60;
  let sum = 0;
  for (let i = 0; i < window && i < n; i++) sum += raw[i];
  for (let i = 0; i < n; i++) {
    if (i >= window) sum -= raw[i - window];
    if (i + window < n) sum += raw[i + window];
    const filtered = sum / window;
    // Slow modulation at ~0.3 Hz for gusts.
    const gust = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.3 * (i / SAMPLE_RATE));
    out[i] = filtered * amp * gust * fade(i, n, 200);
  }

  return encodeWav(out);
}

/** Rain — sparse random drops with short exponential decay. */
function generateRain(duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const rng = prng(77);
  const dropInterval = Math.floor(SAMPLE_RATE * 0.012);
  const decaySamples = Math.floor(SAMPLE_RATE * 0.004);

  for (let i = 0; i < n; i += dropInterval) {
    if (rng() > -0.3) {
      const strength = 0.5 + 0.5 * Math.abs(rng());
      for (let j = 0; j < decaySamples && i + j < n; j++) {
        out[i + j] += rng() * amp * strength * Math.exp(-j / (decaySamples * 0.25));
      }
    }
  }

  // Soft low-pass.
  for (let i = 1; i < n; i++) {
    out[i] = out[i] * 0.6 + out[i - 1] * 0.4;
  }

  for (let i = 0; i < n; i++) out[i] *= fade(i, n, 100);
  return encodeWav(out);
}

/** Water stream — denser noise with bandpass character. */
function generateWaterStream(duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const noise = prng(123);

  for (let i = 0; i < n; i++) {
    out[i] = noise();
  }

  // Bandpass: low-pass then high-pass.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) {
      out[i] = out[i] * 0.35 + out[i - 1] * 0.65;
    }
  }
  // High-pass (subtract running average).
  let avg = 0;
  for (let i = 0; i < n; i++) {
    avg = avg * 0.995 + out[i] * 0.005;
    out[i] = (out[i] - avg) * amp * fade(i, n, 150);
  }

  // Add subtle bubbling — sparse higher-freq pops.
  const rng2 = prng(456);
  for (let i = 0; i < n; i += Math.floor(SAMPLE_RATE * 0.02)) {
    if (rng2() > 0.4) {
      const freq = 800 + rng2() * 600;
      const len = Math.floor(SAMPLE_RATE * 0.008);
      for (let j = 0; j < len && i + j < n; j++) {
        out[i + j] += Math.sin(2 * Math.PI * freq * (j / SAMPLE_RATE)) * amp * 0.15 * Math.exp(-j / (len * 0.3));
      }
    }
  }

  return encodeWav(out);
}

/** Hum — rich harmonic drone (machinery, power grid). */
function generateHum(duration: number, amp: number, baseFreq: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const harmonics = [1, 2, 3, 4, 5, 6];
  const harmonicAmps = [1, 0.5, 0.35, 0.2, 0.12, 0.08];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      sample += Math.sin(2 * Math.PI * baseFreq * harmonics[h] * t) * harmonicAmps[h];
    }
    // Subtle amplitude wobble.
    const wobble = 1 + 0.08 * Math.sin(2 * Math.PI * 1.5 * t);
    out[i] = sample * amp * wobble * fade(i, n, 80) / harmonics.length;
  }

  return encodeWav(out);
}

/** Sweep — frequency glide (door slide, alarm siren). */
function generateSweep(startFreq: number, endFreq: number, duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / n;
    const freq = startFreq + (endFreq - startFreq) * progress;
    out[i] = Math.sin(2 * Math.PI * freq * t) * amp * fade(i, n, 15);
  }

  return encodeWav(out);
}

/** Chime — bell-like decaying tone with inharmonic partials. */
function generateChime(freq: number, duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const partials = [1, 2.76, 5.4, 8.93];
  const partialAmps = [1, 0.6, 0.3, 0.15];
  const decays = [1.2, 0.8, 0.5, 0.3];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let p = 0; p < partials.length; p++) {
      sample += Math.sin(2 * Math.PI * freq * partials[p] * t) * partialAmps[p] * Math.exp(-t / decays[p]);
    }
    out[i] = sample * amp * fade(i, n, 2) / partials.length;
  }

  return encodeWav(out);
}

/** Impact — short thud or click (footstep, UI click). */
function generateImpact(freq: number, duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const noise = prng(99);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / (duration * 0.2));
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.6;
    const click = noise() * 0.4;
    out[i] = (tone + click) * amp * env;
  }

  return encodeWav(out);
}

/** Explosion — noise burst with deep rumble tail. */
function generateExplosion(duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const noise = prng(333);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Initial noise burst.
    const burst = noise() * Math.exp(-t / 0.05);
    // Deep rumble.
    const rumble = Math.sin(2 * Math.PI * 35 * t) * Math.exp(-t / 0.4) * 0.6;
    const rumble2 = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t / 0.3) * 0.3;
    out[i] = (burst + rumble + rumble2) * amp * fade(i, n, 2);
  }

  // Low-pass the burst portion.
  for (let i = 1; i < n; i++) {
    out[i] = out[i] * 0.5 + out[i - 1] * 0.5;
  }

  return encodeWav(out);
}

/** Pickup — ascending chime arpeggio. */
function generatePickup(duration: number, amp: number): string {
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  const noteLen = Math.floor(n / notes.length);

  for (let ni = 0; ni < notes.length; ni++) {
    const start = ni * noteLen;
    for (let i = 0; i < noteLen && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / (duration * 0.6));
      out[start + i] += Math.sin(2 * Math.PI * notes[ni] * t) * amp * env * fade(i, noteLen, 3);
    }
  }

  return encodeWav(out);
}
