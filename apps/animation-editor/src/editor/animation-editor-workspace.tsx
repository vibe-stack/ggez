import "@xyflow/react/dist/style.css";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { createAnimationArtifact, serializeAnimationArtifact } from "@ggez/anim-exporter";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { importAnimationFiles, importCharacterFile, type ImportedCharacterAsset, type ImportedPreviewClip } from "./preview-assets";
import { useEditorStoreValue } from "./use-editor-store-value";
import { EditorMenubar } from "./workspace/editor-menubar";
import { GraphCanvas } from "./workspace/graph-canvas";
import { LeftSidebar } from "./workspace/left-sidebar";
import { RightSidebar } from "./workspace/right-sidebar";
import { useSelectedGraph } from "./workspace/use-selected-graph";

export function AnimationEditorWorkspace(props: { store: AnimationEditorStore }) {
  const { store } = props;
  const state = useEditorStoreValue(store, () => store.getState(), ["document", "selection", "compile", "clipboard"]);
  const graph = useSelectedGraph(store);
  const [artifactJson, setArtifactJson] = useState("");
  const [character, setCharacter] = useState<ImportedCharacterAsset | null>(null);
  const [importedClips, setImportedClips] = useState<ImportedPreviewClip[]>([]);
  const [assetStatus, setAssetStatus] = useState("Import a rigged character to unlock preview and rig-aware compilation.");
  const [assetError, setAssetError] = useState<string | null>(null);
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const animationInputRef = useRef<HTMLInputElement | null>(null);

  function handleConnect(connection: { source: string | null; target: string | null }) {
    if (!connection.source || !connection.target) {
      return;
    }

    store.connectNodes(graph.id, connection.source, connection.target);
  }

  function handleCompile() {
    const result = store.compile();
    if (result.graph) {
      setArtifactJson(
        serializeAnimationArtifact(
          createAnimationArtifact({
            graph: result.graph,
          })
        )
      );
      return;
    }

    setArtifactJson("");
  }

  async function handleCharacterImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Importing character "${file.name}"...`);
      const nextCharacter = await importCharacterFile(file, state.document.clips.map((clip) => clip.id));
      setCharacter(nextCharacter);
      setImportedClips(nextCharacter.clips);
      store.setRig(nextCharacter.documentRig);
      store.upsertClips(nextCharacter.clips.map((clip) => clip.reference));
      setAssetStatus(`Loaded "${file.name}" with ${nextCharacter.rig.boneNames.length} bones and ${nextCharacter.clips.length} embedded clips.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import character.";
      setAssetError(message);
      setAssetStatus("Character import failed.");
    }
  }

  async function handleAnimationImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (!character) {
      setAssetError("Import a rigged character first so external animation files can be mapped onto its skeleton.");
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Importing ${files.length} animation file(s)...`);
      const nextClips = await importAnimationFiles(
        files,
        character.skeleton,
        new Set([...state.document.clips.map((clip) => clip.id), ...importedClips.map((clip) => clip.id)])
      );
      setImportedClips((current) => {
        const merged = new Map(current.map((clip) => [clip.id, clip]));
        nextClips.forEach((clip) => merged.set(clip.id, clip));
        return Array.from(merged.values());
      });
      store.upsertClips(nextClips.map((clip) => clip.reference));
      setAssetStatus(`Imported ${nextClips.length} animation clip(s) from ${files.length} file(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import animation files.";
      setAssetError(message);
      setAssetStatus("Animation import failed.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EditorMenubar
        store={store}
        graphName={graph.name}
        diagnosticsCount={state.diagnostics.length}
        clipCount={state.document.clips.length}
        onCompile={handleCompile}
        onImportCharacter={() => characterInputRef.current?.click()}
        onImportAnimations={() => animationInputRef.current?.click()}
        onAddNode={(kind) => store.addNode(graph.id, kind)}
      />

      <input ref={characterInputRef} type="file" accept=".glb,.gltf,.fbx" hidden onChange={handleCharacterImport} />
      <input ref={animationInputRef} type="file" accept=".glb,.gltf,.fbx" multiple hidden onChange={handleAnimationImport} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={24} minSize={18}>
            <LeftSidebar store={store} state={state} />
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-white/8" />

          <ResizablePanel defaultSize={52} minSize={30}>
            <GraphCanvas
              graph={graph}
              selectedNodeIds={state.selection.nodeIds}
              onConnect={handleConnect}
              onSelectionChange={(nodeIds) => store.selectNodes(nodeIds)}
              onNodeDragStop={(nodeId, position) =>
                store.moveNodes(graph.id, {
                  [nodeId]: position,
                })
              }
            />
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-white/8" />

          <ResizablePanel defaultSize={24} minSize={18}>
            <RightSidebar
              store={store}
              state={state}
              character={character}
              importedClips={importedClips}
              assetStatus={assetStatus}
              assetError={assetError}
              artifactJson={artifactJson}
              characterInputRef={characterInputRef}
              animationInputRef={animationInputRef}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
