import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "../api";
import { createCodexProvider } from "../lib/copilot/codex-provider";
import { buildGameSystemPrompt } from "../lib/copilot/system-prompt";
import { GAME_COPILOT_TOOL_DECLARATIONS } from "../lib/copilot/tool-declarations";
import type {
  CopilotSession,
  CopilotToolCall,
  CopilotToolResult
} from "../lib/copilot/types";
import type { ProjectSnapshot } from "../types";

const EMPTY_SESSION: CopilotSession = {
  iterationCount: 0,
  messages: [],
  status: "idle"
};

const SCREENSHOT_REQUEST = "web-hammer:orchestrator:get-screenshot";
const SCREENSHOT_RESPONSE = "web-hammer:orchestrator:screenshot";

type ScreenshotPayload = {
  dataUrl: string;
  height: number;
  mimeType: string;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
};

export function useGameCopilot(options: {
  gameIframeRef: React.RefObject<HTMLIFrameElement | null>;
  gameIframeUrl: string | null;
  project: ProjectSnapshot | null;
}) {
  const { gameIframeRef, gameIframeUrl, project } = options;
  const [session, setSession] = useState<CopilotSession>(EMPTY_SESSION);
  const [isConfigured, setIsConfigured] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);
  const projectIdRef = useRef<string | null>(project?.id ?? null);

  const refreshConfigured = useCallback(async () => {
    try {
      const status = await requestJson<{ available: boolean; error?: string; version?: string }>(
        "/api/orchestrator/codex/status"
      );
      setIsConfigured(status.available);
      setStatusMessage(status.available ? status.version ?? null : status.error ?? "Codex CLI unavailable.");
    } catch (error) {
      setIsConfigured(false);
      setStatusMessage(error instanceof Error ? error.message : "Codex status check failed.");
    }
  }, []);

  useEffect(() => {
    void refreshConfigured();
  }, [refreshConfigured]);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    threadIdRef.current = undefined;
    setSession(EMPTY_SESSION);
  }, []);

  useEffect(() => {
    const previousProjectId = projectIdRef.current;
    const nextProjectId = project?.id ?? null;

    if (previousProjectId !== nextProjectId) {
      projectIdRef.current = nextProjectId;
      clearHistory();
    }
  }, [clearHistory, project?.id]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(async (prompt: string) => {
    if (!project) {
      setSession((current) => ({
        ...current,
        error: "Open a running game first.",
        status: "error"
      }));
      return;
    }

    if (!isConfigured) {
      setSession((current) => ({
        ...current,
        error: statusMessage ?? 'Codex not configured. Install and log in with "codex login".',
        status: "error"
      }));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    await createCodexProvider().runSession({
      executeTool: (toolCall) => executeTool(toolCall, {
        gameIframeRef,
        gameIframeUrl,
        projectId: project.id
      }),
      messages: session.messages,
      onThreadId: (threadId) => {
        threadIdRef.current = threadId;
      },
      onUpdate: (nextSession) => {
        setSession({ ...nextSession, messages: [...nextSession.messages] });
      },
      projectId: project.id,
      providerConfig: { model: "gpt-5.4" },
      signal: controller.signal,
      systemPrompt: buildGameSystemPrompt(project.name),
      threadId: threadIdRef.current,
      tools: GAME_COPILOT_TOOL_DECLARATIONS,
      userPrompt: prompt
    });

    abortRef.current = null;
  }, [gameIframeRef, gameIframeUrl, isConfigured, project, session.messages, statusMessage]);

  return {
    abort,
    clearHistory,
    isConfigured,
    refreshConfigured,
    sendMessage,
    session,
    statusMessage
  };
}

async function executeTool(
  call: CopilotToolCall,
  context: {
    gameIframeRef: React.RefObject<HTMLIFrameElement | null>;
    gameIframeUrl: string | null;
    projectId: string;
  }
): Promise<CopilotToolResult> {
  switch (call.name) {
    case "get_game_screenshot": {
      const screenshot = await requestGameScreenshot(context.gameIframeRef, context.gameIframeUrl);
      const saved = await requestJson<{ absolutePath: string; relativePath: string }>(
        "/api/orchestrator/codex/screenshot",
        {
          body: JSON.stringify({
            dataUrl: screenshot.dataUrl,
            projectId: context.projectId
          }),
          method: "POST"
        }
      );

      return {
        callId: call.id,
        name: call.name,
        result: JSON.stringify({
          message: `Saved a fresh game screenshot to ${saved.relativePath} (${screenshot.width}x${screenshot.height}, downscaled from ${screenshot.sourceWidth}x${screenshot.sourceHeight}). Inspect that image file if you need visual detail.`,
          path: saved.relativePath,
          success: true
        })
      };
    }

    default:
      return {
        callId: call.id,
        name: call.name,
        result: JSON.stringify({
          message: `Unknown tool ${call.name}.`,
          success: false
        })
      };
  }
}

async function requestGameScreenshot(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  iframeUrl: string | null
): Promise<ScreenshotPayload> {
  const iframe = iframeRef.current;
  const targetWindow = iframe?.contentWindow ?? null;

  if (!iframe || !targetWindow || !iframeUrl) {
    throw new Error("The running game view is not available.");
  }

  const requestId = crypto.randomUUID();
  const targetOrigin = new URL(iframeUrl).origin;

  return new Promise<ScreenshotPayload>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Game screenshot request timed out."));
    }, 6_000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== targetWindow || event.origin !== targetOrigin) {
        return;
      }

      if (event.data?.type !== SCREENSHOT_RESPONSE || event.data.requestId !== requestId) {
        return;
      }

      cleanup();

      if (!event.data.success) {
        reject(new Error(typeof event.data.error === "string" ? event.data.error : "Failed to capture game screenshot."));
        return;
      }

      resolve(event.data.screenshot as ScreenshotPayload);
    };

    window.addEventListener("message", handleMessage);
    targetWindow.postMessage(
      {
        maxHeight: 720,
        maxWidth: 1280,
        requestId,
        type: SCREENSHOT_REQUEST
      },
      targetOrigin
    );
  });
}