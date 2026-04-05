import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { Move, RotateCcw, Maximize2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CharacterBonePanel } from "./character-bone-panel";
import { CharacterDynamicsPanel } from "./character-dynamics-panel";
import { CharacterEquipmentPanel } from "./character-equipment-panel";
import { CharacterPlaybackPanel } from "./character-playback-panel";
import { CharacterViewport } from "./character-viewport";
import { useCharacterPlayback } from "./hooks/use-character-playback";
import { useEditorStoreValue } from "./use-editor-store-value";
import type { UseEquipmentStateReturn } from "./hooks/use-equipment-state";
import type { ImportedCharacterAsset, ImportedPreviewClip } from "./preview-assets";
import { clampFloatingPanelPosition, type FloatingPanelPosition } from "./workspace/floating-panel-utils";

const BONE_PANEL_FALLBACK_W = 256;
const BONE_PANEL_FALLBACK_H = 560;
const PLAYBACK_PANEL_FALLBACK_W = 288;
const PLAYBACK_PANEL_FALLBACK_H = 480;
const EQUIPMENT_PANEL_FALLBACK_W = 288;
const EQUIPMENT_PANEL_FALLBACK_H = 420;
const DYNAMICS_PANEL_FALLBACK_W = 360;
const DYNAMICS_PANEL_FALLBACK_H = 620;

type CharacterWorkspaceProps = {
  store: AnimationEditorStore;
  character: ImportedCharacterAsset | null;
  importedClips: ImportedPreviewClip[];
  equipment: UseEquipmentStateReturn;
};

