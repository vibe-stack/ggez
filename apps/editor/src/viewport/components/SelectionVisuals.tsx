import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { triangulatePolygon3D, type ReconstructedBrushFace } from "@web-hammer/geometry-kernel";
import { averageVec3, normalizeVec3, toTuple, vec3, type Transform, type Vec3 } from "@web-hammer/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  Object3D,
  Quaternion,
  Sprite,
  SRGBColorSpace,
  Vector3
} from "three";
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

type OverlayHandle = {
  id: string;
  normal?: Vec3;
  points?: Vec3[];
  position: Vec3;
};

type EdgeHitAreaInstance = {
  id: string;
  length: number;
  midpoint: Vec3;
  quaternion: Quaternion;
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
    const nextGeometry = createIndexedGeometry(positions, face.triangleIndices);
    nextGeometry.computeVertexNormals();
    return nextGeometry;
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

    if (indices.length < 3) {
      return undefined;
    }

    const nextGeometry = createIndexedGeometry(positions, indices);
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [normal, points]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

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
      <boxGeometry args={[selected ? 0.16 : 0.13, length, selected ? 0.16 : 0.13]} />
      <meshBasicMaterial color="#93c5fd" depthWrite={false} opacity={selected ? 0.12 : 0.025} transparent />
    </mesh>
  );
}

export function EditableEdgeSelectionHitAreas({
  handles,
  onSelectHandle,
  selectedHandleIds
}: {
  handles: OverlayHandle[];
  onSelectHandle: (handleId: string, event: any) => void;
  selectedHandleIds: string[];
}) {
  const selectedIdSet = useMemo(() => new Set(selectedHandleIds), [selectedHandleIds]);
  const { selected, unselected } = useMemo(() => {
    const nextSelected: EdgeHitAreaInstance[] = [];
    const nextUnselected: EdgeHitAreaInstance[] = [];

    handles.forEach((handle) => {
      if (!handle.points || handle.points.length !== 2) {
        return;
      }

      const [start, end] = handle.points;
      const direction = new Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
      const length = direction.length();

      if (length <= 0.0001) {
        return;
      }

      const item: EdgeHitAreaInstance = {
        id: handle.id,
        length,
        midpoint: averageVec3(handle.points),
        quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
      };

      if (selectedIdSet.has(handle.id)) {
        nextSelected.push(item);
        return;
      }

      nextUnselected.push(item);
    });

    return {
      selected: nextSelected,
      unselected: nextUnselected
    };
  }, [handles, selectedIdSet]);

  return (
    <>
      <EditableEdgeSelectionInstanceMesh
        items={unselected}
        onSelectHandle={onSelectHandle}
        opacity={0.025}
        thickness={0.13}
      />
      <EditableEdgeSelectionInstanceMesh
        items={selected}
        onSelectHandle={onSelectHandle}
        opacity={0.12}
        thickness={0.16}
      />
    </>
  );
}

export function BatchedHandleLineSegments({
  closed = false,
  color,
  handles,
  opacity = 0.9,
  selectedColor,
  selectedHandleIds = []
}: {
  closed?: boolean;
  color: string;
  handles: OverlayHandle[];
  opacity?: number;
  selectedColor?: string;
  selectedHandleIds?: string[];
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const defaultColor = new Color(color);
    const activeColor = selectedColor ? new Color(selectedColor) : defaultColor;
    const selectedIdSet = new Set(selectedHandleIds);

    handles.forEach((handle) => {
      if (!handle.points || handle.points.length < 2) {
        return;
      }

      if (!closed && handle.points.length !== 2) {
        return;
      }

      const handleColor = selectedIdSet.has(handle.id) ? activeColor : defaultColor;
      const segments = closed ? handle.points.length : 1;

      for (let index = 0; index < segments; index += 1) {
        const start = handle.points[index];
        const end = closed ? handle.points[(index + 1) % handle.points.length] : handle.points[1];

        positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        colors.push(
          handleColor.r,
          handleColor.g,
          handleColor.b,
          handleColor.r,
          handleColor.g,
          handleColor.b
        );
      }
    });

    if (positions.length === 0) {
      return undefined;
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    nextGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return nextGeometry;
  }, [closed, color, handles, selectedColor, selectedHandleIds]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <lineSegments geometry={geometry} renderOrder={10}>
      <lineBasicMaterial depthWrite={false} opacity={opacity} toneMapped={false} transparent vertexColors />
    </lineSegments>
  );
}

