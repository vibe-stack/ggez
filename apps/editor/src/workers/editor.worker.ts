import { executeWorkerRequest, type WorkerRequest, type WorkerResponse } from "@ggez/workers";

const workerScope = self as unknown as {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const response: WorkerResponse = await executeWorkerRequest(event.data);
  if (
    response.ok &&
    typeof response.payload === "object" &&
    response.payload !== null &&
    "bytes" in response.payload &&
    response.payload.bytes instanceof Uint8Array
  ) {
    workerScope.postMessage(response, [response.payload.bytes.buffer]);
    return;
  }

  workerScope.postMessage(response);
};

export {};
