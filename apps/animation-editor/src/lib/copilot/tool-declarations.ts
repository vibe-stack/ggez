import type { CopilotToolDeclaration } from "./types";

export const COPILOT_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  {
    name: "push_animation_to_connected_game",
    description: "Pushes the current animation bundle into the connected scaffolded game dev server. Use it when the user asks to sync or send the authored animation bundle to the game.",
    parameters: {
      type: "object",
      properties: {
        gameId: {
          type: "string",
          description: "Optional specific connected game ID when more than one game is available."
        },
        projectName: {
          type: "string",
          description: "Optional display name override for the pushed animation bundle."
        },
        projectSlug: {
          type: "string",
          description: "Optional slug override for the target animation folder."
        }
      }
    }
  },
  {
    name: "get_document_summary",
    description: "Returns a compact summary of the current animation document, including counts and high-level ids.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_clips",
    description: "Lists imported clip metadata only: id, name, duration, and source. Does not return raw animation payloads.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "create_clip",
    description: "Creates a new clip asset the editor can preview, edit, and export. Optionally clone an existing clip first, then refine it with sparse set_clip_track_data passes or adjust_clip_motion.",
    parameters: {
      type: "object",
      properties: {
        clipId: { type: "string", description: "Optional explicit clip id. Defaults to a slug from the name." },
        name: { type: "string", description: "Human-readable clip name." },
        duration: { type: "number", description: "Clip duration in seconds. Defaults to 1." },
        duplicateFromClipId: { type: "string", description: "Optional existing clip id to duplicate as the starting point." },
        rootBoneIndex: { type: "number", description: "Optional explicit root bone index." },
        source: { type: "string", description: "Optional source label. Defaults to ai-generated." }
      },
      required: ["name"]
    }
  },
  {
    name: "duplicate_clip_as_variant",
    description: "Creates a new clip by duplicating an existing clip as a starting point. Prefer this when the user wants a variant, alternate timing, or a modified version of an existing animation.",
    parameters: {
      type: "object",
      properties: {
        sourceClipId: { type: "string", description: "Existing clip id to duplicate." },
        name: { type: "string", description: "Name for the new variant clip." },
        clipId: { type: "string", description: "Optional explicit id for the new variant." },
        duration: { type: "number", description: "Optional duration override for the duplicated clip." },
        rootBoneIndex: { type: "number", description: "Optional explicit root bone index override." },
        source: { type: "string", description: "Optional source label. Defaults to ai-generated-variant." }
      },
      required: ["sourceClipId", "name"]
    }
  },
  {
    name: "create_pose_clip",
    description: "Creates a new sparse blockout clip from a sequence of key poses. Use this for first-pass authoring instead of many per-bone set_clip_track_data calls.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable clip name." },
        clipId: { type: "string", description: "Optional explicit clip id." },
        duration: { type: "number", description: "Optional clip duration override. Defaults to the last pose time or 1." },
        rootBoneIndex: { type: "number", description: "Optional explicit root bone index." },
        source: { type: "string", description: "Optional source label. Defaults to ai-generated." },
        poses: {
          type: "array",
          description: "Sparse key poses as [{ time, bones: [{ boneName|boneIndex, translation?, rotation?, scale? }] }].",
          items: {
            type: "object",
            properties: {
              time: { type: "number" },
              bones: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    boneName: { type: "string" },
                    boneIndex: { type: "number" },
                    translation: { type: "array", items: { type: "number" } },
                    rotation: { type: "array", items: { type: "number" } },
                    scale: { type: "array", items: { type: "number" } }
                  }
                }
              }
            },
            required: ["time", "bones"]
          }
        }
      },
      required: ["name", "poses"]
    }
  },
  {
    name: "list_clip_bones",
    description: "Lists animated bones for a clip, including which channels exist and how many keys each channel has. Use this before reading raw track data.",
    parameters: {
      type: "object",
      properties: {
        clipId: { type: "string", description: "Clip id to inspect." },
        query: { type: "string", description: "Optional bone-name search filter." }
      },
      required: ["clipId"]
    }
  },
  {
    name: "get_clip_track_data",
    description: "Returns raw animation track data for selected bones in a clip. Prefer passing boneNames or boneIndices. Set includeAllBones=true only when a whole-clip read is truly necessary.",
    parameters: {
      type: "object",
      properties: {
        clipId: { type: "string" },
        boneNames: { type: "array", items: { type: "string" } },
        boneIndices: { type: "array", items: { type: "number" } },
        channels: { type: "array", items: { type: "string", enum: ["translation", "rotation", "scale"] } },
        timeStart: { type: "number" },
        timeEnd: { type: "number" },
        includeAllBones: { type: "boolean", description: "Must be true to read all animated bones without a filter." }
      },
      required: ["clipId"]
    }
  },
  {
    name: "set_clip_track_data",
    description: "Creates or replaces keyframes for one clip bone/channel. Use this to author new motion from scratch or overwrite a duplicated clip on selected bones. Prefer a few important keys first instead of dense frame-by-frame data unless the user explicitly asks for that.",
    parameters: {
      type: "object",
      properties: {
        clipId: { type: "string", description: "Clip id to modify." },
        boneName: { type: "string", description: "Target bone name. Prefer this when a rig is present." },
        boneIndex: { type: "number", description: "Target bone index when boneName is unavailable." },
        channel: { type: "string", enum: ["translation", "rotation", "scale"], description: "Transform channel to write." },
        duration: { type: "number", description: "Optional clip duration override." },
        frames: {
          type: "array",
          description: "Keyframes as [{ time, values }]. Values length must be 3 for translation/scale and 4 for rotation quaternions.",
          items: {
            type: "object",
            properties: {
              time: { type: "number" },
              values: { type: "array", items: { type: "number" } }
            },
            required: ["time", "values"]
          }
        }
      },
      required: ["clipId", "channel", "frames"]
    }
  },
  {
    name: "adjust_clip_motion",
    description: "Applies a targeted motion edit to selected clip bones and channels. Use scale to reduce or amplify motion, offset to bias values, and smooth to damp jitter.",
    parameters: {
      type: "object",
      properties: {
        clipId: { type: "string" },
        boneNames: { type: "array", items: { type: "string" } },
        boneIndices: { type: "array", items: { type: "number" } },
        channels: { type: "array", items: { type: "string", enum: ["translation", "rotation", "scale"] } },
        components: { type: "array", items: { type: "string", enum: ["X", "Y", "Z", "W"] } },
        operation: { type: "string", enum: ["scale", "offset", "smooth"] },
        factor: { type: "number", description: "Scale multiplier for scale operations." },
        offset: { type: "number", description: "Scalar offset applied to selected components." },
        offsets: { type: "array", items: { type: "number" }, description: "Per-component offsets, in the same order as selected components." },
        timeStart: { type: "number" },
        timeEnd: { type: "number" },
        feather: { type: "number", description: "Softens the start/end of the edit window." },
        pivotTime: { type: "number", description: "Reference time used as the pivot for scale operations." },
        iterations: { type: "number", description: "Smoothing pass count for smooth operations." }
      },
      required: ["clipId", "operation"]
    }
  },
  {
    name: "match_clip_transition",
    description: "Adjusts the tail of one clip and/or the start of another so the cut between them is smoother over a blend duration.",
    parameters: {
      type: "object",
      properties: {
        fromClipId: { type: "string" },
        toClipId: { type: "string" },
        boneNames: { type: "array", items: { type: "string" } },
        boneIndices: { type: "array", items: { type: "number" } },
        channels: { type: "array", items: { type: "string", enum: ["translation", "rotation", "scale"] } },
        duration: { type: "number", description: "Blend window in seconds." },
        editMode: { type: "string", enum: ["from", "to", "both"], description: "Which side of the cut should be edited." }
      },
      required: ["fromClipId", "toClipId"]
    }
  },
  {
    name: "list_parameters",
    description: "Lists all animation parameters with ids, names, types, and defaults.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_layers",
    description: "Lists animation layers and their graph, blend, mask, and root-motion settings.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_masks",
    description: "Lists authored masks and their root/weight metadata.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_rig_summary",
    description: "Returns the imported rig summary, including bone count and bone names.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_graphs",
    description: "Lists graphs with ids, names, output nodes, node counts, and edge counts.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_graph_details",
    description: "Returns detailed metadata for a single graph, including node summaries, graph edges, and state-machine summaries.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string", description: "Graph id to inspect." }
      },
      required: ["graphId"]
    }
  },
  {
    name: "set_entry_graph",
    description: "Sets the document entry graph used as the default runtime entry point.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string", description: "Graph id to promote to entry graph." }
      },
      required: ["graphId"]
    }
  },
  {
    name: "add_graph",
    description: "Adds a new graph and optionally makes it the entry graph.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable graph name." },
        setAsEntry: { type: "boolean", description: "Whether to set the new graph as the entry graph." }
      }
    }
  },
  {
    name: "rename_graph",
    description: "Renames an existing graph.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        name: { type: "string" }
      },
      required: ["graphId", "name"]
    }
  },
  {
    name: "add_node",
    description: "Adds a node to a graph and optionally sets common and node-kind-specific properties.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        kind: { type: "string", enum: ["clip", "blend1d", "blend2d", "selector", "orientationWarp", "strideWarp", "stateMachine", "subgraph"] },
        name: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        clipId: { type: "string" },
        speed: { type: "number" },
        loop: { type: "boolean" },
        inPlace: { type: "boolean" },
        syncGroup: { type: "string" },
        parameterId: { type: "string" },
        xParameterId: { type: "string" },
        yParameterId: { type: "string" },
        subgraphId: { type: "string" },
        sourceNodeId: { type: "string" },
        angleParameterId: { type: "string" },
        maxAngle: { type: "number" },
        weight: { type: "number" },
        hipBoneName: { type: "string" },
        hipWeight: { type: "number" },
        spineBoneNames: { type: "array", items: { type: "string" } },
        evaluationMode: { type: "string", enum: ["graph", "manual"] },
        locomotionSpeedParameterId: { type: "string" },
        strideDirection: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" }
          }
        },
        manualStrideScale: { type: "number" },
        minLocomotionSpeedThreshold: { type: "number" },
        pelvisBoneName: { type: "string" },
        pelvisWeight: { type: "number" },
        clampResult: { type: "boolean" },
        minStrideScale: { type: "number" },
        maxStrideScale: { type: "number" },
        interpResult: { type: "boolean" },
        interpSpeedIncreasing: { type: "number" },
        interpSpeedDecreasing: { type: "number" },
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              upperBoneName: { type: "string" },
              lowerBoneName: { type: "string" },
              footBoneName: { type: "string" },
              weight: { type: "number" }
            },
            required: ["upperBoneName", "lowerBoneName", "footBoneName"]
          }
        }
      },
      required: ["graphId", "kind"]
    }
  },
  {
    name: "update_node",
    description: "Updates common node fields and safe node-kind-specific fields. Use connect_nodes for wiring and set_blend_children for blend thresholds or points.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        nodeId: { type: "string" },
        name: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        comment: { type: "string" },
        color: { type: "string" },
        collapsed: { type: "boolean" },
        clipId: { type: "string" },
        speed: { type: "number" },
        loop: { type: "boolean" },
        inPlace: { type: "boolean" },
        syncGroup: { type: "string" },
        parameterId: { type: "string" },
        xParameterId: { type: "string" },
        yParameterId: { type: "string" },
        subgraphId: { type: "string" },
        sourceNodeId: { type: "string" },
        angleParameterId: { type: "string" },
        maxAngle: { type: "number" },
        weight: { type: "number" },
        hipBoneName: { type: "string" },
        hipWeight: { type: "number" },
        spineBoneNames: { type: "array", items: { type: "string" } },
        evaluationMode: { type: "string", enum: ["graph", "manual"] },
        locomotionSpeedParameterId: { type: "string" },
        strideDirection: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" }
          }
        },
        manualStrideScale: { type: "number" },
        minLocomotionSpeedThreshold: { type: "number" },
        pelvisBoneName: { type: "string" },
        pelvisWeight: { type: "number" },
        clampResult: { type: "boolean" },
        minStrideScale: { type: "number" },
        maxStrideScale: { type: "number" },
        interpResult: { type: "boolean" },
        interpSpeedIncreasing: { type: "number" },
        interpSpeedDecreasing: { type: "number" },
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              upperBoneName: { type: "string" },
              lowerBoneName: { type: "string" },
              footBoneName: { type: "string" },
              weight: { type: "number" }
            },
            required: ["upperBoneName", "lowerBoneName", "footBoneName"]
          }
        }
      },
      required: ["graphId", "nodeId"]
    }
  },
  {
    name: "connect_nodes",
    description: "Connects a source node to a target output or blend node, updating both semantic references and graph edges.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        sourceNodeId: { type: "string" },
        targetNodeId: { type: "string" }
      },
      required: ["graphId", "sourceNodeId", "targetNodeId"]
    }
  },
  {
    name: "set_blend_children",
    description: "Replaces the children list for a blend node. Use this after wiring nodes to assign exact thresholds or 2D sample coordinates.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        nodeId: { type: "string" },
        children: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              threshold: { type: "number" },
              x: { type: "number" },
              y: { type: "number" },
              label: { type: "string" }
            },
            required: ["nodeId"]
          }
        }
      },
      required: ["graphId", "nodeId", "children"]
    }
  },
  {
    name: "set_selector_children",
    description: "Replaces the children list for a selector node. Use this after wiring nodes to assign exact integer values.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        nodeId: { type: "string" },
        children: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              value: { type: "number" },
              label: { type: "string" }
            },
            required: ["nodeId"]
          }
        }
      },
      required: ["graphId", "nodeId", "children"]
    }
  },
  {
    name: "delete_edges",
    description: "Deletes graph edges by id and disconnects semantic references where applicable.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        edgeIds: { type: "array", items: { type: "string" } }
      },
      required: ["graphId", "edgeIds"]
    }
  },
  {
    name: "delete_nodes",
    description: "Deletes specific graph nodes by id.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        nodeIds: { type: "array", items: { type: "string" } }
      },
      required: ["graphId", "nodeIds"]
    }
  },
  {
    name: "add_parameter",
    description: "Adds a new animation parameter.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["float", "int", "bool", "trigger"] },
        defaultValue: { type: ["number", "boolean"] }
      },
      required: ["name", "type"]
    }
  },
  {
    name: "update_parameter",
    description: "Updates an existing parameter.",
    parameters: {
      type: "object",
      properties: {
        parameterId: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["float", "int", "bool", "trigger"] },
        defaultValue: { type: ["number", "boolean"] }
      },
      required: ["parameterId"]
    }
  },
  {
    name: "add_layer",
    description: "Adds a new animation layer.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        graphId: { type: "string" },
        weight: { type: "number" },
        blendMode: { type: "string", enum: ["override", "additive"] },
        maskId: { type: "string" },
        rootMotionMode: { type: "string", enum: ["none", "full", "xz", "xz-yaw"] },
        enabled: { type: "boolean" }
      }
    }
  },
  {
    name: "update_layer",
    description: "Updates a layer's routing or blend settings.",
    parameters: {
      type: "object",
      properties: {
        layerId: { type: "string" },
        name: { type: "string" },
        graphId: { type: "string" },
        weight: { type: "number" },
        blendMode: { type: "string", enum: ["override", "additive"] },
        maskId: { type: "string" },
        rootMotionMode: { type: "string", enum: ["none", "full", "xz", "xz-yaw"] },
        enabled: { type: "boolean" }
      },
      required: ["layerId"]
    }
  },
  {
    name: "add_mask",
    description: "Adds a new bone mask.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        rootBoneName: { type: "string" },
        includeChildren: { type: "boolean" },
        weights: {
          type: "array",
          items: {
            type: "object",
            properties: {
              boneName: { type: "string" },
              weight: { type: "number" }
            },
            required: ["boneName", "weight"]
          }
        }
      },
      required: ["name"]
    }
  },
  {
    name: "update_mask",
    description: "Updates an existing mask's root or explicit bone weights.",
    parameters: {
      type: "object",
      properties: {
        maskId: { type: "string" },
        name: { type: "string" },
        rootBoneName: { type: "string" },
        includeChildren: { type: "boolean" },
        weights: {
          type: "array",
          items: {
            type: "object",
            properties: {
              boneName: { type: "string" },
              weight: { type: "number" }
            },
            required: ["boneName", "weight"]
          }
        }
      },
      required: ["maskId"]
    }
  },
  {
    name: "create_state",
    description: "Adds a state to a state machine node.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        name: { type: "string" },
        motionNodeId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        speed: { type: "number" },
        cycleOffset: { type: "number" },
        setAsEntry: { type: "boolean" }
      },
      required: ["graphId", "stateMachineNodeId", "name", "motionNodeId"]
    }
  },
  {
    name: "update_state",
    description: "Updates a state inside a state machine.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        stateId: { type: "string" },
        name: { type: "string" },
        motionNodeId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        speed: { type: "number" },
        cycleOffset: { type: "number" }
      },
      required: ["graphId", "stateMachineNodeId", "stateId"]
    }
  },
  {
    name: "delete_state",
    description: "Deletes a state from a state machine and removes transitions that target it.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        stateId: { type: "string" }
      },
      required: ["graphId", "stateMachineNodeId", "stateId"]
    }
  },
  {
    name: "set_state_machine_entry",
    description: "Sets the entry state for a state machine.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        stateId: { type: "string" }
      },
      required: ["graphId", "stateMachineNodeId", "stateId"]
    }
  },
  {
    name: "add_transition",
    description: "Adds a transition or any-state transition to a state machine.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        toStateId: { type: "string" },
        fromStateId: { type: "string" },
        anyState: { type: "boolean" },
        duration: { type: "number" },
        blendCurve: { type: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] },
        syncNormalizedTime: { type: "boolean" },
        hasExitTime: { type: "boolean" },
        exitTime: { type: "number" },
        interruptionSource: { type: "string", enum: ["none", "current", "next", "both"] },
        conditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              parameterId: { type: "string" },
              operator: { type: "string", enum: [">", ">=", "<", "<=", "==", "!=", "set"] },
              value: { type: ["number", "boolean"] }
            },
            required: ["parameterId", "operator"]
          }
        }
      },
      required: ["graphId", "stateMachineNodeId", "toStateId"]
    }
  },
  {
    name: "update_transition",
    description: "Updates a transition inside a state machine.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        transitionId: { type: "string" },
        anyState: { type: "boolean" },
        fromStateId: { type: "string" },
        toStateId: { type: "string" },
        duration: { type: "number" },
        blendCurve: { type: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] },
        syncNormalizedTime: { type: "boolean" },
        hasExitTime: { type: "boolean" },
        exitTime: { type: "number" },
        interruptionSource: { type: "string", enum: ["none", "current", "next", "both"] },
        conditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              parameterId: { type: "string" },
              operator: { type: "string", enum: [">", ">=", "<", "<=", "==", "!=", "set"] },
              value: { type: ["number", "boolean"] }
            },
            required: ["parameterId", "operator"]
          }
        }
      },
      required: ["graphId", "stateMachineNodeId", "transitionId"]
    }
  },
  {
    name: "delete_transition",
    description: "Deletes a transition from a state machine.",
    parameters: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        stateMachineNodeId: { type: "string" },
        transitionId: { type: "string" },
        anyState: { type: "boolean" }
      },
      required: ["graphId", "stateMachineNodeId", "transitionId"]
    }
  },
  {
    name: "compile_document",
    description: "Compiles the current animation document and returns diagnostic summaries.",
    parameters: { type: "object", properties: {} }
  }
];
