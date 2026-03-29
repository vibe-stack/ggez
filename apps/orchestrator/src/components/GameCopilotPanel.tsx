import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Gamepad2, Loader2, Send, Square, Trash2, Wrench, X } from "lucide-react";
import type { CopilotMessage, CopilotSession } from "../lib/copilot/types";

type GameCopilotPanelProps = {
  isConfigured: boolean;
  onAbort: () => void;
  onClearHistory: () => void;
  onClose: () => void;
  onRefreshStatus: () => void;
  onSendMessage: (prompt: string) => void;
  projectName: string;
  session: CopilotSession;
  statusMessage: string | null;
};

export function GameCopilotPanel(props: GameCopilotPanelProps) {
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
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/8 bg-zinc-950/84 shadow-[0_24px_80px_rgba(0,0,0,0.42)] ring-1 ring-emerald-300/8 backdrop-blur-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 bg-linear-to-r from-emerald-400/8 to-transparent px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/58">
          <Bot className="size-3.5 text-emerald-300" />
          <span className="truncate">{props.projectName} Codex</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-btn"
            onClick={props.onRefreshStatus}
            title="Refresh Codex status"
            aria-label="Refresh Codex status"
          >
            <Gamepad2 size={14} />
          </button>
          {props.session.messages.length > 0 ? (
            <button
              type="button"
              className="icon-btn"
              onClick={props.onClearHistory}
              title="Clear chat"
              aria-label="Clear chat"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            onClick={props.onClose}
            title="Close Codex"
            aria-label="Close Codex"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {visibleMessages.length === 0 && !isActive ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/8 bg-white/4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Bot className="size-6 text-white/24" />
              </div>
              <p className="text-xs leading-relaxed text-white/46">
                {props.isConfigured
                  ? "Ask Codex to inspect or change the currently open game. Use it for code, and switch to Trident or Animation Studio when the work belongs there."
                  : props.statusMessage ?? 'Install Codex CLI and run "codex login" in a terminal.'}
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
            {!props.isConfigured && props.statusMessage ? (
              <div className="rounded-2xl border border-amber-300/18 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {props.statusMessage}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/8 bg-black/14 p-3">
        <div className="flex items-end gap-2">
          <textarea
            className="engine-input min-h-[4.75rem] flex-1 resize-none rounded-[22px] bg-zinc-900/92 px-3 py-2.5 text-xs leading-relaxed text-white placeholder:text-white/30"
            disabled={isActive || !props.isConfigured}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              props.isConfigured
                ? "Ask about the current game. Press Cmd+Enter to send."
                : "Codex is unavailable."
            }
            value={input}
          />
          {isActive ? (
            <button
              type="button"
              className="mb-1 inline-flex size-10 items-center justify-center rounded-2xl border border-rose-400/26 bg-rose-500/14 text-rose-200"
              onClick={props.onAbort}
              title="Abort request"
              aria-label="Abort request"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="mb-1 inline-flex size-10 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400 text-[#04110d] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!input.trim() || !props.isConfigured}
              onClick={handleSubmit}
              title="Send message"
              aria-label="Send message"
            >
              <Send size={14} />
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
        <div className="max-w-[85%] rounded-[22px] rounded-br-md border border-emerald-300/15 bg-linear-to-br from-emerald-400/22 to-emerald-500/10 px-3 py-2 text-xs text-white/90">
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
              key={toolCall.id}
              className="flex items-center gap-1 rounded-full border border-emerald-300/12 bg-[#0d1918] px-2 py-1 text-[9px] uppercase tracking-[0.08em] text-emerald-300/88"
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
      className="max-w-[95%] rounded-[22px] rounded-bl-md border border-white/6 bg-[#0d1718]/88 px-3 py-2 text-xs leading-relaxed text-white/76"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/^#### (.+)$/gm, '<h4 class="mt-2 mb-0.5 text-[11px] font-semibold text-white/82">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-2 mb-0.5 text-xs font-semibold text-white/86">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-2 mb-0.5 text-xs font-bold text-white/90">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-2 mb-0.5 text-[13px] font-bold text-white/94">$1</h1>');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => `<pre class="my-1 overflow-x-auto rounded-2xl border border-white/5 bg-black/22 px-2.5 py-2 text-[10px] leading-snug"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code class="rounded-md border border-emerald-300/10 bg-emerald-400/8 px-1 py-px text-[10px] text-emerald-200">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white/88">$1</strong>');
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
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function ThinkingIndicator({ session }: { session: CopilotSession }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-1 text-[10px] text-white/48">
      <Loader2 className="size-3 animate-spin text-emerald-400" />
      <span>
        {session.status === "executing"
          ? "Executing tools..."
          : `Thinking${session.iterationCount > 1 ? ` (step ${session.iterationCount})` : ""}...`}
      </span>
    </div>
  );
}