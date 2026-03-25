import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorCore } from "@ggez/editor-core";
import type { CopilotSession } from "@/lib/copilot/types";
import { runAgenticLoop } from "@/lib/copilot/agentic-loop";
import { createCopilotProvider } from "@/lib/copilot/provider";
import { buildSystemPrompt } from "@/lib/copilot/system-prompt";
import { loadCopilotSettings, isCopilotConfigured } from "@/lib/copilot/settings";
import { COPILOT_TOOL_DECLARATIONS } from "@/lib/copilot/tool-declarations";
import { executeTool, type CopilotToolExecutionContext } from "@/lib/copilot/tool-executor";

const EMPTY_SESSION: CopilotSession = {
  messages: [],
  status: "idle",
  iterationCount: 0
};

export function useCopilot(editor: EditorCore, toolContext: CopilotToolExecutionContext = {}) {
  const [session, setSession] = useState<CopilotSession>(EMPTY_SESSION);
  const [configured, setConfigured] = useState(() => isCopilotConfigured());
  const abortRef = useRef<AbortController | null>(null);
  const codexThreadIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const check = () => setConfigured(isCopilotConfigured());
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  const sendMessage = useCallback(
    async (prompt: string) => {
      const settings = loadCopilotSettings();

      if (!isCopilotConfigured(settings)) {
        setSession((prev) => ({
          ...prev,
          status: "error",
          error: settings.provider === "codex"
            ? 'Codex not configured. Run "codex login" in your terminal.'
            : settings.provider === "openai" 
            ? "OpenAI API not configured. Open Vibe settings to add details."
            : "No API key configured. Open Vibe settings to add one."
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const copilotProvider = createCopilotProvider(settings.provider);
      const systemPrompt = buildSystemPrompt(editor);

      const providerConfig = {
        apiKey: settings.provider === "gemini" ? settings.gemini.apiKey : settings.provider === "openai" ? settings.openai.apiKey : "",
        model: settings.provider === "gemini" ? settings.gemini.model : settings.provider === "openai" ? settings.openai.model : settings.codex.model,
        baseUrl: settings.provider === "openai" ? settings.openai.baseUrl : undefined,
        temperature: settings.temperature
      };

      if (copilotProvider.kind === "session-based") {
        // Codex path: provider manages its own tool-calling loop
        await copilotProvider.provider.runSession({
          messages: session.messages,
          userPrompt: prompt,
          tools: COPILOT_TOOL_DECLARATIONS,
          systemPrompt,
          providerConfig,
          threadId: codexThreadIdRef.current,
          onThreadId: (threadId) => {
            codexThreadIdRef.current = threadId;
          },
          executeTool: (toolCall) => executeTool(editor, toolCall, toolContext),
          onUpdate: (updated) => {
            setSession({ ...updated, messages: [...updated.messages] });
          },
          signal: controller.signal
        });
      } else {
        // Gemini path: agentic loop
        await runAgenticLoop(
          prompt,
          session.messages,
          {
            maxIterations: 25,
            provider: copilotProvider.provider,
            providerConfig,
            systemPrompt,
            tools: COPILOT_TOOL_DECLARATIONS,
            executeTool: (toolCall) => executeTool(editor, toolCall, toolContext),
            onUpdate: (updated) => {
              setSession({ ...updated, messages: [...updated.messages] });
            }
          },
          controller.signal
        );
      }

      abortRef.current = null;
    },
    [editor, session.messages, toolContext]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    codexThreadIdRef.current = undefined;
    setSession(EMPTY_SESSION);
  }, []);

  return {
    session,
    sendMessage,
    abort,
    clearHistory,
    isConfigured: configured,
    refreshConfigured: () => setConfigured(isCopilotConfigured())
  };
}
