import { defineResources } from "../core/resources";
import type { SpatialIndexResource } from "./spatial-index";
import type { GridResource } from "./grid";

export type ProjectResources = {
	spatial: SpatialIndexResource;
	grid: GridResource;
};

export const R = defineResources<ProjectResources>();
