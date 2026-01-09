import type { Entity } from "./types";

export type GameEvent =
  | {
      readonly type: "entity.spawned";
      readonly entity: Entity;
      readonly templateId?: string;
    }
  | { readonly type: "entity.despawned"; readonly entity: Entity }
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
      readonly type: "combat.damage";
      readonly attacker: Entity;
      readonly target: Entity;
      readonly damage: number;
      readonly isCritical?: boolean;
    }
  | {
      readonly type: "combat.death";
      readonly entity: Entity;
      readonly killer?: Entity;
    }
  | {
      readonly type: "combat.heal";
      readonly entity: Entity;
      readonly amount: number;
      readonly source?: Entity;
    }
  | {
      readonly type: "movement.moved";
      readonly entity: Entity;
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
    }
  | {
      readonly type: "movement.blocked";
      readonly entity: Entity;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: "item.pickup";
      readonly entity: Entity;
      readonly item: Entity;
      readonly itemName: string;
    }
  | {
      readonly type: "item.drop";
      readonly entity: Entity;
      readonly item: Entity;
      readonly itemName: string;
    }
  | {
      readonly type: "item.use";
      readonly entity: Entity;
      readonly item: Entity;
      readonly itemName: string;
    }
  | {
      readonly type: "item.equip";
      readonly entity: Entity;
      readonly item: Entity;
      readonly slot: string;
    }
  | {
      readonly type: "item.unequip";
      readonly entity: Entity;
      readonly slot: string;
    }
  | {
      readonly type: "level.entered";
      readonly level: number;
      readonly direction: "down" | "up";
    }
  | {
      readonly type: "fov.updated";
      readonly entity: Entity;
      readonly visibleCount: number;
    }
  | {
      readonly type: "status.applied";
      readonly entity: Entity;
      readonly status: string;
      readonly duration?: number;
    }
  | {
      readonly type: "status.removed";
      readonly entity: Entity;
      readonly status: string;
    }
  | {
      readonly type: "interaction.door";
      readonly entity: Entity;
      readonly door: Entity;
      readonly opened: boolean;
    }
  | {
      readonly type: "interaction.trap";
      readonly entity: Entity;
      readonly trap: Entity;
      readonly damage?: number;
    }
  | {
      readonly type: "interaction.container";
      readonly entity: Entity;
      readonly container: Entity;
    }
  | {
      readonly type: "message";
      readonly text: string;
      readonly color?: string;
    };

export type GameEventType = GameEvent["type"];

export type EventHandler<T extends GameEvent = GameEvent> = (event: T) => void;

type ExtractEventByType<T extends GameEventType> = Extract<
  GameEvent,
  { type: T }
>;

/**
 * Handler entry with priority.
 * Lower priority values execute first.
 */
interface HandlerEntry {
  handler: EventHandler;
  priority: number;
}

/**
 * Wildcard handler entry with priority.
 */
interface WildcardHandlerEntry {
  handler: EventHandler;
  priority: number;
}

export class EventQueue {
  private readonly queues: Map<string, GameEvent[]> = new Map();
  private readonly handlers: Map<string, HandlerEntry[]> = new Map();
  private readonly wildcardHandlers: WildcardHandlerEntry[] = [];
  private processingDepth = 0;
  private sortedTypesCache: string[] = [];
  private typesDirty = true;

  emit<T extends GameEvent>(event: T): void {
    const queue = this.queues.get(event.type);
    if (queue) {
      queue.push(event);
    } else {
      this.queues.set(event.type, [event]);
      this.typesDirty = true;
    }
  }

  /**
   * Subscribe to a specific event type.
   *
   * @param type - The event type to subscribe to
   * @param handler - The handler function to call when the event is emitted
   * @param priority - Lower values execute first (default: 0)
   * @returns Unsubscribe function
   */
  on<T extends GameEventType>(
    type: T,
    handler: EventHandler<ExtractEventByType<T>>,
    priority: number = 0,
  ): () => void {
    const entry: HandlerEntry = {
      handler: handler as EventHandler,
      priority,
    };

    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.push(entry);
      // Keep sorted by priority (stable sort - same priority maintains insertion order)
      handlers.sort((a, b) => a.priority - b.priority);
    } else {
      this.handlers.set(type, [entry]);
    }

    return () => this.off(type, handler as EventHandler);
  }

  /**
   * @deprecated Use `on()` instead. Will be removed in next major version.
   */
  subscribe<T extends GameEventType>(
    type: T,
    handler: EventHandler<ExtractEventByType<T>>,
    priority: number = 0,
  ): () => void {
    return this.on(type, handler, priority);
  }

  off(type: string, handler: EventHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.findIndex((entry) => entry.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Subscribe to all events (wildcard handler).
   *
   * @param handler - The handler function to call for any event
   * @param priority - Lower values execute first (default: 0)
   * @returns Unsubscribe function
   */
  onAny(handler: EventHandler, priority: number = 0): () => void {
    const entry: WildcardHandlerEntry = { handler, priority };
    this.wildcardHandlers.push(entry);
    // Keep sorted by priority
    this.wildcardHandlers.sort((a, b) => a.priority - b.priority);

    return () => {
      const index = this.wildcardHandlers.findIndex(
        (e) => e.handler === handler,
      );
      if (index !== -1) {
        this.wildcardHandlers.splice(index, 1);
      }
    };
  }

  flush(): void {
    if (this.processingDepth > 0) {
      throw new Error(
        "Cannot flush EventQueue while already processing events",
      );
    }

    this.processingDepth++;
    try {
      if (this.typesDirty) {
        this.sortedTypesCache = [...this.queues.keys()].sort();
        this.typesDirty = false;
      }

      for (const type of this.sortedTypesCache) {
        const queue = this.queues.get(type);
        if (!queue || queue.length === 0) continue;

        const handlerEntries = this.handlers.get(type) ?? [];
        const events = queue.slice();
        queue.length = 0;

        for (const event of events) {
          // Execute type-specific handlers (already sorted by priority)
          for (const entry of handlerEntries) {
            entry.handler(event);
          }
          // Execute wildcard handlers (already sorted by priority)
          for (const entry of this.wildcardHandlers) {
            entry.handler(event);
          }
        }
      }
    } finally {
      this.processingDepth--;
    }
  }

  drain<T extends GameEventType>(type: T): ExtractEventByType<T>[] {
    const queue = this.queues.get(type);
    if (!queue) return [];

    const events = queue.slice() as ExtractEventByType<T>[];
    queue.length = 0;
    return events;
  }

  peek<T extends GameEventType>(type: T): ExtractEventByType<T>[] {
    const queue = this.queues.get(type);
    return (queue?.slice() ?? []) as ExtractEventByType<T>[];
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  clearAll(): void {
    this.queues.clear();
    this.handlers.clear();
    this.wildcardHandlers.length = 0;
    this.sortedTypesCache = [];
    this.typesDirty = true;
  }

  getQueuedCount(type?: string): number {
    if (type) {
      return this.queues.get(type)?.length ?? 0;
    }
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  hasQueued(type: string): boolean {
    const queue = this.queues.get(type);
    return queue !== undefined && queue.length > 0;
  }

  getRegisteredTypes(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