export function CharacterWorkspace({ store, character, importedClips, equipment }: CharacterWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const bonePanelRef = useRef<HTMLDivElement | null>(null);
  const playbackPanelRef = useRef<HTMLDivElement | null>(null);
  const equipmentPanelRef = useRef<HTMLDivElement | null>(null);
  const dynamicsPanelRef = useRef<HTMLDivElement | null>(null);

  const [bonePosition, setBonePosition] = useState<FloatingPanelPosition | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState<FloatingPanelPosition | null>(null);
  const [equipmentPosition, setEquipmentPosition] = useState<FloatingPanelPosition | null>(null);
  const [dynamicsPosition, setDynamicsPosition] = useState<FloatingPanelPosition | null>(null);
  const [selectedDynamicsProfileId, setSelectedDynamicsProfileId] = useState("");
  const [showDynamicsColliders, setShowDynamicsColliders] = useState(true);

  const boneDragRef = useRef<{ pointerX: number; pointerY: number; position: FloatingPanelPosition } | null>(null);
  const playbackDragRef = useRef<{ pointerX: number; pointerY: number; position: FloatingPanelPosition } | null>(null);
  const equipmentDragRef = useRef<{ pointerX: number; pointerY: number; position: FloatingPanelPosition } | null>(null);
  const dynamicsDragRef = useRef<{ pointerX: number; pointerY: number; position: FloatingPanelPosition } | null>(null);

  const playback = useCharacterPlayback(store, importedClips);
  const dynamicsProfiles = useEditorStoreValue(store, () => store.getState().document.dynamicsProfiles, ["document", "dynamics"]);

  const characterBoneNames = useMemo(
    () => character?.documentRig.boneNames ?? [],
    [character]
  );

  useEffect(() => {
    if (dynamicsProfiles.length === 0) {
      if (selectedDynamicsProfileId) {
        setSelectedDynamicsProfileId("");
      }
      return;
    }

    if (!selectedDynamicsProfileId || !dynamicsProfiles.some((profile) => profile.id === selectedDynamicsProfileId)) {
      setSelectedDynamicsProfileId(dynamicsProfiles[0]!.id);
    }
  }, [dynamicsProfiles, selectedDynamicsProfileId]);

  // Clamp all panels on workspace resize
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const bounds = el.getBoundingClientRect();
      setBonePosition((pos) =>
        pos
          ? clampFloatingPanelPosition(pos, { width: bonePanelRef.current?.offsetWidth ?? BONE_PANEL_FALLBACK_W, height: bonePanelRef.current?.offsetHeight ?? BONE_PANEL_FALLBACK_H }, bounds)
          : pos
      );
      setPlaybackPosition((pos) =>
        pos
          ? clampFloatingPanelPosition(pos, { width: playbackPanelRef.current?.offsetWidth ?? PLAYBACK_PANEL_FALLBACK_W, height: playbackPanelRef.current?.offsetHeight ?? PLAYBACK_PANEL_FALLBACK_H }, bounds)
          : pos
      );
      setEquipmentPosition((pos) =>
        pos
          ? clampFloatingPanelPosition(pos, { width: equipmentPanelRef.current?.offsetWidth ?? EQUIPMENT_PANEL_FALLBACK_W, height: equipmentPanelRef.current?.offsetHeight ?? EQUIPMENT_PANEL_FALLBACK_H }, bounds)
          : pos
      );
      setDynamicsPosition((pos) =>
        pos
          ? clampFloatingPanelPosition(pos, { width: dynamicsPanelRef.current?.offsetWidth ?? DYNAMICS_PANEL_FALLBACK_W, height: dynamicsPanelRef.current?.offsetHeight ?? DYNAMICS_PANEL_FALLBACK_H }, bounds)
          : pos
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Global drag listeners for all three panels
  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const bd = boneDragRef.current;
      if (bd) {
        setBonePosition(
          clampFloatingPanelPosition(
            { x: bd.position.x + (event.clientX - bd.pointerX), y: bd.position.y + (event.clientY - bd.pointerY) },
            { width: bonePanelRef.current?.offsetWidth ?? BONE_PANEL_FALLBACK_W, height: bonePanelRef.current?.offsetHeight ?? BONE_PANEL_FALLBACK_H },
            bounds
          )
        );
      }

      const pd = playbackDragRef.current;
      if (pd) {
        setPlaybackPosition(
          clampFloatingPanelPosition(
            { x: pd.position.x + (event.clientX - pd.pointerX), y: pd.position.y + (event.clientY - pd.pointerY) },
            { width: playbackPanelRef.current?.offsetWidth ?? PLAYBACK_PANEL_FALLBACK_W, height: playbackPanelRef.current?.offsetHeight ?? PLAYBACK_PANEL_FALLBACK_H },
            bounds
          )
        );
      }

      const ed = equipmentDragRef.current;
      if (ed) {
        setEquipmentPosition(
          clampFloatingPanelPosition(
            { x: ed.position.x + (event.clientX - ed.pointerX), y: ed.position.y + (event.clientY - ed.pointerY) },
            { width: equipmentPanelRef.current?.offsetWidth ?? EQUIPMENT_PANEL_FALLBACK_W, height: equipmentPanelRef.current?.offsetHeight ?? EQUIPMENT_PANEL_FALLBACK_H },
            bounds
          )
        );
      }

      const dd = dynamicsDragRef.current;
      if (dd) {
        setDynamicsPosition(
          clampFloatingPanelPosition(
            { x: dd.position.x + (event.clientX - dd.pointerX), y: dd.position.y + (event.clientY - dd.pointerY) },
            { width: dynamicsPanelRef.current?.offsetWidth ?? DYNAMICS_PANEL_FALLBACK_W, height: dynamicsPanelRef.current?.offsetHeight ?? DYNAMICS_PANEL_FALLBACK_H },
            bounds
          )
        );
      }
    }

    function handlePointerUp() {
      boneDragRef.current = null;
      playbackDragRef.current = null;
      equipmentDragRef.current = null;
      dynamicsDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function beginBoneDrag(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    boneDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position: bonePosition ?? { x: 16, y: 16 } };
    if (!bonePosition) setBonePosition({ x: 16, y: 16 });
  }

  function beginPlaybackDrag(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const fallbackX = bounds ? Math.max(bounds.width - PLAYBACK_PANEL_FALLBACK_W - 16, 16) : 16;
    playbackDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position: playbackPosition ?? { x: fallbackX, y: 16 } };
    if (!playbackPosition) setPlaybackPosition({ x: fallbackX, y: 16 });
  }

  function beginEquipmentDrag(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const fallbackX = bounds ? Math.max(bounds.width - EQUIPMENT_PANEL_FALLBACK_W - 16, 16) : 16;
    const fallbackY = PLAYBACK_PANEL_FALLBACK_H + 32;
    equipmentDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position: equipmentPosition ?? { x: fallbackX, y: fallbackY } };
    if (!equipmentPosition) setEquipmentPosition({ x: fallbackX, y: fallbackY });
  }

  function beginDynamicsDrag(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const fallbackY = bonePosition ? bonePosition.y + BONE_PANEL_FALLBACK_H + 16 : 16;
    dynamicsDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position: dynamicsPosition ?? { x: 16, y: fallbackY } };
    if (!dynamicsPosition) setDynamicsPosition({ x: 16, y: fallbackY });
  }

  const hasSelectedEquipment = equipment.selectedItemId !== null;

  return (
    <div ref={workspaceRef} className="relative h-full w-full overflow-hidden">
      {/* Full-space Three.js character viewport */}
      <CharacterViewport
        store={store}
        character={character}
        importedClips={importedClips}
        playback={playback}
        equipment={equipment}
        selectedDynamicsProfileId={selectedDynamicsProfileId}
        showDynamicsColliders={showDynamicsColliders}
      />

      {/* Gizmo mode toolbar — appears when an equipment item is selected */}
      {hasSelectedEquipment && (
        <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-[#091012]/84 px-2 py-1.5 shadow-lg ring-1 ring-white/8 backdrop-blur-xl">
          {(["translate", "rotate", "scale"] as const).map((mode) => {
            const Icon = mode === "translate" ? Move : mode === "rotate" ? RotateCcw : Maximize2;
            const label = mode === "translate" ? "Move" : mode === "rotate" ? "Rotate" : "Scale";
            const active = equipment.gizmoMode === mode;
            return (
              <button
                key={mode}
                type="button"
                title={label}
                onClick={() => equipment.setGizmoMode(mode)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button
            type="button"
            title="Deselect"
            onClick={() => equipment.setSelectedItemId(null)}
            className="rounded-xl px-2 py-1.5 text-[11px] text-zinc-500 hover:bg-white/8 hover:text-zinc-300"
          >
            Done
          </button>
        </div>
      )}

      {/* Bone hierarchy panel — left side by default */}
      <div
        ref={bonePanelRef}
        className="pointer-events-auto absolute z-20 h-[min(72vh,640px)] w-84"
        style={bonePosition ? { left: `${bonePosition.x}px`, top: `${bonePosition.y}px` } : { left: "1rem", top: "1rem" }}
      >
        <CharacterBonePanel character={character} onHeaderPointerDown={beginBoneDrag} />
      </div>

      <div
        ref={dynamicsPanelRef}
        className="pointer-events-auto absolute z-20 h-[min(76vh,720px)] w-90"
        style={dynamicsPosition ? { left: `${dynamicsPosition.x}px`, top: `${dynamicsPosition.y}px` } : { left: "1rem", top: `${BONE_PANEL_FALLBACK_H + 32}px` }}
      >
        <CharacterDynamicsPanel
          store={store}
          characterBoneNames={characterBoneNames}
          selectedProfileId={selectedDynamicsProfileId}
          onSelectProfileId={setSelectedDynamicsProfileId}
          showColliders={showDynamicsColliders}
          onToggleShowColliders={() => setShowDynamicsColliders((current) => !current)}
          onHeaderPointerDown={beginDynamicsDrag}
        />
      </div>

      {/* Playback panel — right side by default */}
      <div
        ref={playbackPanelRef}
        className="pointer-events-auto absolute z-20 w-72 max-h-[min(80vh,720px)]"
        style={playbackPosition ? { left: `${playbackPosition.x}px`, top: `${playbackPosition.y}px` } : { right: "1rem", top: "1rem" }}
      >
        <CharacterPlaybackPanel
          store={store}
          importedClips={importedClips}
          playback={playback}
          onHeaderPointerDown={beginPlaybackDrag}
        />
      </div>

      {/* Equipment panel — right side, below playback by default */}
      <div
        ref={equipmentPanelRef}
        className="pointer-events-auto absolute z-20 w-72 max-h-[min(60vh,560px)]"
        style={
          equipmentPosition
            ? { left: `${equipmentPosition.x}px`, top: `${equipmentPosition.y}px` }
            : { right: "1rem", top: `${PLAYBACK_PANEL_FALLBACK_H + 32}px` }
        }
      >
        <CharacterEquipmentPanel
          equipment={equipment}
          characterBoneNames={characterBoneNames}
          onHeaderPointerDown={beginEquipmentDrag}
        />
      </div>
    </div>
  );
}
