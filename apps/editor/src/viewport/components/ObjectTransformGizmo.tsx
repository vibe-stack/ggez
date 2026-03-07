import { Billboard, TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { GeometryNode, Transform } from "@web-hammer/shared";
import { resolveTransformPivot, toTuple, vec3, type Vec3 } from "@web-hammer/shared";
import { objectToTransform, rebaseTransformPivot, worldPointToNodeLocal } from "@/viewport/utils/geometry";
import { resolveViewportSnapSize } from "@/viewport/utils/snap";
import type { ViewportCanvasProps } from "@/viewport/types";
import { Group as ThreeGroup, Vector3 } from "three";

const tempCameraPosition = new Vector3();

export function ObjectTransformGizmo({
  activeToolId,
  onPreviewNodeTransform,
  onUpdateNodeTransform,
  selectedNode,
  selectedNodeIds,
  selectedNodes,
  transformMode,
  viewport
}: Pick<
  ViewportCanvasProps,
  "activeToolId" | "onPreviewNodeTransform" | "onUpdateNodeTransform" | "selectedNodeIds" | "selectedNodes" | "transformMode" | "viewport"
> & {
  selectedNode?: GeometryNode;
}) {
  const baselineTransformRef = useRef<Transform | undefined>(undefined);
  const pivotTargetRef = useRef<ThreeGroup | null>(null);
  const scene = useThree((state) => state.scene);
  const [activePivotNodeId, setActivePivotNodeId] = useState<string>();
  const selectedNodeId = selectedNode?.id ?? selectedNodeIds[0];
  const selectedObject = selectedNodeId ? scene.getObjectByName(`node:${selectedNodeId}`) : undefined;
  const snapSize = resolveViewportSnapSize(viewport);
  const activePivotNode = activePivotNodeId ? selectedNodes.find((node) => node.id === activePivotNodeId) : undefined;

  useEffect(() => {
    if (activeToolId !== "transform") {
      setActivePivotNodeId(undefined);
      baselineTransformRef.current = undefined;
    }
  }, [activeToolId]);

  useEffect(() => {
    if (activePivotNodeId && !selectedNodes.some((node) => node.id === activePivotNodeId)) {
      setActivePivotNodeId(undefined);
      baselineTransformRef.current = undefined;
    }
  }, [activePivotNodeId, selectedNodes]);

  if (activeToolId !== "transform") {
    return null;
  }

  const pivot = selectedNode ? resolveTransformPivot(selectedNode.transform) : vec3(0, 0, 0);
  const showObjectTransformGizmo = !activePivotNode && Boolean(selectedNodeId && selectedObject && selectedNode);

  return (
    <>
      {selectedNodes.map((node) =>
        node.id === activePivotNodeId ? null : (
          <PivotHandleMarker
            key={node.id}
            onSelect={() => {
              setActivePivotNodeId(node.id);
            }}
            position={node.transform.position}
            selected={false}
          />
        )
      )}

      {activePivotNode ? (
        <group ref={pivotTargetRef} position={toTuple(activePivotNode.transform.position)}>
          <PivotHandleMarker
            onSelect={() => {
              setActivePivotNodeId(activePivotNode.id);
            }}
            position={vec3(0, 0, 0)}
            selected
          />
        </group>
      ) : null}

      {activePivotNode && pivotTargetRef.current ? (
        <TransformControls
          enabled
          mode="translate"
          object={pivotTargetRef.current}
          onMouseDown={() => {
            baselineTransformRef.current = structuredClone(activePivotNode.transform);
          }}
          onMouseUp={() => {
            if (!baselineTransformRef.current || !pivotTargetRef.current) {
              return;
            }

            const worldPosition = pivotTargetRef.current.getWorldPosition(new Vector3());
            const nextPivot = worldPointToNodeLocal(
              vec3(worldPosition.x, worldPosition.y, worldPosition.z),
              baselineTransformRef.current
            );

            onUpdateNodeTransform(
              activePivotNode.id,
              rebaseTransformPivot(baselineTransformRef.current, nextPivot),
              baselineTransformRef.current
            );
            baselineTransformRef.current = undefined;
          }}
          onObjectChange={() => {
            if (!baselineTransformRef.current || !pivotTargetRef.current) {
              return;
            }

            const worldPosition = pivotTargetRef.current.getWorldPosition(new Vector3());
            const nextPivot = worldPointToNodeLocal(
              vec3(worldPosition.x, worldPosition.y, worldPosition.z),
              baselineTransformRef.current
            );

            onPreviewNodeTransform(activePivotNode.id, rebaseTransformPivot(baselineTransformRef.current, nextPivot));
          }}
          showX
          showY
          showZ
          translationSnap={snapSize}
        />
      ) : null}

      {showObjectTransformGizmo && selectedNodeId && selectedObject && selectedNode ? (
        <TransformControls
          enabled
          mode={transformMode}
          object={selectedObject}
          onMouseDown={() => {
            baselineTransformRef.current = objectToTransform(selectedObject, pivot);
          }}
          onMouseUp={() => {
            if (!baselineTransformRef.current) {
              return;
            }

            onUpdateNodeTransform(selectedNodeId, objectToTransform(selectedObject, pivot), baselineTransformRef.current);
            baselineTransformRef.current = undefined;
          }}
          onObjectChange={() => {
            onPreviewNodeTransform(selectedNodeId, objectToTransform(selectedObject, pivot));
          }}
          rotationSnap={Math.PI / 12}
          scaleSnap={Math.max(snapSize / 16, 0.125)}
          showX
          showY
          showZ
          translationSnap={snapSize}
        />
      ) : null}
    </>
  );
}

function PivotHandleMarker({
  onSelect,
  position,
  selected
}: {
  onSelect: () => void;
  position: Vec3;
  selected: boolean;
}) {
  const billboardRef = useRef<ThreeGroup | null>(null);
  const handleRef = useRef<ThreeGroup | null>(null);
  const outerSize: [number, number] = selected ? [18, 18] : [14, 14];
  const innerSize: [number, number] = selected ? [11, 11] : [8.5, 8.5];

  useFrame(({ camera, size }) => {
    const billboard = billboardRef.current;
    const handle = handleRef.current;

    if (!billboard || !handle || size.height <= 0) {
      return;
    }

    const worldUnitsPerPixel = resolveWorldUnitsPerPixel(camera, billboard.position, size.height);
    const handleOffset = selected ? 0 : worldUnitsPerPixel * 22;

    if (Math.abs(billboard.scale.x - worldUnitsPerPixel) > 0.000001) {
      billboard.scale.setScalar(worldUnitsPerPixel);
    }

    if (
      Math.abs(handle.position.x - handleOffset) > 0.000001 ||
      Math.abs(handle.position.y - handleOffset) > 0.000001
    ) {
      handle.position.set(handleOffset, handleOffset, 0);
    }
  });

  return (
    <group position={toTuple(position)}>
      <mesh renderOrder={13}>
        <sphereGeometry args={[selected ? 0.12 : 0.09, 18, 18]} />
        <meshBasicMaterial
          color={selected ? "#a855f7" : "#9333ea"}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </mesh>

      <Billboard ref={billboardRef}>
        <group
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          ref={handleRef}
          renderOrder={14}
        >
          <mesh rotation={[0, 0, Math.PI / 4]} renderOrder={14}>
            <planeGeometry args={outerSize} />
            <meshBasicMaterial
              color={selected ? "#f5d0fe" : "#d8b4fe"}
              depthTest={false}
              depthWrite={false}
              opacity={selected ? 1 : 0.94}
              toneMapped={false}
              transparent
            />
          </mesh>
          <mesh position={[0, 0, 0.001]} rotation={[0, 0, Math.PI / 4]} renderOrder={15}>
            <planeGeometry args={innerSize} />
            <meshBasicMaterial
              color={selected ? "#a855f7" : "#9333ea"}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
              transparent
            />
          </mesh>
        </group>
      </Billboard>
    </group>
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
