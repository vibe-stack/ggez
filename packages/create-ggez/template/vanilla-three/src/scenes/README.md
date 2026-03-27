## Scene Folders

`@ggez/game-dev` discovers scene folders under `src/scenes/<scene-id>/`.

Each scene folder can contain:

- `index.ts`: optional scene logic that exports a `defineGameScene(...)` result
- `scene.runtime.json`: the runtime manifest exported from Web Hammer
- `scene.meta.json`: optional metadata with `id` and `title`
- `assets/`: optional colocated runtime assets referenced by the manifest

The starter scene modules use `createColocatedRuntimeSceneSource(...)` so the runtime manifest and asset URLs load on demand instead of being baked into the initial Vite bundle.

When you want to warm a scene before a transition, call `preloadScene("<scene-id>")` from scene code or `app.preloadScene("<scene-id>")` from the app shell.