export function BatchedHandleMarkers({
  handles,
  mode,
  nodeTransform,
  onSelectHandle,
  selectedFillColor,
  selectedHandleIds,
  unselectedFillColor
}: {
  handles: OverlayHandle[];
  mode: MeshEditMode;
  nodeTransform: Transform;
  onSelectHandle?: (handleId: string, event: any) => void;
  selectedFillColor: string;
  selectedHandleIds: string[];
  unselectedFillColor: string;
}) {
  const selectedIdSet = useMemo(() => new Set(selectedHandleIds), [selectedHandleIds]);
  const selectedHandles = useMemo(
    () => handles.filter((handle) => selectedIdSet.has(handle.id)),
    [handles, selectedIdSet]
  );
  const unselectedHandles = useMemo(
    () => handles.filter((handle) => !selectedIdSet.has(handle.id)),
    [handles, selectedIdSet]
  );
  const innerSize =
    mode === "face"
      ? { selected: 8, unselected: 6.5 }
      : mode === "edge"
        ? { selected: 7, unselected: 5.5 }
        : { selected: 6, unselected: 4.75 };

  return (
    <>
      <HandleMarkerPointCloud
        color={unselectedFillColor}
        handles={unselectedHandles}
        nodeTransform={nodeTransform}
        onSelectHandle={onSelectHandle}
        size={innerSize.unselected}
      />
      <HandleMarkerPointCloud
        color={selectedFillColor}
        handles={selectedHandles}
        nodeTransform={nodeTransform}
        onSelectHandle={onSelectHandle}
        size={innerSize.selected}
      />
    </>
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
  position,
  selected
}: {
  fillColor: string;
  mode: MeshEditMode;
  nodeTransform: Transform;
  onSelect: (event: any) => void;
  position: Vec3;
  selected: boolean;
}) {
  const billboardRef = useRef<Group | null>(null);
  const rotationZ = mode === "vertex" ? Math.PI / 4 : 0;
  const worldPosition = useMemo(() => nodeLocalPointToWorld(position, nodeTransform), [nodeTransform, position]);
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
      <group onClick={mode === "vertex" ? onSelect : undefined}>
        <mesh rotation={[0, 0, rotationZ]}>
          <planeGeometry args={innerSize} />
          <meshBasicMaterial
            color={fillColor}
            depthTest
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
    </Billboard>
  );
}

function EditableEdgeSelectionInstanceMesh({
  items,
  onSelectHandle,
  opacity,
  thickness
}: {
  items: EdgeHitAreaInstance[];
  onSelectHandle: (handleId: string, event: any) => void;
  opacity: number;
  thickness: number;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);

  useEffect(() => {
    if (!meshRef.current) {
      return;
    }

    const helper = new Object3D();

    items.forEach((item, index) => {
      helper.position.set(item.midpoint.x, item.midpoint.y, item.midpoint.z);
      helper.quaternion.copy(item.quaternion);
      helper.scale.set(thickness, item.length, thickness);
      helper.updateMatrix();
      meshRef.current!.setMatrixAt(index, helper.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [items, thickness]);

  if (items.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      args={[undefined, undefined, items.length]}
      onClick={(event) => {
        if (typeof event.instanceId !== "number") {
          return;
        }

        onSelectHandle(items[event.instanceId].id, event);
      }}
      ref={meshRef}
      renderOrder={7}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#93c5fd" depthWrite={false} opacity={opacity} transparent />
    </instancedMesh>
  );
}

function HandleMarkerPointCloud({
  color,
  handles,
  nodeTransform,
  onSelectHandle,
  size
}: {
  color: string;
  handles: OverlayHandle[];
  nodeTransform: Transform;
  onSelectHandle?: (handleId: string, event: any) => void;
  size: number;
}) {
  const { geometry, ids } = useMemo(() => {
    if (handles.length === 0) {
      return {
        geometry: undefined,
        ids: [] as string[]
      };
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(handles.length * 3), 3));

    return {
      geometry: nextGeometry,
      ids: handles.map((handle) => handle.id)
    };
  }, [handles]);

  useFrame(({ camera, size: viewportSize }) => {
    if (!geometry || viewportSize.height <= 0) {
      return;
    }

    const positionAttribute = geometry.getAttribute("position") as Float32BufferAttribute;
    let dirty = false;

    handles.forEach((handle, index) => {
      const worldPosition = nodeLocalPointToWorld(handle.position, nodeTransform);
      let nextX = worldPosition.x;
      let nextY = worldPosition.y;
      let nextZ = worldPosition.z;

      if (handle.normal) {
        const worldNormal = transformNormalToWorld(handle.normal, nodeTransform);
        const worldUnitsPerPixel = resolveWorldUnitsPerPixel(
          camera,
          new Vector3(worldPosition.x, worldPosition.y, worldPosition.z),
          viewportSize.height
        );
        const lift = worldUnitsPerPixel * Math.max(size * 0.55, 3);

        nextX += worldNormal.x * lift;
        nextY += worldNormal.y * lift;
        nextZ += worldNormal.z * lift;
      }

      if (
        Math.abs(positionAttribute.getX(index) - nextX) > 0.000001 ||
        Math.abs(positionAttribute.getY(index) - nextY) > 0.000001 ||
        Math.abs(positionAttribute.getZ(index) - nextZ) > 0.000001
      ) {
        positionAttribute.setXYZ(index, nextX, nextY, nextZ);
        dirty = true;
      }
    });

    if (dirty) {
      positionAttribute.needsUpdate = true;
      geometry.computeBoundingSphere();
    }
  });

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <points
      geometry={geometry}
      onClick={
        onSelectHandle
          ? (event) => {
              if (typeof event.index !== "number") {
                return;
              }

              onSelectHandle(ids[event.index], event);
            }
          : undefined
      }
    >
      <pointsMaterial
        color={color}
        depthTest
        depthWrite={false}
        opacity={0.96}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        size={size}
        sizeAttenuation={false}
        toneMapped={false}
        transparent
      />
    </points>
  );
}

function transformNormalToWorld(normal: Vec3, transform: Transform) {
  const worldNormal = new Vector3(normal.x, normal.y, normal.z)
    .multiply(new Vector3(Math.sign(transform.scale.x) || 1, Math.sign(transform.scale.y) || 1, Math.sign(transform.scale.z) || 1))
    .applyQuaternion(
      new Quaternion().setFromEuler(
        new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, "XYZ")
      )
    );

  if (worldNormal.lengthSq() <= 0.000001) {
    return new Vector3(0, 0, 1);
  }

  return worldNormal.normalize();
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
      <boxGeometry args={[radius * 2, length, radius * 2]} />
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
