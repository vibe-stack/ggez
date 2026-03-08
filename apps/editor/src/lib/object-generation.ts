import {
  type GeneratedModelDraft,
  type ObjectGenerationRequest,
  type ObjectGenerationResponse
} from "@/lib/object-generation-contract";

export type ObjectGenerator = {
  generateModel: (
    request: ObjectGenerationRequest
  ) => Promise<GeneratedModelDraft>;
};

export function createObjectGenerator(): ObjectGenerator {
  return new ObjectGenerationApiClient();
}

class ObjectGenerationApiClient implements ObjectGenerator {
  async generateModel(
    request: ObjectGenerationRequest
  ): Promise<GeneratedModelDraft> {
    const response = await fetch("/api/ai/models", {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const payload = (await response.json()) as
      | ObjectGenerationResponse
      | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in payload ? payload.error ?? "Failed to generate model." : "Failed to generate model."
      );
    }

    if (!("asset" in payload)) {
      throw new Error("Failed to generate model.");
    }

    return payload.asset;
  }
}

export type { ObjectGenerationRequest } from "@/lib/object-generation-contract";
