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
- modular game runtime shell
- scene registry in `src/scenes`
- scene-local runtime manifests and assets
- starter capsule controller driven by runtime camera/player settings
- static collision extraction from runtime physics definitions
- scene-level `systems`, `mount`, and `gotoScene(...)` hooks
- Rapier runtime initialization
- gameplay-runtime bootstrap

## First Steps

1. Run the app and move around in the included starter scene.
2. Replace `src/scenes/main/scene.runtime.json` with your exported runtime scene when ready.
3. If your scene has assets, place them under `src/scenes/main/assets/`.
4. Inspect `src/scenes/arena/` for a second scene and the `gotoScene(...)` transition pattern.
5. Add custom logic in `src/scenes/main/index.ts` with `mount`, `systems`, `player`, and `gotoScene(...)`.

## Runtime Packages

- `@web-hammer/three-runtime`
- `@web-hammer/runtime-format`
- `@web-hammer/gameplay-runtime`
- `@web-hammer/runtime-physics-rapier`

## Notes

The scaffold is intentionally vanilla, but it is structured as a real game app rather than a preview playground.
