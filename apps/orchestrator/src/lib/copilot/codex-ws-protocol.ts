export type CodexWsClientMessage =
  | {
      model: string;
      projectId: string;
      systemPrompt: string;
      threadId?: string;
      tools: Array<{ description: string; inputSchema: Record<string, unknown>; name: string }>;
      type: "start";
      userMessage: string;
    }
  | {
      id: string;
      result: string;
      success: boolean;
      type: "tool_result";
    }
  | {
      type: "abort";
    };

export type CodexWsServerMessage =
  | { threadId: string; type: "thread" }
  | { status: "connecting" | "thinking" | "executing"; type: "status" }
  | { text: string; type: "delta" }
  | { args: Record<string, unknown>; id: string; name: string; type: "tool_call" }
  | { id: string; name: string; status: "completed" | "failed"; type: "tool_status" }
  | { text: string; type: "turn_complete" }
  | { message: string; type: "auth_required" }
  | { fatal: boolean; message: string; type: "error" };