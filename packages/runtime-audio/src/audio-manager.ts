import type { Vec3 } from "@ggez/shared";
import type {
  AudioChannel,
  AudioClipResolver,
  AudioManagerOptions,
  AudioPlayOptions,
  AudioSourceHandle,
  AudioSourceState
} from "./types";

const CHANNELS: AudioChannel[] = ["sfx", "music", "ambient", "ui", "voice"];
const DEFAULT_CHANNEL: AudioChannel = "sfx";

/**
 * Manages Web Audio API context, clip loading/caching, playback, 3D spatial audio,
 * and a built-in mixer with independent channel volumes (sfx, music, ambient, ui, voice).
 *
 * Audio graph:  source → gainNode → [pannerNode] → channelGain → masterGain → destination
 */
export class AudioManager {
  private readonly context: AudioContext;
  private readonly masterGain: GainNode;
  private readonly channelGains: Record<AudioChannel, GainNode>;
  private readonly clipResolver: AudioClipResolver;
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly pendingLoads = new Map<string, Promise<AudioBuffer>>();
  private readonly activeSources = new Map<string, AudioSourceState>();
  private sourceSequence = 0;

  constructor(options: AudioManagerOptions) {
    this.clipResolver = options.clipResolver;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = Math.max(0, Math.min(1, options.masterVolume ?? 1));
    this.masterGain.connect(this.context.destination);

    // Create one GainNode per channel, all feeding into masterGain.
    this.channelGains = {} as Record<AudioChannel, GainNode>;
    for (const channel of CHANNELS) {
      const gain = this.context.createGain();
      gain.gain.value = 1;
      gain.connect(this.masterGain);
      this.channelGains[channel] = gain;
    }
  }

  // ---------------------------------------------------------------------------
  //  Context lifecycle
  // ---------------------------------------------------------------------------

