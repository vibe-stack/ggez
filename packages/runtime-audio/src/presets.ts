import type { AudioPlayOptions } from "./types";

/**
 * Preset partial options that can be spread into an `AudioPlayOptions`.
 *
 * Usage:
 * ```ts
 * audioManager.play({ clip: "door_open.ogg", ...AUDIO_EMITTER_PRESETS.mechanism });
 * audioManager.play({ clip: "rain.ogg", ...AUDIO_EMITTER_PRESETS.ambientZone, position });
 * ```
 */
export type AudioEmitterPreset = Omit<AudioPlayOptions, "clip" | "id" | "position">;

// ---------------------------------------------------------------------------
//  Emitter presets — define *how* a source behaves (spatial, loop, volume…)
// ---------------------------------------------------------------------------

/** Small, localized 3D sound. Footsteps, switches, impacts. */
const pointSource: AudioEmitterPreset = {
  distanceModel: "inverse",
  loop: false,
  maxDistance: 50,
  pitch: 1,
  refDistance: 1,
  rolloffFactor: 1,
  spatial: true,
  volume: 1
};

/** Ambient background loop, non-spatial. Wind, city noise, music bed. */
const ambientLoop: AudioEmitterPreset = {
  loop: true,
  spatial: false,
  volume: 0.4
};

/** Spatial ambient zone — audible when inside an area. Water stream, fire crackle, machinery hum. */
const ambientZone: AudioEmitterPreset = {
  distanceModel: "linear",
  loop: true,
  maxDistance: 30,
  refDistance: 5,
  rolloffFactor: 1,
  spatial: true,
  volume: 0.6
};

/** Background music track, non-spatial, looped, lower volume. */
const music: AudioEmitterPreset = {
  loop: true,
  spatial: false,
  volume: 0.3
};

/** One-shot UI feedback sound — button clicks, notifications. */
const ui: AudioEmitterPreset = {
  loop: false,
  spatial: false,
  volume: 0.7
};

/** Voice / dialogue line, non-spatial, one-shot, full volume. */
const dialogue: AudioEmitterPreset = {
  loop: false,
  spatial: false,
  volume: 1
};

/** Spatial dialogue — NPC speaking in the world. */
const dialogue3d: AudioEmitterPreset = {
  distanceModel: "inverse",
  loop: false,
  maxDistance: 30,
  refDistance: 2,
  rolloffFactor: 1.5,
  spatial: true,
  volume: 1
};

/** Close-range mechanical sound — door hinge, valve turn, lever pull. */
const mechanism: AudioEmitterPreset = {
  distanceModel: "inverse",
  loop: false,
  maxDistance: 20,
  pitch: 1,
  refDistance: 0.5,
  rolloffFactor: 2,
  spatial: true,
  volume: 0.8
};

/** Weapon or explosion — loud, travels far. */
const weapon: AudioEmitterPreset = {
  distanceModel: "inverse",
  loop: false,
  maxDistance: 200,
  refDistance: 5,
  rolloffFactor: 0.8,
  spatial: true,
  volume: 1
};

/** Footstep — very short range, quiet. */
const footstep: AudioEmitterPreset = {
  distanceModel: "inverse",
  loop: false,
  maxDistance: 15,
  refDistance: 0.5,
  rolloffFactor: 2,
  spatial: true,
  volume: 0.5
};

/** Large environmental element — waterfall, generator, train. Audible from far away. */
const environmental: AudioEmitterPreset = {
  distanceModel: "linear",
  loop: true,
  maxDistance: 100,
  refDistance: 10,
  rolloffFactor: 1,
  spatial: true,
  volume: 0.7
};

/** Collectible pickup jingle — non-spatial, slightly pitched up. */
const pickup: AudioEmitterPreset = {
  loop: false,
  pitch: 1.1,
  spatial: false,
  volume: 0.8
};

export const AUDIO_EMITTER_PRESETS = {
  ambientLoop,
  ambientZone,
  dialogue,
  dialogue3d,
  environmental,
  footstep,
  mechanism,
  music,
  pickup,
  pointSource,
  ui,
  weapon
} as const;

// ---------------------------------------------------------------------------
//  Attenuation presets — spatial distance curves for different environments
// ---------------------------------------------------------------------------

export type AudioAttenuationPreset = Pick<
  AudioPlayOptions,
  "distanceModel" | "maxDistance" | "refDistance" | "rolloffFactor"
>;

/** Tight indoor space — sound drops off quickly. */
const indoor: AudioAttenuationPreset = {
  distanceModel: "inverse",
  maxDistance: 25,
  refDistance: 1,
  rolloffFactor: 2.5
};

/** Standard outdoor environment — gradual falloff. */
const outdoor: AudioAttenuationPreset = {
  distanceModel: "inverse",
  maxDistance: 150,
  refDistance: 5,
  rolloffFactor: 0.6
};

/** Large reverberant space — cathedral, warehouse, canyon. */
const cathedral: AudioAttenuationPreset = {
  distanceModel: "inverse",
  maxDistance: 200,
  refDistance: 8,
  rolloffFactor: 0.4
};

/** Very close range — whisper, tiny mechanism, breathing. */
const intimate: AudioAttenuationPreset = {
  distanceModel: "exponential",
  maxDistance: 5,
  refDistance: 0.3,
  rolloffFactor: 3
};

/** Underwater or heavily dampened environment. */
const underwater: AudioAttenuationPreset = {
  distanceModel: "exponential",
  maxDistance: 20,
  refDistance: 1,
  rolloffFactor: 4
};

/** Linear falloff — useful for clearly defined audio zones. */
const linearZone: AudioAttenuationPreset = {
  distanceModel: "linear",
  maxDistance: 30,
  refDistance: 5,
  rolloffFactor: 1
};

export const AUDIO_ATTENUATION_PRESETS = {
  cathedral,
  indoor,
  intimate,
  linearZone,
  outdoor,
  underwater
} as const;
