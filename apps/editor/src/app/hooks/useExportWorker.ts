import { useEffect, useRef, useState } from "react";
import type { SceneDocumentSnapshot, WorldPersistenceBundle } from "@ggez/editor-core";
import type { RuntimeWorldBundle } from "@ggez/runtime-build";
import type { WebHammerEngineBundle } from "@ggez/three-runtime";
import type { WorkerJob, WorkerRequest, WorkerResponse } from "@ggez/workers";

export type ExportWorkerRequest = WorkerRequest extends infer Request
  ? Request extends { id: string }
    ? Omit<Request, "id">
    : never
  : never;

export function useExportWorker() {
  const [exportJobs, setExportJobs] = useState<WorkerJob[]>([]);
  const requestCounterRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequestsRef = useRef(
    new Map<
      string,
      {
        reject: (reason?: unknown) => void;
        resolve: (payload: string | SceneDocumentSnapshot | WorldPersistenceBundle | WebHammerEngineBundle | RuntimeWorldBundle) => void;
      }
    >()
  );

  useEffect(() => {
    const worker = new Worker(new URL("../../workers/editor.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = pendingRequestsRef.current.get(response.id);

      if (!pending) {
        return;
      }

      pendingRequestsRef.current.delete(response.id);
      setExportJobs((jobs) =>
        jobs.map((job) => (job.id === response.id ? { ...job, status: response.ok ? "completed" : "completed" } : job))
      );

      window.setTimeout(() => {
        setExportJobs((jobs) => jobs.filter((job) => job.id !== response.id));
      }, 1200);

      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        pending.reject(new Error(response.error));
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const runWorkerRequest = (
    request: ExportWorkerRequest,
    label: string
  ): Promise<string | SceneDocumentSnapshot | WorldPersistenceBundle | WebHammerEngineBundle | RuntimeWorldBundle> => {
    const id = `export:${requestCounterRef.current++}`;
    const workerTask =
      request.kind === "whmap-save"
        ? { task: "whmap-save" as const, worker: "exportWorker" as const }
        : request.kind === "whmap-load"
          ? { task: "whmap-load" as const, worker: "exportWorker" as const }
          : request.kind === "ai-model-generate"
            ? { task: "ai-model-generate" as const, worker: "exportWorker" as const }
          : request.kind === "gltf-export"
            ? { task: "gltf" as const, worker: "exportWorker" as const }
            : { task: "engine-format" as const, worker: "exportWorker" as const };

    setExportJobs((jobs) => [
      ...jobs,
      {
        id,
        label,
        status: "running",
        task: workerTask
      }
    ]);

    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Export worker is unavailable."));
        return;
      }

      pendingRequestsRef.current.set(id, { reject, resolve });
      workerRef.current.postMessage({
        ...request,
        id
      } satisfies WorkerRequest);
    });
  };

  const downloadTextFile = (filename: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadBinaryFile = (filename: string, content: Uint8Array, type: string) => {
    const bytes = new Uint8Array(content.byteLength);
    bytes.set(content);
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return {
    downloadBinaryFile,
    downloadTextFile,
    exportJobs,
    runWorkerRequest
  };
}
