import type { Entity } from "../core/types";

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

/**
 * Recorded event with timestamp for replay/debug.
 */
export interface RecordedEvent {
  readonly event: GameEvent;
  readonly timestamp: number;
  readonly tick: number;
}

/**
 * Options for flush operation.
 */
export interface FlushOptions {
  /** If true, recursively flush until no more events. Default: false */
  readonly recursive?: boolean;
  /** Maximum recursion depth when recursive=true. Default: 10 */
  readonly maxDepth?: number;
}

// =============================================================================
// Typed Event Channels
// =============================================================================

const EVENT_CHANNEL_MARKER = Symbol("EventChannel");

/**
 * A typed event channel for type-safe event emission and subscription.
 */
export interface EventChannel<T> {
  readonly [EVENT_CHANNEL_MARKER]: true;
  readonly name: string;
  readonly _phantom?: T;
}

/**
 * Define a typed event channel.
 *
 * @example
 * interface DamageEvent { target: Entity; amount: number; }
 * const DamageChannel = defineEventChannel<DamageEvent>("damage");
 *
 * events.emitChannel(DamageChannel, { target, amount: 10 });
 * events.onChannel(DamageChannel, (e) => console.log(e.amount));
 */
export function defineEventChannel<T>(name: string): EventChannel<T> {
  return {
    [EVENT_CHANNEL_MARKER]: true,
    name,
  };
}

/**
 * Event queue with deferred processing semantics.
 *
 * **IMPORTANT: Deferred Event Emission**
 *
 * Events emitted during `flush()` are NOT processed immediately - they are
 * queued for the NEXT flush. This is by design to prevent unbounded recursion
 * and ensure deterministic event ordering.
 *
 * @example
 * // In a combat.damage handler:
 * events.on("combat.damage", (event) => {
 *   if (targetHealth <= 0) {
 *     // This death event will NOT be processed in this flush!
 *     // It will be queued and processed in the next flush() call.
 *     events.emit({ type: "combat.death", entity: event.target });
 *   }
 * });
 *
 * // To ensure chained events are processed, call flush() multiple times:
 * events.flush(); // Process damage events
 * events.flush(); // Process death events from damage handlers
 *
 * // Or use a loop until queue is empty:
 * while (events.hasPendingEvents()) {
 *   events.flush();
 * }
 */
export class EventQueue {
  private readonly queues: Map<string, GameEvent[]> = new Map();
  private readonly handlers: Map<string, HandlerEntry[]> = new Map();
  private readonly wildcardHandlers: WildcardHandlerEntry[] = [];
  private processingDepth = 0;
  private sortedTypesCache: string[] = [];
  private typesDirty = true;

  // Recording state
  private recording = false;
  private recordedEvents: RecordedEvent[] = [];
  private currentTick = 0;

  // Typed channel handlers (separate from string-based)
  private readonly channelQueues: Map<string, unknown[]> = new Map();
  private readonly channelHandlers: Map<string, HandlerEntry[]> = new Map();

