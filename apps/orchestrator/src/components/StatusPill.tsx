import type { RuntimeStatus } from "../types";

export function StatusPill({ status }: { status: RuntimeStatus }) {
  const dot =
    status === "running"
      ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.55)]"
      : status === "starting"
        ? "bg-amber-400"
        : status === "error"
          ? "bg-rose-400"
          : "bg-zinc-600";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`block h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
      <span className="text-[10px] text-white/38">{status}</span>
    </span>
  );
}
