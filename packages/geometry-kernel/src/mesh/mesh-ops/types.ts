import type { FaceID, MaterialID, Vec2, Vec3, VertexID } from "@web-hammer/shared";

export type MeshPolygonData = {
  center: Vec3;
  id: FaceID;
  materialId?: MaterialID;
  normal: Vec3;
  positions: Vec3[];
  uvScale?: Vec2;
  vertexIds: VertexID[];
};

export type BevelCorner = {
  id: VertexID;
  position: Vec3;
};

export type BevelFaceData = {
  corners: BevelCorner[];
  polygon: MeshPolygonData;
};

export type BevelProfilePoint = {
  id: VertexID;
  position: Vec3;
};

export type BevelVertexProfile = {
  edgeDirection: Vec3;
  faceIds: [FaceID, FaceID];
  points: BevelProfilePoint[];
  vertexId: VertexID;
};

export type EdgeBevelProfile = "flat" | "round";

export type OrientedEditablePolygon = {
  expectedNormal?: Vec3;
  id: FaceID;
  materialId?: MaterialID;
  positions: Vec3[];
  uvScale?: Vec2;
  vertexIds?: VertexID[];
};

export type FacePlanePoint = {
  u: number;
  v: number;
};

export type ResolvedFaceCut = {
  end: Vec3;
  firstEdge: [VertexID, VertexID];
  firstEdgeIndex: number;
  firstPoint: Vec3;
  secondEdge: [VertexID, VertexID];
  secondEdgeIndex: number;
  secondPoint: Vec3;
  start: Vec3;
  target: MeshPolygonData;
};