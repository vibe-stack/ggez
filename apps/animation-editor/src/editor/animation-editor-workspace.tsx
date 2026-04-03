import "@xyflow/react/dist/style.css";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { useEffect, useRef, useState } from "react";
import { CharacterWorkspace } from "./character-workspace";
import { ClipEditorWorkspace } from "./clip-editor-workspace";
import { CopilotPanel } from "./copilot/CopilotPanel";
import { useAssetState } from "./hooks/use-asset-state";
import { useCopilotPanelDrag } from "./hooks/use-copilot-panel-drag";
import { useCopilot } from "./hooks/use-copilot";
import { useDraftPersistence } from "./hooks/use-draft-persistence";
import { useEquipmentState } from "./hooks/use-equipment-state";
import { useGameConnection } from "./hooks/use-game-connection";
import { useProjectOperations } from "./hooks/use-project-operations";
import { EditorMenubar, type EditorView } from "./workspace/editor-menubar";
import { GameConnectionControl } from "./workspace/game-connection-control";
import { GraphEditorWorkspace } from "./workspace/graph-editor-workspace";
import { useSelectedGraph } from "./workspace/use-selected-graph";

export function AnimationEditorWorkspace(props: { store: AnimationEditorStore }) {
  const { store } = props;
  const graph = useSelectedGraph(store);
  const gameConnection = useGameConnection();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [editorView, setEditorView] = useState<EditorView>("clip");

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const copilotPanelRef = useRef<HTMLDivElement | null>(null);

  const assets = useAssetState(store, setEditorView);
  const equipment = useEquipmentState();
  const project = useProjectOperations(store, assets, equipment, gameConnection);
  useDraftPersistence({ assets, equipment, project, store });
  const { copilotPosition, beginCopilotDrag, updateCopilotBounds } = useCopilotPanelDrag(workspaceRef, copilotPanelRef, copilotOpen);

  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const animationInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (assets.importedClips.length === 0) {
      if (assets.selectedClipId) {
        assets.setSelectedClipId("");
      }
      return;
    }

    if (!assets.selectedClipId || !assets.importedClips.some((clip) => clip.id === assets.selectedClipId)) {
      assets.setSelectedClipId(assets.importedClips[0]!.id);
    }
  }, [assets.importedClips, assets.selectedClipId]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    const copilotElement = copilotPanelRef.current;
    const resizeObserver = new ResizeObserver(() => {
      if (copilotOpen) {
        updateCopilotBounds();
      }
    });
    resizeObserver.observe(element);

    if (copilotOpen && copilotElement) {
      resizeObserver.observe(copilotElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [copilotOpen, updateCopilotBounds]);

  const copilot = useCopilot(store, {
    createImportedClip: assets.createImportedClip,
    requestAnimationPush: (options) => {
      void project.handlePushAnimationToGame(options).catch(() => {});
    },
    getImportedClips: () => assets.importedClipsRef.current,
    updateImportedClip: assets.updateImportedClip,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EditorMenubar
        store={store}
        editorView={editorView}
        gameConnectionControl={
          <GameConnectionControl
            activeGame={gameConnection.activeGame}
            error={gameConnection.error}
            games={gameConnection.games}
            isLoading={gameConnection.isLoading}
            isPushing={gameConnection.isPushing}
            lastPush={gameConnection.lastPush}
            onProjectNameChange={project.handleProjectNameChange}
            onProjectSlugChange={project.handleProjectSlugChange}
            onPushAnimation={() => {
              void project.handlePushAnimationToGame();
            }}
            onRefresh={gameConnection.refresh}
            onSelectGame={gameConnection.setSelectedGameId}
            projectName={project.projectName}
            projectSlug={project.resolvedProjectSlug}
            selectedGameId={gameConnection.selectedGameId}
          />
        }
        onCompile={() => store.compile()}
        onChangeEditorView={setEditorView}
        onExportRuntimeBundle={() => void project.handleExportRuntimeBundle()}
        onNewFile={project.handleNewProject}
        onSaveProject={() => void project.handleSaveProject()}
        onLoadProject={() => projectInputRef.current?.click()}
        onImportCharacter={() => characterInputRef.current?.click()}
        onImportAnimations={() => animationInputRef.current?.click()}
        onAddNode={(kind) => store.addNode(graph.id, kind)}
        onToggleCopilot={() => setCopilotOpen((current) => !current)}
        copilotOpen={copilotOpen}
      />

      <input ref={projectInputRef} type="file" accept=".zip,.json,.ggezanimproj.zip,.ggezanimproj.json" hidden onChange={(e) => void project.handleProjectLoad(e, assets)} />
      <input ref={characterInputRef} type="file" accept=".glb,.gltf,.fbx" hidden onChange={(e) => void assets.handleCharacterImport(e)} />
      <input ref={animationInputRef} type="file" accept=".glb,.gltf,.fbx" multiple hidden onChange={(e) => void assets.handleAnimationImport(e)} />

      <div ref={workspaceRef} className="relative min-h-0 flex-1 overflow-hidden">
        {editorView === "clip" ? (
          <ClipEditorWorkspace
            store={store}
            character={assets.character}
            importedClips={assets.importedClips}
            selectedClipId={assets.selectedClipId}
            assetStatus={assets.assetStatus}
            assetError={assets.assetError}
            onImportAnimations={() => animationInputRef.current?.click()}
            onDropAnimationFiles={(files) => {
              void assets.importAnimationFileList(files);
            }}
            onSelectClip={assets.setSelectedClipId}
            onUpdateClip={assets.updateImportedClip}
            onDeleteClip={assets.deleteImportedClip}
          />
        ) : editorView === "graph" ? (
          <GraphEditorWorkspace
            store={store}
            character={assets.character}
            importedClips={assets.importedClips}
            assetStatus={assets.assetStatus}
            assetError={assets.assetError}
            copilotOpen={copilotOpen}
            workspaceRef={workspaceRef}
          />
        ) : (
          <CharacterWorkspace
            store={store}
            character={assets.character}
            importedClips={assets.importedClips}
            equipment={equipment}
          />
        )}

        {copilotOpen ? (
          <div
            ref={copilotPanelRef}
            className="pointer-events-auto absolute z-20 h-[min(72vh,760px)] w-88 max-w-[calc(100vw-2rem)]"
            style={
              copilotPosition
                ? { left: `${copilotPosition.x}px`, top: `${copilotPosition.y}px` }
                : { right: "1rem", top: "3rem" }
            }
          >
            <CopilotPanel
              onClose={() => setCopilotOpen(false)}
              onSendMessage={(prompt) => void copilot.sendMessage(prompt)}
              onAbort={copilot.abort}
              onClearHistory={copilot.clearHistory}
              onSettingsChanged={copilot.refreshConfigured}
              session={copilot.session}
              isConfigured={copilot.isConfigured}
              onHeaderPointerDown={beginCopilotDrag}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
