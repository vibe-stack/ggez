# Runtime Architecture

This document defines how Web Hammer should evolve from its current tightly coupled editor-to-runtime export flow into a proper runtime platform.

The target is not "a loader that happens to open editor exports". The target is a clean content pipeline and runtime surface that lets a game team use Web Hammer naturally inside their own app, engine structure, and deployment flow.

The design goal is similar in spirit to what Next.js does for React:

- strong conventions
- good default tooling
- clean composition points
- ownership boundaries that stay understandable

The runtime must never swallow the host application. Consumers must keep control over rendering, physics, gameplay, streaming, caching, lifecycle, and deployment.

## Progress Update (2026-03-17)

The repo now implements the runtime architecture described below.

Completed:

- `packages/runtime-format` now exists and owns the canonical runtime scene, bundle, and world-index types.
- Runtime parse, validation, migration, and type-guard helpers now live in `packages/runtime-format`.
- `packages/three-runtime` now depends on `packages/runtime-format` for the content contract and keeps compatibility re-exports for existing imports.
- `packages/runtime-build` now exists for headless `.whmap` snapshot compilation, runtime asset externalization, bundle packing/unpacking, world-index creation, and CLI builds.
- `packages/workers` now call into `packages/runtime-build` for runtime scene compilation and runtime bundle generation.
- `packages/three-runtime` now exposes `createThreeRuntimeSceneInstance()`.
- `loadWebHammerEngineScene()` is now a convenience wrapper around the new Three scene-instance path.
- `packages/three-runtime` now exposes adapter-oriented aliases: `createThreeRuntimeObjectFactory()`, `applyRuntimeWorldSettingsToThreeScene()`, `clearRuntimeWorldSettingsFromThreeScene()`, and `createThreeAssetResolver()`.
- Runtime scene-instance disposal now exists in `packages/three-runtime`.
- `packages/runtime-streaming` now provides optional chunk/world orchestration.
- `packages/runtime-physics-rapier` now provides optional Rapier bindings and is consumed by the vanilla Three playground.
- `packages/gameplay-runtime` now exposes a stable adapter from `RuntimeScene` data into gameplay-runtime scene input.
- Runtime docs have been rewritten around the new format/build/adapter/streaming/physics package split.
- Tests now cover runtime-format parsing/migration/fixtures, runtime-build bundle/world-index helpers, runtime-streaming, runtime-physics-rapier, and direct worker-to-build parity.

Notes:

- `packages/workers` still contains `.whmap`, glTF export, and AI worker tasks, but the runtime-export path itself is now delegated to `packages/runtime-build`.

## Problem Statement

The current runtime workflow works, but the architecture boundary is wrong.

Today:

- the editor exports a `scene.runtime.zip`
- `@web-hammer/three-runtime` parses the bundle and creates Three objects
- playground applications provide the actual orchestration for runtime, gameplay, controls, physics, and asset resolution

That is good enough for experimentation, but it creates several architectural problems:

1. The runtime schema is owned by the Three adapter package instead of a renderer-agnostic contract.
2. Export compilation lives behind editor worker entrypoints instead of a first-class build pipeline.
3. The Three runtime package still mixes content loading, object construction, hierarchy attachment, world settings, and convenience orchestration.
4. The actual application lifecycle lives in playground code, which means the most important runtime integration rules are not formalized as library APIs.
5. Consumers can use the runtime, but they do not yet get a conceptually correct integration model for real games.

## Architectural Principles

The future runtime should follow these rules.

### 1. The authored file is not the runtime contract

`.whmap` remains the editor-native authored source.

It is for:

- save/load
- round-tripping
- editor fidelity
- future editor-specific metadata

It is not the deployable runtime format.

### 2. The manifest is the contract

The runtime manifest is the stable content contract between authoring and consumption.

It must be:

- renderer-agnostic
- versioned
- migratable
- parseable without Three.js
- validatable in build and CI flows

### 3. The zip is a transport artifact

`scene.runtime.zip` is useful, but it should be treated as a packaging artifact, not the conceptual center of the runtime.

It is appropriate for:

- editor downloads
- quick validation in playgrounds
- handoff to external teams
- local preview
- optional shipping format for small levels

It is not the ideal primary format for production worlds. Production apps will usually want unpacked manifests, chunk registries, and normal asset hosting.

### 4. The Three integration is an adapter, not the runtime itself

Three-specific code should translate runtime content into Three objects. It should not own the full game lifecycle.

That means the Three layer should not own:

- renderer creation
- camera setup
- input systems
- controls
- main loop
- world streaming policy
- save game state
- physics engine lifecycle
- gameplay event semantics

