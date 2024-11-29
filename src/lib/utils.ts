export function assign<T extends Object, S extends Object>(target: T, source: S): T & S {
  const props = Object.keys(source);
  let prop;

  for (let i = 0; i < props.length; i += 1) {
    prop = props[i];
    target[prop] = source[prop];
  }

  return target as T & S;
}


export function cache<T>(fn: () => T) {
  let result: T;
  let touched = true;
  return {
    get: () => {
      if(touched) {
        result = fn();
        touched = false;
      }
      return result;
    },
    reset() {
      touched = true;
    },
    clear() {
      touched = true;
      result = undefined;
    }
  }
} 