/** Complete every cleanup even if a drag callback throws. */
export function runEach<T>(items: Iterable<T>, action: (item: T) => void): void {
  let failure: { error: unknown } | undefined;
  for (const item of items) {
    try {
      action(item);
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
}
