import type { Vec3 } from "@ggez/shared";

/** Resolves a clip identifier to raw audio data the AudioManager can decode. */
export type AudioClipResolver = (clipId: string) => Promise<ArrayBuffer> | ArrayBuffer;

/** Web Audio API distance model for spatial attenuation. */
export type AudioDistanceModel = "exponential" | "inverse" | "linear";

/** Describes a single audio source managed by the AudioManager. */
export type AudioSourceState = {
  channel: AudioChannel;
  clipId: string;
  gainNode: GainNode;
  id: string;
  loop: boolean;
  pannerNode?: PannerNode;
  pitch: number;
  source?: AudioBufferSourceNode;
  spatial: boolean;
  startedAt: number;
  pausedAt: number;
  paused: boolean;
};

/** Audio mixer channel name. */
export type AudioChannel = "ambient" | "music" | "sfx" | "ui" | "voice";

/** Options for playing a clip through the AudioManager. */
export type AudioPlayOptions = {
  channel?: AudioChannel;
  clip: string;
  distanceModel?: AudioDistanceModel;
  id?: string;
  loop?: boolean;
  maxDistance?: number;
  pitch?: number;
  position?: Vec3;
  refDistance?: number;
  rolloffFactor?: number;
  spatial?: boolean;
  volume?: number;
};

/** Handle returned after playing a clip, allows controlling playback. */
export type AudioSourceHandle = {
  readonly id: string;
  pause: () => void;
  resume: () => void;
  setPosition: (position: Vec3) => void;
  setPitch: (rate: number) => void;
  setVolume: (volume: number) => void;
  stop: () => void;
};

/** Configuration for creating an AudioManager. */
export type AudioManagerOptions = {
  clipResolver: AudioClipResolver;
  masterVolume?: number;
};

/** Descriptor extracted from a runtime scene for an audio emitter. */
export type RuntimeAudioEmitterDescriptor = {
  autoPlay: boolean;
  clip: string;
  distanceModel: AudioDistanceModel;
  hookId: string;
  loop: boolean;
  maxDistance: number;
  pitch: number;
  position?: Vec3;
  refDistance: number;
  rolloffFactor: number;
  spatial: boolean;
  stopEvent?: string;
  targetId: string;
  triggerEvent?: string;
  volume: number;
};
