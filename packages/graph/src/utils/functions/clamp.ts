export function clamp(value: number, min: number, max: number): number {
  // if operators are faster than Math.min/max

  if (value > max) {
    return max;
  }
  if (value < min) {
    return min;
  }

  return value;
}
