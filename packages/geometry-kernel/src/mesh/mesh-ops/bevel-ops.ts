import type { EditableMesh, FaceID, Vec3, VertexID } from "@ggez/shared";
import {
  addVec3,
  averageVec3,
  crossVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  vec3
} from "@ggez/shared";
import { computePolygonNormal } from "../../polygon/polygon-utils";
import {
  createEditableMeshFromPolygons,
  createFacePlaneBasis,
  createOrientedPolygon,
  findEdgeIndex,
  getMeshPolygons,
  lerpVec3,
  midpoint,
  makeUndirectedEdgeKey,
  orientPolygonLoops,
  pointLiesOnSegment,
  projectFacePoint,
  replacePolygonEdge,
  replacePolygonVertexWithBevelPoints,
  replacePolygonVertexWithSequence,
  rotateAroundAxis
} from "./shared";
import type {
  BevelCorner,
  BevelFaceData,
  BevelProfilePoint,
  BevelVertexProfile,
  EdgeBevelProfile,
  MeshPolygonData,
  OrientedEditablePolygon
} from "./types";

export function bevelEditableMeshEdge(
  mesh: EditableMesh,
  edge: [VertexID, VertexID],
  width: number,
  steps: number,
  profile: EdgeBevelProfile = "flat",
  epsilon = 0.0001
): EditableMesh | undefined {
  if (Math.abs(width) <= epsilon) {
    return structuredClone(mesh);
  }

  const polygons = getMeshPolygons(mesh);
  const adjacent = polygons.filter((polygon) => findEdgeIndex(polygon.vertexIds, edge) >= 0);

  if (adjacent.length !== 2) {
    return undefined;
  }

  const [firstFace, secondFace] = adjacent;
  const firstEdgeIndex = findEdgeIndex(firstFace.vertexIds, edge);
  const secondEdgeIndex = findEdgeIndex(secondFace.vertexIds, edge);

  if (firstEdgeIndex < 0 || secondEdgeIndex < 0) {
    return undefined;
  }

  const orientedEdgeStartId = firstFace.vertexIds[firstEdgeIndex];
  const orientedEdgeEndId = firstFace.vertexIds[(firstEdgeIndex + 1) % firstFace.vertexIds.length];
  const firstFaceOrientedEdge: [VertexID, VertexID] = [orientedEdgeStartId, orientedEdgeEndId];
  const secondFaceOrientedEdge: [VertexID, VertexID] = [
    secondFace.vertexIds[secondEdgeIndex],
    secondFace.vertexIds[(secondEdgeIndex + 1) % secondFace.vertexIds.length]
  ];
  const firstVertex = firstFace.positions[firstEdgeIndex];
  const secondVertex = firstFace.positions[(firstEdgeIndex + 1) % firstFace.positions.length];
  const axis = normalizeVec3(subVec3(secondVertex, firstVertex));
  const edgeCenter = averageVec3([firstVertex, secondVertex]);
  const firstInsetDirection = computeInsetDirection(firstFace, edgeCenter, axis);
  const secondInsetDirection = computeInsetDirection(secondFace, edgeCenter, axis);

  if (!firstInsetDirection || !secondInsetDirection) {
    return undefined;
  }

  const stepCount = Math.max(1, Math.round(steps));
  const signedWidth = width;
  const angle = Math.atan2(
    dotVec3(axis, crossVec3(firstInsetDirection, secondInsetDirection)),
    dotVec3(firstInsetDirection, secondInsetDirection)
  );
  const firstOffset = scaleVec3(firstInsetDirection, signedWidth);
  const secondOffset = scaleVec3(secondInsetDirection, signedWidth);
  const railCount = stepCount + 1;
  const rails =
    profile === "round" && Math.abs(angle) > epsilon
      ? Array.from({ length: railCount }, (_, index) => {
          const t = railCount === 1 ? 0 : index / (railCount - 1);
          const direction = rotateAroundAxis(firstInsetDirection, axis, angle * t);
          const offset = scaleVec3(direction, signedWidth);

          return [addVec3(firstVertex, offset), addVec3(secondVertex, offset)] as const;
        })
      : Array.from({ length: railCount }, (_, index) => {
          const t = railCount === 1 ? 0 : index / (railCount - 1);
          const offset = lerpVec3(firstOffset, secondOffset, t);

          return [addVec3(firstVertex, offset), addVec3(secondVertex, offset)] as const;
        });

  const nextPolygons = polygons
    .filter((polygon) => polygon.id !== firstFace.id && polygon.id !== secondFace.id)
    .map((polygon) => ({
      expectedNormal: polygon.normal,
      id: polygon.id,
      materialId: polygon.materialId,
      positions: polygon.positions.map((position) => vec3(position.x, position.y, position.z)),
      uvScale: polygon.uvScale,
      vertexIds: [...polygon.vertexIds]
    }));

  const firstReplacement = replacePolygonEdge(firstFace, firstFaceOrientedEdge, rails[0][0], rails[0][1]);
  const secondFaceMatchesFirstOrientation =
    secondFaceOrientedEdge[0] === firstFaceOrientedEdge[0] &&
    secondFaceOrientedEdge[1] === firstFaceOrientedEdge[1];
  const secondReplacement = replacePolygonEdge(
    secondFace,
    secondFaceOrientedEdge,
    secondFaceMatchesFirstOrientation ? rails[rails.length - 1][0] : rails[rails.length - 1][1],
    secondFaceMatchesFirstOrientation ? rails[rails.length - 1][1] : rails[rails.length - 1][0]
  );

  if (!firstReplacement || !secondReplacement) {
    return undefined;
  }

  const firstEndpointFaces = nextPolygons.map((polygon) =>
    polygon.vertexIds.includes(orientedEdgeStartId)
      ? replacePolygonVertexWithBevelPoints(
          polygon,
          orientedEdgeStartId,
          firstFace,
          secondFace,
          rails[0][0],
          rails[rails.length - 1][0]
        )
      : polygon
  );
  const nextEndpointFaces = firstEndpointFaces.map((polygon) =>
    polygon.vertexIds.includes(orientedEdgeEndId)
      ? replacePolygonVertexWithBevelPoints(
          polygon,
          orientedEdgeEndId,
          firstFace,
          secondFace,
          rails[0][1],
          rails[rails.length - 1][1]
        )
      : polygon
  );

  const beveledPolygons: OrientedEditablePolygon[] = [
    ...nextEndpointFaces.map((polygon) => ({
      expectedNormal: polygon.expectedNormal,
      id: polygon.id,
      materialId: polygon.materialId,
      positions: polygon.positions,
      uvScale: polygon.uvScale,
      vertexIds: polygon.vertexIds
    })),
    {
      expectedNormal: firstFace.normal,
      id: firstReplacement.id,
      materialId: firstFace.materialId,
      positions: firstReplacement.positions,
      uvScale: firstFace.uvScale,
      vertexIds: firstReplacement.vertexIds
    },
    {
      expectedNormal: secondFace.normal,
      id: secondReplacement.id,
      materialId: secondFace.materialId,
      positions: secondReplacement.positions,
      uvScale: secondFace.uvScale,
      vertexIds: secondReplacement.vertexIds
    }
  ];

  const stripExpectedNormal = normalizeVec3(addVec3(firstFace.normal, secondFace.normal));

  for (let index = 0; index < rails.length - 1; index += 1) {
    const stripPositions = [rails[index][0], rails[index][1], rails[index + 1][1], rails[index + 1][0]];
    const strip = createOrientedPolygon(
      `${firstFace.id}:bevel:${index}`,
      stripPositions,
      lengthVec3(stripExpectedNormal) <= epsilon ? computePolygonNormal(stripPositions) : stripExpectedNormal
    );

    if (strip) {
      beveledPolygons.push({
        expectedNormal: strip.expectedNormal,
        id: strip.id,
        materialId: firstFace.materialId ?? secondFace.materialId,
        positions: strip.positions,
        uvScale: firstFace.uvScale ?? secondFace.uvScale,
        vertexIds: strip.vertexIds
      });
    }
  }

  return createEditableMeshFromPolygons(orientPolygonLoops(beveledPolygons));
}

