import { defineComponent, type ComponentType } from "../core/types";

export const Position: ComponentType<{ x: number; y: number }> =
	defineComponent("Position");
export const Velocity: ComponentType<{ x: number; y: number }> =
	defineComponent("Velocity");