  /**
   * Queue an event for processing.
   *
   * **Note:** If called during `flush()`, the event will be queued for the
   * NEXT flush, not processed immediately. See class documentation for details.
   */
  emit<T extends GameEvent>(event: T): void {
    // Record if enabled
    if (this.recording) {
      this.recordedEvents.push({
        event,
        timestamp: Date.now(),
        tick: this.currentTick,
      });
    }

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

  /**
   * Check if there are any pending events in the queue.
   * Includes both string-based events and typed channels.
   *
   * @example
   * while (events.hasPendingEvents()) {
   *   events.flush();
   * }
   */
  hasPendingEvents(): boolean {
    // Check string-based queues
    for (const queue of this.queues.values()) {
      if (queue.length > 0) return true;
    }
    // Check typed channel queues
    for (const queue of this.channelQueues.values()) {
      if (queue.length > 0) return true;
    }
    return false;
  }

  /**
   * Process all queued events, calling their registered handlers.
   *
   * **IMPORTANT:** Events emitted by handlers during flush are queued for the
   * NEXT flush, not processed immediately. Use `hasPendingEvents()` in a loop
   * or `flush({ recursive: true })` to process all chained events.
   *
   * Events are processed in deterministic order:
   * 1. Event types are sorted alphabetically
   * 2. Events within each type are processed FIFO
   * 3. Handlers are called in priority order (lower priority first)
   *
   * @param options - Flush options (recursive, maxDepth)
   * @throws {Error} If called while already flushing (prevents re-entrancy)
   */
  flush(options?: FlushOptions): void {
    const recursive = options?.recursive ?? false;
    const maxDepth = options?.maxDepth ?? 10;

    if (recursive) {
      let depth = 0;
      while (this.hasPendingEvents() && depth < maxDepth) {
        this.flushOnce();
        depth++;
      }
      if (depth >= maxDepth && this.hasPendingEvents()) {
        console.warn(
          `[EventQueue] Recursive flush hit maxDepth (${maxDepth}). ` +
            `${this.getQueuedCount()} events still pending.`,
        );
      }
    } else {
      this.flushOnce();
    }
  }

  /**
   * Internal: flush a single pass of events.
   */
  private flushOnce(): void {
    if (this.processingDepth > 0) {
      throw new Error(
        "Cannot flush EventQueue while already processing events",
      );
    }

    this.processingDepth++;
    try {
      // Flush typed channels first
      this.flushChannels();

      // Then flush string-based events
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

  /**
   * Internal: flush typed channel events.
   */
  private flushChannels(): void {
    for (const [name, queue] of this.channelQueues) {
      if (queue.length === 0) continue;

      const handlerEntries = this.channelHandlers.get(name) ?? [];
      const events = queue.slice();
      queue.length = 0;

      for (const event of events) {
        for (const entry of handlerEntries) {
          (entry.handler as (e: unknown) => void)(event);
        }
      }
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

  // ===========================================================================
  // Recording API
  // ===========================================================================

  /**
   * Start recording all emitted events.
   * Useful for debugging and replay.
   */
  startRecording(): void {
    this.recording = true;
    this.recordedEvents = [];
  }

  /**
   * Stop recording events.
   */
  stopRecording(): void {
    this.recording = false;
  }

  /**
   * Check if recording is active.
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get all recorded events since recording started.
   */
  getRecordedEvents(): readonly RecordedEvent[] {
    return this.recordedEvents;
  }

  /**
   * Clear recorded events.
   */
  clearRecording(): void {
    this.recordedEvents = [];
  }

  /**
   * Set the current tick for recording timestamps.
   * Should be called at the start of each game tick.
   */
  setCurrentTick(tick: number): void {
    this.currentTick = tick;
  }

  /**
   * Replay recorded events by emitting them in order.
   * Useful for debugging or testing.
   *
   * @param events - Events to replay (from getRecordedEvents)
   */
  replay(events: readonly RecordedEvent[]): void {
    for (const recorded of events) {
      this.emit(recorded.event);
    }
  }

  // ===========================================================================
  // Typed Channel API
  // ===========================================================================

  /**
   * Emit an event on a typed channel.
   * Type-safe alternative to string-based events.
   *
   * @example
   * const DamageChannel = defineEventChannel<{ target: Entity; amount: number }>("damage");
   * events.emitChannel(DamageChannel, { target: entity, amount: 10 });
   */
  emitChannel<T>(channel: EventChannel<T>, event: T): void {
    const queue = this.channelQueues.get(channel.name);
    if (queue) {
      queue.push(event);
    } else {
      this.channelQueues.set(channel.name, [event]);
    }
  }

  /**
   * Subscribe to a typed channel.
   * Type-safe alternative to string-based events.
   *
   * @example
   * const DamageChannel = defineEventChannel<{ target: Entity; amount: number }>("damage");
   * events.onChannel(DamageChannel, (e) => {
   *   console.log(e.target, e.amount); // Type-safe access
   * });
   */
  onChannel<T>(
    channel: EventChannel<T>,
    handler: (event: T) => void,
    priority: number = 0,
  ): () => void {
    const entry: HandlerEntry = {
      handler: handler as EventHandler,
      priority,
    };

    const handlers = this.channelHandlers.get(channel.name);
    if (handlers) {
      handlers.push(entry);
      handlers.sort((a, b) => a.priority - b.priority);
    } else {
      this.channelHandlers.set(channel.name, [entry]);
    }

    return () => this.offChannel(channel, handler);
  }

  /**
   * Unsubscribe from a typed channel.
   */
  offChannel<T>(channel: EventChannel<T>, handler: (event: T) => void): void {
    const handlers = this.channelHandlers.get(channel.name);
    if (handlers) {
      const index = handlers.findIndex((e) => e.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Check if there are pending events in a typed channel.
   */
  hasChannelEvents<T>(channel: EventChannel<T>): boolean {
    const queue = this.channelQueues.get(channel.name);
    return queue !== undefined && queue.length > 0;
  }
}
