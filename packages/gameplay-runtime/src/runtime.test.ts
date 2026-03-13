import { describe, expect, test } from "bun:test";
import { makeTransform, vec3, type Entity, type GeometryNode } from "@web-hammer/shared";
import { createGameplayRuntime } from "./runtime";
import {
  createMoverSystemDefinition,
  createOpenableSystemDefinition,
  createPathMoverSystemDefinition,
  createSequenceSystemDefinition,
  createTriggerSystemDefinition,
  createWaypointPath
} from "./systems";

describe("gameplay runtime", () => {
  test("routes openable events through mover transforms", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            initialState: "closed",
            mode: "slide"
          },
          id: "hook:openable",
          type: "openable"
        },
        {
          config: {
            duration: 0.5,
            kind: "lerp_transform",
            targets: {
              closed: {
                position: [0, 0, 0]
              },
              open: {
                position: [2, 0, 0]
              }
            }
          },
          id: "hook:mover",
          type: "mover"
        }
      ],
      id: "node:door",
      kind: "group",
      name: "Door",
      transform: makeTransform(vec3(0, 0, 0))
    };
    const scene = {
      entities: [] satisfies Entity[],
      nodes: [node]
    };
    const events: string[] = [];
    const runtime = createGameplayRuntime({
      systems: [createOpenableSystemDefinition(), createMoverSystemDefinition()],
      scene
    });

    runtime.onEvent((event) => {
      events.push(event.event);
    });
    runtime.start();
    runtime.emitEvent({
      event: "open.requested",
      sourceId: "test",
      sourceKind: "system",
      targetId: node.id
    });
    runtime.update(0.5);

    expect(runtime.getNodeWorldTransform(node.id)?.position.x).toBeCloseTo(2, 4);
    expect(events).toContain("open.started");
    expect(events).toContain("move.completed");
    expect(events).toContain("open.completed");
  });

  test("moves active path movers relative to the authored start transform", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            active: true,
            loop: true,
            pathId: "sample:path",
            speed: 1
          },
          id: "hook:path",
          type: "path_mover"
        }
      ],
      id: "node:mover",
      kind: "group",
      name: "Mover",
      transform: makeTransform(vec3(0, 3, 10))
    };
    const runtime = createGameplayRuntime({
      systems: [
        createPathMoverSystemDefinition((target) =>
          target.targetId === node.id
            ? createWaypointPath([vec3(0, 0, 0), vec3(0, 0, 4)], true)
            : undefined
        )
      ],
      scene: {
        entities: [],
        nodes: [node]
      }
    });

    runtime.start();
    runtime.update(0.25);

    expect(runtime.getNodeWorldTransform(node.id)?.position.y).toBeCloseTo(3, 4);
    expect(runtime.getNodeWorldTransform(node.id)?.position.z).toBeCloseTo(11, 4);
  });

  test("ping-pongs path movers when loop and reverse are both enabled", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            active: true,
            loop: true,
            pathId: "sample:path",
            reverse: true,
            speed: 1
          },
          id: "hook:path",
          type: "path_mover"
        }
      ],
      id: "node:pingpong",
      kind: "group",
      name: "PingPong",
      transform: makeTransform(vec3(0, 0, 0))
    };
    const runtime = createGameplayRuntime({
      systems: [
        createPathMoverSystemDefinition((target) =>
          target.targetId === node.id
            ? createWaypointPath([vec3(0, 0, 0), vec3(0, 0, 4)], true)
            : undefined
        )
      ],
      scene: {
        entities: [],
        nodes: [node]
      }
    });

    runtime.start();
    runtime.update(1);
    expect(runtime.getNodeWorldTransform(node.id)?.position.z).toBeCloseTo(4, 4);

    runtime.update(0.25);
    expect(runtime.getNodeWorldTransform(node.id)?.position.z).toBeCloseTo(3, 4);
  });

  test("processes queued micro-phases in order within a frame", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            initialState: "closed",
            mode: "slide"
          },
          id: "hook:openable",
          type: "openable"
        }
      ],
      id: "node:test",
      kind: "group",
      name: "Test",
      transform: makeTransform(vec3(0, 0, 0))
    };
    const runtime = createGameplayRuntime({
      scene: {
        entities: [],
        nodes: [node]
      },
      systems: [createOpenableSystemDefinition()]
    });
    const events: string[] = [];

    runtime.onEvent((event) => {
      events.push(event.event);
    });
    runtime.start();
    runtime.emitEvent({
      event: "open.requested",
      sourceId: "test",
      sourceKind: "system",
      targetId: node.id
    });
    runtime.update(0);

    expect(events).toEqual(["open.requested", "open.started", "move.to"]);
  });

  test("emits trigger enter and exit for tracked actors", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            filters: ["player"],
            fireOnce: false,
            shape: "box",
            size: [2, 2, 2]
          },
          id: "hook:trigger",
          type: "trigger_volume"
        }
      ],
      id: "node:trigger",
      kind: "group",
      name: "Trigger",
      transform: makeTransform(vec3(0, 0, 0))
    };
    const runtime = createGameplayRuntime({
      scene: {
        entities: [],
        nodes: [node]
      },
      systems: [createTriggerSystemDefinition()]
    });
    const events: string[] = [];

    runtime.onEvent((event) => {
      events.push(event.event);
    });
    runtime.start();
    runtime.updateActor({
      id: "player",
      position: vec3(0, 0, 0),
      tags: ["player"]
    });
    runtime.update(0);
    runtime.updateActor({
      id: "player",
      position: vec3(4, 0, 0),
      tags: ["player"]
    });
    runtime.update(0);

    expect(events).toContain("trigger.enter");
    expect(events).toContain("trigger.exit");
  });

  test("treats actor extents as overlap for platform-sized triggers", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            filters: ["player"],
            fireOnce: true,
            shape: "box",
            size: [2.6, 1.4, 2.6]
          },
          id: "hook:trigger",
          type: "trigger_volume"
        }
      ],
      id: "node:platform",
      kind: "group",
      name: "Platform",
      transform: makeTransform(vec3(1.6, 0.45, 3.8))
    };
    const runtime = createGameplayRuntime({
      scene: {
        entities: [],
        nodes: [node]
      },
      systems: [createTriggerSystemDefinition()]
    });
    const events: string[] = [];

    runtime.onEvent((event) => {
      events.push(event.event);
    });
    runtime.start();
    runtime.updateActor({
      height: 1.8,
      id: "player",
      position: vec3(1.6, 1.35, 3.8),
      radius: 0.32,
      tags: ["player"]
    });
    runtime.update(0);

    expect(events).toContain("trigger.enter");
  });

  test("starts a path mover from a trigger-driven sequence", () => {
    const node: GeometryNode = {
      data: {},
      hooks: [
        {
          config: {
            active: false,
            loop: false,
            pathId: "sample:platform-route",
            speed: 1,
            stopAtEnd: true
          },
          id: "hook:path",
          type: "path_mover"
        },
        {
          config: {
            filters: ["player"],
            fireOnce: true,
            shape: "box",
            size: [2, 2, 2]
          },
          id: "hook:trigger",
          type: "trigger_volume"
        },
        {
          config: {
            actions: [
              {
                event: "path.start",
                target: "node:platform",
                type: "emit"
              }
            ],
            trigger: {
              event: "trigger.enter",
              fromEntity: "node:platform",
              once: true
            }
          },
          id: "hook:sequence",
          type: "sequence"
        }
      ],
      id: "node:platform",
      kind: "group",
      name: "Platform",
      transform: makeTransform(vec3(0, 0, 0))
    };
    const runtime = createGameplayRuntime({
      scene: {
        entities: [],
        nodes: [node]
      },
      systems: [
        createTriggerSystemDefinition(),
        createSequenceSystemDefinition(),
        createPathMoverSystemDefinition((target) =>
          target.targetId === node.id ? createWaypointPath([vec3(0, 0, 0), vec3(0, 0, 4)]) : undefined
        )
      ]
    });
    const events: string[] = [];

    runtime.onEvent((event) => {
      events.push(event.event);
    });
    runtime.start();
    runtime.updateActor({
      id: "player",
      position: vec3(0, 0, 0),
      tags: ["player"]
    });
    runtime.update(0);
    runtime.update(0.5);

    expect(events).toContain("trigger.enter");
    expect(events).toContain("sequence.started");
    expect(events).toContain("path.started");
    expect(runtime.getNodeWorldTransform(node.id)?.position.z).toBeCloseTo(2, 4);
  });
});
