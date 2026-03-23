import { Check, ChevronsUpDown, Ghost } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type GhostClipOption = {
  id: string;
  name: string;
  source: string;
};

function ClipGhostClipSelectInner(props: {
  options: GhostClipOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = useMemo(
    () => props.options.find((option) => option.id === props.value) ?? null,
    [props.options, props.value]
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={props.disabled}
            className="h-7 min-w-48 justify-between rounded-md border border-white/8 bg-black/18 px-2 text-[11px] text-zinc-300 hover:bg-white/6"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Ghost className="size-3.5 text-zinc-500" />
              <span className="truncate">{selectedOption?.name ?? "Ghost Clip: None"}</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-zinc-500" />
          </Button>
        }
      />

      <PopoverContent align="end" className="w-80 gap-0 rounded-xl border border-white/8 bg-[#09110f]/96 p-0 shadow-[0_24px_60px_rgba(1,6,5,0.5)] backdrop-blur-xl">
        <Command className="rounded-[inherit] bg-transparent p-2">
          <CommandInput autoFocus placeholder="Search clips..." />
          <CommandList className="max-h-72 px-1 pb-1">
            <CommandEmpty className="px-3 py-6 text-[12px] text-zinc-500">No matching clip.</CommandEmpty>
            <CommandItem
              value="no ghost clip none"
              onSelect={() => {
                props.onValueChange(null);
                setOpen(false);
              }}
            >
              <Ghost className="size-3.5 text-zinc-500" />
              <span>No ghost clip</span>
              <Check className={cn("ml-auto size-3.5", props.value ? "opacity-0" : "opacity-100")} />
            </CommandItem>
            {props.options.map((option) => {
              const isSelected = option.id === props.value;
              return (
                <CommandItem
                  key={option.id}
                  value={`${option.name} ${option.source}`}
                  onSelect={() => {
                    props.onValueChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Ghost className="size-3.5 text-zinc-500" />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="truncate">{option.name}</span>
                    <span className="truncate text-[10px] text-zinc-500">{option.source}</span>
                  </span>
                  <Check className={cn("size-3.5", isSelected ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const ClipGhostClipSelect = memo(ClipGhostClipSelectInner);
