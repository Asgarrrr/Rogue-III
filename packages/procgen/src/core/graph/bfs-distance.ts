/**
 * BFS Distance Calculation
 *
 * Shared utility for calculating distances from a source node using BFS.
 * Replaces duplicated implementations across the codebase.
 */

/**
 * Result of BFS distance calculation.
 */
export interface BFSDistanceResult<TNodeId> {
  /** Map from node ID to distance from source */
  readonly distances: Map<TNodeId, number>;
  /** Maximum distance from source */
  readonly maxDistance: number;
}

/**
 * Calculate distances from a source node using BFS.
 *
 * @param sourceId - Starting node ID
 * @param getNeighbors - Function that returns neighbors for a given node
 * @returns Distance map and max distance
 *
 * @example
 * ```typescript
 * // For room-based graphs
 * const { distances, maxDistance } = calculateBFSDistances(
 *   entranceRoom.id,
 *   (roomId) => adjacency.get(roomId) ?? []
 * );
 * ```
 */
export function calculateBFSDistances<TNodeId>(
  sourceId: TNodeId,
  getNeighbors: (nodeId: TNodeId) => readonly TNodeId[],
): BFSDistanceResult<TNodeId> {
  const distances = new Map<TNodeId, number>();
  const queue: TNodeId[] = [sourceId];
  let queueHead = 0;
  let maxDistance = 0;

  distances.set(sourceId, 0);

  while (queueHead < queue.length) {
    const current = queue[queueHead++]!;
    const currentDist = distances.get(current)!;

    for (const neighbor of getNeighbors(current)) {
      if (!distances.has(neighbor)) {
        const nextDistance = currentDist + 1;
        distances.set(neighbor, nextDistance);
        if (nextDistance > maxDistance) {
          maxDistance = nextDistance;
        }
        queue.push(neighbor);
      }
    }
  }

  return { distances, maxDistance };
}

/**
 * Calculate distances for string-keyed graphs (experience graphs).
 */
export function calculateStringGraphDistances(
  sourceId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
): BFSDistanceResult<string> {
  return calculateBFSDistances(
    sourceId,
    (nodeId) => adjacency.get(nodeId) ?? [],
  );
}

/**
 * Calculate distances for number-keyed graphs (room graphs).
 */
export function calculateRoomGraphDistances(
  sourceId: number,
  adjacency: ReadonlyMap<number, readonly number[]>,
): BFSDistanceResult<number> {
  return calculateBFSDistances(
    sourceId,
    (roomId) => adjacency.get(roomId) ?? [],
  );
}
