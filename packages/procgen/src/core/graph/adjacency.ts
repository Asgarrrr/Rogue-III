/**
 * Adjacency Building Utilities
 *
 * Shared utilities for building adjacency maps from various graph representations.
 */

import type { Connection, Room } from "../../pipeline/types";

/**
 * Build adjacency map from rooms and connections.
 * Creates bidirectional edges for each connection.
 */
export function buildRoomAdjacency(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();

  // Initialize all rooms
  for (const room of rooms) {
    adjacency.set(room.id, []);
  }

  // Add connections (bidirectional)
  for (const conn of connections) {
    const fromNeighbors = adjacency.get(conn.fromRoomId);
    const toNeighbors = adjacency.get(conn.toRoomId);

    if (fromNeighbors && !fromNeighbors.includes(conn.toRoomId)) {
      fromNeighbors.push(conn.toRoomId);
    }
    if (toNeighbors && !toNeighbors.includes(conn.fromRoomId)) {
      toNeighbors.push(conn.fromRoomId);
    }
  }

  return adjacency;
}

/**
 * Build adjacency map for string-keyed experience graph.
 */
export function buildStringGraphAdjacency(
  nodes: readonly { id: string }[],
  edges: readonly { from: string; to: string; bidirectional?: boolean }[],
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  // Initialize all nodes
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  // Add edges
  for (const edge of edges) {
    const fromNeighbors = adjacency.get(edge.from);
    if (fromNeighbors && !fromNeighbors.includes(edge.to)) {
      fromNeighbors.push(edge.to);
    }

    if (edge.bidirectional !== false) {
      const toNeighbors = adjacency.get(edge.to);
      if (toNeighbors && !toNeighbors.includes(edge.from)) {
        toNeighbors.push(edge.from);
      }
    }
  }

  return adjacency;
}
