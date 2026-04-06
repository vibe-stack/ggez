# VFX Editor Architecture

## Overview

The VFX stack mirrors the animation stack on purpose:

1. Authoring lives in a stable editor document.
2. Compilation lowers authoring semantics into a typed runtime IR.
3. Runtime execution and rendering stay separate from React and from TSL-heavy authoring concerns.

This editor is not a shader graph. It is an effect-authoring system built around emitters, stages, events, data interfaces, renderer assignment, and scalability.

## Package Tree

```text
apps/
  vfx-editor/

packages/
  vfx-schema/
  vfx-core/
  vfx-compiler/
  vfx-runtime/
  vfx-three/
  vfx-exporter/
  vfx-editor-core/
```

## Core Asset Types

- `VfxEffectDocument`
  Top-level authoring asset with parameters, events, emitters, effect graph, preview metadata, scalability, and budgets.
- `EmitterDocument`
  Simulation-domain asset with typed attributes, ordered spawn/initialize/update/death stages, event handlers, source bindings, and renderer slots.
- `ModuleInstance`
  Reusable behavior unit such as `SpawnBurst`, `CurlNoiseForce`, `CollisionBounce`, or `ColorOverLife`.
- `RendererSlot`
  Visual output binding to a shared renderer template such as `SpriteAdditiveMaterial` or `RibbonTrailMaterial`.
- `DataInterfaceBinding`
  First-class external data source contract such as bones, mesh surfaces, splines, or collision/depth sources.
- `CompiledVfxEffect`
  Runtime IR with deterministic emitter layouts, stage plans, op tables, material signatures, and budget estimates.
- `VfxArtifact`
  Versioned shipping artifact that wraps `CompiledVfxEffect`.
- `VfxBundle`
  Runtime bundle manifest that points at the artifact and linked assets.

## Authoring Model

The editor uses a hybrid authoring UX:

- `Effect Graph`
  High-level semantic graph for emitters, parameters, event routing, data interfaces, subgraphs, and scalability.
- `Emitter Stage Stack`
  Ordered module stacks for `spawn`, `initialize`, `update`, `death`, and named event stages.
- `Renderer Panel`
  Purely visual configuration that does not redefine simulation behavior.

Most authoring should happen without opening shader code.

## Compile Pipeline

```text
VfxEffectDocument
  -> parse + validate
  -> resolve subgraphs/templates
  -> infer attribute layout
  -> lower stage modules to op plans
  -> derive renderer bindings + material signatures
  -> estimate budgets + scalability warnings
  -> CompiledVfxEffect
  -> VfxArtifact / VfxBundle
```

Important rule: simulation logic lowers to stage plans and op tables, not to one giant material graph.

## Runtime IR

- `CompiledEmitter.attributeLayout`
  Packed typed attribute map shared by simulation and render backends.
- `CompiledStagePlan`
  Ordered stage execution plan such as `spawn`, `initialize`, `update`, `death`, or `event:collision`.
- `ModuleOpPlan`
  Lowered reusable opcode entry with explicit read/write masks and constant payloads.
- `CompiledRendererBinding`
  Template-based renderer assignment with a stable material signature and overdraw risk estimate.
- `CompiledBudgetReport`
  Particle cap, spawn peak, update cost, memory estimate, collision/ribbon/sort cost, pipeline risk, and overdraw risk.

## Shader / Pipeline Strategy

Avoid shader explosion by keeping these boundaries hard:

- Simulation kernels are selected by stage and module opcodes.
- Renderer materials come from a small shared template set.
- Material signatures are built from a controlled set of feature axes:
  `template + blendMode + lightingMode + softParticles + depthFade + flipbook + facingMode + distortion + sortMode`
- Per-effect unique TSL graphs are not generated.

TSL is reserved for renderer templates:

- `SpriteSmokeMaterial`
- `SpriteAdditiveMaterial`
- `RibbonTrailMaterial`
- `MeshParticleMaterial`
- `DistortionMaterial`
- `BeamMaterial`

## Integration Targets

- World editor:
  extend `vfx_emitter` hooks to reference `effectId`, binding mode, source socket/bone, parameter overrides, and prewarm hints.
- Character editor:
  attach previews to bones or equipment sockets for muzzle flashes, trails, and impact effects.
- Animation editor:
  animation notifies emit `vfx.play` or named VFX events using the same preview character and clip ecosystem.

## MVP Scope

- GPU particle architecture with backend abstraction
- Burst + continuous spawn
- Typed particle attributes
- Event routing
- Bone/socket, mesh, and spline source bindings
- Forces, drag, curl noise
- Age-based kill
- Sprite, ribbon, and mesh particle renderers
- Shared renderer templates
- Budget diagnostics and compile diagnostics
- Isolated, world-attach, and character-attach preview modes
