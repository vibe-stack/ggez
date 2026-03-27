# Suggested Project Layout

This page suggests a practical file layout for a vanilla Three.js game using Web Hammer runtime packages.

Related guides:

- [Getting Started](./getting-started.md)
- [Build Pipeline](./build-pipeline.md)
- [World Streaming](./world-streaming.md)

## Recommended Source Layout

```text
/src
  /game
    app.ts
    camera.ts
    runtime-physics.ts
    runtime-scene-sources.ts
    scene-types.ts
    starter-player-controller.ts
  /scenes
    /main
      index.ts
      scene.runtime.json
      /assets
    index.ts
```

Suggested responsibilities:

- `app.ts`: bootstraps Three, scene loading, fixed-step physics, gameplay runtime, and scene transitions
- `camera.ts`: shared camera framing helpers for non-player scenes
- `runtime-physics.ts`: starter collision extraction from runtime physics definitions
- `runtime-scene-sources.ts`: scene manifest loading, including source-colocated Vite asset resolution
- `scene-types.ts`: app-facing scene module contract
- `starter-player-controller.ts`: starter capsule controller driven by runtime player/camera settings
- `scenes/<id>/index.ts`: per-scene logic using `mount`, `systems`, `player`, and `gotoScene(...)`
- `scenes/<id>/scene.runtime.json`: colocated runtime manifest for that scene

## Recommended Built Asset Layout

```text
/public
  /world
    /world-index.json
    /chunks
      /hub
        scene.runtime.json
        /assets
      /cave-a
        scene.runtime.json
        /assets
    /shared
      /textures
      /props
```

## Minimal Scene Module

```ts
import {
  createColocatedRuntimeSceneSource,
  defineGameScene
} from "../game/runtime-scene-sources";

const assetUrlLoaders = import.meta.glob("./assets/**/*", {
  import: "default",
  query: "?url"
}) as Record<string, () => Promise<string>>;

export const mainScene = defineGameScene({
  id: "main",
  mount({ player, setStatus }) {
    if (player) {
      setStatus("Click to capture the cursor. WASD to move, Space to jump.");
    }
  },
  source: createColocatedRuntimeSceneSource({
    assetUrlLoaders,
    manifestLoader: () => import("./scene.runtime.json?raw").then((module) => module.default)
  }),
  title: "Main Scene"
});
```

## Minimal Runtime Loader Module

```ts
import { createThreeRuntimeSceneInstance } from "@ggez/three-runtime";
import { parseRuntimeScene } from "@ggez/runtime-format";

export async function loadRuntimeScene(chunkBaseUrl: string) {
  const response = await fetch(`${chunkBaseUrl}/scene.runtime.json`);
  const manifest = parseRuntimeScene(await response.text());

  return createThreeRuntimeSceneInstance(manifest, {
    resolveAssetUrl: ({ path }) => `${chunkBaseUrl}/${path}`
  });
}
```

## Minimal Gameplay Module

```ts
import {
  createGameplayRuntime,
  createGameplayRuntimeSceneFromRuntimeScene
} from "@ggez/gameplay-runtime";

export function createChunkGameplay(instance: Awaited<ReturnType<typeof loadRuntimeScene>>) {
  return createGameplayRuntime({
    scene: createGameplayRuntimeSceneFromRuntimeScene(instance.scene),
    systems: []
  });
}
```

## Minimal Streaming Module

```ts
import { createRuntimeWorldManager } from "@ggez/runtime-streaming";

export function createWorldStreaming(worldIndex, threeScene) {
  return createRuntimeWorldManager({
    async loadChunk(chunk) {
      const instance = await loadRuntimeScene(`/world/chunks/${chunk.id}`);
      threeScene.add(instance.root);
      return instance;
    },
    async unloadChunk(_chunk, instance) {
      threeScene.remove(instance.root);
      instance.dispose();
    },
    worldIndex
  });
}
```

## Final Advice

Keep Web Hammer isolated behind a small runtime boundary in your app.

The starter source helpers support lazy `load()` plus optional `preload()`. Scene modules also receive `preloadScene(...)`, and animation bundles expose `source.preload?.()` plus `bundle.preloadAssets()`.

That makes it easy to:

- swap chunk policies
- change physics integration
- add custom gameplay systems
- keep the rest of your game framework-independent

Back to the [Vanilla Three.js Guide](./README.md).
