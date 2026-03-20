import { Cable, X } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Entity, GeometryNode, SceneHook } from "@ggez/shared";
import { LogicViewer } from "./LogicViewer";

type LogicViewerPanelProps = {
  nodes: GeometryNode[];
  entities: Entity[];
  onClose: () => void;
  onNodeClick?: (nodeId: string) => void;
  onUpdateNodeHooks?: (nodeId: string, hooks: SceneHook[], beforeHooks: SceneHook[]) => void;
  onUpdateEntityHooks?: (entityId: string, hooks: SceneHook[], beforeHooks: SceneHook[]) => void;
};

export function LogicViewerPanel({
  nodes,
  entities,
  onClose,
  onNodeClick,
  onUpdateNodeHooks,
  onUpdateEntityHooks
}: LogicViewerPanelProps) {
  return (
    <div className="flex size-full flex-col bg-transparent">
      {/* Header bar */}
      <div className="flex h-8 shrink-0 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Cable className="size-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium tracking-wide text-foreground/80 uppercase">
            HookFlow
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md p-1 text-foreground/50 transition hover:text-foreground/80"
            onClick={onClose}
            title="Close HookFlow"
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="min-h-0 flex-1 bg-transparent">
        <ReactFlowProvider>
          <LogicViewer
            nodes={nodes}
            entities={entities}
            onNodeClick={onNodeClick}
            onUpdateNodeHooks={onUpdateNodeHooks}
            onUpdateEntityHooks={onUpdateEntityHooks}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
