/** 5-point Gauss–Legendre nodes on [-1, 1] and their weights. */
const GAUSS_NODES = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const GAUSS_WEIGHTS = [
  0.5688888888888889, 0.47862867049936647, 0.47862867049936647, 0.23692688505618908, 0.23692688505618908,
];

function bezier(p0: number, c1: number, c2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p3;
}

function bezierSlope(p0: number, c1: number, c2: number, p3: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * (c1 - p0) + 6 * u * t * (c2 - c1) + 3 * t * t * (p3 - c2);
}

export function cubicPointAndAngle(s: Float32Array, o: number, t: number) {
  const x = bezier(s[o], s[o + 2], s[o + 4], s[o + 6], t);
  const y = bezier(s[o + 1], s[o + 3], s[o + 5], s[o + 7], t);
  const dx = bezierSlope(s[o], s[o + 2], s[o + 4], s[o + 6], t);
  const dy = bezierSlope(s[o + 1], s[o + 3], s[o + 5], s[o + 7], t);
  const angle = dx || dy ? Math.atan2(dy, dx) : Math.atan2(s[o + 7] - s[o + 1], s[o + 6] - s[o]);
  return { x, y, angle };
}

/** Writes the cubic over [t0, t1] as a cubic of its own: the end points and the end tangents scaled to the range. */
export function writeCubicPiece(
  s: ArrayLike<number>,
  o: number,
  t0: number,
  t1: number,
  out: Float32Array,
  base: number
): void {
  const h = (t1 - t0) / 3;
  for (let axis = 0; axis < 2; axis++) {
    const p0 = s[o + axis];
    const c1 = s[o + 2 + axis];
    const c2 = s[o + 4 + axis];
    const p3 = s[o + 6 + axis];
    const start = bezier(p0, c1, c2, p3, t0);
    const end = bezier(p0, c1, c2, p3, t1);
    out[base + axis] = start;
    out[base + 2 + axis] = start + h * bezierSlope(p0, c1, c2, p3, t0);
    out[base + 4 + axis] = end - h * bezierSlope(p0, c1, c2, p3, t1);
    out[base + 6 + axis] = end;
  }
}

/** Arc length of the cubic over [t0, t1]: 5-point Gauss–Legendre quadrature of |B'(t)|. */
export function cubicPieceLength(s: ArrayLike<number>, o: number, t0: number, t1: number): number {
  const half = (t1 - t0) / 2;
  const middle = (t0 + t1) / 2;
  let sum = 0;
  for (let i = 0; i < GAUSS_NODES.length; i++) {
    const t = middle + half * GAUSS_NODES[i];
    const dx = bezierSlope(s[o], s[o + 2], s[o + 4], s[o + 6], t);
    const dy = bezierSlope(s[o + 1], s[o + 3], s[o + 5], s[o + 7], t);
    sum += GAUSS_WEIGHTS[i] * Math.hypot(dx, dy);
  }
  return half * sum;
}
