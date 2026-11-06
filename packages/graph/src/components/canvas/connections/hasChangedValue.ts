/** Whether `next` sets any key to a value other than `current`'s. */
export function hasChangedValue<V extends object>(next: V | undefined, current: V): boolean {
  if (!next) return false;
  for (const key of Object.keys(next) as Array<keyof V>) {
    if (!Object.is(next[key], current[key])) return true;
  }
  return false;
}
