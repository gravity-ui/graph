/** Whether applying the supplied keys adds a field or changes its value. */
export function hasChangedValue<V extends object>(next: V | undefined, current: V): boolean {
  if (!next) return false;
  for (const key of Object.keys(next) as Array<keyof V>) {
    const value = next[key];
    if (
      !Object.is(value, current[key]) ||
      (value === undefined && !Object.prototype.hasOwnProperty.call(current, key))
    ) {
      return true;
    }
  }
  return false;
}
