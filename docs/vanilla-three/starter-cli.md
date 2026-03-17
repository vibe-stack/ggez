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
- `@web-hammer/runtime-streaming`

## After Scaffolding

```bash
cd my-game
bun install
bun run dev
```

The generated project already includes a placeholder `public/scene.runtime.json`, so it boots immediately.

Then:

1. export a runtime manifest from Web Hammer
2. replace `public/scene.runtime.json` or point `loadRuntimeScene()` at your manifest URL
3. adjust `resolveAssetUrl` in `src/main.ts` if your asset paths differ

Continue with [Build Pipeline](./build-pipeline.md).
