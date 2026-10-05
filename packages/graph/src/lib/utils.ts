export function assign<T extends object, S extends object>(target: T, source: S): T & S {
  return Object.assign(target, source);
}

export function cache<T>(fn: () => T) {
  let result: { value: T } | undefined;
  let touched = true;
  return {
    get: () => {
      if (touched || !result) {
        result = { value: fn() };
        touched = false;
      }
      return result.value;
    },
    reset() {
      touched = true;
    },
    clear() {
      touched = true;
      result = undefined;
    },
  };
}
