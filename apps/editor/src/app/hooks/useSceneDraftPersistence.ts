import { useEffect, useRef, useState } from "react";
import { loadStoredSceneEditorDraft, saveSceneEditorDraft, type StoredSceneEditorDraft } from "@/lib/draft-storage";

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

  buildDraftRef.current = buildDraft;
  onRestoreDraftRef.current = onRestoreDraft;

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

    latestDraftRef.current = buildDraftRef.current();

    const timeoutId = window.setTimeout(() => {
      void saveSceneEditorDraft(buildDraftRef.current()).catch((error) => {
        console.warn("Failed to save the Trident draft.", error);
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draftHydrated, saveKey]);

  useEffect(() => {
    return () => {
      const draft = latestDraftRef.current;

      if (!draft) {
        return;
      }

      void saveSceneEditorDraft(draft).catch((error) => {
        console.warn("Failed to flush the Trident draft on unload.", error);
      });
    };
  }, []);

  return {
    draftHydrated
  };
}
