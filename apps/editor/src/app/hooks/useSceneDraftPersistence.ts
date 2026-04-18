import { useEffect, useRef, useState } from "react";
import { loadStoredSceneEditorDraft, saveSceneEditorDraft, type StoredSceneEditorDraft } from "@/lib/draft-storage";

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: (deadline: IdleDeadline) => void, options?: { timeout: number }) => number;
};

type PendingSaveHandle =
  | { id: number; kind: "idle" }
  | { id: number; kind: "timeout" };

export function useSceneDraftPersistence({
  buildDraft,
  onRestoreDraft,
  saveKey
}: {
  buildDraft: () => StoredSceneEditorDraft;
  onRestoreDraft: (draft: StoredSceneEditorDraft) => void;
  saveKey: string;
}) {
  const [draftHydrated, setDraftHydrated] = useState(false);
  const buildDraftRef = useRef(buildDraft);
  const latestDraftRef = useRef<StoredSceneEditorDraft | null>(null);
  const onRestoreDraftRef = useRef(onRestoreDraft);
  const pendingDraftRef = useRef(false);
  const pendingSaveHandleRef = useRef<PendingSaveHandle | null>(null);

  buildDraftRef.current = buildDraft;
  onRestoreDraftRef.current = onRestoreDraft;

  const clearPendingSave = () => {
    const pendingSave = pendingSaveHandleRef.current;

    if (!pendingSave) {
      return;
    }

    if (pendingSave.kind === "idle") {
      (window as IdleWindow).cancelIdleCallback?.(pendingSave.id);
    } else {
      window.clearTimeout(pendingSave.id);
    }

    pendingSaveHandleRef.current = null;
  };

  const persistDraft = () => {
    const draft = buildDraftRef.current();

    latestDraftRef.current = draft;
    pendingDraftRef.current = false;

    void saveSceneEditorDraft(draft).catch((error) => {
      console.warn("Failed to save the Trident draft.", error);
    });
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const draft = await loadStoredSceneEditorDraft();

        if (!draft || cancelled) {
          return;
        }

        onRestoreDraftRef.current(draft);
      } catch (error) {
        console.warn("Failed to restore the Trident draft.", error);
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    pendingDraftRef.current = true;
    clearPendingSave();

    const idleWindow = window as IdleWindow;

    if (typeof idleWindow.requestIdleCallback === "function") {
      pendingSaveHandleRef.current = {
        id: idleWindow.requestIdleCallback(() => {
          pendingSaveHandleRef.current = null;
          persistDraft();
        }, { timeout: 2000 }),
        kind: "idle"
      };
    } else {
      pendingSaveHandleRef.current = {
        id: window.setTimeout(() => {
          pendingSaveHandleRef.current = null;
          persistDraft();
        }, 1200),
        kind: "timeout"
      };
    }

    return () => {
      clearPendingSave();
    };
  }, [draftHydrated, saveKey]);

  useEffect(() => {
    return () => {
      clearPendingSave();

      if (pendingDraftRef.current) {
        persistDraft();
      }
    };
  }, []);

  return {
    draftHydrated
  };
}
