import {
  CURRENT_RUNTIME_SCENE_VERSION,
  CURRENT_RUNTIME_WORLD_INDEX_VERSION,
  MIN_RUNTIME_SCENE_VERSION,
  RUNTIME_SCENE_FORMAT,
  type RuntimeBundle,
  type RuntimeScene,
  type RuntimeWorldIndex,
  type WebHammerEngineBundle,
  type WebHammerEngineScene
} from "./types";

export type RuntimeValidationResult<T> =
  | {
      errors: [];
      ok: true;
      value: T;
    }
  | {
      errors: string[];
      ok: false;
    };

export function isRuntimeScene(value: unknown): value is RuntimeScene {
  return validateRuntimeScene(value).ok;
}

export function validateRuntimeScene(value: unknown): RuntimeValidationResult<RuntimeScene> {
  const errors: string[] = [];

  if (!value || typeof value !== "object") {
    return invalid("Runtime scene must be an object.");
  }

  const candidate = value as Partial<RuntimeScene>;

  if (candidate.metadata?.format !== RUNTIME_SCENE_FORMAT) {
    errors.push(`Runtime scene metadata.format must be "${RUNTIME_SCENE_FORMAT}".`);
  }

  if (typeof candidate.metadata?.version !== "number") {
    errors.push("Runtime scene metadata.version must be a number.");
  } else if (candidate.metadata.version < MIN_RUNTIME_SCENE_VERSION) {
    errors.push(`Runtime scene metadata.version must be >= ${MIN_RUNTIME_SCENE_VERSION}.`);
  }

  if (!Array.isArray(candidate.nodes)) {
    errors.push("Runtime scene nodes must be an array.");
  }

  if (!Array.isArray(candidate.assets)) {
    errors.push("Runtime scene assets must be an array.");
  }

  if (!Array.isArray(candidate.materials)) {
    errors.push("Runtime scene materials must be an array.");
  }

  if (!Array.isArray(candidate.entities)) {
    errors.push("Runtime scene entities must be an array.");
  }

  if (!Array.isArray(candidate.layers)) {
    errors.push("Runtime scene layers must be an array.");
  }

  if (!candidate.settings || typeof candidate.settings !== "object") {
    errors.push("Runtime scene settings must be an object.");
  }

  if (errors.length > 0) {
    return {
      errors,
      ok: false
    };
  }

  return {
    errors: [],
    ok: true,
    value: candidate as RuntimeScene
  };
}

export function migrateRuntimeScene(scene: RuntimeScene): RuntimeScene {
  const migrated = structuredClone(scene);

  migrated.metadata = {
    ...migrated.metadata,
    format: RUNTIME_SCENE_FORMAT,
    version: CURRENT_RUNTIME_SCENE_VERSION
  };

  return migrated;
}

export function parseRuntimeScene(text: string): RuntimeScene {
  const parsed = JSON.parse(text) as unknown;
  const validation = validateRuntimeScene(parsed);

  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  return migrateRuntimeScene(validation.value);
}

export function isRuntimeBundle(value: unknown): value is RuntimeBundle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RuntimeBundle>;
  return Array.isArray(candidate.files) && isRuntimeScene(candidate.manifest);
}

export function validateRuntimeBundle(value: unknown): RuntimeValidationResult<RuntimeBundle> {
  if (!value || typeof value !== "object") {
    return invalid("Runtime bundle must be an object.");
  }

  const candidate = value as Partial<RuntimeBundle>;
  const errors: string[] = [];

  if (!Array.isArray(candidate.files)) {
    errors.push("Runtime bundle files must be an array.");
  }

  const sceneValidation = validateRuntimeScene(candidate.manifest);

  if (!sceneValidation.ok) {
    errors.push(...sceneValidation.errors);
  }

  if (errors.length > 0) {
    return {
      errors,
      ok: false
    };
  }

  const manifest = migrateRuntimeScene((sceneValidation as Extract<typeof sceneValidation, { ok: true }>).value);

  return {
    errors: [],
    ok: true,
    value: {
      files: candidate.files!,
      manifest
    }
  };
}

export function isRuntimeWorldIndex(value: unknown): value is RuntimeWorldIndex {
  return validateRuntimeWorldIndex(value).ok;
}

export function validateRuntimeWorldIndex(value: unknown): RuntimeValidationResult<RuntimeWorldIndex> {
  if (!value || typeof value !== "object") {
    return invalid("Runtime world index must be an object.");
  }

  const candidate = value as Partial<RuntimeWorldIndex>;
  const errors: string[] = [];

  if (typeof candidate.version !== "number") {
    errors.push("Runtime world index version must be a number.");
  } else if (candidate.version > CURRENT_RUNTIME_WORLD_INDEX_VERSION) {
    errors.push(
      `Runtime world index version ${candidate.version} is newer than supported version ${CURRENT_RUNTIME_WORLD_INDEX_VERSION}.`
    );
  }

  if (!Array.isArray(candidate.chunks)) {
    errors.push("Runtime world index chunks must be an array.");
  }

  if (errors.length > 0) {
    return {
      errors,
      ok: false
    };
  }

  return {
    errors: [],
    ok: true,
    value: candidate as RuntimeWorldIndex
  };
}

export function parseRuntimeWorldIndex(text: string): RuntimeWorldIndex {
  const parsed = JSON.parse(text) as unknown;
  const validation = validateRuntimeWorldIndex(parsed);

  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  return validation.value;
}

export function parseWebHammerEngineScene(text: string): WebHammerEngineScene {
  return parseRuntimeScene(text);
}

export function isWebHammerEngineScene(value: unknown): value is WebHammerEngineScene {
  return isRuntimeScene(value);
}

export function isWebHammerEngineBundle(value: unknown): value is WebHammerEngineBundle {
  return isRuntimeBundle(value);
}

function invalid(message: string): RuntimeValidationResult<never> {
  return {
    errors: [message],
    ok: false
  };
}
