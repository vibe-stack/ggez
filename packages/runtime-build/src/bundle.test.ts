import { describe, expect, test } from "bun:test";
import { createEditableMeshFromPolygons } from "@ggez/geometry-kernel";
import type { SceneDocumentSnapshot, WorldPersistenceBundle } from "@ggez/editor-core";
import { makeTransform, vec3 } from "@ggez/shared";
import { CURRENT_RUNTIME_SCENE_VERSION, type RuntimeScene } from "@ggez/runtime-format";
import {
  buildRuntimeBundleFromSnapshot,
  buildRuntimeSceneFromSnapshot,
  buildRuntimeWorldBundleFromWorld,
  buildRuntimeWorldIndex,
  externalizeRuntimeAssets,
  packRuntimeBundle,
  unpackRuntimeBundle
} from "./index";

const runtimeScene: RuntimeScene = {
  assets: [],
  entities: [
    {
      id: "entity:vfx:test",
      name: "Campfire Loop",
      properties: {
        autoplay: true,
        enabled: true,
        vfxBundleDataUrl: "data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==",
        vfxBundleFileName: "campfire.vfxbundle"
      },
      transform: makeTransform(vec3(2, 0, 1)),
      type: "vfx-object"
    }
  ],
  layers: [],
  materials: [
    {
      baseColorTexture:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII=",
      color: "#ffffff",
      emissiveColor: "#ff6600",
      emissiveIntensity: 0.75,
      id: "material:test",
      metallicFactor: 0,
      name: "Test",
      opacity: 0.42,
      roughnessFactor: 1,
      textureVariation: {
        enabled: true,
        scale: 6
      },
      transparent: true
    }
  ],
  metadata: {
    exportedAt: "2026-03-17T10:00:00.000Z",
    format: "web-hammer-engine",
    version: CURRENT_RUNTIME_SCENE_VERSION
  },
  nodes: [
    {
      data: {},
      id: "node:test",
      kind: "group",
      name: "Test",
      transform: makeTransform(vec3(0, 0, 0))
    }
  ],
  settings: {
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
      ambientIntensity: 0,
      fogColor: "#000000",
      fogFar: 0,
      fogNear: 0,
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
  }
};

