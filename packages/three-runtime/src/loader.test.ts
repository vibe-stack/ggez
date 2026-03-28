import { describe, expect, test } from "bun:test";
import { loadWebHammerEngineScene } from "./loader";
import type { WebHammerEngineScene } from "./types";
import { makeTransform, vec3 } from "@ggez/shared";
import { InstancedMesh, LOD, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";

describe("loadWebHammerEngineScene", () => {
  test("rebuilds grouped runtime hierarchies and resolves entity world transforms", async () => {
    const scene: WebHammerEngineScene = {
      assets: [],
      entities: [
        {
          id: "entity:spawn",
          name: "Spawn",
          parentId: "node:group",
          properties: {},
          transform: makeTransform(vec3(0, 0, 3)),
          type: "player-spawn"
        }
      ],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-12T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 4
      },
      nodes: [
        {
          data: {},
          hooks: [
            {
              config: {
                tags: ["train"]
              },
              id: "hook:tags:test",
              type: "tags"
            }
          ],
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: {
            position: vec3(5, 0, 1),
            rotation: vec3(0, Math.PI / 2, 0),
            scale: vec3(2, 2, 2)
          }
        },
        {
          data: {
            castShadow: false,
            color: "#ffffff",
            enabled: true,
            intensity: 2,
            type: "point"
          },
          id: "node:light",
          kind: "light",
          name: "Light",
          parentId: "node:group",
          transform: makeTransform(vec3(1, 0, 0))
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
        fogFar: 50,
        fogNear: 10,
        gravity: vec3(0, -9.81, 0),
        lod: {
          bakedAt: "",
          enabled: false,
          lowDetailRatio: 0.22,
          midDetailRatio: 0.52
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

    const loaded = await loadWebHammerEngineScene(scene);
    const groupObject = loaded.nodes.get("node:group");
    const lightObject = loaded.nodes.get("node:light");
    const worldPosition = lightObject?.getWorldPosition(new Vector3());

    expect(groupObject).toBeDefined();
    expect(lightObject?.parent).toBe(groupObject);
    expect(groupObject?.userData.webHammer.hooks?.[0]?.type).toBe("tags");
    expect(worldPosition?.x).toBeCloseTo(5, 5);
    expect(worldPosition?.z).toBeCloseTo(-1, 5);
    expect(loaded.entities[0]?.transform.position.x).toBeCloseTo(11, 5);
    expect(loaded.entities[0]?.transform.position.z).toBeCloseTo(1, 5);
  });

  test("creates three lod objects when baked lod geometry and distances are provided", async () => {
    const scene: WebHammerEngineScene = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-12T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 5
      },
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(2, 2, 2)
          },
          geometry: {
            primitives: [
              {
                indices: [0, 1, 2, 0, 2, 3],
                material: {
                  color: "#ffffff",
                  id: "material:test",
                  metallicFactor: 0,
                  name: "Test",
                  roughnessFactor: 1
                },
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
              }
            ]
          },
          id: "node:lod-cube",
          kind: "primitive",
          lods: [
            {
              geometry: {
                primitives: [
                  {
                    indices: [0, 1, 2],
                    material: {
                      color: "#ffffff",
                      id: "material:test",
                      metallicFactor: 0,
                      name: "Test",
                      roughnessFactor: 1
                    },
                    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
                    uvs: [0, 0, 1, 0, 0.5, 1]
                  }
                ]
              },
              level: "mid"
            },
            {
              geometry: {
                primitives: [
                  {
                    indices: [0, 1, 2],
                    material: {
                      color: "#ffffff",
                      id: "material:test",
                      metallicFactor: 0,
                      name: "Test",
                      roughnessFactor: 1
                    },
                    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
                    uvs: [0, 0, 1, 0, 0.5, 1]
                  }
                ]
              },
              level: "low"
            }
          ],
          name: "LOD Cube",
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
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "2026-03-15T12:00:00.000Z",
            enabled: true,
            lowDetailRatio: 0.2,
            midDetailRatio: 0.5
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

    const loaded = await loadWebHammerEngineScene(scene, {
      lod: {
        lowDistance: 30,
        midDistance: 10
      }
    });
    const lodNode = loaded.nodes.get("node:lod-cube");
    const lodObject = lodNode?.children[0]?.children[0];

    expect(lodObject).toBeInstanceOf(LOD);
    expect((lodObject as LOD | undefined)?.levels.map((level) => level.distance)).toEqual([0, 10, 30]);
  });

  test("creates model lod objects from referenced baked model assets", async () => {
    const scene: WebHammerEngineScene = {
      assets: [
        {
          id: "asset:model:high",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 3,
            nativeSizeZ: 2
          },
          path: "missing-high.glb",
          type: "model"
        },
        {
          id: "asset:model:mid",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 3,
            nativeSizeZ: 2
          },
          path: "missing-mid.glb",
          type: "model"
        },
        {
          id: "asset:model:low",
          metadata: {
            modelFormat: "glb",
            nativeCenterX: 0,
            nativeCenterY: 0,
            nativeCenterZ: 0,
            nativeSizeX: 2,
            nativeSizeY: 3,
            nativeSizeZ: 2
          },
          path: "missing-low.glb",
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-16T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 5
      },
      nodes: [
        {
          data: {
            assetId: "asset:model:high",
            path: "missing-high.glb"
          },
          id: "node:lod-model",
          kind: "model",
          lods: [
            {
              assetId: "asset:model:mid",
              level: "mid"
            },
            {
              assetId: "asset:model:low",
              level: "low"
            }
          ],
          name: "LOD Model",
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
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "2026-03-16T10:00:00.000Z",
            enabled: true,
            lowDetailRatio: 0.2,
            midDetailRatio: 0.5
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

    const loaded = await loadWebHammerEngineScene(scene, {
      lod: {
        lowDistance: 30,
        midDistance: 10
      }
    });
    const lodNode = loaded.nodes.get("node:lod-model");
    const lodObject = lodNode?.children[0]?.children[0];

    expect(lodObject).toBeInstanceOf(LOD);
    expect((lodObject as LOD | undefined)?.levels.map((level) => level.distance)).toEqual([0, 10, 30]);
  });

  test("builds instanced runtime meshes for instancing nodes", async () => {
    const scene: WebHammerEngineScene = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-17T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 6
      },
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          geometry: {
            primitives: [
              {
                indices: [0, 1, 2, 0, 2, 3],
                material: {
                  color: "#ffffff",
                  id: "material:test",
                  metallicFactor: 0,
                  name: "Test",
                  roughnessFactor: 1
                },
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
              }
            ]
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
          id: "node:instance:a",
          kind: "instancing",
          name: "Instance A",
          transform: {
            position: vec3(2, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        },
        {
          data: {
            sourceNodeId: "node:source"
          },
          id: "node:instance:b",
          kind: "instancing",
          name: "Instance B",
          transform: {
            position: vec3(-2, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
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
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "",
            enabled: false,
            lowDetailRatio: 0.22,
            midDetailRatio: 0.52
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

    const loaded = await loadWebHammerEngineScene(scene);
    const instancedMeshes: InstancedMesh[] = [];

    loaded.root.traverse((child) => {
      if (child instanceof InstancedMesh) {
        instancedMeshes.push(child);
      }
    });

    expect(instancedMeshes).toHaveLength(1);
    expect(instancedMeshes[0]?.count).toBe(2);
    expect(loaded.nodes.get("node:instance:a")?.visible).toBe(false);
  });

  test("builds instanced runtime meshes for imported model instancing nodes", async () => {
    const scene: WebHammerEngineScene = {
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
          path: "",
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-17T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 6
      },
      nodes: [
        {
          data: {
            assetId: "asset:model:source",
            path: ""
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
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "",
            enabled: false,
            lowDetailRatio: 0.22,
            midDetailRatio: 0.52
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

    const loaded = await loadWebHammerEngineScene(scene);
    const instancedMeshes: InstancedMesh[] = [];

    loaded.root.traverse((child) => {
      if (child instanceof InstancedMesh) {
        instancedMeshes.push(child);
      }
    });

    expect(instancedMeshes).toHaveLength(1);
    expect(instancedMeshes[0]?.count).toBe(1);
    expect(instancedMeshes[0]?.userData.webHammer?.sourceNodeId).toBe("node:model-source");
  });

  test("matches grouped source model placement with instanced copies when model pivots are present", async () => {
    const scene: WebHammerEngineScene = {
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
          path: "",
          type: "model"
        }
      ],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-28T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 6
      },
      nodes: [
        {
          data: {},
          id: "node:group",
          kind: "group",
          name: "Group",
          transform: makeTransform(vec3(10, 0, 0))
        },
        {
          data: {
            assetId: "asset:model:source",
            path: ""
          },
          id: "node:model-source",
          kind: "model",
          name: "Model Source",
          parentId: "node:group",
          transform: {
            pivot: vec3(2, 0, 0),
            position: vec3(1, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
        },
        {
          data: {
            sourceNodeId: "node:model-source"
          },
          id: "node:model-instance",
          kind: "instancing",
          name: "Model Source Instance",
          parentId: "node:group",
          transform: {
            position: vec3(1, 0, 0),
            rotation: vec3(0, 0, 0),
            scale: vec3(1, 1, 1)
          }
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
          fogFar: 50,
          fogNear: 10,
          gravity: vec3(0, -9.81, 0),
          lod: {
            bakedAt: "",
            enabled: false,
            lowDetailRatio: 0.22,
            midDetailRatio: 0.52
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

    const loaded = await loadWebHammerEngineScene(scene);
    const sourceObject = loaded.nodes.get("node:model-source");
    const sourceMesh = findFirstMesh(sourceObject);
    const instancedMeshes: InstancedMesh[] = [];
    const instanceMatrix = new Matrix4();
    const sourceWorldPosition = sourceMesh?.getWorldPosition(new Vector3());
    const instancePosition = new Vector3();

    loaded.root.traverse((child) => {
      if (child instanceof InstancedMesh) {
        instancedMeshes.push(child);
      }
    });

    instancedMeshes[0]?.getMatrixAt(0, instanceMatrix);
    instanceMatrix.decompose(instancePosition, new Quaternion(), new Vector3());

    expect(sourceWorldPosition?.x).toBeCloseTo(instancePosition.x, 5);
    expect(sourceWorldPosition?.y).toBeCloseTo(instancePosition.y, 5);
    expect(sourceWorldPosition?.z).toBeCloseTo(instancePosition.z, 5);
  });

  test("applies emissive and transparency properties from runtime materials", async () => {
    const scene: WebHammerEngineScene = {
      assets: [],
      entities: [],
      layers: [],
      materials: [],
      metadata: {
        exportedAt: new Date("2026-03-28T10:00:00.000Z").toISOString(),
        format: "web-hammer-engine",
        version: 6
      },
      nodes: [
        {
          data: {
            role: "prop",
            shape: "cube",
            size: vec3(1, 1, 1)
          },
          geometry: {
            primitives: [
              {
                indices: [0, 1, 2, 0, 2, 3],
                material: {
                  color: "#ffffff",
                  emissiveColor: "#ff5500",
                  emissiveIntensity: 0.6,
                  id: "material:test:fx",
                  metallicFactor: 0.2,
                  name: "FX Material",
                  opacity: 0.35,
                  roughnessFactor: 0.7,
                  transparent: true
                },
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
              }
            ]
          },
          id: "node:material-probe",
          kind: "primitive",
          name: "Material Probe",
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
            bakedAt: "",
            enabled: false,
            lowDetailRatio: 0.2,
            midDetailRatio: 0.5
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

    const loaded = await loadWebHammerEngineScene(scene);
    const material = loaded.nodes.get("node:material-probe")?.children[0]?.children[0]?.children[0]?.material;

    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect((material as MeshStandardMaterial).transparent).toBe(true);
    expect((material as MeshStandardMaterial).opacity).toBeCloseTo(0.35, 5);
    expect((material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.6, 5);
    expect((material as MeshStandardMaterial).emissive.getHexString()).toBe("ff5500");
  });
});

function findFirstMesh(object: ReturnType<Awaited<ReturnType<typeof loadWebHammerEngineScene>>["nodes"]["get"]>) {
  let found: Mesh | undefined;

  object?.traverse((child) => {
    if (!found && child instanceof Mesh) {
      found = child;
    }
  });

  return found;
}
