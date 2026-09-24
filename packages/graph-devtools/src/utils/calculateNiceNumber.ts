/**
 * Calculates a "nice" number approximately equal to the range.
 * Useful for determining tick spacing on axes or rulers.
 * Algorithm adapted from "Nice Numbers for Graph Labels" by Paul Heckbert
 * @param range The desired approximate range or step.
 * @param round Whether to round the result (usually false for step calculation).
 * @returns A nice number (e.g., 1, 2, 5, 10, 20, 50, ...).
 */
export function calculateNiceNumber(range: number, round = false): number {
  if (range <= 0) {
    return 0;
  }
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * 10 ** exponent;
}
