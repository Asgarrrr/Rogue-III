import type { ComponentType, EntityId } from "./types";
import { World } from "./world";

type Command =
	| { kind: "spawn"; into: (e: EntityId, w: World) => void }
	| { kind: "destroy"; entity: EntityId }
	| {
			kind: "add";
			entity: EntityId;
			type: ComponentType<unknown>;
			value: unknown;
	  }
	| { kind: "remove"; entity: EntityId; type: ComponentType<unknown> };

export class CommandBuffer {
	private readonly queue: Command[] = [];

	spawn(into: (e: EntityId, w: World) => void): void {
		this.queue.push({ kind: "spawn", into });
	}

	destroy(entity: EntityId): void {
		this.queue.push({ kind: "destroy", entity });
	}

	add<T>(entity: EntityId, type: ComponentType<T>, value: T): void {
		this.queue.push({ kind: "add", entity, type, value });
	}

	remove<T>(entity: EntityId, type: ComponentType<T>): void {
		this.queue.push({ kind: "remove", entity, type });
	}

	flush(world: World): void {
		for (const cmd of this.queue) {
			if (cmd.kind === "spawn") {
				const e = world.createEntity();
				cmd.into(e, world);
			} else if (cmd.kind === "destroy") {
				world.destroyEntity(cmd.entity);
			} else if (cmd.kind === "add") {
				world.add(cmd.entity, cmd.type, cmd.value);
			} else if (cmd.kind === "remove") {
				world.remove(cmd.entity, cmd.type);
			}
		}
		this.queue.length = 0;
	}
}
