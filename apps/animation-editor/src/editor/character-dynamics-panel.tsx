import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { createStableId } from "@ggez/anim-utils";
import { GripHorizontal, Plus, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEditorStoreValue } from "./use-editor-store-value";
import { NumericDragInput } from "./workspace/inspector/shared";
import { PropertyField, StudioSection, editorInputClassName, editorSelectClassName, sectionHintClassName } from "./workspace/shared";

type CharacterDynamicsPanelProps = {
  store: AnimationEditorStore;
  characterBoneNames: string[];
  selectedProfileId: string;
  onSelectProfileId: (profileId: string) => void;
  showColliders: boolean;
  onToggleShowColliders: () => void;
  onHeaderPointerDown: (event: ReactPointerEvent) => void;
};

export function CharacterDynamicsPanel(props: CharacterDynamicsPanelProps) {
  const dynamicsProfiles = useEditorStoreValue(props.store, () => props.store.getState().document.dynamicsProfiles, ["document", "dynamics"]);
  const selectedProfile = dynamicsProfiles.find((profile) => profile.id === props.selectedProfileId) ?? dynamicsProfiles[0] ?? null;
  const fallbackBoneName = props.characterBoneNames[0] ?? "";

  const availableBoneNames = useMemo(() => props.characterBoneNames, [props.characterBoneNames]);

  function addProfile() {
    const profileId = props.store.addDynamicsProfile({
      name: `Dynamics ${dynamicsProfiles.length + 1}`,
      iterations: 4,
      chains: [],
      sphereColliders: []
    });
    props.onSelectProfileId(profileId);
  }

  function addChain() {
    if (!selectedProfile || !fallbackBoneName) {
      return;
    }

    props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
      ...profile,
      chains: [
        ...profile.chains,
        {
          id: createStableId("dyn-chain"),
          name: `Chain ${profile.chains.length + 1}`,
          rootBoneName: fallbackBoneName,
          tipBoneName: fallbackBoneName,
          damping: 0.82,
          stiffness: 0.2,
          gravityScale: 0.35,
          inertia: { x: 0.35, y: 0.15, z: 0.5 },
          limitAngleRadians: Math.PI / 3,
          enabled: true
        }
      ]
    }));
  }

  function addSphereCollider() {
    if (!selectedProfile || !fallbackBoneName) {
      return;
    }

    props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
      ...profile,
      sphereColliders: [
        ...profile.sphereColliders,
        {
          id: createStableId("dyn-sphere"),
          name: `Sphere ${profile.sphereColliders.length + 1}`,
          boneName: fallbackBoneName,
          offset: { x: 0, y: 0, z: 0 },
          radius: 0.12,
          enabled: true
        }
      ]
    }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#091012]/84 shadow-[0_28px_96px_rgba(0,0,0,0.5)] ring-1 ring-white/8 backdrop-blur-2xl">
      <div
        className="flex h-11 shrink-0 cursor-move items-center justify-between px-4 text-[12px] font-medium text-zinc-400"
        onPointerDown={props.onHeaderPointerDown}
      >
        <span>Dynamics</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onToggleShowColliders}
            className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
          >
            {props.showColliders ? "Hide Colliders" : "Show Colliders"}
          </button>
          <GripHorizontal className="size-4 text-zinc-600" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <StudioSection
          title="Profiles"
          variant="soft"
          action={
            <Button type="button" size="xs" variant="ghost" className="h-7 px-2 text-[11px] text-zinc-300" onClick={addProfile}>
              <Plus className="mr-1 size-3.5" />
              Profile
            </Button>
          }
        >
          {dynamicsProfiles.length === 0 ? (
            <div className={sectionHintClassName}>Add a dynamics profile, then assign bone chains and collision spheres for hair or accessories.</div>
          ) : (
            <>
              <PropertyField label="Active Profile">
                <select
                  value={selectedProfile?.id ?? ""}
                  onChange={(event) => props.onSelectProfileId(event.target.value)}
                  className={editorSelectClassName}
                >
                  {dynamicsProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </PropertyField>
              {selectedProfile ? (
                <>
                  <div className="flex items-end gap-2">
                    <PropertyField label="Profile Name" className="flex-1">
                      <Input
                        value={selectedProfile.name}
                        onChange={(event) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            name: event.target.value,
                          }))
                        }
                        className={editorInputClassName}
                      />
                    </PropertyField>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="mb-0.5 text-zinc-400 hover:text-red-300"
                      onClick={() => {
                        props.store.deleteDynamicsProfile(selectedProfile.id);
                        props.onSelectProfileId(dynamicsProfiles.find((profile) => profile.id !== selectedProfile.id)?.id ?? "");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <PropertyField label="Solver Iterations">
                    <NumericDragInput
                      value={selectedProfile.iterations}
                      step={1}
                      precision={0}
                      min={1}
                      max={12}
                      onChange={(value) =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          iterations: Math.max(1, Math.min(12, Math.round(value))),
                        }))
                      }
                    />
                  </PropertyField>
                </>
              ) : null}
            </>
          )}
        </StudioSection>

        {selectedProfile ? (
          <div className="mt-3 space-y-3">
            <StudioSection
              title="Chains"
              variant="soft"
              action={
                <Button type="button" size="xs" variant="ghost" className="h-7 px-2 text-[11px] text-zinc-300" onClick={addChain} disabled={!fallbackBoneName}>
                  <Plus className="mr-1 size-3.5" />
                  Chain
                </Button>
              }
            >
              {selectedProfile.chains.length === 0 ? <div className={sectionHintClassName}>Add one chain per hair strand or accessory bone chain.</div> : null}
              {selectedProfile.chains.map((chain, chainIndex) => (
                <div key={chain.id} className="space-y-2 rounded-2xl bg-white/4 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={chain.name}
                      onChange={(event) =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          chains: profile.chains.map((entry) =>
                            entry.id === chain.id ? { ...entry, name: event.target.value } : entry
                          )
                        }))
                      }
                      className={editorInputClassName}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-red-300"
                      onClick={() =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          chains: profile.chains.filter((entry) => entry.id !== chain.id)
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PropertyField label="Root Bone">
                      <select
                        value={chain.rootBoneName}
                        onChange={(event) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, rootBoneName: event.target.value } : entry
                            )
                          }))
                        }
                        className={editorSelectClassName}
                      >
                        {availableBoneNames.map((boneName) => (
                          <option key={boneName} value={boneName}>
                            {boneName}
                          </option>
                        ))}
                      </select>
                    </PropertyField>
                    <PropertyField label="Tip Bone">
                      <select
                        value={chain.tipBoneName}
                        onChange={(event) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, tipBoneName: event.target.value } : entry
                            )
                          }))
                        }
                        className={editorSelectClassName}
                      >
                        {availableBoneNames.map((boneName) => (
                          <option key={boneName} value={boneName}>
                            {boneName}
                          </option>
                        ))}
                      </select>
                    </PropertyField>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <PropertyField label="Damping">
                      <NumericDragInput
                        value={chain.damping}
                        step={0.01}
                        precision={2}
                        min={0}
                        max={0.99}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, damping: Math.max(0, Math.min(0.99, value)) } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Stiffness">
                      <NumericDragInput
                        value={chain.stiffness}
                        step={0.01}
                        precision={2}
                        min={0}
                        max={1}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, stiffness: Math.max(0, Math.min(1, value)) } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Gravity">
                      <NumericDragInput
                        value={chain.gravityScale}
                        step={0.05}
                        precision={2}
                        min={0}
                        max={4}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, gravityScale: Math.max(0, Math.min(4, value)) } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <PropertyField label="Inertia X">
                      <NumericDragInput
                        value={chain.inertia.x}
                        step={0.05}
                        precision={2}
                        min={0}
                        max={4}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, inertia: { ...entry.inertia, x: Math.max(0, Math.min(4, value)) } } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Inertia Y">
                      <NumericDragInput
                        value={chain.inertia.y}
                        step={0.05}
                        precision={2}
                        min={0}
                        max={4}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, inertia: { ...entry.inertia, y: Math.max(0, Math.min(4, value)) } } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Inertia Z">
                      <NumericDragInput
                        value={chain.inertia.z}
                        step={0.05}
                        precision={2}
                        min={0}
                        max={4}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, inertia: { ...entry.inertia, z: Math.max(0, Math.min(4, value)) } } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <PropertyField label="Angle Limit (rad)">
                      <NumericDragInput
                        value={chain.limitAngleRadians}
                        step={0.05}
                        precision={2}
                        min={0.05}
                        max={3.14}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, limitAngleRadians: Math.max(0.05, Math.min(3.14, value)) } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <label className="flex h-9 items-center gap-2 rounded-xl bg-white/7 px-3 text-[12px] text-zinc-200">
                      <Checkbox
                        checked={chain.enabled}
                        onCheckedChange={(checked) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            chains: profile.chains.map((entry) =>
                              entry.id === chain.id ? { ...entry, enabled: Boolean(checked) } : entry
                            )
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                  <div className={sectionHintClassName}>Chain {chainIndex + 1} resolves the descendant path from the selected root bone to the selected tip bone.</div>
                </div>
              ))}
            </StudioSection>

            <StudioSection
              title="Sphere Colliders"
              variant="soft"
              action={
                <Button type="button" size="xs" variant="ghost" className="h-7 px-2 text-[11px] text-zinc-300" onClick={addSphereCollider} disabled={!fallbackBoneName}>
                  <Plus className="mr-1 size-3.5" />
                  Sphere
                </Button>
              }
            >
              {selectedProfile.sphereColliders.length === 0 ? <div className={sectionHintClassName}>Add spheres around the head, neck, shoulders, or chest to keep strands outside the body.</div> : null}
              {selectedProfile.sphereColliders.map((collider) => (
                <div key={collider.id} className="space-y-2 rounded-2xl bg-white/4 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={collider.name}
                      onChange={(event) =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          sphereColliders: profile.sphereColliders.map((entry) =>
                            entry.id === collider.id ? { ...entry, name: event.target.value } : entry
                          )
                        }))
                      }
                      className={editorInputClassName}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-red-300"
                      onClick={() =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          sphereColliders: profile.sphereColliders.filter((entry) => entry.id !== collider.id)
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <PropertyField label="Attached Bone">
                    <select
                      value={collider.boneName}
                      onChange={(event) =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          sphereColliders: profile.sphereColliders.map((entry) =>
                            entry.id === collider.id ? { ...entry, boneName: event.target.value } : entry
                          )
                        }))
                      }
                      className={editorSelectClassName}
                    >
                      {availableBoneNames.map((boneName) => (
                        <option key={boneName} value={boneName}>
                          {boneName}
                        </option>
                      ))}
                    </select>
                  </PropertyField>
                  <div className="grid grid-cols-4 gap-2">
                    <PropertyField label="Radius">
                      <NumericDragInput
                        value={collider.radius}
                        step={0.01}
                        precision={2}
                        min={0.01}
                        max={2}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            sphereColliders: profile.sphereColliders.map((entry) =>
                              entry.id === collider.id ? { ...entry, radius: Math.max(0.01, Math.min(2, value)) } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Offset X">
                      <NumericDragInput
                        value={collider.offset.x}
                        step={0.01}
                        precision={2}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            sphereColliders: profile.sphereColliders.map((entry) =>
                              entry.id === collider.id ? { ...entry, offset: { ...entry.offset, x: value } } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Offset Y">
                      <NumericDragInput
                        value={collider.offset.y}
                        step={0.01}
                        precision={2}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            sphereColliders: profile.sphereColliders.map((entry) =>
                              entry.id === collider.id ? { ...entry, offset: { ...entry.offset, y: value } } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                    <PropertyField label="Offset Z">
                      <NumericDragInput
                        value={collider.offset.z}
                        step={0.01}
                        precision={2}
                        onChange={(value) =>
                          props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                            ...profile,
                            sphereColliders: profile.sphereColliders.map((entry) =>
                              entry.id === collider.id ? { ...entry, offset: { ...entry.offset, z: value } } : entry
                            )
                          }))
                        }
                      />
                    </PropertyField>
                  </div>
                  <label className="flex h-9 items-center gap-2 rounded-xl bg-white/7 px-3 text-[12px] text-zinc-200">
                    <Checkbox
                      checked={collider.enabled}
                      onCheckedChange={(checked) =>
                        props.store.updateDynamicsProfile(selectedProfile.id, (profile) => ({
                          ...profile,
                          sphereColliders: profile.sphereColliders.map((entry) =>
                            entry.id === collider.id ? { ...entry, enabled: Boolean(checked) } : entry
                          )
                        }))
                      }
                    />
                    <span>Enabled</span>
                  </label>
                </div>
              ))}
            </StudioSection>
          </div>
        ) : null}
      </div>
    </div>
  );
}
