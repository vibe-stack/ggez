import type { CodexWsServerMessage } from "./codex-ws-protocol";
import type {
  CopilotMessage,
  CopilotSession,
  CopilotToolCall,
  SessionBasedCopilotProvider
} from "./types";

function uid() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCodexProvider(): SessionBasedCopilotProvider {
  return {
    async runSession(config): Promise<CopilotSession> {
      const messages: CopilotMessage[] = [
        ...config.messages,
        {
          content: config.userPrompt,
          id: uid(),
          role: "user",
          timestamp: Date.now()
        }
      ];

      const session: CopilotSession = {
        iterationCount: 0,
        messages,
        status: "thinking"
      };

      config.onUpdate({ ...session, messages: [...messages] });

      return new Promise<CopilotSession>((resolve) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${location.host}/ws/orchestrator-codex`);
        let agentText = "";
        let aborted = false;

        const handleAbort = () => {
          aborted = true;
          ws.send(JSON.stringify({ type: "abort" }));
          ws.close();
          session.status = "aborted";
          config.onUpdate({ ...session, messages: [...messages] });
          resolve(session);
        };

        config.signal?.addEventListener("abort", handleAbort, { once: true });

        ws.onopen = () => {
          ws.send(JSON.stringify({
            model: config.providerConfig.model,
            projectId: config.projectId,
            systemPrompt: config.systemPrompt,
            threadId: config.threadId,
            tools: config.tools.map((tool) => ({
              description: tool.description,
              inputSchema: tool.parameters,
              name: tool.name
            })),
            type: "start",
            userMessage: config.userPrompt
          }));
        };

        ws.onmessage = async (event) => {
          if (aborted) {
            return;
          }

          const msg = JSON.parse(event.data) as CodexWsServerMessage;

          switch (msg.type) {
            case "thread": {
              config.onThreadId?.(msg.threadId);
              break;
            }

            case "status": {
              session.status = msg.status === "executing" ? "executing" : "thinking";
              config.onUpdate({ ...session, messages: [...messages] });
              break;
            }

            case "delta": {
              agentText += msg.text;
              break;
            }

            case "tool_call": {
              session.status = "executing";
              session.iterationCount += 1;

              const toolCall: CopilotToolCall = {
                args: msg.args,
                id: msg.id,
                name: msg.name
              };

              messages.push({
                content: "",
                id: uid(),
                role: "assistant",
                timestamp: Date.now(),
                toolCalls: [toolCall]
              });
              config.onUpdate({ ...session, messages: [...messages] });

              try {
                const result = await config.executeTool(toolCall);
                const parsed = tryParseJson(result.result);

                messages.push({
                  content: "",
                  id: uid(),
                  role: "tool",
                  timestamp: Date.now(),
                  toolResults: [result]
                });

                ws.send(JSON.stringify({
                  id: msg.id,
                  result: result.result,
                  success: typeof parsed === "object" && parsed !== null && "success" in parsed
                    ? (parsed as { success?: boolean }).success !== false
                    : true,
                  type: "tool_result"
                }));

                session.status = "thinking";
                config.onUpdate({ ...session, messages: [...messages] });
              } catch (error) {
                const failure = JSON.stringify({
                  message: error instanceof Error ? error.message : "Tool execution failed.",
                  success: false
                });

                ws.send(JSON.stringify({
                  id: msg.id,
                  result: failure,
                  success: false,
                  type: "tool_result"
                }));
                session.status = "thinking";
                config.onUpdate({ ...session, messages: [...messages] });
              }

              break;
            }

            case "tool_status": {
              break;
            }

            case "turn_complete": {
              const finalText = msg.text || agentText;

              if (finalText) {
                messages.push({
                  content: finalText,
                  id: uid(),
                  role: "assistant",
                  timestamp: Date.now()
                });
              }

              session.status = "idle";
              config.onUpdate({ ...session, messages: [...messages] });
              config.signal?.removeEventListener("abort", handleAbort);
              ws.close();
              resolve(session);
              break;
            }

            case "auth_required": {
              session.status = "error";
              session.error = msg.message || 'Not authenticated. Run "codex login" in your terminal.';
              config.onUpdate({ ...session, messages: [...messages] });
              config.signal?.removeEventListener("abort", handleAbort);
              ws.close();
              resolve(session);
              break;
            }

            case "error": {
              session.status = "error";
              session.error = msg.message;
              config.onUpdate({ ...session, messages: [...messages] });

              if (msg.fatal) {
                config.signal?.removeEventListener("abort", handleAbort);
                ws.close();
                resolve(session);
              }
              break;
            }
          }
        };

        ws.onerror = () => {
          if (aborted) {
            return;
          }

          session.status = "error";
          session.error = "WebSocket connection failed. Is the orchestrator dev server running?";
          config.onUpdate({ ...session, messages: [...messages] });
          config.signal?.removeEventListener("abort", handleAbort);
          resolve(session);
        };

        ws.onclose = () => {
          if (aborted || session.status === "idle" || session.status === "error") {
            return;
          }

          session.status = "error";
          session.error = "Connection closed unexpectedly.";
          config.onUpdate({ ...session, messages: [...messages] });
          config.signal?.removeEventListener("abort", handleAbort);
          resolve(session);
        };
      });
    }
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}