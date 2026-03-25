import {
  ImagePlus,
  Layers,
  LoaderCircle,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { createPortal } from "react-dom";
import type { TextureKind, TextureRecord } from "@ggez/shared";
import {
  createTextureGenerator,
  TEXTURE_GENERATION_MODELS,
  type TextureGenerationModelId,
  type TextureGenerationRequest
} from "@/lib/texture-generation";
import { saveTextureFileToProject, isElectronMode, getProjectPath } from "@/lib/texture-fs";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TextureBrowserOverlayProps = {
  initialMode: "generate" | "library";
  onApplyGeneratedTextures: (textures: TextureRecord[]) => void;
  onClose: () => void;
  onCreateTexture: (texture: TextureRecord) => void;
  onDeleteTexture: (texture: TextureRecord) => void;
  onSelectTexture: (texture: TextureRecord) => void;
  open: boolean;
  targetKind: TextureKind;
  targetLabel: string;
  textures: TextureRecord[];
};

const TEXTURE_SIZES = [256, 512, 1024, 2048, 4096] as const;

export function TextureBrowserOverlay({
  initialMode,
  onApplyGeneratedTextures,
  onClose,
  onCreateTexture,
  onDeleteTexture,
  onSelectTexture,
  open,
  targetKind,
  targetLabel,
  textures
}: TextureBrowserOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [mode, setMode] = useState<"generate" | "library">(initialMode);
  const [position, setPosition] = useState({ x: 340, y: 88 });
  const [error, setError] = useState<string>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingDeleteTexture, setPendingDeleteTexture] =
    useState<TextureRecord | null>(null);
  const [quickGeneratingTextureIds, setQuickGeneratingTextureIds] = useState<
    string[]
  >([]);
  const [generationRequest, setGenerationRequest] =
    useState<TextureGenerationRequest>(() =>
      createDefaultGenerationRequest(targetKind)
    );

  const sortedTextures = useMemo(
    () =>
      [...textures].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ),
    [textures]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode(initialMode);
    setError(undefined);
    setGenerationRequest(createDefaultGenerationRequest(targetKind));
    setPosition((current) =>
      clampOverlayPosition(
        current,
        overlayRef.current?.offsetWidth ?? 620,
        overlayRef.current?.offsetHeight ?? 720
      )
    );
  }, [initialMode, open, targetKind]);

  if (!open) {
    return null;
  }

  const handleSelectExistingTexture = (texture: TextureRecord) => {
    setError(undefined);
    onSelectTexture(texture);
    onClose();
  };

  const handleUploadTexture = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setError(undefined);

      let dataUrl: string;
      let filePath: string | undefined;

      // In Electron: save to project disk and use trident:// URL
      const projectPath = await getProjectPath();
      if (isElectronMode() && projectPath) {
        const saved = await saveTextureFileToProject(file, projectPath);
        if (saved) {
          dataUrl = saved.tridentUrl;
          filePath = saved.filePath;
        } else {
          dataUrl = await readFileAsDataUrl(file);
        }
      } else {
        // Browser fallback: Base64 data URL
        dataUrl = await readFileAsDataUrl(file);
      }

      const texture = createTextureRecord({
        dataUrl,
        filePath,
        kind: targetKind,
        mimeType: file.type || "image/png",
        name: stripExtension(file.name) || `${targetLabel} Texture`,
        source: "upload"
      });

      onCreateTexture(texture);
      onSelectTexture(texture);
      onClose();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload texture."
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleGenerateTextures = async () => {
    if (!canGenerate(generationRequest) || isGenerating) {
      return;
    }

    try {
      setIsGenerating(true);
      setError(undefined);
      const generator = createTextureGenerator();
      const generated = await generator.generateTextures(generationRequest);
      const records = generated.map((texture) =>
        createTextureRecord(texture)
      );

      records.forEach(onCreateTexture);
      onApplyGeneratedTextures(records);
      setMode("library");
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate textures."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickGenerate = async (
    texture: TextureRecord,
    kind: TextureKind
  ) => {
    try {
      setError(undefined);
      setQuickGeneratingTextureIds((current) => [...current, texture.id]);
      const generator = createTextureGenerator();
      const generated = await generator.generateTextures({
        maps: {
          color: kind === "color",
          metalness: kind === "metalness",
          normal: kind === "normal",
          roughness: kind === "roughness"
        },
        model: "nano-banana-2",
        prompt: texture.prompt ?? texture.name,
        size: coerceTextureSize(texture.size),
        sourceTextureDataUrl: texture.dataUrl
      });

      generated
        .map((entry) => createTextureRecord(entry))
        .forEach(onCreateTexture);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate texture maps."
      );
    } finally {
      setQuickGeneratingTextureIds((current) =>
        current.filter((id) => id !== texture.id)
      );
    }
  };

  const handleHeaderPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const target = event.target as HTMLElement;

    if (target.closest("[data-no-drag='true']")) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: position.x,
      startY: position.y
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHeaderPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setPosition(
      clampOverlayPosition(
        {
          x: dragState.startX + (event.clientX - dragState.startPointerX),
          y: dragState.startY + (event.clientY - dragState.startPointerY)
        },
        overlayRef.current?.offsetWidth ?? 620,
        overlayRef.current?.offsetHeight ?? 720
      )
    );
  };

  const handleHeaderPointerRelease = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const overlay = (
    <div className="pointer-events-none fixed inset-0 z-40">
      <FloatingPanel
        className="absolute flex h-[min(44rem,calc(100vh-7rem))] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden border border-white/10 bg-[#09110f]/88"
        ref={overlayRef}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      >
        <div
          className="flex cursor-grab items-center justify-between gap-2 border-b border-white/8 px-4 py-3 active:cursor-grabbing"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerRelease}
          onPointerCancel={handleHeaderPointerRelease}
          onLostPointerCapture={handleHeaderPointerRelease}
        >
          <div className="min-w-0">
            <div className="text-[10px] font-medium tracking-[0.22em] text-foreground/38 uppercase">
              Texture Browser
            </div>
            <div className="truncate text-sm font-medium text-foreground/86">
              {mode === "library" ? targetLabel : "Generate with AI"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {mode === "library" ? (
              <>
                <Button
                  aria-label="Upload texture"
                  data-no-drag="true"
                  onClick={() => uploadInputRef.current?.click()}
                  size="icon-xs"
                  title="Upload texture"
                  variant="ghost"
                >
                  <Upload />
                </Button>
                <Button
                  aria-label="Generate texture"
                  data-no-drag="true"
                  onClick={() => setMode("generate")}
                  size="icon-xs"
                  title="Generate texture"
                  variant="ghost"
                >
                  <Sparkles />
                </Button>
              </>
            ) : (
              <Button
                aria-label="Back to library"
                data-no-drag="true"
                onClick={() => setMode("library")}
                size="icon-xs"
                title="Back to library"
                variant="ghost"
              >
                <ImagePlus />
              </Button>
            )}
            <Button
              aria-label="Close texture browser"
              data-no-drag="true"
              onClick={onClose}
              size="icon-xs"
              title="Close texture browser"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        </div>

        <input
          accept="image/*"
          hidden
          onChange={handleUploadTexture}
          ref={uploadInputRef}
          type="file"
        />

        {mode === "library" ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 px-4 py-4">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/38 uppercase">
                    In File
                  </div>
                  <div className="text-xs text-foreground/72">
                    {sortedTextures.length} stored textures
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label="Upload texture"
                    onClick={() => uploadInputRef.current?.click()}
                    size="icon-xs"
                    title="Upload texture"
                    variant="ghost"
                  >
                    <Upload />
                  </Button>
                  <Button
                    aria-label="Generate texture"
                    onClick={() => setMode("generate")}
                    size="icon-xs"
                    title="Generate texture"
                    variant="ghost"
                  >
                    <Sparkles />
                  </Button>
                </div>
              </div>

              {sortedTextures.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 pr-1 sm:grid-cols-3">
                  {sortedTextures.map((texture) => {
                    const quickGenerating = quickGeneratingTextureIds.includes(
                      texture.id
                    );

                    return (
                      <ContextMenu key={texture.id}>
                        <ContextMenuTrigger>
                          <button
                            className={cn(
                              "group relative flex min-h-36 w-full flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] text-left transition-colors hover:border-emerald-400/28 hover:bg-white/[0.05]",
                              texture.kind === targetKind &&
                                "border-emerald-400/26 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]"
                            )}
                            onClick={() => handleSelectExistingTexture(texture)}
                            type="button"
                          >
                            <div
                              className="aspect-square w-full bg-[#121619] bg-cover bg-center"
                              style={{ backgroundImage: `url(${texture.dataUrl})` }}
                            />
                            {quickGenerating ? (
                              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground/82">
                                <LoaderCircle className="size-3 animate-spin" />
                                <span>AI</span>
                              </div>
                            ) : null}
                            <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                              <div className="truncate text-[11px] font-medium text-foreground/84">
                                {texture.name}
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-foreground/38">
                                <span>{formatTextureKind(texture.kind)}</span>
                                <span>{formatTextureSource(texture.source)}</span>
                              </div>
                            </div>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="rounded-2xl bg-[#0d1714]/96">
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <Layers />
                              <span>Generate</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="rounded-2xl bg-[#0d1714]/96">
                              {(
                                [
                                  ["color", "Color Texture"],
                                  ["normal", "Normal Map"],
                                  ["roughness", "Roughness Map"],
                                  ["metalness", "Metalness Map"]
                                ] as const
                              ).map(([kind, label]) => (
                                <ContextMenuItem
                                  key={kind}
                                  onClick={() =>
                                    void handleQuickGenerate(texture, kind)
                                  }
                                >
                                  <Sparkles />
                                  <span>{label}</span>
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => setPendingDeleteTexture(texture)}
                            variant="destructive"
                          >
                            <Trash2 />
                            <span>Delete</span>
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-foreground/46">
                  No textures stored in this file yet.
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-2">
                <FieldLabel>Model</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    setGenerationRequest((current) => ({
                      ...current,
                      model: value as TextureGenerationModelId
                    }))
                  }
                  value={generationRequest.model}
                >
                  <SelectTrigger className="w-full border-white/10 bg-white/[0.04]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl bg-[#0d1714]/96">
                    {TEXTURE_GENERATION_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Prompt</FieldLabel>
                <Textarea
                  className="min-h-28 border-white/10 bg-white/[0.04]"
                  onChange={(event) =>
                    setGenerationRequest((current) => ({
                      ...current,
                      prompt: event.target.value
                    }))
                  }
                  placeholder="Brushed dark steel with subtle scratches and industrial wear..."
                  value={generationRequest.prompt}
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Maps</FieldLabel>
                <div className="grid gap-2">
                  {(
                    [
                      ["color", "Color Texture"],
                      ["normal", "Normal Map"],
                      ["metalness", "Metalness Map"],
                      ["roughness", "Roughness Map"]
                    ] as const
                  ).map(([kind, label]) => {
                    const derivativesSelected =
                      generationRequest.maps.normal ||
                      generationRequest.maps.metalness ||
                      generationRequest.maps.roughness;
                    const colorLocked =
                      kind === "color" && derivativesSelected;

                    return (
                      <div
                        className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2"
                        key={kind}
                      >
                        <div className="text-xs text-foreground/74">{label}</div>
                        <Switch
                          checked={generationRequest.maps[kind]}
                          disabled={colorLocked}
                          onCheckedChange={(checked) =>
                            setGenerationRequest((current) =>
                              updateMapSelection(current, kind, checked)
                            )
                          }
                          size="sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel>Size</FieldLabel>
                <div className="grid grid-cols-5 gap-2">
                  {TEXTURE_SIZES.map((size) => (
                    <button
                      className={cn(
                        "h-9 rounded-xl border border-white/8 bg-white/[0.03] text-[11px] font-medium text-foreground/62 transition-colors hover:bg-white/[0.05]",
                        generationRequest.size === size &&
                          "border-emerald-400/26 bg-emerald-500/12 text-emerald-100"
                      )}
                      key={size}
                      onClick={() =>
                        setGenerationRequest((current) => ({
                          ...current,
                          size
                        }))
                      }
                      type="button"
                    >
                      {formatTextureSize(size)}
                    </button>
                  ))}
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-400/18 bg-rose-500/8 px-3 py-2 text-xs text-rose-100/88">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  className="gap-2 rounded-2xl bg-emerald-500/18 text-emerald-100 hover:bg-emerald-500/24"
                  disabled={!canGenerate(generationRequest) || isGenerating}
                  onClick={handleGenerateTextures}
                  size="sm"
                  variant="ghost"
                >
                  {isGenerating ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  <span>{isGenerating ? "Generating" : "Generate"}</span>
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </FloatingPanel>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingDeleteTexture(null);
          }
        }}
        open={Boolean(pendingDeleteTexture)}
      >
        <DialogContent className="max-w-sm rounded-2xl border border-white/10 bg-[#0b1311]/96" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Texture</DialogTitle>
            <DialogDescription>
              This removes the texture from the file and clears every material
              slot using it. Deleted color textures fall back to the default
              grey blockout base.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-white/8 bg-white/[0.03]">
            <Button
              onClick={() => setPendingDeleteTexture(null)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-500/16 text-rose-100 hover:bg-rose-500/24"
              onClick={() => {
                if (!pendingDeleteTexture) {
                  return;
                }

                onDeleteTexture(pendingDeleteTexture);
                setPendingDeleteTexture(null);
              }}
              size="sm"
              variant="ghost"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(overlay, document.body);
}

function FieldLabel({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/38 uppercase">
      {children}
    </div>
  );
}

function createDefaultGenerationRequest(targetKind: TextureKind) {
  return {
    maps: {
      color: true,
      metalness: targetKind === "metalness",
      normal: targetKind === "normal",
      roughness: targetKind === "roughness"
    },
    model: "nano-banana-2" as const,
    prompt: "",
    size: 1024 as const
  };
}

function updateMapSelection(
  request: TextureGenerationRequest,
  kind: keyof TextureGenerationRequest["maps"],
  checked: boolean
): TextureGenerationRequest {
  const nextMaps = {
    ...request.maps,
    [kind]: checked
  };

  if (kind !== "color" && checked) {
    nextMaps.color = true;
  }

  if (
    kind === "color" &&
    !checked &&
    (nextMaps.normal || nextMaps.metalness || nextMaps.roughness)
  ) {
    nextMaps.color = true;
  }

  return {
    ...request,
    maps: nextMaps
  };
}

function canGenerate(request: TextureGenerationRequest) {
  return (
    request.prompt.trim().length > 0 &&
    Object.values(request.maps).some(Boolean)
  );
}

function createTextureRecord(
  texture: Omit<TextureRecord, "createdAt" | "id">
): TextureRecord {
  return {
    ...texture,
    createdAt: new Date().toISOString(),
    id: `texture:${Date.now().toString(36)}:${Math.random()
      .toString(36)
      .slice(2, 8)}`
  };
}

function clampOverlayPosition(
  position: { x: number; y: number },
  width: number,
  height: number
) {
  if (typeof window === "undefined") {
    return position;
  }

  return {
    x: Math.min(Math.max(16, position.x), Math.max(16, window.innerWidth - width - 16)),
    y: Math.min(Math.max(16, position.y), Math.max(16, window.innerHeight - height - 16))
  };
}

function formatTextureKind(kind: TextureKind) {
  switch (kind) {
    case "color":
      return "Color";
    case "metalness":
      return "Metal";
    case "normal":
      return "Normal";
    case "roughness":
      return "Rough";
  }
}

function formatTextureSize(size: number) {
  if (size >= 1024) {
    return `${size / 1024}k`;
  }

  return `${size}`;
}

function coerceTextureSize(size?: number): (typeof TEXTURE_SIZES)[number] {
  return TEXTURE_SIZES.includes(size as (typeof TEXTURE_SIZES)[number])
    ? (size as (typeof TEXTURE_SIZES)[number])
    : 1024;
}

function formatTextureSource(source: TextureRecord["source"]) {
  switch (source) {
    case "ai":
      return "AI";
    case "import":
      return "Import";
    case "upload":
      return "Upload";
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file."));
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}
