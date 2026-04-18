import { useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CapsuleCollider, ConeCollider, ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type DirectionalLight,
  type PointLight,
  type SpotLight,
  Vector3
} from "three";
import { HIGH_MODEL_LOD_LEVEL, resolvePropColliderDefinition, type ModelAssetFile, type ModelLodLevel, type Vec3, type WorldLodSettings } from "@ggez/shared";
import { createAuthoredColliderShape, createCrashcatShapeHelper } from "@ggez/runtime-physics-crashcat";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
    disableBvhRaycast,
    enableBvhRaycast, type DerivedLight,
    type DerivedRenderMesh
} from "@ggez/render-pipeline";
import { toTuple } from "@ggez/shared";
import {
    renderModeUsesRenderableSurfaces,
    renderModeUsesSceneLights,
    renderModeUsesShadows,
    renderModeUsesSolidMaterials,
    type ViewportRenderMode
} from "@/viewport/viewports";
import type { SceneSettings } from "@ggez/shared";
  import { applySoftVsmShadowConfig, fitDirectionalShadowToScene, POINT_LIGHT_SHADOW_MAP_SIZE, resolveLightTargetPosition, SPOT_LIGHT_SHADOW_MAP_SIZE } from "@/viewport/utils/shadow-config";
import { applyShadowCastingSide, cloneModelSceneGraph, computeModelBounds, createPrimaryModelFile, createSolidModelMaterial, disposeOwnedSceneMaterials, disposePreviewMaterial, gltfLoader, loadModelTexture, modelDistanceVector, modelSceneCache, mtlLoader, patchMtlTextureReferences, resolveEditorModelLodLevel, resolveIntersectedIds, resolveMeshPivot, resolvePhysicsColliderProps, usePreviewMaterials, useRenderableGeometry } from "../utils/preview-utils";

const MAX_MODEL_COLLIDER_HULL_POINTS = 512;
const modelColliderHullCache = new WeakMap<Object3D, Float32Array>();
const ignoreRaycast: Mesh["raycast"] = () => {};

export function RenderStaticMesh({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selected: boolean;
}) {
  if (!mesh.surface && !mesh.primitive && !mesh.modelPath) {
    return null;
  }

  return (
    <RenderNodeRoot
      hovered={hovered}
      interactive={interactive}
      mesh={mesh}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onMeshObjectChange={onMeshObjectChange}
      onSelectNodes={onSelectNodes}
      renderMode={renderMode}
      sceneSettings={sceneSettings}
      selected={selected}
    />
  );
}

export function PhysicsPropMesh({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selected: boolean;
}) {
  const physics = mesh.physics;
  const colliderProps = useMemo(() => resolvePhysicsColliderProps(mesh.physics), [mesh.physics]);

  if (!physics) {
    return null;
  }

  const useTrimeshCollider = physics.colliderShape === "trimesh" || (!mesh.primitive && !mesh.modelPath);

  return (
    <RigidBody
      angularDamping={physics.angularDamping}
      canSleep={physics.canSleep}
      ccd={physics.ccd}
      colliders={false}
      gravityScale={physics.gravityScale}
      linearDamping={physics.linearDamping}
      lockRotations={physics.lockRotations}
      lockTranslations={physics.lockTranslations}
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      type={physics.bodyType}
    >
      {physics.colliderDefinitions && physics.colliderDefinitions.length > 0 ? (
        <AuthoredPhysicsColliders colliderProps={colliderProps} mesh={mesh} />
      ) : !useTrimeshCollider ? (
        <ManualCollider mesh={mesh} />
      ) : mesh.modelPath ? (
        <ModelHullPhysicsCollider mesh={mesh} />
      ) : (
        <TrimeshPhysicsCollider colliderProps={colliderProps} mesh={mesh} />
      )}
      <group scale={toTuple(mesh.scale)}>
        <RenderNodeBody
          hovered={hovered}
          interactive={interactive}
          mesh={mesh}
          onFocusNode={onFocusNode}
          onHoverEnd={onHoverEnd}
          onHoverStart={onHoverStart}
          onSelectNodes={onSelectNodes}
          renderMode={renderMode}
          sceneSettings={sceneSettings}
          selected={selected}
        />
      </group>
      <object3D
        name={`node:${mesh.nodeId}`}
        ref={(object) => {
          onMeshObjectChange(mesh.nodeId, object);
        }}
      />
    </RigidBody>
  );
}

