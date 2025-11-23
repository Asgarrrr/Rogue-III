import type { Room } from "../core/types";

export interface Connection {
  from: Room;
  to: Room;
  path: Array<{ x: number; y: number }>;
  style: string;
}

export class ConnectionImpl implements Connection {
  from: Room;
  to: Room;
  path: Array<{ x: number; y: number }>;
  style: string;

  constructor(
    from: Room,
    to: Room,
    path: Array<{ x: number; y: number }>,
    style: string = "straight",
  ) {
    this.from = from;
    this.to = to;
    this.path = path;
    this.style = style;
  }
}
