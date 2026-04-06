export type CodexWsClientMessage =
  | {
      type: "start";
      model: string;
      systemPrompt: string;
      tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
      threadId?: string;
      userMessage: string;
    }
  | {
      type: "tool_result";
      id: string;
      result: string;
      success: boolean;
    }
  | {
      type: "abort";
    };

export type CodexWsServerMessage =
  | { type: "thread"; threadId: string }
  | { type: "status"; status: "connecting" | "thinking" | "executing" }
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_status"; id: string; name: string; status: "completed" | "failed" }
  | { type: "turn_complete"; text: string }
  | { type: "auth_required"; message: string }
  | { type: "error"; message: string; fatal: boolean };