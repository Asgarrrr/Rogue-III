/**
 * Re-export error types from @rogue/contracts.
 *
 * This file previously contained unused error classes.
 * All error handling now uses the unified DungeonError from contracts.
 */
export {
  DungeonError,
  type DungeonErrorCode,
  Err,
  Ok,
  Result,
} from "@rogue/contracts";
