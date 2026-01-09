/**
 * Event System
 *
 * Type-safe event queue for communication between systems.
 * Supports typed events with discriminated unions.
 */

import type { Entity } from "../types";

/**
 * Base event with timestamp.
 */
interface BaseEvent {
  readonly timestamp: number;
}

/**
 * Game event types - discriminated union for type safety.
 * Add new event types here as needed.
 */
export type GameEvent =
  // Entity lifecycle
  | {
      readonly type: "entity.spawned";
      readonly entity: Entity;
      readonly templateId?: string;
    }
  | { readonly type: "entity.despawned"; readonly entity: Entity }
  | {
      readonly type: "entity.died";
      readonly entity: Entity;
      readonly killer?: Entity;
    }
  | {
      readonly type: "entity.moved";
      readonly entity: Entity;
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
    }
  // Component changes
  | {
      readonly type: "component.added";
      readonly entity: Entity;
      readonly componentName: string;
    }
  | {
      readonly type: "component.removed";
      readonly entity: Entity;
      readonly componentName: string;
    }
  // Player events
  | {
      readonly type: "player.moved";
      readonly entity: Entity;
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
    }
  | {
      readonly type: "player.attacked";
      readonly entity: Entity;
      readonly target: Entity;
    }
  // Combat events
  | {
      readonly type: "combat.damage";
      readonly attacker: Entity;
      readonly target: Entity;
      readonly damage: number;
      readonly actualDamage: number;
      readonly targetDied: boolean;
      readonly isCritical?: boolean;
    }
  | {
      readonly type: "combat.miss";
      readonly attacker: Entity;
      readonly target: Entity;
    }
  | {
      readonly type: "combat.death";
      readonly entity: Entity;
      readonly killer?: Entity;
    }
  // Item events
  | {
      readonly type: "item.picked_up";
      readonly picker: Entity;
      readonly item: Entity;
      readonly itemType: string;
    }
  | {
      readonly type: "item.dropped";
      readonly dropper: Entity;
      readonly item: Entity;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: "item.used";
      readonly user: Entity;
      readonly item: Entity;
      readonly effect: string;
    }
  | {
      readonly type: "item.equipped";
      readonly entity: Entity;
      readonly item: Entity;
      readonly slot: string;
    }
  | {
      readonly type: "item.unequipped";
      readonly entity: Entity;
      readonly item: Entity;
      readonly slot: string;
    }
  // Environment events
  | {
      readonly type: "door.opened";
      readonly entity: Entity;
      readonly door: Entity;
    }
  | {
      readonly type: "door.closed";
      readonly entity: Entity;
      readonly door: Entity;
    }
  | {
      readonly type: "terrain.changed";
      readonly x: number;
      readonly y: number;
      readonly oldType: number;
      readonly newType: number;
    }
  // Turn events
  | {
      readonly type: "turn.started";
      readonly entity: Entity;
      readonly tick: number;
    }
  | {
      readonly type: "turn.ended";
      readonly entity: Entity;
      readonly tick: number;
    }
  | {
      readonly type: "turn.action";
      readonly entity: Entity;
      readonly action: TurnAction;
      readonly tick: number;
    }
  // Level events
  | {
      readonly type: "level.changed";
      readonly level: number;
      readonly previousLevel: number;
    }
  | {
      readonly type: "level.generated";
      readonly level: number;
      readonly seed: string;
    }
  // FOV events
  | {
      readonly type: "fov.updated";
      readonly entity: Entity;
      readonly visibleCount: number;
    }
  // Status effects
  | {
      readonly type: "status.applied";
      readonly entity: Entity;
      readonly status: string;
      readonly duration: number;
    }
  | {
      readonly type: "status.expired";
      readonly entity: Entity;
      readonly status: string;
    };

/**
 * Turn action types for turn.action events.
 */
export type TurnAction =
  | { readonly type: "move"; readonly data?: { dx: number; dy: number } }
  | { readonly type: "attack"; readonly data?: { target: Entity } }
  | { readonly type: "wait" }
  | { readonly type: "use_item"; readonly data?: { item: Entity } }
  | { readonly type: "interact"; readonly data?: { target: Entity } };

