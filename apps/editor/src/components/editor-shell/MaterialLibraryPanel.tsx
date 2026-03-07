import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { vec2, type GeometryNode, type Material, type Vec2 } from "@web-hammer/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MaterialLibraryPanelProps = {
  materials: Material[];
  onApplyMaterial: (materialId: string, scope: "faces" | "object", faceIds: string[]) => void;
  onDeleteMaterial: (materialId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onSetUvScale: (scope: "faces" | "object", faceIds: string[], uvScale: Vec2) => void;
  onUpsertMaterial: (material: Material) => void;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  selectedNode?: GeometryNode;
};

const TEXTURE_FIELDS = [
  { field: "colorTexture", label: "Color Texture" },
  { field: "normalTexture", label: "Normal Map" },
  { field: "metalnessTexture", label: "Metalness Map" },
  { field: "roughnessTexture", label: "Roughness Map" }
] as const;

export function MaterialLibraryPanel({
  materials,
  onApplyMaterial,
  onDeleteMaterial,
  onSelectMaterial,
  onSetUvScale,
  onUpsertMaterial,
  selectedFaceIds,
  selectedMaterialId,
  selectedNode
}: MaterialLibraryPanelProps) {
  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === selectedMaterialId),
    [materials, selectedMaterialId]
  );
  const flatMaterials = useMemo(() => materials.filter((material) => resolveMaterialCategory(material) === "flat"), [materials]);
  const blockoutMaterials = useMemo(
    () => materials.filter((material) => resolveMaterialCategory(material) === "blockout"),
    [materials]
  );
  const customMaterials = useMemo(() => materials.filter((material) => resolveMaterialCategory(material) === "custom"), [materials]);
  const [draftMaterial, setDraftMaterial] = useState<Material>(() => createDraftMaterial(selectedMaterial));
  const [uvDraft, setUvDraft] = useState<Vec2>(() => vec2(1, 1));
  const [uvLocked, setUvLocked] = useState(true);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const materialFaces = selectedNode && (selectedNode.kind === "brush" || selectedNode.kind === "mesh") ? selectedNode.data.faces : [];
  const faceSelectionSet = useMemo(() => new Set(selectedFaceIds), [selectedFaceIds]);
  const selectedFaces = useMemo(
    () => materialFaces.filter((face) => faceSelectionSet.has(face.id)),
    [faceSelectionSet, materialFaces]
  );
  const canApplyToObject = selectedNode?.kind === "brush" || selectedNode?.kind === "mesh";
  const canApplyToFaces = canApplyToObject && selectedFaceIds.length > 0;
  const targetUvScale = (canApplyToFaces ? selectedFaces[0]?.uvScale : materialFaces[0]?.uvScale) ?? vec2(1, 1);

  useEffect(() => {
    setDraftMaterial(createDraftMaterial(selectedMaterial));
  }, [selectedMaterialId, selectedMaterial]);

  useEffect(() => {
    setUvDraft(vec2(targetUvScale.x, targetUvScale.y));
  }, [targetUvScale.x, targetUvScale.y, selectedNode?.id, selectedFaceIds.join("|")]);

  const applyUvAxis = (axis: "x" | "y", value: number) => {
    setUvDraft((current) => {
      if (uvLocked) {
        return vec2(value, value);
      }

      return axis === "x" ? vec2(value, current.y) : vec2(current.x, value);
    });
  };

  const saveAsNewMaterial = () => {
    const material = {
      ...draftMaterial,
      category: "custom" as const,
      id: createCustomMaterialId(draftMaterial.name)
    };

    onUpsertMaterial(material);
    onSelectMaterial(material.id);
  };

  const updateSelectedMaterial = () => {
    if (!selectedMaterial || resolveMaterialCategory(selectedMaterial) !== "custom") {
      return;
    }

    onUpsertMaterial({
      ...draftMaterial,
      category: "custom",
      id: selectedMaterial.id
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PanelLabel>Flat Colors</PanelLabel>
        <div className="grid grid-cols-5 gap-2">
          {flatMaterials.map((material) => (
            <button
              className={cn(
                "size-10 rounded-2xl border border-white/10 transition-transform hover:scale-[1.04] hover:border-white/30",
                selectedMaterialId === material.id && "ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-transparent"
              )}
              key={material.id}
              onClick={() => onSelectMaterial(material.id)}
              style={{ backgroundColor: material.color }}
              title={material.name}
              type="button"
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <PanelLabel>Blockout Presets</PanelLabel>
        <div className="grid grid-cols-2 gap-2">
          {blockoutMaterials.map((material) => (
            <button
              className={cn(
                "space-y-2 rounded-2xl border border-white/8 bg-white/3 p-2 text-left transition-colors hover:border-white/18 hover:bg-white/5",
                selectedMaterialId === material.id && "border-emerald-400/60 bg-emerald-400/10"
              )}
              key={material.id}
              onClick={() => onSelectMaterial(material.id)}
              type="button"
            >
              <div
                className="h-10 rounded-xl"
                style={{
                  backgroundColor: material.edgeColor ?? "#3f2f24",
                  boxShadow: `inset 0 0 0 ${Math.max(4, Math.round(32 * (material.edgeThickness ?? 0.12)))}px ${material.color}`
                }}
              />
              <div className="truncate text-[11px] font-medium text-foreground/82">{material.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-white/8 bg-white/3 p-3">
        <div className="flex items-center justify-between gap-2">
          <PanelLabel>Custom Materials</PanelLabel>
          <Button
            onClick={() => {
              setDraftMaterial(createDraftMaterial());
            }}
            size="xs"
            variant="ghost"
          >
            New Custom
          </Button>
        </div>
        {customMaterials.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {customMaterials.map((material) => (
              <button
                className={cn(
                  "rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-foreground/70 transition-colors hover:border-white/20 hover:text-foreground",
                  selectedMaterialId === material.id && "border-emerald-400/60 bg-emerald-400/12 text-emerald-100"
                )}
                key={material.id}
                onClick={() => onSelectMaterial(material.id)}
                type="button"
              >
                {material.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-foreground/42">No custom materials yet.</div>
        )}

        <div className="space-y-3 pt-1">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">Name</div>
              <Input
                onChange={(event) => setDraftMaterial((current) => ({ ...current, name: event.target.value }))}
                value={draftMaterial.name}
              />
            </div>
            <label className="space-y-1">
              <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">Color</div>
              <input
                className="h-8 w-12 rounded-lg border border-white/10 bg-transparent p-1"
                onChange={(event) => setDraftMaterial((current) => ({ ...current, color: event.target.value }))}
                type="color"
                value={draftMaterial.color}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <DragInput
              compact
              label="Metal"
              max={1}
              min={0}
              onChange={(value) => setDraftMaterial((current) => ({ ...current, metalness: value }))}
              precision={2}
              step={0.01}
              value={draftMaterial.metalness ?? 0}
            />
            <DragInput
              compact
              label="Rough"
              max={1}
              min={0}
              onChange={(value) => setDraftMaterial((current) => ({ ...current, roughness: value }))}
              precision={2}
              step={0.01}
              value={draftMaterial.roughness ?? 0.8}
            />
          </div>

          <div className="space-y-2">
            {TEXTURE_FIELDS.map(({ field, label }) => (
              <div className="rounded-xl border border-white/8 bg-black/10 p-2" key={field}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-foreground/78">{label}</div>
                    <div className="text-[10px] text-foreground/38">
                      {draftMaterial[field] ? "Embedded image" : "No texture assigned"}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button onClick={() => fileInputsRef.current[field]?.click()} size="xs" variant="ghost">
                      {draftMaterial[field] ? "Replace" : "Add"}
                    </Button>
                    <Button
                      disabled={!draftMaterial[field]}
                      onClick={() => setDraftMaterial((current) => ({ ...current, [field]: undefined }))}
                      size="xs"
                      variant="ghost"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <input
                  accept="image/*"
                  hidden
                  onChange={(event) => void handleTextureUpload(field, event, setDraftMaterial)}
                  ref={(element) => {
                    fileInputsRef.current[field] = element;
                  }}
                  type="file"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button onClick={saveAsNewMaterial} size="sm" variant="ghost">
              Save As New
            </Button>
            <Button
              disabled={resolveMaterialCategory(selectedMaterial) !== "custom"}
              onClick={updateSelectedMaterial}
              size="sm"
              variant="ghost"
            >
              Update Selected
            </Button>
            <Button
              disabled={resolveMaterialCategory(selectedMaterial) !== "custom"}
              onClick={() => {
                if (selectedMaterial) {
                  onDeleteMaterial(selectedMaterial.id);
                }
              }}
              size="sm"
              variant="ghost"
            >
              Delete Selected
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/8 bg-white/3 p-3">
        <PanelLabel>Selection</PanelLabel>
        <div className="text-[11px] text-foreground/52">
          {canApplyToFaces
            ? `Editing ${selectedFaceIds.length} selected face${selectedFaceIds.length === 1 ? "" : "s"}.`
            : canApplyToObject
              ? "Applying to the whole object."
              : "Select a brush or mesh to apply materials and UV scale."}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">UV Scale</div>
            <label className="flex items-center gap-2 text-[11px] text-foreground/56">
              <Checkbox checked={uvLocked} onCheckedChange={(value) => setUvLocked(Boolean(value))} />
              Lock axes
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DragInput
              compact
              label="U"
              min={0.05}
              onChange={(value) => applyUvAxis("x", value)}
              precision={2}
              step={0.05}
              value={uvDraft.x}
            />
            <DragInput
              compact
              label="V"
              min={0.05}
              onChange={(value) => applyUvAxis("y", value)}
              precision={2}
              step={0.05}
              value={uvDraft.y}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            disabled={!canApplyToObject || !selectedMaterial}
            onClick={() => selectedMaterial && onApplyMaterial(selectedMaterial.id, "object", [])}
            size="sm"
            variant="ghost"
          >
            Apply to Object
          </Button>
          <Button
            disabled={!canApplyToFaces || !selectedMaterial}
            onClick={() => selectedMaterial && onApplyMaterial(selectedMaterial.id, "faces", selectedFaceIds)}
            size="sm"
            variant="ghost"
          >
            Apply to Selected Faces
          </Button>
          <Button
            disabled={!canApplyToObject}
            onClick={() => onSetUvScale("object", [], uvDraft)}
            size="sm"
            variant="ghost"
          >
            Set Object UV
          </Button>
          <Button
            disabled={!canApplyToFaces}
            onClick={() => onSetUvScale("faces", selectedFaceIds, uvDraft)}
            size="sm"
            variant="ghost"
          >
            Set Face UV
          </Button>
        </div>
      </div>
    </div>
  );
}

function PanelLabel({ children }: { children: string }) {
  return <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">{children}</div>;
}

function resolveMaterialCategory(material?: Material) {
  return material?.category ?? "custom";
}

function createDraftMaterial(material?: Material): Material {
  return material
    ? {
        ...structuredClone(material),
        category: "custom",
        metalness: material.metalness ?? 0,
        roughness: material.roughness ?? 0.8
      }
    : {
        category: "custom",
        color: "#b8c0cc",
        id: "material:custom:draft",
        metalness: 0,
        name: "Custom Material",
        roughness: 0.8
      };
}

function createCustomMaterialId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "material";

  return `material:custom:${slug}:${Date.now().toString(36)}`;
}

async function handleTextureUpload(
  field: (typeof TEXTURE_FIELDS)[number]["field"],
  event: ChangeEvent<HTMLInputElement>,
  setDraftMaterial: React.Dispatch<React.SetStateAction<Material>>
) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  setDraftMaterial((current) => ({ ...current, [field]: dataUrl }));
  event.target.value = "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}