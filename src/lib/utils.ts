export function assign<T extends object, S extends object>(target: T, source: S): T & S {
  const keys = Object.keys(source) as (keyof S & string)[];
  const src = source as Record<string, unknown>;
  const dst = target as Record<string, unknown>;

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    dst[key] = src[key];
  }

  return target as T & S;
}

export function cache<T>(fn: () => T) {
  let result: T | undefined;
  let touched = true;
  return {
    get: (): T => {
      if (touched) {
        result = fn();
        touched = false;
      }
      return result as T;
    },
    reset(): void {
      touched = true;
    },
    clear(): void {
      touched = true;
      result = undefined;
    },
  };
}
