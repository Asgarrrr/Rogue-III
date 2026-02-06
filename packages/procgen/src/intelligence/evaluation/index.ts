/**
 * Evaluation Module
 *
 * Statistical evaluation harness for quality assurance.
 */

export {
  createMetricCollector,
  DEFAULT_EVALUATION_CONFIG,
  formatEvaluationReport,
  runEvaluation,
} from "./statistical-harness";

export type {
  EvaluationConfig,
  EvaluationResult,
  FailureAnalysis,
  GeneratorFn,
  HistogramBin,
  MetricCollector,
  MetricStats,
  SampleMetrics,
  SampleResult,
  SimulatorFn,
  ValidatorFn,
} from "./statistical-harness";
