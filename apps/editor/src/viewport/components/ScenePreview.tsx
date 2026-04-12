import { Physics } from "@react-three/rapier";
import { useMemo } from "react";
import {
  Object3D
} from "three";
import { type GeometryNode } from "@ggez/shared";
import {
  type DerivedRenderScene
} from "@ggez/render-pipeline";
import { toTuple } from "@ggez/shared";
import {
  renderModeUsesFullLighting, renderModeUsesRenderableSurfaces, type ViewportRenderMode
} from "@/viewport/viewports";
import type { SceneSettings } from "@ggez/shared";
import { VfxSceneRuntime } from "@/viewport/components/VfxSceneRuntime";
import { PathGuides, RenderGroupNode, TriggerHookGuides } from "./PreviewRenderers";
import { NOOP_HOVER_END, NOOP_HOVER_START } from "../utils/preview-utils";
import { RenderInstancedMeshBatch, RenderInstancedModelPhysicsBatch } from "./InstancedMeshRenderer";
import { RuntimePlayer } from "./RuntimePlayer";
import { PhysicsPropMesh, RenderLightNode, RenderStaticMesh, StaticPhysicsCollider } from "./PreviewRendererHelpers";


export function ScenePreview({
  hiddenSceneItemIds = [],
  interactive,
  onFocusNode,
  onMeshObjectChange,
  onSelectNode,
  pathDefinitions,
  physicsPlayback,
  physicsRevision,
  renderMode = "preview",
  renderScene,
  sceneSettings,
  selectedHookNodes = [],
  selectedPathId,
  selectedNodeIds
}: {
  hiddenSceneItemIds?: string[];
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNode: (nodeIds: string[]) => void;
  pathDefinitions?: SceneSettings["paths"];
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  renderMode?: ViewportRenderMode;
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  selectedHookNodes?: GeometryNode[];
  selectedPathId?: string;
  selectedNodeIds: string[];
}) {
  const hiddenIds = useMemo(() => new Set(hiddenSceneItemIds), [hiddenSceneItemIds]);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const physicsActive = renderModeUsesRenderableSurfaces(renderMode) && physicsPlayback !== "stopped" && sceneSettings.world.physicsEnabled;
  const vfxPlaybackActive = renderModeUsesFullLighting(renderMode) && physicsPlayback !== "stopped";
  const { physicsPropMeshes, playerSpawn, staticMeshes, visibleEntityMarkers, visibleGroups, visibleInstancedMeshes, visibleLights } = useMemo(() => {
    const nextPlayerSpawn = physicsActive
      ? renderScene.entityMarkers.find((entity) => entity.entityType === "player-spawn")
      : undefined;
    const nextPhysicsPropMeshes = physicsActive
      ? renderScene.meshes.filter((mesh) => !hiddenIds.has(mesh.nodeId) && mesh.physics?.enabled)
      : [];
    const physicsPropIds = new Set(nextPhysicsPropMeshes.map((mesh) => mesh.nodeId));
    const nextStaticMeshes = renderScene.meshes.filter(
      (mesh) => !hiddenIds.has(mesh.nodeId) && !physicsPropIds.has(mesh.nodeId)
    );
    const nextVisibleEntityMarkers =
      physicsActive && nextPlayerSpawn
        ? renderScene.entityMarkers.filter((entity) => !hiddenIds.has(entity.entityId) && entity.entityId !== nextPlayerSpawn.entityId)
        : renderScene.entityMarkers.filter((entity) => !hiddenIds.has(entity.entityId));
    const nextVisibleGroups = renderScene.groups.filter((group) => !hiddenIds.has(group.nodeId));
    const nextVisibleInstancedMeshes = renderScene.instancedMeshes
      .map((batch) => ({
        ...batch,
        instances: batch.instances.filter((instance) => !hiddenIds.has(instance.nodeId))
      }))
      .filter((batch) => batch.instances.length > 0);
    const nextVisibleLights = renderScene.lights.filter((light) => !hiddenIds.has(light.nodeId));

    return {
      physicsPropMeshes: nextPhysicsPropMeshes,
      playerSpawn: nextPlayerSpawn,
      staticMeshes: nextStaticMeshes,
      visibleEntityMarkers: nextVisibleEntityMarkers,
      visibleGroups: nextVisibleGroups,
      visibleInstancedMeshes: nextVisibleInstancedMeshes,
      visibleLights: nextVisibleLights
    };
  }, [hiddenIds, physicsActive, renderScene]);

  return (
    <>
      <PathGuides pathDefinitions={pathDefinitions ?? sceneSettings.paths ?? []} selectedPathId={selectedPathId} />
      <TriggerHookGuides nodeTransforms={renderScene.nodeTransforms} nodes={selectedHookNodes} />

      {staticMeshes.map((mesh) => (
        <RenderStaticMesh
          hovered={false}
          interactive={interactive}
          key={mesh.nodeId}
          mesh={mesh}
          onFocusNode={onFocusNode}
          onHoverEnd={NOOP_HOVER_END}
          onHoverStart={NOOP_HOVER_START}
          onMeshObjectChange={onMeshObjectChange}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          sceneSettings={sceneSettings}
          selected={selectedIdSet.has(mesh.nodeId)}
        />
      ))}

      {visibleInstancedMeshes.map((batch) => (
        <RenderInstancedMeshBatch
          batch={batch}
          hoveredNodeId={undefined}
          interactive={interactive}
          key={batch.batchId}
          onFocusNode={onFocusNode}
          onHoverEnd={NOOP_HOVER_END}
          onHoverStart={NOOP_HOVER_START}
          onMeshObjectChange={onMeshObjectChange}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          sceneSettings={sceneSettings}
          selectedNodeIds={selectedIdSet}
        />
      ))}

      {physicsActive ? (
        <Physics
          gravity={toTuple(sceneSettings.world.gravity)}
          key={`physics:${physicsRevision}`}
          paused={physicsPlayback !== "running"}
          timeStep={1 / 60}
        >
          {staticMeshes.map((mesh) => (
            <StaticPhysicsCollider key={`collider:${mesh.nodeId}`} mesh={mesh} />
          ))}
          {visibleInstancedMeshes
            .filter((batch) => Boolean(batch.mesh.modelPath))
            .map((batch) => (
              <RenderInstancedModelPhysicsBatch batch={batch} key={`instanced-collider-batch:${batch.batchId}`} />
            ))}
          {physicsPropMeshes.map((mesh) => (
            <PhysicsPropMesh
              hovered={false}
              interactive={interactive}
              key={`prop:${mesh.nodeId}`}
              mesh={mesh}
              onFocusNode={onFocusNode}
              onHoverEnd={NOOP_HOVER_END}
              onHoverStart={NOOP_HOVER_START}
              onMeshObjectChange={onMeshObjectChange}
              onSelectNodes={onSelectNode}
              renderMode={renderMode}
              sceneSettings={sceneSettings}
              selected={selectedIdSet.has(mesh.nodeId)}
            />
          ))}
          {playerSpawn ? (
            <RuntimePlayer
              physicsPlayback={physicsPlayback}
              sceneSettings={sceneSettings}
              spawn={playerSpawn}
            />
          ) : null}
        </Physics>
      ) : null}

      {vfxPlaybackActive ? (
        <VfxSceneRuntime entities={visibleEntityMarkers.filter((entity) => entity.entityType === "vfx-object")} playbackActive={vfxPlaybackActive} />
      ) : null}

      {visibleEntityMarkers.map((entity) => {
        const selected = selectedIdSet.has(entity.entityId);
        const color = selected ? "#ffb35a" : entity.color;

        if (entity.entityType === "vfx-object") {
          return (
            <group
              key={entity.entityId}
              name={`entity:${entity.entityId}`}
              onClick={(event) => {
                if (!interactive) {
                  return;
                }

                event.stopPropagation();
                onSelectNode([entity.entityId]);
              }}
              onDoubleClick={(event) => {
                if (!interactive) {
                  return;
                }

                event.stopPropagation();
                onFocusNode(entity.entityId);
              }}
              position={toTuple(entity.position)}
              rotation={toTuple(entity.rotation)}
            >
              {!vfxPlaybackActive ? (
                <mesh scale={toTuple(entity.scale)}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshBasicMaterial color={color} opacity={0.22} transparent wireframe />
                </mesh>
              ) : null}
              <mesh scale={toTuple(entity.scale)} visible={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial opacity={0} transparent />
              </mesh>
            </group>
          );
        }

        return (
          <group
            key={entity.entityId}
            name={`entity:${entity.entityId}`}
            onClick={(event) => {
              if (!interactive) {
                return;
              }

              event.stopPropagation();
              onSelectNode([entity.entityId]);
            }}
            onDoubleClick={(event) => {
              if (!interactive) {
                return;
              }

              event.stopPropagation();
              onFocusNode(entity.entityId);
            }}
            position={toTuple(entity.position)}
            rotation={toTuple(entity.rotation)}
            scale={toTuple(entity.scale)}
          >
            <mesh position={[0, 0.8, 0]}>
              <octahedronGeometry args={[0.35, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.7, 8]} />
              <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
            </mesh>
          </group>
        );
      })}

      {visibleGroups.map((group) => (
        <RenderGroupNode
          hovered={false}
          interactive={interactive}
          key={group.nodeId}
          group={group}
          onFocusNode={onFocusNode}
          onHoverEnd={NOOP_HOVER_END}
          onHoverStart={NOOP_HOVER_START}
          onSelectNodes={onSelectNode}
          selected={selectedIdSet.has(group.nodeId)}
        />
      ))}

      {visibleLights.map((light) => (
        <RenderLightNode
          hovered={false}
          interactive={interactive}
          key={light.nodeId}
          light={light}
          onFocusNode={onFocusNode}
          onHoverEnd={NOOP_HOVER_END}
          onHoverStart={NOOP_HOVER_START}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selected={selectedIdSet.has(light.nodeId)}
        />
      ))}
    </>
  );
}





