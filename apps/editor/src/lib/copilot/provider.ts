import type { AnyCopilotProvider, CopilotProviderId } from "./types";
import { createGeminiProvider } from "./gemini-provider";
import { createCodexProvider } from "./codex-provider";
import { createOpenAiProvider } from "./openai-provider";

export function createCopilotProvider(providerId: CopilotProviderId): AnyCopilotProvider {
  switch (providerId) {
    case "codex":
      return { kind: "session-based", provider: createCodexProvider() };
    case "openai":
      return { kind: "request-response", provider: createOpenAiProvider() };
    default:
      return { kind: "request-response", provider: createGeminiProvider() };
  }
}
