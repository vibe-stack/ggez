import { executeWorkerRequest, type WorkerRequest, type WorkerResponse } from "@web-hammer/workers";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const response: WorkerResponse = await executeWorkerRequest(event.data);
  self.postMessage(response);
};

export {};