export function bevelEditableMeshEdges(
  mesh: EditableMesh,
  edges: Array<[VertexID, VertexID]>,
  width: number,
  steps: number,
  profile: EdgeBevelProfile = "flat",
  epsilon = 0.0001
): EditableMesh | undefined {
  const edgeKeys = Array.from(new Set(edges.map((edge) => makeUndirectedEdgeKey(edge[0], edge[1]))));

  if (edgeKeys.length === 0) {
    return undefined;
  }

  if (Math.abs(width) <= epsilon) {
    return structuredClone(mesh);
  }

  const polygons = getMeshPolygons(mesh);
  const edgeData = edgeKeys.map((edgeKey) => {
    const adjacentFaces = polygons.filter((polygon) =>
      polygon.vertexIds.some((vertexId, index) => {
        const nextVertexId = polygon.vertexIds[(index + 1) % polygon.vertexIds.length];
        return makeUndirectedEdgeKey(vertexId, nextVertexId) === edgeKey;
      })
    );

    if (adjacentFaces.length !== 2) {
      return undefined;
    }

    const firstFace = adjacentFaces[0];
    const secondFace = adjacentFaces[1];
    const firstEdgeIndex = firstFace.vertexIds.findIndex((vertexId, index) => {
      const nextVertexId = firstFace.vertexIds[(index + 1) % firstFace.vertexIds.length];
      return makeUndirectedEdgeKey(vertexId, nextVertexId) === edgeKey;
    });
    const secondEdgeIndex = secondFace.vertexIds.findIndex((vertexId, index) => {
      const nextVertexId = secondFace.vertexIds[(index + 1) % secondFace.vertexIds.length];
      return makeUndirectedEdgeKey(vertexId, nextVertexId) === edgeKey;
    });

    if (firstEdgeIndex < 0 || secondEdgeIndex < 0) {
      return undefined;
    }

    const orientedEdge: [VertexID, VertexID] = [
      firstFace.vertexIds[firstEdgeIndex],
      firstFace.vertexIds[(firstEdgeIndex + 1) % firstFace.vertexIds.length]
    ];

    return {
      edge: orientedEdge,
      edgeKey,
      firstEdgeIndex,
      firstFace,
      secondEdgeIndex,
      secondFace
    };
  });

  if (edgeData.some((entry) => !entry)) {
    return undefined;
  }

  const selectedEdgeKeys = new Set(edgeKeys);
  const touchedVertexIds = new Set(edgeData.flatMap((entry) => (entry ? entry.edge : [])));
  const faceDataById = new Map(
    polygons.map((polygon) => {
      const corners = polygon.vertexIds.map((vertexId, index) => {
        const prevEdgeIndex = (index - 1 + polygon.vertexIds.length) % polygon.vertexIds.length;
        const nextEdgeIndex = index;
        const prevSelected = selectedEdgeKeys.has(makeUndirectedEdgeKey(polygon.vertexIds[prevEdgeIndex], polygon.vertexIds[index]));
        const nextSelected = selectedEdgeKeys.has(
          makeUndirectedEdgeKey(polygon.vertexIds[index], polygon.vertexIds[(index + 1) % polygon.vertexIds.length])
        );

        if (!prevSelected && !nextSelected) {
          return {
            id: vertexId,
            position: vec3(polygon.positions[index].x, polygon.positions[index].y, polygon.positions[index].z)
          };
        }

        const prevRail = prevSelected ? createOffsetRailForFaceEdge(polygon, prevEdgeIndex, width) : undefined;
        const nextRail = nextSelected ? createOffsetRailForFaceEdge(polygon, nextEdgeIndex, width) : undefined;

        if ((prevSelected && !prevRail) || (nextSelected && !nextRail)) {
          return undefined;
        }

        if (prevRail && nextRail) {
          return {
            id: `${polygon.id}:bevel:corner:${vertexId}`,
            position: intersectBevelRailsOnFace(polygon, prevRail.start, prevRail.end, nextRail.start, nextRail.end)
          };
        }

        if (nextRail) {
          const previousIndex = (index - 1 + polygon.positions.length) % polygon.positions.length;

          return {
            id: makeBevelBoundaryCornerId(vertexId, polygon.vertexIds[previousIndex]),
            position: intersectBevelRailsOnFace(
              polygon,
              polygon.positions[previousIndex],
              polygon.positions[index],
              nextRail.start,
              nextRail.end
            )
          };
        }

        const nextVertexId = polygon.vertexIds[(index + 1) % polygon.vertexIds.length];

        return {
          id: makeBevelBoundaryCornerId(vertexId, nextVertexId),
          position: intersectBevelRailsOnFace(
            polygon,
            prevRail!.start,
            prevRail!.end,
            polygon.positions[index],
            polygon.positions[(index + 1) % polygon.positions.length]
          )
        };
      });

      return [
        polygon.id,
        corners.some((corner) => !corner)
          ? undefined
          : {
              corners: corners as BevelCorner[],
              polygon
            }
      ] as const;
    })
  );

  if (Array.from(faceDataById.values()).some((faceData) => !faceData)) {
    return undefined;
  }

  const nextPolygons = Array.from(faceDataById.values()).reduce<Array<OrientedEditablePolygon & { vertexIds?: VertexID[] }>>(
    (collection, faceData) => {
      if (!faceData) {
        return collection;
      }

      const polygon = createOrientedPolygon(
        faceData.polygon.id,
        faceData.corners.map((corner) => corner.position),
        faceData.polygon.normal,
        faceData.corners.map((corner) => corner.id)
      );

      if (polygon) {
        collection.push(polygon);
      }

      return collection;
    },
    []
  );

  if (nextPolygons.length !== polygons.length) {
    return undefined;
  }

  const nextPolygonById = new Map(nextPolygons.map((polygon) => [polygon.id, polygon] as const));
  const vertexProfiles = new Map<VertexID, BevelVertexProfile[]>();

  edgeData.forEach((entry, edgeIndex) => {
    if (!entry) {
      return;
    }

    const firstFaceData = faceDataById.get(entry.firstFace.id);
    const secondFaceData = faceDataById.get(entry.secondFace.id);

    if (!firstFaceData || !secondFaceData) {
      return;
    }

    const rails = buildBevelRailsForSelectedEdge(
      entry.firstFace,
      entry.firstEdgeIndex,
      firstFaceData,
      entry.secondFace,
      entry.secondEdgeIndex,
      secondFaceData,
      steps,
      profile,
      epsilon
    );

    rails.forEach((rail, railIndex) => {
      if (railIndex === rails.length - 1) {
        return;
      }

      const nextRail = rails[railIndex + 1];
      const polygon = createOrientedPolygon(
        `${entry.edgeKey}:bevel:${edgeIndex}:${railIndex}`,
        [rail.start, rail.end, nextRail.end, nextRail.start],
        normalizeVec3(averageVec3([entry.firstFace.normal, entry.secondFace.normal])),
        [rail.startId, rail.endId, nextRail.endId, nextRail.startId]
      );

      if (polygon) {
        nextPolygons.push(polygon);
      }
    });

    registerBevelVertexProfile(vertexProfiles, {
      edgeDirection: normalizeVec3(
        subVec3(
          entry.firstFace.positions[(entry.firstEdgeIndex + 1) % entry.firstFace.positions.length],
          entry.firstFace.positions[entry.firstEdgeIndex]
        )
      ),
      faceIds: [entry.firstFace.id, entry.secondFace.id],
      points: rails.map((rail) => ({
        id: rail.startId,
        position: vec3(rail.start.x, rail.start.y, rail.start.z)
      })),
      vertexId: entry.edge[0]
    });
    registerBevelVertexProfile(vertexProfiles, {
      edgeDirection: normalizeVec3(
        subVec3(
          entry.firstFace.positions[entry.firstEdgeIndex],
          entry.firstFace.positions[(entry.firstEdgeIndex + 1) % entry.firstFace.positions.length]
        )
      ),
      faceIds: [entry.firstFace.id, entry.secondFace.id],
      points: rails.map((rail) => ({
        id: rail.endId,
        position: vec3(rail.end.x, rail.end.y, rail.end.z)
      })),
      vertexId: entry.edge[1]
    });
  });

  touchedVertexIds.forEach((vertexId) => {
    const profiles = vertexProfiles.get(vertexId) ?? [];

    if (profiles.length === 0) {
      return;
    }

    const incidentFaces = collectOrderedIncidentFacesAtVertex(vertexId, polygons);

    if (profiles.length === 1) {
      applyEndpointBevelHostClipping(vertexId, incidentFaces, profiles[0], nextPolygons, nextPolygonById);
      return;
    }

    if (profiles.length === 2 && weldCollinearBevelProfiles(vertexId, profiles, nextPolygons, nextPolygonById)) {
      return;
    }

    createBevelVertexTransitionPolygons(vertexId, incidentFaces, profiles).forEach((polygon) => {
      nextPolygons.push(polygon);
    });
  });

  return createEditableMeshFromPolygons(orientPolygonLoops(nextPolygons));
}

