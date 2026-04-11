import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Crosshair, Expand, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, Texture, TextureLoader } from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildModelLodLevelOrder, HIGH_MODEL_LOD_LEVEL, type ModelAssetFile, type ModelLodLevel, type WorldLodLevelDefinition } from "@ggez/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ModelAssetLibraryItem } from "@/lib/model-assets";
import { resolveModelBoundsFromAsset } from "@/lib/model-assets";

type ModelAssetBrowserPanelProps = {
  items: ModelAssetLibraryItem[];
  lodLevels: WorldLodLevelDefinition[];
  onAssignAssetLod: (assetId: string, level: ModelLodLevel) => void;
  onClearAssetLod: (assetId: string, level: ModelLodLevel) => void;
  onDeleteAsset: (assetId: string) => void;
  onFocusAssetNodes: (assetId: string) => void;
  onImportAsset: () => void;
  onInsertAsset: (assetId: string) => void;
  onSelectAsset: (assetId: string) => void;
  selectedAssetId: string;
};

const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const objTextureLoader = new TextureLoader();
const previewSceneCache = new Map<string, Promise<Object3D>>();
const previewTextureCache = new Map<string, Promise<Texture>>();

export function ModelAssetBrowserPanel({
  items,
  lodLevels,
  onAssignAssetLod,
  onClearAssetLod,
  onDeleteAsset,
  onFocusAssetNodes,
  onImportAsset,
  onInsertAsset,
  onSelectAsset,
  selectedAssetId
}: ModelAssetBrowserPanelProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const levelDefinitions = useMemo(
    () => [
      { distance: 0, id: HIGH_MODEL_LOD_LEVEL, label: "High" },
      ...lodLevels
    ],
    [lodLevels]
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.asset.id === selectedAssetId) ?? items[0],
    [items, selectedAssetId]
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col pt-10">
        <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/38">Model Assets</div>
          <div className="flex shrink-0 items-center gap-1">
            <Button className="gap-1.5" onClick={onImportAsset} size="xs" variant="ghost">
              <Upload className="size-3.5" />
              Import
            </Button>
            <Button className="gap-1.5" onClick={() => setLibraryOpen(true)} size="xs" variant="ghost">
              <Expand className="size-3.5" />
              Library
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl bg-white/4 px-4 py-10 text-center text-xs text-foreground/40">
            Import a model to get started. Use the library to manage LOD files per asset.
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-px">
              {items.map((item) => (
                <AssetRow
                  item={item}
                  key={item.asset.id}
                  levelDefinitions={levelDefinitions}
                  onFocusAssetNodes={onFocusAssetNodes}
                  onInsertAsset={onInsertAsset}
                  onSelectAsset={onSelectAsset}
                  selected={selectedItem?.asset.id === item.asset.id}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog onOpenChange={setLibraryOpen} open={libraryOpen} modal>
        <DialogContent className="flex h-[min(54rem,calc(100vh-2rem))] flex-col rounded-2xl bg-[#08110e]/96 p-0 text-foreground shadow-[0_32px_96px_rgba(0,0,0,0.56)] sm:max-w-[min(90rem,calc(100vw-2rem))]" showCloseButton={false}>
          <DialogHeader className="flex-row items-center justify-between px-6 py-4">
            <div>
              <DialogTitle className="text-base">Model Library</DialogTitle>
              <div className="mt-0.5 text-xs text-foreground/46">Author one asset with explicit high, mid, and low source files.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button className="gap-1.5" onClick={onImportAsset} size="xs" variant="ghost">
                <Upload className="size-3.5" />
                Import Model
              </Button>
              <Button onClick={() => setLibraryOpen(false)} size="icon-xs" variant="ghost">
                <X className="size-3.5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="w-72 shrink-0 overflow-hidden bg-black/20">
              <ScrollArea className="h-full px-3 py-3">
                <div className="space-y-px pb-2">
                  {items.map((item) => (
                    <AssetRow
                      item={item}
                      key={item.asset.id}
                      levelDefinitions={levelDefinitions}
                      onFocusAssetNodes={onFocusAssetNodes}
                      onInsertAsset={onInsertAsset}
                      onSelectAsset={onSelectAsset}
                      selected={selectedItem?.asset.id === item.asset.id}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="min-w-0 flex-1">
              {selectedItem ? (
                <ModelAssetDetailPane
                  item={selectedItem}
                  levelDefinitions={levelDefinitions}
                  onAssignAssetLod={onAssignAssetLod}
                  onClearAssetLod={onClearAssetLod}
                  onDeleteAsset={onDeleteAsset}
                  onFocusAssetNodes={onFocusAssetNodes}
                  onInsertAsset={onInsertAsset}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-foreground/52">Select a model asset.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


function AssetRow({
  item,
  levelDefinitions,
  onFocusAssetNodes,
  onInsertAsset,
  onSelectAsset,
  selected
}: {
  item: ModelAssetLibraryItem;
  levelDefinitions: WorldLodLevelDefinition[];
  onFocusAssetNodes: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onSelectAsset: (assetId: string) => void;
  selected: boolean;
}) {
  const levelsForItem = useMemo(
    () => resolveLevelDefinitionsForItem(levelDefinitions, item.files),
    [levelDefinitions, item.files]
  );

  return (
    <button
      className={cn(
        "group flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors",
        selected ? "bg-emerald-500/10" : "hover:bg-white/4"
      )}
      onClick={() => onSelectAsset(item.asset.id)}
      type="button"
    >
      <div className="flex w-full items-center gap-2">
        <span
          className={cn(
            "flex-1 truncate text-sm font-medium",
            selected ? "text-foreground/95" : "text-foreground/80"
          )}
        >
          {item.label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {levelsForItem.map((level) => {
            const hasFile = item.files.some((f) => f.level === level.id);
            return (
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wider",
                  hasFile ? "text-emerald-400/75" : "text-foreground/20"
                )}
                key={level.id}
              >
                {level.label.charAt(0)}
              </span>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onInsertAsset(item.asset.id);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFocusAssetNodes(item.asset.id);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <Crosshair className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="text-[10px] text-foreground/40">
        {item.usageCount} placed
        {" · "}
        {item.files.length} file{item.files.length === 1 ? "" : "s"}
        {" · "}
        {item.source}
      </div>
    </button>
  );
}

function ModelAssetDetailPane({
  item,
  levelDefinitions,
  onAssignAssetLod,
  onClearAssetLod,
  onDeleteAsset,
  onFocusAssetNodes,
  onInsertAsset
}: {
  item: ModelAssetLibraryItem;
  levelDefinitions: WorldLodLevelDefinition[];
  onAssignAssetLod: (assetId: string, level: ModelLodLevel) => void;
  onClearAssetLod: (assetId: string, level: ModelLodLevel) => void;
  onDeleteAsset: (assetId: string) => void;
  onFocusAssetNodes: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
}) {
  const bounds = resolveModelBoundsFromAsset(item.asset);
  const resolvedLevelDefinitions = useMemo(() => resolveLevelDefinitionsForItem(levelDefinitions, item.files), [item.files, levelDefinitions]);
  const [previewLevel, setPreviewLevel] = useState<ModelLodLevel>(HIGH_MODEL_LOD_LEVEL);
  const previewFile = item.files.find((file) => file.level === previewLevel) ?? item.files[0];
  const scene = useLoadedPreviewScene(previewFile);

  useEffect(() => {
    setPreviewLevel(HIGH_MODEL_LOD_LEVEL);
  }, [item.asset.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top section: preview + asset info side by side */}
      <div className="flex shrink-0 items-start gap-6 px-6 pt-6 pb-5">
        {/* Preview canvas */}
        <div className="w-64 shrink-0 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,rgba(110,231,183,0.10),transparent_40%),linear-gradient(180deg,#07100d_0%,#050806_100%)]">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="text-xs font-medium text-foreground/60">Preview</div>
            <div className="flex items-center gap-px rounded-lg bg-black/30 p-0.5">
              {resolvedLevelDefinitions.map((level) => {
                const hasFile = item.files.some((file) => file.level === level.id);
                return (
                  <Button
                    className={cn(
                      "h-6 min-w-7 px-1.5 text-[9px] font-bold uppercase tracking-wider",
                      previewLevel === level.id ? "bg-emerald-500/20 text-emerald-200" : "text-foreground/40"
                    )}
                    disabled={!hasFile}
                    key={level.id}
                    onClick={() => setPreviewLevel(level.id)}
                    size="xs"
                    variant="ghost"
                  >
                    {level.label.charAt(0)}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="aspect-square">
            {scene ? (
              <Canvas camera={{ fov: 28, position: resolvePreviewCameraPosition(bounds?.size) }} dpr={[1, 1.5]}>
                <color args={["#060c0a"]} attach="background" />
                <ambientLight intensity={1.2} />
                <directionalLight intensity={2.0} position={[4, 6, 5]} />
                <directionalLight intensity={0.5} position={[-4, 2, -3]} />
                <group rotation={[0.18, 0.68, 0]}>
                  <primitive object={scene} position={resolvePreviewOffset(bounds)} />
                </group>
              </Canvas>
            ) : (
              <div className="flex h-full items-center justify-center text-foreground/30">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Asset info */}
        <div className="flex min-w-0 flex-1 flex-col gap-5 pt-1">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/36">Model Asset</div>
            <div className="mt-1.5 text-2xl font-semibold leading-tight text-foreground">{item.label}</div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-foreground/52">
              <InfoPill>{item.source}</InfoPill>
              <InfoPill>{item.usageCount} placement{item.usageCount === 1 ? "" : "s"}</InfoPill>
              <InfoPill>{item.files.length} authored file{item.files.length === 1 ? "" : "s"}</InfoPill>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 max-w-xs">
            <MetricCard label="Width" value={formatAxis(bounds?.size.x)} />
            <MetricCard label="Height" value={formatAxis(bounds?.size.y)} />
            <MetricCard label="Depth" value={formatAxis(bounds?.size.z)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="gap-1.5" onClick={() => onInsertAsset(item.asset.id)} size="xs" variant="ghost">
              <Plus className="size-3.5" />
              Place Asset
            </Button>
            <Button className="gap-1.5" onClick={() => onFocusAssetNodes(item.asset.id)} size="xs" variant="ghost">
              <Crosshair className="size-3.5" />
              Focus Placements
            </Button>
            {item.usageCount === 0 ? (
              <Button className="gap-1.5 text-destructive" onClick={() => onDeleteAsset(item.asset.id)} size="xs" variant="ghost">
                <Trash2 className="size-3.5" />
                Delete Asset
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 mb-4 h-px bg-white/6" />

      {/* LOD table */}
      <ScrollArea className="min-h-0 flex-1 px-6 pb-6">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-foreground/80">Authored LOD Files</div>
            <div className="mt-0.5 text-xs text-foreground/46">
              Configure named mesh tiers here. World settings controls the distance at which each activates.
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-white/4">
            <div className="grid grid-cols-[minmax(0,1.25fr)_6rem_9rem_8rem] gap-3 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/36">
              <div>Level</div>
              <div>Distance</div>
              <div>Source</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="space-y-px">
              {resolvedLevelDefinitions.map((level) => (
                <LodSlotRow
                  assetId={item.asset.id}
                  file={item.files.find((entry) => entry.level === level.id)}
                  key={level.id}
                  level={level}
                  onAssignAssetLod={onAssignAssetLod}
                  onClearAssetLod={onClearAssetLod}
                />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function LodSlotRow({
  assetId,
  file,
  level,
  onAssignAssetLod,
  onClearAssetLod
}: {
  assetId: string;
  file?: ModelAssetFile;
  level: WorldLodLevelDefinition;
  onAssignAssetLod: (assetId: string, level: ModelLodLevel) => void;
  onClearAssetLod: (assetId: string, level: ModelLodLevel) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1.25fr)_6rem_9rem_8rem] items-center gap-3 rounded-lg bg-white/3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div>
          <div className="text-[10px] font-medium tracking-[0.14em] text-foreground/40 uppercase">{level.id}</div>
          <div className="mt-1 text-sm font-medium text-foreground/86">{file ? file.format.toUpperCase() : "Not set"}</div>
        </div>
      </div>
      <div className="text-xs text-foreground/66">{level.distance.toFixed(0)}m</div>
      <div className="min-w-0 text-xs text-foreground/66">{file ? describeAssetFileSource(file) : "Missing"}</div>
      <div className="flex justify-end gap-1.5">
        <Button onClick={() => onAssignAssetLod(assetId, level.id)} size="xs" variant="ghost">
          {file ? "Replace" : "Add"}
        </Button>
        {level.id !== HIGH_MODEL_LOD_LEVEL && file ? (
          <Button className="text-foreground/60" onClick={() => onClearAssetLod(assetId, level.id)} size="xs" variant="ghost">
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <div className="text-[10px] font-medium tracking-[0.14em] text-foreground/40 uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground/86">{value}</div>
    </div>
  );
}

function InfoPill({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-white/6 px-2.5 py-1">{children}</div>
}

function useLoadedPreviewScene(file?: ModelAssetFile) {
  const [scene, setScene] = useState<Object3D>();

  useEffect(() => {
    if (!file?.path) {
      setScene(undefined);
      return;
    }

    let cancelled = false;

    void loadPreviewScene(file)
      .then((loaded) => {
        if (cancelled) {
          return;
        }

        setScene(loaded.clone(true));
      })
      .catch(() => {
        if (!cancelled) {
          setScene(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  return scene;
}

async function loadPreviewScene(file: ModelAssetFile) {
  const cacheKey = `${file.level}:${file.format}:${file.path}:${file.texturePath ?? ""}:${file.materialMtlText ?? ""}`;
  const cached = previewSceneCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = (async () => {
    if (file.format === "obj") {
      const objLoader = new OBJLoader();

      if (file.materialMtlText) {
        const materialCreator = mtlLoader.parse(patchMtlTextureReferences(file.materialMtlText, file.texturePath), "");
        materialCreator.preload();
        objLoader.setMaterials(materialCreator);
      }

      const object = await objLoader.loadAsync(file.path);

      if (!file.materialMtlText && file.texturePath) {
        const texture = await loadTexture(file.texturePath);
        object.traverse((child) => {
          if (child instanceof Mesh) {
            child.material = new MeshStandardMaterial({
              map: texture,
              metalness: 0.12,
              roughness: 0.76
            });
          }
        });
      }

      return object;
    }

    const gltf = await gltfLoader.loadAsync(file.path);
    return gltf.scene;
  })();

  previewSceneCache.set(cacheKey, pending);
  return pending;
}

async function loadTexture(path: string) {
  const cached = previewTextureCache.get(path);

  if (cached) {
    return cached;
  }

  const pending = objTextureLoader.loadAsync(path).then((texture) => {
    texture.colorSpace = SRGBColorSpace;
    return texture;
  });
  previewTextureCache.set(path, pending);
  return pending;
}

function resolvePreviewCameraPosition(size?: { x: number; y: number; z: number }): [number, number, number] {
  const radius = Math.max(size?.x ?? 1, size?.y ?? 1, size?.z ?? 1, 1) * 1.45;
  return [radius, radius * 0.78, radius];
}

function resolvePreviewOffset(bounds?: { center: { x: number; y: number; z: number } }) {
  return bounds ? ([-bounds.center.x, -bounds.center.y, -bounds.center.z] as [number, number, number]) : [0, 0, 0];
}

function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern = /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap ? normalized : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}

function shortenAssetPath(path: string) {
  if (path.startsWith("data:")) {
    const separatorIndex = path.indexOf(",");
    return separatorIndex >= 0 ? `${path.slice(0, separatorIndex)}...` : path;
  }

  return path.split("/").slice(-2).join("/");
}

function formatAxis(value?: number) {
  return typeof value === "number" ? value.toFixed(2) : "-";
}

function resolveLevelDefinitionsForItem(levelDefinitions: WorldLodLevelDefinition[], files: ModelAssetFile[]) {
  const configuredLevels = buildModelLodLevelOrder([HIGH_MODEL_LOD_LEVEL, ...levelDefinitions.map((level) => level.id), ...files.map((file) => file.level)]);

  return configuredLevels.map((levelId) => {
    if (levelId === HIGH_MODEL_LOD_LEVEL) {
      return {
        distance: 0,
        id: HIGH_MODEL_LOD_LEVEL,
        label: "High"
      } satisfies WorldLodLevelDefinition;
    }

    return levelDefinitions.find((level) => level.id === levelId) ?? {
      distance: 0,
      id: levelId,
      label: levelId.replace(/[-_]+/g, " ")
    } satisfies WorldLodLevelDefinition;
  });
}

function describeAssetFileSource(file: ModelAssetFile) {
  if (file.path.startsWith("data:")) {
    return `Embedded ${file.format.toUpperCase()}`;
  }

  return file.path.split("/").pop() ?? `${file.format.toUpperCase()} file`;
}