function AuthoredPhysicsColliders({
  colliderProps,
  mesh
}: {
  colliderProps?: ReturnType<typeof resolvePhysicsColliderProps>;
  mesh: DerivedRenderMesh;
}) {
  const pivot = resolveMeshPivot(mesh);
  const modelCenter = mesh.modelPath ? (mesh.modelCenter ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
  const definitions = mesh.physics?.colliderDefinitions ?? [];

  if (definitions.length === 0) {
    return null;
  }

  return (
    <group scale={toTuple(mesh.scale)}>
      {definitions.map((definition) => {
        const resolved = resolvePropColliderDefinition(definition);
        const position: [number, number, number] = [
          resolved.position.x + modelCenter.x - pivot.x,
          resolved.position.y + modelCenter.y - pivot.y,
          resolved.position.z + modelCenter.z - pivot.z
        ];
        const rotation = toTuple(resolved.rotation);

        switch (resolved.shape) {
          case "ball":
            return <BallCollider args={[resolved.radius]} key={definition.id} position={position} rotation={rotation} {...colliderProps} />;
          case "cuboid":
            return (
              <CuboidCollider
                args={[resolved.halfExtents.x, resolved.halfExtents.y, resolved.halfExtents.z]}
                key={definition.id}
                position={position}
                rotation={rotation}
                {...colliderProps}
              />
            );
          case "capsule":
            return (
              <CapsuleCollider
                args={[resolved.halfHeightOfCylinder, resolved.radius]}
                key={definition.id}
                position={position}
                rotation={rotation}
                {...colliderProps}
              />
            );
          case "cylinder":
            return <CylinderCollider args={[resolved.halfHeight, resolved.radius]} key={definition.id} position={position} rotation={rotation} {...colliderProps} />;
          case "cone":
            return <ConeCollider args={[resolved.halfHeight, resolved.radius]} key={definition.id} position={position} rotation={rotation} {...colliderProps} />;
        }
      })}
    </group>
  );
}



export function RenderNodeRoot({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selected: boolean;
}) {
  return (
    <group
      name={`node:${mesh.nodeId}`}
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      scale={toTuple(mesh.scale)}
      ref={(object) => {
        onMeshObjectChange(mesh.nodeId, object);
      }}
    >
      <RenderNodeBody
        hovered={hovered}
        interactive={interactive}
        mesh={mesh}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        sceneSettings={sceneSettings}
        selected={selected}
      />
    </group>
  );
}

export function RenderNodeBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selected: boolean;
}) {
  if (mesh.modelPath) {
    return (
      <RenderModelBody
        hovered={hovered}
        interactive={interactive}
        mesh={mesh}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        sceneSettings={sceneSettings}
        selected={selected}
      />
    );
  }

  return (
    <RenderMeshBody
      hovered={hovered}
      interactive={interactive}
      mesh={mesh}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onSelectNodes={onSelectNodes}
      renderMode={renderMode}
      selected={selected}
    />
  );
}

export function StaticPhysicsCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  return (
    <RigidBody colliders={false} position={toTuple(mesh.position)} rotation={toTuple(mesh.rotation)} type="fixed">
      {mesh.modelPath ? <ModelHullPhysicsCollider mesh={mesh} /> : <TrimeshPhysicsCollider mesh={mesh} />}
    </RigidBody>
  );
}

function ModelHullPhysicsCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  const colliderArgs = useModelHullColliderArgs(mesh);
  const pivot = resolveMeshPivot(mesh);

  if (!colliderArgs) {
    return <TrimeshPhysicsCollider mesh={mesh} />;
  }

  return (
    <group scale={toTuple(mesh.scale)}>
      <ConvexHullCollider args={colliderArgs} position={[-pivot.x, -pivot.y, -pivot.z]} />
    </group>
  );
}

