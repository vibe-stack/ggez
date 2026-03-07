import { reconstructBrushFaces, type ReconstructedBrushFace } from "@web-hammer/geometry-kernel";
import { vec3, type GeometryNode } from "@web-hammer/shared";
import { useEffect, useMemo, useState } from "react";
import { Vector3 } from "three";
import { buildBrushClipPreview, buildClipPreview } from "@/viewport/editing";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";
import { FaceHitArea, PreviewLine } from "@/viewport/components/SelectionVisuals";
import type { ViewportCanvasProps } from "@/viewport/types";
import type { ViewportState } from "@web-hammer/render-pipeline";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";

export function BrushClipOverlay({
  node,
  onSplitBrushAtCoordinate,
  viewport
}: {
  node: Extract<GeometryNode, { kind: "brush" }>;
  onSplitBrushAtCoordinate: ViewportCanvasProps["onSplitBrushAtCoordinate"];
  viewport: ViewportState;
}) {
  const [preview, setPreview] = useState<{ faceId: string; line: ReturnType<typeof buildClipPreview> }>();
  const rebuilt = useMemo(() => reconstructBrushFaces(node.data), [node.data]);
  const snapSize = resolveViewportSnapSize(viewport);

  useEffect(() => {
    setPreview(undefined);
  }, [node.id, node.data, snapSize]);

  if (!rebuilt.valid) {
    return null;
  }

  const handleFacePointer = (face: ReconstructedBrushFace, point: Vector3) => {
    const line = buildClipPreview(face, vec3(point.x, point.y, point.z), snapSize);

    if (!line) {
      setPreview(undefined);
      return;
    }

    const segments = buildBrushClipPreview(rebuilt.faces, line.axis, line.coordinate);

    setPreview({
      faceId: face.id,
      line: {
        ...line,
        segments
      }
    });
  };

  return (
    <NodeTransformGroup transform={node.transform}>
      {rebuilt.faces.map((face) => (
        <FaceHitArea
          face={face}
          hovered={preview?.faceId === face.id}
          key={face.id}
          onClick={(localPoint) => {
            const line = buildClipPreview(face, localPoint, snapSize);

            if (!line) {
              return;
            }

            onSplitBrushAtCoordinate(node.id, line.axis, line.coordinate);
          }}
          onHover={handleFacePointer}
          onHoverEnd={() => setPreview(undefined)}
        />
      ))}

      {preview?.line
        ? preview.line.segments.map((segment, index) => (
            <PreviewLine
              color="#22d3ee"
              end={segment.end}
              key={`${preview.faceId}:${index}`}
              opacity={0.98}
              radius={0.07}
              start={segment.start}
            />
          ))
        : null}
    </NodeTransformGroup>
  );
}
