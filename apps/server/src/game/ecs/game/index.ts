/**
 * Game Module
 *
 * Game-specific components, systems, and resources built on the ECS.
 */

// Components
export * from "./components";

// Resources
export * from "./resources";

// Systems (explicit re-exports to avoid ambiguity)
export {
  type ActionRequest,
  ActionResolutionSystem,
  AISystem,
  ALL_GAME_SYSTEMS,
  type AttackRequestData,
  AttackRequestSchema,
  applyMoveAction,
  type BlockingData,
  BlockingSchema,
  CollisionSystem,
  type CombatResult,
  CombatSystem,
  ENERGY_THRESHOLD,
  FOVCalculator,
  FOVSystem,
  initializeFOVResources,
  isCellVisible,
  MovementSystem,
  registerGameSystems,
  registerSystemComponents,
  requestAttack,
  submitAction,
  TurnManagementSystem,
} from "./systems";

// Templates
export * from "./templates";
