# Tests layout

- seed-manager/: unit tests for seed generation, encoding/decoding, normalization, validation
- property/: property-based tests (randomized determinism across algorithms/sizes)
- perf/: performance guardrails (hot-path budgets)
- determinism.test.ts: legacy broad determinism suite (kept for coverage)
- seed-manager.test.ts: legacy aggregator importing the modular seed-manager tests


