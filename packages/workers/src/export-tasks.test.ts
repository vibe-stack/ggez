import { describe, expect, test } from "bun:test";
import { createWorldBundleFromLegacyScene, type SceneDocumentSnapshot } from "@ggez/editor-core";
import { exportEngineArchive, exportEngineBundle, serializeGltfScene } from "./export-tasks";
import { createSerializedModelAssetFiles, makeTransform, vec3, type SceneSettings } from "@ggez/shared";
import { buildRuntimeBundleFromSnapshot, buildRuntimeSceneFromSnapshot } from "@ggez/runtime-build";
import { CURRENT_RUNTIME_SCENE_VERSION } from "@ggez/runtime-format";

const settings: SceneSettings = {
  player: {
    cameraMode: "fps",
    canCrouch: true,
    canInteract: true,
    canJump: true,
    canRun: true,
    crouchHeight: 1.2,
    height: 1.8,
    interactKey: "KeyE",
    jumpHeight: 1,
    movementSpeed: 4,
    runningSpeed: 6
  },
  world: {
    ambientColor: "#ffffff",
    ambientIntensity: 0.5,
    fogColor: "#000000",
    fogFar: 50,
    fogNear: 10,
    gravity: vec3(0, -9.81, 0),
    lod: {
      enabled: true,
      levels: [
        { distance: 24, id: "mid", label: "Mid" },
        { distance: 64, id: "low", label: "Low" }
      ]
    },
    physicsEnabled: true,
    skybox: {
      affectsLighting: false,
      blur: 0,
      enabled: false,
      format: "image",
      intensity: 1,
      lightingIntensity: 1,
      name: "",
      source: ""
    }
  }
};