export function TrimeshPhysicsCollider({
  colliderProps,
  mesh
}: {
  colliderProps?: ReturnType<typeof resolvePhysicsColliderProps>;
  mesh: DerivedRenderMesh;
}) {
  const colliderArgs = useTrimeshColliderArgs(mesh);
  const pivot = resolveMeshPivot(mesh);

  if (!colliderArgs) {
    return null;
  }

  return (
    <group scale={toTuple(mesh.scale)}>
      <TrimeshCollider
        args={colliderArgs}
        position={[-pivot.x, -pivot.y, -pivot.z]}
        {...colliderProps}
      />
    </group>
  );
}

export function useTrimeshColliderArgs(mesh: DerivedRenderMesh): [ArrayLike<number>, ArrayLike<number>] | undefined {
  const geometry = useRenderableGeometry(mesh, "full");
  const fallbackIndices = useMemo(() => {
    if (!geometry) {
      return new Uint32Array();
    }

    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    return Uint32Array.from({ length: positionCount }, (_, index) => index);
  }, [geometry]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return undefined;
  }

  return [
    geometry.getAttribute("position").array,
    geometry.getIndex()?.array ?? fallbackIndices
  ];
}

function useModelHullColliderArgs(mesh: DerivedRenderMesh): [ArrayLike<number>] | undefined {
  const primaryModelFile = useMemo(
    () => createPrimaryModelFile(mesh),
    [mesh.modelFiles, mesh.modelFormat, mesh.modelMtlText, mesh.modelPath, mesh.modelTexturePath]
  );
  const loadedScene = useLoadedModelScene(primaryModelFile);

  return useMemo(() => {
    if (!loadedScene) {
      return undefined;
    }

    const cached = modelColliderHullCache.get(loadedScene);

    if (cached) {
      return cached.length >= 12 ? [cached] : undefined;
    }

    const sampledPoints = buildModelColliderHullPoints(loadedScene);
    modelColliderHullCache.set(loadedScene, sampledPoints);

    return sampledPoints.length >= 12 ? [sampledPoints] : undefined;
  }, [loadedScene]);
}

function buildModelColliderHullPoints(scene: Object3D) {
  const totalVertices = countModelGeometryVertices(scene);

  if (totalVertices <= 0) {
    return new Float32Array();
  }

  const sampleStride = Math.max(1, Math.ceil(totalVertices / MAX_MODEL_COLLIDER_HULL_POINTS));
  const sampled: number[] = [];
  const worldPosition = new Vector3();
  let globalVertexIndex = 0;

  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const position = child.geometry.getAttribute("position");

    if (!position) {
      return;
    }

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      if (globalVertexIndex % sampleStride !== 0) {
        globalVertexIndex += 1;
        continue;
      }

      worldPosition
        .set(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex))
        .applyMatrix4(child.matrixWorld);
      sampled.push(worldPosition.x, worldPosition.y, worldPosition.z);
      globalVertexIndex += 1;
    }
  });

  return new Float32Array(sampled);
}

function countModelGeometryVertices(scene: Object3D) {
  let count = 0;

  scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    count += child.geometry.getAttribute("position")?.count ?? 0;
  });

  return count;
}