describe("runtime-build", () => {
  test("externalizes and repacks runtime bundles", async () => {
    const bundle = await externalizeRuntimeAssets(runtimeScene);
    const bytes = packRuntimeBundle(bundle);
    const unpacked = unpackRuntimeBundle(bytes);

    expect(unpacked.manifest.materials[0]?.baseColorTexture).toBe("assets/textures/material-test-color.png");
    expect(unpacked.manifest.materials[0]?.emissiveColor).toBe("#ff6600");
    expect(unpacked.manifest.materials[0]?.emissiveIntensity).toBe(0.75);
    expect(unpacked.manifest.materials[0]?.opacity).toBe(0.42);
    expect(unpacked.manifest.materials[0]?.textureVariation).toEqual({
      enabled: true,
      scale: 6
    });
    expect(unpacked.manifest.materials[0]?.transparent).toBe(true);
    expect(unpacked.manifest.entities[0]?.properties.vfxBundleAssetPath).toBe("assets/vfx/campfire.vfxbundle");
    expect(unpacked.manifest.entities[0]?.properties.vfxBundleDataUrl).toBe("");
    expect(unpacked.files).toHaveLength(2);
  });

  test("builds world index documents", () => {
    const worldIndex = buildRuntimeWorldIndex([
      {
        bounds: [-10, 0, -10, 10, 10, 10],
        id: "hub",
        manifestUrl: "/world/chunks/hub/scene.runtime.json"
      }
    ]);

    expect(worldIndex.chunks[0]?.id).toBe("hub");
  });

  test("rewrites model node paths to bundled asset paths", async () => {
    const bundle = await externalizeRuntimeAssets({
      ...runtimeScene,
      assets: [
        {
          id: "asset:model:oak",
          metadata: {
            modelFormat: "glb"
          },
          path: "data:model/gltf-binary;base64,AA==",
          type: "model"
        }
      ],
      nodes: [
        {
          data: {
            assetId: "asset:model:oak",
            path: "data:model/gltf-binary;base64,AA=="
          },
          id: "node:model:oak",
          kind: "model",
          name: "Oak",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ]
    });

    expect(bundle.manifest.assets[0]?.path).toBe("assets/models/asset-model-oak.glb");
    expect(bundle.manifest.nodes[0]?.kind).toBe("model");
    expect(bundle.manifest.nodes[0]?.kind === "model" ? bundle.manifest.nodes[0].data.path : undefined).toBe("assets/models/asset-model-oak.glb");
  });

  test("omits orphaned model assets from runtime scenes", async () => {
    const snapshot: SceneDocumentSnapshot = {
      assets: [
        {
          id: "asset:model:used",
          metadata: {
            modelFormat: "glb"
          },
          path: "data:model/gltf-binary;base64,AA==",
          type: "model"
        },
        {
          id: "asset:model:orphaned",
          metadata: {
            modelFormat: "glb"
          },
          path: "data:model/gltf-binary;base64,BB==",
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      metadata: {},
      nodes: [
        {
          data: {
            assetId: "asset:model:used",
            path: "data:model/gltf-binary;base64,AA=="
          },
          id: "node:model:used",
          kind: "model",
          name: "Used Model",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings: {
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
          ambientIntensity: 0,
          fogColor: "#000000",
          fogFar: 0,
          fogNear: 0,
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
      },
      textures: []
    };

    const runtimeSceneFromSnapshot = await buildRuntimeSceneFromSnapshot(snapshot);

    expect(runtimeSceneFromSnapshot.assets.map((asset) => asset.id)).toEqual(["asset:model:used"]);
  });

  test("keeps external texture urls in bundle builds until asset externalization", async () => {
    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [
        {
          color: "#ffffff",
          colorTexture: "https://cdn.example.com/textures/wall.png",
          id: "material:test",
          name: "Test"
        }
      ],
      metadata: {},
      nodes: [],
      settings: runtimeScene.settings,
      textures: []
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: {
          "Content-Type": "image/png"
        },
        status: 200
      });
    }) as typeof fetch;

    try {
      const runtimeSceneFromSnapshot = await buildRuntimeSceneFromSnapshot(snapshot, {
        embedExternalTextures: false
      });
      const bundle = await buildRuntimeBundleFromSnapshot(snapshot);

      expect(runtimeSceneFromSnapshot.materials[0]?.baseColorTexture).toBe("https://cdn.example.com/textures/wall.png");
      expect(bundle.manifest.materials[0]?.baseColorTexture).toBe("assets/textures/material-test-color.png");
      expect(fetchCalls).toEqual(["https://cdn.example.com/textures/wall.png"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("skips unresolved texture ids instead of fetching unsupported texture: urls", async () => {
    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [
        {
          color: "#ffffff",
          colorTexture: "texture:missing",
          id: "material:test",
          metalnessTexture: "texture:missing:metal",
          name: "Test",
          normalTexture: "texture:missing:normal",
          roughnessTexture: "texture:missing:rough"
        }
      ],
      metadata: {},
      nodes: [],
      settings: runtimeScene.settings,
      textures: []
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: {
          "Content-Type": "image/png"
        },
        status: 200
      });
    }) as typeof fetch;

    try {
      const runtimeSceneFromSnapshot = await buildRuntimeSceneFromSnapshot(snapshot);
      const bundle = await buildRuntimeBundleFromSnapshot(snapshot);

      expect(runtimeSceneFromSnapshot.materials[0]?.baseColorTexture).toBeUndefined();
      expect(runtimeSceneFromSnapshot.materials[0]?.normalTexture).toBeUndefined();
      expect(runtimeSceneFromSnapshot.materials[0]?.metallicRoughnessTexture).toBeUndefined();
      expect(bundle.manifest.materials[0]?.baseColorTexture).toBeUndefined();
      expect(fetchCalls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("builds world bundle chunks from namespaced texture references", async () => {
    const bundle: WorldPersistenceBundle = {
      documents: {
        "document:main": {
          assets: [],
          crossDocumentRefs: [],
          documentId: "document:main",
          entities: [],
          layers: [],
          materials: [
            {
              color: "#ffffff",
              colorTexture: "texture:wall",
              id: "material:wall",
              name: "Wall"
            }
          ],
          metadata: {
            documentId: "document:main",
            mount: {
              transform: makeTransform()
            },
            name: "Main",
            partitionIds: ["partition:main"],
            path: "/documents/document:main.json",
            slug: "main",
            tags: []
          },
          nodes: [],
          settings: {
            player: runtimeScene.settings.player,
            world: runtimeScene.settings.world
          },
          textures: [
            {
              dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW5kAAAAASUVORK5CYII=",
              id: "texture:wall",
              name: "Wall"
            }
          ],
          version: 1
        }
      },
      manifest: {
        activeDocumentId: "document:main",
        metadata: {
          projectName: "World Test",
          projectSlug: "world-test"
        },
        partitions: [
          {
            documentIds: ["document:main"],
            id: "partition:main",
            name: "Main",
            path: "/partitions/partition:main.json",
            tags: []
          }
        ],
        version: 1
      },
      partitions: {
        "partition:main": {
          id: "partition:main",
          members: [
            {
              documentId: "document:main",
              kind: "document"
            }
          ],
          name: "Main",
          path: "/partitions/partition:main.json",
          tags: [],
          version: 1
        }
      },
      sharedAssets: {
        assets: [],
        materials: [],
        textures: [],
        version: 1
      },
      version: 1
    };

    const runtimeWorldBundle = await buildRuntimeWorldBundleFromWorld(bundle);
    const chunkManifestFile = runtimeWorldBundle.files.find((file) => file.path === "chunks/partition:main/scene.runtime.json");

    expect(chunkManifestFile).toBeDefined();

    const chunkManifest = JSON.parse(new TextDecoder().decode(chunkManifestFile!.bytes)) as RuntimeScene;
    expect(chunkManifest.materials[0]?.baseColorTexture).toBe("assets/textures/document-main-material-wall-color.png");
  });

  test("bakes rotated UVs into runtime geometry", async () => {
    const mesh = createEditableMeshFromPolygons([
      {
        id: "face:quad",
        positions: [
          vec3(0, 0, 0),
          vec3(1, 0, 0),
          vec3(1, 1, 0),
          vec3(0, 1, 0)
        ]
      }
    ]);

    mesh.faces[0] = {
      ...mesh.faces[0]!,
      uvRotation: Math.PI / 2
    };

    const snapshot: SceneDocumentSnapshot = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      metadata: {},
      nodes: [
        {
          data: mesh,
          id: "node:mesh",
          kind: "mesh",
          name: "Rotated UV Mesh",
          transform: makeTransform(vec3(0, 0, 0))
        }
      ],
      settings: structuredClone(runtimeScene.settings),
      textures: []
    };

    const scene = await buildRuntimeSceneFromSnapshot(snapshot);
    const meshNode = scene.nodes[0];
    const uvs = meshNode?.kind === "mesh" ? meshNode.geometry.primitives[0]?.uvs : undefined;

    expect(uvs).toHaveLength(8);
    expect(uvs?.[0]).toBeCloseTo(0, 5);
    expect(uvs?.[1]).toBeCloseTo(0, 5);
    expect(uvs?.[2]).toBeCloseTo(0, 5);
    expect(uvs?.[3]).toBeCloseTo(1, 5);
    expect(uvs?.[4]).toBeCloseTo(-1, 5);
    expect(uvs?.[5]).toBeCloseTo(1, 5);
    expect(uvs?.[6]).toBeCloseTo(-1, 5);
    expect(uvs?.[7]).toBeCloseTo(0, 5);
  });
});
