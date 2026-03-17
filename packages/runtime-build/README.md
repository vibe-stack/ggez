# @web-hammer/runtime-build

Headless runtime build utilities for Web Hammer.

This package owns:

- compiling `.whmap` snapshots into `RuntimeScene`
- asset externalization
- runtime bundle packing and unpacking
- world-index creation
- a CLI for manifest and bundle output

## Install

```bash
bun add @web-hammer/runtime-build
```

## Build From A `.whmap` Snapshot

```ts
import {
  buildRuntimeBundleFromSnapshot,
  buildRuntimeSceneFromSnapshot
} from "@web-hammer/runtime-build";

const runtimeScene = await buildRuntimeSceneFromSnapshot(snapshot);
const runtimeBundle = await buildRuntimeBundleFromSnapshot(snapshot, {
  assetDir: "assets"
});
```

## CLI

```bash
web-hammer-runtime-build manifest --input level.whmap --output scene.runtime.json
web-hammer-runtime-build bundle --input level.whmap --output scene.runtime.zip
web-hammer-runtime-build world-index --chunks hub:/world/chunks/hub/scene.runtime.json --output world-index.json
```

Use this package from editor workers, CI, or a content-build step. It does not depend on Three runtime scene instantiation.
