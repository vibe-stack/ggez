import { useEffect, useMemo, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { DerivedRenderMesh, DerivedRenderScene, ViewportState } from "@web-hammer/render-pipeline";
import { toTuple } from "@web-hammer/shared";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type PerspectiveCamera } from "three";

type ViewportCanvasProps = {
  renderScene: DerivedRenderScene;
  viewport: ViewportState;
};

function EditorCameraRig({ viewport }: Pick<ViewportCanvasProps, "viewport">) {
  const camera = useThree((state) => state.camera as PerspectiveCamera);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const [x, y, z] = toTuple(viewport.camera.position);
    const [targetX, targetY, targetZ] = toTuple(viewport.camera.target);

    camera.position.set(x, y, z);
    camera.near = viewport.camera.near;
    camera.far = viewport.camera.far;
    camera.fov = viewport.camera.fov;
    camera.updateProjectionMatrix();

    controlsRef.current?.target.set(targetX, targetY, targetZ);
    controlsRef.current?.update();
  }, [camera, viewport]);

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.12}
      enableDamping
      makeDefault
      maxDistance={viewport.camera.maxDistance}
      maxPolarAngle={Math.PI / 2.02}
      minDistance={viewport.camera.minDistance}
      target={toTuple(viewport.camera.target)}
    />
  );
}

function ConstructionGrid({ viewport }: Pick<ViewportCanvasProps, "viewport">) {
  if (!viewport.grid.visible) {
    return null;
  }

  const majorDivisions = Math.max(1, Math.floor(viewport.grid.minorDivisions / viewport.grid.majorLineEvery));

  return (
    <group position={[0, viewport.grid.elevation, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0125, 0]}>
        <planeGeometry args={[viewport.grid.size, viewport.grid.size]} />
        <meshStandardMaterial color="#0d151e" metalness={0.1} roughness={0.95} transparent opacity={0.65} />
      </mesh>
      <gridHelper args={[viewport.grid.size, viewport.grid.minorDivisions, "#24384b", "#16212b"]} position={[0, 0.001, 0]} />
      <gridHelper args={[viewport.grid.size, majorDivisions, "#f69036", "#36516f"]} position={[0, 0.002, 0]} />
    </group>
  );
}

function RenderPrimitive({ mesh }: { mesh: DerivedRenderMesh }) {
  const geometry = useMemo(() => {
    if (!mesh.surface) {
      return undefined;
    }

    const bufferGeometry = new BufferGeometry();
    bufferGeometry.setAttribute("position", new Float32BufferAttribute(mesh.surface.positions, 3));
    bufferGeometry.setIndex(mesh.surface.indices);
    bufferGeometry.computeVertexNormals();

    return bufferGeometry;
  }, [mesh.surface]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  const materialProps = {
    color: mesh.material.color,
    wireframe: mesh.material.wireframe,
    metalness: mesh.material.wireframe ? 0.05 : 0.15,
    roughness: mesh.material.wireframe ? 0.45 : 0.72,
    side: DoubleSide
  };

  return (
    <mesh
      castShadow
      receiveShadow
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      scale={toTuple(mesh.scale)}
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
      <meshStandardMaterial {...materialProps} />
    </mesh>
  );
}

function ScenePreview({ renderScene }: Pick<ViewportCanvasProps, "renderScene">) {
  return (
    <>
      {renderScene.meshes.map((mesh) => (
        <RenderPrimitive key={mesh.nodeId} mesh={mesh} />
      ))}

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

export function ViewportCanvas({ renderScene, viewport }: ViewportCanvasProps) {
  return (
    <Canvas
      camera={{
        far: viewport.camera.far,
        fov: viewport.camera.fov,
        near: viewport.camera.near,
        position: toTuple(viewport.camera.position)
      }}
      shadows
    >
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 45, 180]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#9ec5f8", "#0f1721", 0.7]} />
      <directionalLight castShadow intensity={1.4} position={[18, 26, 12]} shadow-mapSize-height={2048} shadow-mapSize-width={2048} />
      <EditorCameraRig viewport={viewport} />
      <ConstructionGrid viewport={viewport} />
      <axesHelper args={[3]} />
      <ScenePreview renderScene={renderScene} />
    </Canvas>
  );
}