### 5. Gameplay remains headless

Gameplay logic should consume exported nodes, entities, hooks, and world transforms without requiring a specific renderer.

The existing `@web-hammer/gameplay-runtime` direction is broadly correct and should remain headless.

### 6. The host application owns orchestration

The consuming game must decide:

- where a scene instance mounts
- how assets are resolved and cached
- how chunks are loaded and unloaded
- whether physics is enabled and which engine is used
- how player controllers work
- how authored hooks are mapped to gameplay code

The runtime should provide structure and helpers, not hidden ownership.

## Current State In This Repo

The current repo already contains the main pieces required for a better architecture.

### Existing good seams

- `packages/three-runtime` already exposes bundle helpers, manifest parsing, world settings application, a scene loader, and a lower-level object factory.
- `packages/gameplay-runtime` is already headless and is structurally closer to a reusable package.
- `packages/workers` already contains the beginnings of a build/export pipeline.
- The playground apps already prove that runtime exports can be consumed outside the editor.

### Current coupling problems

- Runtime schema types currently live in `packages/three-runtime`, which makes the renderer package the owner of the content contract.
- Export compilation currently happens through editor worker pathways, which makes build logic feel editor-owned.
- `packages/three-runtime` still includes both low-level object construction and higher-level scene orchestration helpers in one surface area.
- `apps/three-vanilla-playground` contains application orchestration code that is too important to remain an app-only pattern.
- Some rendering creation logic is duplicated between the loader and object factory layers, which suggests the package boundary is not fully settled.

## Target Platform Model

Web Hammer should become a platform with explicit layers.

### Layer 1: Authoring Source

Owned by the editor.

Primary artifact:

- `.whmap`

Responsibilities:

- editor fidelity
- round-tripping
- editor-only metadata
- future authoring conveniences

### Layer 2: Runtime Format

Owned by a renderer-agnostic package.

Primary artifacts:

- runtime manifest JSON
- bundle metadata
- asset descriptors
- schema versioning and migration

Responsibilities:

- parse
- validate
- migrate
- define canonical runtime types
- provide manifest utilities
- define chunk/world index contracts

This layer must not depend on Three, React, Rapier, or editor UI code.

### Layer 3: Runtime Build Pipeline

Owned by a headless build package.

Primary artifacts:

- compiled runtime manifests
- chunk manifests
- optional runtime zip bundles
- baked LOD assets
- externalized asset outputs

Responsibilities:

- convert authoring snapshots into runtime manifests
- bake geometry LODs and model LODs
- externalize data URLs and optional copied assets
- emit either packed or unpacked outputs
- support chunking and world indexing
- run in editor workers, CLI tools, CI, or future build plugins

### Layer 4: Renderer Adapters

Owned by renderer-specific packages.

Examples:

- Three adapter
- future R3F adapter helpers
- future Babylon adapter if ever needed

Responsibilities:

- instantiate runtime content into renderer objects
- provide scene instance lifecycle helpers
- expose asset resolution integration points
- expose disposal hooks and resource cleanup

This layer should not own the application lifecycle.

### Layer 5: Optional Integration Kits

Owned by opt-in packages.

Examples:

- vanilla Three starter kit
- React Three Fiber starter kit
- Rapier bridge
- streaming/world manager
- editor preview kits

Responsibilities:

- provide opinionated defaults
- accelerate integration for common stacks
- remain optional and replaceable

### Layer 6: Host Game/Application

Owned by the consumer.

Responsibilities:

- routing and app boot
- renderer lifecycle
- loading screens
- caching policies
- chunk streaming policy
- gameplay feature ownership
- multiplayer or persistence concerns

## Proposed Package Architecture

The repo should move toward the following package split.

### `@web-hammer/runtime-format`

Purpose:

- canonical runtime schema and format utilities

Owns:

- runtime manifest types
- bundle file types
- version constants
- parse and validate helpers
- migration helpers
- world index and chunk metadata types

Exports should include:

- `RuntimeScene`
- `RuntimeBundle`
- `RuntimeWorldIndex`
- `parseRuntimeScene()`
- `validateRuntimeScene()`
- `migrateRuntimeScene()`
- `isRuntimeScene()`
- `isRuntimeBundle()`

Notes:

- This package replaces the current renderer-owned type location.

### `@web-hammer/runtime-build`

Purpose:

- headless compilation from authored source to deployable runtime artifacts

Owns:

- scene compilation from editor snapshots
- material export normalization
- geometry export
- LOD baking
- asset externalization
- bundle packing
- future chunk slicing and world index generation

