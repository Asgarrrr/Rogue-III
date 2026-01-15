/**
 * Graph Topology Utilities
 *
 * Validates and analyzes non-linear dungeon layouts.
 * Ensures dungeons have branches, multiple paths, and hub rooms.
 */

import type { ExperienceGraph, ExperienceEdge, ExperienceNode } from "./types";
import type { TopologyConfig } from "./density-profiles";

// =============================================================================
// NON-LINEARITY VALIDATION
// =============================================================================

/**
 * Validate that a graph has non-linear topology.
 * Returns false if the graph is purely linear (no branches).
 *
 * A non-linear graph must have:
 * - At least one hub node (3+ connections), OR
 * - At least 2 independent paths from start to end
 */
export function validateNonLinearity(graph: ExperienceGraph): boolean {
  const hubNodes = findHubNodes(graph);
  if (hubNodes.length > 0) {
    return true;
  }

  const pathCount = countPaths(graph, graph.entryId, graph.exitIds[0] ?? "");
  return pathCount >= 2;
}

/**
 * Count the number of independent paths from start to end.
 * Uses depth-first search to find all paths.
 */
export function countPaths(
  graph: ExperienceGraph,
  start: string,
  end: string,
  visited: Set<string> = new Set(),
): number {
  if (start === end) {
    return 1;
  }

  const node = graph.nodes.find((n) => n.id === start);
  if (!node) {
    return 0;
  }

  visited.add(start);

  // Find edges from this node
  const outgoingEdges = graph.edges.filter(
    (e) => e.from === start || (e.bidirectional && e.to === start),
  );

  let totalPaths = 0;
  for (const edge of outgoingEdges) {
    const nextId = edge.from === start ? edge.to : edge.from;
    if (!visited.has(nextId)) {
      totalPaths += countPaths(graph, nextId, end, new Set(visited));
    }
  }

  return totalPaths;
}

/**
 * Find all hub nodes in the graph (nodes with 3+ connections).
 */
export function findHubNodes(graph: ExperienceGraph): string[] {
  const connectionCounts = new Map<string, number>();

  // Count connections per node
  for (const edge of graph.edges) {
    connectionCounts.set(edge.from, (connectionCounts.get(edge.from) ?? 0) + 1);
    connectionCounts.set(edge.to, (connectionCounts.get(edge.to) ?? 0) + 1);
  }

  const hubs: string[] = [];
  for (const [id, count] of connectionCounts) {
    if (count >= 3) {
      hubs.push(id);
    }
  }

  return hubs;
}

// =============================================================================
// TOPOLOGY VALIDATION
// =============================================================================

/**
 * Validate that a topology configuration is valid.
 */
export function validateTopologyConfig(config: TopologyConfig): boolean {
  if (config.minBranches < 0 || config.maxBranches < config.minBranches) {
    return false;
  }

  if (config.hubCount < 0) {
    return false;
  }

  if (config.optionalBranchRatio < 0 || config.optionalBranchRatio > 1) {
    return false;
  }

  return true;
}

/**
 * Verify that a graph meets the specified topology requirements.
 */
export function verifyTopology(
  graph: ExperienceGraph,
  config: TopologyConfig,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!validateTopologyConfig(config)) {
    errors.push("Invalid topology configuration");
    return { valid: false, errors };
  }

  // Check non-linearity
  if (!validateNonLinearity(graph)) {
    errors.push("Graph is linear, expected non-linear topology");
  }

  // Check path count
  const mainExit = graph.exitIds[0] ?? "";
  const pathCount = countPaths(graph, graph.entryId, mainExit);
  if (pathCount < config.minBranches) {
    errors.push(
      `Expected at least ${config.minBranches} paths, found ${pathCount}`,
    );
  }

  if (pathCount > config.maxBranches) {
    errors.push(
      `Expected at most ${config.maxBranches} paths, found ${pathCount}`,
    );
  }

  // Check hub count
  const hubNodes = findHubNodes(graph);
  if (hubNodes.length < config.hubCount) {
    errors.push(
      `Expected at least ${config.hubCount} hub nodes, found ${hubNodes.length}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// GRAPH METRICS
// =============================================================================

/**
 * Graph metrics for analysis.
 */
export interface GraphMetrics {
  totalNodes: number;
  totalEdges: number;
  hubNodes: number;
  pathCount: number;
  avgConnectionsPerNode: number;
  maxDepth: number;
  isNonLinear: boolean;
}

/**
 * Calculate graph metrics for analysis.
 */
export function calculateGraphMetrics(graph: ExperienceGraph): GraphMetrics {
  const hubNodes = findHubNodes(graph);
  const mainExit = graph.exitIds[0] ?? "";
  const pathCount = countPaths(graph, graph.entryId, mainExit);

  // Calculate connection counts
  const connectionCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    connectionCounts.set(edge.from, (connectionCounts.get(edge.from) ?? 0) + 1);
    connectionCounts.set(edge.to, (connectionCounts.get(edge.to) ?? 0) + 1);
  }

  const totalConnections = Array.from(connectionCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  const avgConnectionsPerNode =
    graph.nodes.length > 0 ? totalConnections / graph.nodes.length : 0;

  const maxDepth = graph.nodes.reduce(
    (max, node) => Math.max(max, node.maxDepth),
    0,
  );

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    hubNodes: hubNodes.length,
    pathCount,
    avgConnectionsPerNode,
    maxDepth,
    isNonLinear: validateNonLinearity(graph),
  };
}

// =============================================================================
// REACHABILITY ANALYSIS
// =============================================================================

/**
 * Find all nodes reachable from a starting node.
 */
export function findReachableNodes(
  graph: ExperienceGraph,
  startId: string,
): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];

  // Build adjacency from edges
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    if (edge.bidirectional) {
      adjacency.get(edge.to)?.push(edge.from);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (reachable.has(currentId)) {
      continue;
    }

    reachable.add(currentId);
    const neighbors = adjacency.get(currentId) ?? [];

    for (const nextId of neighbors) {
      if (!reachable.has(nextId)) {
        queue.push(nextId);
      }
    }
  }

  return reachable;
}

/**
 * Detect cycles in the graph.
 */
export function hasCycles(graph: ExperienceGraph): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  // Build adjacency from edges
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];

    for (const nextId of neighbors) {
      if (!visited.has(nextId)) {
        if (dfs(nextId)) return true;
      } else if (recStack.has(nextId)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}

/**
 * Get the critical path (shortest path from entrance to exit).
 */
export function getCriticalPath(graph: ExperienceGraph): string[] {
  const mainExit = graph.exitIds[0];
  if (!mainExit) return [graph.entryId];

  // BFS to find shortest path
  const queue: { id: string; path: string[] }[] = [
    { id: graph.entryId, path: [graph.entryId] },
  ];
  const visited = new Set<string>();

  // Build adjacency
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    if (edge.bidirectional) {
      adjacency.get(edge.to)?.push(edge.from);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === mainExit) {
      return current.path;
    }

    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const neighbors = adjacency.get(current.id) ?? [];
    for (const nextId of neighbors) {
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, path: [...current.path, nextId] });
      }
    }
  }

  return [graph.entryId];
}
