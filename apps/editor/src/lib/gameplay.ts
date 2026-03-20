import type { GameplayObject, GameplayValue, SceneEventDefinition, SceneHook } from "@ggez/shared";

type HookFieldCondition = {
  equals?: GameplayValue;
  path: string;
};

type HookFieldBase = {
  description?: string;
  label: string;
  path: string;
  placeholder?: string;
  showWhen?: HookFieldCondition;
};

export type HookFieldDefinition =
  | (HookFieldBase & {
      kind: "boolean";
    })
  | (HookFieldBase & {
      kind: "enum";
      options: Array<{ label: string; value: string }>;
    })
  | (HookFieldBase & {
      kind: "event-conditions";
    })
  | (HookFieldBase & {
      kind: "event-list";
    })
  | (HookFieldBase & {
      kind: "event-map";
      valueLabel: string;
      valuePlaceholder?: string;
    })
  | (HookFieldBase & {
      kind: "grants";
    })
  | (HookFieldBase & {
      kind: "key-value";
      valueType: "number" | "string";
    })
  | (HookFieldBase & {
      kind: "number";
      min?: number;
      step?: number;
    })
  | (HookFieldBase & {
      kind: "scalar";
    })
  | (HookFieldBase & {
      kind: "scene-path";
    })
  | (HookFieldBase & {
      kind: "sequence-actions";
    })
  | (HookFieldBase & {
      kind: "sequence-trigger";
    })
  | (HookFieldBase & {
      kind: "string-list";
    })
  | (HookFieldBase & {
      kind: "target-states";
    })
  | (HookFieldBase & {
      kind: "text";
      multiline?: boolean;
    })
  | (HookFieldBase & {
      kind: "vec3";
      step?: number;
    });

export type HookDefinition = {
  category: string;
  description: string;
  emits: string[];
  fields: HookFieldDefinition[];
  label: string;
  listens: string[];
  type: string;
};

