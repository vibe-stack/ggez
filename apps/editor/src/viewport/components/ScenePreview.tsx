import { useEffect, useMemo, useState } from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  FrontSide,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry
} from "three";
import { disableBvhRaycast, enableBvhRaycast, type DerivedRenderMesh, type DerivedRenderScene } from "@web-hammer/render-pipeline";
import { createBlockoutTextureDataUri, resolveTransformPivot, toTuple } from "@web-hammer/shared";
import { createIndexedGeometry } from "@/viewport/utils/geometry";
import type { ViewportRenderMode } from "@/viewport/viewports";

export function ScenePreview({
  hiddenNodeIds = [],
  interactive,
  renderMode = "lit",
  onFocusNode,
  onMeshObjectChange,
  onSelectNode,
  renderScene,
  selectedNodeIds
}: {
  hiddenNodeIds?: string[];
  interactive: boolean;
  renderMode?: ViewportRenderMode;
  onFocusNode: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Mesh | null) => void;
  onSelectNode: (nodeIds: string[]) => void;
  renderScene: DerivedRenderScene;
  selectedNodeIds: string[];
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string>();
  const hiddenIds = useMemo(() => new Set(hiddenNodeIds), [hiddenNodeIds]);

  return (
    <>
      {renderScene.meshes.map((mesh) =>
        hiddenIds.has(mesh.nodeId) ? null : (
          <RenderPrimitive
            hovered={hoveredNodeId === mesh.nodeId}
            interactive={interactive}
            key={mesh.nodeId}
            mesh={mesh}
            onFocusNode={onFocusNode}
            onHoverEnd={() => setHoveredNodeId(undefined)}
            onHoverStart={setHoveredNodeId}
            onMeshObjectChange={onMeshObjectChange}
            onSelectNodes={onSelectNode}
            renderMode={renderMode}
            selected={selectedNodeIds.includes(mesh.nodeId)}
          />
        )
      )}

      {renderScene.entityMarkers.map((entity) => (
        <group key={entity.entityId} position={toTuple(entity.position)}>
          <mesh position={[0, 0.8, 0]}>
            <octahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial color={entity.color} emissive={entity.color} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.7, 8]} />
            <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function RenderPrimitive({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
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
  onMeshObjectChange: (nodeId: string, object: Mesh | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const [meshObject, setMeshObject] = useState<Mesh | null>(null);
  const hasRenderableGeometry = Boolean(mesh.surface || mesh.primitive);
  const geometry = useMemo(() => {
    let bufferGeometry: BufferGeometry | undefined;

    if (mesh.surface) {
      bufferGeometry = createIndexedGeometry(
        mesh.surface.positions,
        mesh.surface.indices,
        mesh.surface.uvs,
        mesh.surface.groups
      );
    } else if (mesh.primitive?.kind === "box") {
      bufferGeometry = new BoxGeometry(...toTuple(mesh.primitive.size));
    } else if (mesh.primitive?.kind === "icosahedron") {
      bufferGeometry = new IcosahedronGeometry(mesh.primitive.radius, mesh.primitive.detail);
    } else if (mesh.primitive?.kind === "cylinder") {
      bufferGeometry = new CylinderGeometry(
        mesh.primitive.radiusTop,
        mesh.primitive.radiusBottom,
        mesh.primitive.height,
        mesh.primitive.radialSegments
      );
    }

    if (!bufferGeometry) {
      return undefined;
    }

    if (renderMode === "lit") {
      bufferGeometry.computeVertexNormals();
    }
    bufferGeometry.computeBoundingBox();
    bufferGeometry.computeBoundingSphere();

    return bufferGeometry;
  }, [mesh.primitive, mesh.surface, renderMode]);
  const previewMaterials = useMemo(() => {
    if (renderMode !== "lit") {
      return [];
    }

    const specs = mesh.materials ?? [mesh.material];

    return specs.map((spec) => createPreviewMaterial(spec, selected, hovered));
  }, [hovered, mesh.material, mesh.materials, renderMode, selected]);

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

  if (!hasRenderableGeometry) {
    return null;
  }
  const pivot = resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });

  return (
    <group
      name={`node:${mesh.nodeId}`}
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      scale={toTuple(mesh.scale)}
    >
      <group position={[-pivot.x, -pivot.y, -pivot.z]}>
        <mesh
          castShadow={renderMode === "lit"}
          onClick={(event) => {
            if (!interactive) {
              return;
            }

            event.stopPropagation();

            if (renderMode === "wireframe") {
              const nodeIds = resolveIntersectedNodeIds(event.intersections);

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
          ref={(object) => {
            setMeshObject(object);
            onMeshObjectChange(mesh.nodeId, object);
          }}
          receiveShadow={renderMode === "lit"}
        >
          {geometry ? <primitive attach="geometry" object={geometry} /> : null}
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
    </group>
  );
}

function resolveIntersectedNodeIds(intersections: Array<{ object: Object3D }>) {
  const nodeIds: string[] = [];
  const seen = new Set<string>();

  intersections.forEach((intersection) => {
    const nodeId = resolveNodeIdFromObject(intersection.object);

    if (!nodeId || seen.has(nodeId)) {
      return;
    }

    seen.add(nodeId);
    nodeIds.push(nodeId);
  });

  return nodeIds;
}

function resolveNodeIdFromObject(object: Object3D | null) {
  let current: Object3D | null = object;

  while (current) {
    if (current.name.startsWith("node:")) {
      return current.name.slice(5);
    }

    current = current.parent;
  }

  return undefined;
}

function createPreviewMaterial(spec: DerivedRenderMesh["material"], selected: boolean, hovered: boolean) {
  const colorTexture = spec.colorTexture
    ? loadTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? loadTexture(createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018), true)
      : undefined;
  const normalTexture = spec.normalTexture ? loadTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadTexture(spec.roughnessTexture, false) : undefined;

  const materialOptions = {
    color: colorTexture ? "#ffffff" : selected ? "#ffb35a" : hovered ? "#d8f4f0" : spec.color,
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : "#000000",
    emissiveIntensity: selected ? 0.38 : hovered ? 0.14 : 0,
    flatShading: spec.flatShaded,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    side: FrontSide,
    wireframe: spec.wireframe,
    ...(colorTexture ? { map: colorTexture } : {}),
    ...(metalnessTexture ? { metalnessMap: metalnessTexture } : {}),
    ...(normalTexture ? { normalMap: normalTexture } : {}),
    ...(roughnessTexture ? { roughnessMap: roughnessTexture } : {})
  };

  return new MeshStandardMaterial(materialOptions);
}

function disposePreviewMaterial(material: MeshStandardMaterial) {
  material.map?.dispose();
  material.normalMap?.dispose();
  material.metalnessMap?.dispose();
  material.roughnessMap?.dispose();
  material.dispose();
}

function loadTexture(source: string, isColor: boolean) {
  const texture = new TextureLoader().load(source);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  if (isColor) {
    texture.colorSpace = SRGBColorSpace;
  }

  return texture;
}
