/**
 * Spatial Mapper
 *
 * Maps an experience graph to physical rooms in the dungeon.
 */

import {
  buildStringGraphAdjacency,
  calculateStringGraphDistances,
} from "../../core/graph";
import type { Room } from "../../pipeline/types";
import type {
  ExperienceEdge,
  ExperienceGraph,
  ExperienceNode,
  ExperienceNodeType,
  NodeRoomMapping,
  SpatialConnectionRequirement,
  SpatialMappingResult,
  SpatialRoomRequirement,
} from "./types";
import { SpatialMappingError } from "./types";

/**
 * Critical node types that MUST be mapped for a valid dungeon.
 */
const CRITICAL_NODE_TYPES: readonly ExperienceNodeType[] = [
  "entrance",
  "exit",
  "boss",
];

// =============================================================================
// TYPE MAPPING
// =============================================================================

/**
 * Map experience node type to room type.
 */
function nodeTypeToRoomType(nodeType: ExperienceNodeType): Room["type"] {
  switch (nodeType) {
    case "entrance":
      return "entrance";
    case "exit":
      return "exit";
    case "boss":
    case "miniboss":
      return "boss";
    case "treasure":
      return "treasure";
    case "secret":
      return "secret";
    case "combat":
    case "puzzle":
    case "rest":
    case "story":
    case "shop":
    case "shortcut":
    default:
      return "normal";
  }
}

/**
 * Get preferred size for a node type.
 */
function getPreferredSize(
  nodeType: ExperienceNodeType,
): "small" | "medium" | "large" {
  switch (nodeType) {
    case "boss":
      return "large";
    case "miniboss":
    case "treasure":
    case "shop":
      return "medium";
    case "entrance":
    case "exit":
    case "shortcut":
    case "secret":
      return "small";
    default:
      return "medium";
  }
}

// =============================================================================
// GRAPH ANALYSIS (using shared utilities from core/graph)
// =============================================================================

/**
 * Calculate distances from entry node using BFS.
 * Uses shared utility from core/graph.
 */
function calculateGraphDistances(
  graph: ExperienceGraph,
): Map<string, number> {
  const adjacency = buildStringGraphAdjacency(graph.nodes, graph.edges);
  const { distances } = calculateStringGraphDistances(graph.entryId, adjacency);
  return distances;
}

// =============================================================================
// MAPPING STRATEGIES
// =============================================================================

/**
 * Create room requirements from experience graph.
 */
export function createRoomRequirements(
  graph: ExperienceGraph,
): readonly SpatialRoomRequirement[] {
  const distances = calculateGraphDistances(graph);
  const maxDist = Math.max(0, ...distances.values());

  const requirements: SpatialRoomRequirement[] = [];

  for (const node of graph.nodes) {
    const nodeDist = distances.get(node.id) ?? 0;
    const normalizedDist = maxDist > 0 ? nodeDist / maxDist : 0;

    requirements.push({
      forNodeId: node.id,
      roomType: nodeTypeToRoomType(node.type),
      sizeCategory: getPreferredSize(node.type),
      minDistance: Math.floor(normalizedDist * 10),
      maxDistance: Math.ceil(normalizedDist * 10) + 2,
    });
  }

  return requirements;
}

/**
 * Create connection requirements from experience graph.
 */
export function createConnectionRequirements(
  graph: ExperienceGraph,
): readonly SpatialConnectionRequirement[] {
  const requirements: SpatialConnectionRequirement[] = [];

  for (const edge of graph.edges) {
    requirements.push({
      forEdge: edge,
      needsLock: edge.type === "locked",
      lockType: edge.requires,
    });
  }

  return requirements;
}

// =============================================================================
// ROOM ASSIGNMENT
// =============================================================================

/**
 * Score how well a room matches a node requirement.
 */
function scoreRoomMatch(
  room: Room,
  requirement: SpatialRoomRequirement,
  roomDistance: number,
): number {
  let score = 0;

  // Type match (most important)
  if (room.type === requirement.roomType) {
    score += 100;
  } else if (room.type === "normal") {
    // Normal rooms are flexible
    score += 50;
  }

  // Distance match
  if (roomDistance >= requirement.minDistance && roomDistance <= requirement.maxDistance) {
    score += 30;
    // Bonus for being closer to ideal distance
    const idealDist = (requirement.minDistance + requirement.maxDistance) / 2;
    const distDiff = Math.abs(roomDistance - idealDist);
    score += Math.max(0, 10 - distDiff * 2);
  }

  // Size match
  const roomSize = room.width * room.height;
  const sizeCategory =
    roomSize < 80 ? "small" : roomSize < 150 ? "medium" : "large";
  if (sizeCategory === requirement.sizeCategory) {
    score += 20;
  }

  return score;
}

/**
 * Assign experience nodes to existing rooms.
 */
