import type {
  CopilotMessage,
  CopilotSession,
  CopilotToolCall,
  CopilotToolDeclaration,
  CopilotToolResult,
  SessionBasedCopilotProvider
} from "./types";
import type { CodexWsServerMessage } from "./codex-ws-protocol";

const TAG = "[AI-VIBE:CODEX]";

function uid(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCodexProvider(): SessionBasedCopilotProvider {
  return {
    async runSession(config): Promise<CopilotSession> {
      const messages: CopilotMessage[] = [
        ...config.messages,
        { id: uid(), role: "user", content: config.userPrompt, timestamp: Date.now() }
      ];

      const session: CopilotSession = {
        messages,
        status: "thinking",
        iterationCount: 0
      };

      config.onUpdate({ ...session, messages: [...messages] });

      const wsTools = config.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters
      }));

      console.group(`${TAG} Session start`);
      console.log(`${TAG} Model:`, config.providerConfig.model);
      console.log(`${TAG} User prompt:`, config.userPrompt);
      console.log(`${TAG} Tools:`, wsTools.length);
      console.groupEnd();

      return new Promise<CopilotSession>((resolve) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${location.host}/ws/codex`);

        let agentText = "";
        const toolCalls: CopilotToolCall[] = [];
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
          console.log(`${TAG} WebSocket connected, sending start message`);
          ws.send(JSON.stringify({
            type: "start",
            model: config.providerConfig.model,
            systemPrompt: config.systemPrompt,
            threadId: config.threadId,
            tools: wsTools,
            userMessage: config.userPrompt
          }));
        };

        ws.onmessage = (event) => {
          if (aborted) return;

          const msg = JSON.parse(event.data) as CodexWsServerMessage;

          switch (msg.type) {
            case "thread": {
              config.onThreadId?.(msg.threadId);
              break;
            }

            case "status": {
              if (msg.status === "thinking") session.status = "thinking";
              else if (msg.status === "executing") session.status = "executing";
              config.onUpdate({ ...session, messages: [...messages] });
              break;
            }

            case "delta": {
              agentText += msg.text;
              break;
            }

            case "tool_call": {
              console.log(`  ${TAG} → ${msg.name}`, JSON.stringify(msg.args, null, 2));
              session.status = "executing";
              session.iterationCount++;

              const toolCall: CopilotToolCall = {
                id: msg.id,
                name: msg.name,
                args: msg.args
              };
              toolCalls.push(toolCall);

              // Push assistant message with this tool call for UI
              messages.push({
                id: uid(),
                role: "assistant",
                content: "",
                toolCalls: [toolCall],
                timestamp: Date.now()
              });
              config.onUpdate({ ...session, messages: [...messages] });

              // Execute the tool browser-side
              const t0 = performance.now();
              const result = config.executeTool(toolCall);
              const elapsed = Math.round(performance.now() - t0);

              const parsed = JSON.parse(result.result);
              if (parsed.success === false) {
                console.warn(`  ${TAG} ✗ ${msg.name} FAILED (${elapsed}ms):`, parsed.error);
              } else {
                console.log(`  ${TAG} ✓ ${msg.name} (${elapsed}ms):`, result.result);
              }

              // Push tool result message
              messages.push({
                id: uid(),
                role: "tool",
                content: "",
                toolResults: [result],
                timestamp: Date.now()
              });

              // Send result back to server
              ws.send(JSON.stringify({
                type: "tool_result",
                id: msg.id,
                result: result.result,
                success: parsed.success !== false
              }));

              session.status = "thinking";
              config.onUpdate({ ...session, messages: [...messages] });
              break;
            }

            case "tool_status": {
              // Tool completed/failed on codex side — already handled in tool_call flow
              break;
            }

            case "turn_complete": {
              console.log(`${TAG} Turn complete. Agent text:`, msg.text || agentText);
              const finalText = msg.text || agentText;

              if (finalText) {
                messages.push({
                  id: uid(),
                  role: "assistant",
                  content: finalText,
                  timestamp: Date.now()
                });
              }

              session.status = "idle";
              session.messages = messages;
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
              console.error(`${TAG} Error:`, msg.message);
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
          if (aborted) return;
          session.status = "error";
          session.error = "WebSocket connection failed. Is the editor server running?";
          config.onUpdate({ ...session, messages: [...messages] });
          config.signal?.removeEventListener("abort", handleAbort);
          resolve(session);
        };

        ws.onclose = () => {
          if (aborted || session.status === "idle" || session.status === "error") return;
          session.status = "error";
          session.error = "Connection closed unexpectedly";
          config.onUpdate({ ...session, messages: [...messages] });
          config.signal?.removeEventListener("abort", handleAbort);
          resolve(session);
        };
      });
    }
  };
}
