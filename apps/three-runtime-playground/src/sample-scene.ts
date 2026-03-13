import type { WebHammerEngineScene, WebHammerExportMaterial } from "@web-hammer/three-runtime";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute } from "three";

const checkerTexture = createCheckerTexture("#f0e3c8", "#d8b881");
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
        canJump: true,
        canRun: true,
        crouchHeight: 1.2,
        height: 1.8,
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
        physicsEnabled: true
      }
    }
  };
}

export async function resolveSampleAssetPath(path: string) {
  if (path === SAMPLE_MODEL_PATH) {
    return createSampleGltfDataUrl();
  }

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
