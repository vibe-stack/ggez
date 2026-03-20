import { useEffect, useMemo, useRef, useState } from "react";
import type { Entity, GeometryNode, SceneHook } from "@ggez/shared";
import { cn } from "@/lib/utils";
import { LogicViewerPanel } from "./LogicViewerPanel";

const MIN_HEIGHT = 240;
const DEFAULT_HEIGHT = 360;
const BOTTOM_OFFSET = 40;
const TOP_CLEARANCE = 56;

type LogicViewerSheetProps = {
  entities: Entity[];
  nodes: GeometryNode[];
  onClose: () => void;
  onNodeClick?: (nodeId: string) => void;
  onUpdateNodeHooks?: (nodeId: string, hooks: SceneHook[], beforeHooks: SceneHook[]) => void;
  onUpdateEntityHooks?: (entityId: string, hooks: SceneHook[], beforeHooks: SceneHook[]) => void;
};

export function LogicViewerSheet({
  entities,
  nodes,
  onClose,
  onNodeClick,
  onUpdateNodeHooks,
  onUpdateEntityHooks
}: LogicViewerSheetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [parentHeight, setParentHeight] = useState(0);
  const [isResizing, setIsResizing] = useState(false);

  const maxHeight = useMemo(
    () => Math.max(MIN_HEIGHT, parentHeight - TOP_CLEARANCE - BOTTOM_OFFSET),
    [parentHeight]
  );

  useEffect(() => {
    const host = hostRef.current;
    const parent = host?.parentElement;
    if (!parent) {
      return;
    }

    const updateParentHeight = () => {
      setParentHeight(parent.clientHeight);
    };

    updateParentHeight();

    const resizeObserver = new ResizeObserver(updateParentHeight);
    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    setHeight((current) => clamp(current, MIN_HEIGHT, maxHeight));
  }, [maxHeight]);

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = height;

    setIsResizing(true);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = startY - moveEvent.clientY;
      setHeight(clamp(startHeight + deltaY, MIN_HEIGHT, maxHeight));
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex"
      ref={hostRef}
      style={{ height }}
    >
      <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border-x border-t border-white/8 bg-[#040907]/76 shadow-[0_-22px_72px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div
          className="group flex h-5 shrink-0 cursor-row-resize touch-none items-start justify-center"
          onPointerDown={handleResizeStart}
          role="separator"
          aria-label="Resize logic viewer"
          aria-orientation="horizontal"
        >
          <div
            className={cn(
              "mt-1.5 h-1 w-24 rounded-full bg-white/12 transition-colors",
              isResizing ? "bg-emerald-400/55" : "group-hover:bg-emerald-400/35"
            )}
          />
        </div>

        <div className="min-h-0 flex-1">
          <LogicViewerPanel
            entities={entities}
            nodes={nodes}
            onClose={onClose}
            onNodeClick={onNodeClick}
            onUpdateEntityHooks={onUpdateEntityHooks}
            onUpdateNodeHooks={onUpdateNodeHooks}
          />
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}