# __PROJECT_NAME__

Vanilla Vite + TypeScript + Three.js + Rapier starter for Web Hammer runtime.

## Scripts

```bash
__PACKAGE_MANAGER__ install
__PACKAGE_MANAGER__ run dev
__PACKAGE_MANAGER__ run build
```

## What This Starter Includes

- plain Vite app
- TypeScript
- Three.js renderer setup
- Rapier runtime initialization
- Web Hammer runtime scene loading helper
- gameplay-runtime bootstrap
- runtime-streaming bootstrap placeholder

## First Steps

1. Run the app with the included placeholder manifest at `public/scene.runtime.json`.
2. Export a real runtime manifest from Web Hammer when you are ready.
3. Replace `public/scene.runtime.json` or update `loadRuntimeScene()` in `src/main.ts` if your asset base path differs.

## Runtime Packages

- `@web-hammer/three-runtime`
- `@web-hammer/runtime-format`
- `@web-hammer/gameplay-runtime`
- `@web-hammer/runtime-physics-rapier`
- `@web-hammer/runtime-streaming`

## Notes

The scaffold is intentionally vanilla. It does not impose React, ECS, or app-framework structure.
