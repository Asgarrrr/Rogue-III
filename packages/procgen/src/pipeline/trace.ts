/**
 * Trace collector implementation for debugging and observability.
 */

import type {
  AnyArtifact,
  DecisionConfidence,
  DecisionStats,
  DecisionSystem,
  StructuredDecisionData,
  StructuredDecisionEvent,
  TraceCollector,
  TraceEvent,
  TraceEventType,
} from "./types";

/**
 * Decision system list for iteration.
 */
const DECISION_SYSTEMS: DecisionSystem[] = [
  "layout", "rooms", "connectivity", "spawns",
  "grammar", "constraints", "simulation", "semantic",
];

/**
 * Decision confidence levels for iteration.
 */
const CONFIDENCE_LEVELS: DecisionConfidence[] = ["high", "medium", "low"];

/**
 * Default trace collector implementation
 */
export class DefaultTraceCollector implements TraceCollector {
  readonly enabled: boolean;
  private readonly events: TraceEvent[] = [];
  private readonly structuredDecisions: StructuredDecisionEvent[] = [];
  private readonly startTime: number;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
    this.startTime = performance.now();
  }

  private emit(
    passId: string,
    eventType: TraceEventType,
    data?: unknown,
  ): void {
    if (!this.enabled) return;

    this.events.push({
      timestamp: performance.now() - this.startTime,
      passId,
      eventType,
      data,
    });
  }

  start(passId: string): void {
    this.emit(passId, "start");
  }

  end(passId: string, durationMs: number): void {
    this.emit(passId, "end", { durationMs });
  }

  decision(
    passId: string,
    question: string,
    options: readonly unknown[],
    chosen: unknown,
    reason: string,
  ): void {
    this.emit(passId, "decision", { question, options, chosen, reason });
  }

  structuredDecision(passId: string, data: StructuredDecisionData): void {
    if (!this.enabled) return;

    const event: StructuredDecisionEvent = {
      timestamp: performance.now() - this.startTime,
      passId,
      eventType: "decision",
      data,
    };

    this.events.push(event);
    this.structuredDecisions.push(event);
  }

  warning(passId: string, message: string): void {
    this.emit(passId, "warning", { message });
  }

  artifact(passId: string, artifact: AnyArtifact): void {
    this.emit(passId, "artifact", {
      artifactId: artifact.id,
      artifactType: artifact.type,
    });
  }

  getEvents(): readonly TraceEvent[] {
    return this.events;
  }

  getDecisionsBySystem(system: DecisionSystem): readonly StructuredDecisionEvent[] {
    return this.structuredDecisions.filter(e => e.data.system === system);
  }

  getDecisionStats(): DecisionStats {
    const bySystem: Record<DecisionSystem, number> = {} as Record<DecisionSystem, number>;
    const byConfidence: Record<DecisionConfidence, number> = {} as Record<DecisionConfidence, number>;

    // Initialize counters
    for (const sys of DECISION_SYSTEMS) {
      bySystem[sys] = 0;
    }
    for (const conf of CONFIDENCE_LEVELS) {
      byConfidence[conf] = 0;
    }

    let totalRngConsumed = 0;

    for (const event of this.structuredDecisions) {
      bySystem[event.data.system]++;
      byConfidence[event.data.confidence]++;
      totalRngConsumed += event.data.rngConsumed;
    }

    const totalDecisions = this.structuredDecisions.length;

    return {
      totalDecisions,
      bySystem,
      byConfidence,
      totalRngConsumed,
      avgRngPerDecision: totalDecisions > 0 ? totalRngConsumed / totalDecisions : 0,
    };
  }

  clear(): void {
    this.events.length = 0;
    this.structuredDecisions.length = 0;
  }
}

/**
 * Empty decision stats for no-op collector.
 */
const EMPTY_DECISION_STATS: DecisionStats = {
  totalDecisions: 0,
  bySystem: {
    layout: 0, rooms: 0, connectivity: 0, spawns: 0,
    grammar: 0, constraints: 0, simulation: 0, semantic: 0,
  },
  byConfidence: { high: 0, medium: 0, low: 0 },
  totalRngConsumed: 0,
  avgRngPerDecision: 0,
};

/**
 * No-op trace collector for production
 */
export class NoOpTraceCollector implements TraceCollector {
  readonly enabled = false;

  start(_passId: string): void {}
  end(_passId: string, _durationMs: number): void {}
  decision(
    _passId: string,
    _question: string,
    _options: readonly unknown[],
    _chosen: unknown,
    _reason: string,
  ): void {}
  structuredDecision(_passId: string, _data: StructuredDecisionData): void {}
  warning(_passId: string, _message: string): void {}
  artifact(_passId: string, _artifact: AnyArtifact): void {}
  getEvents(): readonly TraceEvent[] {
    return [];
  }
  getDecisionsBySystem(_system: DecisionSystem): readonly StructuredDecisionEvent[] {
    return [];
  }
  getDecisionStats(): DecisionStats {
    return EMPTY_DECISION_STATS;
  }
  clear(): void {}
}

/**
 * Create a trace collector based on configuration
 */
export function createTraceCollector(enabled: boolean): TraceCollector {
  return enabled ? new DefaultTraceCollector(true) : new NoOpTraceCollector();
}
