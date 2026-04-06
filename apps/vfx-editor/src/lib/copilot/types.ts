export type CodexModelId =
  | "gpt-5.4"
  | "gpt-5.3-codex"
  | "gpt-5.1-codex-max"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "codex-mini-latest"
  | "o3"
  | "o4-mini";

export type CopilotSettings = {
  codex: { model: CodexModelId };
};

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: CopilotToolCall[];
  toolResults?: CopilotToolResult[];
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
  model: string;
};

export type CopilotSessionStatus = "idle" | "thinking" | "executing" | "error" | "aborted";

export type CopilotSession = {
  messages: CopilotMessage[];
  status: CopilotSessionStatus;
  error?: string;
  iterationCount: number;
};

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