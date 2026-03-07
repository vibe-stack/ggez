import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  Copy,
  Cuboid,
  ImagePlus,
  Lock,
  Pencil,
  Plus,
  Save,
  Square,
  Trash2,
  Unlock,
  X
} from "lucide-react";
import { createBlockoutTextureDataUri, vec2, type GeometryNode, type Material, type Vec2 } from "@web-hammer/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | "new" | null>(null);
  const [scope, setScope] = useState<"faces" | "object">("object");
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
    if (scope === "faces" && !canApplyToFaces) {
      setScope("object");
    }
  }, [canApplyToFaces, scope]);

  useEffect(() => {
    if (canApplyToFaces && selectedFaceIds.length > 0) {
      setScope("faces");
    }
  }, [canApplyToFaces, selectedFaceIds.length]);

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

  const resolvedScope = scope === "faces" && canApplyToFaces ? "faces" : "object";
  const resolvedFaceIds = resolvedScope === "faces" ? selectedFaceIds : [];
  const canApply = Boolean(selectedMaterial) && canApplyToObject && (resolvedScope === "object" || canApplyToFaces);

  const saveAsNewMaterial = () => {
    const material = {
      ...draftMaterial,
      category: "custom" as const,
      id: createCustomMaterialId(draftMaterial.name)
    };

    onUpsertMaterial(material);
    onSelectMaterial(material.id);
    setExpandedMaterialId(material.id);
  };

  const updateSelectedMaterial = () => {
    if (expandedMaterialId === "new") {
      const material = {
        ...draftMaterial,
        category: "custom" as const,
        id: createCustomMaterialId(draftMaterial.name)
      };

      onUpsertMaterial(material);
      onSelectMaterial(material.id);
      setExpandedMaterialId(material.id);
      return;
    }

    if (!selectedMaterial || resolveMaterialCategory(selectedMaterial) !== "custom" || !expandedMaterialId) {
      return;
    }

    onUpsertMaterial({
      ...draftMaterial,
      category: "custom",
      id: expandedMaterialId
    });
  };

  const applyCurrentSelection = () => {
    if (!selectedMaterial) {
      return;
    }

    onApplyMaterial(selectedMaterial.id, resolvedScope, resolvedFaceIds);
    onSetUvScale(resolvedScope, resolvedFaceIds, uvDraft);
  };

  const beginNewMaterial = () => {
    setDraftMaterial(createDraftMaterial());
    setExpandedMaterialId("new");
  };

  const beginEditMaterial = (material: Material) => {
    onSelectMaterial(material.id);
    setDraftMaterial(createDraftMaterial(material));
    setExpandedMaterialId(material.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[#0b1512]/96 px-1 pb-3 backdrop-blur-xl">
        <div className="flex items-center gap-1 rounded-2xl bg-white/5 p-1">
          <button
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-medium text-foreground/56 transition-colors",
              resolvedScope === "object" && "bg-white/10 text-foreground"
            )}
            onClick={() => setScope("object")}
            type="button"
          >
            <Cuboid className="size-3.5" />
            <span>Object</span>
          </button>
          <button
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-medium text-foreground/56 transition-colors",
              resolvedScope === "faces" && "bg-white/10 text-foreground",
              !canApplyToFaces && "opacity-35"
            )}
            disabled={!canApplyToFaces}
            onClick={() => setScope("faces")}
            type="button"
          >
            <Square className="size-3.5" />
            <span>Face</span>
          </button>
        </div>

        <Button aria-label="Create custom material" onClick={beginNewMaterial} size="icon-sm" title="Create custom material" variant="ghost">
          <Plus />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-1">
        <div className="space-y-5 px-1 pb-4">
          <div className="space-y-2">
            <PanelLabel>Flat</PanelLabel>
            <div className="grid grid-cols-5 gap-2">
          {flatMaterials.map((material) => (
            <button
              className={cn(
                "size-8 rounded-xl transition-transform hover:scale-[1.04]",
                selectedMaterialId === material.id && "bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
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
            <PanelLabel>Blockout</PanelLabel>
            <div className="flex flex-wrap gap-2">
          {blockoutMaterials.map((material) => (
            <button
              className={cn(
                "size-8 rounded-xl bg-white/4 bg-cover bg-center transition-transform hover:scale-[1.04]",
                selectedMaterialId === material.id && "bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
              )}
              key={material.id}
              onClick={() => onSelectMaterial(material.id)}
              style={{
                backgroundColor: material.color,
                backgroundImage: `url(${createBlockoutTextureDataUri(material.color, material.edgeColor ?? "#f5f2ea", material.edgeThickness ?? 0.018)})`,
                backgroundPosition: "center",
                backgroundSize: "cover"
              }}
              title={material.name}
              type="button"
            />
          ))}
            </div>
        </div>

          <div className="space-y-2">
            <PanelLabel>Custom</PanelLabel>
            <div className="space-y-1.5">
            {customMaterials.map((material) => (
              <div className="space-y-2" key={material.id}>
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/5",
                    selectedMaterialId === material.id && "bg-white/8"
                  )}
                  onClick={() => onSelectMaterial(material.id)}
                  type="button"
                >
                  <div
                    className="size-8 shrink-0 rounded-xl bg-[#121619] bg-cover bg-center"
                    style={{
                      backgroundColor: material.color,
                      backgroundImage: material.colorTexture ? `url(${material.colorTexture})` : undefined
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-foreground/84">{material.name}</div>
                  </div>
                  <Button
                    aria-label={`Edit ${material.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (expandedMaterialId === material.id) {
                        setExpandedMaterialId(null);
                        return;
                      }
                      beginEditMaterial(material);
                    }}
                    size="icon-xs"
                    title={`Edit ${material.name}`}
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                </button>

                {expandedMaterialId === material.id ? (
                  <MaterialEditorForm
                    draftMaterial={draftMaterial}
                    fileInputsRef={fileInputsRef}
                    isNew={false}
                    onChangeDraft={setDraftMaterial}
                    onDelete={() => onDeleteMaterial(material.id)}
                    onSave={updateSelectedMaterial}
                    onSaveAsNew={saveAsNewMaterial}
                  />
                ) : null}
              </div>
            ))}
            {customMaterials.length === 0 && expandedMaterialId !== "new" ? (
              <div className="px-2 py-3 text-[11px] text-foreground/40">No custom materials yet.</div>
            ) : null}

            {expandedMaterialId === "new" ? (
              <MaterialEditorForm
                draftMaterial={draftMaterial}
                fileInputsRef={fileInputsRef}
                isNew
                onChangeDraft={setDraftMaterial}
                onDelete={() => setExpandedMaterialId(null)}
                onSave={updateSelectedMaterial}
                onSaveAsNew={saveAsNewMaterial}
              />
            ) : null}
          </div>
        </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <PanelLabel>UV</PanelLabel>
              <Button
                aria-label={uvLocked ? "Unlock UV axes" : "Lock UV axes"}
                onClick={() => setUvLocked((current) => !current)}
                size="icon-xs"
                title={uvLocked ? "Unlock UV axes" : "Lock UV axes"}
                variant="ghost"
              >
                {uvLocked ? <Lock /> : <Unlock />}
              </Button>
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
        </div>
      </ScrollArea>

      <div className="sticky bottom-0 z-10 mt-2 bg-[#0b1512]/96 px-1 pt-3 backdrop-blur-xl">
        <Button
          className="w-full justify-center gap-2 rounded-2xl bg-emerald-500/14 text-emerald-100 hover:bg-emerald-500/22"
          disabled={!canApply}
          onClick={applyCurrentSelection}
          size="sm"
          variant="ghost"
        >
          <Check className="size-4" />
          <span>Apply</span>
        </Button>
      </div>
    </div>
  );
}

function PanelLabel({ children }: { children: string }) {
  return <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">{children}</div>;
}

function MaterialEditorForm({
  draftMaterial,
  fileInputsRef,
  isNew,
  onChangeDraft,
  onDelete,
  onSave,
  onSaveAsNew
}: {
  draftMaterial: Material;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  isNew: boolean;
  onChangeDraft: React.Dispatch<React.SetStateAction<Material>>;
  onDelete: () => void;
  onSave: () => void;
  onSaveAsNew: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-white/[0.04] p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <PanelLabel>Name</PanelLabel>
          <Input
            className="border-0 bg-white/6"
            onChange={(event) => onChangeDraft((current) => ({ ...current, name: event.target.value }))}
            value={draftMaterial.name}
          />
        </div>
        <label className="flex shrink-0 flex-col gap-1">
          <PanelLabel>Color</PanelLabel>
          <input
            className="h-9 w-10 rounded-xl bg-transparent p-0"
            onChange={(event) => onChangeDraft((current) => ({ ...current, color: event.target.value }))}
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
          onChange={(value) => onChangeDraft((current) => ({ ...current, metalness: value }))}
          precision={2}
          step={0.01}
          value={draftMaterial.metalness ?? 0}
        />
        <DragInput
          compact
          label="Rough"
          max={1}
          min={0}
          onChange={(value) => onChangeDraft((current) => ({ ...current, roughness: value }))}
          precision={2}
          step={0.01}
          value={draftMaterial.roughness ?? 0.8}
        />
      </div>

      <div className="space-y-2">
        {TEXTURE_FIELDS.map(({ field, label }) => (
          <div className="flex items-center gap-2" key={field}>
            <div
              className="size-8 shrink-0 rounded-xl bg-[#121619] bg-cover bg-center"
              style={{ backgroundImage: draftMaterial[field] ? `url(${draftMaterial[field]})` : undefined }}
            />
            <div className="min-w-0 flex-1 text-[11px] text-foreground/64">{label}</div>
            <Button aria-label={`Add ${label}`} onClick={() => fileInputsRef.current[field]?.click()} size="icon-xs" title={`Add ${label}`} variant="ghost">
              <ImagePlus />
            </Button>
            <Button
              aria-label={`Clear ${label}`}
              disabled={!draftMaterial[field]}
              onClick={() => onChangeDraft((current) => ({ ...current, [field]: undefined }))}
              size="icon-xs"
              title={`Clear ${label}`}
              variant="ghost"
            >
              <X />
            </Button>
            <input
              accept="image/*"
              hidden
              onChange={(event) => void handleTextureUpload(field, event, onChangeDraft)}
              ref={(element) => {
                fileInputsRef.current[field] = element;
              }}
              type="file"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1">
        <Button aria-label={isNew ? "Save material" : "Update material"} onClick={onSave} size="icon-xs" title={isNew ? "Save material" : "Update material"} variant="ghost">
          <Save />
        </Button>
        <Button aria-label="Save as new material" onClick={onSaveAsNew} size="icon-xs" title="Save as new material" variant="ghost">
          <Copy />
        </Button>
        <Button aria-label={isNew ? "Close editor" : "Delete material"} onClick={onDelete} size="icon-xs" title={isNew ? "Close editor" : "Delete material"} variant="ghost">
          {isNew ? <X /> : <Trash2 />}
        </Button>
      </div>
    </div>
  );
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