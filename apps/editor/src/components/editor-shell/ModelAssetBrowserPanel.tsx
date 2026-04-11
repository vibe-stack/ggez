import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Crosshair, Loader2, Plus, Trash2 } from "lucide-react";
import { Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, Texture, TextureLoader } from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ModelAssetLibraryItem } from "@/lib/model-assets";
import { resolveModelBoundsFromAsset } from "@/lib/model-assets";

type ModelAssetBrowserPanelProps = {
  items: ModelAssetLibraryItem[];
  onDeleteAsset: (assetId: string) => void;
  onFocusAssetNodes: (assetId: string) => void;
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
  onDeleteAsset,
  onFocusAssetNodes,
  onInsertAsset,
  onSelectAsset,
  selectedAssetId
}: ModelAssetBrowserPanelProps) {
  return (
    <ScrollArea className="h-full pr-1">
      <div className="space-y-3 px-1 pb-1">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/8 bg-white/3 px-4 py-8 text-center text-xs text-foreground/48">
            Import a model once, then place it from here.
          </div>
        ) : null}

        {items.map((item) => (
          <ModelAssetCard
            item={item}
            key={item.asset.id}
            onDeleteAsset={onDeleteAsset}
            onFocusAssetNodes={onFocusAssetNodes}
            onInsertAsset={onInsertAsset}
            onSelectAsset={onSelectAsset}
            selected={selectedAssetId === item.asset.id}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function ModelAssetCard({
  item,
  onDeleteAsset,
  onFocusAssetNodes,
  onInsertAsset,
  onSelectAsset,
  selected
}: {
  item: ModelAssetLibraryItem;
  onDeleteAsset: (assetId: string) => void;
  onFocusAssetNodes: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onSelectAsset: (assetId: string) => void;
  selected: boolean;
}) {
  const scene = useLoadedPreviewScene(item);
  const bounds = resolveModelBoundsFromAsset(item.asset);

  return (
    <div
      className={cn(
        "group rounded-2xl border bg-white/3 transition-colors",
        selected ? "border-emerald-400/22 bg-emerald-500/10" : "border-white/8 hover:border-white/14 hover:bg-white/4"
      )}
    >
      <button
        className="block w-full text-left"
        onClick={() => onSelectAsset(item.asset.id)}
        onDoubleClick={() => onInsertAsset(item.asset.id)}
        type="button"
      >
        <div className="relative aspect-16/11 overflow-hidden rounded-t-[15px] bg-[radial-gradient(circle_at_top,rgba(110,231,183,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
          <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <IconActionButton ariaLabel="Add asset to scene" onClick={() => onInsertAsset(item.asset.id)}>
              <Plus className="size-3.5" />
            </IconActionButton>
            {item.usageCount > 0 ? (
              <IconActionButton ariaLabel="Focus placed asset" onClick={() => onFocusAssetNodes(item.asset.id)}>
                <Crosshair className="size-3.5" />
              </IconActionButton>
            ) : (
              <IconActionButton ariaLabel="Delete unused asset" onClick={() => onDeleteAsset(item.asset.id)} destructive>
                <Trash2 className="size-3.5" />
              </IconActionButton>
            )}
          </div>

          {scene ? (
            <Canvas camera={{ fov: 28, position: resolvePreviewCameraPosition(bounds?.size) }} dpr={[1, 1.5]}>
              <color args={["#09100d"]} attach="background" />
              <ambientLight intensity={1.15} />
              <directionalLight intensity={1.8} position={[4, 6, 5]} />
              <directionalLight intensity={0.65} position={[-4, 2, -3]} />
              <group rotation={[0.18, 0.68, 0]}>
                <primitive object={scene} position={resolvePreviewOffset(bounds)} />
              </group>
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center text-foreground/36">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </div>
        <div className="px-3 py-2.5 text-sm font-medium text-foreground/88">{item.label}</div>
      </button>
    </div>
  );
}

function IconActionButton({
  ariaLabel,
  children,
  destructive = false,
  onClick
}: {
  ariaLabel: string;
  children: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      className={cn(
        "pointer-events-auto border border-white/10 bg-black/36 text-foreground/76 backdrop-blur-md hover:bg-white/10 hover:text-foreground",
        destructive && "text-destructive hover:bg-destructive/14 hover:text-destructive"
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function useLoadedPreviewScene(item: ModelAssetLibraryItem) {
  const [scene, setScene] = useState<Object3D>();

  useEffect(() => {
    let cancelled = false;

    void loadPreviewScene(item)
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
  }, [item]);

  return scene;
}

async function loadPreviewScene(item: ModelAssetLibraryItem) {
  const texturePath = typeof item.asset.metadata.texturePath === "string" ? item.asset.metadata.texturePath : undefined;
  const mtlText = typeof item.asset.metadata.materialMtlText === "string" ? item.asset.metadata.materialMtlText : undefined;
  const cacheKey = `${item.format}:${item.asset.path}:${texturePath ?? ""}:${mtlText ?? ""}`;
  const cached = previewSceneCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = (async () => {
    if (item.format === "obj") {
      const objLoader = new OBJLoader();

      if (mtlText) {
        const materialCreator = mtlLoader.parse(patchMtlTextureReferences(mtlText, texturePath), "");
        materialCreator.preload();
        objLoader.setMaterials(materialCreator);
      }

      const object = await objLoader.loadAsync(item.asset.path);

      if (!mtlText && texturePath) {
        const texture = await loadTexture(texturePath);
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

    const gltf = await gltfLoader.loadAsync(item.asset.path);
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
  return bounds ? [-bounds.center.x, -bounds.center.y, -bounds.center.z] as [number, number, number] : [0, 0, 0];
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