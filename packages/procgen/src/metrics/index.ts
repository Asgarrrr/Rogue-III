/**
 * Generation Metrics
 *
 * Tools for collecting and analyzing dungeon generation statistics.
 *
 * @example
 * ```typescript
 * import { collectMetrics, formatMetrics } from "@rogue/procgen-v2/metrics";
 *
 * const result = generate(config);
 * if (result.success) {
 *   const metrics = collectMetrics(result.artifact);
 *   console.log(formatMetrics(metrics));
 * }
 * ```
 */

export * from "./collector";
