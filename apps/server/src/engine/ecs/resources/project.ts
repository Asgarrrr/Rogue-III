import { defineResources } from "../core/resources";
import type { GridResource } from "./grid";
import type { SpatialIndexResource } from "./spatial-index";

export type ProjectResources = {
  spatial: SpatialIndexResource;
  grid: GridResource;
};

export const R = defineResources<ProjectResources>();
