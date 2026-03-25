import type {
  CopilotMessage,
  CopilotProvider,
  CopilotProviderConfig,
  CopilotResponse,
  CopilotToolCall,
  CopilotToolDeclaration
} from "./types";

function convertMessages(messages: CopilotMessage[]) {
  const openAiMessages: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      openAiMessages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant" };
      
      if (message.content) {
        msg.content = message.content;
      }
      
      if (message.toolCalls && message.toolCalls.length > 0) {
        msg.tool_calls = message.toolCalls.map(tc => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args)
          }
        }));
      }
      
      openAiMessages.push(msg);
    } else if (message.role === "tool" && message.toolResults && message.toolResults.length > 0) {
      for (const tr of message.toolResults) {
        openAiMessages.push({
          role: "tool",
          tool_call_id: tr.callId,
          content: tr.result
        });
      }
    }
  }

  return openAiMessages;
}

function convertToolDeclarations(tools: CopilotToolDeclaration[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

export function createOpenAiProvider(): CopilotProvider {
  return {
    async generateContent(
      messages: CopilotMessage[],
      tools: CopilotToolDeclaration[],
      systemPrompt: string,
      config: CopilotProviderConfig,
      signal?: AbortSignal
    ): Promise<CopilotResponse> {
      const baseUrl = config.baseUrl || "https://api.openai.com/v1";
      const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
      
      const openAiMessages = [
        { role: "system", content: systemPrompt },
        ...convertMessages(messages)
      ];

      const requestBody: Record<string, unknown> = {
        model: config.model,
        messages: openAiMessages,
        temperature: config.temperature
      };

      if (tools.length > 0) {
        requestBody.tools = convertToolDeclarations(tools);
        requestBody.tool_choice = "auto";
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      
      if (!choice) {
        throw new Error("No completion choices returned by OpenAI API.");
      }

      const message = choice.message;
      const toolCalls: CopilotToolCall[] = [];

      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          if (tc.type === "function") {
            try {
              toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments || "{}")
              });
            } catch (e) {
              console.error("Failed to parse tool call arguments", e);
            }
          }
        }
      }

      return {
        text: message.content || "",
        toolCalls,
        rawParts: [choice]
      };
    }
  };
}
