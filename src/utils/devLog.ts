/**
 * Development-only log. No-op when NODE_ENV is "production".
 */
export function logDev(message: string): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- intentional development diagnostics
    console.log(`[@gravity-ui/graph] ${message}`);
  }
}
