import { useEffect, useMemo, useState } from "react";
import type { DevSyncGameRegistration, EditorFileMetadata } from "@ggez/dev-sync";

type EditorSyncPushResponse = {
  game: DevSyncGameRegistration;
  projectName: string;
  projectSlug: string;
  sceneDir: string;
  scenePath: string;
};

type PushSceneOptions = {
  bundle: {
    files: Array<{
      bytes: number[];
      mimeType: string;
      path: string;
    }>;
    manifest: unknown;
  };
  forceSwitch?: boolean;
  gameId?: string;
  metadata: EditorFileMetadata;
};

export function useGameConnection() {
  const [games, setGames] = useState<DevSyncGameRegistration[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string>();
  const [lastPush, setLastPush] = useState<EditorSyncPushResponse>();
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer = 0;

    const refresh = async () => {
      try {
        const response = await fetch("/api/editor-sync/games");

        if (!response.ok) {
          throw new Error("Failed to load live game connections.");
        }

        const payload = await response.json() as {
          games?: DevSyncGameRegistration[];
        };

        if (disposed) {
          return;
        }

        setGames(payload.games ?? []);
        setError(undefined);
      } catch (refreshError) {
        if (!disposed) {
          setError(refreshError instanceof Error ? refreshError.message : "Failed to load live game connections.");
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
          timer = window.setTimeout(() => {
            void refresh();
          }, 2000);
        }
      }
    };

    void refresh();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [refreshToken]);

  useEffect(() => {
    if (games.length === 0) {
      setSelectedGameId(undefined);
      return;
    }

    if (!selectedGameId || !games.some((game) => game.id === selectedGameId)) {
      setSelectedGameId(games[0]?.id);
    }
  }, [games, selectedGameId]);

  const activeGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? games[0],
    [games, selectedGameId]
  );

  const pushScene = async (options: PushSceneOptions) => {
    setIsPushing(true);

    try {
      const response = await fetch("/api/editor-sync/push", {
        body: JSON.stringify(options),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json() as EditorSyncPushResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to push scene to game.");
      }

      setLastPush(payload);
      setError(undefined);
      setRefreshToken((current) => current + 1);

      // Signal the orchestrator (if this editor is running inside one) to switch
      // to the game view so the user sees the result immediately.
      if (options?.forceSwitch) {
        window.parent.postMessage({
          type: "wh-orchestrator:switch-view",
          sceneId: options.metadata.projectSlug,
          view: "game"
        }, "*");
      }

      return payload;
    } catch (pushError) {
      const message = pushError instanceof Error ? pushError.message : "Failed to push scene to game.";
      setError(message);
      throw pushError;
    } finally {
      setIsPushing(false);
    }
  };

  return {
    activeGame,
    error,
    games,
    isLoading,
    isPushing,
    lastPush,
    pushScene,
    refresh: () => {
      setIsLoading(true);
      setRefreshToken((current) => current + 1);
    },
    selectedGameId,
    setSelectedGameId
  };
}