function computeInsetDirection(face: MeshPolygonData, edgeCenter: Vec3, axis: Vec3) {
  const perpendicular = normalizeVec3(crossVec3(face.normal, axis));
  const projectedCenter = projectOntoPlane(subVec3(face.center, edgeCenter), axis);

  if (lengthVec3(perpendicular) <= 0.000001) {
    return perpendicular;
  }

  return dotVec3(perpendicular, projectedCenter) >= 0 ? perpendicular : scaleVec3(perpendicular, -1);
}

function projectOntoPlane(vector: Vec3, normal: Vec3) {
  return subVec3(vector, scaleVec3(normal, dotVec3(vector, normal)));
}

function createOffsetRailForFaceEdge(face: MeshPolygonData, edgeIndex: number, width: number) {
  const nextIndex = (edgeIndex + 1) % face.positions.length;
  const start = face.positions[edgeIndex];
  const end = face.positions[nextIndex];
  const axis = normalizeVec3(subVec3(end, start));
  const insetDirection = computeInsetDirection(face, averageVec3([start, end]), axis);

  if (lengthVec3(insetDirection) <= 0.000001) {
    return undefined;
  }

  const offset = scaleVec3(insetDirection, width);

  return {
    end: addVec3(end, offset),
    start: addVec3(start, offset)
  };
}

