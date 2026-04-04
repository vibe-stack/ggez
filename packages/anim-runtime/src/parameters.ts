import type { CompiledAnimatorGraph } from "@ggez/anim-schema";

type RuntimeParameterValue = number | boolean;

export interface AnimatorParameterStore {
  readonly values: RuntimeParameterValue[];
  getIndex(name: string): number;
  getValue(index: number): RuntimeParameterValue | undefined;
  getValueByName(name: string): RuntimeParameterValue | undefined;
  advance(deltaTime: number): void;
  setFloat(name: string, value: number): void;
  setInt(name: string, value: number): void;
  setBool(name: string, value: boolean): void;
  trigger(name: string): void;
  resetTriggers(): void;
}

export function createAnimatorParameterStore(graph: CompiledAnimatorGraph): AnimatorParameterStore {
  const values = graph.parameters.map((parameter) => {
    if (parameter.type === "bool" || parameter.type === "trigger") {
      return Boolean(parameter.defaultValue ?? false);
    }

    return Number(parameter.defaultValue ?? 0);
  });
  const targetValues = [...values];
  const smoothingDurations = graph.parameters.map((parameter) => {
    if (parameter.type !== "float") {
      return 0;
    }

    return Math.max(0, Number(parameter.smoothingDuration ?? 0));
  });
  const nameToIndex = new Map(graph.parameters.map((parameter, index) => [parameter.name, index]));

  function requireIndex(name: string): number {
    const index = nameToIndex.get(name);
    if (index === undefined) {
      throw new Error(`Unknown animation parameter "${name}".`);
    }

    return index;
  }

  return {
    values,
    getIndex(name) {
      return requireIndex(name);
    },
    getValue(index) {
      return values[index];
    },
    getValueByName(name) {
      return values[requireIndex(name)];
    },
    advance(deltaTime) {
      if (deltaTime <= 0) {
        return;
      }

      graph.parameters.forEach((parameter, index) => {
        if (parameter.type !== "float") {
          return;
        }

        const smoothingDuration = smoothingDurations[index] ?? 0;
        if (smoothingDuration <= 1e-5) {
          values[index] = Number(targetValues[index] ?? 0);
          return;
        }

        const current = Number(values[index] ?? 0);
        const target = Number(targetValues[index] ?? 0);
        if (Math.abs(target - current) <= 1e-5) {
          values[index] = target;
          return;
        }

        const alpha = 1 - Math.exp(-deltaTime / smoothingDuration);
        values[index] = current + (target - current) * alpha;
      });
    },
    setFloat(name, value) {
      const index = requireIndex(name);
      targetValues[index] = value;
      if ((smoothingDurations[index] ?? 0) <= 1e-5) {
        values[index] = value;
      }
    },
    setInt(name, value) {
      const index = requireIndex(name);
      const nextValue = Math.trunc(value);
      values[index] = nextValue;
      targetValues[index] = nextValue;
    },
    setBool(name, value) {
      const index = requireIndex(name);
      values[index] = value;
      targetValues[index] = value;
    },
    trigger(name) {
      const index = requireIndex(name);
      values[index] = true;
      targetValues[index] = true;
    },
    resetTriggers() {
      graph.parameters.forEach((parameter, index) => {
        if (parameter.type === "trigger") {
          values[index] = false;
          targetValues[index] = false;
        }
      });
    }
  };
}
