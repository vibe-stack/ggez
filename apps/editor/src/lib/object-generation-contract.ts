export type ObjectGenerationRequest = {
  prompt: string;
};

export type GeneratedModelDraft = {
  modelDataUrl: string;
  modelMimeType: string;
  model: "fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d";
  name: string;
  prompt: string;
  textureDataUrl?: string;
  textureMimeType?: string;
};

export type ObjectGenerationResponse = {
  asset: GeneratedModelDraft;
};

export function isObjectGenerationRequest(
  value: unknown
): value is ObjectGenerationRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "prompt" in value &&
    typeof value.prompt === "string"
  );
}

export function createGeneratedModelName(prompt: string) {
  const label = prompt.trim().replace(/\s+/g, " ").slice(0, 42) || "Generated Object";
  return label;
}