function intersectBevelRailsOnFace(
  face: MeshPolygonData,
  firstStart: Vec3,
  firstEnd: Vec3,
  secondStart: Vec3,
  secondEnd: Vec3
) {
  const basis = createFacePlaneBasis(face.normal);
  const firstStart2D = projectFacePoint(firstStart, face.center, basis);
  const firstEnd2D = projectFacePoint(firstEnd, face.center, basis);
  const secondStart2D = projectFacePoint(secondStart, face.center, basis);
  const secondEnd2D = projectFacePoint(secondEnd, face.center, basis);
  const denominator =
    (firstStart2D.u - firstEnd2D.u) * (secondStart2D.v - secondEnd2D.v) -
    (firstStart2D.v - firstEnd2D.v) * (secondStart2D.u - secondEnd2D.u);

  if (Math.abs(denominator) <= 0.000001) {
    return midpoint(firstEnd, secondStart);
  }

  const determinantFirst = firstStart2D.u * firstEnd2D.v - firstStart2D.v * firstEnd2D.u;
  const determinantSecond = secondStart2D.u * secondEnd2D.v - secondStart2D.v * secondEnd2D.u;
  const u =
    (determinantFirst * (secondStart2D.u - secondEnd2D.u) -
      (firstStart2D.u - firstEnd2D.u) * determinantSecond) /
    denominator;
  const v =
    (determinantFirst * (secondStart2D.v - secondEnd2D.v) -
      (firstStart2D.v - firstEnd2D.v) * determinantSecond) /
    denominator;

  return addVec3(addVec3(face.center, scaleVec3(basis.u, u)), scaleVec3(basis.v, v));
}

function makeBevelBoundaryCornerId(vertexId: VertexID, neighborId: VertexID) {
  return `${makeUndirectedEdgeKey(vertexId, neighborId)}:bevel:corner:${vertexId}`;
}

