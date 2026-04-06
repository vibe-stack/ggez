import type { GpuEmitterExecutionPlan } from "./types";

export type InterpretedEmitterPreviewConfig = {
  startupBurstCount: number;
  eventBursts: Array<{ eventId: string; count: number }>;
  deathEventIds: string[];
  rate: number;
  spawnRadius: number;
  spreadDegrees: number;
  speedMin: number;
  speedMax: number;
  drag: number;
  gravity: number;
  orbitRadius: number;
  orbitAngularSpeed: number;
  curlStrength: number;
  lifetime?: number;
  sizeCurve?: string;
  alphaCurve?: string;
  colorCurve?: string;
};

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function interpretEmitterPreviewConfig(plan: GpuEmitterExecutionPlan): InterpretedEmitterPreviewConfig {
  const result: InterpretedEmitterPreviewConfig = {
    startupBurstCount: 0,
    eventBursts: [],
    deathEventIds: [],
    rate: 0,
    spawnRadius: 0,
    spreadDegrees: 16,
    speedMin: 60,
    speedMax: 180,
    drag: 2.8,
    gravity: 120,
    orbitRadius: 0,
    orbitAngularSpeed: 0,
    curlStrength: 0
  };

  for (const stage of plan.stages) {
    for (const instruction of stage.instructions) {
      const constants = instruction.constants;
      switch (instruction.opcode) {
        case "spawn-burst": {
          const eventId = typeof constants.everyEvent === "string" && constants.everyEvent.length > 0 ? constants.everyEvent : undefined;
          const count = Math.max(0, Math.round(readNumber(constants.count, 0)));
          if (eventId) {
            result.eventBursts.push({ eventId, count });
          } else {
            result.startupBurstCount += count;
          }
          break;
        }
        case "spawn-rate":
          result.rate += readNumber(constants.rate, 0);
          break;
        case "spawn-cone":
          result.spawnRadius = readNumber(constants.radius, result.spawnRadius);
          result.spreadDegrees = readNumber(constants.angleDegrees, result.spreadDegrees);
          break;
        case "velocity-cone":
          result.speedMin = readNumber(constants.speedMin, result.speedMin);
          result.speedMax = readNumber(constants.speedMax, result.speedMax);
          break;
        case "drag":
          result.drag = readNumber(constants.coefficient, result.drag);
          break;
        case "gravity-force":
          result.gravity = readNumber(constants.accelerationY, result.gravity);
          break;
        case "orbit-target":
          result.orbitRadius = readNumber(constants.radius, result.orbitRadius);
          result.orbitAngularSpeed = readNumber(constants.angularSpeed, result.orbitAngularSpeed);
          break;
        case "curl-noise-force":
          result.curlStrength = readNumber(constants.strength, result.curlStrength);
          break;
        case "set-attribute":
          if (constants.attribute === "lifetime") {
            result.lifetime = readNumber(constants.value, result.lifetime ?? 0.42);
          }
          break;
        case "size-over-life":
          if (typeof constants.curve === "string") {
            result.sizeCurve = constants.curve;
          }
          break;
        case "alpha-over-life":
          if (typeof constants.curve === "string") {
            result.alphaCurve = constants.curve;
          }
          break;
        case "color-over-life":
          if (typeof constants.curve === "string") {
            result.colorCurve = constants.curve;
          }
          break;
        case "send-event":
          if (stage.kind === "death" && typeof constants.eventId === "string" && constants.eventId.length > 0) {
            result.deathEventIds.push(constants.eventId);
          }
          break;
        default:
          break;
      }
    }
  }

  return result;
}
