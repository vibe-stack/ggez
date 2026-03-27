import { GripHorizontal } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMemo, useState } from "react";
import type { ImportedCharacterAsset } from "./preview-assets";
import { buildRigBoneEntries } from "./workspace/left-sidebar/rig-utils";
import { sectionHintClassName } from "./workspace/shared";

type CharacterBonePanelProps = {
  character: ImportedCharacterAsset | null;
  onHeaderPointerDown: (event: ReactPointerEvent) => void;
};

export function CharacterBonePanel({ character, onHeaderPointerDown }: CharacterBonePanelProps) {
  const [search, setSearch] = useState("");

  const boneEntries = useMemo(
    () => buildRigBoneEntries(character?.documentRig),
    [character]
  );

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boneEntries;
    return boneEntries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [boneEntries, search]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#091012]/84 shadow-[0_28px_96px_rgba(0,0,0,0.5)] ring-1 ring-white/8 backdrop-blur-2xl">
      {/* Drag header */}
      <div
        className="flex h-11 shrink-0 cursor-move items-center justify-between px-4 text-[12px] font-medium text-zinc-400"
        onPointerDown={onHeaderPointerDown}
      >
        <span>Skeleton</span>
        <GripHorizontal className="size-4 text-zinc-600" />
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter bones…"
          className="h-8 w-full rounded-xl border-0 bg-white/7 px-3 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-emerald-400/20"
        />
      </div>

      {/* Bone list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!character ? (
          <p className={`px-2 ${sectionHintClassName}`}>
            Import a rigged character to view the bone hierarchy.
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className={`px-2 ${sectionHintClassName}`}>No bones match "{search}".</p>
        ) : (
          <div className="space-y-0.5">
            {filteredEntries.map((bone) => (
              <div
                key={bone.index}
                className="flex items-center gap-1.5 rounded-lg py-1 pr-2 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
                style={{ paddingLeft: `${8 + bone.depth * 10}px` }}
              >
                {/* Small bone icon */}
                <svg
                  className="size-3 shrink-0 text-zinc-600"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden
                >
                  <circle cx="2.5" cy="2.5" r="1.5" fill="currentColor" />
                  <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
                  <line x1="2.5" y1="2.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span className="truncate font-mono text-[11px] leading-relaxed">{bone.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
