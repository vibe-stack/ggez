// ── Provider and model IDs ────────────────────────────────────

export type CopilotProviderId = "gemini" | "codex" | "openai";
export type GeminiModelId = "gemini-3-flash-preview" | "gemini-3.1-pro-preview";
export type CodexModelId = "gpt-5.4" | "gpt-5.3-codex" | "gpt-5.1-codex-max" | "gpt-4.1" | "gpt-4.1-mini" | "codex-mini-latest" | "o3" | "o4-mini";
export type CopilotModelId = GeminiModelId | CodexModelId | string;

// ── Settings ──────────────────────────────────────────────────

export type CopilotSettings = {
  provider: CopilotProviderId;
  gemini: { apiKey: string; model: GeminiModelId };
  codex: { model: CodexModelId };
  openai: { apiKey: string; baseUrl: string; model: string };
  temperature: number;
};

// ── Messages ──────────────────────────────────────────────────

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: CopilotToolCall[];
  toolResults?: CopilotToolResult[];
  /** Raw provider response parts — preserved verbatim for thought signatures */
  rawParts?: unknown[];
  timestamp: number;
};

export type CopilotToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type CopilotToolResult = {
  callId: string;
  name: string;
  result: string;
};

export type CopilotToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type CopilotProviderConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  baseUrl?: string;
};

export type CopilotResponse = {
  text: string;
  toolCalls: CopilotToolCall[];
  /** Raw parts from the model response, preserved for thought signatures */
  rawParts: unknown[];
};

export type CopilotSessionStatus =
  | "idle"
  | "thinking"
  | "executing"
  | "error"
  | "aborted";

export type CopilotSession = {
  messages: CopilotMessage[];
  status: CopilotSessionStatus;
  error?: string;
  iterationCount: number;
};

// ── Provider interfaces ───────────────────────────────────────

/** Request-response provider (Gemini) — used with the agentic loop */
export type CopilotProvider = {
  generateContent(
    messages: CopilotMessage[],
    tools: CopilotToolDeclaration[],
    systemPrompt: string,
    config: CopilotProviderConfig,
    signal?: AbortSignal
  ): Promise<CopilotResponse>;
};

/** Session-based provider (Codex) — manages its own tool-calling loop */
export type SessionBasedCopilotProvider = {
  runSession(config: {
    messages: CopilotMessage[];
    userPrompt: string;
    tools: CopilotToolDeclaration[];
    systemPrompt: string;
    providerConfig: CopilotProviderConfig;
    threadId?: string;
    onThreadId?: (threadId: string | undefined) => void;
    executeTool: (call: CopilotToolCall) => CopilotToolResult;
    onUpdate: (session: CopilotSession) => void;
    signal?: AbortSignal;
  }): Promise<CopilotSession>;
};

/** Discriminated union for provider factory */
export type AnyCopilotProvider =
  | { kind: "request-response"; provider: CopilotProvider }
  | { kind: "session-based"; provider: SessionBasedCopilotProvider };
