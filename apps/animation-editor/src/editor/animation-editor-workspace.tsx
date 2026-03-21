import "@xyflow/react/dist/style.css";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { createAnimationArtifact, serializeAnimationArtifact } from "@ggez/anim-exporter";
import type { ClipReference, EditorGraphNode, SerializableRig } from "@ggez/anim-schema";
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

function normalizeClipKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isClipNode(node: EditorGraphNode): node is Extract<EditorGraphNode, { kind: "clip" }> {
  return node.kind === "clip";
}

function reconcileImportedClips(importedClips: ImportedPreviewClip[], documentClips: ClipReference[]): ImportedPreviewClip[] {
  const availableDocumentIds = new Set(documentClips.map((clip) => clip.id));
  const matchedDocumentIds = new Set<string>();

  return importedClips.map((clip) => {
    const matchingDocumentClip = documentClips.find((documentClip) => {
      if (matchedDocumentIds.has(documentClip.id)) {
        return false;
      }

      return normalizeClipKey(documentClip.id) === normalizeClipKey(clip.id) || normalizeClipKey(documentClip.name) === normalizeClipKey(clip.name);
    });

    if (!matchingDocumentClip || !availableDocumentIds.has(matchingDocumentClip.id)) {
      return clip;
    }

    matchedDocumentIds.add(matchingDocumentClip.id);

    return {
      ...clip,
      id: matchingDocumentClip.id,
      asset: {
        ...clip.asset,
        id: matchingDocumentClip.id,
        name: matchingDocumentClip.name,
      },
      reference: {
        ...clip.reference,
        id: matchingDocumentClip.id,
        name: matchingDocumentClip.name,
      },
    };
  });
}

function upsertClipReferences(store: AnimationEditorStore, clips: ClipReference[]) {
  if (typeof store.upsertClips === "function") {
    store.upsertClips(clips);
    return;
  }

  const existingClipIds = new Set(store.getState().document.clips.map((clip) => clip.id));

  for (const clip of clips) {
    if (existingClipIds.has(clip.id)) {
      store.updateClip(clip.id, clip);
      continue;
    }

    store.addClip(clip);
  }
}

function autoBindClipNodes(store: AnimationEditorStore, clips: ImportedPreviewClip[]) {
  const state = store.getState();
  const clipsByKey = new Map<string, ImportedPreviewClip>();

  clips.forEach((clip) => {
    const idKey = normalizeClipKey(clip.id);
    const nameKey = normalizeClipKey(clip.name);
    if (!clipsByKey.has(idKey)) {
      clipsByKey.set(idKey, clip);
    }
    if (!clipsByKey.has(nameKey)) {
      clipsByKey.set(nameKey, clip);
    }
  });

  state.document.graphs.forEach((graph) => {
    graph.nodes.forEach((node) => {
      if (!isClipNode(node)) {
        return;
      }

      const matchedClip = clipsByKey.get(normalizeClipKey(node.name)) ?? (node.clipId ? clipsByKey.get(normalizeClipKey(node.clipId)) : undefined);
      if (!matchedClip || node.clipId === matchedClip.id) {
        return;
      }

      store.updateNode(graph.id, node.id, (current) => {
        if (!isClipNode(current)) {
          return current;
        }

        return {
          ...current,
          clipId: matchedClip.id,
        };
      });
    });
  });
}

function applyImportedRig(store: AnimationEditorStore, rig: SerializableRig) {
  if (typeof store.setRig === "function") {
    store.setRig(rig);
  }
}

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
      const documentClips = store.getState().document.clips;
      const nextCharacter = await importCharacterFile(file, documentClips.map((clip) => clip.id));
      const reconciledClips = reconcileImportedClips(nextCharacter.clips, documentClips);
      setCharacter({
        ...nextCharacter,
        clips: reconciledClips,
      });
      setImportedClips(reconciledClips);
      applyImportedRig(store, nextCharacter.documentRig);
      upsertClipReferences(store, reconciledClips.map((clip) => clip.reference));
      autoBindClipNodes(store, reconciledClips);
      setAssetStatus(`Loaded "${file.name}" with ${nextCharacter.rig.boneNames.length} bones and ${reconciledClips.length} embedded clips.`);
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
      const documentClips = store.getState().document.clips;
      const nextClips = await importAnimationFiles(
        files,
        character.skeleton,
        new Set([...documentClips.map((clip) => clip.id), ...importedClips.map((clip) => clip.id)])
      );
      const reconciledClips = reconcileImportedClips(nextClips, documentClips);
      setImportedClips((current) => {
        const merged = new Map(current.map((clip) => [clip.id, clip]));
        reconciledClips.forEach((clip) => merged.set(clip.id, clip));
        return Array.from(merged.values());
      });
      upsertClipReferences(store, reconciledClips.map((clip) => clip.reference));
      autoBindClipNodes(store, reconciledClips);
      setAssetStatus(`Imported ${reconciledClips.length} animation clip(s) from ${files.length} file(s).`);
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
