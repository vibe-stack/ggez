import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  HIGH_MODEL_LOD_LEVEL,
  type SceneSettings,
  type WorldLodLevelDefinition
} from "@ggez/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { readFileAsDataUrl } from "@/lib/model-assets";
import { BooleanField, ColorField, SectionTitle, ToolSection, TransformGroup } from "./InspectorFields";

function inferSkyboxFormat(file: File): SceneSettings["world"]["skybox"]["format"] {
  return file.name.toLowerCase().endsWith(".hdr") ? "hdr" : "image";
}

function slugifyLodLevelId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lod"
  );
}

export function WorldSettingsPanel({
  onUpdateSceneSettings,
  sceneSettings
}: {
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
}) {
  const [draftWorldSettings, setDraftWorldSettings] = useState(() =>
    structuredClone(sceneSettings.world)
  );
  const draftWorldSettingsRef = useRef(draftWorldSettings);
  const sceneSettingsRef = useRef(sceneSettings);

  sceneSettingsRef.current = sceneSettings;

  const setDraftWorldSettingsState = (
    value:
      | SceneSettings["world"]
      | ((current: SceneSettings["world"]) => SceneSettings["world"])
  ) => {
    setDraftWorldSettings((current) => {
      const next = typeof value === "function" ? value(current) : value;
      draftWorldSettingsRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    const next = structuredClone(sceneSettings.world);
    draftWorldSettingsRef.current = next;
    setDraftWorldSettings(next);
  }, [sceneSettings]);

  const commitWorldSettings = () => {
    const current = sceneSettingsRef.current;
    onUpdateSceneSettings(
      { ...current, world: structuredClone(draftWorldSettingsRef.current) },
      current
    );
  };

  const commitWorldSettingsDraft = (nextWorldSettings: SceneSettings["world"]) => {
    setDraftWorldSettingsState(nextWorldSettings);
    onUpdateSceneSettings(
      { ...sceneSettingsRef.current, world: structuredClone(nextWorldSettings) },
      sceneSettingsRef.current
    );
  };

  const handleSkyboxFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const nextSource = await readFileAsDataUrl(file);
    commitWorldSettingsDraft({
      ...draftWorldSettingsRef.current,
      skybox: {
        ...draftWorldSettingsRef.current.skybox,
        enabled: true,
        format: inferSkyboxFormat(file),
        name: file.name,
        source: nextSource
      }
    });
  };

  const handleRemoveSkybox = () => {
    commitWorldSettingsDraft({
      ...draftWorldSettingsRef.current,
      skybox: {
        ...draftWorldSettingsRef.current.skybox,
        enabled: false,
        name: "",
        source: ""
      }
    });
  };

  return (
    <ScrollArea className="h-full pr-1">
      <div className="space-y-4 px-1 pb-1">
        <ToolSection title="Physics">
          <BooleanField
            checked={draftWorldSettings.physicsEnabled}
            label="Physics Enabled"
            onCheckedChange={(checked) =>
              setDraftWorldSettingsState((current) => ({ ...current, physicsEnabled: checked }))
            }
          />
          <TransformGroup
            label="Gravity"
            onCommit={commitWorldSettings}
            onUpdate={(axis, value) =>
              setDraftWorldSettingsState((current) => ({
                ...current,
                gravity: { ...current.gravity, [axis]: value }
              }))
            }
            precision={2}
            step={0.1}
            values={draftWorldSettings.gravity}
          />
          <div className="flex justify-end">
            <Button onClick={commitWorldSettings} size="xs" variant="ghost">
              Save World Settings
            </Button>
          </div>
        </ToolSection>

        <ToolSection title="Ambient">
          <ColorField
            label="Ambient Color"
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({ ...current, ambientColor: value }))
            }
            value={draftWorldSettings.ambientColor}
          />
          <DragInput
            className="w-full"
            compact
            label="Intensity"
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({ ...current, ambientIntensity: value }))
            }
            onValueCommit={commitWorldSettings}
            precision={2}
            step={0.05}
            value={draftWorldSettings.ambientIntensity}
          />
        </ToolSection>

        <ToolSection title="Model LODs">
          {/* LOD enable toggle immediately commits — no separate save required */}
          <BooleanField
            checked={draftWorldSettings.lod.enabled}
            label="Enable Runtime Switching"
            onCheckedChange={(checked) => {
              const next: SceneSettings["world"] = {
                ...draftWorldSettingsRef.current,
                lod: { ...draftWorldSettingsRef.current.lod, enabled: checked }
              };
              commitWorldSettingsDraft(next);
            }}
          />
          {!draftWorldSettings.lod.enabled && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-300/80">
              LOD switching is off — all models render at High quality regardless of distance.
            </div>
          )}
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/60">
            Author explicit mesh tiers in the Assets library. These world settings decide which
            named tiers exist and the distance at which each one takes over.
          </div>
          <div className="space-y-2">
            <div className="rounded-xl border border-white/8 bg-black/16 px-3 py-2 text-[11px] text-foreground/64">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground/76">High</div>
                  <div>Base mesh. Always active at the closest distance.</div>
                </div>
                <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground/52">
                  0m
                </div>
              </div>
            </div>
            {draftWorldSettings.lod.levels.map((level, index) => (
              <div
                className="rounded-xl border border-white/8 bg-black/16 px-3 py-3"
                key={level.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
                    <Input
                      className="h-9 border-white/8 bg-white/5 text-xs"
                      onChange={(event) => {
                        const nextLabel = event.target.value;
                        setDraftWorldSettingsState((current) => ({
                          ...current,
                          lod: {
                            ...current.lod,
                            levels: current.lod.levels.map((entry) =>
                              entry.id === level.id
                                ? {
                                    ...entry,
                                    id: slugifyLodLevelId(nextLabel || entry.id),
                                    label: nextLabel
                                  }
                                : entry
                            )
                          }
                        }));
                      }}
                      value={level.label}
                    />
                    <DragInput
                      className="w-full"
                      compact
                      label="Distance"
                      min={
                        index === 0
                          ? 0.01
                          : draftWorldSettings.lod.levels[index - 1]!.distance + 0.01
                      }
                      onChange={(value) =>
                        setDraftWorldSettingsState((current) => ({
                          ...current,
                          lod: {
                            ...current.lod,
                            levels: current.lod.levels.map((entry, entryIndex) =>
                              entry.id === level.id
                                ? {
                                    ...entry,
                                    distance: Math.max(
                                      entryIndex === 0
                                        ? 0.01
                                        : current.lod.levels[entryIndex - 1]!.distance + 0.01,
                                      value
                                    )
                                  }
                                : entry
                            )
                          }
                        }))
                      }
                      onValueCommit={commitWorldSettings}
                      precision={2}
                      step={1}
                      value={level.distance}
                    />
                  </div>
                  <Button
                    className="text-foreground/62"
                    onClick={() =>
                      setDraftWorldSettingsState((current) => ({
                        ...current,
                        lod: {
                          ...current.lod,
                          levels: current.lod.levels.filter((entry) => entry.id !== level.id)
                        }
                      }))
                    }
                    size="xs"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-2 text-[11px] text-foreground/48">ID: {level.id}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-white/3 px-3 py-2 text-[11px] text-foreground/58">
            <span>Use short names like `mid`, `low`, `ultra-low`.</span>
            <Button
              onClick={() => {
                const nextIndex = draftWorldSettings.lod.levels.length + 1;
                const nextLevel: WorldLodLevelDefinition = {
                  distance: (draftWorldSettings.lod.levels.at(-1)?.distance ?? 24) + 24,
                  id: `lod-${nextIndex}`,
                  label: `LOD ${nextIndex}`
                };
                setDraftWorldSettingsState((current) => ({
                  ...current,
                  lod: { ...current.lod, levels: [...current.lod.levels, nextLevel] }
                }));
              }}
              size="xs"
              variant="ghost"
            >
              Add Level
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={commitWorldSettings} size="xs" variant="ghost">
              Save LOD Settings
            </Button>
          </div>
        </ToolSection>

        <ToolSection title="Skybox">
          <BooleanField
            checked={draftWorldSettings.skybox.enabled}
            label="Enabled"
            onCheckedChange={(checked) =>
              commitWorldSettingsDraft({
                ...draftWorldSettings,
                skybox: { ...draftWorldSettings.skybox, enabled: checked }
              })
            }
          />
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
            HDRs are best when you want image-based lighting. Leave `Affect Lighting` off to use
            the skybox as backdrop only.
          </div>
          <Input
            accept=".hdr,image/*"
            className="h-9 rounded-xl border-white/8 bg-white/5 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:font-medium"
            onChange={(event) => {
              void handleSkyboxFileChange(event);
            }}
            type="file"
          />
          <div className="rounded-xl bg-white/3 px-3 py-2 text-xs text-foreground/72">
            {draftWorldSettings.skybox.name || "No skybox selected"}
          </div>
          <BooleanField
            checked={draftWorldSettings.skybox.affectsLighting}
            label="Affect Lighting"
            onCheckedChange={(checked) =>
              commitWorldSettingsDraft({
                ...draftWorldSettings,
                skybox: { ...draftWorldSettings.skybox, affectsLighting: checked }
              })
            }
          />
          <DragInput
            className="w-full"
            compact
            label="Backdrop Intensity"
            min={0}
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({
                ...current,
                skybox: { ...current.skybox, intensity: Math.max(0, value) }
              }))
            }
            onValueCommit={commitWorldSettings}
            precision={2}
            step={0.05}
            value={draftWorldSettings.skybox.intensity}
          />
          <DragInput
            className="w-full"
            compact
            label="Lighting Intensity"
            min={0}
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({
                ...current,
                skybox: { ...current.skybox, lightingIntensity: Math.max(0, value) }
              }))
            }
            onValueCommit={commitWorldSettings}
            precision={2}
            step={0.05}
            value={draftWorldSettings.skybox.lightingIntensity}
          />
          <DragInput
            className="w-full"
            compact
            label="Blur"
            max={1}
            min={0}
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({
                ...current,
                skybox: { ...current.skybox, blur: Math.max(0, Math.min(1, value)) }
              }))
            }
            onValueCommit={commitWorldSettings}
            precision={2}
            step={0.05}
            value={draftWorldSettings.skybox.blur}
          />
          <div className="flex justify-end gap-2">
            <Button
              disabled={!draftWorldSettings.skybox.source}
              onClick={handleRemoveSkybox}
              size="xs"
              variant="ghost"
            >
              Remove Skybox
            </Button>
            <Button onClick={commitWorldSettings} size="xs" variant="ghost">
              Save Skybox
            </Button>
          </div>
        </ToolSection>

        <ToolSection title="Fog">
          <ColorField
            label="Fog Color"
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({ ...current, fogColor: value }))
            }
            value={draftWorldSettings.fogColor}
          />
          <DragInput
            className="w-full"
            compact
            label="Near"
            min={0}
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({
                ...current,
                fogNear: Math.max(0, Math.min(value, current.fogFar - 0.01))
              }))
            }
            onValueCommit={commitWorldSettings}
            precision={2}
            step={0.5}
            value={draftWorldSettings.fogNear}
          />
          <DragInput
            className="w-full"
            compact
            label="Far"
            min={0.01}
            onChange={(value) =>
              setDraftWorldSettingsState((current) => ({
                ...current,
                fogFar: Math.max(value, current.fogNear + 0.01)
              }))
            }
            onValueCommit={commitWorldSettings}
            precision={2}
            step={1}
            value={draftWorldSettings.fogFar}
          />
        </ToolSection>
      </div>
    </ScrollArea>
  );
}