Exports should include:

- `buildRuntimeScene()`
- `buildRuntimeBundle()`
- `packRuntimeBundle()`
- `unpackRuntimeBundle()`
- `externalizeRuntimeAssets()`
- `buildRuntimeWorldIndex()`

Notes:

- `packages/workers` should call into this package instead of owning the build logic.
- A future CLI should also call into this package.

### `@web-hammer/three-runtime`

Purpose:

- renderer adapter for Three.js

Owns:

- object factories for runtime nodes
- instancing creation
- material creation for exported materials
- world settings application to Three scenes
- scene instance creation and disposal

Exports should include:

- `createThreeRuntimeObjectFactory()`
- `createThreeRuntimeSceneInstance()`
- `applyRuntimeWorldSettingsToThreeScene()`
- `clearRuntimeWorldSettingsFromThreeScene()`
- `createThreeAssetResolver()`

Notes:

- The existing scene loader can remain as a convenience wrapper, but it should be built on top of the lower-level instance API.
- The package should depend on `@web-hammer/runtime-format`, not own the format itself.

### `@web-hammer/gameplay-runtime`

Purpose:

- headless authored gameplay hook runtime

Owns:

- scene store
- hook target resolution
- system registration
- event bus
- gameplay state

Notes:

- This package should continue to consume runtime scene data without depending on Three.
- It should become a first-class integration target in docs and starter kits.

### `@web-hammer/runtime-streaming`

Purpose:

- optional chunk and world streaming orchestration

Owns:

- world index loading
- chunk lifecycle state
- chunk load/unload policies
- budgeted concurrency
- eviction strategies

Exports should include:

- `createRuntimeWorldManager()`
- `loadChunk()`
- `unloadChunk()`
- `updateStreamingFocus()`

Notes:

- This must be optional.
- It should orchestrate adapters, not replace them.

### `@web-hammer/runtime-physics-rapier`

Purpose:

- optional physics adapter for runtime physics descriptors

Owns:

- creation of rigid bodies/colliders from exported node physics
- synchronization between renderer objects and physics bodies

Notes:

- This must not be baked into the Three adapter core.

## Runtime Data Model

The runtime contract should be modeled around content, not around loader behavior.

### Core scene contract

The runtime scene should represent:

- nodes
- entities
- materials
- assets
- layers
- world settings
- metadata

This is already close to the current manifest, but the ownership should move to a format package.

### World contract

Large projects need a formal world-level contract on top of per-scene exports.

Suggested world index shape:

```json
{
  "version": 1,
  "chunks": [
    {
      "id": "hub",
      "bounds": [-40, 0, -40, 40, 20, 40],
      "manifestUrl": "/world/chunks/hub/scene.runtime.json",
      "bundleUrl": "/world/chunks/hub.runtime.zip",
      "tags": ["spawn", "safe-zone"],
      "loadDistance": 120,
      "unloadDistance": 180
    }
  ],
  "sharedAssets": [
    {
      "id": "pack:common-props",
      "baseUrl": "/world/shared/common-props/"
    }
  ]
}
```

Important rule:

- a runtime scene is a level or chunk contract
- a world index is the streaming contract

Do not overload one scene bundle to represent an entire open world.

## Public API Philosophy

The runtime should expose three levels of API.

### Level 1: Data APIs

For teams building their own pipeline.

Examples:

- parse a manifest
- validate a manifest
- migrate a manifest
- inspect metadata
- enumerate assets

### Level 2: Adapter APIs

For teams using the runtime format with a renderer.

Examples:

- create a node object
- create instancing objects
- apply world settings
- create a runtime scene instance

### Level 3: Convenience APIs

For teams who want fast setup.

Examples:

- load a manifest from URL
- load a bundle from URL
- mount a scene instance into a Three scene
- create a world streaming manager

Crucial rule:

- Level 3 APIs must be built on Level 1 and 2 APIs
- Level 3 APIs must stay replaceable

## What A Proper Three Integration Should Return

The main Three adapter should expose a runtime scene instance instead of only a monolithic loader result.

Suggested shape:

```ts
type ThreeRuntimeSceneInstance = {
  root: Object3D;
  nodesById: Map<string, Object3D>;
  lights: Object3D[];
  physicsDescriptors: Array<{
    nodeId: string;
    object: Object3D;
    physics: RuntimePhysicsDescriptor;
  }>;
  entities: RuntimeEntity[];
  scene: RuntimeScene;
  dispose: () => void;
};
```

This object should be pure enough that the host can decide what to do next:

