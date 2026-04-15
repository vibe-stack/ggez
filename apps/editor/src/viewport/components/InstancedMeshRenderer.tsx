import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    BoxGeometry, InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
  Object3D, BufferGeometry,
  Vector3
} from "three";
import { type Vec3 } from "@ggez/shared";
import {
    type DerivedInstancedMesh
} from "@ggez/render-pipeline";
import {
    renderModeUsesShadows, type ViewportRenderMode
} from "@/viewport/viewports";
import type { SceneSettings } from "@ggez/shared";
import { buildModelParts, computeBatchCenter, computeModelBounds, createPrimaryModelFile, disposeOwnedMaterial, resolveMeshPivot, tempInstanceColor, tempInstanceMatrix, tempInstanceObject, tempPivotMatrix, useInstancedPreviewMaterials, useRenderableGeometry } from "@/viewport/utils/preview-utils";
import { StaticPhysicsCollider, useLoadedModelScene, useResolvedModelPreviewFile } from "./PreviewRendererHelpers";

const INSTANCED_MODEL_COLLIDER_DISTANCE = 50;
const instancedModelColliderDistance = new Vector3();

export function RenderInstancedMeshBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selectedNodeIds
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selectedNodeIds: Set<string>;
}) {
  if (batch.mesh.modelPath) {
    return (
      <RenderInstancedModelBatch
        batch={batch}
        hoveredNodeId={hoveredNodeId}
        interactive={interactive}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onMeshObjectChange={onMeshObjectChange}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        sceneSettings={sceneSettings}
        selectedNodeIds={selectedNodeIds}
      />
    );
  }

  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useRenderableGeometry(batch.mesh, renderMode);
  const previewMaterials = useInstancedPreviewMaterials(batch.mesh, renderMode);
  const pivot = resolveMeshPivot(batch.mesh);
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject || !geometry || previewMaterials.length === 0) {
      return;
    }

    tempPivotMatrix.makeTranslation(-pivot.x, -pivot.y, -pivot.z);

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      tempInstanceMatrix.copy(tempInstanceObject.matrix).multiply(tempPivotMatrix);
      meshObject.setMatrixAt(index, tempInstanceMatrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#ffb35a"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#ffffff"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, geometry, hoveredNodeId, pivot.x, pivot.y, pivot.z, previewMaterials, selectedNodeIds]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => {
        if (material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) {
          material.dispose();
        }
      });
    };
  }, [previewMaterials]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry || previewMaterials.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      args={[geometry, previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials, batch.instances.length]}
      castShadow={renderModeUsesShadows(renderMode)}
      name={`node:${batch.batchId}`}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderModeUsesShadows(renderMode)}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        onMeshObjectChange(batch.batchId, object);
        meshRef.current = object;
      }}
    />
  );
}

export function RenderInstancedModelBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selectedNodeIds
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selectedNodeIds: Set<string>;
}) {
  const batchCenter = useMemo(() => computeBatchCenter(batch), [batch]);
  const resolvedModelFile = useResolvedModelPreviewFile(
    batch.mesh.modelFiles,
    createPrimaryModelFile(batch.mesh),
    sceneSettings.world.lod,
    batchCenter
  );
  const loadedScene = useLoadedModelScene(
    resolvedModelFile
  );
  const loadedBounds = useMemo(
    () => (loadedScene ? computeModelBounds(loadedScene) : undefined),
    [loadedScene]
  );
  const center = loadedBounds?.center ?? batch.mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
  const modelParts = useMemo(() => buildModelParts(loadedScene, center, renderMode), [center.x, center.y, center.z, loadedScene, renderMode]);

  useEffect(() => {
    return () => {
      modelParts.forEach((part) => {
        if (part.disposeGeometry) {
          part.geometry.dispose();
        }

        if (part.ownedMaterial) {
          disposeOwnedMaterial(part.material);
        }
      });
    };
  }, [modelParts]);

  if (renderMode === "wireframe" || modelParts.length === 0) {
    return (
      <RenderInstancedModelBoundsBatch
        batch={batch}
        hoveredNodeId={hoveredNodeId}
        interactive={interactive}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onMeshObjectChange={onMeshObjectChange}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selectedNodeIds={selectedNodeIds}
        size={loadedBounds?.size ?? batch.mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 }}
      />
    );
  }

  return (
    <group
      name={`node:${batch.batchId}`}
      ref={(object) => {
        onMeshObjectChange(batch.batchId, object);
      }}
    >
      {modelParts.map((part) => (
        <RenderInstancedModelPart
          batch={batch}
          hoveredNodeId={hoveredNodeId}
          interactive={interactive}
          key={part.key}
          localMatrix={part.localMatrix}
          material={part.material}
          onFocusNode={onFocusNode}
          onHoverEnd={onHoverEnd}
          onHoverStart={onHoverStart}
          onSelectNodes={onSelectNodes}
          partKey={part.key}
          renderMode={renderMode}
          selectedNodeIds={selectedNodeIds}
          sourceGeometry={part.geometry}
        />
      ))}
    </group>
  );
}

