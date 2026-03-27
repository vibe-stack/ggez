import { GripHorizontal, Plus, Trash2, Target, Unlink } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { UseEquipmentStateReturn } from "./hooks/use-equipment-state";
import { sectionHintClassName } from "./workspace/shared";

type CharacterEquipmentPanelProps = {
  equipment: UseEquipmentStateReturn;
  characterBoneNames: string[];
  onHeaderPointerDown: (event: ReactPointerEvent) => void;
};

export function CharacterEquipmentPanel({
  equipment,
  characterBoneNames,
  onHeaderPointerDown,
}: CharacterEquipmentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [socketName, setSocketName] = useState("");
  const [socketBone, setSocketBone] = useState("");
  const [showAddSocket, setShowAddSocket] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    files.forEach((file) => equipment.addEquipmentFile(file));
  }

  function handleAddSocket() {
    if (!socketBone.trim()) return;
    equipment.addSocket(socketName || socketBone, socketBone);
    setSocketName("");
    setSocketBone("");
    setShowAddSocket(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#091012]/84 shadow-[0_28px_96px_rgba(0,0,0,0.5)] ring-1 ring-white/8 backdrop-blur-2xl">
      {/* Drag header */}
      <div
        className="flex h-11 shrink-0 cursor-move items-center justify-between px-4 text-[12px] font-medium text-zinc-400"
        onPointerDown={onHeaderPointerDown}
      >
        <span>Equipment</span>
        <GripHorizontal className="size-4 text-zinc-600" />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        {/* ── Equipment Items ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Equipment
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="h-5 gap-1 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="size-3" />
              Add GLB
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            multiple
            hidden
            onChange={handleFileChange}
          />

          {equipment.items.length === 0 ? (
            <p className={sectionHintClassName}>
              Upload a GLB to start adding equipment.
            </p>
          ) : (
            <div className="space-y-1.5">
              {equipment.items.map((item) => {
                const isSelected = equipment.selectedItemId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-2.5 ring-1 transition-colors ${
                      isSelected
                        ? "bg-emerald-500/10 ring-emerald-400/30"
                        : "bg-white/4 ring-transparent hover:bg-white/6"
                    }`}
                  >
                    {/* Row 1: toggle, name, actions */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={item.enabled}
                        onCheckedChange={() => equipment.toggleEquipment(item.id)}
                        className="shrink-0"
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
                          item.enabled ? "text-zinc-100" : "text-zinc-500"
                        }`}
                      >
                        {item.name}
                      </span>
                      {/* Select for gizmo */}
                      <button
                        type="button"
                        title="Select for gizmo editing"
                        onClick={() =>
                          equipment.setSelectedItemId(isSelected ? null : item.id)
                        }
                        className={`flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isSelected
                            ? "bg-emerald-400/20 text-emerald-300"
                            : "text-zinc-500 hover:bg-white/8 hover:text-zinc-300"
                        }`}
                      >
                        <Target className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove equipment"
                        onClick={() => equipment.removeEquipment(item.id)}
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-rose-500/12 hover:text-rose-400"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {/* Row 2: socket selector */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-[10px] text-zinc-500">Socket</span>
                      <select
                        value={item.socketId ?? ""}
                        onChange={(e) =>
                          equipment.setEquipmentSocket(item.id, e.target.value || null)
                        }
                        className="h-7 min-w-0 flex-1 rounded-lg border-0 bg-white/7 px-2 text-[11px] text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-400/20"
                      >
                        <option value="">— None —</option>
                        {equipment.sockets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {item.socketId && (
                        <button
                          type="button"
                          title="Detach from socket"
                          onClick={() => equipment.setEquipmentSocket(item.id, null)}
                          className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300"
                        >
                          <Unlink className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Sockets ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Sockets
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="h-5 gap-1 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
              onClick={() => setShowAddSocket((v) => !v)}
            >
              <Plus className="size-3" />
              Add
            </Button>
          </div>

          {equipment.sockets.length === 0 && !showAddSocket ? (
            <p className={sectionHintClassName}>
              Create a socket on a bone to attach equipment.
            </p>
          ) : (
            <div className="space-y-1.5">
              {equipment.sockets.map((socket) => (
                <div
                  key={socket.id}
                  className="flex items-center gap-2 rounded-xl bg-white/4 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-zinc-100">
                      {socket.name}
                    </div>
                    <div className="truncate font-mono text-[10px] text-zinc-500">
                      {socket.boneName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => equipment.removeSocket(socket.id)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-rose-500/12 hover:text-rose-400"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add socket form */}
          {showAddSocket && (
            <div className="space-y-2 rounded-2xl bg-white/4 p-3">
              <input
                value={socketName}
                onChange={(e) => setSocketName(e.target.value)}
                placeholder="Socket name (e.g. Right Hand)"
                className="h-8 w-full rounded-xl border-0 bg-white/7 px-3 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-emerald-400/20"
              />
              {characterBoneNames.length > 0 ? (
                <select
                  value={socketBone}
                  onChange={(e) => setSocketBone(e.target.value)}
                  className="h-8 w-full rounded-xl border-0 bg-white/7 px-3 text-[12px] text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-400/20"
                >
                  <option value="">— Pick bone —</option>
                  {characterBoneNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={socketBone}
                  onChange={(e) => setSocketBone(e.target.value)}
                  placeholder="Bone name (e.g. mixamorigRightHand)"
                  className="h-8 w-full rounded-xl border-0 bg-white/7 px-3 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-emerald-400/20"
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 flex-1 rounded-xl bg-emerald-500/15 text-[12px] text-emerald-200 hover:bg-emerald-500/25"
                  onClick={handleAddSocket}
                  disabled={!socketBone.trim()}
                >
                  Add Socket
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-xl text-[12px] text-zinc-400"
                  onClick={() => setShowAddSocket(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
