import { Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGameCopilot } from "../hooks/use-game-copilot";
import type { ProjectSnapshot } from "../types";
import { GameCopilotPanel } from "./GameCopilotPanel";

type GameCopilotProps = {
  gameIframeRef: React.RefObject<HTMLIFrameElement | null>;
  gameIframeUrl: string | null;
  project: ProjectSnapshot | null;
  visible: boolean;
};

export function GameCopilot(props: GameCopilotProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const copilot = useGameCopilot({
    gameIframeRef: props.gameIframeRef,
    gameIframeUrl: props.gameIframeUrl,
    project: props.project
  });

  useEffect(() => {
    if (!props.visible) {
      setOpen(false);
    }
  }, [props.visible]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown, { capture: true });
    return () => window.removeEventListener("mousedown", handlePointerDown, { capture: true });
  }, [open]);

  if (!props.visible || !props.project) {
    return null;
  }

  const isBusy = copilot.session.status === "thinking" || copilot.session.status === "executing";

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute bottom-6 right-6 z-30 flex flex-col items-end gap-3"
    >
      {open ? (
        <div className="pointer-events-auto h-[min(72vh,760px)] w-[min(24rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)]">
          <GameCopilotPanel
            isConfigured={copilot.isConfigured}
            onAbort={copilot.abort}
            onClearHistory={copilot.clearHistory}
            onClose={() => setOpen(false)}
            onRefreshStatus={() => void copilot.refreshConfigured()}
            onSendMessage={(prompt) => void copilot.sendMessage(prompt)}
            projectName={props.project.name}
            session={copilot.session}
            statusMessage={copilot.statusMessage}
          />
        </div>
      ) : null}

      <button
        type="button"
        className={`codex-orb pointer-events-auto ${isBusy ? "codex-orb-active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title="Toggle game Codex"
        aria-label="Toggle game Codex"
      >
        <span className="codex-orb-inner">
          <Bot size={16} />
        </span>
      </button>
    </div>
  );
}