export function RenderMeshBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const [meshObject, setMeshObject] = useState<Mesh | null>(null);
  const geometry = useRenderableGeometry(mesh, renderMode);
  const previewMaterials = usePreviewMaterials(mesh, renderMode, selected, hovered);
  const pivot = resolveMeshPivot(mesh);

  useEffect(() => {
    if (geometry && meshObject && mesh.bvhEnabled) {
      enableBvhRaycast(meshObject, geometry);
    }

    return () => {
      if (geometry) {
        disableBvhRaycast(geometry);
      }
    };
  }, [geometry, mesh.bvhEnabled, meshObject]);

  useEffect(() => {
    if (meshObject && previewMaterials.length > 0) {
      meshObject.material = previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials;
    }
  }, [meshObject, previewMaterials]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => disposePreviewMaterial(material));
    };
  }, [previewMaterials]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <>
      <group position={[-pivot.x, -pivot.y, -pivot.z]}>
        <mesh
          castShadow={renderModeUsesShadows(renderMode)}
          onClick={(event) => {
            if (!interactive) {
              return;
            }

            event.stopPropagation();

            if (renderMode === "wireframe") {
              const nodeIds = resolveIntersectedIds(event.intersections);

              if (nodeIds.length > 0) {
                onSelectNodes(nodeIds);
                return;
              }
            }

            onSelectNodes([mesh.nodeId]);
          }}
          onDoubleClick={(event) => {
            if (!interactive) {
              return;
            }

            event.stopPropagation();
            onFocusNode(mesh.nodeId);
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

            event.stopPropagation();
            onHoverStart(mesh.nodeId);
          }}
          ref={setMeshObject}
          receiveShadow={renderModeUsesShadows(renderMode)}
        >
          <primitive attach="geometry" object={geometry} />
          {renderMode === "wireframe" ? (
            <meshBasicMaterial
              color={selected ? "#f97316" : hovered ? "#67e8f9" : "#94a3b8"}
              depthWrite={false}
              toneMapped={false}
              wireframe
            />
          ) : null}
        </mesh>
      </group>
      <SelectedColliderWireframes mesh={mesh} selected={selected} />
    </>
  );
}

export function RenderModelBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  sceneSettings,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneSettings: SceneSettings;
  selected: boolean;
}) {
  const resolvedModelFile = useResolvedModelPreviewFile(mesh.modelFiles, createPrimaryModelFile(mesh), sceneSettings.world.lod, mesh.position);
  const loadedScene = useLoadedModelScene(
    resolvedModelFile
  );
  const loadedBounds = useMemo(
    () => (loadedScene ? computeModelBounds(loadedScene) : undefined),
    [loadedScene]
  );
  const modelBounds = loadedBounds ?? (mesh.modelSize && mesh.modelCenter
    ? {
        center: mesh.modelCenter,
        size: mesh.modelSize
      }
    : undefined);
  const boundsCenter = modelBounds?.center ?? mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
  const showBoundsOverlay = renderMode === "wireframe" || selected || hovered;
  const overlayColor = selected ? "#f97316" : hovered ? "#67e8f9" : "#94a3b8";
  const showModelSurface = renderModeUsesRenderableSurfaces(renderMode);
  const modelScene = useMemo(() => {
    if (!loadedScene || !showModelSurface || renderModeUsesSolidMaterials(renderMode)) {
      return undefined;
    }

    const clone = cloneModelSceneGraph(loadedScene);
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = renderModeUsesShadows(renderMode);
        child.receiveShadow = renderModeUsesShadows(renderMode);
        applyShadowCastingSide(child.material);
      }
    });
    return clone;
  }, [loadedScene, renderMode, showModelSurface]);
  const solidScene = useMemo(() => {
    if (!loadedScene || !renderModeUsesSolidMaterials(renderMode)) {
      return undefined;
    }

    const clone = cloneModelSceneGraph(loadedScene);
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }

      child.castShadow = false;
      child.receiveShadow = false;
      child.material = createSolidModelMaterial(child.material, selected, hovered);
    });
    return clone;
  }, [hovered, loadedScene, renderMode, selected]);

  useEffect(() => {
    return () => {
      disposeOwnedSceneMaterials(solidScene);
    };
  }, [solidScene]);

  const handleClick = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onSelectNodes([mesh.nodeId]);
  }, [interactive, mesh.nodeId, onSelectNodes]);

  const handleDoubleClick = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onFocusNode(mesh.nodeId);
  }, [interactive, mesh.nodeId, onFocusNode]);

  const handlePointerOver = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onHoverStart(mesh.nodeId);
  }, [interactive, mesh.nodeId, onHoverStart]);

  const handlePointerOut = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onHoverEnd();
  }, [interactive, onHoverEnd]);

  return (
    <group>
      {modelScene ? (
        <primitive
          object={modelScene}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
        />
      ) : null}
      {solidScene ? (
        <primitive
          object={solidScene}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
        />
      ) : null}
      {!modelScene && !solidScene && showModelSurface ? (
        <mesh
          castShadow={renderModeUsesShadows(renderMode)}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[boundsCenter.x, boundsCenter.y, boundsCenter.z]}
          receiveShadow={renderModeUsesShadows(renderMode)}
        >
          <boxGeometry args={toTuple(mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
          {renderModeUsesSolidMaterials(renderMode) ? (
            <meshStandardMaterial color={selected ? "#ffb35a" : "#d8dee6"} metalness={0.06} roughness={0.84} />
          ) : (
            <meshStandardMaterial color={mesh.material.color} metalness={0.08} roughness={0.72} />
          )}
        </mesh>
      ) : null}
      {showBoundsOverlay ? (
        <mesh
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[boundsCenter.x, boundsCenter.y, boundsCenter.z]}
        >
          <boxGeometry args={toTuple(modelBounds?.size ?? mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
          <meshBasicMaterial
            color={overlayColor}
            depthWrite={false}
            opacity={renderMode === "wireframe" ? 1 : 0.85}
            toneMapped={false}
            transparent={renderMode !== "wireframe"}
            wireframe
          />
        </mesh>
      ) : null}
      <SelectedColliderWireframes mesh={mesh} selected={selected} />
    </group>
  );
}

function SelectedColliderWireframes({
  mesh,
  selected
}: {
  mesh: DerivedRenderMesh;
  selected: boolean;
}) {
  const shape = useMemo(
    () => (selected
      ? createAuthoredColliderShape({
          ...mesh,
          scale: { x: 1, y: 1, z: 1 }
        })
      : undefined),
    [mesh, selected]
  );
  const helper = useMemo(() => {
    if (!shape) {
      return undefined;
    }

    const material = new MeshBasicMaterial({
      color: "#facc15",
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      wireframe: true
    });
    const nextHelper = createCrashcatShapeHelper(shape, { material });

    nextHelper.object.renderOrder = 1000;
    nextHelper.object.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        child.raycast = ignoreRaycast;
      }
    });

    return nextHelper;
  }, [shape]);

  useEffect(() => {
    return () => {
      helper?.dispose();
    };
  }, [helper]);

  if (!selected || !helper) {
    return null;
  }

  return <primitive object={helper.object} />;
}

