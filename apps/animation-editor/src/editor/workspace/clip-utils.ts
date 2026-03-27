import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import type { ClipReference, EditorGraphNode, SerializableRig } from "@ggez/anim-schema";
import type { ImportedPreviewClip } from "../preview-assets";

export function normalizeClipKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isClipNode(node: EditorGraphNode): node is Extract<EditorGraphNode, { kind: "clip" }> {
  return node.kind === "clip";
}

export function reconcileImportedClips(importedClips: ImportedPreviewClip[], documentClips: ClipReference[]): ImportedPreviewClip[] {
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

export function upsertClipReferences(store: AnimationEditorStore, clips: ClipReference[]) {
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

export function autoBindClipNodes(store: AnimationEditorStore, clips: ImportedPreviewClip[]) {
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

export function applyImportedRig(store: AnimationEditorStore, rig: SerializableRig) {
  if (typeof store.setRig === "function") {
    store.setRig(rig);
  }
}
