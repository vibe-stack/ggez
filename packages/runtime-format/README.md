# @web-hammer/runtime-format

Renderer-agnostic runtime contracts for Web Hammer.

This package owns:

- `RuntimeScene`
- `RuntimeBundle`
- `RuntimeWorldIndex`
- runtime scene validation and migration
- world-index parsing
- renderer-agnostic physics descriptor enumeration

## Install

```bash
bun add @web-hammer/runtime-format
```

## Example

```ts
import {
  getRuntimePhysicsDescriptors,
  parseRuntimeScene,
  parseRuntimeWorldIndex,
  validateRuntimeScene
} from "@web-hammer/runtime-format";

const scene = parseRuntimeScene(runtimeSceneJson);
const validation = validateRuntimeScene(scene);

if (!validation.ok) {
  throw new Error(validation.errors.join("\n"));
}

const physics = getRuntimePhysicsDescriptors(scene);
const worldIndex = parseRuntimeWorldIndex(worldIndexJson);
```

Use this package when you need the content contract without pulling in Three.js, Rapier, or editor code.
