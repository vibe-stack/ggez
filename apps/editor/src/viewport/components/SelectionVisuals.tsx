import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { triangulatePolygon3D, type ReconstructedBrushFace } from "@web-hammer/geometry-kernel";
import { averageVec3, normalizeVec3, toTuple, vec3, type Transform, type Vec3 } from "@web-hammer/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, DoubleSide, Group, LinearFilter, Quaternion, Sprite, SRGBColorSpace, Vector3 } from "three";
import type { BrushEditHandle, MeshEditHandle, MeshEditMode } from "@/viewport/editing";
import { createIndexedGeometry, nodeLocalPointToWorld } from "@/viewport/utils/geometry";

const tempCameraPosition = new Vector3();
const SELECTED_HANDLE_COLOR = "#7dd3fc";
const EDGE_LINE_COLOR = "#94a3b8";
const FACE_LINE_COLOR = "#67e8f9";
const edgeLabelTextureCache = new Map<string, { count: number; label: EdgeLabelTexture }>();

type EdgeLabelTexture = {
  height: number;
  texture: CanvasTexture;
  width: number;
};

export function FaceHitArea({
  face,
  hovered,
  onClick,
  onHover,
  onHoverEnd
}: {
  face: ReconstructedBrushFace;
  hovered: boolean;
  onClick: (localPoint: Vec3) => void;
  onHover: (face: ReconstructedBrushFace, localPoint: Vector3) => void;
  onHoverEnd: () => void;
}) {
  const geometry = useMemo(() => {
    const positions = face.vertices.flatMap((vertex) => [
      vertex.position.x + face.normal.x * 0.02,
      vertex.position.y + face.normal.y * 0.02,
      vertex.position.z + face.normal.z * 0.02
    ]);

    return createIndexedGeometry(positions, face.triangleIndices);
  }, [face]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      onClick={(event) => {
        event.stopPropagation();
        const localPoint = event.object.worldToLocal(event.point.clone());
        onClick(vec3(localPoint.x, localPoint.y, localPoint.z));
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        onHover(face, event.object.worldToLocal(event.point.clone()));
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHoverEnd();
      }}
      renderOrder={8}
    >
      <meshBasicMaterial
        color="#22d3ee"
        depthTest={false}
        depthWrite={false}
        opacity={hovered ? 0.18 : 0.002}
        side={DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

export function EditableFaceSelectionHitArea({
  normal,
  onSelect,
  onHover,
  onHoverEnd,
  onSelectPoint,
  points,
  selected
}: {
  normal?: Vec3;
  onSelect: (event: any) => void;
  onHover?: (point: Vec3) => void;
  onHoverEnd?: () => void;
  onSelectPoint?: (point: Vec3, event: any) => void;
  points: Vec3[];
  selected: boolean;
}) {
  const geometry = useMemo(() => {
    const faceNormal = normalizeVec3(normal ?? vec3(0, 0, 1));
    const positions = points.flatMap((point) => [
      point.x + faceNormal.x * 0.01,
      point.y + faceNormal.y * 0.01,
      point.z + faceNormal.z * 0.01
    ]);
    const indices = triangulatePolygon3D(points, normal ?? faceNormal);

    return indices.length >= 3 ? createIndexedGeometry(positions, indices) : undefined;
  }, [normal, points]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh
      geometry={geometry}
      onClick={(event) => {
        if (!onSelectPoint) {
          onSelect(event);
          return;
        }

        event.stopPropagation();
        const localPoint = event.object.worldToLocal(event.point.clone());
        onSelectPoint(vec3(localPoint.x, localPoint.y, localPoint.z), event);
      }}
      onPointerMove={(event) => {
        if (!onHover) {
          return;
        }

        event.stopPropagation();
        const localPoint = event.object.worldToLocal(event.point.clone());
        onHover(vec3(localPoint.x, localPoint.y, localPoint.z));
      }}
      onPointerOut={(event) => {
        if (!onHoverEnd) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      renderOrder={7}
    >
      <meshBasicMaterial
        color="#93c5fd"
        depthWrite={false}
        opacity={selected ? 0.08 : 0.018}
        side={DoubleSide}
        transparent
      />
    </mesh>
  );
}

export function EditableEdgeSelectionHitArea({
  onSelect,
  points,
  selected
}: {
  onSelect: (event: any) => void;
  points: Vec3[];
  selected: boolean;
}) {
  const midpoint = useMemo(() => averageVec3(points), [points]);
  const quaternion = useMemo(() => {
    if (points.length !== 2) {
      return new Quaternion();
    }

    const direction = new Vector3(
      points[1].x - points[0].x,
      points[1].y - points[0].y,
      points[1].z - points[0].z
    );

    if (direction.lengthSq() <= 0.000001) {
      return new Quaternion();
    }

    return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  }, [points]);
  const length = useMemo(() => {
    if (points.length !== 2) {
      return 0;
    }

    return new Vector3(
      points[1].x - points[0].x,
      points[1].y - points[0].y,
      points[1].z - points[0].z
    ).length();
  }, [points]);

  if (length <= 0.0001) {
    return null;
  }

  return (
    <mesh onClick={onSelect} position={toTuple(midpoint)} quaternion={quaternion} renderOrder={7}>
      <cylinderGeometry args={[selected ? 0.1 : 0.085, selected ? 0.1 : 0.085, length, 6]} />
      <meshBasicMaterial color="#93c5fd" depthWrite={false} opacity={selected ? 0.12 : 0.025} transparent />
    </mesh>
  );
}

export function MeshEditHandleVisual({
  handle,
  mode,
  selected
}: {
  handle: MeshEditHandle;
  mode: MeshEditMode;
  selected: boolean;
}) {
  return (
    <group>
      {mode === "edge" && handle.points?.length === 2 ? (
        <PreviewLine color={selected ? SELECTED_HANDLE_COLOR : EDGE_LINE_COLOR} end={handle.points[1]} start={handle.points[0]} />
      ) : null}
      {mode === "face" && handle.points && handle.points.length >= 3 ? (
        <ClosedPolyline color={selected ? SELECTED_HANDLE_COLOR : FACE_LINE_COLOR} points={handle.points} />
      ) : null}
    </group>
  );
}

export function BrushEditHandleVisual({
  handle,
  mode,
  selected
}: {
  handle: BrushEditHandle;
  mode: MeshEditMode;
  selected: boolean;
}) {
  const faceOutline = mode === "face" && handle.points && handle.points.length >= 3;
  const edgeLine = mode === "edge" && handle.points?.length === 2;

  return (
    <group>
      {edgeLine ? (
        <PreviewLine color={selected ? SELECTED_HANDLE_COLOR : EDGE_LINE_COLOR} end={handle.points![1]} start={handle.points![0]} />
      ) : null}
      {faceOutline ? (
        <ClosedPolyline color={selected ? SELECTED_HANDLE_COLOR : FACE_LINE_COLOR} points={handle.points!} />
      ) : null}
    </group>
  );
}

export function MeshEditHandleMarker({
  handle,
  mode,
  nodeTransform,
  onSelect,
  selected
}: {
  handle: MeshEditHandle;
  mode: MeshEditMode;
  nodeTransform: Transform;
  onSelect: (event: any) => void;
  selected: boolean;
}) {
  return (
    <HandleMarker
      fillColor={selected ? "#dbeafe" : mode === "face" ? FACE_LINE_COLOR : "#cbd5e1"}
      mode={mode}
      nodeTransform={nodeTransform}
      onSelect={onSelect}
      outlineColor={selected ? SELECTED_HANDLE_COLOR : "#0f172a"}
      position={handle.position}
      selected={selected}
    />
  );
}

export function BrushEditHandleMarker({
  handle,
  mode,
  nodeTransform,
  onSelect,
  selected
}: {
  handle: BrushEditHandle;
  mode: MeshEditMode;
  nodeTransform: Transform;
  onSelect: (event: any) => void;
  selected: boolean;
}) {
  return (
    <HandleMarker
      fillColor={selected ? "#dbeafe" : "#e2e8f0"}
      mode={mode}
      nodeTransform={nodeTransform}
      onSelect={onSelect}
      outlineColor={selected ? SELECTED_HANDLE_COLOR : "#0f172a"}
      position={handle.position}
      selected={selected}
    />
  );
}

export function EdgeLengthLabel({
  nodeTransform,
  text,
  position
}: {
  nodeTransform: Transform;
  position: Vec3;
  text: string;
}) {
  const spriteRef = useRef<Sprite | null>(null);
  const worldPosition = useMemo(() => nodeLocalPointToWorld(position, nodeTransform), [nodeTransform, position]);
  const [labelTexture, setLabelTexture] = useState<EdgeLabelTexture>();

  useEffect(() => {
    const nextTexture = acquireEdgeLabelTexture(text);
    setLabelTexture(nextTexture);

    return () => {
      releaseEdgeLabelTexture(text);
    };
  }, [text]);

  useFrame(({ camera, size }) => {
    const sprite = spriteRef.current;

    if (!sprite || !labelTexture || size.height <= 0) {
      return;
    }

    const worldUnitsPerPixel = resolveWorldUnitsPerPixel(camera, sprite.position, size.height);

    const scaleX = labelTexture.width * worldUnitsPerPixel;
    const scaleY = labelTexture.height * worldUnitsPerPixel;

    if (Math.abs(sprite.scale.x - scaleX) > 0.000001 || Math.abs(sprite.scale.y - scaleY) > 0.000001) {
      sprite.scale.set(scaleX, scaleY, 1);
    }
  });

  if (!labelTexture) {
    return null;
  }

  return (
    <sprite position={toTuple(worldPosition)} ref={spriteRef} renderOrder={20}>
      <spriteMaterial depthTest={false} map={labelTexture.texture} toneMapped={false} transparent />
    </sprite>
  );
}

function HandleMarker({
  fillColor,
  mode,
  nodeTransform,
  onSelect,
  outlineColor,
  position,
  selected
}: {
  fillColor: string;
  mode: MeshEditMode;
  nodeTransform: Transform;
  onSelect: (event: any) => void;
  outlineColor: string;
  position: Vec3;
  selected: boolean;
}) {
  const billboardRef = useRef<Group | null>(null);
  const rotationZ = mode === "vertex" ? Math.PI / 4 : 0;
  const worldPosition = useMemo(() => nodeLocalPointToWorld(position, nodeTransform), [nodeTransform, position]);
  const outerSize: [number, number] =
    mode === "face"
      ? [selected ? 14 : 12, selected ? 10 : 8.5]
      : mode === "edge"
        ? [selected ? 11 : 9, selected ? 11 : 9]
        : [selected ? 10 : 8, selected ? 10 : 8];
  const innerSize: [number, number] =
    mode === "face"
      ? [selected ? 10 : 8.5, selected ? 6.5 : 5.5]
      : mode === "edge"
        ? [selected ? 7 : 5.5, selected ? 7 : 5.5]
        : [selected ? 6 : 4.75, selected ? 6 : 4.75];

  useFrame(({ camera, size }) => {
    const billboard = billboardRef.current;

    if (!billboard || size.height <= 0) {
      return;
    }

    const worldUnitsPerPixel = resolveWorldUnitsPerPixel(camera, billboard.position, size.height);

    if (Math.abs(billboard.scale.x - worldUnitsPerPixel) > 0.000001) {
      billboard.scale.setScalar(worldUnitsPerPixel);
    }
  });

  return (
    <Billboard position={toTuple(worldPosition)} ref={billboardRef}>
      <group onClick={mode === "vertex" ? onSelect : undefined} renderOrder={11}>
        <mesh rotation={[0, 0, rotationZ]} renderOrder={11}>
          <planeGeometry args={outerSize} />
          <meshBasicMaterial
            color={outlineColor}
            depthTest={false}
            depthWrite={false}
            opacity={selected ? 0.98 : 0.82}
            toneMapped={false}
            transparent
          />
        </mesh>
        <mesh position={[0, 0, 0.001]} rotation={[0, 0, rotationZ]} renderOrder={12}>
          <planeGeometry args={innerSize} />
          <meshBasicMaterial color={fillColor} depthTest={false} depthWrite={false} toneMapped={false} transparent />
        </mesh>
      </group>
    </Billboard>
  );
}

export function ClosedPolyline({
  color,
  points
}: {
  color: string;
  points: Vec3[];
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      positions.push(current.x, current.y, current.z, next.x, next.y, next.z);
    }

    return createIndexedGeometry(positions);
  }, [points]);

  return (
    <lineSegments geometry={geometry} renderOrder={10}>
      <lineBasicMaterial color={color} depthWrite={false} opacity={0.9} toneMapped={false} transparent />
    </lineSegments>
  );
}

export function PreviewLine({
  color,
  end,
  opacity = 1,
  radius = 0.025,
  start
}: {
  color: string;
  end: Vec3;
  opacity?: number;
  radius?: number;
  start: Vec3;
}) {
  const midpoint = useMemo(
    () => vec3((start.x + end.x) * 0.5, (start.y + end.y) * 0.5, (start.z + end.z) * 0.5),
    [end, start]
  );
  const quaternion = useMemo(() => {
    const direction = new Vector3(end.x - start.x, end.y - start.y, end.z - start.z);

    if (direction.lengthSq() <= 0.000001) {
      return new Quaternion();
    }

    return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  }, [end, start]);
  const length = useMemo(
    () => new Vector3(end.x - start.x, end.y - start.y, end.z - start.z).length(),
    [end, start]
  );

  if (length <= 0.0001) {
    return null;
  }

  return (
    <mesh position={toTuple(midpoint)} quaternion={quaternion} renderOrder={10}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} opacity={opacity} toneMapped={false} transparent />
    </mesh>
  );
}

function resolveWorldUnitsPerPixel(camera: any, worldPosition: Vector3, viewportHeight: number) {
  if (viewportHeight <= 0) {
    return 1;
  }

  if ("isPerspectiveCamera" in camera && camera.isPerspectiveCamera) {
    camera.getWorldPosition(tempCameraPosition);
    const distance = tempCameraPosition.distanceTo(worldPosition);
    const verticalFov = (camera.fov * Math.PI) / 180;

    return (2 * distance * Math.tan(verticalFov / 2)) / viewportHeight;
  }

  if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / viewportHeight;
  }

  return 1;
}

function createEdgeLabelTexture(text: string) {
  if (typeof document === "undefined") {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const fontSize = 11;
  const outlineWidth = 3;
  const paddingX = 14;
  const paddingY = 10;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const font = `600 ${fontSize}px sans-serif`;

  context.font = font;
  const metrics = context.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width + paddingX * 2 + outlineWidth * 2));
  const height = Math.max(1, Math.ceil(fontSize + paddingY * 2 + outlineWidth * 2));

  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);

  context.scale(pixelRatio, pixelRatio);
  context.font = font;
  context.lineJoin = "round";
  context.lineWidth = outlineWidth;
  context.miterLimit = 2;
  context.strokeStyle = "#000000";
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const x = width / 2;
  const y = height / 2;

  context.strokeText(text, x, y);
  context.fillText(text, x, y);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return {
    height,
    texture,
    width
  } satisfies EdgeLabelTexture;
}

function acquireEdgeLabelTexture(text: string) {
  const cached = edgeLabelTextureCache.get(text);

  if (cached) {
    cached.count += 1;
    return cached.label;
  }

  const label = createEdgeLabelTexture(text);

  if (!label) {
    return undefined;
  }

  edgeLabelTextureCache.set(text, {
    count: 1,
    label
  });

  return label;
}

function releaseEdgeLabelTexture(text: string) {
  const cached = edgeLabelTextureCache.get(text);

  if (!cached) {
    return;
  }

  cached.count -= 1;

  if (cached.count > 0) {
    return;
  }

  cached.label.texture.dispose();
  edgeLabelTextureCache.delete(text);
}
