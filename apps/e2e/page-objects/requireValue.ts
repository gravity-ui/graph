/** Fails the test with a clear message when page state is missing instead of asserting it away. */
export function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description} to be present`);
  }
  return value;
}
