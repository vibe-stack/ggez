# @web-hammer/runtime-streaming

Optional world-streaming orchestration for Web Hammer runtime chunks.

This package owns:

- world-index driven chunk state
- focus-based load and unload decisions
- host-provided chunk loading and unloading
- concurrency limits for chunk loading

## Install

```bash
bun add @web-hammer/runtime-streaming
```

## Example

```ts
import { createRuntimeWorldManager } from "@web-hammer/runtime-streaming";

const manager = createRuntimeWorldManager({
  async loadChunk(chunk) {
    return fetch(chunk.manifestUrl!).then((response) => response.json());
  },
  async unloadChunk(_chunk, data) {
    data.dispose?.();
  },
  worldIndex
});

await manager.updateStreamingFocus({ x: 0, y: 1.8, z: 0 });
```

The package is adapter-agnostic. Your host decides how a loaded chunk becomes render objects, gameplay state, or cached data.
