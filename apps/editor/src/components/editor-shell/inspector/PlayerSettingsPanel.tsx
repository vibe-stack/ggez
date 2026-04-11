import { useEffect, useRef, useState } from "react";
import type { SceneSettings } from "@ggez/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BooleanField, InteractKeyField, NumberField, ToolSection } from "./InspectorFields";

export function PlayerSettingsPanel({
  onUpdateSceneSettings,
  sceneSettings
}: {
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
}) {
  const [draftPlayerSettings, setDraftPlayerSettings] = useState(() =>
    structuredClone(sceneSettings.player)
  );
  const draftPlayerSettingsRef = useRef(draftPlayerSettings);
  const sceneSettingsRef = useRef(sceneSettings);

  sceneSettingsRef.current = sceneSettings;

  const setDraftPlayerSettingsState = (
    value:
      | SceneSettings["player"]
      | ((current: SceneSettings["player"]) => SceneSettings["player"])
  ) => {
    setDraftPlayerSettings((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftPlayerSettingsRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    const next = structuredClone(sceneSettings.player);
    draftPlayerSettingsRef.current = next;
    setDraftPlayerSettings(next);
  }, [sceneSettings]);

  const commitPlayerSettings = () => {
    const current = sceneSettingsRef.current;
    onUpdateSceneSettings(
      { ...current, player: structuredClone(draftPlayerSettingsRef.current) },
      current
    );
  };

  return (
    <ScrollArea className="h-full pr-1">
      <div className="space-y-4 px-1 pb-1">
        <ToolSection title="Camera">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["fps", "FPS"],
                ["third-person", "3rd Person"],
                ["top-down", "Top Down"]
              ] as const
            ).map(([value, label]) => (
              <Button
                className={cn(
                  draftPlayerSettings.cameraMode === value && "bg-emerald-500/18 text-emerald-200"
                )}
                key={value}
                onClick={() => {
                  setDraftPlayerSettingsState((current) => ({ ...current, cameraMode: value }));
                  onUpdateSceneSettings(
                    {
                      ...sceneSettings,
                      player: { ...sceneSettings.player, cameraMode: value }
                    },
                    sceneSettings
                  );
                }}
                size="xs"
                variant="ghost"
              >
                {label}
              </Button>
            ))}
          </div>
        </ToolSection>

        <ToolSection title="Movement">
          <DragInput
            className="w-full"
            compact
            label="Height"
            onChange={(value) =>
              setDraftPlayerSettingsState((current) => ({ ...current, height: value }))
            }
            onValueCommit={commitPlayerSettings}
            precision={2}
            step={0.05}
            value={draftPlayerSettings.height}
          />
          <DragInput
            className="w-full"
            compact
            label="Move Speed"
            onChange={(value) =>
              setDraftPlayerSettingsState((current) => ({ ...current, movementSpeed: value }))
            }
            onValueCommit={commitPlayerSettings}
            precision={2}
            step={0.1}
            value={draftPlayerSettings.movementSpeed}
          />
          <BooleanField
            checked={draftPlayerSettings.canRun}
            label="Allow Run"
            onCheckedChange={(checked) => {
              const next = { ...draftPlayerSettings, canRun: checked };
              setDraftPlayerSettingsState(next);
              onUpdateSceneSettings(
                { ...sceneSettings, player: next },
                sceneSettings
              );
            }}
          />
          <DragInput
            className="w-full"
            compact
            label="Run Speed"
            onChange={(value) =>
              setDraftPlayerSettingsState((current) => ({ ...current, runningSpeed: value }))
            }
            onValueCommit={commitPlayerSettings}
            precision={2}
            step={0.1}
            value={draftPlayerSettings.runningSpeed}
          />
        </ToolSection>

        <ToolSection title="Traversal">
          <BooleanField
            checked={draftPlayerSettings.canJump}
            label="Allow Jump"
            onCheckedChange={(checked) => {
              const next = { ...draftPlayerSettings, canJump: checked };
              setDraftPlayerSettingsState(next);
              onUpdateSceneSettings({ ...sceneSettings, player: next }, sceneSettings);
            }}
          />
          <DragInput
            className="w-full"
            compact
            label="Jump Height"
            onChange={(value) =>
              setDraftPlayerSettingsState((current) => ({ ...current, jumpHeight: value }))
            }
            onValueCommit={commitPlayerSettings}
            precision={2}
            step={0.05}
            value={draftPlayerSettings.jumpHeight}
          />
          <BooleanField
            checked={draftPlayerSettings.canCrouch}
            label="Allow Crouch"
            onCheckedChange={(checked) => {
              const next = { ...draftPlayerSettings, canCrouch: checked };
              setDraftPlayerSettingsState(next);
              onUpdateSceneSettings({ ...sceneSettings, player: next }, sceneSettings);
            }}
          />
          <DragInput
            className="w-full"
            compact
            label="Crouch Height"
            onChange={(value) =>
              setDraftPlayerSettingsState((current) => ({ ...current, crouchHeight: value }))
            }
            onValueCommit={commitPlayerSettings}
            precision={2}
            step={0.05}
            value={draftPlayerSettings.crouchHeight}
          />
        </ToolSection>

        <ToolSection title="Interaction">
          <BooleanField
            checked={draftPlayerSettings.canInteract ?? true}
            label="Allow Interact"
            onCheckedChange={(checked) => {
              const next = { ...draftPlayerSettings, canInteract: checked };
              setDraftPlayerSettingsState(next);
              onUpdateSceneSettings({ ...sceneSettings, player: next }, sceneSettings);
            }}
          />
          <InteractKeyField
            onChange={(code) => {
              const next = { ...draftPlayerSettings, interactKey: code };
              setDraftPlayerSettingsState(next);
              onUpdateSceneSettings({ ...sceneSettings, player: next }, sceneSettings);
            }}
            value={draftPlayerSettings.interactKey ?? "KeyE"}
          />
        </ToolSection>
      </div>
    </ScrollArea>
  );
}
