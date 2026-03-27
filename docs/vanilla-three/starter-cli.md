# Starter CLI

You can scaffold a vanilla Vite + TypeScript + Three.js + Rapier starter with the Web Hammer CLI package.

Related guides:

- [Getting Started](./getting-started.md)
- [Suggested Project Layout](./project-layout.md)

## CLI Package

- package: `create-ggez`
- command: `create-ggez`

## Create A Starter Project

Using Bun:

```bash
bunx create-ggez my-game
```

Using npm:

```bash
npx create-ggez my-game --package-manager npm
```

Using pnpm:

```bash
pnpm dlx create-ggez my-game --package-manager pnpm
```

Inside this repository, create starters under `samples/*` so Bun can resolve the local `@ggez/*` workspace packages.

## What It Generates

The starter includes:

- Vite
- TypeScript
- Three.js
- Rapier
- `@ggez/three-runtime`
- `@ggez/runtime-format`
- `@ggez/gameplay-runtime`
- `@ggez/runtime-physics-crashcat`
- a scaffold-owned starter player controller that reads runtime camera/player settings
- scene modules with `mount`, `systems`, `player`, and `gotoScene(...)`

## After Scaffolding

```bash
cd my-game
bun install
bun run dev
```

The generated project boots immediately from `src/scenes/main/scene.runtime.json` with a walkable floor, a player spawn, and the starter capsule controller.

Then:

1. export a runtime manifest from Web Hammer
2. replace `src/scenes/main/scene.runtime.json`
3. place scene assets under `src/scenes/main/assets/` if you want source-colocated scenes
4. add custom logic in `src/scenes/main/index.ts`
5. replace or extend the starter scene manifest in `src/scenes/main/scene.runtime.json`
6. add more scene folders under `src/scenes/<scene-id>/` and more animation bundle folders under `src/animations/<bundle-id>/`

Continue with [Build Pipeline](./build-pipeline.md).
