import type { RuntimeWorldChunk, RuntimeWorldIndex } from "@web-hammer/runtime-format";
import type { Vec3 } from "@web-hammer/shared";

export type RuntimeChunkState = "error" | "idle" | "loaded" | "loading" | "unloading";

export type RuntimeChunkRecord<TChunk = unknown> = {
  chunk: RuntimeWorldChunk;
  data?: TChunk;
  error?: string;
  state: RuntimeChunkState;
};

export type RuntimeWorldManagerOptions<TChunk> = {
  loadChunk: (chunk: RuntimeWorldChunk) => Promise<TChunk>;
  maxConcurrentLoads?: number;
  unloadChunk?: (chunk: RuntimeWorldChunk, data: TChunk) => Promise<void> | void;
  worldIndex: RuntimeWorldIndex;
};

export type RuntimeWorldManager<TChunk> = {
  dispose: () => Promise<void>;
  getChunkRecord: (chunkId: string) => RuntimeChunkRecord<TChunk> | undefined;
  getWorldIndex: () => RuntimeWorldIndex;
  listChunkRecords: () => Array<RuntimeChunkRecord<TChunk>>;
  loadChunk: (chunkId: string) => Promise<TChunk | undefined>;
  subscribe: (listener: (records: Array<RuntimeChunkRecord<TChunk>>) => void) => () => void;
  unloadChunk: (chunkId: string) => Promise<void>;
  updateStreamingFocus: (focus: Vec3) => Promise<void>;
};

export function createRuntimeWorldManager<TChunk>(
  options: RuntimeWorldManagerOptions<TChunk>
): RuntimeWorldManager<TChunk> {
  const records = new Map<string, RuntimeChunkRecord<TChunk>>(
    options.worldIndex.chunks.map((chunk) => [
      chunk.id,
      {
        chunk,
        state: "idle" as const
      }
    ])
  );
  const listeners = new Set<(records: Array<RuntimeChunkRecord<TChunk>>) => void>();
  const loadingQueue: string[] = [];
  let activeLoads = 0;
  let disposed = false;

  const emit = () => {
    const snapshot = Array.from(records.values());
    listeners.forEach((listener) => {
      listener(snapshot);
    });
  };

  const loadChunk = async (chunkId: string): Promise<TChunk | undefined> => {
    const record = records.get(chunkId);

    if (!record || disposed) {
      return undefined;
    }

    if (record.state === "loaded") {
      return record.data;
    }

    if (record.state === "loading") {
      return waitForLoadedChunk(chunkId, records);
    }

    loadingQueue.push(chunkId);
    await pumpLoadQueue();
    return waitForLoadedChunk(chunkId, records);
  };

  const unloadChunk = async (chunkId: string) => {
    const record = records.get(chunkId);

    if (!record || record.state === "idle" || record.state === "unloading") {
      return;
    }

    if (record.state === "loading") {
      loadingQueue.splice(loadingQueue.indexOf(chunkId), 1);
      record.state = "idle";
      emit();
      return;
    }

    if (record.state === "loaded" && record.data !== undefined) {
      record.state = "unloading";
      emit();

      try {
        await options.unloadChunk?.(record.chunk, record.data);
        record.data = undefined;
        record.error = undefined;
        record.state = "idle";
      } catch (error) {
        record.error = error instanceof Error ? error.message : "Failed to unload chunk.";
        record.state = "error";
      }

      emit();
    }
  };

  const pumpLoadQueue = async () => {
    while (!disposed && activeLoads < (options.maxConcurrentLoads ?? 2) && loadingQueue.length > 0) {
      const chunkId = loadingQueue.shift()!;
      const record = records.get(chunkId);

      if (!record || record.state === "loaded" || record.state === "loading") {
        continue;
      }

      record.state = "loading";
      record.error = undefined;
      activeLoads += 1;
      emit();

      void options
        .loadChunk(record.chunk)
        .then((data) => {
          if (disposed) {
            return;
          }

          record.data = data;
          record.state = "loaded";
          record.error = undefined;
        })
        .catch((error) => {
          if (disposed) {
            return;
          }

          record.error = error instanceof Error ? error.message : "Failed to load chunk.";
          record.state = "error";
        })
        .finally(() => {
          activeLoads -= 1;
          emit();
          void pumpLoadQueue();
        });
    }
  };

  return {
    async dispose() {
      disposed = true;
      const loaded = Array.from(records.values()).filter(
        (record): record is RuntimeChunkRecord<TChunk> & { data: TChunk } => record.state === "loaded" && record.data !== undefined
      );

      for (const record of loaded) {
        await options.unloadChunk?.(record.chunk, record.data);
      }

      records.forEach((record) => {
        record.data = undefined;
        record.state = "idle";
        record.error = undefined;
      });
      emit();
    },
    getChunkRecord(chunkId) {
      return records.get(chunkId);
    },
    getWorldIndex() {
      return options.worldIndex;
    },
    listChunkRecords() {
      return Array.from(records.values());
    },
    loadChunk,
    subscribe(listener) {
      listeners.add(listener);
      listener(Array.from(records.values()));
      return () => {
        listeners.delete(listener);
      };
    },
    unloadChunk,
    async updateStreamingFocus(focus) {
      const nextLoads = options.worldIndex.chunks.filter((chunk) => {
        const distance = distanceToChunkBounds(chunk.bounds, focus);
        return distance <= (chunk.loadDistance ?? Number.POSITIVE_INFINITY);
      });
      const nextUnloads = options.worldIndex.chunks.filter((chunk) => {
        const distance = distanceToChunkBounds(chunk.bounds, focus);
        return distance > (chunk.unloadDistance ?? chunk.loadDistance ?? Number.POSITIVE_INFINITY);
      });

      await Promise.all(nextLoads.map((chunk) => loadChunk(chunk.id)));
      await Promise.all(nextUnloads.map((chunk) => unloadChunk(chunk.id)));
    }
  };
}

export async function loadChunk<TChunk>(manager: RuntimeWorldManager<TChunk>, chunkId: string) {
  return manager.loadChunk(chunkId);
}

export async function unloadChunk<TChunk>(manager: RuntimeWorldManager<TChunk>, chunkId: string) {
  return manager.unloadChunk(chunkId);
}

export async function updateStreamingFocus<TChunk>(manager: RuntimeWorldManager<TChunk>, focus: Vec3) {
  return manager.updateStreamingFocus(focus);
}

export function distanceToChunkBounds(bounds: RuntimeWorldChunk["bounds"], focus: Vec3) {
  const dx = axisDistance(focus.x, bounds[0], bounds[3]);
  const dy = axisDistance(focus.y, bounds[1], bounds[4]);
  const dz = axisDistance(focus.z, bounds[2], bounds[5]);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function axisDistance(value: number, min: number, max: number) {
  if (value < min) {
    return min - value;
  }

  if (value > max) {
    return value - max;
  }

  return 0;
}

async function waitForLoadedChunk<TChunk>(
  chunkId: string,
  records: Map<string, RuntimeChunkRecord<TChunk>>
): Promise<TChunk | undefined> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const record = records.get(chunkId);

    if (!record) {
      return undefined;
    }

    if (record.state === "loaded") {
      return record.data;
    }

    if (record.state === "error" || record.state === "idle") {
      return undefined;
    }

    await Promise.resolve();
  }

  return records.get(chunkId)?.data;
}
