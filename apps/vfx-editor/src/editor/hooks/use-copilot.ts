import { useCallback, useRef, useState } from "react";
import type { VfxEditorStore } from "@ggez/vfx-editor-core";
import type { CopilotSession } from "@/lib/copilot/types";
import { createCodexProvider } from "@/lib/copilot/codex-provider";
import { isCopilotConfigured, loadCopilotSettings } from "@/lib/copilot/settings";
import { buildSystemPrompt } from "@/lib/copilot/system-prompt";
import { COPILOT_TOOL_DECLARATIONS } from "@/lib/copilot/tool-declarations";
import { executeTool } from "@/lib/copilot/tool-executor";

const EMPTY_SESSION: CopilotSession = {
  messages: [],
  status: "idle",
  iterationCount: 0
};

export function useCopilot(store: VfxEditorStore) {
  const [session, setSession] = useState<CopilotSession>(EMPTY_SESSION);
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);

  const sendMessage = useCallback(async (prompt: string) => {
    const settings = loadCopilotSettings();
    if (!isCopilotConfigured()) {
      setSession((current) => ({
        ...current,
        status: "error",
        error: 'Codex not configured. Run "codex login" in your terminal.'
      }));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    await createCodexProvider().runSession({
      messages: session.messages,
      userPrompt: prompt,
      tools: COPILOT_TOOL_DECLARATIONS,
      systemPrompt: buildSystemPrompt(store),
      providerConfig: { model: settings.codex.model },
      threadId: threadIdRef.current,
      onThreadId: (threadId) => {
        threadIdRef.current = threadId;
      },
      executeTool: (toolCall) => executeTool(store, toolCall),
      onUpdate: (nextSession) => {
        setSession({ ...nextSession, messages: [...nextSession.messages] });
      },
      signal: controller.signal
    });

    abortRef.current = null;
  }, [session.messages, store]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    threadIdRef.current = undefined;
    setSession(EMPTY_SESSION);
  }, []);

  return {
    session,
    sendMessage,
    abort,
    clearHistory,
    isConfigured: true,
    refreshConfigured: () => undefined
  };
}