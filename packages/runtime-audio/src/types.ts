import type { Vec3 } from "@ggez/shared";

export type AudioSourceHandle = {
  id: string;
  emitterId: string;
};

export type AudioEmitterState = {
  active: boolean;
  currentHandle?: AudioSourceHandle;
  hookId: string;
  targetId: string;
};

export type AudioEngineOptions = {
  maxConcurrentSources?: number;
};

export type SpatialAudioParams = {
  distanceModel?: "exponential" | "inverse" | "linear";
  maxDistance?: number;
  position?: Vec3;
  refDistance?: number;
  rolloffFactor?: number;
};

export type PlayAudioRequest = {
  loop?: boolean;
  spatial?: SpatialAudioParams;
  src: string;
  volume?: number;
};

export type AudioEngine = {
  dispose: () => void;
  isPlaying: (handle: AudioSourceHandle) => boolean;
  play: (request: PlayAudioRequest) => Promise<AudioSourceHandle>;
  resume: () => Promise<void>;
  setListenerOrientation: (forward: Vec3, up: Vec3) => void;
  setListenerPosition: (position: Vec3) => void;
  setMasterVolume: (volume: number) => void;
  setSourcePosition: (handle: AudioSourceHandle, position: Vec3) => void;
  stop: (handle: AudioSourceHandle) => void;
  stopAll: () => void;
};