function buildBevelRailsForSelectedEdge(
  firstFace: MeshPolygonData,
  firstEdgeIndex: number,
  firstFaceData: BevelFaceData,
  secondFace: MeshPolygonData,
  secondEdgeIndex: number,
  secondFaceData: BevelFaceData,
  steps: number,
  profile: EdgeBevelProfile,
  epsilon: number
) {
  const stepCount = Math.max(1, Math.round(steps));
  const railCount = stepCount + 1;
  const startVertexId = firstFace.vertexIds[firstEdgeIndex];
  const endVertexId = firstFace.vertexIds[(firstEdgeIndex + 1) % firstFace.vertexIds.length];
  const firstRail = {
    end: firstFaceData.corners[(firstEdgeIndex + 1) % firstFaceData.corners.length],
    start: firstFaceData.corners[firstEdgeIndex]
  };
  const secondEdgeStartId = secondFace.vertexIds[secondEdgeIndex];
  const secondEdgeEndId = secondFace.vertexIds[(secondEdgeIndex + 1) % secondFace.vertexIds.length];
  const secondMatchesOrientation = secondEdgeStartId === startVertexId && secondEdgeEndId === endVertexId;
  const secondRail = secondMatchesOrientation
    ? {
        end: secondFaceData.corners[(secondEdgeIndex + 1) % secondFaceData.corners.length],
        start: secondFaceData.corners[secondEdgeIndex]
      }
    : {
        end: secondFaceData.corners[secondEdgeIndex],
        start: secondFaceData.corners[(secondEdgeIndex + 1) % secondFaceData.corners.length]
      };
  const edgeStart = firstFace.positions[firstEdgeIndex];
  const edgeEnd = firstFace.positions[(firstEdgeIndex + 1) % firstFace.positions.length];
  const axis = normalizeVec3(subVec3(edgeEnd, edgeStart));
  const startOffsetA = subVec3(firstRail.start.position, edgeStart);
  const startOffsetB = subVec3(secondRail.start.position, edgeStart);
  const endOffsetA = subVec3(firstRail.end.position, edgeEnd);
  const endOffsetB = subVec3(secondRail.end.position, edgeEnd);
  const startDirA = normalizeVec3(startOffsetA);
  const startDirB = normalizeVec3(startOffsetB);
  const endDirA = normalizeVec3(endOffsetA);
  const endDirB = normalizeVec3(endOffsetB);
  const startAngle = Math.atan2(dotVec3(axis, crossVec3(startDirA, startDirB)), dotVec3(startDirA, startDirB));
  const endAngle = Math.atan2(dotVec3(axis, crossVec3(endDirA, endDirB)), dotVec3(endDirA, endDirB));
  const startLengthA = lengthVec3(startOffsetA);
  const startLengthB = lengthVec3(startOffsetB);
  const endLengthA = lengthVec3(endOffsetA);
  const endLengthB = lengthVec3(endOffsetB);

  return Array.from({ length: railCount }, (_, index) => {
    const t = railCount === 1 ? 0 : index / (railCount - 1);
    const useRound =
      profile === "round" &&
      startLengthA > epsilon &&
      startLengthB > epsilon &&
      endLengthA > epsilon &&
      endLengthB > epsilon;
    const startPosition = useRound
      ? addVec3(
          edgeStart,
          scaleVec3(rotateAroundAxis(startDirA, axis, startAngle * t), startLengthA + (startLengthB - startLengthA) * t)
        )
      : lerpVec3(firstRail.start.position, secondRail.start.position, t);
    const endPosition = useRound
      ? addVec3(
          edgeEnd,
          scaleVec3(rotateAroundAxis(endDirA, axis, endAngle * t), endLengthA + (endLengthB - endLengthA) * t)
        )
      : lerpVec3(firstRail.end.position, secondRail.end.position, t);

    return {
      end: endPosition,
      endId:
        index === 0
          ? firstRail.end.id
          : index === railCount - 1
            ? secondRail.end.id
            : `${makeUndirectedEdgeKey(startVertexId, endVertexId)}:bevel:${index}:end`,
      start: startPosition,
      startId:
        index === 0
          ? firstRail.start.id
          : index === railCount - 1
            ? secondRail.start.id
            : `${makeUndirectedEdgeKey(startVertexId, endVertexId)}:bevel:${index}:start`
    };
  });
}

function registerBevelVertexProfile(registry: Map<VertexID, BevelVertexProfile[]>, profile: BevelVertexProfile) {
  const profiles = registry.get(profile.vertexId) ?? [];

  profiles.push(profile);
  registry.set(profile.vertexId, profiles);
}

function collectOrderedIncidentFacesAtVertex(vertexId: VertexID, polygons: MeshPolygonData[]) {
  const incidentFaces = polygons.filter((polygon) => polygon.vertexIds.includes(vertexId));

  if (incidentFaces.length <= 1) {
    return incidentFaces;
  }

  const vertexPosition = incidentFaces
    .flatMap((polygon) =>
      polygon.vertexIds.map((candidateId, index) => ({
        candidateId,
        position: polygon.positions[index]
      }))
    )
    .find((entry) => entry.candidateId === vertexId)?.position;

  if (!vertexPosition) {
    return incidentFaces;
  }

  const averageNormal = normalizeVec3(averageVec3(incidentFaces.map((polygon) => polygon.normal)));
  const basis = createFacePlaneBasis(averageNormal);

  return incidentFaces.slice().sort((left, right) => {
    const leftProjected = projectFacePoint(left.center, vertexPosition, basis);
    const rightProjected = projectFacePoint(right.center, vertexPosition, basis);

    return Math.atan2(leftProjected.v, leftProjected.u) - Math.atan2(rightProjected.v, rightProjected.u);
  });
}

