import { Sparkles, WandSparkles, X } from "lucide-react";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AiModelPromptBar({
  active,
  armed,
  busy,
  error,
  onCancel,
  onChangePrompt,
  onSubmit,
  prompt
}: {
  active: boolean;
  armed: boolean;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onChangePrompt: (value: string) => void;
  onSubmit: () => void;
  prompt: string;
}) {
  if (!armed && !active) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <FloatingPanel className="pointer-events-auto w-full max-w-3xl rounded-[1.35rem] border border-white/10 bg-[#08110e]/94 p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        {active ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-2">
              <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                <Sparkles className="size-3.5 text-emerald-300" />
                Generate 3D Object
              </div>
              <Button
                className="size-8 rounded-xl text-foreground/56 hover:text-foreground"
                onClick={onCancel}
                size="icon-sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                autoFocus
                className="h-11 rounded-2xl border-white/10 bg-white/[0.045] text-sm"
                disabled={busy}
                onChange={(event) => onChangePrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="Describe the object to generate..."
                value={prompt}
              />
              <Button
                className={cn(
                  "h-11 rounded-2xl px-4 text-sm",
                  busy && "cursor-wait"
                )}
                disabled={busy || prompt.trim().length === 0}
                onClick={onSubmit}
              >
                <WandSparkles className="size-4" />
                {busy ? "Generating..." : "Generate"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 px-2 text-[11px] text-foreground/48">
              <span>Scale the proxy cube to define the target bounds, then generate.</span>
              {error ? <span className="text-rose-300">{error}</span> : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <div className="flex items-center gap-2 text-sm text-foreground/72">
              <Sparkles className="size-4 text-emerald-300" />
              <span>Click a surface to place an AI object proxy cube.</span>
            </div>
            <Button className="rounded-xl" onClick={onCancel} size="xs" variant="ghost">
              Cancel
            </Button>
          </div>
        )}
      </FloatingPanel>
    </div>
  );
}
