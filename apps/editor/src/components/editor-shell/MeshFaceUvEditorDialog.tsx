import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { computePolygonNormal, getFaceVertices } from "@ggez/geometry-kernel";
import {
  crossVec3,
  dotVec3,
  normalizeVec3,
  subVec3,
  vec2,
  vec3,
  type EditableMesh,
  type Vec2,
  type Vec3
} from "@ggez/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type MeshFaceUvEditorDialogProps = {
  faceId?: string;
  mesh?: EditableMesh;
  onApply: (uvs: Vec2[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  textureName?: string;
  textureSource?: string;
};

export function MeshFaceUvEditorDialog({
  faceId,
  mesh,
  onApply,
  onOpenChange,
  open,
  textureName,
  textureSource
}: MeshFaceUvEditorDialogProps) {
  const face = useMemo(() => mesh?.faces.find((entry) => entry.id === faceId), [faceId, mesh]);
  const vertices = useMemo(() => (mesh && faceId ? getFaceVertices(mesh, faceId) : []), [faceId, mesh]);
  const projectedUvs = useMemo(() => {
    if (!face || vertices.length < 3) {
      return [];
    }

    if (face.uvs && face.uvs.length === vertices.length) {
      return face.uvs.map((uv) => vec2(uv.x, uv.y));
    }

    return projectPlanarUvs(
      vertices.map((vertex) => vertex.position),
      computePolygonNormal(vertices.map((vertex) => vertex.position)),
      face.uvScale,
      face.uvOffset
    ).map(([x, y]) => vec2(x, y));
  }, [face, vertices]);
  const [draftUvs, setDraftUvs] = useState<Vec2[]>(projectedUvs);
  const [imageAspect, setImageAspect] = useState(1);
  const boardRef = useRef<SVGSVGElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setDraftUvs(projectedUvs);
    }
  }, [open, projectedUvs]);

  const canEdit = vertices.length >= 3 && draftUvs.length === vertices.length;
  const polygonPoints = draftUvs
    .map((uv) => `${uv.x},${1 - uv.y}`)
    .join(" ");

  const updateUv = (index: number, next: Vec2) => {
    setDraftUvs((current) =>
      current.map((uv, uvIndex) =>
        uvIndex === index ? vec2(clamp01(next.x), clamp01(next.y)) : vec2(uv.x, uv.y)
      )
    );
  };

  const updateUvAxis = (index: number, axis: "x" | "y", rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);

    if (!Number.isFinite(parsed)) {
      return;
    }

    updateUv(index, axis === "x" ? vec2(parsed, draftUvs[index]?.y ?? 0) : vec2(draftUvs[index]?.x ?? 0, parsed));
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const dragIndex = dragIndexRef.current;

    if (dragIndex === null || !boardRef.current) {
      return;
    }

    const rect = boardRef.current.getBoundingClientRect();
    const normalizedX = clamp01((event.clientX - rect.left) / rect.width);
    const normalizedY = clamp01((event.clientY - rect.top) / rect.height);
    updateUv(dragIndex, vec2(normalizedX, 1 - normalizedY));
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragIndexRef.current !== null) {
      boardRef.current?.releasePointerCapture(event.pointerId);
      dragIndexRef.current = null;
    }
  };

  const handleReset = () => {
    setDraftUvs(projectedUvs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl border border-white/10 bg-[#0b1311]/96 p-0 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)]" showCloseButton={false}>
        <DialogHeader className="border-b border-white/8 px-5 py-4">
          <DialogTitle>Face UV Editor</DialogTitle>
          <DialogDescription>
            Drag UV corners directly on the texture. This writes explicit per-corner UVs for the selected mesh face.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-foreground/60">
              <span>{textureName ? `Texture: ${textureName}` : "No texture selected"}</span>
              <span>{faceId ? `Face: ${faceId}` : "No face selected"}</span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c1210] p-3">
              <div
                className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-white/8 bg-[linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.03)_75%),linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.03)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]"
                style={{ aspectRatio: imageAspect }}
              >
                {textureSource ? (
                  <img
                    alt={textureName ?? "Selected texture"}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
                    onLoad={(event) => {
                      const image = event.currentTarget;

                      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                        setImageAspect(image.naturalWidth / image.naturalHeight);
                      }
                    }}
                    src={textureSource}
                  />
                ) : null}
                <svg
                  className="absolute inset-0 h-full w-full touch-none"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  ref={boardRef}
                  viewBox="0 0 1 1"
                >
                  <rect fill="rgba(5,8,7,0.18)" height="1" width="1" x="0" y="0" />
                  {canEdit ? (
                    <>
                      <polygon
                        fill="rgba(16,185,129,0.18)"
                        points={polygonPoints}
                        stroke="rgba(110,231,183,0.95)"
                        strokeLinejoin="round"
                        strokeWidth="0.006"
                      />
                      {draftUvs.map((uv, index) => (
                        <g key={`${index}:${uv.x}:${uv.y}`}>
                          <circle
                            cx={uv.x}
                            cy={1 - uv.y}
                            fill="rgba(4,10,8,0.88)"
                            r="0.024"
                            stroke="rgba(255,255,255,0.92)"
                            strokeWidth="0.006"
                          />
                          <circle
                            cx={uv.x}
                            cy={1 - uv.y}
                            fill="rgba(52,211,153,0.96)"
                            onPointerDown={(event) => {
                              dragIndexRef.current = index;
                              boardRef.current?.setPointerCapture(event.pointerId);
                            }}
                            r="0.016"
                            stroke="rgba(4,10,8,0.72)"
                            strokeWidth="0.004"
                          />
                          <text
                            fill="rgba(255,255,255,0.96)"
                            fontSize="0.035"
                            fontWeight="700"
                            textAnchor="middle"
                            x={uv.x}
                            y={Math.max(0.04, 1 - uv.y - 0.03)}
                          >
                            {index + 1}
                          </text>
                        </g>
                      ))}
                    </>
                  ) : null}
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
              <div className="mb-2 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
                UV Coordinates
              </div>
              <div className="space-y-2">
                {draftUvs.map((uv, index) => (
                  <div className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2" key={`input:${index}`}>
                    <div className="text-xs font-medium text-foreground/72">P{index + 1}</div>
                    <Input
                      className="h-8 border-white/10 bg-white/5 text-xs"
                      onChange={(event) => updateUvAxis(index, "x", event.target.value)}
                      step="0.001"
                      type="number"
                      value={roundUv(uv.x)}
                    />
                    <Input
                      className="h-8 border-white/10 bg-white/5 text-xs"
                      onChange={(event) => updateUvAxis(index, "y", event.target.value)}
                      step="0.001"
                      type="number"
                      value={roundUv(uv.y)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/4 p-3 text-xs text-foreground/60">
              <div className="mb-2 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
                Notes
              </div>
              <p>Manual UVs are face-specific and work with irregular atlases.</p>
              <p className="mt-2">Using the old UV scale/offset controls afterward will switch that face back to planar mapping.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-white/8 bg-white/3 px-5 py-4">
          <Button onClick={handleReset} type="button" variant="outline">
            Reset
          </Button>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            className="bg-emerald-500/85 text-black hover:bg-emerald-400"
            disabled={!canEdit}
            onClick={() => {
              onApply(draftUvs.map((uv) => vec2(clamp01(uv.x), clamp01(uv.y))));
              onOpenChange(false);
            }}
            type="button"
          >
            Apply UVs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function projectPlanarUvs(vertices: Vec3[], normal: Vec3, uvScale?: Vec2, uvOffset?: Vec2): Array<[number, number]> {
  const basis = createFacePlaneBasis(normal);
  const origin = vertices[0] ?? vec3(0, 0, 0);
  const scaleX = Math.abs(uvScale?.x ?? 1) <= 0.0001 ? 1 : uvScale?.x ?? 1;
  const scaleY = Math.abs(uvScale?.y ?? 1) <= 0.0001 ? 1 : uvScale?.y ?? 1;
  const offsetX = uvOffset?.x ?? 0;
  const offsetY = uvOffset?.y ?? 0;

  return vertices.map((vertex) => {
    const offset = subVec3(vertex, origin);
    return [dotVec3(offset, basis.u) * scaleX + offsetX, dotVec3(offset, basis.v) * scaleY + offsetY];
  });
}

function createFacePlaneBasis(normal: Vec3) {
  const normalizedNormal = normalizeVec3(normal);
  const reference = Math.abs(normalizedNormal.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  let u = normalizeVec3(crossVec3(reference, normalizedNormal));

  if (Math.abs(u.x) <= 0.0001 && Math.abs(u.y) <= 0.0001 && Math.abs(u.z) <= 0.0001) {
    u = normalizeVec3(crossVec3(normalizedNormal, vec3(0, 0, 1)));
  }

  return {
    u,
    v: normalizeVec3(crossVec3(normalizedNormal, u))
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundUv(value: number) {
  return Number(value.toFixed(3));
}