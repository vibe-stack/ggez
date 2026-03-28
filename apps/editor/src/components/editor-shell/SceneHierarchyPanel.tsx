import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Bot,
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FolderTree,
  Lightbulb,
  Lock,
  LockOpen,
  Package,
  Search,
  Sparkles,
  User
} from "lucide-react";
import type { Entity, GeometryNode } from "@ggez/shared";
import { resolveSceneGraph } from "@ggez/shared";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SceneHierarchyPanelProps = {
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  entities: Entity[];
  hiddenSceneItemIds: string[];
  interactive?: boolean;
  lockedSceneItemIds: string[];
  nodes: GeometryNode[];
  onFocusNode: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onToggleSceneItemLock: (itemId: string) => void;
  onToggleSceneItemVisibility: (itemId: string) => void;
  selectedNodeIds: string[];
};

type FlatSceneItem = {
  depth: number;
  id: string;
  isBranch: boolean;
  itemType: "entity" | "node";
  kind: string;
  name: string;
};

export function SceneHierarchyPanel({
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  entities,
  hiddenSceneItemIds,
  interactive = true,
  lockedSceneItemIds,
  nodes,
  onFocusNode,
  onSelectNodes,
  onToggleSceneItemLock,
  onToggleSceneItemVisibility,
  selectedNodeIds
}: SceneHierarchyPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const explicitHiddenIdSet = useMemo(() => new Set(hiddenSceneItemIds), [hiddenSceneItemIds]);
  const explicitLockedIdSet = useMemo(() => new Set(lockedSceneItemIds), [lockedSceneItemIds]);
  const effectiveHiddenIdSet = useMemo(() => new Set(effectiveHiddenSceneItemIds), [effectiveHiddenSceneItemIds]);
  const effectiveLockedIdSet = useMemo(() => new Set(effectiveLockedSceneItemIds), [effectiveLockedSceneItemIds]);
  const collapsedIdSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const totalItemCount = nodes.length + entities.length;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(searchText);
    }, 140);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchText]);

  const { branchIds, filteredItems } = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    const hasQuery = normalizedQuery.length > 0;
    const sceneGraph = resolveSceneGraph(nodes, entities);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const parentById = new Map<string, string | undefined>();
    const matchedIds = new Set<string>();
    const nextBranchIds = new Set<string>();
    const flatItems: FlatSceneItem[] = [];

    nodes.forEach((node) => {
      parentById.set(node.id, node.parentId);
    });

    entities.forEach((entity) => {
      parentById.set(entity.id, entity.parentId);
    });

    if (hasQuery) {
      nodes.forEach((node) => {
        const kindLabel = resolveKindLabel(node.kind, "node");

        if (node.name.toLowerCase().includes(normalizedQuery) || kindLabel.toLowerCase().includes(normalizedQuery)) {
          matchedIds.add(node.id);
        }
      });

      entities.forEach((entity) => {
        const kindLabel = resolveKindLabel(entity.type, "entity");

        if (entity.name.toLowerCase().includes(normalizedQuery) || kindLabel.toLowerCase().includes(normalizedQuery)) {
          matchedIds.add(entity.id);
        }
      });

      Array.from(matchedIds).forEach((id) => {
        let currentParentId = parentById.get(id);

        while (currentParentId) {
          matchedIds.add(currentParentId);
          currentParentId = parentById.get(currentParentId);
        }
      });
    }

    const appendEntity = (entityId: string, depth: number) => {
      const entity = entityById.get(entityId);

      if (!entity || (hasQuery && !matchedIds.has(entity.id))) {
        return;
      }

      flatItems.push({
        depth,
        id: entity.id,
        isBranch: false,
        itemType: "entity",
        kind: entity.type,
        name: entity.name
      });
    };

    const appendBranch = (nodeId: string, depth: number) => {
      const node = nodeById.get(nodeId);

      if (!node || (hasQuery && !matchedIds.has(node.id))) {
        return;
      }

      const childNodeIds = sceneGraph.nodeChildrenByParentId.get(nodeId) ?? [];
      const childEntityIds = sceneGraph.entityChildrenByParentId.get(nodeId) ?? [];
      const isBranch = childNodeIds.length > 0 || childEntityIds.length > 0;

      if (isBranch) {
        nextBranchIds.add(node.id);
      }

      flatItems.push({
        depth,
        id: node.id,
        isBranch,
        itemType: "node",
        kind: node.kind,
        name: node.name
      });

      if (!hasQuery && collapsedIdSet.has(node.id)) {
        return;
      }

      childNodeIds.forEach((childNodeId) => {
        appendBranch(childNodeId, depth + 1);
      });
      childEntityIds.forEach((entityId) => {
        appendEntity(entityId, depth + 1);
      });
    };

    sceneGraph.rootNodeIds.forEach((nodeId) => {
      appendBranch(nodeId, 0);
    });
    sceneGraph.rootEntityIds.forEach((entityId) => {
      appendEntity(entityId, 0);
    });

    return {
      branchIds: Array.from(nextBranchIds),
      filteredItems: flatItems
    };
  }, [collapsedIdSet, debouncedQuery, entities, nodes]);

  useEffect(() => {
    const branchIdSet = new Set(branchIds);

    setCollapsedIds((currentIds) => {
      const nextIds = currentIds.filter((id) => branchIdSet.has(id));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [branchIds]);

  const toggleCollapsed = (itemId: string) => {
    setCollapsedIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId]
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="space-y-2 px-1 pt-1">
        <div className="flex items-center justify-between px-0.5">
          <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">Scene</div>
          <div className="text-[9px] font-medium tracking-[0.12em] text-foreground/30 uppercase">
            {filteredItems.length}/{totalItemCount}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/28" />
          <Input
            className="h-8 rounded-lg border-white/8 bg-white/5 pl-8 text-[11px]"
            disabled={!interactive}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Filter hierarchy"
            value={searchText}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-1">
        <div className="space-y-px px-1 pb-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const Icon = resolveItemIcon(item.kind, item.itemType);
              const isSelected = selectedIdSet.has(item.id);
              const isExplicitHidden = explicitHiddenIdSet.has(item.id);
              const isExplicitLocked = explicitLockedIdSet.has(item.id);
              const isHidden = effectiveHiddenIdSet.has(item.id);
              const isLocked = effectiveLockedIdSet.has(item.id);
              const inheritedHidden = isHidden && !isExplicitHidden;
              const inheritedLocked = isLocked && !isExplicitLocked;
              const expanded = item.isBranch && !collapsedIdSet.has(item.id);

              return (
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
                    isSelected ? "bg-emerald-500/14" : "hover:bg-white/4",
                    isHidden && "opacity-55"
                  )}
                  key={item.id}
                >
                  <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: `${item.depth * 12}px` }}>
                    {item.isBranch ? (
                      <button
                        className="flex size-5 shrink-0 items-center justify-center rounded-md text-foreground/28 transition-colors hover:bg-white/5 hover:text-foreground/70"
                        disabled={!interactive}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCollapsed(item.id);
                        }}
                        type="button"
                      >
                        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      </button>
                    ) : (
                      <span className="size-5 shrink-0" />
                    )}

                    <button
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors",
                        isSelected ? "text-emerald-200" : "text-foreground/68 hover:text-foreground",
                        (isHidden || isLocked) && "text-foreground/42"
                      )}
                      onClick={(event) => {
                        if (!interactive || isHidden || isLocked) {
                          return;
                        }

                        if (event.shiftKey) {
                          onSelectNodes(
                            selectedIdSet.has(item.id)
                              ? selectedNodeIds.filter((selectedId) => selectedId !== item.id)
                              : [...selectedNodeIds, item.id]
                          );
                          return;
                        }

                        onSelectNodes([item.id]);
                      }}
                      onDoubleClick={() => {
                        if (!interactive) {
                          return;
                        }

                        onFocusNode(item.id);
                      }}
                      type="button"
                    >
                      <Icon className="size-3.5 shrink-0 text-foreground/42" />
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-[9px] font-medium tracking-[0.12em] text-foreground/26 uppercase">
                        {resolveKindLabel(item.kind, item.itemType)}
                      </span>
                    </button>
                  </div>

                  <HierarchyIconButton
                    active={!isHidden}
                    ariaLabel={isHidden ? "Show item" : "Hide item"}
                    disabled={!interactive}
                    explicit={!inheritedHidden}
                    iconOff={EyeOff}
                    iconOn={Eye}
                    onClick={() => onToggleSceneItemVisibility(item.id)}
                  />
                  <HierarchyIconButton
                    active={!isLocked}
                    ariaLabel={isLocked ? "Unlock item" : "Lock item"}
                    disabled={!interactive}
                    explicit={!inheritedLocked}
                    iconOff={Lock}
                    iconOn={LockOpen}
                    onClick={() => onToggleSceneItemLock(item.id)}
                  />
                </div>
              );
            })
          ) : (
            <div className="px-2.5 py-3 text-[11px] text-foreground/42">No scene objects match the current search.</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function HierarchyIconButton({
  active,
  ariaLabel,
  disabled,
  explicit,
  iconOff: OffIcon,
  iconOn: OnIcon,
  onClick
}: {
  active: boolean;
  ariaLabel: string;
  disabled: boolean;
  explicit: boolean;
  iconOff: ComponentType<{ className?: string }>;
  iconOn: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  const Icon = active ? OnIcon : OffIcon;

  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md text-foreground/26 transition-colors hover:bg-white/5 hover:text-foreground/75",
        !active && explicit && "text-emerald-300",
        !active && !explicit && "text-foreground/42"
      )}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      type="button"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function resolveItemIcon(kind: string, itemType: FlatSceneItem["itemType"]) {
  if (itemType === "entity") {
    switch (kind) {
      case "npc-spawn":
        return Bot;
      case "smart-object":
        return Sparkles;
      case "player-spawn":
      default:
        return User;
    }
  }

  switch (kind) {
    case "group":
      return FolderTree;
    case "mesh":
      return Boxes;
    case "model":
      return Package;
    case "instancing":
      return Copy;
    case "light":
      return Lightbulb;
    case "brush":
    case "primitive":
    default:
      return Box;
  }
}

function resolveKindLabel(kind: string, itemType: FlatSceneItem["itemType"]) {
  if (itemType === "entity") {
    switch (kind) {
      case "npc-spawn":
        return "NPC";
      case "smart-object":
        return "Smart";
      case "player-spawn":
      default:
        return "Player";
    }
  }

  switch (kind) {
    case "group":
      return "Group";
    case "instancing":
      return "Instance";
    case "light":
      return "Light";
    case "mesh":
      return "Mesh";
    case "model":
      return "Model";
    case "primitive":
      return "Primitive";
    case "brush":
      return "Brush";
    default:
      return kind;
  }
}
