/**
 * Spatial voxel decomposition for convex hull approximation.
 *
 * A single convex hull over a whole mesh (e.g. a leaf canopy) is a terrible
 * approximation because the hull encloses all the empty space between the vertices.
 * This module splits a point cloud into a uniform voxel grid: each non-empty cell
 * becomes its own convex hull. The result is a set of small, tight hulls that only
 * cover where geometry actually exists — so players can walk between the gaps in
 * foliage, fence slats, etc. without being blocked by an invisible mega-hull.
 *
 * Algorithm: axis-aligned uniform grid, resolution chosen so the total number of
 * non-empty cells targets `targetHullCount`. Grid dimensions are weighted per-axis
 * by the point cloud's bounding-box extents so cells are approximately cubic.
 */

export interface HullDecompositionOptions {
  /**
   * Upper bound on how many hull groups to produce.
   * The grid is sized so that a uniformly distributed cloud would fill roughly
   * this many cells. Actual count is often lower (sparse or clustered geometry).
  * Default: adapt to the point count, clamped to 32..192.
   */
  targetHullCount?: number;

  /**
   * Minimum number of points a voxel must contain to produce a hull.
   * Voxels with fewer points are discarded (tiny stray fragments).
   * Default: 4
   */
  minPointsPerHull?: number;
}

/**
 * Decomposes a flat position array into groups, each suitable for an individual
 * convex hull. Returns an array of flat [x,y,z,…] arrays.
 *
 * Returns an empty array if the input has fewer usable points than `minPointsPerHull`.
 * Returns `[positions]` (single group, no copy) if decomposition is unnecessary.
 */
export function decomposeIntoConvexHullGroups(
  positions: number[],
  options: HullDecompositionOptions = {}
): number[][] {
  const pointCount = Math.floor(positions.length / 3);

  const { minPointsPerHull = 4 } = options;
  const targetHullCount = options.targetHullCount ?? resolveAdaptiveHullCount(pointCount);

  if (pointCount < minPointsPerHull) {
    return [];
  }

  // Compute AABB
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxSize = Math.max(sizeX, sizeY, sizeZ);

  if (maxSize < 1e-6) {
    // Degenerate (all points coincident) — single hull
    return [positions];
  }

  // Grid dimensions: scale each axis by its fraction of the largest extent so
  // that cells are roughly cubic regardless of the mesh's aspect ratio.
  const cbrt = Math.cbrt(targetHullCount);
  const stepsX = Math.max(1, Math.round(cbrt * (sizeX / maxSize)));
  const stepsY = Math.max(1, Math.round(cbrt * (sizeY / maxSize)));
  const stepsZ = Math.max(1, Math.round(cbrt * (sizeZ / maxSize)));

  // If the grid would be 1×1×1 there is no benefit in decomposing
  if (stepsX === 1 && stepsY === 1 && stepsZ === 1) {
    return [positions];
  }

  // Assign each vertex to its voxel
  const voxelMap = new Map<number, number[]>();

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    const gx = sizeX > 0 ? Math.min(stepsX - 1, Math.floor(((x - minX) / sizeX) * stepsX)) : 0;
    const gy = sizeY > 0 ? Math.min(stepsY - 1, Math.floor(((y - minY) / sizeY) * stepsY)) : 0;
    const gz = sizeZ > 0 ? Math.min(stepsZ - 1, Math.floor(((z - minZ) / sizeZ) * stepsZ)) : 0;

    const key = gx + gy * stepsX + gz * stepsX * stepsY;

    let cell = voxelMap.get(key);

    if (!cell) {
      cell = [];
      voxelMap.set(key, cell);
    }

    cell.push(x, y, z);
  }

  // Collect cells that have enough points to form a meaningful hull
  const groups: number[][] = [];

  for (const cell of voxelMap.values()) {
    if (cell.length >= minPointsPerHull * 3) {
      groups.push(cell);
    }
  }

  // If everything collapsed into a single group (or all cells were too small)
  // fall back to the raw positions so nothing is silently dropped
  if (groups.length === 0) {
    return [positions];
  }

  return groups;
}

function resolveAdaptiveHullCount(pointCount: number) {
  return Math.min(192, Math.max(32, Math.round(pointCount / 64)));
}