export function assignNodesToRooms(
  graph: ExperienceGraph,
  rooms: readonly Room[],
  roomDistances: ReadonlyMap<number, number>,
): SpatialMappingResult {
  const requirements = createRoomRequirements(graph);
  const connectionReqs = createConnectionRequirements(graph);

  const mappings: NodeRoomMapping[] = [];
  const assignedRooms = new Set<number>();
  const unmappedNodes: string[] = [];

  // Sort requirements by priority (entrance/exit first, then by type importance)
  const sortedReqs = [...requirements].sort((a, b) => {
    const priorityA = getTypePriority(a.roomType);
    const priorityB = getTypePriority(b.roomType);
    return priorityB - priorityA;
  });

  for (const req of sortedReqs) {
    let bestRoom: Room | null = null;
    let bestScore = -1;

    for (const room of rooms) {
      if (assignedRooms.has(room.id)) continue;

      const roomDist = roomDistances.get(room.id) ?? 0;
      const score = scoreRoomMatch(room, req, roomDist);

      if (score > bestScore) {
        bestScore = score;
        bestRoom = room;
      }
    }

    if (bestRoom && bestScore > 0) {
      mappings.push({
        nodeId: req.forNodeId,
        roomId: bestRoom.id,
        primary: true,
      });
      assignedRooms.add(bestRoom.id);
    } else {
      unmappedNodes.push(req.forNodeId);
    }
  }

  // For unmapped nodes, find any available room
  for (const nodeId of [...unmappedNodes]) {
    for (const room of rooms) {
      if (!assignedRooms.has(room.id)) {
        mappings.push({
          nodeId,
          roomId: room.id,
          primary: true,
        });
        assignedRooms.add(room.id);
        unmappedNodes.splice(unmappedNodes.indexOf(nodeId), 1);
        break;
      }
    }
  }

  return {
    mappings,
    requiredRooms: requirements.filter((r) =>
      unmappedNodes.includes(r.forNodeId),
    ),
    requiredConnections: connectionReqs,
    unmappedNodes,
  };
}

/**
 * Get priority for room type (higher = assign first).
 */
function getTypePriority(roomType: Room["type"]): number {
  switch (roomType) {
    case "entrance":
      return 100;
    case "exit":
      return 90;
    case "boss":
      return 80;
    case "treasure":
      return 70;
    case "secret":
      return 60;
    default:
      return 50;
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that the mapping preserves graph connectivity.
 */
export function validateMapping(
  graph: ExperienceGraph,
  result: SpatialMappingResult,
  connections: ReadonlyMap<number, readonly number[]>,
): string[] {
  const warnings: string[] = [];

  // Check all nodes are mapped
  if (result.unmappedNodes.length > 0) {
    warnings.push(`${result.unmappedNodes.length} nodes could not be mapped to rooms`);
  }

  // Build node-to-room lookup
  const nodeToRoom = new Map<string, number>();
  for (const mapping of result.mappings) {
    nodeToRoom.set(mapping.nodeId, mapping.roomId);
  }

  // Check that edges have corresponding room connections
  for (const edge of graph.edges) {
    const fromRoom = nodeToRoom.get(edge.from);
    const toRoom = nodeToRoom.get(edge.to);

    if (fromRoom === undefined || toRoom === undefined) continue;
    if (fromRoom === toRoom) continue; // Same room, no connection needed

    const roomConnections = connections.get(fromRoom) ?? [];
    if (!roomConnections.includes(toRoom)) {
      warnings.push(
        `Edge ${edge.from} -> ${edge.to} requires connection between rooms ${fromRoom} and ${toRoom}`,
      );
    }
  }

  return warnings;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Options for mapGraphToRooms.
 */
export interface MapGraphToRoomsOptions {
  /** Whether to throw on unmapped critical nodes (entrance, exit, boss). Default: true */
  readonly failOnUnmappedCritical?: boolean;
  /** Whether to log warnings. Default: true */
  readonly logWarnings?: boolean;
}

/**
 * Map an experience graph to physical rooms.
 *
 * @throws {SpatialMappingError} If critical nodes (entrance, exit, boss) cannot be mapped
 *         and failOnUnmappedCritical is true (default).
 */
export function mapGraphToRooms(
  graph: ExperienceGraph,
  rooms: readonly Room[],
  roomDistances: ReadonlyMap<number, number>,
  roomConnections: ReadonlyMap<number, readonly number[]>,
  options: MapGraphToRoomsOptions = {},
): SpatialMappingResult {
  const { failOnUnmappedCritical = true, logWarnings = true } = options;

  if (rooms.length === 0) {
    throw new SpatialMappingError("No rooms available for mapping");
  }

  if (graph.nodes.length === 0) {
    throw new SpatialMappingError("Empty experience graph");
  }

  const result = assignNodesToRooms(graph, rooms, roomDistances);

  // Validate critical nodes are mapped
  if (failOnUnmappedCritical && result.unmappedNodes.length > 0) {
    const unmappedCritical = findUnmappedCriticalNodes(graph, result.unmappedNodes);
    if (unmappedCritical.length > 0) {
      throw new SpatialMappingError(
        `Critical nodes could not be mapped to rooms: ${unmappedCritical.map(n => `${n.type}(${n.id})`).join(", ")}. ` +
        `Available rooms: ${rooms.length}, Required nodes: ${graph.nodes.length}. ` +
        `Consider generating more rooms or reducing grammar complexity.`
      );
    }
  }

  const warnings = validateMapping(graph, result, roomConnections);

  if (logWarnings && warnings.length > 0) {
    console.warn("Spatial mapping warnings:", warnings);
  }

  return result;
}

/**
 * Find unmapped nodes that are critical (entrance, exit, boss).
 */
function findUnmappedCriticalNodes(
  graph: ExperienceGraph,
  unmappedNodeIds: readonly string[],
): ExperienceNode[] {
  const unmappedSet = new Set(unmappedNodeIds);
  return graph.nodes.filter(
    node => unmappedSet.has(node.id) && CRITICAL_NODE_TYPES.includes(node.type)
  );
}

/**
 * Get room type assignments from mapping result.
 */
export function getRoomTypeAssignments(
  graph: ExperienceGraph,
  result: SpatialMappingResult,
): Map<number, Room["type"]> {
  const assignments = new Map<number, Room["type"]>();

  for (const mapping of result.mappings) {
    const node = graph.nodes.find((n) => n.id === mapping.nodeId);
    if (node) {
      const roomType = nodeTypeToRoomType(node.type);
      assignments.set(mapping.roomId, roomType);
    }
  }

  return assignments;
}
