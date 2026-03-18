# Starter CLI

You can scaffold a vanilla Vite + TypeScript + Three.js + Rapier starter with the Web Hammer CLI package.

Related guides:

- [Getting Started](./getting-started.md)
- [Suggested Project Layout](./project-layout.md)

## CLI Package

- package: `create-web-hammer`
- command: `create-web-hammer`

## Create A Starter Project

Using Bun:

```bash
bunx create-web-hammer my-game
```

Using npm:

```bash
npx create-web-hammer my-game --package-manager npm
```

Using pnpm:

```bash
pnpm dlx create-web-hammer my-game --package-manager pnpm
```

Inside this repository, create starters under `samples/*` so Bun can resolve the local `@web-hammer/*` workspace packages.

## What It Generates

The starter includes:

- Vite
- TypeScript
- Three.js
- Rapier
- `@web-hammer/three-runtime`
- `@web-hammer/runtime-format`
- `@web-hammer/gameplay-runtime`
- `@web-hammer/runtime-physics-rapier`
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
4. inspect `src/scenes/arena/` for the bundled second-scene transition example
5. add custom logic in `src/scenes/main/index.ts`
6. register more scenes in `src/scenes/index.ts`

Continue with [Build Pipeline](./build-pipeline.md).
