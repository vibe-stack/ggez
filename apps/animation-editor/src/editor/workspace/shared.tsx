import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const editorInputClassName =
  "h-8 rounded-md border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-100 shadow-none placeholder:text-zinc-500 focus-visible:border-emerald-400/50 focus-visible:ring-2 focus-visible:ring-emerald-400/15";

export const editorSelectClassName =
  "h-8 w-full rounded-md border border-white/10 bg-black/35 px-2.5 text-[12px] text-zinc-100 outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15";

export const editorTextareaClassName =
  "min-h-40 rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-[12px] text-zinc-100 shadow-none placeholder:text-zinc-500 focus-visible:border-emerald-400/50 focus-visible:ring-2 focus-visible:ring-emerald-400/15";

export const sectionHintClassName = "text-[11px] leading-5 text-zinc-500";

export function StudioSection(props: {
  title: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden border border-white/8 bg-black/25", props.className)}>
      <header className="flex items-center justify-between border-b border-white/8 bg-white/[0.02] px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">{props.title}</h2>
        {props.action}
      </header>
      <div className={cn("space-y-3 p-3", props.bodyClassName)}>{props.children}</div>
    </section>
  );
}

export function PropertyField(props: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("grid gap-1.5", props.className)}>
      <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{props.label}</span>
      {props.children}
    </label>
  );
}