function applyEndpointBevelHostClipping(
  vertexId: VertexID,
  incidentFaces: MeshPolygonData[],
  profile: BevelVertexProfile,
  nextPolygons: Array<OrientedEditablePolygon & { vertexIds?: VertexID[] }>,
  nextPolygonById: Map<FaceID, OrientedEditablePolygon & { vertexIds?: VertexID[] }>
) {
  const selectedFaceIds = new Set(profile.faceIds);
  const selectedFaces = incidentFaces.filter((face) => selectedFaceIds.has(face.id));
  const hostFaces = incidentFaces.filter((face) => !selectedFaceIds.has(face.id));
  const boundaryProfile = profile.points.map((point) => ({
    id: point.id,
    position: vec3(point.position.x, point.position.y, point.position.z)
  }));
  const firstBoundaryPoint = boundaryProfile[0];
  const secondBoundaryPoint = boundaryProfile[boundaryProfile.length - 1];

  if (selectedFaces.length !== 2 || !firstBoundaryPoint || !secondBoundaryPoint || hostFaces.length === 0) {
    return;
  }

  if (hostFaces.length === 1) {
    const polygon = nextPolygonById.get(hostFaces[0].id);
    const orientedBoundary = orientBevelProfileBoundaryForFace(hostFaces[0], vertexId, boundaryProfile);

    if (orientedBoundary && polygon?.vertexIds) {
      replacePolygonInCollection(
        nextPolygons,
        nextPolygonById,
        replacePolygonVertexWithSequence(polygon as OrientedEditablePolygon & { vertexIds: VertexID[] }, vertexId, orientedBoundary)
      );
    }

    return;
  }

  const boundaryPoints = [firstBoundaryPoint, secondBoundaryPoint];

  hostFaces.forEach((hostFace) => {
    const polygon = nextPolygonById.get(hostFace.id);

    if (!polygon?.vertexIds) {
      return;
    }

    for (const point of boundaryPoints) {
      let clippedHostFace: (OrientedEditablePolygon & { vertexIds: VertexID[] }) | undefined;

      for (const selectedFace of selectedFaces) {
        clippedHostFace = insertEndpointBoundaryPointOnHostFace(
          polygon as OrientedEditablePolygon & { vertexIds: VertexID[] },
          hostFace,
          vertexId,
          selectedFace,
          point
        );

        if (clippedHostFace) {
          replacePolygonInCollection(nextPolygons, nextPolygonById, clippedHostFace);
          break;
        }
      }

      if (clippedHostFace) {
        break;
      }
    }
  });
}

function replacePolygonInCollection(
  nextPolygons: Array<OrientedEditablePolygon & { vertexIds?: VertexID[] }>,
  nextPolygonById: Map<FaceID, OrientedEditablePolygon & { vertexIds?: VertexID[] }>,
  polygon: OrientedEditablePolygon & { vertexIds?: VertexID[] }
) {
  const polygonIndex = nextPolygons.findIndex((candidate) => candidate.id === polygon.id);

  if (polygonIndex < 0) {
    return;
  }

  nextPolygons[polygonIndex] = polygon;
  nextPolygonById.set(polygon.id, polygon);
}

function orientBevelProfileBoundaryForFace(face: MeshPolygonData, vertexId: VertexID, boundaryPoints: BevelProfilePoint[]) {
  const targetIndex = face.vertexIds.indexOf(vertexId);

  if (targetIndex < 0 || boundaryPoints.length < 2) {
    return undefined;
  }

  const previousPosition = face.positions[(targetIndex - 1 + face.positions.length) % face.positions.length];
  const currentPosition = face.positions[targetIndex];
  const nextPosition = face.positions[(targetIndex + 1) % face.positions.length];
  const firstOnPrevious = pointLiesOnSegment(boundaryPoints[0].position, previousPosition, currentPosition);
  const firstOnNext = pointLiesOnSegment(boundaryPoints[0].position, currentPosition, nextPosition);
  const lastOnPrevious = pointLiesOnSegment(boundaryPoints[boundaryPoints.length - 1].position, previousPosition, currentPosition);
  const lastOnNext = pointLiesOnSegment(boundaryPoints[boundaryPoints.length - 1].position, currentPosition, nextPosition);

  if (firstOnPrevious && lastOnNext) {
    return boundaryPoints.map((point) => ({
      id: point.id,
      position: vec3(point.position.x, point.position.y, point.position.z)
    }));
  }

  if (firstOnNext && lastOnPrevious) {
    return boundaryPoints.slice().reverse().map((point) => ({
      id: point.id,
      position: vec3(point.position.x, point.position.y, point.position.z)
    }));
  }

  return undefined;
}

