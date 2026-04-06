import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEventHandler } from "react";
import { Bot, Loader2, Send, Square, Trash2, Wrench, X } from "lucide-react";
import type { CopilotMessage, CopilotSession } from "@/lib/copilot/types";
import { CopilotSettingsDialog } from "./CopilotSettingsDialog";

type CopilotPanelProps = {
  onClose: () => void;
  onSendMessage: (prompt: string) => void;
  onAbort: () => void;
  onClearHistory: () => void;
  onSettingsChanged: () => void;
  session: CopilotSession;
  isConfigured: boolean;
  onHeaderPointerDown?: PointerEventHandler<HTMLDivElement>;
};

export function CopilotPanel(props: CopilotPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isActive = props.session.status === "thinking" || props.session.status === "executing";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [props.session.messages, props.session.status]);

  function handleSubmit() {
    const prompt = input.trim();
    if (!prompt || isActive) {
      return;
    }

    setInput("");
    props.onSendMessage(prompt);
  }

  const visibleMessages = props.session.messages.filter((message) => message.role !== "tool");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/7 bg-[#091012]/92 shadow-[0_24px_80px_rgba(0,0,0,0.42)] ring-1 ring-white/7 backdrop-blur-lg">
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 bg-linear-to-r from-white/3 to-transparent px-3 py-2.5">
        <div
          className="flex min-w-0 flex-1 cursor-grab select-none items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400 active:cursor-grabbing"
          onPointerDown={props.onHeaderPointerDown}
        >
          <Bot className="size-3.5 text-emerald-300" />
          Codex VFX
        </div>
        <div className="flex items-center gap-0.5">
          {props.session.messages.length > 0 ? (
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/6 hover:text-zinc-200"
              onClick={props.onClearHistory}
              aria-label="Clear Codex history"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
          <CopilotSettingsDialog onSaved={props.onSettingsChanged} />
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/6 hover:text-zinc-200"
            onClick={props.onClose}
            aria-label="Close Codex panel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-linear-to-b from-transparent via-transparent to-black/10 px-3 py-3" ref={scrollRef}>
        {visibleMessages.length === 0 && !isActive ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/6 bg-white/3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Bot className="size-6 text-zinc-700" />
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">
                {props.isConfigured ? "Describe the VFX graph or emitter stack you want to build." : "Configure Codex first."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isActive ? <ThinkingIndicator session={props.session} /> : null}
            {props.session.status === "error" && props.session.error ? (
              <div className="rounded-2xl border border-rose-400/18 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
                {props.session.error}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/8 bg-black/10 p-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <textarea
              className="min-h-24 w-full resize-none rounded-[22px] border border-white/8 bg-[#0d1718]/92 px-3 py-2.5 text-xs leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/45"
              disabled={isActive || !props.isConfigured}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={props.isConfigured ? "Describe the effect you want. Press Cmd+Enter to send." : "Configure Codex first"}
              value={input}
            />
          </div>
          {isActive ? (
            <button
              type="button"
              className="mb-1 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white transition hover:bg-rose-400"
              onClick={props.onAbort}
              aria-label="Abort Codex session"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="mb-1 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-[#06100d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={!input.trim() || !props.isConfigured}
              onClick={handleSubmit}
              aria-label="Send Codex prompt"
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[22px] rounded-br-md border border-emerald-300/12 bg-linear-to-br from-emerald-400/18 to-emerald-500/8 px-3 py-2 text-xs text-zinc-100">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {message.toolCalls?.length ? (
        <div className="flex flex-wrap gap-1">
          {message.toolCalls.map((toolCall) => (
            <div
              className="flex items-center gap-1 rounded-full border border-emerald-300/10 bg-[#0d1918] px-2 py-1 text-[9px] uppercase tracking-[0.08em] text-emerald-300/88"
              key={toolCall.id}
            >
              <Wrench className="size-2" />
              {toolCall.name}
            </div>
          ))}
        </div>
      ) : null}
      {message.content ? <MarkdownContent content={message.content} /> : null}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className="max-w-[95%] rounded-[22px] rounded-bl-md border border-white/6 bg-[#0d1718]/88 px-3 py-2 text-xs leading-relaxed text-zinc-300"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/^#### (.+)$/gm, '<h4 class="mt-2 mb-0.5 text-[11px] font-semibold text-zinc-100">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-2 mb-0.5 text-xs font-semibold text-zinc-100">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-2 mb-0.5 text-xs font-bold text-zinc-100">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-2 mb-0.5 text-[13px] font-bold text-zinc-100">$1</h1>');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => `<pre class="my-1 overflow-x-auto rounded-2xl border border-white/5 bg-black/22 px-2.5 py-2 text-[10px] leading-snug"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code class="rounded-md border border-emerald-300/10 bg-emerald-400/8 px-1 py-px text-[10px] text-emerald-200">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/^[\-*] (.+)$/gm, '<li class="ml-3 list-disc">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal">$1</li>');
  html = html.replace(/((?:<li class="ml-3 list-decimal">.*<\/li>\n?)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>');
  html = html.replace(/\n\n+/g, '</p><p class="mt-1.5">');
  html = `<p>${html}</p>`;
  html = html.replace(/(?<!<\/pre>)\n(?!<)/g, "<br>");
  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function ThinkingIndicator({ session }: { session: CopilotSession }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-1">
      <Loader2 className="size-3 animate-spin text-emerald-400" />
      <span className="text-[10px] text-zinc-500">
        {session.status === "executing" ? "Executing tools..." : `Thinking${session.iterationCount > 1 ? ` (step ${session.iterationCount})` : ""}...`}
      </span>
    </div>
  );
}