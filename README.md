# GGEZ

GGEZ, pronounced "GG, Easy", is a framework for vibe-coding Three.js games.

The shortest description is: GGEZ aims to be a "Next.js for Three.js games". It gives you an opinionated monorepo, runtime packages, editors, an orchestration layer and a path from rough worldbuilding to playable web game prototypes.

## Public Alpha

This is the first public alpha release.

Expect rapid iteration, breaking changes, renamed APIs, moved files, and workflow churn until at least beta. If you build on GGEZ today, assume you are building with a fast-moving alpha and plan accordingly.

## What GGEZ Is

GGEZ combines several layers that usually live in separate repos or are bundled in one big engine:

- A world editor for building runtime scenes
- An animation editor for character and graph authoring
- Runtime packages for loading and playing authored content in Three.js games
- An orchestrator app that ties the tools and a running game together during development
- Documentation and starter-oriented package structure for publishing and reuse

## What You Get
- Codex everywhere: Inside the world editor to build scenes, inside the animation editor to construct animation graphs or edit clips and inside the orchestrator to modify the game directly!
- Brush and blockout tools for fast world iteration
- Mesh editing and material authoring
- Light, entity, prop, and model placement
- Scene save/load and runtime export workflows
- Animation graph authoring and clip import/export flows
- Three.js runtime packages for loading exported scene data in games
- A local orchestration workflow for switching between tools and a running game
- Monorepo package publishing support for reusable engine/runtime modules

## Repository Layout

### Apps

- `apps/orchestrator`: main local entrypoint that launches and coordinates the tools
- `apps/editor`: the world editor, formerly referred to as Trident
- `apps/animation-editor`: animation authoring tool
- `apps/website`: docs and onboarding site
- `apps/three-vanilla-playground`: isolated playground for runtime experimentation

### Packages

- `packages/three-runtime`: runtime scene loading for vanilla Three.js apps
- `packages/editor-core`: editor document model, commands, selection, and events
- `packages/geometry-kernel`: brush and mesh operations
- `packages/render-pipeline`: render-facing derived scene contracts
- `packages/game-dev`: game-side dev tooling, scene discovery, and editor sync hooks
- `packages/shared`: shared scene types and runtime-facing data structures
- `packages/*`: additional runtime, animation, tooling, and publishing packages used by the apps and samples

### Docs

- `docs/`: package and runtime documentation, mostly outdated atm, will fix later sry, just run the app you'll see how it works

## Requirements

- Bun 1.3 or newer
- macOS, Linux, or Windows with a modern browser
- Node-compatible toolchain support for some ecosystem scripts
- An npm account if you plan to publish packages
- A Fal API key only if you want AI-assisted generation features locally

## Clone And Install

1. Clone this Repository

2. Run it:
```bash
cd ggez
bun install
bun run start
```

## Quick Start

The normal way to run GGEZ locally is through the orchestrator:

```bash
bun run start
```

That starts the orchestrator in `apps/orchestrator`. From there you can:

- Open the world editor
- Open the animation editor
- Start and stop sample or local game projects
- Switch between tools and the running game during iteration

If the editor preview builds do not exist yet, the orchestrator will build them once before starting their preview servers.

## Running Individual Apps

If you want to work on one app directly instead of using the orchestrator:

```bash
bun run dev
bun run dev:animation-editor
bun run dev:website
bun run dev:three-vanilla
```

Those commands map to:

- `bun run dev`: world editor dev server
- `bun run dev:animation-editor`: animation editor dev server
- `bun run dev:website`: docs site dev server
- `bun run dev:three-vanilla`: runtime playground dev server

## Common Commands

```bash
bun run start
bun run build
bun run build:animation-editor
bun run build:orchestrator
bun run typecheck
bun run typecheck:animation-editor
bun run typecheck:orchestrator
```

## Typical Workflow

### Building a world

1. Start the orchestrator with `bun run start`.
2. Open the world editor.
3. Block out geometry, materials, lights, entities, and models.
4. Push or export the scene into a running game.
5. Switch to the game view and iterate.

### Building animation content

1. Open the animation editor.
2. Import a character and animation clips.
3. Build graphs and preview motion.
4. Push animation bundles into a running game.

### Building a game

1. Use one of the sample projects as a reference or start from your own workspace package/app setup.
2. Keep your runtime scenes under `src/scenes/<scene-id>/`.
3. Let `@ggez/game-dev` discover scenes and wire editor-sync behavior during development.
4. Load exported runtime bundles with the runtime packages in your game code.

## Environment Variables

The repo does not require environment variables for normal local use.

If you want AI generation features in the world editor, create `apps/editor/.env.local`:

```bash
FAL_KEY=your_fal_api_key_here
```

That key is used only by the local editor server routes and is not required for core editing, animation tooling, runtime work, or the orchestrator.

## Documentation

- Runtime and package docs live in `docs/`
- Additional package-specific notes live in the relevant `packages/*/README.md` files

## Current Status

GGEZ is usable, but it is still early.

You should expect:

- Breaking API changes
- Tooling and naming cleanup
- Package splits and reorganizations
- Editor workflow changes
- Release process changes while the project stabilizes

If you want the newest ideas and are comfortable moving with the repo, alpha is the right time to get in.

## License

MIT. See `LICENSE` for details.