function insertEndpointBoundaryPointOnHostFace(
  polygon: OrientedEditablePolygon & { vertexIds: VertexID[] },
  hostFace: MeshPolygonData,
  vertexId: VertexID,
  selectedFace: MeshPolygonData,
  point: BevelProfilePoint
) {
  const targetIndex = polygon.vertexIds.indexOf(vertexId);
  const hostTargetIndex = hostFace.vertexIds.indexOf(vertexId);

  if (targetIndex < 0 || hostTargetIndex < 0) {
    return undefined;
  }

  const previousIndex = (hostTargetIndex - 1 + hostFace.vertexIds.length) % hostFace.vertexIds.length;
  const nextIndex = (hostTargetIndex + 1) % hostFace.vertexIds.length;
  const previousVertexId = hostFace.vertexIds[previousIndex];
  const nextVertexId = hostFace.vertexIds[nextIndex];
  const currentPosition = polygon.positions[targetIndex];
  const previousPosition = hostFace.positions[previousIndex];
  const nextPosition = hostFace.positions[nextIndex];
  const hostCurrentPosition = hostFace.positions[hostTargetIndex];
  const sharesPreviousEdge =
    findEdgeIndex(hostFace.vertexIds, [previousVertexId, vertexId]) >= 0 &&
    findEdgeIndex(selectedFace.vertexIds, [previousVertexId, vertexId]) >= 0;
  const sharesNextEdge =
    findEdgeIndex(hostFace.vertexIds, [vertexId, nextVertexId]) >= 0 &&
    findEdgeIndex(selectedFace.vertexIds, [vertexId, nextVertexId]) >= 0;

  if (sharesPreviousEdge && pointLiesOnSegment(point.position, previousPosition, hostCurrentPosition)) {
    return replacePolygonVertexWithSequence(polygon, vertexId, [
      {
        id: point.id,
        position: vec3(point.position.x, point.position.y, point.position.z)
      },
      {
        id: vertexId,
        position: vec3(currentPosition.x, currentPosition.y, currentPosition.z)
      }
    ]);
  }

  if (sharesNextEdge && pointLiesOnSegment(point.position, hostCurrentPosition, nextPosition)) {
    return replacePolygonVertexWithSequence(polygon, vertexId, [
      {
        id: vertexId,
        position: vec3(currentPosition.x, currentPosition.y, currentPosition.z)
      },
      {
        id: point.id,
        position: vec3(point.position.x, point.position.y, point.position.z)
      }
    ]);
  }

  return undefined;
}

function weldCollinearBevelProfiles(
  vertexId: VertexID,
  profiles: BevelVertexProfile[],
  nextPolygons: Array<OrientedEditablePolygon & { vertexIds?: VertexID[] }>,
  nextPolygonById: Map<FaceID, OrientedEditablePolygon & { vertexIds?: VertexID[] }>,
  epsilon = 0.0001
) {
  if (profiles.length !== 2) {
    return false;
  }

  const firstPoints = profiles[0].points.map((point) => ({
    id: point.id,
    position: vec3(point.position.x, point.position.y, point.position.z)
  }));
  const secondPointsForward = profiles[1].points.map((point) => ({
    id: point.id,
    position: vec3(point.position.x, point.position.y, point.position.z)
  }));
  const secondPointsReverse = profiles[1].points.slice().reverse().map((point) => ({
    id: point.id,
    position: vec3(point.position.x, point.position.y, point.position.z)
  }));
  const forwardAlignment = measureProfileAlignment(firstPoints, secondPointsForward);
  const reverseAlignment = measureProfileAlignment(firstPoints, secondPointsReverse);
  const secondPoints =
    forwardAlignment.totalDistance <= reverseAlignment.totalDistance ? secondPointsForward : secondPointsReverse;
  const alignment =
    forwardAlignment.totalDistance <= reverseAlignment.totalDistance ? forwardAlignment : reverseAlignment;

  if (firstPoints.length !== secondPoints.length) {
    return false;
  }

  const profileSpan = Math.max(
    firstPoints.length > 1 ? lengthVec3(subVec3(firstPoints[0].position, firstPoints[firstPoints.length - 1].position)) : 0,
    secondPoints.length > 1
      ? lengthVec3(subVec3(secondPoints[0].position, secondPoints[secondPoints.length - 1].position))
      : 0,
    epsilon
  );

  if (alignment.maxDistance > Math.max(epsilon * 20, profileSpan * 0.35) && dotVec3(profiles[0].edgeDirection, profiles[1].edgeDirection) > -0.5) {
    return false;
  }

  const replacements = new Map<VertexID, BevelProfilePoint>();

  firstPoints.forEach((point, index) => {
    const otherPoint = secondPoints[index];
    const canonicalId = `${vertexId}:bevel:chain:${index}`;
    const canonicalPosition = midpoint(point.position, otherPoint.position);

    replacements.set(point.id, {
      id: canonicalId,
      position: canonicalPosition
    });
    replacements.set(otherPoint.id, {
      id: canonicalId,
      position: canonicalPosition
    });
  });

  if (replacements.size === 0) {
    return false;
  }

  nextPolygons.forEach((polygon, polygonIndex) => {
    if (!polygon.vertexIds) {
      return;
    }

    let changed = false;
    const positions = polygon.positions.map((position) => vec3(position.x, position.y, position.z));
    const vertexIds = [...polygon.vertexIds];

    vertexIds.forEach((polygonVertexId, index) => {
      const replacement = replacements.get(polygonVertexId);

      if (!replacement) {
        return;
      }

      changed = true;
      vertexIds[index] = replacement.id;
      positions[index] = vec3(replacement.position.x, replacement.position.y, replacement.position.z);
    });

    if (!changed) {
      return;
    }

    const nextPolygon = {
      expectedNormal: polygon.expectedNormal,
      id: polygon.id,
      positions,
      vertexIds
    };

    nextPolygons[polygonIndex] = nextPolygon;
    nextPolygonById.set(nextPolygon.id, nextPolygon);
  });

  return true;
}

