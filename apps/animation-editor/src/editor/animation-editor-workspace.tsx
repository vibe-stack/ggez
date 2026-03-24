import "@xyflow/react/dist/style.css";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { parseAnimationEditorDocument, type ClipReference, type EditorGraphNode, type SerializableRig } from "@ggez/anim-schema";
import { slugifyProjectName } from "@ggez/dev-sync";
import type { ChangeEvent } from "react";
import { ArrowDownRight, GripHorizontal } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotPanel } from "./copilot/CopilotPanel";
import { useCopilot } from "./hooks/use-copilot";
import { useGameConnection } from "./hooks/use-game-connection";
import { AnimationPreviewPanel } from "./animation-preview-panel";
import { ClipEditorWorkspace } from "./clip-editor-workspace";
import { importAnimationFiles, importCharacterFile, type ImportedCharacterAsset, type ImportedPreviewClip } from "./preview-assets";
import { createProjectBundleJson, parseProjectBundleJson } from "./project-bundle";
import { createRuntimeBundleSyncResult, createRuntimeBundleZip } from "./runtime-bundle";
import { useEditorStoreValue } from "./use-editor-store-value";
import { EditorMenubar } from "./workspace/editor-menubar";
import { GameConnectionControl } from "./workspace/game-connection-control";
import { GraphCanvas } from "./workspace/graph-canvas";
import { LeftSidebar } from "./workspace/left-sidebar";
import { RightSidebar } from "./workspace/right-sidebar";
import { StateMachineCanvas } from "./workspace/state-machine-canvas";
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

type PreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FloatingPanelPosition = {
  x: number;
  y: number;
};

const COPILOT_PANEL_DEFAULT_X_OFFSET = 16;
const COPILOT_PANEL_DEFAULT_Y_OFFSET = 48;
const COPILOT_PANEL_FALLBACK_WIDTH = 352;
const COPILOT_PANEL_FALLBACK_HEIGHT = 560;

function clampPreviewRect(rect: PreviewRect, bounds: { width: number; height: number }): PreviewRect {
  const width = Math.min(Math.max(rect.width, 360), Math.max(bounds.width - 32, 360));
  const height = Math.min(Math.max(rect.height, 280), Math.max(bounds.height - 32, 280));

  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 16), Math.max(bounds.width - width - 16, 16)),
    y: Math.min(Math.max(rect.y, 16), Math.max(bounds.height - height - 16, 16)),
  };
}

function clampFloatingPanelPosition(position: FloatingPanelPosition, panelSize: { width: number; height: number }, bounds: { width: number; height: number }): FloatingPanelPosition {
  return {
    x: Math.min(Math.max(position.x, 16), Math.max(bounds.width - panelSize.width - 16, 16)),
    y: Math.min(Math.max(position.y, 16), Math.max(bounds.height - panelSize.height - 16, 16)),
  };
}

