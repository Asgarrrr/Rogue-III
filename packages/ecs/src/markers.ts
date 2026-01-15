/**
 * Marker components (tags) for categorizing entities.
 * These are zero-storage components used for querying groups of entities.
 *
 * @example
 * // Bundle with marker
 * const SpriteBundle = bundle(Renderable, Position, Sprite);
 *
 * // Query by marker
 * world.query(Renderable).run(view => {
 *   // Gets all entities with Renderable marker
 * });
 */

import { component } from "./core/component";

// =============================================================================
// Rendering Markers
// =============================================================================

/** Entity can be rendered (has visual representation) */
@component
export class Renderable {}

/** Entity is hidden from rendering */
@component
export class Hidden {}

/** Entity is outside camera view (culled) */
@component
export class Culled {}

// =============================================================================
// Physics Markers
// =============================================================================

/** Entity participates in collision detection */
@component
export class Collidable {}

/** Entity blocks movement */
@component
export class Blocking {}

/** Entity is a trigger (detects overlap but no physics response) */
@component
export class Trigger {}

// =============================================================================
// Game Logic Markers
// =============================================================================

/** Entity is controlled by player */
@component
export class Player {}

/** Entity is controlled by AI */
@component
export class Enemy {}

/** Entity is a neutral/friendly NPC */
@component
export class NPC {}

/** Entity can be picked up */
@component
export class Pickable {}

/** Entity can be interacted with */
@component
export class Interactable {}

// =============================================================================
// Lifecycle Markers
// =============================================================================

/** Entity is dead and should be cleaned up */
@component
export class Dead {}

/** Entity was just spawned (for initialization systems) */
@component
export class JustSpawned {}

/** Entity should be despawned at end of tick */
@component
export class PendingDespawn {}

// =============================================================================
// Serialization Markers
// =============================================================================

/** Entity should be saved/loaded */
@component
export class Serializable {}

/** Entity should be synced over network */
@component
export class NetworkSynced {}

/** Entity is part of the map (static) */
@component
export class MapEntity {}
