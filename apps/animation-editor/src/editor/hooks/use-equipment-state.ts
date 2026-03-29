import { useRef, useState } from "react";
import type { CharacterSocket, EquipmentBundle, EquipmentItem, EquipmentTransform } from "../character-equipment";
import { DEFAULT_EQUIPMENT_TRANSFORM } from "../character-equipment";

export type GizmoMode = "translate" | "rotate" | "scale";

let _seq = 0;
function uid(): string {
  return `eq-${Date.now().toString(36)}-${(++_seq).toString(36)}`;
}

export type UseEquipmentStateReturn = ReturnType<typeof useEquipmentState>;

export function useEquipmentState() {
  const [sockets, setSockets] = useState<CharacterSocket[]>([]);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");

  // GLB Files live in a ref — they're large binary objects and don't need to drive renders
  const filesRef = useRef(new Map<string, File>());

  function addSocket(name: string, boneName: string) {
    setSockets((prev) => [
      ...prev,
      { id: uid(), name: name.trim() || "Socket", boneName: boneName.trim() },
    ]);
  }

  function removeSocket(id: string) {
    setSockets((prev) => prev.filter((s) => s.id !== id));
    // Detach any equipment that was using this socket
    setItems((prev) =>
      prev.map((item) => (item.socketId === id ? { ...item, socketId: null } : item))
    );
  }

  function addEquipmentFile(file: File) {
    const id = uid();
    filesRef.current.set(id, file);
    const name = file.name.replace(/\.(glb|gltf)$/i, "");
    setItems((prev) => [
      ...prev,
      { id, name, socketId: null, enabled: true, transform: { ...DEFAULT_EQUIPMENT_TRANSFORM } },
    ]);
  }

  function removeEquipment(id: string) {
    filesRef.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedItemId((current) => (current === id ? null : current));
  }

  function setEquipmentSocket(itemId: string, socketId: string | null) {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, socketId } : item))
    );
  }

  function toggleEquipment(itemId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, enabled: !item.enabled } : item
      )
    );
  }

  function updateTransform(itemId: string, transform: EquipmentTransform) {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, transform } : item))
    );
  }

  function getBundle(): EquipmentBundle {
    return {
      sockets: structuredClone(sockets),
      items: items.map(({ id, name, socketId, enabled, transform }) => ({
        id,
        name,
        socketId,
        enabled,
        transform,
      })),
    };
  }

  function restoreFromBundle(
    bundle: EquipmentBundle,
    restoredFiles: Array<{ id: string; file: File }>
  ) {
    setSockets(structuredClone(bundle.sockets));
    setItems(
      bundle.items.map((item) => ({
        ...item,
        transform: item.transform ?? { ...DEFAULT_EQUIPMENT_TRANSFORM },
      }))
    );
    filesRef.current.clear();
    restoredFiles.forEach(({ id, file }) => filesRef.current.set(id, file));
    setSelectedItemId(null);
  }

  function resetEquipment() {
    setSockets([]);
    setItems([]);
    filesRef.current.clear();
    setSelectedItemId(null);
    setGizmoMode("translate");
  }

  return {
    sockets,
    items,
    selectedItemId,
    gizmoMode,
    filesRef,
    setSelectedItemId,
    setGizmoMode,
    addSocket,
    removeSocket,
    addEquipmentFile,
    removeEquipment,
    setEquipmentSocket,
    toggleEquipment,
    updateTransform,
    getBundle,
    restoreFromBundle,
    resetEquipment,
  };
}