  /** Resume the AudioContext after a user gesture (required by browsers). */
  async resume() {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  // ---------------------------------------------------------------------------
  //  Master volume
  // ---------------------------------------------------------------------------

  /** Master volume (0–1). Affects all channels. */
  get masterVolume() {
    return this.masterGain.gain.value;
  }

  set masterVolume(value: number) {
    this.masterGain.gain.value = Math.max(0, Math.min(1, value));
  }

  // ---------------------------------------------------------------------------
  //  Channel mixer
  // ---------------------------------------------------------------------------

  /** Get the volume of a mixer channel (0–1). */
  getChannelVolume(channel: AudioChannel): number {
    return this.channelGains[channel]?.gain.value ?? 1;
  }

  /** Set the volume of a mixer channel (0–1). */
  setChannelVolume(channel: AudioChannel, volume: number) {
    const gain = this.channelGains[channel];
    if (gain) {
      gain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /** Get all channel names. */
  get channels(): readonly AudioChannel[] {
    return CHANNELS;
  }

  // ---------------------------------------------------------------------------
  //  Listener (spatial audio)
  // ---------------------------------------------------------------------------

  /** Update the listener position and optional orientation for spatial audio. */
  setListenerPosition(position: Vec3, forward?: Vec3, up?: Vec3) {
    const listener = this.context.listener;

    if (listener.positionX) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
    } else {
      listener.setPosition(position.x, position.y, position.z);
    }

    if (forward && up) {
      if (listener.forwardX) {
        listener.forwardX.value = forward.x;
        listener.forwardY.value = forward.y;
        listener.forwardZ.value = forward.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
      } else {
        listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Clip loading
  // ---------------------------------------------------------------------------

  /** Load and decode a clip into the buffer cache. Deduplicates concurrent loads. */
  async loadClip(clipId: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(clipId);
    if (cached) return cached;

    // Deduplicate in-flight loads for the same clip.
    const pending = this.pendingLoads.get(clipId);
    if (pending) return pending;

    const loadPromise = (async () => {
      try {
        const raw = await this.clipResolver(clipId);
        const buffer = await this.context.decodeAudioData(raw.slice(0));
        this.bufferCache.set(clipId, buffer);
        return buffer;
      } catch (error) {
        throw new Error(
          `AudioManager: failed to load clip "${clipId}": ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        this.pendingLoads.delete(clipId);
      }
    })();

    this.pendingLoads.set(clipId, loadPromise);
    return loadPromise;
  }

  // ---------------------------------------------------------------------------
  //  Playback
  // ---------------------------------------------------------------------------

  /** Play a clip and return a handle to control the source. */
  async play(options: AudioPlayOptions): Promise<AudioSourceHandle> {
    await this.resume();

    const buffer = await this.loadClip(options.clip);
    const id = options.id ?? `audio:${this.sourceSequence += 1}`;
    const channel = options.channel ?? DEFAULT_CHANNEL;

    // Stop any existing source with the same id.
    this.stopById(id);

    const channelGain = this.channelGains[channel] ?? this.channelGains.sfx;
    const gainNode = this.context.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, options.volume ?? 1));

    let pannerNode: PannerNode | undefined;

    if (options.spatial) {
      pannerNode = this.context.createPanner();
      pannerNode.panningModel = "HRTF";
      pannerNode.distanceModel = options.distanceModel ?? "inverse";
      pannerNode.refDistance = options.refDistance ?? 1;
      pannerNode.maxDistance = options.maxDistance ?? 10000;
      pannerNode.rolloffFactor = options.rolloffFactor ?? 1;

      if (options.position) {
        pannerNode.positionX.value = options.position.x;
        pannerNode.positionY.value = options.position.y;
        pannerNode.positionZ.value = options.position.z;
      }

      gainNode.connect(pannerNode);
      pannerNode.connect(channelGain);
    } else {
      gainNode.connect(channelGain);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = options.pitch ?? 1;
    source.connect(gainNode);
    source.start(0);

    const state: AudioSourceState = {
      channel,
      clipId: options.clip,
      gainNode,
      id,
      loop: options.loop ?? false,
      pannerNode,
      paused: false,
      pausedAt: 0,
      pitch: options.pitch ?? 1,
      source,
      spatial: options.spatial ?? false,
      startedAt: this.context.currentTime
    };

    source.onended = () => {
      if (!state.paused) {
        this.cleanupSource(id);
      }
    };

    this.activeSources.set(id, state);

    return this.createHandle(id);
  }

  /** Play a one-shot clip that cannot be stopped or paused. Fire-and-forget. */
  async playOneShot(clip: string, volume = 1, pitch = 1, channel: AudioChannel = "sfx") {
    await this.resume();

    const buffer = await this.loadClip(clip);
    const channelGain = this.channelGains[channel] ?? this.channelGains.sfx;
    const gainNode = this.context.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, volume));
    gainNode.connect(channelGain);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    source.connect(gainNode);
    source.onended = () => {
      gainNode.disconnect();
    };
    source.start(0);
  }

  // ---------------------------------------------------------------------------
  //  Source control
  // ---------------------------------------------------------------------------

  /** Get a handle for an active source by its id. */
  getSource(id: string): AudioSourceHandle | undefined {
    if (!this.activeSources.has(id)) {
      return undefined;
    }

    return this.createHandle(id);
  }

  /** Stop a source by id. */
  stop(id: string) {
    this.stopById(id);
  }

  /** Stop all active sources. */
  stopAll() {
    for (const id of [...this.activeSources.keys()]) {
      this.stopById(id);
    }
  }

  /** Stop all active sources on a specific channel. */
  stopChannel(channel: AudioChannel) {
    for (const [id, state] of this.activeSources) {
      if (state.channel === channel) {
        this.stopById(id);
      }
    }
  }

  /** Pause a source by id. */
  pause(id: string) {
    const state = this.activeSources.get(id);

    if (!state || state.paused || !state.source) {
      return;
    }

    state.pausedAt = this.context.currentTime - state.startedAt;
    state.paused = true;
    state.source.onended = null;
    state.source.stop();
    state.source.disconnect();
    state.source = undefined;
  }

  /** Resume a paused source by id. */
  async resumeSource(id: string) {
    const state = this.activeSources.get(id);

    if (!state || !state.paused) {
      return;
    }

    const buffer = this.bufferCache.get(state.clipId);

    if (!buffer) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = state.loop;
    source.playbackRate.value = state.pitch;
    source.connect(state.gainNode);
    source.start(0, state.pausedAt);

    source.onended = () => {
      if (!state.paused) {
        this.cleanupSource(id);
      }
    };

    state.source = source;
    state.paused = false;
    state.startedAt = this.context.currentTime - state.pausedAt;
  }

  /** Whether a source with the given id is currently active. */
  isPlaying(id: string) {
    const state = this.activeSources.get(id);
    return state !== undefined && !state.paused;
  }

  /** Number of active sources. */
  get activeSourceCount() {
    return this.activeSources.size;
  }

  // ---------------------------------------------------------------------------
  //  Dispose
  // ---------------------------------------------------------------------------

  /** Dispose the AudioManager and release all resources. */
  dispose() {
    this.stopAll();
    this.bufferCache.clear();
    this.pendingLoads.clear();
    for (const gain of Object.values(this.channelGains)) {
      gain.disconnect();
    }
    this.masterGain.disconnect();
    void this.context.close();
  }

  // ---------------------------------------------------------------------------
  //  Private
  // ---------------------------------------------------------------------------

  private stopById(id: string) {
    const state = this.activeSources.get(id);

    if (!state) {
      return;
    }

    if (state.source) {
      state.source.onended = null;

      try {
        state.source.stop();
      } catch {
        // Already stopped.
      }

      state.source.disconnect();
    }

    this.cleanupSource(id);
  }

  private cleanupSource(id: string) {
    const state = this.activeSources.get(id);

    if (!state) {
      return;
    }

    state.gainNode.disconnect();
    state.pannerNode?.disconnect();
    this.activeSources.delete(id);
  }

  private createHandle(id: string): AudioSourceHandle {
    return {
      id,
      pause: () => this.pause(id),
      resume: () => void this.resumeSource(id),
      setPosition: (position: Vec3) => {
        const state = this.activeSources.get(id);

        if (state?.pannerNode) {
          state.pannerNode.positionX.value = position.x;
          state.pannerNode.positionY.value = position.y;
          state.pannerNode.positionZ.value = position.z;
        }
      },
      setPitch: (rate: number) => {
        const state = this.activeSources.get(id);

        if (state) {
          state.pitch = rate;

          if (state.source) {
            state.source.playbackRate.value = rate;
          }
        }
      },
      setVolume: (volume: number) => {
        const state = this.activeSources.get(id);

        if (state) {
          state.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
      },
      stop: () => this.stopById(id)
    };
  }
}

/** Create a new AudioManager instance. */
export function createAudioManager(options: AudioManagerOptions): AudioManager {
  return new AudioManager(options);
}