export function RenderInstancedModelPhysicsBatch({ batch }: { batch: DerivedInstancedMesh }) {
  const { camera } = useThree();
  const [nearbyNodeIds, setNearbyNodeIds] = useState<string[]>([]);

  useFrame(() => {
    const nextNodeIds = batch.instances
      .filter((instance) =>
        camera.position.distanceTo(
          instancedModelColliderDistance.set(instance.position.x, instance.position.y, instance.position.z)
        ) <= INSTANCED_MODEL_COLLIDER_DISTANCE
      )
      .map((instance) => instance.nodeId);

    setNearbyNodeIds((current) => (haveSameNodeOrder(current, nextNodeIds) ? current : nextNodeIds));
  });

  const nearbyMeshes = useMemo(
    () =>
      batch.instances
        .filter((instance) => nearbyNodeIds.includes(instance.nodeId))
        .map((instance) => ({
          ...batch.mesh,
          label: `${batch.mesh.label} [${instance.label}]`,
          nodeId: instance.nodeId,
          position: instance.position,
          rotation: instance.rotation,
          scale: instance.scale
        })),
    [batch.instances, batch.mesh, nearbyNodeIds]
  );

  return (
    <>
      {nearbyMeshes.map((mesh) => (
        <StaticPhysicsCollider key={`instanced-collider:${mesh.nodeId}`} mesh={mesh} />
      ))}
    </>
  );
}

export function RenderInstancedModelPart({
  batch,
  hoveredNodeId,
  interactive,
  localMatrix,
  material,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  partKey,
  renderMode,
  selectedNodeIds,
  sourceGeometry
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  localMatrix: Matrix4;
  material: Mesh["material"];
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  partKey: string;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
  sourceGeometry: BufferGeometry;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject) {
      return;
    }

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      tempInstanceMatrix.copy(tempInstanceObject.matrix).multiply(localMatrix);
      meshObject.setMatrixAt(index, tempInstanceMatrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#ffb35a"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#ffffff"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, hoveredNodeId, localMatrix, selectedNodeIds]);

  return (
    <instancedMesh
      args={[sourceGeometry, material, batch.instances.length]}
      castShadow={renderModeUsesShadows(renderMode)}
      name={`node:${batch.batchId}:${partKey}`}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderModeUsesShadows(renderMode)}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        meshRef.current = object;
      }}
    />
  );
}

export function RenderInstancedModelBoundsBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds,
  size
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
  size: Vec3;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useMemo(() => new BoxGeometry(size.x, size.y, size.z), [size.x, size.y, size.z]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#94a3b8",
        depthWrite: false,
        opacity: renderMode === "wireframe" ? 1 : 0.85,
        toneMapped: false,
        transparent: renderMode !== "wireframe",
        wireframe: true
      }),
    [renderMode]
  );
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject) {
      return;
    }

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      meshObject.setMatrixAt(index, tempInstanceObject.matrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#f97316"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#94a3b8"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, hoveredNodeId, selectedNodeIds]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <instancedMesh
      args={[geometry, material, batch.instances.length]}
      castShadow={renderModeUsesShadows(renderMode)}
      name={`node:${batch.batchId}`}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderModeUsesShadows(renderMode)}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        onMeshObjectChange(batch.batchId, object);
        meshRef.current = object;
      }}
    />
  );
}

function haveSameNodeOrder(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
