/**
 * Turn State Resource
 *
 * Manages the turn-based game state using an immutable pattern.
 */

import type { Entity } from "../../types";

/**
 * Turn phases.
 */
export type TurnPhase = "waiting" | "acting" | "resolving";

/**
 * Pending action in the queue.
 */
export interface PendingAction {
  readonly entity: Entity;
  readonly type: string;
  readonly data: unknown;
  readonly priority: number;
}

/**
 * Immutable turn state.
 */
export interface TurnState {
  readonly currentTick: number;
  readonly activeEntity: Entity | null;
  readonly turnPhase: TurnPhase;
  readonly actionQueue: readonly PendingAction[];
}

/**
 * Turn State Manager - manages game turn state.
 */
export class TurnStateManager {
  private state: TurnState = {
    currentTick: 0,
    activeEntity: null,
    turnPhase: "waiting",
    actionQueue: [],
  };

  /**
   * Gets the current state (read-only).
   */
  getState(): Readonly<TurnState> {
    return this.state;
  }

  /**
   * Gets the current tick.
   */
  getCurrentTick(): number {
    return this.state.currentTick;
  }

  /**
   * Gets the active entity.
   */
  getActiveEntity(): Entity | null {
    return this.state.activeEntity;
  }

  /**
   * Gets the current phase.
   */
  getPhase(): TurnPhase {
    return this.state.turnPhase;
  }

  /**
   * Sets the active entity and transitions to acting phase.
   */
  setActiveEntity(entity: Entity | null): void {
    this.state = {
      ...this.state,
      activeEntity: entity,
      turnPhase: entity !== null ? "acting" : "waiting",
    };
  }

  /**
   * Increments the tick counter.
   */
  incrementTick(): void {
    this.state = {
      ...this.state,
      currentTick: this.state.currentTick + 1,
    };
  }

  /**
   * Sets the turn phase.
   */
  setPhase(phase: TurnPhase): void {
    this.state = {
      ...this.state,
      turnPhase: phase,
    };
  }

  /**
   * Queues an action, maintaining priority order.
   */
  queueAction(action: PendingAction): void {
    const newQueue = [...this.state.actionQueue, action].sort(
      (a, b) => b.priority - a.priority,
    );
    this.state = {
      ...this.state,
      actionQueue: newQueue,
    };
  }

  /**
   * Clears and returns the action queue.
   */
  clearActionQueue(): readonly PendingAction[] {
    const queue = this.state.actionQueue;
    this.state = {
      ...this.state,
      actionQueue: [],
    };
    return queue;
  }

  /**
   * Resets the turn state.
   */
  reset(): void {
    this.state = {
      currentTick: 0,
      activeEntity: null,
      turnPhase: "waiting",
      actionQueue: [],
    };
  }
}