function measureProfileAlignment(left: BevelProfilePoint[], right: BevelProfilePoint[]) {
  if (left.length !== right.length) {
    return {
      maxDistance: Number.POSITIVE_INFINITY,
      totalDistance: Number.POSITIVE_INFINITY
    };
  }

  return left.reduce(
    (result, point, index) => {
      const distance = lengthVec3(subVec3(point.position, right[index].position));

      return {
        maxDistance: Math.max(result.maxDistance, distance),
        totalDistance: result.totalDistance + distance
      };
    },
    {
      maxDistance: 0,
      totalDistance: 0
    }
  );
}

function createBevelVertexTransitionPolygons(
  vertexId: VertexID,
  incidentFaces: MeshPolygonData[],
  profiles: BevelVertexProfile[]
) {
  if (incidentFaces.length === 0 || profiles.length < 2) {
    return [];
  }

  const vertexPosition = incidentFaces
    .flatMap((polygon) =>
      polygon.vertexIds.map((candidateId, index) => ({
        candidateId,
        position: polygon.positions[index]
      }))
    )
    .find((entry) => entry.candidateId === vertexId)?.position;

  if (!vertexPosition) {
    return [];
  }

  const averageNormal = normalizeVec3(averageVec3(incidentFaces.map((polygon) => polygon.normal)));
  const faceIndexById = new Map(incidentFaces.map((face, index) => [face.id, index]));
  const orderedProfiles = profiles
    .map((profile) => orientBevelVertexProfile(profile, faceIndexById, incidentFaces.length, vertexPosition, averageNormal))
    .sort((left, right) => left.sortKey - right.sortKey);
  const polygons: OrientedEditablePolygon[] = [];

  for (let profileIndex = 0; profileIndex < orderedProfiles.length - 1; profileIndex += 1) {
    const currentProfile = compactBevelProfilePoints(orderedProfiles[profileIndex].points);
    const nextProfile = compactBevelProfilePoints(orderedProfiles[profileIndex + 1].points);
    const stepCount = Math.min(currentProfile.length, nextProfile.length);

    if (stepCount < 2) {
      continue;
    }

    for (let stepIndex = 0; stepIndex < stepCount - 1; stepIndex += 1) {
      const firstTriangle = createOrientedPolygon(
        `${vertexId}:bevel:corner:${profileIndex}:${stepIndex}:a`,
        [currentProfile[stepIndex].position, currentProfile[stepIndex + 1].position, nextProfile[stepIndex].position],
        averageNormal,
        [currentProfile[stepIndex].id, currentProfile[stepIndex + 1].id, nextProfile[stepIndex].id]
      );
      const secondTriangle = createOrientedPolygon(
        `${vertexId}:bevel:corner:${profileIndex}:${stepIndex}:b`,
        [currentProfile[stepIndex + 1].position, nextProfile[stepIndex + 1].position, nextProfile[stepIndex].position],
        averageNormal,
        [currentProfile[stepIndex + 1].id, nextProfile[stepIndex + 1].id, nextProfile[stepIndex].id]
      );

      if (firstTriangle) {
        polygons.push(firstTriangle);
      }

      if (secondTriangle) {
        polygons.push(secondTriangle);
      }
    }
  }

  return polygons;
}

function orientBevelVertexProfile(
  profile: BevelVertexProfile,
  faceIndexById: Map<FaceID, number>,
  faceCount: number,
  vertexPosition: Vec3,
  averageNormal: Vec3
) {
  const firstFaceIndex = faceIndexById.get(profile.faceIds[0]);
  const secondFaceIndex = faceIndexById.get(profile.faceIds[1]);

  if (firstFaceIndex !== undefined && secondFaceIndex !== undefined) {
    if ((firstFaceIndex + 1) % faceCount === secondFaceIndex) {
      return {
        points: profile.points.map((point) => ({
          id: point.id,
          position: vec3(point.position.x, point.position.y, point.position.z)
        })),
        sortKey: firstFaceIndex
      };
    }

    if ((secondFaceIndex + 1) % faceCount === firstFaceIndex) {
      return {
        points: profile.points.slice().reverse().map((point) => ({
          id: point.id,
          position: vec3(point.position.x, point.position.y, point.position.z)
        })),
        sortKey: secondFaceIndex
      };
    }
  }

  const basis = createFacePlaneBasis(averageNormal);
  const profileMidpoint = averageVec3(profile.points.map((point) => point.position));
  const projected = projectFacePoint(profileMidpoint, vertexPosition, basis);

  return {
    points: profile.points.map((point) => ({
      id: point.id,
      position: vec3(point.position.x, point.position.y, point.position.z)
    })),
    sortKey: Math.atan2(projected.v, projected.u)
  };
}

function compactBevelProfilePoints(points: BevelProfilePoint[]) {
  const compacted: BevelProfilePoint[] = [];

  points.forEach((point) => {
    const previous = compacted[compacted.length - 1];

    if (previous && sameBevelProfilePoint(previous, point)) {
      return;
    }

    compacted.push({
      id: point.id,
      position: vec3(point.position.x, point.position.y, point.position.z)
    });
  });

  if (compacted.length > 1 && sameBevelProfilePoint(compacted[0], compacted[compacted.length - 1])) {
    compacted.pop();
  }

  return compacted;
}

function sameBevelProfilePoint(left: BevelProfilePoint, right: BevelProfilePoint) {
  return left.id === right.id || lengthVec3(subVec3(left.position, right.position)) <= 0.000001;
}
