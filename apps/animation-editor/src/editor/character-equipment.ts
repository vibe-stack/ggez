export type Vec3 = [number, number, number];
export type Quat4 = [number, number, number, number]; // x y z w

export type EquipmentTransform = {
  position: Vec3;
  rotation: Quat4;
  scale: Vec3;
};

export const DEFAULT_EQUIPMENT_TRANSFORM: EquipmentTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

export type CharacterSocket = {
  id: string;
  name: string;
  boneName: string;
};

export type EquipmentItem = {
  id: string;
  name: string;
  socketId: string | null;
  enabled: boolean;
  transform: EquipmentTransform;
};

export type EquipmentBundle = {
  sockets: CharacterSocket[];
  items: Array<{
    id: string;
    name: string;
    socketId: string | null;
    enabled: boolean;
    transform: EquipmentTransform;
  }>;
};
