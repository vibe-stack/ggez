## Animation Bundle Folders

`@ggez/game-dev` discovers animation bundle folders under `src/animations/<bundle-id>/`.

Generated animation bundle folders contain:

- `index.ts`: the runtime entry module that exports a `defineGameAnimationBundle(...)` result
- `animation.bundle.json`: the bundle manifest
- `graph.animation.json`: the compiled graph artifact
- `animation.meta.json`: optional metadata with `id` and `title`
- `assets/`: character and clip source assets

The generated `index.ts` uses `createColocatedRuntimeAnimationSource(...)` so manifests and asset URLs are loaded on demand. After `source.load()` resolves, call `bundle.preloadAssets()` if you want to warm the underlying character and clip source files before gameplay uses them.
