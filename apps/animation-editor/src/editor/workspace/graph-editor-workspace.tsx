import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { EditorGraphNode } from "@ggez/anim-schema";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownRight, GripHorizontal } from "lucide-react";
import { AnimationPreviewPanel } from "../animation-preview-panel";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "../preview-assets";
import { useEditorStoreValue } from "../use-editor-store-value";
import { usePreviewPanelDrag } from "../hooks/use-preview-panel-drag";
import { GraphCanvas } from "./graph-canvas";
import { LeftSidebar } from "./left-sidebar/index";
import { RightSidebar } from "./right-sidebar";
import { StateMachineCanvas } from "./state-machine-canvas";
import { SubgraphCanvas } from "./subgraph-canvas";
import { useSelectedGraph } from "./use-selected-graph";

type GraphEditorWorkspaceProps = {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  assetStatus: string;
  assetError: string | null;
  copilotOpen: boolean;
  workspaceRef: React.RefObject<HTMLDivElement | null>;
};

export function GraphEditorWorkspace(props: GraphEditorWorkspaceProps) {
  const { store, character, importedClips, assetStatus, assetError, copilotOpen, workspaceRef } = props;

  const state = useEditorStoreValue(store, () => store.getState(), ["document", "selection", "compile", "clipboard"]);
  const graph = useSelectedGraph(store);
  const [openedStateMachineNodeId, setOpenedStateMachineNodeId] = useState<string | null>(null);
  const [subgraphStack, setSubgraphStack] = useState<Array<{ graphId: string; parentGraphId: string; parentNodeId: string; nodeName: string }>>([]);

  const { previewRect, beginPreviewInteraction, updatePreviewBounds } = usePreviewPanelDrag(workspaceRef);
  const graphNamesById = state.document.graphs.reduce<Record<string, string>>((accumulator, entry) => {
    accumulator[entry.id] = entry.name;
    return accumulator;
  }, {});
  const openedSubgraph = subgraphStack.at(-1) ?? null;

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePreviewBounds();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [workspaceRef, updatePreviewBounds]);

  useEffect(() => {
    if (!openedStateMachineNodeId) {
      return;
    }

    const existsInGraph = graph.nodes.some(
      (node) => node.id === openedStateMachineNodeId && node.kind === "stateMachine"
    );
    if (!existsInGraph) {
      setOpenedStateMachineNodeId(null);
    }
  }, [graph.nodes, openedStateMachineNodeId]);

  useEffect(() => {
    if (openedSubgraph && graph.id !== openedSubgraph.graphId) {
      setSubgraphStack([]);
    }
  }, [graph.id, openedSubgraph]);

  const openedStateMachineNode = openedStateMachineNodeId
    ? (graph.nodes.find(
        (node): node is Extract<EditorGraphNode, { kind: "stateMachine" }> =>
          node.id === openedStateMachineNodeId && node.kind === "stateMachine"
      ) ?? null)
    : null;
  const openedSubgraphParentGraphName = openedSubgraph ? graphNamesById[openedSubgraph.parentGraphId] ?? "Graph" : "Graph";

  function handleConnect(connection: { source: string | null; target: string | null }) {
    if (!connection.source || !connection.target) {
      return;
    }

    store.connectNodes(graph.id, connection.source, connection.target);
  }

  function handleOpenSubgraph(nodeId: string) {
    const node = graph.nodes.find((entry): entry is Extract<EditorGraphNode, { kind: "subgraph" }> => entry.id === nodeId && entry.kind === "subgraph");
    if (!node || !node.graphId || node.graphId === graph.id) {
      return;
    }

    const targetGraph = state.document.graphs.find((entry) => entry.id === node.graphId);
    if (!targetGraph) {
      return;
    }

    setOpenedStateMachineNodeId(null);
    setSubgraphStack((current) => [
      ...current,
      {
        graphId: targetGraph.id,
        parentGraphId: graph.id,
        parentNodeId: node.id,
        nodeName: node.name,
      },
    ]);
    store.selectGraph(targetGraph.id);
  }

  function handleExitSubgraph() {
    const current = subgraphStack.at(-1);
    if (!current) {
      return;
    }

    setOpenedStateMachineNodeId(null);
    setSubgraphStack((stack) => stack.slice(0, -1));
    store.selectGraph(current.parentGraphId);
    store.selectNodes([current.parentNodeId]);
  }

  return (
    <>
      {openedStateMachineNode ? (
        <StateMachineCanvas
          store={store}
          graph={graph}
          node={openedStateMachineNode}
          parameters={state.document.parameters}
          onExit={() => setOpenedStateMachineNodeId(null)}
        />
      ) : openedSubgraph ? (
        <SubgraphCanvas
          graph={graph}
          graphNamesById={graphNamesById}
          selectedNodeIds={state.selection.nodeIds}
          parentGraphName={openedSubgraphParentGraphName}
          subgraphNodeName={openedSubgraph.nodeName}
          onExit={handleExitSubgraph}
          onConnect={handleConnect}
          onSelectionChange={(nodeIds) => store.selectNodes(nodeIds)}
          onOpenStateMachine={(nodeId) => setOpenedStateMachineNodeId(nodeId)}
          onOpenSubgraph={handleOpenSubgraph}
          onNodeDragStop={(nodeId, position) =>
            store.moveNodes(graph.id, { [nodeId]: position })
          }
          onAddNode={(kind, position) => {
            const nodeId = store.addNode(graph.id, kind);
            store.moveNodes(graph.id, { [nodeId]: position });
          }}
          onDeleteNodes={() => store.deleteSelectedNodes()}
          onDeleteEdges={(edgeIds) => store.deleteEdges(graph.id, edgeIds)}
        />
      ) : (
        <GraphCanvas
          graph={graph}
          graphNamesById={graphNamesById}
          selectedNodeIds={state.selection.nodeIds}
          onConnect={handleConnect}
          onSelectionChange={(nodeIds) => store.selectNodes(nodeIds)}
          onOpenStateMachine={(nodeId) => setOpenedStateMachineNodeId(nodeId)}
          onOpenSubgraph={handleOpenSubgraph}
          onNodeDragStop={(nodeId, position) =>
            store.moveNodes(graph.id, { [nodeId]: position })
          }
          onAddNode={(kind, position) => {
            const nodeId = store.addNode(graph.id, kind);
            store.moveNodes(graph.id, { [nodeId]: position });
          }}
          onDeleteNodes={() => store.deleteSelectedNodes()}
          onDeleteEdges={(edgeIds) => store.deleteEdges(graph.id, edgeIds)}
        />
      )}

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute top-12 left-4 z-20 h-[min(68vh,720px)] w-[320px] max-w-[calc(100vw-2rem)]">
          <LeftSidebar store={store} state={state} characterFileName={character?.fileName} />
        </div>

        <div
          className="pointer-events-auto absolute top-12 right-4 z-20 h-[min(72vh,760px)] w-72 max-w-[calc(100vw-2rem)]"
          style={copilotOpen ? { right: "calc(22rem + 2rem)" } : undefined}
        >
          <RightSidebar store={store} />
        </div>

        <div
          className="pointer-events-auto absolute z-30 flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#091012]/84 shadow-[0_28px_96px_rgba(0,0,0,0.5)] ring-1 ring-white/8 backdrop-blur-2xl"
          style={{
            left: `${previewRect.x}px`,
            top: `${previewRect.y}px`,
            width: `${previewRect.width}px`,
            height: `${previewRect.height}px`,
          }}
        >
          <div
            className="flex h-11 shrink-0 items-center justify-between px-4 text-[12px] font-medium text-zinc-400 cursor-move pb-6"
            onPointerDown={(event) => beginPreviewInteraction("move", event)}
          >
            <span>Preview</span>
            <GripHorizontal className="size-4 text-zinc-600" />
          </div>

          <div className="min-h-0 flex-1 px-3 pb-3">
            <AnimationPreviewPanel
              store={store}
              character={character}
              importedClips={importedClips}
              assetStatus={assetStatus}
              assetError={assetError}
            />
          </div>

          <button
            type="button"
            className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-transparent text-zinc-500 hover:bg-white/8 hover:text-zinc-300"
            onPointerDown={(event) => beginPreviewInteraction("resize", event)}
            aria-label="Resize preview panel"
          >
            <ArrowDownRight className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
