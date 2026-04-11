import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Vec3 } from "@ggez/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const AXES = ["x", "y", "z"] as const;

export function SectionTitle({ children }: { children: string }) {
  return (
    <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
      {children}
    </div>
  );
}

export function ToolSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

export function TransformGroup({
  label,
  onCommit,
  onUpdate,
  precision,
  step,
  values
}: {
  label: string;
  onCommit: () => void;
  onUpdate: (axis: (typeof AXES)[number], value: number) => void;
  precision: number;
  step: number;
  values: Vec3;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((axis) => (
          <DragInput
            className="min-w-0"
            compact
            key={axis}
            label={axis.toUpperCase()}
            onChange={(value) => onUpdate(axis, value)}
            onValueCommit={onCommit}
            precision={precision}
            step={step}
            value={values[axis]}
          />
        ))}
      </div>
    </div>
  );
}

export function EnumGrid({
  activeValue,
  entries,
  onSelect
}: {
  activeValue: string;
  entries: Array<{ label: string; value: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {entries.map((entry) => (
        <Button
          className={cn(activeValue === entry.value && "bg-emerald-500/18 text-emerald-200")}
          key={entry.value}
          onClick={() => onSelect(entry.value)}
          size="xs"
          variant="ghost"
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}

export function BooleanField({
  checked,
  label,
  onCheckedChange
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/3 px-3 py-2">
      <span className="text-xs text-foreground/72">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-[0.16em] text-foreground/36 uppercase">
          {checked ? "On" : "Off"}
        </span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

export function NumberField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <DragInput
      className="w-full"
      compact
      label={label}
      onChange={onChange}
      onValueCommit={() => undefined}
      precision={2}
      step={0.05}
      value={value}
    />
  );
}

export function TextField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
        {label}
      </div>
      <Input
        className="h-9 rounded-xl border-white/8 bg-white/5 text-xs"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

export function ColorField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/3 px-3 py-2">
      <span className="text-xs text-foreground/72">{label}</span>
      <Input
        className="h-8 flex-1 rounded-lg border-white/8 bg-white/5 text-xs"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </div>
  );
}

export function InteractKeyField({
  onChange,
  value
}: {
  onChange: (code: string) => void;
  value: string;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onChange(event.code);
      setListening(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [listening, onChange]);

  const displayLabel = value.replace(/^Key/, "").replace(/^Digit/, "");

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/3 px-3 py-2">
      <span className="text-xs text-foreground/72">Interact Key</span>
      <Button
        className={cn(listening && "bg-emerald-500/18 text-emerald-200")}
        onClick={() => setListening((current) => !current)}
        size="xs"
        variant="ghost"
      >
        {listening ? "Press a key..." : displayLabel}
      </Button>
    </div>
  );
}

export function startCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