const hookDefinitionEntries: Array<HookDefinition & { defaultConfig: SceneHook["config"] }> = [
  {
    category: "Core",
    defaultConfig: {
      tags: []
    },
    description: "Semantic labels for filtering, gameplay queries, and editor grouping.",
    emits: [],
    fields: [
      {
        kind: "string-list",
        label: "Tags",
        path: "tags",
        placeholder: "door"
      }
    ],
    label: "Tags",
    listens: [],
    type: "tags"
  },
  {
    category: "Interaction",
    defaultConfig: {
      allowedActors: [],
      emits: ["interact.requested"],
      prompt: "Use",
      range: 2,
      requiresLineOfSight: true
    },
    description: "Lets actors manually use the object and emit interaction requests.",
    emits: ["interact.requested", "interact.started", "interact.denied"],
    fields: [
      {
        kind: "text",
        label: "Prompt",
        path: "prompt",
        placeholder: "Open Door"
      },
      {
        kind: "number",
        label: "Range",
        min: 0,
        path: "range",
        step: 0.1
      },
      {
        kind: "boolean",
        label: "Requires Line Of Sight",
        path: "requiresLineOfSight"
      },
      {
        kind: "string-list",
        label: "Allowed Actors",
        path: "allowedActors",
        placeholder: "player"
      },
      {
        kind: "event-list",
        label: "Emit Events",
        path: "emits"
      }
    ],
    label: "Interactable",
    listens: [],
    type: "interactable"
  },
  {
    category: "Interaction",
    defaultConfig: {
      cooldown: 0,
      emits: ["trigger.enter"],
      filters: ["player"],
      fireOnce: false,
      height: 2,
      radius: 2,
      shape: "box",
      size: [4, 2, 4]
    },
    description: "Detects overlaps and emits enter, exit, or stay events.",
    emits: ["trigger.enter", "trigger.exit", "trigger.stay"],
    fields: [
      {
        kind: "enum",
        label: "Shape",
        options: [
          { label: "Box", value: "box" },
          { label: "Sphere", value: "sphere" },
          { label: "Capsule", value: "capsule" }
        ],
        path: "shape"
      },
      {
        kind: "vec3",
        label: "Size",
        path: "size",
        showWhen: {
          equals: "box",
          path: "shape"
        },
        step: 0.1
      },
      {
        kind: "number",
        label: "Radius",
        min: 0,
        path: "radius",
        showWhen: {
          equals: "sphere",
          path: "shape"
        },
        step: 0.1
      },
      {
        kind: "number",
        label: "Radius",
        min: 0,
        path: "radius",
        showWhen: {
          equals: "capsule",
          path: "shape"
        },
        step: 0.1
      },
      {
        kind: "number",
        label: "Height",
        min: 0,
        path: "height",
        showWhen: {
          equals: "capsule",
          path: "shape"
        },
        step: 0.1
      },
      {
        kind: "string-list",
        label: "Filters",
        path: "filters",
        placeholder: "player"
      },
      {
        kind: "boolean",
        label: "Fire Once",
        path: "fireOnce"
      },
      {
        kind: "number",
        label: "Cooldown",
        min: 0,
        path: "cooldown",
        step: 0.1
      },
      {
        kind: "event-list",
        label: "Emit Events",
        path: "emits"
      }
    ],
    label: "Trigger Volume",
    listens: [],
    type: "trigger_volume"
  },
  {
    category: "State",
    defaultConfig: {
      autoUnlock: false,
      code: "",
      consumesKey: false,
      expectedValue: true,
      flag: "",
      itemId: "",
      keyId: "",
      mode: "key",
      teamId: ""
    },
    description: "Guards a transition behind keys, items, flags, teams, or codes.",
    emits: ["lock.allowed", "lock.denied", "lock.unlocked"],
    fields: [
      {
        kind: "enum",
        label: "Mode",
        options: [
          { label: "Key", value: "key" },
          { label: "Item", value: "item" },
          { label: "Flag", value: "flag" },
          { label: "Team", value: "team" },
          { label: "Code", value: "code" }
        ],
        path: "mode"
      },
      {
        kind: "text",
        label: "Key Id",
        path: "keyId",
        placeholder: "lab_a",
        showWhen: {
          equals: "key",
          path: "mode"
        }
      },
      {
        kind: "text",
        label: "Item Id",
        path: "itemId",
        placeholder: "passcard",
        showWhen: {
          equals: "item",
          path: "mode"
        }
      },
      {
        kind: "text",
        label: "Flag",
        path: "flag",
        placeholder: "power_restored",
        showWhen: {
          equals: "flag",
          path: "mode"
        }
      },
      {
        kind: "scalar",
        label: "Expected Value",
        path: "expectedValue",
        showWhen: {
          equals: "flag",
          path: "mode"
        }
      },
      {
        kind: "text",
        label: "Team Id",
        path: "teamId",
        placeholder: "security",
        showWhen: {
          equals: "team",
          path: "mode"
        }
      },
      {
        kind: "text",
        label: "Code",
        path: "code",
        placeholder: "042",
        showWhen: {
          equals: "code",
          path: "mode"
        }
      },
      {
        kind: "boolean",
        label: "Consumes Key",
        path: "consumesKey",
        showWhen: {
          equals: "key",
          path: "mode"
        }
      },
      {
        kind: "boolean",
        label: "Auto Unlock",
        path: "autoUnlock"
      }
    ],
    label: "Lock",
    listens: ["interact.requested", "open.requested", "unlock.requested"],
    type: "lock"
  },
  {
    category: "State",
    defaultConfig: {
      autoClose: false,
      autoCloseDelay: 2,
      initialState: "closed",
      mode: "slide"
    },
    description: "Tracks open and close state for doors, gates, and hatches.",
    emits: ["open.started", "open.completed", "close.started", "close.completed", "state.changed"],
    fields: [
      {
        kind: "enum",
        label: "Mode",
        options: [
          { label: "Swing", value: "swing" },
          { label: "Slide", value: "slide" },
          { label: "Lift", value: "lift" },
          { label: "Animate", value: "animate" }
        ],
        path: "mode"
      },
      {
        kind: "enum",
        label: "Initial State",
        options: [
          { label: "Closed", value: "closed" },
          { label: "Open", value: "open" }
        ],
        path: "initialState"
      },
      {
        kind: "boolean",
        label: "Auto Close",
        path: "autoClose"
      },
      {
        kind: "number",
        label: "Auto Close Delay",
        min: 0,
        path: "autoCloseDelay",
        step: 0.1
      }
    ],
    label: "Openable",
    listens: ["open.requested", "close.requested", "toggle.requested", "lock.denied"],
    type: "openable"
  },
  {
    category: "Motion",
    defaultConfig: {
      animationName: "",
      duration: 0.8,
      easing: "easeInOut",
      kind: "lerp_transform",
      targets: {
        closed: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        },
        open: {
          position: [0, 2.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    },
    description: "Animates transforms or authored clips between named states.",
    emits: ["move.started", "move.completed"],
    fields: [
      {
        kind: "enum",
        label: "Kind",
        options: [
          { label: "Lerp Transform", value: "lerp_transform" },
          { label: "Rotation", value: "rotation" },
          { label: "Animation", value: "animation" }
        ],
        path: "kind"
      },
      {
        kind: "number",
        label: "Duration",
        min: 0,
        path: "duration",
        step: 0.05
      },
      {
        kind: "text",
        label: "Easing",
        path: "easing",
        placeholder: "easeInOut"
      },
      {
        kind: "text",
        label: "Animation Name",
        path: "animationName",
        placeholder: "door_open"
      },
      {
        kind: "target-states",
        label: "Target States",
        path: "targets"
      }
    ],
    label: "Mover",
    listens: ["move.to", "open.started", "close.started"],
    type: "mover"
  },
  {
    category: "Motion",
    defaultConfig: {
      active: false,
      loop: false,
      pathId: "",
      reverse: false,
      speed: 6,
      stopAtEnd: true
    },
    description: "Moves an entity root along a predefined path or spline.",
    emits: ["path.started", "path.stopped", "path.completed", "path.node_reached"],
    fields: [
      {
        kind: "scene-path",
        label: "Path Id",
        path: "pathId",
        placeholder: "subway_line_01"
      },
      {
        kind: "number",
        label: "Speed",
        min: 0,
        path: "speed",
        step: 0.1
      },
      {
        kind: "boolean",
        label: "Active",
        path: "active"
      },
      {
        kind: "boolean",
        label: "Loop",
        path: "loop"
      },
      {
        kind: "boolean",
        label: "Reverse",
        path: "reverse"
      },
      {
        kind: "boolean",
        label: "Stop At End",
        path: "stopAtEnd"
      }
    ],
    label: "Path Mover",
    listens: ["path.start", "path.stop", "path.pause", "path.resume", "path.reverse"],
    type: "path_mover"
  },
  {
    category: "Inventory",
    defaultConfig: {
      consumeOnPickup: true,
      grants: [
        {
          id: "lab_a",
          kind: "key"
        }
      ],
      requiresInteract: false
    },
    description: "Gives keys, items, health, ammo, or flags on contact or interaction.",
    emits: ["pickup.requested", "pickup.completed", "pickup.denied"],
    fields: [
      {
        kind: "grants",
        label: "Grants",
        path: "grants"
      },
      {
        kind: "boolean",
        label: "Consume On Pickup",
        path: "consumeOnPickup"
      },
      {
        kind: "boolean",
        label: "Requires Interact",
        path: "requiresInteract"
      }
    ],
    label: "Pickup",
    listens: [],
    type: "pickup"
  },
  {
    category: "Inventory",
    defaultConfig: {
      initialKeys: []
    },
    description: "Stores keys on the player or another actor-local inventory.",
    emits: [],
    fields: [
      {
        kind: "string-list",
        label: "Initial Keys",
        path: "initialKeys",
        placeholder: "lab_a"
      }
    ],
    label: "Inventory Keys",
    listens: [],
    type: "inventory_keys"
  },
  {
    category: "Combat",
    defaultConfig: {
      initial: 100,
      max: 100
    },
    description: "Defines local health values.",
    emits: ["health.changed", "health.zero"],
    fields: [
      {
        kind: "number",
        label: "Max",
        min: 0,
        path: "max",
        step: 1
      },
      {
        kind: "number",
        label: "Initial",
        min: 0,
        path: "initial",
        step: 1
      }
    ],
    label: "Health",
    listens: [],
    type: "health"
  },
  {
    category: "Combat",
    defaultConfig: {
      factions: [],
      multipliers: {}
    },
    description: "Receives damage and optionally applies per-type multipliers.",
    emits: ["damage.received", "damage.killed"],
    fields: [
      {
        kind: "string-list",
        label: "Factions",
        path: "factions",
        placeholder: "player"
      },
      {
        kind: "key-value",
        label: "Damage Multipliers",
        path: "multipliers",
        valueType: "number"
      }
    ],
    label: "Damageable",
    listens: ["damage.apply"],
    type: "damageable"
  },
  {
    category: "Combat",
    defaultConfig: {
      destroyedPrefabId: "",
      disableOnDestroy: true,
      mode: "disable"
    },
    description: "Defines what happens when the entity is destroyed.",
    emits: ["destroy.started", "destroy.completed"],
    fields: [
      {
        kind: "enum",
        label: "Mode",
        options: [
          { label: "Swap Mesh", value: "swap_mesh" },
          { label: "Spawn Prefab", value: "spawn_prefab" },
          { label: "Disable", value: "disable" },
          { label: "Explode", value: "explode" }
        ],
        path: "mode"
      },
      {
        kind: "text",
        label: "Destroyed Prefab Id",
        path: "destroyedPrefabId",
        placeholder: "debris_crate"
      },
      {
        kind: "boolean",
        label: "Disable On Destroy",
        path: "disableOnDestroy"
      }
    ],
    label: "Destructible",
    listens: ["damage.killed", "destroy.requested"],
    type: "destructible"
  },
  {
    category: "Spawning",
    defaultConfig: {
      active: false,
      count: 1,
      maxAlive: 3,
      prefabId: "",
      respawn: false,
      respawnDelay: 5,
      spawnRadius: 0
    },
    description: "Spawns prefabs or runtime actors on demand.",
    emits: ["spawn.completed", "spawn.failed"],
    fields: [
      {
        kind: "text",
        label: "Prefab Id",
        path: "prefabId",
        placeholder: "zombie_runner"
      },
      {
        kind: "number",
        label: "Count",
        min: 0,
        path: "count",
        step: 1
      },
      {
        kind: "boolean",
        label: "Active",
        path: "active"
      },
      {
        kind: "boolean",
        label: "Respawn",
        path: "respawn"
      },
      {
        kind: "number",
        label: "Respawn Delay",
        min: 0,
        path: "respawnDelay",
        step: 0.1
      },
      {
        kind: "number",
        label: "Spawn Radius",
        min: 0,
        path: "spawnRadius",
        step: 0.1
      },
      {
        kind: "number",
        label: "Max Alive",
        min: 0,
        path: "maxAlive",
        step: 1
      }
    ],
    label: "Spawner",
    listens: ["spawn.requested", "spawner.activate", "spawner.deactivate"],
    type: "spawner"
  },
  {
    category: "AI",
    defaultConfig: {
      aggroRange: 12,
      behaviorTreeId: "",
      enabled: true,
      faction: "neutral"
    },
    description: "Toggles AI runtime behavior and high-level combat metadata.",
    emits: ["ai.enabled", "ai.disabled", "ai.target_acquired", "ai.dead"],
    fields: [
      {
        kind: "boolean",
        label: "Active",
        path: "enabled"
      },
      {
        kind: "text",
        label: "Behavior Tree Id",
        path: "behaviorTreeId",
        placeholder: "guard_patrol"
      },
      {
        kind: "text",
        label: "Faction",
        path: "faction",
        placeholder: "security"
      },
      {
        kind: "number",
        label: "Aggro Range",
        min: 0,
        path: "aggroRange",
        step: 0.1
      }
    ],
    label: "AI Agent",
    listens: ["ai.enable", "ai.disable", "ai.set_target"],
    type: "ai_agent"
  },
  {
    category: "Feedback",
    defaultConfig: {
      autoPlay: false,
      channel: "sfx",
      clip: "",
      distanceModel: "inverse",
      loop: false,
      maxDistance: 10000,
      pitch: 1,
      refDistance: 1,
      rolloffFactor: 1,
      spatial: false,
      stopEvent: "",
      triggerEvent: "",
      volume: 1
    },
    description: "Plays audio clips in response to gameplay events with optional 3D spatial positioning.",
    emits: ["audio.play", "audio.stop"],
    fields: [
      {
        kind: "text",
        label: "Clip",
        path: "clip",
        placeholder: "door_open.ogg"
      },
      {
        kind: "enum",
        label: "Channel",
        options: [
          { label: "SFX", value: "sfx" },
          { label: "Music", value: "music" },
          { label: "Ambient", value: "ambient" },
          { label: "UI", value: "ui" },
          { label: "Voice", value: "voice" }
        ],
        path: "channel"
      },
      {
        kind: "number",
        label: "Volume",
        min: 0,
        path: "volume",
        step: 0.05
      },
      {
        kind: "number",
        label: "Pitch",
        min: 0.1,
        path: "pitch",
        step: 0.05
      },
      {
        kind: "boolean",
        label: "Loop",
        path: "loop"
      },
      {
        kind: "boolean",
        label: "Auto Play",
        path: "autoPlay"
      },
      {
        kind: "boolean",
        label: "Spatial",
        path: "spatial"
      },
      {
        kind: "enum",
        label: "Distance Model",
        options: [
          { label: "Inverse", value: "inverse" },
          { label: "Linear", value: "linear" },
          { label: "Exponential", value: "exponential" }
        ],
        path: "distanceModel",
        showWhen: { path: "spatial", equals: true }
      },
      {
        kind: "number",
        label: "Ref Distance",
        min: 0,
        path: "refDistance",
        step: 0.5,
        showWhen: { path: "spatial", equals: true }
      },
      {
        kind: "number",
        label: "Max Distance",
        min: 0,
        path: "maxDistance",
        step: 1,
        showWhen: { path: "spatial", equals: true }
      },
      {
        kind: "number",
        label: "Rolloff Factor",
        min: 0,
        path: "rolloffFactor",
        step: 0.1,
        showWhen: { path: "spatial", equals: true }
      },
      {
        kind: "text",
        label: "Trigger Event",
        path: "triggerEvent",
        placeholder: "open.started"
      },
      {
        kind: "text",
        label: "Stop Event",
        path: "stopEvent",
        placeholder: "close.completed"
      }
    ],
    label: "Audio Emitter",
    listens: ["audio.play", "audio.stop", "audio.stop_all"],
    type: "audio_emitter"
  },
  {
    category: "Feedback",
    defaultConfig: {
      eventMap: {
        "damage.received": "sparks_hit"
      }
    },
    description: "Triggers particles or visual effects from gameplay events.",
    emits: [],
    fields: [
      {
        kind: "event-map",
        label: "Event Map",
        path: "eventMap",
        valueLabel: "VFX Id",
        valuePlaceholder: "sparks_hit"
      }
    ],
    label: "VFX Emitter",
    listens: ["vfx.play", "vfx.stop"],
    type: "vfx_emitter"
  },
  {
    category: "Flags",
    defaultConfig: {},
    description: "Writes world or mission flags when addressed by events.",
    emits: ["flag.changed"],
    fields: [],
    label: "Flag Setter",
    listens: ["flag.set"],
    type: "flag_setter"
  },
  {
    category: "Flags",
    defaultConfig: {
      expected: true,
      flag: ""
    },
    description: "Checks a global flag and emits true or false results.",
    emits: ["condition.true", "condition.false"],
    fields: [
      {
        kind: "text",
        label: "Flag",
        path: "flag",
        placeholder: "alarm_active"
      },
      {
        kind: "scalar",
        label: "Expected",
        path: "expected"
      }
    ],
    label: "Flag Condition",
    listens: ["condition.check"],
    type: "flag_condition"
  },
  {
    category: "Logic",
    defaultConfig: {
      actions: [
        {
          event: "open.requested",
          payload: null,
          target: "",
          type: "emit"
        }
      ],
      trigger: {
        event: "trigger.enter",
        fromEntity: "",
        once: true
      }
    },
    description: "Runs ordered actions when an event trigger fires.",
    emits: ["sequence.started", "sequence.step", "sequence.completed"],
    fields: [
      {
        kind: "sequence-trigger",
        label: "Trigger",
        path: "trigger"
      },
      {
        kind: "sequence-actions",
        label: "Actions",
        path: "actions"
      }
    ],
    label: "Sequence",
    listens: [],
    type: "sequence"
  },
  {
    category: "Logic",
    defaultConfig: {
      actions: [
        {
          event: "path.start",
          payload: null,
          target: "",
          type: "emit"
        }
      ],
      allOf: [],
      anyOf: [],
      once: true
    },
    description: "Waits for event conditions, then runs a sequence of actions.",
    emits: ["condition.met", "condition.failed"],
    fields: [
      {
        kind: "event-conditions",
        label: "All Of",
        path: "allOf"
      },
      {
        kind: "event-conditions",
        label: "Any Of",
        path: "anyOf"
      },
      {
        kind: "boolean",
        label: "Once",
        path: "once"
      },
      {
        kind: "sequence-actions",
        label: "Actions",
        path: "actions"
      }
    ],
    label: "Condition Listener",
    listens: [],
    type: "condition_listener"
  }
];

export const HOOK_DEFINITIONS: HookDefinition[] = hookDefinitionEntries.map(({ defaultConfig: _defaultConfig, ...definition }) => definition);

export const HOOK_DEFINITION_MAP = new Map(hookDefinitionEntries.map((definition) => [definition.type, definition] as const));

export const STANDARD_GAMEPLAY_EVENTS: SceneEventDefinition[] = [
  createStandardEvent("interact.requested", "Interaction", "Primary interaction request emitted by interactables."),
  createStandardEvent("interact.started", "Interaction", "Interaction successfully began."),
  createStandardEvent("interact.denied", "Interaction", "Interaction was rejected."),
  createStandardEvent("trigger.enter", "Trigger", "Actor entered a trigger volume."),
  createStandardEvent("trigger.exit", "Trigger", "Actor exited a trigger volume."),
  createStandardEvent("trigger.stay", "Trigger", "Actor remains inside a trigger volume."),
  createStandardEvent("lock.allowed", "State", "Lock allowed the requested transition."),
  createStandardEvent("lock.denied", "State", "Lock rejected the requested transition."),
  createStandardEvent("lock.unlocked", "State", "Lock was permanently or temporarily unlocked."),
  createStandardEvent("unlock.requested", "State", "Explicit unlock request."),
  createStandardEvent("open.requested", "State", "Open request sent to an openable."),
  createStandardEvent("close.requested", "State", "Close request sent to an openable."),
  createStandardEvent("toggle.requested", "State", "Toggle request sent to an openable."),
  createStandardEvent("open.started", "State", "Open transition started."),
  createStandardEvent("open.completed", "State", "Open transition completed."),
  createStandardEvent("close.started", "State", "Close transition started."),
  createStandardEvent("close.completed", "State", "Close transition completed."),
  createStandardEvent("state.changed", "State", "Logical state changed."),
  createStandardEvent("move.to", "Motion", "Move to a named target state."),
  createStandardEvent("move.started", "Motion", "Movement started."),
  createStandardEvent("move.completed", "Motion", "Movement completed."),
  createStandardEvent("path.start", "Motion", "Path movement start request."),
  createStandardEvent("path.stop", "Motion", "Path movement stop request."),
  createStandardEvent("path.pause", "Motion", "Path movement pause request."),
  createStandardEvent("path.resume", "Motion", "Path movement resume request."),
  createStandardEvent("path.reverse", "Motion", "Path movement reverse request."),
  createStandardEvent("path.started", "Motion", "Path movement started."),
  createStandardEvent("path.stopped", "Motion", "Path movement stopped."),
  createStandardEvent("path.completed", "Motion", "Path movement completed."),
  createStandardEvent("path.node_reached", "Motion", "Path node reached."),
  createStandardEvent("pickup.requested", "Inventory", "Pickup request emitted."),
  createStandardEvent("pickup.completed", "Inventory", "Pickup completed."),
  createStandardEvent("pickup.denied", "Inventory", "Pickup denied."),
  createStandardEvent("health.changed", "Combat", "Health value changed."),
  createStandardEvent("health.zero", "Combat", "Health reached zero."),
  createStandardEvent("damage.apply", "Combat", "Damage application request."),
  createStandardEvent("damage.received", "Combat", "Damage was received."),
  createStandardEvent("damage.killed", "Combat", "Damage killed the target."),
  createStandardEvent("destroy.requested", "Combat", "Destruction requested."),
  createStandardEvent("destroy.started", "Combat", "Destruction started."),
  createStandardEvent("destroy.completed", "Combat", "Destruction completed."),
  createStandardEvent("spawn.requested", "Spawning", "Spawn requested."),
  createStandardEvent("spawner.activate", "Spawning", "Spawner activation request."),
  createStandardEvent("spawner.deactivate", "Spawning", "Spawner deactivation request."),
  createStandardEvent("spawn.completed", "Spawning", "Spawn completed."),
  createStandardEvent("spawn.failed", "Spawning", "Spawn failed."),
  createStandardEvent("ai.enable", "AI", "Enable AI request."),
  createStandardEvent("ai.disable", "AI", "Disable AI request."),
  createStandardEvent("ai.set_target", "AI", "Assign AI target request."),
  createStandardEvent("ai.enabled", "AI", "AI enabled."),
  createStandardEvent("ai.disabled", "AI", "AI disabled."),
  createStandardEvent("ai.target_acquired", "AI", "AI acquired a target."),
  createStandardEvent("ai.dead", "AI", "AI died."),
  createStandardEvent("audio.play", "Feedback", "Audio play request."),
  createStandardEvent("audio.stop", "Feedback", "Audio stop request."),
  createStandardEvent("audio.started", "Feedback", "Audio playback started."),
  createStandardEvent("audio.stopped", "Feedback", "Audio playback stopped."),
  createStandardEvent("vfx.play", "Feedback", "VFX play request."),
  createStandardEvent("vfx.stop", "Feedback", "VFX stop request."),
  createStandardEvent("flag.set", "Flags", "Flag set request."),
  createStandardEvent("flag.changed", "Flags", "Flag value changed."),
  createStandardEvent("condition.check", "Logic", "Condition evaluation request."),
  createStandardEvent("condition.true", "Logic", "Condition evaluated true."),
  createStandardEvent("condition.false", "Logic", "Condition evaluated false."),
  createStandardEvent("sequence.started", "Logic", "Sequence execution started."),
  createStandardEvent("sequence.step", "Logic", "Sequence advanced to the next step."),
  createStandardEvent("sequence.completed", "Logic", "Sequence execution completed."),
  createStandardEvent("condition.met", "Logic", "Condition listener completed successfully."),
  createStandardEvent("condition.failed", "Logic", "Condition listener failed or timed out.")
];

export function createGameplayEventDefinition(
  input: Pick<SceneEventDefinition, "description" | "name"> & Partial<Omit<SceneEventDefinition, "description" | "name">>
): SceneEventDefinition {
  return {
    category: input.category ?? "Custom",
    custom: input.custom ?? true,
    description: input.description ?? "",
    id: input.id ?? createGameplayId("event"),
    name: input.name,
    scope: input.scope ?? "custom"
  };
}

export function createSceneHook(
  type: string,
  options?: {
    defaultPathId?: string;
    targetId?: string;
  }
): SceneHook | undefined {
  const definition = HOOK_DEFINITION_MAP.get(type);

  if (!definition) {
    return undefined;
  }

  const config = structuredClone(definition.defaultConfig);

  if (type === "path_mover" && options?.defaultPathId) {
    config.pathId = options.defaultPathId;
  }

  if (type === "sequence" && options?.targetId) {
    if (isGameplayObject(config.trigger)) {
      config.trigger.fromEntity = options.targetId;
    }

    if (Array.isArray(config.actions) && isGameplayObject(config.actions[0]) && config.actions[0].type === "emit") {
      config.actions[0].target = options.targetId;
    }
  }

  if (type === "condition_listener" && options?.targetId) {
    if (Array.isArray(config.actions) && isGameplayObject(config.actions[0]) && config.actions[0].type === "emit") {
      config.actions[0].target = options.targetId;
    }
  }

  return {
    config,
    enabled: true,
    id: createGameplayId(`hook:${type}`),
    type
  };
}

export function getHookDefinition(type: string) {
  return HOOK_DEFINITION_MAP.get(type);
}

export function resolveGameplayEvents(customEvents: SceneEventDefinition[] = []): SceneEventDefinition[] {
  const eventsByName = new Map<string, SceneEventDefinition>();

  STANDARD_GAMEPLAY_EVENTS.forEach((eventDefinition) => {
    eventsByName.set(eventDefinition.name, eventDefinition);
  });
  customEvents.forEach((eventDefinition) => {
    eventsByName.set(eventDefinition.name, {
      ...eventDefinition,
      custom: true
    });
  });

  return Array.from(eventsByName.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function createGameplayId(prefix: string) {
  const slug = prefix.replace(/[^a-z0-9:_-]+/gi, "-").toLowerCase();

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${slug}:${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${slug}:${Math.random().toString(36).slice(2, 10)}`;
}

export function formatGameplayValue(value: GameplayValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function parseGameplayValue(input: string): GameplayValue {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    try {
      return JSON.parse(trimmed) as GameplayValue;
    } catch {
      return input;
    }
  }

  return input;
}

export function getGameplayValue(source: GameplayObject, path: string): GameplayValue | undefined {
  return path.split(".").reduce<GameplayValue | undefined>((current, segment) => {
    if (!isGameplayObject(current)) {
      return undefined;
    }

    return current[segment];
  }, source);
}

export function setGameplayValue(source: GameplayObject, path: string, value: GameplayValue): GameplayObject {
  const segments = path.split(".");
  const clone = structuredClone(source);
  let current: GameplayObject = clone;

  segments.forEach((segment, index) => {
    const isLeaf = index === segments.length - 1;

    if (isLeaf) {
      current[segment] = value;
      return;
    }

    const nextValue = current[segment];

    if (!isGameplayObject(nextValue)) {
      current[segment] = {};
    }

    current = current[segment] as GameplayObject;
  });

  return clone;
}

export function isHookFieldVisible(field: HookFieldDefinition, config: GameplayObject) {
  if (!field.showWhen) {
    return true;
  }

  return getGameplayValue(config, field.showWhen.path) === field.showWhen.equals;
}

export function toStringArray(value: GameplayValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function toEventMap(value: GameplayValue | undefined): Record<string, string> {
  if (!isGameplayObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

export function toGameplayObject(value: GameplayValue | undefined): GameplayObject {
  return isGameplayObject(value) ? value : {};
}

export function toObjectArray(value: GameplayValue | undefined): GameplayObject[] {
  return Array.isArray(value) ? value.filter(isGameplayObject) : [];
}

export function toVec3Tuple(value: GameplayValue | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    typeof value[0] === "number" ? value[0] : fallback[0],
    typeof value[1] === "number" ? value[1] : fallback[1],
    typeof value[2] === "number" ? value[2] : fallback[2]
  ];
}

export function createEmptyEventCondition(defaultFromEntity = ""): GameplayObject {
  return {
    event: "trigger.enter",
    fromEntity: defaultFromEntity
  };
}

export function createEmptySequenceAction(defaultTarget = "", defaultEvent = "open.requested"): GameplayObject {
  return {
    event: defaultEvent,
    payload: null,
    target: defaultTarget,
    type: "emit"
  };
}

export function createEmptyGrant(): GameplayObject {
  return {
    id: "",
    kind: "key"
  };
}

export function isGameplayObject(value: GameplayValue | undefined): value is GameplayObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createStandardEvent(name: string, category: string, description: string): SceneEventDefinition {
  return {
    category,
    custom: false,
    description,
    id: `std:${name}`,
    name,
    scope: "global"
  };
}