describe("exportEngineBundle", () => {
  test("ignores zero-sized uploaded metallic-roughness maps instead of crashing", async () => {
    const globals = globalThis as typeof globalThis & {
      OffscreenCanvas?: typeof OffscreenCanvas;
      createImageBitmap?: typeof createImageBitmap;
    };
    const originalOffscreenCanvas = globals.OffscreenCanvas;
    const originalCreateImageBitmap = globals.createImageBitmap;

    class MockOffscreenCanvas {
      constructor(_width: number, _height: number) {}

      getContext() {
        return null;
      }

      async convertToBlob() {
        return new Blob();
      }
    }

    globals.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;
    globals.createImageBitmap = (async () => ({
      close() {},
      height: 0,
      width: 0
    })) as typeof createImageBitmap;

    try {
      const snapshot: SceneDocumentSnapshot = {
        assets: [],
        entities: [],
        layers: [],
        materials: [
          {
            color: "#ffffff",
            id: "material:test",
            metalness: 0.35,
            metalnessTexture:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII=",
            name: "Test Material",
            roughness: 0.65,
            roughnessTexture:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII="
          }
        ],
        nodes: [],
        settings,
        textures: []
      };

      const scene = await buildRuntimeSceneFromSnapshot(snapshot);

      expect(scene.materials[0]?.metallicRoughnessTexture).toBeUndefined();
      expect(scene.materials[0]?.metallicFactor).toBe(0.35);
      expect(scene.materials[0]?.roughnessFactor).toBe(0.65);
    } finally {
      globals.OffscreenCanvas = originalOffscreenCanvas;
      globals.createImageBitmap = originalCreateImageBitmap;
    }
  });

  test("ignores worker readback failures from uploaded metallic-roughness maps", async () => {
    const globals = globalThis as typeof globalThis & {
      OffscreenCanvas?: typeof OffscreenCanvas;
      createImageBitmap?: typeof createImageBitmap;
    };
    const originalOffscreenCanvas = globals.OffscreenCanvas;
    const originalCreateImageBitmap = globals.createImageBitmap;

    class MockOffscreenCanvas {
      constructor(_width: number, _height: number) {}

      getContext() {
        return {
          drawImage() {},
          getImageData() {
            throw new Error("Failed to execute 'getImageData' on 'OffscreenCanvasRenderingContext2D': The source width is 0.");
          }
        };
      }

      async convertToBlob() {
        return new Blob();
      }
    }

    globals.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;
    globals.createImageBitmap = (async () => ({
      close() {},
      height: 8,
      width: 8
    })) as typeof createImageBitmap;

    try {
      const snapshot: SceneDocumentSnapshot = {
        assets: [],
        entities: [],
        layers: [],
        materials: [
          {
            color: "#ffffff",
            id: "material:test",
            metalness: 0.35,
            metalnessTexture:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII=",
            name: "Test Material",
            roughness: 0.65,
            roughnessTexture:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII="
          }
        ],
        nodes: [],
        settings,
        textures: []
      };

      const bundle = await exportEngineBundle(snapshot);

      expect(bundle.manifest.materials[0]?.metallicRoughnessTexture).toBeUndefined();
      expect(bundle.manifest.materials[0]?.metallicFactor).toBe(0.35);
      expect(bundle.manifest.materials[0]?.roughnessFactor).toBe(0.65);
    } finally {
      globals.OffscreenCanvas = originalOffscreenCanvas;
      globals.createImageBitmap = originalCreateImageBitmap;
    }
  });

  test("matches direct runtime-build scene compilation", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 2, 3)
          },
          id: "node:cube",
          kind: "primitive",
          name: "Cube",
          transform: makeTransform(vec3(2, 1, -3))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const scene = await buildRuntimeSceneFromSnapshot(snapshot);

    expect({
      ...bundle.manifest,
      metadata: {
        ...bundle.manifest.metadata,
        exportedAt: "<normalized>"
      }
    }).toEqual({
      ...scene,
      metadata: {
        ...scene.metadata,
        exportedAt: "<normalized>"
      }
    });
  });

  test("matches direct runtime-build bundle externalization", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [],
      settings: {
        ...settings,
        world: {
          ...settings.world,
          skybox: {
            ...settings.world.skybox,
            enabled: true,
            format: "image",
            name: "sunset-sky.png",
            source: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII="
          }
        }
      },
      textures: []
    };

    const fromWorker = await exportEngineBundle(snapshot);
    const direct = await buildRuntimeBundleFromSnapshot(snapshot);

    expect({
      ...fromWorker,
      manifest: {
        ...fromWorker.manifest,
        metadata: {
          ...fromWorker.manifest.metadata,
          exportedAt: "<normalized>"
        }
      }
    }).toEqual({
      ...direct,
      manifest: {
        ...direct.manifest,
        metadata: {
          ...direct.manifest.metadata,
          exportedAt: "<normalized>"
        }
      }
    });
  });

  test("preserves parent ids for grouped runtime exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [
        {
          hooks: [
            {
              config: {
                mode: "slide"
              },
              enabled: true,
              id: "hook:openable:test",
              type: "openable"
            }
          ],
          id: "entity:spawn",
          name: "Spawn",
          parentId: "node:group",
          properties: {},
          transform: makeTransform(vec3(0, 0, 2)),
          type: "player-spawn"
        }
      ],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: makeTransform(vec3(4, 0, 1))
        },
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          id: "node:cube",
          kind: "primitive",
          name: "Cube",
          parentId: "node:group",
          transform: makeTransform(vec3(1, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const group = bundle.manifest.nodes.find((node) => node.id === "node:group");
    const cube = bundle.manifest.nodes.find((node) => node.id === "node:cube");

    expect(bundle.manifest.metadata.version).toBe(CURRENT_RUNTIME_SCENE_VERSION);
    expect(group?.kind).toBe("group");
    expect(cube?.parentId).toBe("node:group");
    expect(bundle.manifest.entities[0]?.parentId).toBe("node:group");
    expect(bundle.manifest.entities[0]?.hooks?.[0]?.type).toBe("openable");
  });

  test("preserves custom gameplay events in exported settings", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [],
      settings: {
        ...settings,
        events: [
          {
            category: "Mission",
            custom: true,
            description: "Raised when the mission objective is updated.",
            id: "event:mission:updated",
            name: "mission.updated",
            scope: "mission"
          }
        ]
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);

    expect(bundle.manifest.settings.events?.[0]?.name).toBe("mission.updated");
  });

  test("bundles scene skyboxes into runtime exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [],
      settings: {
        ...settings,
        world: {
          ...settings.world,
          skybox: {
            ...settings.world.skybox,
            enabled: true,
            format: "image",
            name: "sunset-sky.png",
            source: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII="
          }
        }
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);

    expect(bundle.manifest.settings.world.skybox.source).toBe("assets/skyboxes/sunset-sky-png.png");
    expect(bundle.files.some((file) => file.path === "assets/skyboxes/sunset-sky-png.png")).toBe(true);
  });

  test("preserves node hooks in exported manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          hooks: [
            {
              config: {
                shape: "box",
                size: vec3(3, 1, 3)
              },
              enabled: true,
              id: "hook:trigger:platform",
              type: "trigger_volume"
            },
            {
              actions: [
                {
                  event: "path.start",
                  target: "node:platform",
                  type: "emit"
                }
              ],
              enabled: true,
              id: "hook:sequence:platform",
              trigger: {
                event: "trigger.enter",
                fromEntity: "node:platform"
              },
              type: "sequence"
            },
            {
              config: {
                active: false,
                pathId: "sample:platform-route",
                speed: 1.5
              },
              enabled: true,
              id: "hook:path:platform",
              type: "path_mover"
            }
          ],
          id: "node:platform",
          kind: "group",
          name: "Platform",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const platform = bundle.manifest.nodes.find((node) => node.id === "node:platform");

    expect(platform?.hooks).toHaveLength(3);
    expect(platform?.hooks?.map((hook) => hook.type)).toEqual(["trigger_volume", "sequence", "path_mover"]);
  });

  test("does not auto-bake generated geometry lods into runtime manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            role: "prop",
            shape: "sphere",
            size: vec3(3, 3, 3)
          },
          id: "node:sphere",
          kind: "primitive",
          name: "Sphere",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings: {
        ...settings,
        world: {
          ...settings.world,
          lod: {
            enabled: true,
            levels: [
              { distance: 18, id: "mid", label: "Mid" },
              { distance: 48, id: "low", label: "Low" }
            ]
          }
        }
      },
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const sphere = bundle.manifest.nodes.find((node) => node.id === "node:sphere" && node.kind === "primitive");

    expect(sphere && "lods" in sphere ? sphere.lods : undefined).toBeUndefined();
    expect(bundle.manifest.settings.world.lod.levels.map((level) => level.id)).toEqual(["mid", "low"]);
  });

  test("preserves authored model lod files in runtime manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [
        {
          id: "asset:model:tower",
          metadata: {
            modelFiles: createSerializedModelAssetFiles([
              {
                format: "glb",
                level: "high",
                path: "data:model/gltf-binary;base64,AA=="
              },
              {
                format: "glb",
                level: "mid",
                path: "data:model/gltf-binary;base64,BB=="
              },
              {
                format: "glb",
                level: "low",
                path: "data:model/gltf-binary;base64,CC=="
              }
            ]),
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0.5,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 5,
            nativeSizeZ: 2,
            previewColor: "#6b7280"
          },
          path: "data:model/gltf-binary;base64,AA==",
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            assetId: "asset:model:tower",
            path: "data:model/gltf-binary;base64,AA=="
          },
          id: "node:model:tower",
          kind: "model",
          name: "Tower",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const tower = bundle.manifest.nodes.find((node) => node.id === "node:model:tower" && node.kind === "model");

    expect(tower && "lods" in tower ? tower.lods?.map((lod) => lod.level) : []).toEqual(["mid", "low"]);
    expect(tower && "lods" in tower ? tower.lods?.[0]?.path : undefined).toBe("assets/models/asset-model-tower-mid.glb");
    expect(tower && "lods" in tower ? tower.lods?.[1]?.path : undefined).toBe("assets/models/asset-model-tower-low.glb");
  });

  test("preserves instancing references in runtime manifests", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          id: "node:source",
          kind: "primitive",
          name: "Source Cube",
          transform: makeTransform(vec3(0, 0, 0))
        },
        {
          data: {
            sourceNodeId: "node:source"
          },
          id: "node:instance",
          kind: "instancing",
          name: "Instance Cube",
          transform: {
            position: vec3(3, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const instanceNode = bundle.manifest.nodes.find((node) => node.id === "node:instance");

    expect(instanceNode?.kind).toBe("instancing");
    expect(instanceNode && "data" in instanceNode ? instanceNode.data.sourceNodeId : undefined).toBe("node:source");
  });

  test("reuses source meshes for gltf instancing exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          id: "node:source",
          kind: "primitive",
          name: "Source Cube",
          transform: makeTransform(vec3(0, 0, 0))
        },
        {
          data: {
            sourceNodeId: "node:source"
          },
          id: "node:instance",
          kind: "instancing",
          name: "Instance Cube",
          transform: {
            position: vec3(2, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        }
      ],
      settings,
      textures: []
    };

    const gltf = JSON.parse(await serializeGltfScene(snapshot)) as {
      meshes: Array<unknown>;
      nodes: Array<{ mesh?: number }>;
    };

    expect(gltf.meshes).toHaveLength(1);
    expect(gltf.nodes.filter((node) => typeof node.mesh === "number")).toHaveLength(2);
    expect(gltf.nodes[0]?.mesh).toBe(gltf.nodes[1]?.mesh);
  });

  test("preserves imported model instancing in runtime and gltf exports", async () => {
    const modelDataUrl = "data:model/gltf-binary;base64,AAAA";
    const snapshot: SceneDocumentSnapshot = {
      assets: [
        {
          id: "asset:model:source",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0.5,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 2,
            nativeSizeZ: 2,
            previewColor: "#6b7280"
          },
          path: modelDataUrl,
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {
            assetId: "asset:model:source",
            path: modelDataUrl
          },
          id: "node:model-source",
          kind: "model",
          name: "Model Source",
          transform: makeTransform(vec3(0, 0, 0))
        },
        {
          data: {
            sourceNodeId: "node:model-source"
          },
          id: "node:model-instance",
          kind: "instancing",
          name: "Model Source Instance",
          transform: {
            position: vec3(4, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        }
      ],
      settings,
      textures: []
    };

    const bundle = await exportEngineBundle(snapshot);
    const instanceNode = bundle.manifest.nodes.find((node) => node.id === "node:model-instance");
    const gltf = JSON.parse(await serializeGltfScene(snapshot)) as {
      meshes: Array<unknown>;
      nodes: Array<{ mesh?: number }>;
    };

    expect(instanceNode?.kind).toBe("instancing");
    expect(instanceNode && "data" in instanceNode ? instanceNode.data.sourceNodeId : undefined).toBe("node:model-source");
    expect(gltf.meshes).toHaveLength(1);
    expect(gltf.nodes.filter((node) => typeof node.mesh === "number")).toHaveLength(2);
    expect(gltf.nodes[0]?.mesh).toBe(gltf.nodes[1]?.mesh);
  });

  test("creates archived world runtime exports", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      nodes: [
        {
          data: {},
          id: "node:test",
          kind: "group",
          name: "Test",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings,
      textures: []
    };

    const archive = await exportEngineArchive(createWorldBundleFromLegacyScene(snapshot));

    expect(archive.fileExtension).toBe("world.runtime.zip");
    expect(archive.mimeType).toBe("application/zip");
    expect(archive.bytes.byteLength).toBeGreaterThan(0);
  });
});
