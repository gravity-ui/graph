export function assign<T extends Object, S extends Object> (target: T, source: S): T & S {
  const props = Object.keys(source);
  let prop;

  for (let i = 0; i < props.length; i += 1) {
    prop = props[ i ];
    target[prop] = source[prop];
  }

  return (target as T & S);
}
