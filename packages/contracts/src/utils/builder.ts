import {
  DungeonConfigSchema,
  type ValidatedDungeonConfig,
} from "../schemas/dungeon";
import type { DungeonConfig } from "../types/dungeon";
import { Result, Ok, Err } from "../types/result";

export type BuildConfigInput = Partial<DungeonConfig> & {
  algorithm?: "cellular" | "bsp";
  preset?: string;
};

function getAlgorithmDefaultRooms(algorithm: "cellular" | "bsp"): number {
  return algorithm === "cellular" ? 0 : 8;
}

function clampRoomSizeRange(
  width: number,
  height: number,
  range: [number, number],
): [number, number] {
  const minBound = 3;
  const maxDim = Math.max(1, Math.min(width - 1, height - 1));
  let [minSize, maxSize] = range;
  minSize = Math.max(minBound, Math.min(minSize, maxDim));
  maxSize = Math.max(minSize, Math.min(maxSize, maxDim));
  return [minSize, maxSize];
}

function clampRoomCount(
  width: number,
  height: number,
  algorithm: "cellular" | "bsp",
  roomCount: number,
): number {
  const maxRooms = Math.floor((width * height) / 25);
  const minRooms = algorithm === "bsp" ? 1 : 0;
  return Math.max(minRooms, Math.min(roomCount, maxRooms));
}

export function buildDungeonConfig(
  input: BuildConfigInput,
): Result<ValidatedDungeonConfig, unknown> {
  const algorithm = (input.algorithm ?? "cellular") as "cellular" | "bsp";
  const width = input.width ?? 60;
  const height = input.height ?? 30;
  const roomSizeRange = clampRoomSizeRange(
    width,
    height,
    (input.roomSizeRange ?? [5, 12]) as [number, number],
  );
  const roomCount = clampRoomCount(
    width,
    height,
    algorithm,
    input.roomCount ?? getAlgorithmDefaultRooms(algorithm),
  );

  const candidate: DungeonConfig = {
    width,
    height,
    roomSizeRange,
    roomCount,
    algorithm,
  } as DungeonConfig;

  const parsed = DungeonConfigSchema.safeParse(candidate);
  if (!parsed.success) return Err(parsed.error);
  return Ok(parsed.data);
}
