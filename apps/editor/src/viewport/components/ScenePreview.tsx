import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, FrontSide, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader } from "three";
import { disableBvhRaycast, enableBvhRaycast, type DerivedRenderMesh, type DerivedRenderScene } from "@web-hammer/render-pipeline";
import { resolveTransformPivot, toTuple } from "@web-hammer/shared";
import { createIndexedGeometry } from "@/viewport/utils/geometry";

export function ScenePreview({
  hiddenNodeIds = [],
  interactive,
  onFocusNode,
  onMeshObjectChange,
  onSelectNode,
  renderScene,
  selectedNodeIds
}: {
  hiddenNodeIds?: string[];
  interactive: boolean;
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
  selected: boolean;
}) {
  const [meshObject, setMeshObject] = useState<Mesh | null>(null);
  const hasRenderableGeometry = Boolean(mesh.surface || mesh.primitive);
  const geometry = useMemo(() => {
    if (!mesh.surface) {
      return undefined;
    }

    const bufferGeometry = createIndexedGeometry(
      mesh.surface.positions,
      mesh.surface.indices,
      mesh.surface.uvs,
      mesh.surface.groups
    );
    bufferGeometry.computeVertexNormals();
    bufferGeometry.computeBoundingBox();
    bufferGeometry.computeBoundingSphere();

    return bufferGeometry;
  }, [mesh.surface]);
  const previewMaterials = useMemo(() => {
    const specs = mesh.materials ?? [mesh.material];

    return specs.map((spec) => createPreviewMaterial(spec, selected, hovered));
  }, [hovered, mesh.material, mesh.materials, selected]);

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
    if (meshObject) {
      meshObject.material = previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials;
    }
  }, [meshObject, previewMaterials]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => disposePreviewMaterial(material));
    };
  }, [previewMaterials]);

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
          castShadow
          onClick={(event) => {
            if (!interactive) {
              return;
            }

            event.stopPropagation();
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
          receiveShadow
        >
          {geometry ? <primitive attach="geometry" object={geometry} /> : null}
          {mesh.primitive?.kind === "box" ? <boxGeometry args={toTuple(mesh.primitive.size)} /> : null}
          {mesh.primitive?.kind === "icosahedron" ? (
            <icosahedronGeometry args={[mesh.primitive.radius, mesh.primitive.detail]} />
          ) : null}
          {mesh.primitive?.kind === "cylinder" ? (
            <cylinderGeometry
              args={[
                mesh.primitive.radiusTop,
                mesh.primitive.radiusBottom,
                mesh.primitive.height,
                mesh.primitive.radialSegments
              ]}
            />
          ) : null}
        </mesh>
      </group>
    </group>
  );
}

function createPreviewMaterial(spec: DerivedRenderMesh["material"], selected: boolean, hovered: boolean) {
  const colorTexture = spec.colorTexture
    ? loadTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? createBlockoutTexture(spec.color, spec.edgeColor ?? "#4f3118", spec.edgeThickness ?? 0.12)
      : undefined;
  const normalTexture = spec.normalTexture ? loadTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadTexture(spec.roughnessTexture, false) : undefined;

  return new MeshStandardMaterial({
    color: colorTexture ? "#ffffff" : selected ? "#ffb35a" : hovered ? "#d8f4f0" : spec.color,
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : "#000000",
    emissiveIntensity: selected ? 0.38 : hovered ? 0.14 : 0,
    flatShading: spec.flatShaded,
    map: colorTexture,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    metalnessMap: metalnessTexture,
    normalMap: normalTexture,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    roughnessMap: roughnessTexture,
    side: FrontSide,
    wireframe: spec.wireframe
  });
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

function createBlockoutTexture(color: string, edgeColor: string, edgeThickness: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const border = Math.max(6, Math.round(128 * edgeThickness));
  context.fillStyle = edgeColor;
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = color;
  context.fillRect(border, border, 128 - border * 2, 128 - border * 2);
  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.lineWidth = Math.max(2, border * 0.25);
  context.strokeRect(border * 0.75, border * 0.75, 128 - border * 1.5, 128 - border * 1.5);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
