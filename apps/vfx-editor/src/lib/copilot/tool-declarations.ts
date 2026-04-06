import type { CopilotToolDeclaration } from "./types";

export const COPILOT_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  {
    name: "get_document_summary",
    description: "Returns a compact summary of the current VFX document, selection, preview settings, budgets, and compile state.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_module_catalog",
    description: "Lists the available VFX module kinds with their intended stage, read/write attributes, and short summary.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_texture_presets",
    description: "Lists the built-in sprite texture presets the preview understands for renderer `_texture` bindings.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_graph_nodes",
    description: "Lists the main graph nodes and edges with compact binding metadata. Use this before wiring or repositioning nodes.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_emitters",
    description: "Lists effect emitters with domains, module counts, renderer counts, and binding counts.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_emitter_details",
    description: "Returns the full editable detail for one emitter, including modules, renderers, source bindings, data interfaces, and event handlers.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string", description: "Emitter id to inspect. Defaults to the selected emitter when omitted." }
      }
    }
  },
  {
    name: "list_parameters",
    description: "Lists VFX parameters with ids, names, types, defaults, and exposed flags.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_events",
    description: "Lists effect events with ids, names, and payload field definitions.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_data_interfaces",
    description: "Lists document-level data interfaces with ids, kinds, and config keys.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "create_emitter",
    description: "Creates a new emitter document and matching graph node. Use this when the effect needs a new visual layer, trail, beam, or smoke stack.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable emitter name." },
        simulationDomain: { type: "string", enum: ["particle", "ribbon", "beam"] },
        maxParticleCount: { type: "number", description: "Max alive particles for the emitter." },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" }
          }
        },
        connectToOutput: { type: "boolean", description: "Whether to connect the new emitter node to the first output node." },
        rendererTemplate: {
          type: "string",
          enum: ["BeamMaterial", "DistortionMaterial", "MeshParticleMaterial", "RibbonTrailMaterial", "SpriteAdditiveMaterial", "SpriteSmokeMaterial"],
          description: "Optional initial renderer template to attach immediately."
        }
      }
    }
  },
  {
    name: "update_emitter",
    description: "Updates core emitter properties like name, domain, capacity, attributes, or fixed bounds.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" },
        name: { type: "string" },
        simulationDomain: { type: "string", enum: ["particle", "ribbon", "beam"] },
        maxParticleCount: { type: "number" },
        attributes: { type: "object", additionalProperties: { type: "string" } },
        replaceAttributes: { type: "boolean" },
        fixedBounds: {
          type: "object",
          properties: {
            min: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
            },
            max: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
            }
          }
        },
        clearFixedBounds: { type: "boolean" }
      }
    }
  },
  {
    name: "delete_emitter",
    description: "Deletes an emitter from the document and removes graph nodes and edges bound to it.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" }
      },
      required: ["emitterId"]
    }
  },
  {
    name: "add_stage_module",
    description: "Adds a stage module to an emitter. Use it to author the actual motion, spawn, and lifecycle behavior.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" },
        stage: { type: "string", enum: ["spawn", "initialize", "update", "death"] },
        kind: {
          type: "string",
          enum: ["AlphaOverLife", "Attractor", "CollisionBounce", "CollisionQuery", "ColorOverLife", "CurlNoiseForce", "Drag", "GravityForce", "InheritVelocity", "KillByAge", "KillByDistance", "OrbitTarget", "RandomRange", "ReceiveEvent", "RibbonLink", "SendEvent", "SetAttribute", "SizeOverLife", "SpawnBurst", "SpawnCone", "SpawnFromBone", "SpawnFromMeshSurface", "SpawnFromSpline", "SpawnRate", "VelocityCone"]
        },
        label: { type: "string" },
        config: { type: "object" }
      },
      required: ["stage", "kind"]
    }
  },
  {
    name: "update_stage_module",
    description: "Updates an existing stage module, including label, enabled state, module kind, or config payload.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" },
        stage: { type: "string", enum: ["spawn", "initialize", "update", "death"] },
        moduleId: { type: "string" },
        kind: {
          type: "string",
          enum: ["AlphaOverLife", "Attractor", "CollisionBounce", "CollisionQuery", "ColorOverLife", "CurlNoiseForce", "Drag", "GravityForce", "InheritVelocity", "KillByAge", "KillByDistance", "OrbitTarget", "RandomRange", "ReceiveEvent", "RibbonLink", "SendEvent", "SetAttribute", "SizeOverLife", "SpawnBurst", "SpawnCone", "SpawnFromBone", "SpawnFromMeshSurface", "SpawnFromSpline", "SpawnRate", "VelocityCone"]
        },
        label: { type: "string" },
        enabled: { type: "boolean" },
        config: { type: "object" },
        replaceConfig: { type: "boolean" }
      },
      required: ["stage", "moduleId"]
    }
  },
  {
    name: "remove_stage_module",
    description: "Removes one module from an emitter stage.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" },
        stage: { type: "string", enum: ["spawn", "initialize", "update", "death"] },
        moduleId: { type: "string" }
      },
      required: ["stage", "moduleId"]
    }
  },
  {
    name: "upsert_parameter",
    description: "Creates or updates a parameter definition and can optionally add a matching graph node.",
    parameters: {
      type: "object",
      properties: {
        parameterId: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["bool", "color", "float", "float2", "float3", "int", "trigger"] },
        defaultValue: {},
        exposed: { type: "boolean" },
        description: { type: "string" },
        createGraphNode: { type: "boolean" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } }
        }
      },
      required: ["name", "type"]
    }
  },
  {
    name: "upsert_event",
    description: "Creates or updates an event definition and can optionally add a matching graph node.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        payload: { type: "object", additionalProperties: { type: "string" } },
        description: { type: "string" },
        createGraphNode: { type: "boolean" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } }
        }
      },
      required: ["name"]
    }
  },
  {
    name: "upsert_data_interface",
    description: "Creates or updates either a document-level or emitter-level data interface binding.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["document", "emitter"] },
        emitterId: { type: "string" },
        bindingId: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", enum: ["animationNotify", "bone", "collisionField", "depthBuffer", "meshSurface", "spline", "worldZone"] },
        config: { type: "object" },
        createGraphNode: { type: "boolean" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } }
        }
      },
      required: ["name", "kind"]
    }
  },
  {
    name: "upsert_source_binding",
    description: "Creates or updates an emitter source binding for sockets, bones, meshes, splines, or world anchors.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" },
        bindingId: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", enum: ["bone", "mesh", "socket", "spline", "world"] },
        sourceId: { type: "string" },
        config: { type: "object" }
      },
      required: ["name", "kind", "sourceId"]
    }
  },
  {
    name: "upsert_renderer",
    description: "Creates or updates an emitter renderer slot, including material settings and parameter bindings.",
    parameters: {
      type: "object",
      properties: {
        emitterId: { type: "string" },
        rendererId: { type: "string" },
        name: { type: "string" },
        template: { type: "string", enum: ["BeamMaterial", "DistortionMaterial", "MeshParticleMaterial", "RibbonTrailMaterial", "SpriteAdditiveMaterial", "SpriteSmokeMaterial"] },
        kind: { type: "string", enum: ["beam", "distortion", "mesh", "ribbon", "sprite"] },
        enabled: { type: "boolean" },
        material: { type: "object" },
        parameterBindings: { type: "object", additionalProperties: { type: "string" } },
        replaceParameterBindings: { type: "boolean" }
      },
      required: ["template"]
    }
  },
  {
    name: "upsert_graph_node",
    description: "Creates or updates a graph node, including name, position, color, and binding id for typed nodes.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        kind: { type: "string", enum: ["comment", "dataInterface", "emitter", "event", "output", "parameter", "scalability", "subgraph"] },
        name: { type: "string" },
        color: { type: "string" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } }
        },
        bindingId: { type: "string" },
        select: { type: "boolean" }
      }
    }
  },
  {
    name: "connect_graph_nodes",
    description: "Connects two graph nodes and lets the editor infer the edge label based on node kinds.",
    parameters: {
      type: "object",
      properties: {
        sourceNodeId: { type: "string" },
        targetNodeId: { type: "string" }
      },
      required: ["sourceNodeId", "targetNodeId"]
    }
  },
  {
    name: "delete_graph_nodes",
    description: "Deletes graph nodes and any connected edges.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" } }
      },
      required: ["nodeIds"]
    }
  },
  {
    name: "delete_graph_edges",
    description: "Deletes graph edges by id.",
    parameters: {
      type: "object",
      properties: {
        edgeIds: { type: "array", items: { type: "string" } }
      },
      required: ["edgeIds"]
    }
  },
  {
    name: "update_preview_settings",
    description: "Updates preview loop, duration, attach mode, or playback rate.",
    parameters: {
      type: "object",
      properties: {
        loop: { type: "boolean" },
        durationSeconds: { type: "number" },
        attachMode: { type: "string", enum: ["character", "isolated", "world"] },
        playbackRate: { type: "number" }
      }
    }
  },
  {
    name: "compile_document",
    description: "Compiles the current effect document and returns diagnostics with budget and risk summary.",
    parameters: { type: "object", properties: {} }
  }
];