- add `root` to a scene
- inspect `nodesById`
- build colliders from `physicsDescriptors`
- attach gameplay systems to nodes and entities
- unload cleanly with `dispose()`

## Extension Points

The runtime platform must support controlled extension.

### Node type registry

Consumers should be able to register custom runtime node adapters without forking core packages.

Example use cases:

- foliage nodes
- spline-driven decals
- water volumes
- custom gameplay prefabs

### Material override hooks

Consumers should be able to replace or augment material construction.

Example use cases:

- custom shader material conversion
- runtime texture compression pipelines
- mobile fallback materials

### Asset resolution hooks

Consumers should be able to fully own URL resolution.

Example use cases:

- CDN versioning
- auth-gated asset URLs
- local cache layers
- asset pack routing

### Lifecycle hooks

Consumers should be able to observe scene instance creation.

Example lifecycle points:

- node created
- node mounted
- scene mounted
- scene disposed

### Gameplay hook registry

Authored hook data should remain data. Mapping that data to actual runtime systems should be explicit and host-controlled.

## Build And Deployment Model

The runtime platform must support both development convenience and production deployment.

### Development model

- author in editor
- export runtime bundle quickly
- validate in playground or example app

### Production model

- compile scenes during app build or content build
- emit unpacked manifests plus assets
- optionally emit zip bundles for testing or fallback delivery
- build a world index for chunked worlds
- host shared assets separately from chunk-local content

### Recommended output layout

```text
/world/world-index.json
/world/chunks/hub/scene.runtime.json
/world/chunks/hub/assets/...
/world/chunks/cave-a/scene.runtime.json
/world/chunks/cave-a/assets/...
/world/shared/props/...
/world/shared/textures/...
```

Zip bundles can still be emitted alongside this, but they should be secondary.

## Migration Strategy

The runtime architecture should be migrated in phases so the repo keeps working during the transition.

### Phase 1: Formalize the runtime contract

Goals:

- move runtime schema ownership out of the Three package
- stabilize terminology
- avoid breaking existing exports

Work:

- create `@web-hammer/runtime-format`
- move runtime scene and bundle types into it
- move parse and validation helpers into it
- make `@web-hammer/three-runtime` depend on it
- keep current public names available through compatibility re-exports

Success criteria:

- no runtime format types are owned primarily by the Three package
- current editor export still works unchanged

Status:

- Completed. The format contract now lives in `packages/runtime-format`, and `packages/three-runtime` keeps compatibility exports for the old names.

### Phase 2: Extract the headless build pipeline

Goals:

- make runtime build logic callable from outside the editor worker

Work:

- create `@web-hammer/runtime-build`
- move engine scene compilation from `packages/workers` into that package
- move bundling and externalization orchestration there
- keep `packages/workers` as transport and worker glue only

Success criteria:

- editor worker becomes a thin caller
- the same build code can run in CLI or CI contexts

Status:

- Completed for the runtime-export path. `packages/runtime-build` now owns authored snapshot compilation, bundling, asset externalization, world-index creation, and CLI usage.

### Phase 3: Refactor the Three adapter around scene instances

Goals:

- make the Three package clearly adapter-oriented

Work:

- introduce `createThreeRuntimeSceneInstance()`
- make the current loader call into that instance builder
- remove duplicated object creation logic between loader and object factory layers
- add explicit disposal semantics

Success criteria:

- there is one primary object creation path
- convenience loaders are wrappers, not the foundation

Status:

- Completed. `createThreeRuntimeSceneInstance()` is the primary scene-instantiation path, `loadWebHammerEngineScene()` wraps it, and explicit disposal now exists.

### Phase 4: Extract optional integration kits

Goals:

- stop using playground apps as the de facto architecture source

Work:

- identify reusable orchestration from the vanilla playground
- move physics integration into an optional physics package
- move chunk/world orchestration into an optional streaming package
- keep playgrounds as examples and validation apps

Success criteria:

- runtime orchestration exists as package APIs, not only example code
- consumers can pick and choose integrations

Status:

- Completed. `packages/runtime-physics-rapier` and `packages/runtime-streaming` now exist as optional integration kits, and the vanilla playground consumes the Rapier package.

### Phase 5: Add production-grade world workflows

Goals:

- support large worlds and natural deployment

Work:

- define world index schema
- support chunk manifests and shared asset packs
- add world build helpers
- add streaming helpers and example integrations

Success criteria:

- large worlds are modeled as chunk sets, not giant scene bundles

Status:

- Completed. `RuntimeWorldIndex` is formalized, `runtime-build` can create world indexes, `runtime-streaming` handles chunk orchestration, and docs now describe unpacked manifests and shared asset hosting.

