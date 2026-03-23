import { ChevronRight, Film, Search } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ClipTrackRow = {
  id: string;
  label: string;
  componentLabel: string;
  chipClassName: string;
  times: Float32Array;
};

type ClipTrackSection = {
  id: string;
  boneName: string;
  rows: ClipTrackRow[];
};

type TrackListItem =
  | { id: string; top: number; type: "section"; boneName: string; height: number }
  | { id: string; top: number; type: "row"; row: ClipTrackRow; height: number };

const SECTION_HEIGHT = 37;
const ROW_HEIGHT = 57;
const OVERSCAN = 320;

function ClipTrackListInner(props: {
  sections: ClipTrackSection[];
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [query, setQuery] = useState("");
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() => new Set());

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return props.sections;
    }

    return props.sections.filter((section) => {
      if (section.boneName.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      return section.rows.some((row) => `${row.label} ${row.componentLabel}`.toLowerCase().includes(normalizedQuery));
    });
  }, [normalizedQuery, props.sections]);

  useEffect(() => {
    setOpenSectionIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const next = new Set(Array.from(current).filter((id) => props.sections.some((section) => section.id === id)));
      return next.size === current.size ? current : next;
    });
  }, [props.sections]);

  const items = useMemo(() => {
    let top = 0;
    const nextItems: TrackListItem[] = [];

    for (const section of filteredSections) {
      const isOpen = normalizedQuery ? true : openSectionIds.has(section.id);
      nextItems.push({
        id: section.id,
        top,
        type: "section",
        boneName: section.boneName,
        height: SECTION_HEIGHT,
      });
      top += SECTION_HEIGHT;

      if (!isOpen) {
        continue;
      }

      for (const row of section.rows) {
        nextItems.push({
          id: row.id,
          top,
          type: "row",
          row,
          height: ROW_HEIGHT,
        });
        top += ROW_HEIGHT;
      }
    }

    return {
      items: nextItems,
      totalHeight: top,
    };
  }, [filteredSections, normalizedQuery, openSectionIds]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(viewport.clientHeight);
    });

    resizeObserver.observe(viewport);
    setViewportHeight(viewport.clientHeight);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const visibleItems = useMemo(
    () =>
      items.items.filter(
        (item) =>
          item.top + item.height >= scrollTop - OVERSCAN &&
          item.top <= scrollTop + viewportHeight + OVERSCAN
      ),
    [items.items, scrollTop, viewportHeight]
  );

  return (
    <div className="min-h-0 border-r border-white/8 bg-[#0a151b]">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Tracks</div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter bones"
            className="h-8 border-white/8 bg-black/18 pl-8 text-[12px] text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>
      <div
        ref={viewportRef}
        className="h-[calc(100%-77px)] min-h-0 overflow-auto"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: `${items.totalHeight}px`, position: "relative" }}>
          {visibleItems.map((item) => {
            if (item.type === "section") {
              const isOpen = normalizedQuery ? true : openSectionIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="absolute left-0 right-0 flex items-center gap-2 border-b border-white/6 bg-black/12 px-4 py-2 text-left text-[12px] font-medium text-zinc-200 transition hover:bg-black/18"
                  style={{ top: `${item.top}px`, height: `${item.height}px` }}
                  onClick={() =>
                    setOpenSectionIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      return next;
                    })
                  }
                >
                  <ChevronRight className={cn("size-3.5 shrink-0 text-zinc-500 transition-transform", isOpen && "rotate-90")} />
                  <Film className="size-3.5 shrink-0 text-zinc-500" />
                  {item.boneName}
                </button>
              );
            }

            const isSelectedRow = props.selectedRowId === item.row.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "absolute left-0 right-0 flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3 text-left transition",
                  isSelectedRow ? "bg-emerald-400/10" : "hover:bg-white/4"
                )}
                style={{ top: `${item.top}px`, height: `${item.height}px` }}
                onClick={() => props.onSelectRow(item.row.id)}
              >
                <div>
                  <div className="text-[12px] font-medium text-zinc-100">
                    {item.row.label} {item.row.componentLabel}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{item.row.times.length} keys</div>
                </div>
                <div className={cn("rounded-full px-2 py-1 text-[10px] font-medium ring-1", item.row.chipClassName)}>{item.row.componentLabel}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const ClipTrackList = memo(ClipTrackListInner);
