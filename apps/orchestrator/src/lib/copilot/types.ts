export type CopilotMessage = {
  content: string;
  id: string;
  role: "user" | "assistant" | "tool";
  timestamp: number;
  toolCalls?: CopilotToolCall[];
  toolResults?: CopilotToolResult[];
};

export type CopilotToolCall = {
  args: Record<string, unknown>;
  id: string;
  name: string;
};

export type CopilotToolDeclaration = {
  description: string;
  name: string;
  parameters: Record<string, unknown>;
};

export type CopilotToolResult = {
  callId: string;
  name: string;
  result: string;
};

export type CopilotProviderConfig = {
  model: string;
};

export type CopilotSessionStatus = "idle" | "thinking" | "executing" | "error" | "aborted";

export type CopilotSession = {
  error?: string;
  iterationCount: number;
  messages: CopilotMessage[];
  status: CopilotSessionStatus;
};

export type SessionBasedCopilotProvider = {
  runSession(config: {
    executeTool: (call: CopilotToolCall) => Promise<CopilotToolResult>;
    messages: CopilotMessage[];
    onThreadId?: (threadId: string | undefined) => void;
    onUpdate: (session: CopilotSession) => void;
    projectId: string;
    providerConfig: CopilotProviderConfig;
    signal?: AbortSignal;
    systemPrompt: string;
    threadId?: string;
    tools: CopilotToolDeclaration[];
    userPrompt: string;
  }): Promise<CopilotSession>;
};