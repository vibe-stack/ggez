import { useEffect, useRef } from "react";
import {
  addVec3,
  crossVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  vec3,
  type GeometryNode,
  type Transform,
  type Vec3
} from "@ggez/shared";
import { BufferGeometry, Euler, Float32BufferAttribute, Quaternion, Vector3 } from "three";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";

export function InstanceBrushPreview({ placements }: { placements: Array<{ transform: Transform }> }) {
  const geometryRef = useRef<BufferGeometry>(new BufferGeometry());

  useEffect(() => {
    const geometry = geometryRef.current;
    const armLength = 0.25;
    const ringSegments = 8;
    const ringRadius = 0.18;
    const positions: number[] = [];

    for (const { transform } of placements) {
      const { position, rotation } = transform;
      const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z, "XYZ"));
      const up = new Vector3(0, 1, 0).applyQuaternion(quaternion);
      const forward = new Vector3(0, 0, 1).applyQuaternion(quaternion);
      const right = new Vector3(1, 0, 0).applyQuaternion(quaternion);

      positions.push(
        position.x - up.x * armLength,
        position.y - up.y * armLength,
        position.z - up.z * armLength,
        position.x + up.x * armLength,
        position.y + up.y * armLength,
        position.z + up.z * armLength
      );

      for (let index = 0; index < ringSegments; index += 1) {
        const angle0 = (index / ringSegments) * Math.PI * 2;
        const angle1 = ((index + 1) / ringSegments) * Math.PI * 2;
        const cos0 = Math.cos(angle0) * ringRadius;
        const sin0 = Math.sin(angle0) * ringRadius;
        const cos1 = Math.cos(angle1) * ringRadius;
        const sin1 = Math.sin(angle1) * ringRadius;

        positions.push(
          position.x + right.x * cos0 + forward.x * sin0,
          position.y + right.y * cos0 + forward.y * sin0,
          position.z + right.z * cos0 + forward.z * sin0,
          position.x + right.x * cos1 + forward.x * sin1,
          position.y + right.y * cos1 + forward.y * sin1,
          position.z + right.z * cos1 + forward.z * sin1
        );
      }
    }

    const current = geometry.getAttribute("position") as Float32BufferAttribute | undefined;

    if (current && current.array.length === positions.length) {
      (current.array as Float32Array).set(positions);
      current.needsUpdate = true;
    } else {
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }, [placements]);

  useEffect(() => () => {
    geometryRef.current.dispose();
  }, []);

  if (placements.length === 0) {
    return null;
  }

  return (
    <lineSegments frustumCulled={false} geometry={geometryRef.current} renderOrder={15}>
      <lineBasicMaterial color="#4ade80" depthWrite={false} opacity={0.8} toneMapped={false} transparent />
    </lineSegments>
  );
}

export function SculptBrushOverlay({
  hovered,
  node,
  radius
}: {
  hovered?: { normal: Vec3; point: Vec3 };
  node?: GeometryNode;
  radius: number;
}) {
  const geometryRef = useRef<BufferGeometry>(new BufferGeometry());

  useEffect(() => {
    const geometry = geometryRef.current;

    if (!hovered) {
      geometry.deleteAttribute("position");
      return;
    }

    const basis = createBrushRingBasis(hovered.normal);
    const segmentCount = 40;
    const positions: number[] = [];

    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2;
      const radialOffset = addVec3(
        scaleVec3(basis.u, Math.cos(angle) * radius),
        scaleVec3(basis.v, Math.sin(angle) * radius)
      );
      const point = addVec3(hovered.point, addVec3(radialOffset, scaleVec3(hovered.normal, 0.02)));

      positions.push(point.x, point.y, point.z);
    }

    const current = geometry.getAttribute("position");

    if (!(current instanceof Float32BufferAttribute) || current.array.length !== positions.length) {
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    } else {
      current.array.set(positions);
      current.needsUpdate = true;
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }, [hovered, radius]);

  useEffect(() => () => {
    geometryRef.current.dispose();
  }, []);

  if (!hovered) {
    return null;
  }

  const ring = (
    <lineLoop geometry={geometryRef.current as never} renderOrder={14}>
      <lineBasicMaterial color="#f8fafc" depthWrite={false} opacity={0.95} toneMapped={false} transparent />
    </lineLoop>
  );

  if (!node) {
    return ring;
  }

  return <NodeTransformGroup transform={node.transform}>{ring}</NodeTransformGroup>;
}

function createBrushRingBasis(normal: Vec3) {
  const axis = lengthVec3(normal) > 0.000001 ? normalizeVec3(normal) : vec3(0, 1, 0);
  const reference = Math.abs(axis.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalizeVec3(crossVec3(reference, axis));
  const v = normalizeVec3(crossVec3(axis, u));

  return { u, v };
}
