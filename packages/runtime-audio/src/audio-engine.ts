import type { Vec3 } from "@ggez/shared";
import type { AudioEngine, AudioEngineOptions, AudioSourceHandle, PlayAudioRequest } from "./types";

type ActiveSource = {
  gainNode: GainNode;
  handle: AudioSourceHandle;
  pannerNode?: PannerNode;
  sourceNode: AudioBufferSourceNode;
};

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const maxConcurrent = options.maxConcurrentSources ?? 32;
  const context = new AudioContext();
  const masterGain = context.createGain();
  masterGain.connect(context.destination);

  const bufferCache = new Map<string, Promise<AudioBuffer>>();
  const activeSources = new Map<string, ActiveSource>();
  let handleCounter = 0;

  function loadBuffer(src: string): Promise<AudioBuffer> {
    const cached = bufferCache.get(src);

    if (cached) {
      return cached;
    }

    const pending = (async () => {
      try {
        let arrayBuffer: ArrayBuffer;

        if (src.startsWith("data:")) {
          const commaIndex = src.indexOf(",");
          const base64 = src.slice(commaIndex + 1);
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);

          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }

          arrayBuffer = bytes.buffer;
        } else {
          const response = await fetch(src);
          arrayBuffer = await response.arrayBuffer();
        }

        return await context.decodeAudioData(arrayBuffer);
      } catch (error) {
        bufferCache.delete(src);
        throw error;
      }
    })();

    bufferCache.set(src, pending);
    return pending;
  }

  function createHandle(emitterId: string): AudioSourceHandle {
    handleCounter += 1;
    return { emitterId, id: `audio:${handleCounter}` };
  }

  function stopSource(source: ActiveSource) {
    try {
      source.sourceNode.stop();
    } catch {
      // already stopped
    }

    source.sourceNode.disconnect();
    source.gainNode.disconnect();
    source.pannerNode?.disconnect();
  }

  return {
    dispose() {
      activeSources.forEach(stopSource);
      activeSources.clear();
      bufferCache.clear();
      context.close().catch(() => {});
    },

    isPlaying(handle) {
      return activeSources.has(handle.id);
    },

    async resume() {
      if (context.state === "suspended") {
        await context.resume();
      }
    },

    async play(request: PlayAudioRequest) {
      if (context.state === "suspended") {
        await context.resume();
      }

      if (activeSources.size >= maxConcurrent) {
        const oldest = activeSources.keys().next().value;

        if (oldest) {
          const source = activeSources.get(oldest);

          if (source) {
            stopSource(source);
          }

          activeSources.delete(oldest);
        }
      }

      const buffer = await loadBuffer(request.src);
      const handle = createHandle(request.src);
      const sourceNode = context.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.loop = request.loop ?? false;

      const gainNode = context.createGain();
      gainNode.gain.value = request.volume ?? 1;

      let pannerNode: PannerNode | undefined;

      if (request.spatial) {
        pannerNode = context.createPanner();
        pannerNode.distanceModel = request.spatial.distanceModel ?? "inverse";
        pannerNode.refDistance = request.spatial.refDistance ?? 1;
        pannerNode.maxDistance = request.spatial.maxDistance ?? 50;
        pannerNode.rolloffFactor = request.spatial.rolloffFactor ?? 1;

        if (request.spatial.position) {
          pannerNode.positionX.value = request.spatial.position.x;
          pannerNode.positionY.value = request.spatial.position.y;
          pannerNode.positionZ.value = request.spatial.position.z;
        }

        sourceNode.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(masterGain);
      } else {
        sourceNode.connect(gainNode);
        gainNode.connect(masterGain);
      }

      const active: ActiveSource = { gainNode, handle, pannerNode, sourceNode };
      activeSources.set(handle.id, active);

      sourceNode.onended = () => {
        if (activeSources.has(handle.id)) {
          activeSources.delete(handle.id);
          sourceNode.disconnect();
          gainNode.disconnect();
          pannerNode?.disconnect();
        }
      };

      sourceNode.start();
      return handle;
    },

    setListenerOrientation(forward: Vec3, up: Vec3) {
      const listener = context.listener;

      if (listener.forwardX) {
        listener.forwardX.value = forward.x;
        listener.forwardY.value = forward.y;
        listener.forwardZ.value = forward.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
      }
    },

    setListenerPosition(position: Vec3) {
      const listener = context.listener;

      if (listener.positionX) {
        listener.positionX.value = position.x;
        listener.positionY.value = position.y;
        listener.positionZ.value = position.z;
      }
    },

    setMasterVolume(volume: number) {
      masterGain.gain.value = Math.max(0, Math.min(1, volume));
    },

    setSourcePosition(handle: AudioSourceHandle, position: Vec3) {
      const source = activeSources.get(handle.id);

      if (source?.pannerNode) {
        source.pannerNode.positionX.value = position.x;
        source.pannerNode.positionY.value = position.y;
        source.pannerNode.positionZ.value = position.z;
      }
    },

    stop(handle: AudioSourceHandle) {
      const source = activeSources.get(handle.id);

      if (source) {
        stopSource(source);
        activeSources.delete(handle.id);
      }
    },

    stopAll() {
      activeSources.forEach(stopSource);
      activeSources.clear();
    }
  };
}
