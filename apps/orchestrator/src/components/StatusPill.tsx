import type { RuntimeStatus } from "../types";

export function StatusPill({ status }: { status: RuntimeStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
        status === "running"
          ? "bg-emerald-400/10 text-emerald-300"
          : status === "starting"
            ? "bg-amber-400/10 text-amber-300"
            : status === "error"
              ? "bg-rose-400/10 text-rose-300"
              : "bg-white/6 text-white/40"
      }`}
    >
      {status}
    </span>
  );
}
