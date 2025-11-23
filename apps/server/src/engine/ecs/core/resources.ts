export class Resources {
  private readonly items: Map<string, unknown> = new Map();

  set<T>(key: string, value: T): void {
    this.items.set(key, value as unknown);
  }

  get<T>(key: string): T | undefined {
    return this.items.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  delete(key: string): boolean {
    return this.items.delete(key);
  }
}

export function defineResources<Res extends Record<string, unknown>>() {
  return {
    get<T extends keyof Res & string>(
      res: T,
      r: Resources,
    ): Res[T] | undefined {
      return r.get<Res[T]>(res);
    },
  } as const;
}

export * from "../resources";