/**
 * Event with timestamp.
 */
export type TimestampedEvent = GameEvent & BaseEvent;

/**
 * Extract event data type from event type string.
 */
export type EventData<T extends GameEvent["type"]> = Extract<
  GameEvent,
  { type: T }
>;

/**
 * Event handler function type.
 */
export type EventHandler<T extends GameEvent["type"]> = (
  event: EventData<T> & BaseEvent,
) => void;

/**
 * Internal handler type for the handlers map.
 */
type InternalHandler = (event: TimestampedEvent) => void;

/**
 * Creates a timestamped event.
 */
function createTimestampedEvent<T extends GameEvent>(
  event: T,
): TimestampedEvent {
  const timestamped = {
    ...event,
    timestamp: Date.now(),
  };
  return timestamped as TimestampedEvent;
}

/**
 * Type-safe Event Queue.
 */
export class EventQueue {
  private queue: TimestampedEvent[] = [];
  private handlers = new Map<GameEvent["type"] | "*", Set<InternalHandler>>();
  private processing = false;

  /**
   * Emits a typed event.
   *
   * @example
   * events.emit( { type: "combat.damage", attacker, target, damage: 10 } );
   */
  emit<T extends GameEvent>(event: T): void {
    this.queue.push(createTimestampedEvent(event));
  }

  /**
   * Subscribes to a specific event type with full typing.
   *
   * @example
   * events.on( "combat.damage", ( e ) => {
   *   console.log( `${e.attacker} dealt ${e.damage} to ${e.target}` );
   * } );
   */
  on<T extends GameEvent["type"]>(type: T, handler: EventHandler<T>): void {
    const internalHandler: InternalHandler = (event) => {
      if (event.type === type) {
        handler(event as EventData<T> & BaseEvent);
      }
    };
    // Store reference for unsubscribe
    (internalHandler as { __original?: EventHandler<T> }).__original = handler;

    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.add(internalHandler);
    } else {
      this.handlers.set(type, new Set([internalHandler]));
    }
  }

  /**
   * Unsubscribes from an event type.
   */
  off<T extends GameEvent["type"]>(type: T, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(type);
    if (!handlers) return;

    for (const h of handlers) {
      if ((h as { __original?: EventHandler<T> }).__original === handler) {
        handlers.delete(h);
        break;
      }
    }
  }

  /**
   * Subscribes to all events (for logging, debugging, etc.).
   */
  onAny(handler: (event: TimestampedEvent) => void): void {
    const handlers = this.handlers.get("*");
    if (handlers) {
      handlers.add(handler);
    } else {
      this.handlers.set("*", new Set([handler]));
    }
  }

  /**
   * Unsubscribes from all events handler.
   */
  offAny(handler: (event: TimestampedEvent) => void): void {
    const handlers = this.handlers.get("*");
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Processes all pending events.
   */
  process(): void {
    if (this.processing) {
      console.warn("[EventQueue] Recursive process() call detected");
      return;
    }

    this.processing = true;
    const events = [...this.queue];
    this.queue.length = 0;

    for (const event of events) {
      // Type-specific handlers
      const typeHandlers = this.handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          try {
            handler(event);
          } catch (error) {
            console.error(
              `[EventQueue] Error in handler for "${event.type}":`,
              error,
            );
          }
        }
      }

      // Global handlers
      const globalHandlers = this.handlers.get("*");
      if (globalHandlers) {
        for (const handler of globalHandlers) {
          try {
            handler(event);
          } catch (error) {
            console.error(`[EventQueue] Error in global handler:`, error);
          }
        }
      }
    }

    this.processing = false;
  }

  /**
   * Returns the number of pending events.
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Clears all pending events without processing.
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Removes all handlers.
   */
  removeAllHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Returns all pending events (for inspection/debugging).
   */
  getPendingEvents(): readonly TimestampedEvent[] {
    return this.queue;
  }
}