export function AnimationEditorWorkspace(props: { store: AnimationEditorStore }) {
  const { store } = props;
  const state = useEditorStoreValue(store, () => store.getState(), ["document", "selection", "compile", "clipboard"]);
  const graph = useSelectedGraph(store);
  const gameConnection = useGameConnection();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [editorView, setEditorView] = useState<"clip" | "graph">("clip");
  const [character, setCharacter] = useState<ImportedCharacterAsset | null>(null);
  const [importedClips, setImportedClips] = useState<ImportedPreviewClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [characterSourceFile, setCharacterSourceFile] = useState<File | null>(null);
  const [assetStatus, setAssetStatus] = useState("Import a rigged character to unlock preview and rig-aware compilation.");
  const [assetError, setAssetError] = useState<string | null>(null);
  const [openedStateMachineNodeId, setOpenedStateMachineNodeId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(() => store.getState().document.name || "Untitled Animation");
  const [projectSlug, setProjectSlug] = useState(() => slugifyProjectName(store.getState().document.name || "Untitled Animation"));
  const [projectSlugDirty, setProjectSlugDirty] = useState(false);
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const animationInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const copilotPanelRef = useRef<HTMLDivElement | null>(null);
  const previewDragRef = useRef<
    | {
        mode: "move" | "resize";
        pointerX: number;
        pointerY: number;
        rect: PreviewRect;
      }
    | null
  >(null);
  const copilotDragRef = useRef<
    | {
        pointerX: number;
        pointerY: number;
        position: FloatingPanelPosition;
      }
    | null
  >(null);
  const [previewRect, setPreviewRect] = useState<PreviewRect>({ x: 16, y: 16, width: 440, height: 420 });
  const [copilotPosition, setCopilotPosition] = useState<FloatingPanelPosition | null>(null);
  const importedClipsRef = useRef(importedClips);
  const resolvedProjectName = projectName.trim() || state.document.name.trim() || "Untitled Animation";
  const resolvedProjectSlug = slugifyProjectName(projectSlug.trim() || resolvedProjectName);

  useEffect(() => {
    importedClipsRef.current = importedClips;
  }, [importedClips]);

  const copilot = useCopilot(store, {
    createImportedClip,
    requestAnimationPush: (options) => {
      void handlePushAnimationToGame(options).catch(() => {});
    },
    getImportedClips: () => importedClipsRef.current,
    updateImportedClip
  });

  function handleConnect(connection: { source: string | null; target: string | null }) {
    if (!connection.source || !connection.target) {
      return;
    }

    store.connectNodes(graph.id, connection.source, connection.target);
  }

  function handleCompile() {
    store.compile();
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
      setCharacterSourceFile(file);
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

    await importAnimationFileList(files);
  }

  async function importAnimationFileList(files: File[]) {
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
        character.rig,
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

  function updateImportedClip(clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) {
    let nextClip: ImportedPreviewClip | null = null;
    let nextDuration: number | null = null;
    let nextName: string | null = null;
    let nextSource: string | undefined;

    setImportedClips((current) =>
      current.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        nextClip = updater(clip);
        nextDuration = nextClip.reference.duration;
        nextName = nextClip.reference.name;
        nextSource = nextClip.reference.source;
        return nextClip;
      })
    );

    setCharacter((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        clips: current.clips.map((clip) => {
          if (clip.id !== clipId) {
            return clip;
          }

          return nextClip ?? clip;
        }),
      };
    });

    if (nextDuration !== null && nextName !== null) {
      store.updateClip(clipId, {
        duration: nextDuration,
        name: nextName,
        source: nextSource,
      });
    }
  }

  function createImportedClip(clip: ImportedPreviewClip, options?: { select?: boolean }) {
    setImportedClips((current) => [...current, clip]);

    setCharacter((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        clips: [...current.clips, clip],
      };
    });

    store.addClip(clip.reference);

    if (options?.select) {
      setSelectedClipId(clip.id);
      setEditorView("clip");
    }

    setAssetError(null);
    setAssetStatus(`Created clip "${clip.name}".`);
  }

  async function handleSaveProject() {
    try {
      setAssetError(null);
      setAssetStatus("Saving project bundle...");
      const editorDocument = parseAnimationEditorDocument(store.getState().document);
      const json = await createProjectBundleJson({
        document: editorDocument,
        characterFile: characterSourceFile,
        clips: importedClips.map((clip) => clip.asset)
      });
      const fileName = `${editorDocument.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "animation-graph"}.ggezanimproj.json`;
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAssetStatus(`Saved project bundle as "${fileName}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save project bundle.";
      setAssetError(message);
      setAssetStatus("Project save failed.");
    }
  }

  async function handleExportRuntimeBundle() {
    try {
      setAssetError(null);
      setAssetStatus("Exporting runtime bundle...");
      const result = await createRuntimeBundleZip({
        characterFile: characterSourceFile,
        importedClips,
        sourceDocument: store.getState().document
      });
      const zipBytes = new Uint8Array(result.bytes.byteLength);
      zipBytes.set(result.bytes);
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAssetStatus(`Exported runtime bundle as "${result.fileName}" with folder animations/${result.folderName}/.`);
    } catch (error) {
      console.error("Runtime bundle export failed.", error);
      const message = error instanceof Error ? error.message : "Failed to export runtime bundle.";
      setAssetError(message);
      setAssetStatus("Runtime bundle export failed.");
    }
  }

  function handleProjectNameChange(value: string) {
    const previousAutoSlug = slugifyProjectName(projectName);
    setProjectName(value);

    if (!projectSlugDirty || projectSlug === previousAutoSlug) {
      setProjectSlug(slugifyProjectName(value));
      setProjectSlugDirty(false);
    }
  }

  function handleProjectSlugChange(value: string) {
    setProjectSlug(slugifyProjectName(value));
    setProjectSlugDirty(true);
  }

  async function handlePushAnimationToGame(options?: {
    gameId?: string;
    projectName?: string;
    projectSlug?: string;
  }) {
    const nextProjectName = options?.projectName?.trim() || resolvedProjectName;
    const nextProjectSlug = slugifyProjectName(
      options?.projectSlug?.trim() || options?.projectName?.trim() || resolvedProjectSlug || nextProjectName
    );

    if (options?.projectName) {
      setProjectName(nextProjectName);
      if (!options.projectSlug) {
        setProjectSlug(nextProjectSlug);
        setProjectSlugDirty(false);
      }
    }

    if (options?.projectSlug) {
      setProjectSlug(nextProjectSlug);
      setProjectSlugDirty(true);
    }

    try {
      setAssetError(null);
      setAssetStatus(`Pushing animation bundle to ${gameConnection.activeGame?.name ?? "connected game"}...`);
      const bundle = await createRuntimeBundleSyncResult({
        characterFile: characterSourceFile,
        folderName: nextProjectSlug,
        importedClips,
        sourceDocument: store.getState().document,
        title: nextProjectName
      });

      const result = await gameConnection.pushAnimation({
        bundle: {
          files: bundle.files
        },
        gameId: options?.gameId ?? gameConnection.activeGame?.id,
        metadata: {
          projectName: nextProjectName,
          projectSlug: nextProjectSlug
        }
      });

      setAssetStatus(`Pushed animation bundle to ${result.animationPath} in ${result.game.name}.`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to push animation bundle to game.";
      setAssetError(message);
      setAssetStatus("Animation sync failed.");
      throw error;
    }
  }

  async function handleProjectLoad(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Loading project "${file.name}"...`);
      const loaded = await parseProjectBundleJson(await file.text());
      store.setDocument(loaded.document);

      const clipReferencesById = new Map(loaded.document.clips.map((clip) => [clip.id, clip]));
      let nextCharacter: ImportedCharacterAsset | null = null;

      if (loaded.characterFile) {
        const importedCharacter = await importCharacterFile(loaded.characterFile, []);
        nextCharacter = {
          ...importedCharacter,
          documentRig: loaded.document.rig ?? importedCharacter.documentRig,
          clips: []
        };
      }

      const restoredClips: ImportedPreviewClip[] = loaded.clips.map((asset) => {
        const reference = clipReferencesById.get(asset.id) ?? {
          id: asset.id,
          name: asset.name,
          duration: asset.duration,
          source: undefined
        };

        return {
          id: asset.id,
          name: reference.name,
          duration: reference.duration,
          source: reference.source ?? "project-bundle",
          asset,
          reference
        };
      });

      if (nextCharacter) {
        nextCharacter = {
          ...nextCharacter,
          clips: restoredClips
        };
      }

      setCharacter(nextCharacter);
      setCharacterSourceFile(loaded.characterFile);
      setImportedClips(restoredClips);
      setProjectName(loaded.document.name || "Untitled Animation");
      setProjectSlug(slugifyProjectName(loaded.document.name || "Untitled Animation"));
      setProjectSlugDirty(false);
      setAssetStatus(`Loaded project "${file.name}" with ${loaded.document.graphs.length} graph(s) and ${restoredClips.length} clip asset(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load project bundle.";
      setAssetError(message);
      setAssetStatus("Project load failed.");
    }
  }

  const updatePreviewBounds = useCallback(() => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setPreviewRect((current) => {
      const nextRect = current.y === 16 && current.x === 16 ? { ...current, y: Math.max(bounds.height - current.height - 16, 16) } : current;
      return clampPreviewRect(nextRect, { width: bounds.width, height: bounds.height });
    });
  }, []);

  const updateCopilotBounds = useCallback(() => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const panelBounds = copilotPanelRef.current?.getBoundingClientRect();
    const panelSize = {
      width: panelBounds?.width ?? COPILOT_PANEL_FALLBACK_WIDTH,
      height: panelBounds?.height ?? COPILOT_PANEL_FALLBACK_HEIGHT,
    };

    setCopilotPosition((current) => {
      const nextPosition =
        current ?? {
          x: Math.max(bounds.width - panelSize.width - COPILOT_PANEL_DEFAULT_X_OFFSET, 16),
          y: COPILOT_PANEL_DEFAULT_Y_OFFSET,
        };

      return clampFloatingPanelPosition(nextPosition, panelSize, { width: bounds.width, height: bounds.height });
    });
  }, []);

  useEffect(() => {
    updatePreviewBounds();
  }, [updatePreviewBounds]);

  useEffect(() => {
    if (!copilotOpen) {
      return;
    }

    updateCopilotBounds();
  }, [copilotOpen, updateCopilotBounds]);

  useEffect(() => {
    if (importedClips.length === 0) {
      if (selectedClipId) {
        setSelectedClipId("");
      }
      return;
    }

    if (!selectedClipId || !importedClips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(importedClips[0]!.id);
    }
  }, [importedClips, selectedClipId]);

  const openedStateMachineNode =
    openedStateMachineNodeId
      ? graph.nodes.find((node): node is Extract<EditorGraphNode, { kind: "stateMachine" }> => node.id === openedStateMachineNodeId && node.kind === "stateMachine") ?? null
      : null;

  useEffect(() => {
    if (!openedStateMachineNodeId) {
      return;
    }

    const existsInGraph = graph.nodes.some((node) => node.id === openedStateMachineNodeId && node.kind === "stateMachine");
    if (!existsInGraph) {
      setOpenedStateMachineNodeId(null);
    }
  }, [graph.nodes, openedStateMachineNodeId]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePreviewBounds();
      if (copilotOpen) {
        updateCopilotBounds();
      }
    });
    resizeObserver.observe(element);

    const copilotElement = copilotPanelRef.current;
    if (copilotOpen && copilotElement) {
      resizeObserver.observe(copilotElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [copilotOpen, updateCopilotBounds, updatePreviewBounds]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = previewDragRef.current;
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!interaction || !bounds) {
        return;
      }

      const deltaX = event.clientX - interaction.pointerX;
      const deltaY = event.clientY - interaction.pointerY;

      if (interaction.mode === "move") {
        setPreviewRect(
          clampPreviewRect(
            {
              ...interaction.rect,
              x: interaction.rect.x + deltaX,
              y: interaction.rect.y + deltaY,
            },
            { width: bounds.width, height: bounds.height }
          )
        );
        return;
      }

      setPreviewRect(
        clampPreviewRect(
          {
            ...interaction.rect,
            width: interaction.rect.width + deltaX,
            height: interaction.rect.height + deltaY,
          },
          { width: bounds.width, height: bounds.height }
        )
      );
    }

    function handlePointerUp() {
      previewDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [previewRect]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = copilotDragRef.current;
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!interaction || !bounds) {
        return;
      }

      const panelBounds = copilotPanelRef.current?.getBoundingClientRect();
      const panelSize = {
        width: panelBounds?.width ?? COPILOT_PANEL_FALLBACK_WIDTH,
        height: panelBounds?.height ?? COPILOT_PANEL_FALLBACK_HEIGHT,
      };
      const deltaX = event.clientX - interaction.pointerX;
      const deltaY = event.clientY - interaction.pointerY;

      setCopilotPosition(
        clampFloatingPanelPosition(
          {
            x: interaction.position.x + deltaX,
            y: interaction.position.y + deltaY,
          },
          panelSize,
          { width: bounds.width, height: bounds.height }
        )
      );
    }

    function handlePointerUp() {
      copilotDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function beginPreviewInteraction(mode: "move" | "resize", event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    previewDragRef.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rect: previewRect,
    };
  }

  function beginCopilotDrag(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }

    const bounds = workspaceRef.current?.getBoundingClientRect();
    const panelBounds = copilotPanelRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fallbackPosition = {
      x: Math.max(bounds.width - (panelBounds?.width ?? COPILOT_PANEL_FALLBACK_WIDTH) - COPILOT_PANEL_DEFAULT_X_OFFSET, 16),
      y: COPILOT_PANEL_DEFAULT_Y_OFFSET,
    };

    copilotDragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      position: copilotPosition ?? fallbackPosition,
    };
  }

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
            onProjectNameChange={handleProjectNameChange}
            onProjectSlugChange={handleProjectSlugChange}
            onPushAnimation={() => {
              void handlePushAnimationToGame();
            }}
            onRefresh={gameConnection.refresh}
            onSelectGame={gameConnection.setSelectedGameId}
            projectName={projectName}
            projectSlug={resolvedProjectSlug}
            selectedGameId={gameConnection.selectedGameId}
          />
        }
        onCompile={handleCompile}
        onChangeEditorView={setEditorView}
        onExportRuntimeBundle={() => void handleExportRuntimeBundle()}
        onSaveProject={() => void handleSaveProject()}
        onLoadProject={() => projectInputRef.current?.click()}
        onImportCharacter={() => characterInputRef.current?.click()}
        onImportAnimations={() => animationInputRef.current?.click()}
        onAddNode={(kind) => store.addNode(graph.id, kind)}
        onToggleCopilot={() => setCopilotOpen((current) => !current)}
        copilotOpen={copilotOpen}
      />

      <input ref={projectInputRef} type="file" accept=".json,.ggezanimproj.json" hidden onChange={handleProjectLoad} />
      <input ref={characterInputRef} type="file" accept=".glb,.gltf,.fbx" hidden onChange={handleCharacterImport} />
      <input ref={animationInputRef} type="file" accept=".glb,.gltf,.fbx" multiple hidden onChange={handleAnimationImport} />

      <div ref={workspaceRef} className="relative min-h-0 flex-1 overflow-hidden">
        {editorView === "clip" ? (
          <ClipEditorWorkspace
            store={store}
            character={character}
            importedClips={importedClips}
            selectedClipId={selectedClipId}
            assetStatus={assetStatus}
            assetError={assetError}
            onImportAnimations={() => animationInputRef.current?.click()}
            onDropAnimationFiles={(files) => {
              void importAnimationFileList(files);
            }}
            onSelectClip={setSelectedClipId}
            onUpdateClip={updateImportedClip}
          />
        ) : (
          <>
            {openedStateMachineNode ? (
              <StateMachineCanvas
                store={store}
                graph={graph}
                node={openedStateMachineNode}
                parameters={state.document.parameters}
                onExit={() => setOpenedStateMachineNodeId(null)}
              />
            ) : (
              <GraphCanvas
                graph={graph}
                selectedNodeIds={state.selection.nodeIds}
                onConnect={handleConnect}
                onSelectionChange={(nodeIds) => store.selectNodes(nodeIds)}
                onOpenStateMachine={(nodeId) => setOpenedStateMachineNodeId(nodeId)}
                onNodeDragStop={(nodeId, position) =>
                  store.moveNodes(graph.id, {
                    [nodeId]: position,
                  })
                }
                onAddNode={(kind, position) => {
                  const nodeId = store.addNode(graph.id, kind);
                  store.moveNodes(graph.id, { [nodeId]: position });
                }}
                onDeleteNodes={() => store.deleteSelectedNodes()}
                onDeleteEdges={(edgeIds) => store.deleteEdges(graph.id, edgeIds)}
              />
            )}
          </>
        )}

        <div className="pointer-events-none absolute inset-0">
          {editorView === "graph" ? (
            <div className="pointer-events-auto absolute top-12 left-4 z-20 h-[min(68vh,720px)] w-[320px] max-w-[calc(100vw-2rem)]">
              <LeftSidebar store={store} state={state} characterFileName={character?.fileName} />
            </div>
          ) : null}

          {copilotOpen ? (
            <div
              ref={copilotPanelRef}
              className="pointer-events-auto absolute z-20 h-[min(72vh,760px)] w-88 max-w-[calc(100vw-2rem)]"
              style={
                copilotPosition
                  ? {
                      left: `${copilotPosition.x}px`,
                      top: `${copilotPosition.y}px`,
                    }
                  : {
                      right: "1rem",
                      top: "3rem",
                    }
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

          {editorView === "graph" ? (
            <>
              <div className="pointer-events-auto absolute top-12 right-4 z-20 h-[min(72vh,760px)] w-72 max-w-[calc(100vw-2rem)]" style={copilotOpen ? { right: "calc(22rem + 2rem)" } : undefined}>
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
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
