import type { Entity, GameplayValue, GeometryNode, SceneHook, Transform, Vec3 } from "@web-hammer/shared";

export type GameplayRuntimeTargetKind = "entity" | "node" | "system";

export type GameplayRuntimeScene = {
  entities: Entity[];
  nodes: GeometryNode[];
};

export type GameplayActor = {
  height?: number;
  id: string;
  position: Vec3;
  radius?: number;
  tags?: string[];
};

export type GameplayHookTarget = {
  entity?: Entity;
  hook: SceneHook;
  node?: GeometryNode;
  targetId: string;
  targetKind: Exclude<GameplayRuntimeTargetKind, "system">;
};

export type GameplayEvent = {
  event: string;
  id: string;
  payload?: GameplayValue | Record<string, unknown> | unknown;
  sourceHookType?: string;
  sourceId: string;
  sourceKind: GameplayRuntimeTargetKind;
  targetId?: string;
  time: number;
};

export type GameplayEventInput = Omit<GameplayEvent, "id" | "time">;

export type GameplayEventFilter = {
  event?: string | string[];
  sourceHookType?: string;
  sourceId?: string;
  targetId?: string;
};

export type GameplayRuntimeHost = {
  applyEntityWorldTransform?: (entityId: string, transform: Transform, entity: Entity) => void;
  applyNodeWorldTransform?: (nodeId: string, transform: Transform, node: GeometryNode) => void;
  onEvent?: (event: GameplayEvent) => void;
};

export type GameplayStateScope = "entity-local" | "player" | "world";

export type GameplayRuntimeStateStore = {
  getLocalState: (targetId: string, key: string) => GameplayValue | undefined;
  getPlayerState: (key: string) => GameplayValue | undefined;
  getWorldState: (key: string) => GameplayValue | undefined;
  setLocalState: (targetId: string, key: string, value: GameplayValue) => void;
  setPlayerState: (key: string, value: GameplayValue) => void;
  setWorldState: (key: string, value: GameplayValue) => void;
};

export type GameplayRuntimeSceneStore = GameplayRuntimeStateStore & {
  actorsById: ReadonlyMap<string, GameplayActor>;
  entitiesById: ReadonlyMap<string, Entity>;
  getActor: (actorId: string) => GameplayActor | undefined;
  getActors: () => GameplayActor[];
  getEntity: (entityId: string) => Entity | undefined;
  getEntityWorldTransform: (entityId: string) => Transform | undefined;
  getHookTarget: (targetId: string, hookId: string) => GameplayHookTarget | undefined;
  getHookTargets: () => GameplayHookTarget[];
  getHookTargetsByType: (type: string) => GameplayHookTarget[];
  getNode: (nodeId: string) => GeometryNode | undefined;
  getNodeWorldTransform: (nodeId: string) => Transform | undefined;
  getTargetInitialLocalTransform: (targetId: string) => Transform | undefined;
  getTargetLocalTransform: (targetId: string) => Transform | undefined;
  getTargetWorldTransform: (targetId: string) => Transform | undefined;
  nodesById: ReadonlyMap<string, GeometryNode>;
  removeActor: (actorId: string) => void;
  resetTargetLocalTransform: (targetId: string) => void;
  setTargetLocalTransform: (targetId: string, transform: Transform) => void;
  syncWorldTransforms: () => void;
  translateTarget: (targetId: string, offset: Vec3) => void;
  upsertActor: (actor: GameplayActor) => void;
};

export type GameplayRuntimeEventBus = {
  emit: (input: GameplayEventInput) => GameplayEvent;
  flush: () => GameplayEvent[];
  getHistory: () => readonly GameplayEvent[];
  subscribe: (
    filter: GameplayEventFilter | ((event: GameplayEvent) => void),
    listener?: (event: GameplayEvent) => void
  ) => () => void;
};

export type GameplayRuntimeSystem = {
  start?: () => void;
  stop?: () => void;
  update?: (deltaSeconds: number) => void;
};

export type GameplayRuntimeApi = GameplayRuntimeStateStore & {
  emitEvent: (input: GameplayEventInput) => GameplayEvent;
  emitFromHookTarget: (target: GameplayHookTarget, eventName: string, payload?: GameplayEvent["payload"], targetId?: string) => GameplayEvent;
  getActor: (actorId: string) => GameplayActor | undefined;
  getActors: () => GameplayActor[];
  getEntity: (entityId: string) => Entity | undefined;
  getEntityWorldTransform: (entityId: string) => Transform | undefined;
  getHookTarget: (targetId: string, hookId: string) => GameplayHookTarget | undefined;
  getHookTargets: () => GameplayHookTarget[];
  getHookTargetsByType: (type: string) => GameplayHookTarget[];
  getNode: (nodeId: string) => GeometryNode | undefined;
  getNodeWorldTransform: (nodeId: string) => Transform | undefined;
  getTargetInitialLocalTransform: (targetId: string) => Transform | undefined;
  getTargetLocalTransform: (targetId: string) => Transform | undefined;
  getTargetWorldTransform: (targetId: string) => Transform | undefined;
  onEvent: (
    filter: GameplayEventFilter | ((event: GameplayEvent) => void),
    listener?: (event: GameplayEvent) => void
  ) => () => void;
  removeActor: (actorId: string) => void;
  resetTargetLocalTransform: (targetId: string) => void;
  setTargetLocalTransform: (targetId: string, transform: Transform) => void;
  translateTarget: (targetId: string, offset: Vec3) => void;
  updateActor: (actor: GameplayActor) => void;
};

export type GameplayRuntimeSystemContext = GameplayRuntimeApi & {
  eventBus: GameplayRuntimeEventBus;
  scene: GameplayRuntimeSceneStore;
};

export type GameplayRuntimeSystemDefinition = {
  create: (context: GameplayRuntimeSystemContext) => GameplayRuntimeSystem;
  description?: string;
  hookTypes?: string[];
  id: string;
  label: string;
};

export type GameplayRuntime = GameplayRuntimeApi & {
  dispose: () => void;
  eventBus: GameplayRuntimeEventBus;
  scene: GameplayRuntimeSceneStore;
  start: () => void;
  stop: () => void;
  update: (deltaSeconds: number) => void;
};

export type GameplayPathDefinition = {
  loop?: boolean;
  sample: (progress: number) => Vec3;
};

export type GameplayPathResolver = (target: GameplayHookTarget) => GameplayPathDefinition | undefined;

export type GameplaySystemBlueprint = {
  description: string;
  hookTypes?: string[];
  id: string;
  implemented: boolean;
  label: string;
};