## Decisions And Non-Goals

### Decision: keep zipped runtime bundles

Reason:

- they are valuable for editor UX and testing

Constraint:

- they are not the main architectural abstraction

### Decision: keep gameplay runtime separate from renderer runtime

Reason:

- gameplay should stay headless and portable

### Decision: do not hide Three.js from consumers

Reason:

- advanced teams need direct access to their renderer objects and lifecycle

### Non-goal: one package that does everything

That would recreate the current coupling problem in a more polished form.

### Non-goal: turning Web Hammer into a closed engine

The goal is to become an authoring and runtime platform that integrates into host apps, not to replace the host app.

## Immediate Task List

This is the concrete backlog required to move from the current architecture to the target architecture.

### Foundation

- Done: Create `packages/runtime-format`.
- Done: Move runtime manifest and bundle types out of `packages/three-runtime`.
- Done: Move runtime parse and type guard helpers into `packages/runtime-format`.
- Done: Add runtime format version and migration helpers.
- Done: Add tests for manifest parsing, validation, and backward compatibility.

### Build Pipeline

- Done: Create `packages/runtime-build`.
- Done: Move runtime scene compilation out of `packages/workers/src/export-tasks.ts`.
- Done: Move asset externalization and bundle packing orchestration into `packages/runtime-build`.
- Done for runtime export: Keep `packages/workers` responsible only for worker transport and request dispatch.
- Done: Add a programmatic build API usable from editor, tests, and future CLI.
- Done: Add tests that compare editor worker output against direct build package output.

### Three Adapter

- Done: Refactor `packages/three-runtime` to depend on `packages/runtime-format`.
- Done: Introduce `createThreeRuntimeSceneInstance()` as the main adapter entrypoint.
- Done: Make existing convenience loaders wrap the new scene instance builder.
- Done: Remove duplicated node/material/instancing construction logic from the loader layer.
- Done: Add explicit `dispose()` behavior for textures, object URLs, and scene-owned runtime resources.
- Done: Separate bundle helpers from Three-specific scene instantiation where practical.

### Gameplay Integration

- Done: Audit `packages/gameplay-runtime` against the runtime-format types.
- Done: Define a stable adapter between runtime scene data and gameplay scene data.
- Done: Add examples showing authored hooks consumed without renderer ownership leakage.
- Done: Ensure gameplay systems can run with either Three, R3F, or headless tests.

### Physics Integration

- Done: Extract Rapier-specific runtime bindings from playground orchestration into an optional adapter package.
- Done: Define a renderer-agnostic runtime physics descriptor contract if the current one is too Three-shaped.
- Done: Add an example showing host-owned physics world lifecycle.

### Streaming And World Scale

- Done: Define `RuntimeWorldIndex` schema in `packages/runtime-format`.
- Done: Add chunk metadata types and validation.
- Done: Add `packages/runtime-streaming` for optional world orchestration.
- Done: Support unpacked chunk manifest consumption as a first-class workflow.
- Done: Add examples for chunk load, unload, and shared asset hosting.

### Tooling

- Done: Add a CLI entrypoint for runtime builds.
- Done: Add a build example for Vite or Bun-based content compilation.
- Done: Add CI tests for representative runtime manifests and bundles.
- Done: Add snapshot fixtures for version migration tests.

### Documentation

- Done: Rewrite runtime docs around the new package split.
- Done: Document the distinction between `.whmap`, runtime manifest, and runtime bundle.
- Done: Document when to use packed bundles versus unpacked manifests.
- Done: Add integration guides for vanilla Three and React Three Fiber.
- Done: Add a host-ownership guide explaining what Web Hammer runtime does and does not own.

## Recommended Order Of Execution

Use this order to minimize churn and avoid breaking the editor.

1. Create `runtime-format` and move types first.
2. Create `runtime-build` and make workers call into it.
3. Refactor `three-runtime` around the scene instance API.
4. Extract optional physics and streaming integrations.
5. Add CLI and production world workflows.
6. Rewrite docs and examples last, once APIs are stable.

## End State

When this architecture is complete, Web Hammer should feel like this to consumers:

- authors build levels visually in the editor
- the game build compiles those levels into runtime artifacts
- the host application decides how those artifacts are loaded and mounted
- the Three adapter creates render objects without owning the game
- gameplay systems consume authored hooks headlessly
- chunk streaming and physics are opt-in integrations, not hidden assumptions

That is the correct long-term model.

Web Hammer should be an authoring platform with runtime adapters, not a tightly coupled editor export loader.
