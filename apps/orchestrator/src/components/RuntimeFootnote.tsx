import type { RuntimeSnapshot } from "../types";

/** Shows only the port — CLI commands are intentionally omitted. */
export function RuntimeFootnote({ runtime }: { runtime: RuntimeSnapshot }) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-white/36">
      <span className="font-medium text-white/50">Port</span>
      <span>{runtime.port}</span>
    </div>
  );
}