export function useLoadedModelScene(file?: ModelAssetFile) {
  const [scene, setScene] = useState<Object3D>();

  useEffect(() => {
    if (!file?.path) {
      setScene(undefined);
      return;
    }

    const cacheKey = `${file.level}:${file.format}:${file.path}:${file.texturePath ?? ""}:${file.materialMtlText ?? ""}`;
    const cachedScene = modelSceneCache.get(cacheKey);

    if (cachedScene) {
      setScene(cachedScene);
      return;
    }

    let cancelled = false;

    void loadModelScene(file)
      .then((loadedScene) => {
        if (cancelled) {
          return;
        }

        modelSceneCache.set(cacheKey, loadedScene);
        setScene(loadedScene);
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

async function loadModelScene(file: ModelAssetFile) {
  if (file.format === "obj") {
    const objLoader = new OBJLoader();

    if (file.materialMtlText) {
      const materialCreator = mtlLoader.parse(
        patchMtlTextureReferences(file.materialMtlText, file.texturePath),
        ""
      );
      materialCreator.preload();
      objLoader.setMaterials(materialCreator);
    }

    const object = await objLoader.loadAsync(file.path);

    if (!file.materialMtlText && file.texturePath) {
      const texture = await loadModelTexture(file.texturePath);

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
}

export function useResolvedModelPreviewFile(
  files: ModelAssetFile[] | undefined,
  fallbackFile: ModelAssetFile | undefined,
  lodSettings: WorldLodSettings,
  position: Vec3
) {
  const { camera } = useThree();
  const [requestedLevel, setRequestedLevel] = useState<ModelLodLevel>(HIGH_MODEL_LOD_LEVEL);

  useFrame(() => {
    const nextLevel = resolveEditorModelLodLevel(
      files,
      lodSettings,
      camera.position.distanceTo(modelDistanceVector.set(position.x, position.y, position.z))
    );

    setRequestedLevel((current) => (current === nextLevel ? current : nextLevel));
  });

  useEffect(() => {
    setRequestedLevel(HIGH_MODEL_LOD_LEVEL);
  }, [fallbackFile?.path, files, lodSettings]);

  return useMemo(() => {
    const matchingFile = files?.find((file) => file.level === requestedLevel);
    return matchingFile ?? fallbackFile;
  }, [fallbackFile, files, requestedLevel]);
}



export function RenderLightNode({
  hovered,
  interactive,
  light,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  sceneRootRef,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  light: DerivedLight;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  sceneRootRef: RefObject<Object3D | null>;
  selected: boolean;
}) {
  const targetRef = useRef<Object3D | null>(null);
  const lightRef = useRef<any>(null);
  const targetPosition = useMemo(
    () => resolveLightTargetPosition(light.position, light.rotation, light.data.target),
    [
      light.data.target?.x,
      light.data.target?.y,
      light.data.target?.z,
      light.position.x,
      light.position.y,
      light.position.z,
      light.rotation.x,
      light.rotation.y,
      light.rotation.z
    ]
  );

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      lightRef.current.updateMatrixWorld(true);
      targetRef.current.updateMatrixWorld(true);
    }
  }, [light.nodeId, targetPosition.x, targetPosition.y, targetPosition.z, light.position.x, light.position.y, light.position.z]);

  useFrame(() => {
    if (!lightRef.current || !light.data.castShadow || light.data.type !== "directional") {
      return;
    }

    if (targetRef.current) {
      lightRef.current.target = targetRef.current;
      targetRef.current.updateMatrixWorld(true);
    }

    fitDirectionalShadowToScene(
      lightRef.current as DirectionalLight,
      sceneRootRef.current,
      targetPosition,
      light.data.shadowRadius,
      {
        shadowBias: light.data.shadowBias,
        shadowBlurRadius: light.data.shadowBlurRadius,
        shadowBlurSamples: light.data.shadowBlurSamples,
        shadowMapSize: light.data.shadowMapSize,
        shadowNormalBias: light.data.shadowNormalBias
      }
    );
  });

  useEffect(() => {
    if (!lightRef.current || !light.data.castShadow) {
      return;
    }

    if (light.data.type === "spot") {
      applySoftVsmShadowConfig(lightRef.current as SpotLight, SPOT_LIGHT_SHADOW_MAP_SIZE, {
        shadowBias: light.data.shadowBias,
        shadowBlurRadius: light.data.shadowBlurRadius,
        shadowBlurSamples: light.data.shadowBlurSamples,
        shadowMapSize: light.data.shadowMapSize,
        shadowNormalBias: light.data.shadowNormalBias
      });
      return;
    }

    if (light.data.type === "point") {
      applySoftVsmShadowConfig(lightRef.current as PointLight, POINT_LIGHT_SHADOW_MAP_SIZE, {
        shadowBias: light.data.shadowBias,
        shadowBlurRadius: light.data.shadowBlurRadius,
        shadowBlurSamples: light.data.shadowBlurSamples,
        shadowMapSize: light.data.shadowMapSize,
        shadowNormalBias: light.data.shadowNormalBias
      });
    }
  }, [light.data.castShadow, light.data.shadowBias, light.data.shadowBlurRadius, light.data.shadowBlurSamples, light.data.shadowMapSize, light.data.shadowNormalBias, light.data.type]);

  const markerColor = selected ? "#ffb35a" : hovered ? "#d8f4f0" : light.color;
  const showTargetGuide = (light.data.type === "directional" || light.data.type === "spot") && (selected || hovered);
  const guidePositions = useMemo(
    () => new Float32Array([light.position.x, light.position.y, light.position.z, targetPosition.x, targetPosition.y, targetPosition.z]),
    [light.position.x, light.position.y, light.position.z, targetPosition.x, targetPosition.y, targetPosition.z]
  );

  return (
    <>
      <group
        name={`node:${light.nodeId}`}
        onClick={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onSelectNodes([light.nodeId]);
        }}
        onDoubleClick={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onFocusNode(light.nodeId);
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

          event.stopPropagation();
          onHoverStart(light.nodeId);
        }}
        position={toTuple(light.position)}
        rotation={toTuple(light.rotation)}
      >
        <mesh>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.45, 8]} />
          <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
        </mesh>
      </group>

      {showTargetGuide ? (
        <>
          <line>
            <bufferGeometry>
              <bufferAttribute args={[guidePositions, 3]} attach="attributes-position" count={2} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial color={selected ? "#fdba74" : markerColor} transparent opacity={0.8} />
          </line>
          <mesh position={[targetPosition.x, targetPosition.y, targetPosition.z]} raycast={() => null}>
            <sphereGeometry args={[0.16, 14, 14]} />
            <meshBasicMaterial color={selected ? "#fdba74" : markerColor} />
          </mesh>
        </>
      ) : null}

      {renderModeUsesSceneLights(renderMode) && light.data.enabled ? (
        <>
          {light.data.type === "ambient" ? (
            <ambientLight color={light.data.color} intensity={light.data.intensity} />
          ) : null}
          {light.data.type === "hemisphere" ? (
            <hemisphereLight
              args={[light.data.color, light.data.groundColor ?? "#0f1721", light.data.intensity]}
            />
          ) : null}
          {light.data.type === "point" ? (
            <pointLight
              castShadow={light.data.castShadow}
              color={light.data.color}
              decay={light.data.decay}
              distance={light.data.distance}
              intensity={light.data.intensity}
              position={toTuple(light.position)}
              ref={lightRef}
            />
          ) : null}
          {light.data.type === "directional" ? (
            <>
              <directionalLight
                castShadow={light.data.castShadow}
                color={light.data.color}
                intensity={light.data.intensity}
                position={toTuple(light.position)}
                ref={lightRef}
              />
              <object3D ref={targetRef} position={[targetPosition.x, targetPosition.y, targetPosition.z]} />
            </>
          ) : null}
          {light.data.type === "spot" ? (
            <>
              <spotLight
                angle={light.data.angle}
                castShadow={light.data.castShadow}
                color={light.data.color}
                decay={light.data.decay}
                distance={light.data.distance}
                intensity={light.data.intensity}
                penumbra={light.data.penumbra}
                position={toTuple(light.position)}
                ref={lightRef}
              />
              <object3D ref={targetRef} position={[targetPosition.x, targetPosition.y, targetPosition.z]} />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function ManualCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  const pivot = resolveMeshPivot(mesh);
  const commonProps = {
    position: [-pivot.x, -pivot.y, -pivot.z] as [number, number, number],
    scale: toTuple(mesh.scale),
    ...resolvePhysicsColliderProps(mesh.physics)
  };

  if (!mesh.primitive || !mesh.physics) {
    return null;
  }

  if (mesh.physics.colliderShape === "ball" && mesh.primitive.kind === "sphere") {
    return <BallCollider args={[mesh.primitive.radius]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cuboid" && mesh.primitive.kind === "box") {
    return (
      <CuboidCollider
        args={[mesh.primitive.size.x * 0.5, mesh.primitive.size.y * 0.5, mesh.primitive.size.z * 0.5]}
        {...commonProps}
      />
    );
  }

  if (mesh.physics.colliderShape === "cylinder" && mesh.primitive.kind === "cylinder") {
    return <CylinderCollider args={[mesh.primitive.height * 0.5, Math.max(mesh.primitive.radiusTop, mesh.primitive.radiusBottom)]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cone" && mesh.primitive.kind === "cone") {
    return <ConeCollider args={[mesh.primitive.height * 0.5, mesh.primitive.radius]} {...commonProps} />;
  }

  return null;
}
